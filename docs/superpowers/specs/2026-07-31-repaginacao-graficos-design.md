# Spec — Repaginação dos gráficos de acompanhamento: "Minha Meta + Corrida"

**Data:** 2026-07-31 · **Status:** aprovada pelo owner (abordagem A; ajustes: troca de perfil reversível; remoção total do gráfico antigo)

## 1. Problema e objetivo

Os usuários do dashboard (profissionais de salão, leigos em tecnologia e leitura de gráficos) não aderiram à seção de gráficos atual — um gráfico de linhas acumuladas com 8+ séries, legenda por checkbox e eixo de pontos, consumido majoritariamente em desktop. A pergunta real do público é: **"como eu estou, quanto falta para o prêmio, quem está na minha frente?"**

Objetivo: substituir a seção de gráficos por elementos de leitura imediata em celular, com progresso individual e disputa em peso igual, mais um card semanal compartilhável no WhatsApp.

**Critério de sucesso:** legibilidade a um braço de distância em viewport 390px, zero jargão de gráfico, números idênticos ao ranking atual (mesmos hooks), e — na prática — adesão observável (acessos/compartilhamentos).

## 2. Não-objetivos

- Login/autenticação (auth-kit é evolução futura; identidade local por aparelho basta).
- Mexer em `PremiacaoPanel` e `DataRankings` (permanecem como estão; fusão com a Corrida é decisão futura).
- Gamificação completa (níveis/conquistas/notificações — fase futura se a adesão responder).
- Novas consultas ao banco ou mudanças de schema.

## 3. Contexto de uso

- **Dispositivo primário:** celular, no intervalo (mobile-first radical; desktop continua funcionando por responsividade).
- **Público:** profissionais das categorias ativas; o gestor usa as mesmas telas.
- **Identidade:** sem login. O usuário escolhe "quem sou eu" uma vez; fica salvo no aparelho (localStorage) e é **sempre reversível** (ver §4.1).

## 4. Componentes (novos, em `src/components/resultados/`)

### 4.1 `ProfileSelector`
- Lista os profissionais de `profissionais_ativos` (ativos, com categoria ativa no período), agrupados por categoria, com busca simples.
- Ao escolher: salva `{ profissionalid }` em localStorage (`destaque.perfil.v1`).
- **Reversibilidade (requisito do owner):**
  - O `MeuCartao` exibe permanentemente um affordance visível "Trocar" (ícone lápis + texto) que reabre o seletor;
  - O seletor aberto oferece "Não sou nenhum destes / limpar seleção";
  - Se o `profissionalid` salvo não existir mais em `profissionais_ativos` (saiu do salão) ou a categoria estiver desativada no período, o app limpa a seleção e reabre o seletor com mensagem amigável.
- Sem seleção: no lugar do cartão aparece um convite "Toque para ver seu progresso 👤".

### 4.2 `MeuCartao`
- Cabeçalho: apelido (ou nome), categoria, botão "Trocar".
- **Número-herói:** pontos no mês (Estética pré-V4: % da meta de receita; V4+: pontos — sempre conforme `rulesConfig` vigente do período filtrado).
- **Barra de progresso à meta** com o prêmio explícito: "Prêmio R$ 300 — faltam 18 pontos". Meta batida: estado celebratório ("Meta batida! 🎉 Prêmio garantido se mantiver a posição" — texto conforme regra da categoria).
- **Ritmo:** projeção linear por dias úteis (`workingDaysConfig`): `pontos ÷ dias úteis decorridos × dias úteis do mês`. Exibe "No seu ritmo: meta ~dia 26" ou "Ritmo abaixo da meta — faltam X em Y dias". Com filtro em mês encerrado: oculta ritmo e mostra resultado final.
- **Posição:** "Você está em 2º · 12 pts atrás da líder" (ou "Você é a líder! 🥇").
- Empates: mesma posição para pontuações iguais (mesma regra do ranking atual).

### 4.3 `CorridaChart`
- Barras horizontais por categoria (abas idênticas às atuais, respeitando `isCategoryActive`).
- Uma barra por profissional: avatar de inicial, apelido, **valor como rótulo direto** no fim da barra. Top 3 com 🥇🥈🥉.
- Escala: barra máxima = max(maior pontuação, meta); **linha vertical pontilhada = meta** rotulada ("meta: 100").
- **Cor:** uma única matiz da marca; barra do "você" em tom forte + anel de destaque; demais em tom claro. Sem eixo numérico, sem legenda, sem filtros por profissional. Validação da paleta pelo script da skill dataviz (light + dark, CVD e contraste) antes do merge.
- Sem perfil selecionado: todas as barras em tom neutro (a Corrida funciona sem identidade).
- Muitos profissionais: sem corte — lista rola; barras com altura mínima de toque 44px.

### 4.4 `MinhaSemana`
- 6 blocos seg–sáb da semana corrente (domingo não existe — salão fechado), com os pontos do dia dentro de cada bloco; intensidade sequencial da mesma matiz (dia sem pontos = bloco vazio ▢).
- Toggle "semana passada" (apenas 1 nível de histórico; semanas do mês filtrado).
- Fonte de dados: a série diária já computada hoje para o gráfico de evolução (reaproveitar a agregação, extraída para função pura testável).
- Requer perfil selecionado (é "minha" semana); sem perfil, o bloco não aparece.

### 4.5 `CardCompartilhavel`
- Botão "📤 Compartilhar" abaixo da MinhaSemana (requer perfil).
- Gera imagem quadrada (1080×1080, canvas client-side, sem backend): marca Studio X, apelido, posição com medalha, pontos, barra da meta, mês. Sem dados de outros profissionais além da posição (privacidade).
- Web Share API com arquivo; fallback: download do PNG. Desktop: download.

## 5. Hooks novos (puros/locais — zero rede)

- `usePerfilLocal()` → `{ perfil, escolher(id), limpar() }` sobre localStorage, com a validação de existência do §4.1.
- `useProjecaoMeta(pontos, meta, dateRange)` → `{ pct, faltam, ritmoTexto, metaBatida }` usando `workingDaysConfig`. Função de cálculo pura exportada para teste.
- Agregação semanal: função pura `pontosPorDia(services, rules)` compartilhada com o que o app já calcula (extração, não duplicação — atenção à regra do CLAUDE.md sobre scoring duplicado: a extração usa o MESMO caminho dos hooks de categoria).

## 6. Remoções (decisão do owner: sem "evolução detalhada")

- `DashboardCharts` sai do `Index.tsx`; **excluir** os arquivos: `DashboardCharts.tsx`, `charts/EvolutionChartContainer.tsx`, `charts/ChartFilters.tsx`, `charts/ExpandableChart.tsx` e os já mortos `charts/ComparisonChart.tsx`, `charts/DistributionChart.tsx`.
- Antes de excluir, extrair a agregação diária de pontos usada pela `MinhaSemana` (§5).
- Atualizar o CLAUDE.md (seções que documentam os componentes de gráfico e os "componentes mortos").

## 7. Interação com o filtro de datas global

Todos os componentes respeitam o `DateFilterContext` como o restante da página: mês corrente (padrão) mostra ritmo/projeção; mês encerrado mostra resultado final sem projeção; range custom segue a mesma regra (projeção só se o range contém hoje).

## 8. Qualidade

- **Paridade (gate):** pontos/posições do MeuCartao e da Corrida idênticos ao `DataRankings` (mesmos hooks — verificação automática no teste e visual no smoke).
- Testes vitest: `useProjecaoMeta` (casos: início de mês, meta batida, mês encerrado, Estética %), agregação `pontosPorDia`, `usePerfilLocal` (inclusive perfil inválido).
- Smoke Playwright em viewport 390×844: selecionar perfil, ver cartão, trocar perfil, limpar, Corrida por categoria, semana, gerar card (download).
- Acessibilidade: touch ≥ 44px, texto-base ≥ 16px, dark mode com paleta validada, identidade nunca só por cor (avatar+nome nas barras).
- Ciclo: implementador + review independente por fase, como nas tasks anteriores (subagents Opus).

## 9. Fases

- **F1:** `ProfileSelector` + `MeuCartao` + `CorridaChart` + remoções do §6.
- **F2:** `MinhaSemana` + `CardCompartilhavel`.
- Cada fase entrega app funcional (F1 já substitui a seção; F2 adiciona os blocos restantes).

## 10. Riscos e mitigações

- **Aparelho compartilhado** (tablet da recepção): identidade local pode confundir — mitigado pela troca sempre visível (§4.1).
- **Projeção enganosa** em início de mês (1º dia útil): exibir ritmo só a partir do 3º dia útil; antes, mostrar apenas progresso.
- **Estética pré-V4 em %**: cartão e corrida usam % nessa categoria/período para não inventar pontos que o ranking não usa.
- **Web Share API** indisponível (iOS antigo/desktop): fallback download sempre presente.

## 11. Emendas pós-implementação

**§4.3 — linha de meta na Corrida (decisão do orquestrador, 2026-08-01).** A spec pedia
`barra máxima = max(maior pontuação, meta)` e uma linha vertical pontilhada rotulada em toda
categoria. Na implementação ficou claro que o requisito só é coerente quando existe uma meta **na
mesma unidade da barra**: nas categorias de modelo `points` a barra mede pontos, mas as metas
configuradas (`minUniqueClients`, `minSpecialServices`) são metas de *qualificação* em clientes e
serviços — não existe "meta em pontos" para marcar, e desenhar a linha em outra unidade seria
comparar coisas diferentes no mesmo eixo. Decisão: a linha pontilhada rotulada ("meta: 100")
aparece **apenas quando há meta na unidade da barra**, hoje o caso exclusivo de
`revenue-percentage` (barra = % da meta ⇒ linha em 100, escala = `max(maior, 100)`). Implementado
como prop opcional `metaValor?: number` no `CorridaChart`; sem ela, o comportamento é o anterior
(escala pelo líder, sem linha). O acompanhamento das metas de qualificação continua sendo papel do
`MeuCartao`, que as mostra em barra de progresso com o alvo explícito e a projeção de ritmo.

**§4.5 — qual meta a barra do card compartilhável mostra.** A spec pede "barra da meta" sem dizer
qual, e categorias `points` têm duas. O card usa a **primeira meta em aberto** — exatamente o mesmo
seletor que o `MeuCartao` usa para a frase de ritmo (`metas.find(m => !m.batida)`), para a imagem
nunca contradizer a tela que a gerou; com todas batidas, 100%. Média das metas foi descartada:
esconderia o que falta (com clientes 96/80 ✅ e especial 7/10, mostraria 100% em vez de 70%).

**§4.5 — "Desktop: download" vira detecção de recurso.** O caminho é decidido por
`navigator.canShare({files})`, não pelo tipo de aparelho: onde o navegador compartilha arquivo de
verdade (celular e também Chrome de desktop), abre a folha de compartilhamento; o download continua
como **fallback universal** — inclusive quando a folha falha. Cancelamento pelo usuário (`AbortError`)
não vira download nem erro.

**§4.1 — a "busca simples" do seletor de perfil foi dispensada (YAGNI).** O roster tem ~22 nomes,
agrupados por categoria numa folha rolável: um campo de busca custaria teclado abrindo em cima da
lista no celular para poupar meio gesto de rolagem. Se o cadastro crescer, o requisito volta.

**Reorganização da página (diretiva do owner, 2026-08-01).** A ordem passa a ser `DashboardHeader`
→ `ResultadosSection` → `DataRankings` → `RegrasDoDesafio` → `PremiacaoPanel`: o acompanhamento
pessoal abre a tela e a premiação, que é consulta, fecha. As classes `stagger-N` acompanham a nova
ordem (5..8).

**§4.3 — a Corrida ("Quem está na frente") foi removida por redundância (decisão do owner).** Com o
"Ranking por Categorias" logo abaixo do cartão pessoal, as duas listas mostravam a mesma equipe na
mesma ordem. `CorridaChart.tsx` foi deletado (política do repo: sem componente morto);
`src/lib/posicoes.ts` fica, porque o `ProfessionalRanking` usa `calcularPosicoes`/`medalhaPara`.

**`RegrasDoDesafio` fica entre o ranking e a premiação.** O owner não especificou o slot; a decisão
do orquestrador é mantê-la logo depois do ranking — quem acabou de ler os números é quem pergunta
como eles são contados —, deixando a premiação como o fecho da página.

**Redesign das seções antigas na linguagem da família `resultados/` (2026-08-01).**
`PremiacaoPanel` e `DataRankings`/`ProfessionalRanking` foram re-vestidos com a mesma anatomia do
`MeuCartao`/`MinhaSemana`: `Card` do tema, avatares de inicial, números em `.font-mono-num`,
`Progress` para metas, alvo de toque ≥ 44px e texto-base ≥ 16px. As paletas hardcoded por categoria
(azul/vermelho/amarelo/violeta) deram lugar à matiz única da marca, com a identidade da categoria
dita por texto e badge. Nenhuma mudança de dados, ordenação, posições, medalhas ou seleção.
