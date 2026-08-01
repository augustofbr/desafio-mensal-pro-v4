# "Minha Meta + Corrida" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a seção de gráficos do dashboard por componentes mobile-first legíveis por leigos: cartão pessoal com metas/projeção, corrida de barras por categoria, semana em blocos e card compartilhável — removendo por completo os gráficos de linhas antigos.

**Architecture:** Novos componentes em `src/components/resultados/`, todos alimentados pelos hooks existentes (zero consultas novas). Identidade local por `localStorage` (sem login), sempre reversível. Barras em HTML/CSS puro (sem Recharts). Lógica de meta/projeção e agregação semanal em funções puras testáveis (`src/lib/`).

**Tech Stack:** React 18 + TS, Tailwind + shadcn (primitivas já existentes: `sheet`, `progress`, `avatar`, `tabs`, `card`, `button`, `scroll-area`), vitest (node env), Canvas API para o card compartilhável.

**Spec:** `docs/superpowers/specs/2026-07-31-repaginacao-graficos-design.md`

## Global Constraints

- **Sem dependências novas** no package.json; **não tocar** em `src/components/ui/*` nem `src/integrations/supabase/*`.
- Associação por id SEMPRE via `normalizeProfessionalId` (`src/lib/scoring.ts:31`); NUNCA por nome; nome/apelido é só display.
- Testes: vitest roda `src/**/*.test.ts` em ambiente **node** (`vite.config.ts:18-21`) — só funções puras; componentes são validados por smoke (Playwright MCP viewport 390×844) + lint + build.
- Copy 100% PT-BR, sem jargão de gráfico ("acumulado", "eixo", "série" são proibidos na UI).
- Touch targets ≥ 44px; texto-base ≥ 16px no mobile.
- Respeitar `isCategoryActive(rules, categoria)` (`src/lib/categoryDisplayNames.ts:68`) e os `scoringModel` por categoria/período (`rulesConfig`).
- Datas: NUNCA `new Date('YYYY-MM-DD')` (pitfall UTC) — parse manual `const [y,m,d] = s.split('-').map(Number); new Date(y, m-1, d)`.
- Commit ao fim de cada task (mensagens `feat(resultados): ...`), sem push até o fim do plano.
- Entradas de serviço `type: "star"` têm `date: ""` — nunca entram em agregação por dia (comportamento atual preservado).

---

### Task 1: Lib de metas e projeção (`metaProgress`)

**Files:**
- Create: `src/lib/metaProgress.ts`
- Test: `src/lib/metaProgress.test.ts`

**Interfaces:**
- Consumes: `CategoryRules` (`src/lib/rulesConfig.ts`), shapes dos entries dos hooks (ver tabela abaixo).
- Produces (Tasks 3–5 e 7 dependem destes nomes exatos):

```ts
export interface MetaItem {
  chave: "clientes" | "especiais" | "receita" | "servicos";
  rotulo: string;        // ex.: "Clientes únicos", rules.specialServiceLabel, "Meta do mês", "Atendimentos"
  atual: number;
  alvo: number;
  pct: number;           // 0..100, clamp
  batida: boolean;
}
export interface Projecao {
  mostrar: boolean;          // false se: mês encerrado, <3 dias úteis decorridos, ou meta batida
  ritmoTexto: string | null; // "No seu ritmo: meta ~dia 26" | "Ritmo abaixo da meta — faltam 18 em 9 dias úteis"
}
export function resolveMetas(entry: Record<string, unknown>, rules: CategoryRules): MetaItem[];
export function computeProjecao(args: {
  atual: number; alvo: number;
  diasUteisDecorridos: number; diasUteisRestantes: number;
  diaDoMesHoje: number | null;   // null = período não contém hoje (mês encerrado / custom passado)
  diasUteisPorDiaDoMes: number[]; // dias do mês (1..31) que são úteis, em ordem — p/ achar a data prevista
}): Projecao;
export function contarDiasUteis(startDate: string, endDate: string, holidays: string[]): number; // seg–sáb, exclui feriados
```

`resolveMetas` por `rules.scoringModel` + `qualificationGoals` (campos reais dos entries — NÃO existem `uniqueClients`/`stars`/`percentage`):

| modelo | metas geradas |
|---|---|
| `points` | `clientes` de `entry.uniqueClientDays` vs `minUniqueClients`; `especiais` de `entry.specialServices` vs `minSpecialServices` (só se o goal existir) |
| `revenue-percentage` | `receita` de `entry.revenuePercentage` vs 100 (rotulo "Meta do mês", unidade %) |
| `revenue-points` | `receita` de `entry.totalRevenue` vs `minRevenue`; se `minServices`: `servicos` de `entry.totalServices` |

- [ ] **Step 1: Escrever os testes falhando** — `src/lib/metaProgress.test.ts` com `import { describe, it, expect } from "vitest";` cobrindo: (a) points Cabelo V4: entry `{uniqueClientDays: 42, specialServices: 3}` + rules `{scoringModel:'points', qualificationGoals:{minUniqueClients:60, minSpecialServices:10}, specialServiceLabel:'Cronograma Capilar'}` → 2 MetaItems, pct 70/30, nada batido; (b) meta batida clamp: 65/60 → pct 100 batida; (c) revenue-percentage: `{revenuePercentage: 88.4}` → 1 item alvo 100; (d) `contarDiasUteis('2026-08-03','2026-08-09', [])` = 6 (seg–sáb, dom 09/08 fora) e com feriado `'2026-08-05'` = 5; (e) projeção: atual 42, alvo 60, 10 úteis decorridos, 12 restantes → mostrar=true e ritmoTexto contendo "~dia"; (f) ritmo insuficiente: atual 10, alvo 60, 10 decorridos, 5 restantes → texto "abaixo da meta"; (g) `diaDoMesHoje: null` → mostrar=false; (h) 2 dias úteis decorridos → mostrar=false; (i) meta batida → mostrar=false.
- [ ] **Step 2: Rodar e ver falhar** — `npm test` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `metaProgress.ts`** — funções puras conforme assinaturas; projeção: `ritmo = atual/diasUteisDecorridos`; `diasNecessarios = ceil((alvo-atual)/ritmo)`; se `diasNecessarios <= diasUteisRestantes`, achar em `diasUteisPorDiaDoMes` o dia útil de índice `(índice de hoje) + diasNecessarios` → "No seu ritmo: meta ~dia N"; senão "Ritmo abaixo da meta — faltam X em Y dias úteis".
- [ ] **Step 4: Rodar e ver passar** — `npm test` → todos verdes (31 antigos + novos).
- [ ] **Step 5: Commit** — `git add src/lib/metaProgress.ts src/lib/metaProgress.test.ts && git commit -m "feat(resultados): lib de metas e projecao (metaProgress)"`.

### Task 2: Identidade local (`usePerfilLocal`) + `ProfileSelector`

**Files:**
- Create: `src/hooks/usePerfilLocal.ts`, `src/components/resultados/ProfileSelector.tsx`
- Test: `src/lib/perfilLocal.test.ts` (a lógica pura vai em `src/lib/perfilLocal.ts`)

**Interfaces:**
- Consumes: `ProfissionalAtivo` (`src/types/profissionaisAtivos.ts`), `normalizeProfessionalId`, `isCategoryActive`, shadcn `sheet`/`button`/`avatar`/`scroll-area`.
- Produces:

```ts
// src/lib/perfilLocal.ts — pura, testável em node (storage injetado)
export const PERFIL_KEY = "destaque.perfil.v1";
export function lerPerfil(storage: Pick<Storage,"getItem">): string | null;         // id normalizado ou null (JSON inválido → null)
export function gravarPerfil(storage: Pick<Storage,"setItem"|"removeItem">, id: string | null): void; // null → remove
export function validarPerfil(id: string | null, ativos: {profissionalId:number}[]): string | null;   // id inexistente → null

// src/hooks/usePerfilLocal.ts
export function usePerfilLocal(ativos: ProfissionalAtivo[]): {
  perfilId: string | null;              // já validado contra ativos (auto-limpa se inválido)
  perfil: ProfissionalAtivo | null;
  escolher: (id: string) => void;
  limpar: () => void;
};

// ProfileSelector — abre em <Sheet side="bottom">
interface ProfileSelectorProps {
  aberto: boolean; onFechar: () => void;
  ativos: ProfissionalAtivo[]; rules: RulesVersion;
  perfilId: string | null;
  onEscolher: (id: string) => void; onLimpar: () => void;
}
```

- [ ] **Step 1: Testes falhando** de `perfilLocal.ts` (storage fake em objeto): ler/gravar/limpar, JSON inválido → null, `validarPerfil` com id fora da lista → null.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implementar** `perfilLocal.ts` + `usePerfilLocal` (useState + useEffect de validação quando `ativos` carrega) + `ProfileSelector`: título "Quem é você?", profissionais agrupados por categoria (só categorias com `isCategoryActive`), cada item = botão ≥44px com `Avatar` (inicial) + `apelido ?? nome_profissional`; item marcado se `perfilId` igual; rodapé com botão secundário **"Não sou nenhum destes (limpar)"** → `onLimpar()`. Sem busca (roster ~22 nomes; YAGNI).
- [ ] **Step 4:** `npm test` verde; `npm run lint` sem erros novos.
- [ ] **Step 5: Commit** — `feat(resultados): identidade local reversivel + ProfileSelector`.

### Task 3: `MeuCartao`

**Files:**
- Create: `src/components/resultados/MeuCartao.tsx`
- Modify: nada fora dele (integração é da Task 5)

**Interfaces:**
- Consumes: `resolveMetas`, `computeProjecao`, `contarDiasUteis` (Task 1); shadcn `card`/`progress`/`button`/`badge`; `useHolidays()` (`src/hooks/useHolidays.ts:6`) para feriados; `useDateFilter()` para o range.
- Produces:

```ts
interface MeuCartaoProps {
  perfil: ProfissionalAtivo;
  entry: Record<string, unknown> | null;  // entry do perfil na SUA categoria (null = sem dados no período)
  posicao: number | null;                  // 1-based no ranking da categoria (empate = mesma posição)
  liderPontos: number | null;              // pontos do 1º (null se ranking vazio)
  rules: RulesVersion;
  onTrocar: () => void;                    // REQUISITO DO OWNER: sempre visível
}
```

- [ ] **Step 1: Implementar** (sem teste unitário de componente — validação por smoke):
  - Header: `Avatar` inicial + `apelido ?? nome_profissional` + badge da categoria (`getCategoryDisplayName`) + **botão "Trocar" com ícone Pencil, sempre visível** (lucide `Pencil`, já disponível via lucide-react).
  - Número-herói: `entry.points` grande (`.font-mono-num`, ≥ 40px); modelo `revenue-percentage` → `revenuePercentage` com sufixo "%" e uma casa.
  - Metas: um `<Progress>` por `MetaItem` de `resolveMetas`, com rótulo "Clientes únicos · 42 de 60" e, acima delas, o prêmio: `rules[categoriaKey].prize` no formato "Prêmio: R$ 300" (texto literal do rules). Meta batida → barra cheia + "✅".
  - Projeção via `computeProjecao` (dias úteis do range filtrado; `diaDoMesHoje` = dia de hoje se o range contém hoje, senão null). Mês encerrado → linha "Resultado final do período".
  - Posição: "Você está em 2º · 12 pts atrás da líder" / "Você é a líder! 🥇" / se `entry === null`: estado vazio amigável ("Ainda sem atendimentos neste período").
  - Categoria desativada no período (`isCategoryActive` false, ex.: Maquiagem em agosto): card mostra "Sua categoria está fora do desafio neste mês" + botão Trocar.
- [ ] **Step 2:** `npm run lint` + `npm run build` verdes.
- [ ] **Step 3: Commit** — `feat(resultados): MeuCartao com metas, projecao e troca de perfil`.

### Task 4: `CorridaChart`

**Files:**
- Create: `src/components/resultados/CorridaChart.tsx`

**Interfaces:**
- Consumes: entries ordenados (hooks já retornam desc por points), `normalizeProfessionalId`, `getCategoryDisplayName`.
- Produces:

```ts
interface CorridaChartProps {
  entries: Record<string, unknown>[];  // da categoria ativa (ordem já ranqueada)
  perfilId: string | null;             // destaca a barra "você"
  unidade: "pts" | "%";                // % só em revenue-percentage
}
```

- [ ] **Step 1: Implementar** — lista vertical de linhas-barra em divs (SEM Recharts):
  - Cada linha (altura ≥ 44px): medalha 🥇🥈🥉 (posições 1–3, empates repetem medalha) ou número "4º"; `Avatar` inicial; apelido/nome (truncado com ellipsis); barra com `width: (points / maxPoints) * 100%` animada (`transition-all`); valor como **rótulo direto** ao fim da barra (`.font-mono-num`).
  - Cor: barra padrão `bg-primary/25`; barra do `perfilId` `bg-primary` + `ring-2 ring-primary` + nome em `font-semibold`. Nenhuma outra cor por série (identidade = avatar+nome; codificação = comprimento).
  - Empate de pontos: mesma posição exibida (regra do ranking atual).
  - `entries` vazio → "Nenhum atendimento na categoria neste período".
  - Todos os profissionais listados (rolagem natural da página; sem corte, sem filtros).
- [ ] **Step 2: Validar paleta (dataviz)** — resolver os HSL de `--primary` e `--background` (light: `346 77% 50%` / `30 25% 98%`; dark: valores do bloco `.dark` em `src/index.css:47+`) para hex e rodar `node <skill-dataviz>/scripts/validate_palette.js "<hexVocê,hexDemais>" --mode light` e `--mode dark`. FAIL em contraste → ajustar o tom `/25` (ex.: `/35`) e revalidar. Registrar saída no relatório.
- [ ] **Step 3:** `npm run lint` + `npm run build` verdes.
- [ ] **Step 4: Commit** — `feat(resultados): CorridaChart de barras horizontais`.

### Task 5: Integração F1 — `ResultadosSection` no Index + remoção dos gráficos antigos

**Files:**
- Create: `src/components/resultados/ResultadosSection.tsx`
- Modify: `src/pages/Index.tsx:241-259` (troca do bloco DashboardCharts), `CLAUDE.md` (seções de charts/componentes mortos)
- Delete: `src/components/dashboard/DashboardCharts.tsx`, `src/components/charts/EvolutionChartContainer.tsx`, `src/components/charts/ChartFilters.tsx`, `src/components/charts/ExpandableChart.tsx`, `src/components/charts/ComparisonChart.tsx`, `src/components/charts/DistributionChart.tsx`

**Interfaces:**

```ts
interface ResultadosSectionProps {   // Index passa os MESMOS dados do bloco atual + 1
  hairData: any[]; manicureData: any[]; esteticaData: any[]; maquiagemData: any[];
  rules: RulesVersion;
  activeProfessionals: ProfissionalAtivo[];   // já disponível no Index (linha ~36)
}
```

- [ ] **Step 1: Implementar `ResultadosSection`** — monta `usePerfilLocal(activeProfessionals)`; deriva a categoria do perfil (`perfil.categoria` → dataset correspondente; mapa `Cabelo→hairData, Unhas→manicureData, Estetica→esteticaData, Maquiagem→maquiagemData`); encontra o entry do perfil por `normalizeProfessionalId(entry.professionalId) === perfilId`; calcula posição/liderPontos do ranking da categoria; renderiza: sem perfil → card-convite "👤 Toque para ver seu progresso" (abre o selector); com perfil → `MeuCartao`. Abaixo, `Tabs` de categorias ativas (default = categoria do perfil) com `CorridaChart` por aba (`unidade` conforme `scoringModel`). O `ProfileSelector` (Sheet) vive aqui, controlado por estado local.
- [ ] **Step 2: Trocar no Index** — substituir o JSX de `:252-258` por `<ResultadosSection hairData={...} manicureData={...} esteticaData={...} maquiagemData={...} rules={rules} activeProfessionals={activeProfessionals} />` mantendo o gating de `loading` de `:242`. Remover o import de `DashboardCharts`.
- [ ] **Step 3: Deletar os 6 arquivos** listados acima e rodar `grep -rn "DashboardCharts\|EvolutionChartContainer\|ChartFilters\|ExpandableChart\|ComparisonChart\|DistributionChart" src/` → zero ocorrências.
- [ ] **Step 4: Atualizar CLAUDE.md** — remover as menções aos componentes deletados (seção "Componentes de grafico nao utilizados" e citações de EvolutionChartContainer), adicionar 3 linhas descrevendo `src/components/resultados/` (seção nova de acompanhamento mobile-first, identidade local via localStorage `destaque.perfil.v1`).
- [ ] **Step 5: Verificações** — `npm test` (todos), `npm run lint` (sem erros novos), `npm run build` verde.
- [ ] **Step 6: Smoke mobile (Playwright MCP, viewport 390×844, `npm run dev`)** — roteiro: abrir → card-convite visível → escolher perfil (ex.: Brenda) → MeuCartao com pontos IGUAIS ao DataRankings da mesma tela (paridade, anotar números) → "Trocar" → trocar para outra pessoa → "limpar" → volta ao convite → Corrida: barras ordenadas, "você" destacada, valores = ranking → aba de outra categoria ok → dark mode (adicionar classe `dark` no html via devtools) sem texto ilegível → screenshot final no relatório. Zero erros de console.
- [ ] **Step 7: Commit** — `feat(resultados): secao Minha Meta + Corrida substitui graficos antigos` (inclui os deletes e o CLAUDE.md).

### Task 6: `MinhaSemana` (F2)

**Files:**
- Create: `src/lib/semana.ts`, `src/components/resultados/MinhaSemana.tsx`
- Modify: `src/components/resultados/ResultadosSection.tsx` (renderiza abaixo da Corrida quando há perfil)
- Test: `src/lib/semana.test.ts`

**Interfaces:**

```ts
// src/lib/semana.ts — puras
export interface DiaSemana { data: string; diaLabel: "S"|"T"|"Q"|"S"|"S"; diaDoMes: number; valor: number | null; } // null = fora do range filtrado
export function valorPorDia(services: {date?:string; points?:number; value?:number}[], modelo: CategoryRules["scoringModel"], minRevenue?: number): Record<string, number>;
// points → soma points/dia (reusar groupByDay de src/lib/utils.ts:86); revenue-percentage → (soma value do dia / minRevenue) * 100; revenue-points → soma value/dia convertida depois no componente
export function montarSemana(referencia: Date, valores: Record<string, number>, range: {startDate:string; endDate:string}): DiaSemana[]; // seg–sáb da semana de `referencia`
```

- [ ] **Step 1: Testes falhando** — `valorPorDia` nos 3 modelos (fixtures de 4 serviços em 2 dias); `montarSemana`: semana de qua 2026-08-05 → seg 03..sáb 08, valores mapeados, dias fora do range → null; entrada star `{date:"", points:3}` ignorada.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3: Implementar.** **Step 4:** verde.
- [ ] **Step 5: Componente** — título "Minha semana", 6 blocos (grid 6 col, ≥44px) com dia do mês pequeno + valor central (`.font-mono-num`; vazio = "–" com `bg-muted`); intensidade: `bg-primary` com opacidade em 4 degraus por quartil do maior valor da semana (0 → `bg-muted`). Toggle "Esta semana / Semana passada" (`toggle-group`), limitado a semanas que intersectem o range filtrado. Unidade "%" no modelo revenue-percentage.
- [ ] **Step 6:** lint/build verdes; commit `feat(resultados): MinhaSemana em blocos diarios`.

### Task 7: `CardCompartilhavel` (F2) + fechamento

**Files:**
- Create: `src/lib/shareCard.ts`, `src/components/resultados/CardCompartilhavel.tsx`
- Modify: `src/components/resultados/ResultadosSection.tsx` (botão ao fim, só com perfil)

**Interfaces:**

```ts
// src/lib/shareCard.ts
export interface DadosCard { apelido: string; categoria: string; posicao: number; pontosTexto: string; metaPct: number; mesLabel: string; }
export function desenharCard(canvas: HTMLCanvasElement, dados: DadosCard): void;  // 1080×1080: fundo gradiente da marca, medalha/posição, nome, pontos grandes, barra da meta, "Profissional Destaque · Studio X" + mês
export async function compartilharOuBaixar(canvas: HTMLCanvasElement, nomeArquivo: string): Promise<"share"|"download">; // navigator.canShare({files}) → share; senão download via <a download>
```

- [ ] **Step 1: Implementar** `shareCard.ts` (canvas 2D puro, sem libs; aguardar `document.fonts.ready` antes de desenhar) e o componente: botão "📤 Compartilhar minha semana" → `<canvas>` offscreen → `desenharCard` → `compartilharOuBaixar`. Sem dados de terceiros no card (só posição própria). Toast (sonner, já existe) de sucesso/erro.
- [ ] **Step 2: Verificações finais do plano** — `npm test` + lint + build; smoke Playwright: fluxo completo F1+F2 incluindo clique em compartilhar (desktop → download do PNG; abrir o PNG e conferir visual — screenshot no relatório); dark mode.
- [ ] **Step 3: Commit** — `feat(resultados): card compartilhavel de resultado semanal`.

---

## Self-review (feito na escrita)

- **Cobertura da spec:** §4.1→Task 2 (reversibilidade nos requisitos do selector e botão Trocar na Task 3); §4.2→Tasks 1+3; §4.3→Task 4; §4.4→Task 6; §4.5→Task 7; §5→Tasks 1/2/6; §6 (remoção total, decisão do owner)→Task 5; §7 (DateFilter)→Tasks 1/3/6; §8→verificações por task + smoke; §9 fases→Tasks 1–5 = F1, 6–7 = F2; §10 riscos→projeção ≥3 dias úteis (Task 1), aparelho compartilhado (Task 2), Estética % (Tasks 1/4/6), fallback share (Task 7).
- **Placeholders:** nenhum TBD; código real nas funções puras e interfaces exatas nos componentes.
- **Consistência de tipos:** nomes de campos dos entries conferidos contra o mapa de interfaces (uniqueClientDays/specialServices/totalServices/revenuePercentage/totalRevenue); `MetaItem`/`Projecao`/`DiaSemana`/`DadosCard` usados com os mesmos nomes nas tasks consumidoras.
