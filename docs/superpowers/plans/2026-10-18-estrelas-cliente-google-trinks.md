# Estrelas: cliente no Google + no Trinks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cadastro de estrela passa a registrar o nome da cliente no Google e no Trinks (escolhida de uma lista do dia), e a fila de aprovação ganha os sinais "Atendida?" e "Possível duplicata".

**Architecture:** Migração aditiva em `avaliacoes_cadastradas` (4 colunas nullable) + duas RPCs `stable` em SQL (`avaliacao_clientes_do_dia` para a lista do modal; `avaliacoes_sinais` para a fila), ambas com pg_trgm/unaccent já instalados em `public`. No front: helpers puros em `src/lib/clienteTrinks.ts`, um hook por RPC, e os componentes existentes ganham os campos novos. `nome_cliente` passa a significar "nome no Google"; nenhum dado é movido.

**Tech Stack:** React 18 + TS, React Hook Form + Zod, TanStack Query, Supabase (Postgres 15, PostgREST), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-estrelas-cliente-google-trinks-design.md` (ler junto). Protótipo aprovado: https://claude.ai/artifact/YCeqLSu2hX9bUtdof46fLs

## Global Constraints

- Projeto Supabase `kxgrprxyqeuffhczaznl`; extensões `pg_trgm` e `unaccent` no schema `public`.
- Datas de negócio em `America/Manaus`; no SQL use sempre `(now() at time zone 'America/Manaus')::date`, nunca `current_date`.
- `trinks_services.service_date` é `text` `'DD/MM/YYYY'`; `trinks_services.profissionalid` e `clienteid` são `text`.
- Fila: `"gerencia-fila-trinks-appointments"` (`professional_id int`, `trinks_client_id int`, `client_name`, `service_name`, `trinks_status`, `appointment_date date`). Só contam `lower(trinks_status) in ('em atendimento','finalizado')` (mesma regra do projeto da fila).
- Janela do dia do atendimento: de hoje−10 até hoje (Manaus), inclusive.
- Colunas novas todas NULLABLE, sem default; a policy de INSERT público NÃO muda; `nome_cliente` continua NOT NULL.
- Linhas legadas (tudo novo = NULL) têm de listar, aprovar, recusar e devolver exatamente como hoje.
- Sinais nunca bloqueiam aprovar/recusar. Duplicata compara SÓ o nome do Google (`nome_cliente`), nunca o do Trinks.
- Rótulos de tela: "Nome da cliente no Trinks", "Nome da cliente no Google", "Mesmo nome do Trinks", "Não encontrei a cliente — digitar o nome", "Trinks: — (cadastro antigo)", "(digitado à mão)". Selos: "Atendida", "Provável", "Aguardando espelho", "Não encontrada", "Possível duplicata".
- Zona vermelha (Tasks 1–2): escritor `opus-med`, revisor `auditor`, migração aplicada pelo MCP só depois do OK do auditor; testes SQL sempre dentro de `begin; … rollback;`. Nunca decidir uma pendente real.
- Não editar `src/integrations/supabase/types.ts` nem `src/components/ui/*`. Usar o client de `@/lib/supabase` (sem genérico) como `useAdminAvaliacoes` já faz.
- Branch: `feat/estrelas-cliente-trinks` a partir de `main`. Não adicionar ao commit os arquivos não rastreados/alterados que já existiam (PDFs, `HANDOFF.md`, `.playwright-mcp/`, migrações `20260822_*`).

## Review Focus

1. **Pendente legada aberta na fila nova** — sem `nome_cliente_trinks`/`data_atendimento`: card mostra "Trinks: — (cadastro antigo)", sinais calculados pelo nome do Google, aprovar funciona. Teste: Task 2 (caso legado) e Task 5 (render helper com campos nulos).
2. **RPC da lista falha ou volta vazia** (domingo, fila zerada às 06:00, espelho atrasado) — o modal nunca trava: mostra "nenhuma cliente…" + opção de digitar. Teste: Task 4 (`estadoDaLista`).
3. **Trocar profissional ou dia depois de escolher a cliente** — a escolha é limpa; nunca grava cliente de outra profissional/dia. Teste: Task 4.
4. **"Mesmo nome do Trinks" marcado e depois a cliente muda** — o nome do Google acompanha; desmarcar libera sem apagar. Teste: Task 3 (`nomeGoogleEfetivo`).
5. **Nome com acento/caixa/espaços duplos** ("JOSÉ  da silva" vs "Jose da Silva") — conta como idêntico na duplicata e no "Atendida". Teste: Task 1 (`avaliacao_normalizar_nome`) e Task 2.

---

### Task 1: Migração — colunas novas, normalização e lista de clientes do dia

**Agente:** `opus-med` (zona vermelha). Revisão: `auditor`.

**Files:**
- Create: `supabase/migrations/20261019120000_avaliacoes_cliente_trinks.sql`
- Create: `supabase/tests/avaliacoes_cliente_trinks.sql` (script de verificação; roda em `begin … rollback`)

**Interfaces:**
- Produces (SQL):
  - colunas `avaliacoes_cadastradas.nome_cliente_trinks text`, `cliente_trinks_id bigint`, `data_atendimento date`, `origem_cliente_trinks text check (origem_cliente_trinks in ('lista','digitado'))`.
  - `public.avaliacao_normalizar_nome(p text) returns text` — `immutable`, `= lower(public.unaccent('public.unaccent', regexp_replace(trim(p), '\s+', ' ', 'g')))` (forma com dicionário explícito para poder ser `immutable`).
  - `public.avaliacao_clientes_do_dia(p_profissional_id integer, p_data date) returns table (cliente_trinks_id bigint, nome text, servicos text[], fonte text)` — `language sql stable security invoker set search_path = public`; `grant execute … to anon, authenticated`.
- Produces (TS, Task 4 consome): RPC `avaliacao_clientes_do_dia` devolve `{ cliente_trinks_id: number | null; nome: string; servicos: string[]; fonte: "espelho" | "fila" }[]`.

- [ ] **Step 1: Verificar premissas no banco (só leitura, MCP `execute_sql`)**
  - tipos reais de `trinks_services.service_date/profissionalid/clienteid` (esperado: text);
  - se `clienteid` é sempre numérico (`clienteid !~ '^\d+$'` deve dar 0 nos últimos 60 dias);
  - se o id de cliente da fila está no mesmo espaço do espelho: num dia útil com fila populada, `join` por `trinks_client_id::text = clienteid` + mesmo profissional e dia; se não houver dados na fila (domingo/madrugada), registrar "não verificado" no relatório e seguir com a regra do spec (fila entra com `cliente_trinks_id` NULL se o espaço não bater).

- [ ] **Step 2: Escrever o script de verificação (falha antes da migração)**

`supabase/tests/avaliacoes_cliente_trinks.sql`, todo em `begin; … rollback;`, com `do $$ … assert … $$` para:
  - `avaliacao_normalizar_nome('  JOSÉ  da  Silva ') = 'jose da silva'`;
  - inserir como `set local role anon` uma linha só com os campos legados (`profissional_id, nome_profissional, nome_cliente, status='pendente', data_hora_cadastro`) → sucesso (bundle antigo continua funcionando);
  - inserir como `anon` uma linha com os 4 campos novos preenchidos → sucesso; com `origem_cliente_trinks='outro'` → erro de check;
  - inserir fixtures em `trinks_services` (profissional 999001, cliente id 555, `service_date` de ontem em `'DD/MM/YYYY'`, dois serviços) e em `"gerencia-fila-trinks-appointments"` (hoje, status `'Em atendimento'`, outro com `'Cancelado'`); então:
    - `avaliacao_clientes_do_dia(999001, ontem)` → 1 linha, `servicos` com os 2 serviços, `fonte='espelho'`;
    - `avaliacao_clientes_do_dia(999001, hoje)` → inclui a cliente da fila com `fonte='fila'` e NÃO inclui a cancelada;
    - mesma cliente no espelho e na fila hoje → 1 linha só, `fonte='espelho'`;
    - `p_data = hoje − 11` e `p_data = amanhã` → erro.

Run (MCP `execute_sql` com o conteúdo do arquivo). Expected: FAIL (função/colunas inexistentes).

- [ ] **Step 3: Escrever a migração**

Colunas com `add column if not exists`; check constraint nomeada `avaliacoes_origem_cliente_trinks_chk`; funções acima. `avaliacao_clientes_do_dia`:
  - `raise` (via plpgsql ou `case` que força erro) se `p_data` fora de [hoje−10, hoje];
  - espelho: `profissionalid = p_profissional_id::text and service_date = to_char(p_data,'DD/MM/YYYY') and client_name is not null`, id = `case when clienteid ~ '^\d+$' then clienteid::bigint end`;
  - fila só quando `p_data` = hoje, com o filtro de status das Global Constraints; id da fila só entra se Step 1 provou o mesmo espaço, senão NULL;
  - deduplicar por `coalesce(id::text, avaliacao_normalizar_nome(nome))`; `servicos` = `array_agg(distinct service_name)`; `fonte='espelho'` se a cliente existe no espelho; ordenar por `nome`.
  Comentário no topo explicando: `nome_cliente` = nome no Google; colunas novas nullable para não quebrar legado nem bundle em cache.

- [ ] **Step 4: Pedir revisão ao `auditor` (diff + resultado do Step 1) antes de aplicar.**

- [ ] **Step 5: Aplicar com MCP `apply_migration` (nome `avaliacoes_cliente_trinks`) e rodar o script do Step 2**

Expected: todos os `assert` passam; o `rollback` final desfaz fixtures. Conferir depois: `select count(*) from avaliacoes_cadastradas where status='pendente'` igual ao de antes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261019120000_avaliacoes_cliente_trinks.sql supabase/tests/avaliacoes_cliente_trinks.sql
git commit -m "feat(estrelas): colunas de cliente no Trinks e lista de clientes do dia"
```

---

### Task 2: RPC de sinais da fila — "Atendida?" e "Possível duplicata"

**Agente:** `opus-med`. Revisão: `auditor`.

**Files:**
- Create: `supabase/migrations/20261019120100_avaliacoes_sinais.sql`
- Modify: `supabase/tests/avaliacoes_cliente_trinks.sql` (casos novos)

**Interfaces:**
- Consumes: colunas e `avaliacao_normalizar_nome` da Task 1.
- Produces: `public.avaliacoes_sinais(p_ids uuid[]) returns table (avaliacao_id uuid, atendida text, atendida_nome text, atendida_data date, atendida_servico text, duplicatas jsonb)` — `stable security invoker set search_path = public`; `grant execute … to authenticated` (não `anon`).
  - `atendida` ∈ `'atendida' | 'provavel' | 'aguardando_espelho' | 'nao_encontrada'`.
  - `duplicatas` = array JSON (máx. 5, mais recentes primeiro) de `{ "id", "nome_profissional", "nome_cliente", "status", "data_hora_cadastro" }`; `[]` quando não há.

Regras (spec, seção "Sinais na fila de aprovação"):
- **Com `cliente_trinks_id`:** existe linha no espelho com mesmo profissional, `clienteid` = id e `service_date` = `data_atendimento` → `atendida` (nome, data, serviço dessa linha). Senão, se `data_atendimento >= hoje − 1` → `aguardando_espelho`; senão `nao_encontrada`.
- **Sem id:** nome alvo = `coalesce(nullif(trim(nome_cliente_trinks),''), nome_cliente)`; janela = [`coalesce(data_atendimento, dia_cadastro) − 10`, `dia_cadastro`], com `dia_cadastro = (data_hora_cadastro at time zone 'America/Manaus')::date`; melhor candidato por `greatest(similarity(a,b), word_similarity(a,b))` sobre nomes normalizados. Igual após normalização → `atendida`; score ≥ `0.6` → `provavel`; senão, se `coalesce(data_atendimento, dia_cadastro) >= hoje − 1` → `aguardando_espelho`; senão `nao_encontrada`.
- **Duplicata:** qualquer outra linha (`id <> própria`, qualquer status/mês/profissional) com nome do Google normalizado igual ou `similarity ≥ LIMIAR_DUP`.

- [ ] **Step 1: Calibrar `LIMIAR_DUP` (só leitura)** — sobre as 1.069 linhas reais, contar pares de nomes do Google (normalizados, distintos) com similarity em [0.7,0.8), [0.8,0.9), [0.9,1); listar 10 exemplos de cada faixa. Escolher o menor limiar cujos exemplos são, na maioria, a mesma pessoa (ponto de partida 0.8). Registrar números e escolha no comentário da migração e no relatório.

- [ ] **Step 2: Casos no script de verificação** (fixtures em transação):
  - estrela com id de cliente servida no dia → `atendida`, com serviço e data;
  - estrela com id de cliente, `data_atendimento` = hoje, sem linha no espelho → `aguardando_espelho`; mesma com `data_atendimento` = hoje−5 → `nao_encontrada`;
  - estrela **legada** (só `nome_cliente` = "Maria José Souza", sem campos novos) com cliente "MARIA JOSE  SOUZA" no espelho 3 dias antes do cadastro → `atendida`;
  - legada com cliente "Maria J. Souza Lima" → `provavel` e `atendida_nome = 'Maria J. Souza Lima'`;
  - duas estrelas com nome do Google "Loja Bella Moda" de profissionais diferentes, uma `aprovada` → cada uma lista a outra em `duplicatas` com o `status` certo; uma terceira com nome do Trinks igual mas Google diferente → `duplicatas = []`.

Run → FAIL (função inexistente).

- [ ] **Step 3: Escrever a migração** com as regras acima (CTEs; `jsonb_agg` com `order by data_hora_cadastro desc` e `limit 5` via subquery lateral).

- [ ] **Step 4: Revisão `auditor`; aplicar com `apply_migration` (`avaliacoes_sinais`); rodar o script inteiro** → PASS. Medir `explain analyze` de `avaliacoes_sinais` com os ids das pendentes reais: deve ficar abaixo de 1 s; se não, adicionar índice GIN trigram em `avaliacao_normalizar_nome(nome_cliente)` nesta mesma migração.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261019120100_avaliacoes_sinais.sql supabase/tests/avaliacoes_cliente_trinks.sql
git commit -m "feat(estrelas): sinais de atendimento e duplicata para a fila de aprovação"
```

---

### Task 3: Helpers puros do cadastro

**Agente:** `haiku-high` (código decidido aqui) — se travar, `sonnet-high`.

**Files:**
- Create: `src/lib/clienteTrinks.ts`
- Test: `src/lib/clienteTrinks.test.ts`

**Interfaces:**
- Produces:
  - `export const JANELA_DIAS_ATENDIMENTO = 10;`
  - `export function diaManaus(agora?: Date): string` — `'YYYY-MM-DD'` em `America/Manaus` (via `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Manaus' })`).
  - `export function diasPermitidos(hoje: string): string[]` — de `hoje` até `hoje − 10`, mais recente primeiro (11 itens).
  - `export function rotuloDia(dia: string, hoje: string): string` — `"Hoje · sáb 17"`, `"Ontem · sex 16"`, demais `"qua 14/10"`.
  - `export type OrigemClienteTrinks = "lista" | "digitado";`
  - `export interface ClienteDoDia { cliente_trinks_id: number | null; nome: string; servicos: string[]; fonte: "espelho" | "fila" }`
  - `export function nomeGoogleEfetivo(nomeGoogle: string, nomeTrinks: string, mesmoNome: boolean): string`
  - `export function montarInsertAvaliacao(v: { profissionalId: number; nomeProfissional: string; nomeGoogle: string; nomeTrinks: string; clienteTrinksId: number | null; dataAtendimento: string; origem: OrigemClienteTrinks; agoraISO: string }): Record<string, unknown>` — devolve exatamente `{ profissional_id, nome_profissional, nome_cliente, nome_cliente_trinks, cliente_trinks_id, data_atendimento, origem_cliente_trinks, status: "pendente", data_hora_cadastro }`, com nomes `trim()`ados e `cliente_trinks_id: null` quando `origem === "digitado"`.

- [ ] **Step 1: Testes que falham**

```ts
describe("diaManaus", () => {
  it("usa o fuso de Manaus perto da meia-noite UTC", () => {
    expect(diaManaus(new Date("2026-10-18T02:30:00Z"))).toBe("2026-10-17");
  });
});
describe("diasPermitidos", () => {
  it("vai de hoje a hoje-10", () => {
    const d = diasPermitidos("2026-10-17");
    expect(d).toHaveLength(11);
    expect(d[0]).toBe("2026-10-17");
    expect(d[10]).toBe("2026-10-07");
  });
});
describe("rotuloDia", () => {
  it("hoje/ontem/outro", () => {
    expect(rotuloDia("2026-10-17", "2026-10-17")).toBe("Hoje · sáb 17");
    expect(rotuloDia("2026-10-16", "2026-10-17")).toBe("Ontem · sex 16");
    expect(rotuloDia("2026-10-14", "2026-10-17")).toBe("qua 14/10");
  });
});
describe("nomeGoogleEfetivo", () => {
  it("copia o Trinks quando marcado e acompanha a troca", () => {
    expect(nomeGoogleEfetivo("Mari", "Mariana Lima", true)).toBe("Mariana Lima");
    expect(nomeGoogleEfetivo("Mari", "Beatriz", true)).toBe("Beatriz");
  });
  it("desmarcado mantém o digitado", () => {
    expect(nomeGoogleEfetivo("Mari", "Mariana Lima", false)).toBe("Mari");
  });
});
describe("montarInsertAvaliacao", () => {
  it("monta a linha completa, com trim, status pendente", () => { /* todos os campos, nomes com espaços nas pontas */ });
  it("digitado nunca leva id de cliente", () => { /* origem 'digitado' + clienteTrinksId 555 → cliente_trinks_id null */ });
});
```

- [ ] **Step 2:** `npm test -- src/lib/clienteTrinks.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `src/lib/clienteTrinks.ts`.
- [ ] **Step 4:** `npm test -- src/lib/clienteTrinks.test.ts` → PASS; `npm test` inteiro → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/clienteTrinks.ts src/lib/clienteTrinks.test.ts && git commit -m "feat(estrelas): helpers do cadastro com cliente no Trinks"`

---

### Task 4: Modal de cadastro com lista de clientes do dia

**Agente:** `sonnet-high` (UI). Revisão: `reviewer`.

**Files:**
- Create: `src/hooks/useClientesDoDia.ts`
- Create: `src/components/avaliacoes/ClienteTrinksPicker.tsx`
- Modify: `src/components/avaliacoes/CadastrarAvaliacaoModal.tsx`
- Modify: `src/lib/clienteTrinks.ts` + teste (função `estadoDaLista`)

**Interfaces:**
- Consumes: RPC da Task 1; helpers da Task 3.
- Produces:
  - `useClientesDoDia(profissionalId: number | null, dia: string | null): { clientes: ClienteDoDia[]; isLoading: boolean; isError: boolean }` — React Query, chave `["clientes_do_dia", profissionalId, dia]`, `enabled` só com os dois; `staleTime` 60 s.
  - `export function estadoDaLista(q: { isLoading: boolean; isError: boolean; clientes: ClienteDoDia[] }): "carregando" | "erro" | "vazia" | "pronta"` em `clienteTrinks.ts`.
  - `ClienteTrinksPicker` props: `{ clientes, estado, selecionado: { nome: string; id: number | null; origem: OrigemClienteTrinks } | null, onSelecionar(v), }` — busca local por nome (normalização sem acento), itens com nome + serviços, última opção "Não encontrei a cliente — digitar o nome" que vira um `Input` livre.

- [ ] **Step 1: Teste que falha** para `estadoDaLista` (`isError` vence `clientes` vazio; `isLoading` → `"carregando"`; `[]` → `"vazia"`; 1 item → `"pronta"`). Run → FAIL. Implementar. Run → PASS.

- [ ] **Step 2: Modal** — schema Zod novo:
  `profissionalId` (obrigatório), `dataAtendimento` (string em `diasPermitidos(diaManaus())`), `nomeTrinks` (≥2 caracteres, mensagem "Escolha a cliente ou digite o nome"), `clienteTrinksId` (number | null), `origem` (`"lista" | "digitado"`), `nomeGoogle` (≥2 caracteres), `mesmoNome` (boolean).
  Ordem e textos conforme o protótipo: 1 Profissional, 2 Dia do atendimento (chips "Hoje", "Ontem", "Outro dia" → `Select` com os demais de `diasPermitidos`), 3 Nome da cliente no Trinks (picker), 4 Nome da cliente no Google + `Checkbox` "Mesmo nome do Trinks" (marcado: input desabilitado mostrando `nomeGoogleEfetivo`) e a dica "Copie exatamente como aparece na avaliação do Google.".
  Trocar profissional ou dia → `setValue` limpa `nomeTrinks`, `clienteTrinksId`, `origem`. Estado `erro` ou `vazia` → mostra o texto ("Não foi possível carregar as clientes deste dia." / "Nenhuma cliente encontrada para este dia.") e já abre a opção de digitar. Dia padrão: hoje.
  Submit: `montarInsertAvaliacao(...)` → `insert`; toast usa o nome do Google.

- [ ] **Step 3: Verificar** — `npm test`, `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json` sem erros novos. Com `npm run dev`, abrir `/`, cadastrar NÃO — apenas percorrer o modal: escolher profissional/dia, ver a lista (ou o vazio em dia sem dados), marcar/desmarcar "Mesmo nome do Trinks", trocar o dia e ver a escolha limpa. **Não submeter** (inseriria pendente real); o insert foi testado no SQL da Task 1.

- [ ] **Step 4: Commit** — `git add` dos 4 arquivos + teste; `git commit -m "feat(estrelas): cadastro escolhe a cliente no Trinks e informa o nome no Google"`

---

### Task 5: Admin e /minhas-avaliacoes — dois nomes, busca e selos

**Agente:** `sonnet-high`. Revisão: `reviewer`.

**Files:**
- Modify: `src/hooks/useAdminAvaliacoes.ts` (tipo `AvaliacaoAdmin` + `COLUNAS`)
- Create: `src/hooks/useSinaisAvaliacoes.ts`
- Modify: `src/lib/avaliacoesAdmin.ts` + `src/lib/avaliacoesAdmin.test.ts` (criar se não existir)
- Create: `src/components/admin/SinaisAvaliacao.tsx`
- Modify: `src/components/admin/AvaliacoesManager.tsx`, `src/components/admin/HistoricoDecisoes.tsx`
- Modify: `src/hooks/useMinhasAvaliacoes.ts`, `src/pages/MinhasAvaliacoes.tsx`
- Modify: `src/lib/avaliacoesCache.test.ts` (fixture ganha os campos novos como `null`)

**Interfaces:**
- Consumes: RPC `avaliacoes_sinais` (Task 2).
- Produces:
  - `AvaliacaoAdmin` ganha `nome_cliente_trinks: string | null; cliente_trinks_id: number | null; data_atendimento: string | null; origem_cliente_trinks: "lista" | "digitado" | null`.
  - `export function casaBuscaCliente(a: Pick<AvaliacaoAdmin,"nome_cliente"|"nome_cliente_trinks">, termo: string): boolean` em `avaliacoesAdmin.ts` (sem acento, case-insensitive, procura nos dois nomes; termo vazio → true).
  - `export function linhaTrinks(a: Pick<AvaliacaoAdmin,"nome_cliente_trinks"|"origem_cliente_trinks"|"data_atendimento">): string` — `"Trinks: Fernanda Costa (digitado à mão) · 16/10"`, `"Trinks: Mariana Souza Lima · 17/10"`, legado `"Trinks: — (cadastro antigo)"`.
  - `useSinaisAvaliacoes(ids: string[]): { sinais: Map<string, SinalAvaliacao>; isLoading: boolean; isError: boolean }`, chave `["admin_avaliacoes","sinais", ...ids ordenados]` (fica sob o prefixo que as mutações já invalidam), `enabled` com `ids.length > 0`.
  - `SinalAvaliacao` = linha da RPC com `duplicatas` tipado.

- [ ] **Step 1: Testes que falham** para `casaBuscaCliente` ("jose" casa "José" no Google; casa só pelo Trinks; legado com Trinks null não quebra) e `linhaTrinks` (os três formatos acima). Run → FAIL. Implementar. Run → PASS.

- [ ] **Step 2: Fila** — card: "Google: {nome_cliente}" + `linhaTrinks(...)` no lugar de "Cliente: …"; busca usa `casaBuscaCliente`; abaixo dos nomes, `<SinaisAvaliacao sinal={sinais.get(id)} />` com os selos e cores do protótipo (verde/âmbar/cinza/vermelho, ícones lucide, nunca emoji); "Provável" mostra `atendida_nome` e data; duplicata lista cada outra estrela (profissional, mês por extenso, status) — sem link de navegação nesta versão. Carregando → nada; erro → texto discreto "Sinais indisponíveis" (não esconde o card). `aria-label` dos checkboxes e toasts continuam usando o nome do Google.

- [ ] **Step 3: Histórico** — mesma troca de "Cliente:" pelas duas linhas; busca via `casaBuscaCliente` (mantendo o OR com o nome da profissional); sem selos.

- [ ] **Step 4: /minhas-avaliacoes** — `select` inclui `nome_cliente_trinks`; card mostra o nome do Google em destaque e, abaixo, "Trinks: …" quando houver.

- [ ] **Step 5: Verificar** — `npm test`, `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`; `npm run dev` logado no `/admin`: as pendentes legadas reais aparecem com "Trinks: — (cadastro antigo)" e selos calculados; NÃO aprovar/recusar nada real.

- [ ] **Step 6: Commit** — `git commit -m "feat(estrelas): admin e minhas avaliações mostram Google + Trinks e sinais de conferência"`

---

### Task 6: Documentação

**Agente:** `haiku-high`.

**Files:** Modify: `CLAUDE.md`

- [ ] **Step 1:** Em "Database Schema › avaliacoes_cadastradas": `nome_cliente` = nome no **Google**; documentar as 4 colunas novas (nullable; legado = NULL). Corrigir `trinks_services.service_date` para `TEXT 'DD/MM/YYYY'` e citar `clienteid`.
- [ ] **Step 2:** Na seção "Aba Aprovações": parágrafo sobre `avaliacoes_sinais` (regras de "Atendida?", duplicata só pelo nome do Google, sinais não bloqueiam) e sobre `avaliacao_clientes_do_dia` (fontes espelho + fila, janela 10 dias, status da fila considerados). Citar o achado lateral: tabelas da fila com escrita `anon` aberta (pendência do projeto da fila).
- [ ] **Step 3:** Commit — `git commit -m "docs: cliente no Google + Trinks nas estrelas"`

---

### Fechamento

- Revisão final da branch: `auditor` (a branch toca migração/RPC).
- `superpowers:finishing-a-development-branch`. Push/merge/deploy só com OK do dono.
