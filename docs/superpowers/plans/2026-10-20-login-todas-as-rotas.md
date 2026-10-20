# Login em todas as rotas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Destaque passa a exigir login por magic link em todas as rotas, com perfis Admin / Recepção / Profissional, vínculo e-mail → profissional e leitura do banco fechada para `anon` nas tabelas só do Destaque.

**Architecture:** Gate real no banco (RLS + RPCs `security definer` que passam por `destaque_can_*_page` e `destaque_minha_profissional()`); o front só decide o que renderizar (kit `auth-kit` v0.1, `AuthProvider` subindo para envolver todas as rotas). Entrada no ar em fases compatíveis: migração A aditiva → front → contas → migração C fecha `anon`. A migração B (colunas de `authenticated` em `profissionais_ativos`) depende do app NFS-e.

**Tech Stack:** React 18 + TS + Vite, TanStack Query, Supabase (Postgres 15, PostgREST, GoTrue magic link), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-login-todas-as-rotas-design.md`

## Global Constraints

- Zona vermelha: toda migração e todo código de `src/auth/` é escrito por `opus-med` e revisado por `auditor`. Migração só é aplicada pelo coordenador (`apply_migration`), nunca por subagent.
- Toda função nova `security definer` tem `set search_path = ''` (nomes qualificados `public.`), `revoke all ... from public, anon` e `grant execute ... to authenticated`.
- Policies com predicado embrulhado em `(select ...)` (InitPlan), como as vizinhas.
- Nunca `select('*')` no front; colunas explícitas.
- Textos de tela em pt-BR com acentos. Datas por `formatDataHoraManaus`.
- Nomes fixos: páginas `painel`, `estrelas`; perfis `Recepção`, `Profissional`; funções `destaque_minha_profissional()`, `destaque_estrelas_periodo(p_inicio timestamptz, p_fim timestamptz)`, `destaque_minhas_avaliacoes(p_profissional_id integer)`, `destaque_profissionais_sem_conta()`.
- Matriz de perfis (spec §2.1): Admin `{painel:read, estrelas:write, admin:write, usuarios:write}`; Recepção `{painel:read, estrelas:write, admin:none, usuarios:none}`; Profissional `{painel:read, estrelas:read, admin:none, usuarios:none}`; Somente Leitura `{painel:read, estrelas:none, admin:read, usuarios:none}`.
- Motivo de recusa: visível para a própria profissional, Recepção e Admin (decisão do dono 2026-10-20).
- A fila lê como `anon` só `profissionais_ativos` (`"profissionalId"`, `nome_profissional`, `categoria`, `ativo`): isso nunca é revogado neste plano.
- Não versionar arquivos do dono (`supabase/migrations/20260822_*`, PDFs, xlsx, `docs/trinks-automacao/HANDOFF.md`, `.playwright-mcp/`, `supabase/.temp/`, `docs/trinks-automacao/tests/`).
- Commits terminam com as linhas `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01VGx3VWTP4UnEJLe5VEvRYm`.

## Review Focus

1. Profissional cujo e-mail não casa com cadastro ativo (sem e-mail, divergente, inativa/recontratada) → entra no painel, "Quem é você?" livre, modal recusa cadastrar com a mensagem "Seu e-mail não está ligado a nenhum cadastro. Fale com a recepção." — testes em Task 3 (`resolverIdentidade`) e Task 1 (matriz SQL).
2. Usuário desativado com aba aberta e JWT válido → qualquer leitura/escrita nova volta 0 linhas/42501 e o próximo carregamento cai em "Seu acesso a este painel foi removido." — Task 1 (matriz SQL, caso `inativo`) e Task 2 (`decidirTela`).
3. Andressa/Kelle (Recepção + vínculo): cartão fixo nelas, modal com seletor livre, `/minhas-avaliacoes` com seletor — Task 3 (`resolverIdentidade`, caso recepção ligada).
4. Aparelho com perfil local antigo de outra pessoa salvo: conta de aparelho (sem vínculo) mantém o local; profissional ligada tem o local ignorado e sobrescrito pelo vínculo — Task 3.
5. Ranking e Bônus Estrelas com contagem idêntica antes/depois da troca para RPC (mês atual e anterior) — Task 4 (SQL de conferência).

---

### Task 1: Migração A (aditiva) + verificação SQL

**Agent:** `opus-med` (escreve e ensaia, não aplica). Revisão: `auditor`.

**Files:**
- Create: `supabase/migrations/20261021100000_login_fase_a.sql`
- Create: `supabase/verificacoes/login_fase_a.sql`

**Interfaces:**
- Produces:
  - `public.destaque_minha_profissional() returns integer` (stable, definer): `"profissionalId"` da linha com `email = lower(auth.email())` e `ativo is not false`, só se `auth.uid()` está ativo em `destaque_users_app`; senão NULL.
  - `public.destaque_estrelas_periodo(p_inicio timestamptz, p_fim timestamptz) returns table(profissional_id integer, status text, data_hora_cadastro timestamptz, data_aprovacao timestamptz)`: gate `destaque_can_read_page('painel')` (sem permissão = 0 linhas); só `status in ('aprovada','pendente')` e `data_hora_cadastro >= p_inicio and < p_fim`.
  - `public.destaque_minhas_avaliacoes(p_profissional_id integer) returns table(id uuid, nome_profissional text, nome_cliente text, nome_cliente_trinks text, status text, data_hora_cadastro timestamptz, data_aprovacao timestamptz, motivo_recusa text)`: permitido se `destaque_can_write_page('estrelas')` ou (`destaque_can_read_page('estrelas')` e `p_profissional_id = destaque_minha_profissional()`); senão 0 linhas. Ordem `data_hora_cadastro desc`.
  - `public.destaque_profissionais_sem_conta() returns table("profissionalId" integer, nome_profissional text, apelido text, categoria text, email text)`: gate `destaque_can_write_page('usuarios')`; ativas com `email` não nulo cujo e-mail não está em `auth.users` ligado a `destaque_users_app`.
  - Perfis `Recepção` e `Profissional` criados; Admin e Somente Leitura ganham `painel`/`estrelas` (matriz em Global Constraints).

- [ ] **Step 1: Escrever `supabase/verificacoes/login_fase_a.sql`** — um bloco `begin; ... rollback;` que cria em transação um usuário de Auth fictício por papel (profissional ligada à Aline 885975, profissional sem vínculo, recepção, admin, usuário inativo) com linhas em `destaque_users_app`, simula cada um com `set local role authenticated` + `set local request.jwt.claims = '{"sub":..., "email":..., "role":"authenticated"}'` e devolve uma tabela `papel × verificação × esperado × obtido`. Verificações e esperados:

| Verificação | prof. ligada | prof. sem vínculo | recepção | admin | inativo |
|---|---|---|---|---|---|
| `destaque_minha_profissional()` | 885975 | NULL | NULL | NULL | NULL |
| linhas de `destaque_estrelas_periodo(mês atual)` = contagem direta como postgres | igual | igual | igual | igual | 0 |
| `destaque_minhas_avaliacoes(885975)` | linhas da Aline com motivo | 0 | linhas da Aline com motivo | linhas da Aline com motivo | 0 |
| `destaque_minhas_avaliacoes(outra)` | 0 | 0 | >0 | >0 | 0 |
| `destaque_profissionais_sem_conta()` | 0 | 0 | 0 | ≥19 | 0 |
| SELECT em `trinks_services` | >0 | >0 | >0 | >0 | 0* |
| UPDATE `profissionais_ativos.email` | 42501 | 42501 | 42501 | 42501 | 42501 |
| DELETE em `avaliacoes_cadastradas` | 42501 | 42501 | 42501 | 42501 | 42501 |

  \* enquanto a policy pública de `trinks_services` existir (até a migração C), o inativo ainda lê como "public"; o bloco marca esse caso como `esperado_apos_C`.

- [ ] **Step 2: Rodar o bloco antes da migração** (via `execute_sql` em `begin…rollback`) — Expected: falha por funções inexistentes.

- [ ] **Step 3: Escrever a migração** com `set local lock_timeout = '5s'` + o DO de guarda (padrão de `20261020120000`), cabeçalho no estilo das vizinhas e rollback autossuficiente. Conteúdo, nesta ordem:
  1. `update destaque_perfis` (Admin, Somente Leitura) e `insert` (Recepção, Profissional, `is_system = false`) com a matriz de Global Constraints.
  2. As quatro funções de Interfaces.
  3. Policies **novas, permissivas, só para `authenticated`**: `<tabela>_select_painel` em `trinks_services`, `regras_desafio`, `feriados`, `tratamento_fabricante`, `profissional_fabricante` com `using ((select public.destaque_can_read_page('painel')))`; em `avaliacoes_cadastradas` `avaliacoes_select_logado` com o predicado de `destaque_minhas_avaliacoes` sobre `profissional_id`, mais `destaque_can_read_page('admin')`; e `avaliacoes_insert_logado` (`with check` = invariantes de pendente de hoje AND (`write` em estrelas OR (`read` em estrelas AND `profissional_id = destaque_minha_profissional()`))). As policies públicas antigas **ficam** (o bundle atual depende delas).
  4. `revoke insert, update, delete, truncate, references, trigger on public.profissionais_ativos from authenticated`; `revoke delete, truncate, references, trigger on public.avaliacoes_cadastradas from authenticated`.
  5. Helper `public.avaliacao_espelho_tem_cliente(p_profissional_id integer, p_dia date, p_cliente_id bigint) returns boolean` (definer, `search_path = ''`) com o EXISTS que hoje está no trigger `avaliacoes_cadastradas_antes_inserir`, e o trigger passa a chamá-lo (o trigger continua invoker).

- [ ] **Step 4: Ensaiar** migração + verificação no mesmo `begin…rollback` (terminar com `raise exception` contendo o resultado). Expected: todas as linhas `esperado = obtido` (exceto `esperado_apos_C`), bundle antigo intacto (SELECT como `anon` em `trinks_services`, `avaliacoes_cadastradas` com as colunas do app e `regras_desafio` continua > 0; INSERT anon de pendente continua aceito).

- [ ] **Step 5: Commit** dos dois arquivos (`feat(login): migração A — perfis, vínculo e RPCs`).

---

### Task 2: Login em todas as rotas (kit)

**Agent:** `opus-med`. Revisão: `auditor`.

**Files:**
- Modify: `auth-kit.config.json` (páginas `painel` "Painel", path `/`, icon `LayoutDashboard`; `estrelas` "Estrelas", path `/minhas-avaliacoes`, icon `Star`)
- Modify: `src/lib/pages.ts` (mesmas chaves, à mão — o render do kit não está no repo)
- Create: `src/auth/decidirTela.ts`, `src/auth/decidirTela.test.ts`
- Modify: `src/auth/guards.tsx`, `src/App.tsx`, `src/pages/Login.tsx`, `src/pages/SemAcesso.tsx`
- Create: `src/components/ContaLogada.tsx` (e-mail + "Sair", no header de `/`, `/aniversariantes`, `/minhas-avaliacoes`)

**Interfaces:**
- Consumes: perfis/páginas da Task 1.
- Produces: `decidirTela(i: { loading: boolean; temSessao: boolean; acesso: Acesso | null; chave: PageKey }): "carregando" | "login" | "removido" | "sem_acesso" | "ok"`. `"removido"` = sessão presente e `acesso === null` (inativo, sem linha, perfil sumido); `"sem_acesso"` = acesso presente com `paginas[chave] === "none"`.

- [ ] **Step 1: Teste** `decidirTela.test.ts`: loading→`carregando`; sem sessão→`login`; sessão + acesso null→`removido`; acesso com `painel:none`→`sem_acesso`; acesso com `painel:read`→`ok`; loading tem precedência sobre todo o resto.
- [ ] **Step 2: Rodar** `npx vitest run src/auth/decidirTela.test.ts` — Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** `decidirTela`; `RequirePage` passa a usá-lo; em `"removido"` chama `supabase.auth.signOut({ scope: "local" })` uma vez (efeito) e renderiza `<Login aviso="Seu acesso a este painel foi removido." />`. `App.tsx`: `AuthProvider` envolve `<Routes>` inteiro; `/`, `/aniversariantes`, `/minhas-avaliacoes` dentro de `RequirePage chave="painel"`; tirar o comentário "não mova o AuthProvider". `Login.tsx`: `emailRedirectTo: window.location.href`, `shouldCreateUser: false`, prop opcional `aviso`.
- [ ] **Step 4: Rodar** `npx vitest run` e `npx tsc --noEmit -p tsconfig.app.json` — Expected: testes PASS; nenhum erro novo de tipo além dos 15 preexistentes.
- [ ] **Step 5: Commit** (`feat(login): todas as rotas atrás do login`).

---

### Task 3: Identidade ligada (Quem é você?, modal, /minhas-avaliacoes)

**Agent:** `sonnet-high` (UI; o gate é o banco). Revisão: `reviewer`.

**Files:**
- Create: `src/lib/identidade.ts`, `src/lib/identidade.test.ts`
- Create: `src/hooks/useMinhaProfissional.ts`
- Modify: `src/hooks/usePerfilLocal.ts`, `src/components/resultados/ProfileSelector.tsx` (e quem renderiza "Trocar"), `src/components/avaliacoes/CadastrarAvaliacaoModal.tsx`, `src/pages/MinhasAvaliacoes.tsx`

**Interfaces:**
- Consumes: `destaque_minha_profissional()` (Task 1), `useAcesso()` (`acesso.paginas.estrelas`).
- Produces:
  - `useMinhaProfissional(): { id: number | null; carregando: boolean }` (TanStack Query, chave `["destaque","minha_profissional"]`, `staleTime: Infinity`).
  - `resolverIdentidade(i: { vinculoId: number | null; nivelEstrelas: PageAccess; perfilLocalId: string | null }): { perfilId: string | null; fixo: boolean; podeEscolherProfissionalNoCadastro: boolean; podeCadastrar: boolean; motivoBloqueio: string | null }`.

- [ ] **Step 1: Teste** `identidade.test.ts` com os casos:
  - profissional ligada (`vinculoId 885975`, `read`, local `"648177"`) → `{perfilId:"885975", fixo:true, podeEscolherProfissionalNoCadastro:false, podeCadastrar:true, motivoBloqueio:null}`;
  - profissional sem vínculo (`null`, `read`, local `"885975"`) → `{perfilId:"885975", fixo:false, podeEscolherProfissionalNoCadastro:false, podeCadastrar:false, motivoBloqueio:"Seu e-mail não está ligado a nenhum cadastro. Fale com a recepção."}`;
  - recepção ligada (Andressa `648177`, `write`, local null) → `{perfilId:"648177", fixo:true, podeEscolherProfissionalNoCadastro:true, podeCadastrar:true, motivoBloqueio:null}`;
  - aparelho (`null`, `write`, local `"885975"`) → `{perfilId:"885975", fixo:false, podeEscolherProfissionalNoCadastro:true, podeCadastrar:true, motivoBloqueio:null}`;
  - `none` em estrelas (Somente Leitura) → `podeCadastrar:false`, `motivoBloqueio:null` (botão some).
- [ ] **Step 2: Rodar** `npx vitest run src/lib/identidade.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** `resolverIdentidade` e `useMinhaProfissional`; `usePerfilLocal` recebe `vinculoId` e, quando não nulo, ignora/sobrescreve o local; `ProfileSelector` esconde "Trocar"/"limpar" quando `fixo`; o modal usa `podeEscolherProfissionalNoCadastro` (fixa a profissional ligada) e `podeCadastrar`/`motivoBloqueio` (botão desabilitado + texto); `/minhas-avaliacoes`: com `fixo && !podeEscolherProfissionalNoCadastro`, sem seletor. O toast do modal trata o erro da regra de data tanto pelo código antigo `22023` quanto pelo novo `P0D01` (Task 6), mostrando a mensagem do banco.
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: PASS.
- [ ] **Step 5: Commit** (`feat(login): identidade ligada ao e-mail`).

---

### Task 4: Dados do painel por RPC

**Agent:** `sonnet-high`. Revisão: `reviewer`.

**Files:**
- Modify: `src/hooks/useStarsData.ts`, `src/hooks/useEstrelasPendentes.ts`, `src/hooks/useMinhasAvaliacoes.ts`, `src/pages/MinhasAvaliacoes.tsx` (exibir `motivo_recusa` das recusadas, rótulo "Motivo da recusa")
- Create: `supabase/verificacoes/login_contagem_estrelas.sql`

**Interfaces:**
- Consumes: `destaque_estrelas_periodo`, `destaque_minhas_avaliacoes` (Task 1).
- Produces: `Avaliacao` (em `useMinhasAvaliacoes.ts`) ganha `motivo_recusa: string | null`; a assinatura de `useStarsData`/`useEstrelasPendentes` não muda.

- [ ] **Step 1: Escrever `login_contagem_estrelas.sql`**: para mês atual e anterior (fuso Manaus, fim exclusivo), compara por `profissional_id` a contagem de aprovadas (`status='aprovada' and data_aprovacao is not null`) e pendentes lida direto da tabela com a de `destaque_estrelas_periodo` executada como admin simulado. Expected: zero diferenças.
- [ ] **Step 2: Trocar** as leituras: `useStarsData` filtra aprovadas com `data_aprovacao` não nula sobre o retorno da RPC; `useEstrelasPendentes` filtra `pendente`; `useMinhasAvaliacoes` chama `destaque_minhas_avaliacoes`. Erro 42501/0 linhas por falta de permissão não vira "0 estrelas" silencioso: os hooks expõem `error` como hoje.
- [ ] **Step 3: Rodar** o SQL do Step 1 e `npx vitest run` — Expected: zero diferenças; testes PASS.
- [ ] **Step 4: Commit** (`feat(login): ranking e minhas avaliações por RPC`).

---

### Task 5: Criar contas das profissionais (tela de usuários)

**Agent:** `sonnet-high`. Revisão: `reviewer`.

**Files:**
- Create: `src/lib/perfilSugerido.ts`, `src/lib/perfilSugerido.test.ts`
- Create: `src/components/admin/CriarContasProfissionais.tsx`
- Modify: `src/pages/Usuarios.tsx` (seção visível só com `usuarios: write`)

**Interfaces:**
- Consumes: `destaque_profissionais_sem_conta()` (Task 1); ação `criar_usuario` de `src/auth/authAdmin.ts` (`{ nome, email, perfilId }` → `{ jaTinhaConta }`).
- Produces: `perfilSugerido(categoria: string | null): "Profissional" | "Recepção"` — categoria em `PROF_CATEGORIES` → `Profissional`; senão `Recepção`.

- [ ] **Step 1: Teste** `perfilSugerido.test.ts`: `"Cabelo"`→Profissional, `" Unhas "`→Profissional, `"Estetica"`→Profissional, `null`→Recepção, `"Maquiagem"`→Profissional.
- [ ] **Step 2: Rodar** — Expected: FAIL.
- [ ] **Step 3: Implementar** a função e a seção: tabela (apelido, nome, e-mail, categoria, perfil sugerido editável, checkbox marcado), botão "Criar N contas" com confirmação que lista os e-mails; cria uma a uma, em sequência, mostrando o resultado por linha ("convite enviado" / "já tinha conta, acesso liberado" / erro); falha de uma não para as outras; ao final invalida a lista.
- [ ] **Step 4: Rodar** `npx vitest run` — Expected: PASS.
- [ ] **Step 5: Commit** (`feat(login): criar contas das profissionais em lote`).

---

### Task 6: Migração C (fecha anon) — aplicar só depois do deploy do front e das contas

**Agent:** `opus-med`. Revisão: `auditor`.

**Files:**
- Create: `supabase/migrations/20261021110000_login_fase_c_fecha_anon.sql`
- Create: `supabase/verificacoes/login_fase_c.sql`

- [ ] **Step 1: Pré-checagem** (coordenador, `query_logs` em `edge_logs`): nenhuma requisição `anon` com referer `x3.studioxbrasil.com.br` para `/rest/v1/{trinks_services,avaliacoes_cadastradas,regras_desafio,feriados,tratamento_fabricante,profissional_fabricante}` nem `/rpc/avaliacao_clientes_do_dia` depois do deploy. Se houver, parar.
- [ ] **Step 2: Escrever a verificação**: como `anon`, SELECT nessas seis tabelas → 42501; `profissionais_ativos` → só `"profissionalId", nome_profissional, categoria, ativo` (as 4 colunas da fila retornam 200; `apelido` → 42501); RPC `avaliacao_clientes_do_dia` → 42501; INSERT em `avaliacoes_cadastradas` → 42501. Como profissional ligada: `avaliacao_clientes_do_dia(outra, hoje)` → exceção; própria → ok. A matriz da Task 1 roda de novo, agora com os casos `esperado_apos_C`.
- [ ] **Step 3: Escrever a migração**: drop das policies públicas de SELECT dessas seis tabelas e da policy pública de INSERT de avaliações; `revoke all` de `anon` nelas; em `profissionais_ativos`, `revoke select` de `anon` e `grant select ("profissionalId", nome_profissional, categoria, ativo)`; `avaliacao_clientes_do_dia` ganha a checagem de estrelas (mesmo predicado de `destaque_minhas_avaliacoes`) e perde EXECUTE de `anon`; a regra de data do trigger `antes_inserir` passa de `22023` para `P0D01` (mesma mensagem). Rollback autossuficiente.
- [ ] **Step 4: Ensaiar** em `begin…rollback` — Expected: verificação toda verde; a fila (como `anon`) continua lendo as 4 colunas.
- [ ] **Step 5: Commit** (`feat(login): migração C — anon fora das tabelas do Destaque`).

---

### Task 7: Migração B (leitura de authenticated em profissionais_ativos) — depende do app NFS-e

**Agent:** `opus-med`. Revisão: `auditor`. **Bloqueada** até o NFS-e parar de ler `profissionais_ativos` com `select('*')` como `authenticated` (decisão do dono pendente: quem faz e onde).

**Files:**
- Create: `supabase/migrations/20261021120000_login_fase_b_colunas_authenticated.sql`

- [ ] **Step 1:** verificação: como `authenticated` (profissional ligada), `select cpf`/`email`/`telefone` → 42501; colunas do app → 200; o NFS-e (admin/contador) continua funcionando pelo caminho novo dele.
- [ ] **Step 2:** migração: `revoke select on public.profissionais_ativos from authenticated`; `grant select ("profissionalId", nome_profissional, categoria, apelido, ativo, dia_aniversario, mes_aniversario, created_at, updated_at)`. Rollback autossuficiente.
- [ ] **Step 3:** ensaiar em `begin…rollback`; commit.

---

### Task 8: CLAUDE.md e revisão final

**Agent:** `sonnet-high` (doc). Revisão final da branch: `auditor`.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1:** Reescrever "A pagina publica NAO tem auth" como "Login obrigatório em todas as rotas" (decisão do dono 2026-10-20): perfis e matriz, vínculo por e-mail, revogação sem ban, as quatro RPCs, o que `anon` ainda lê (só as 4 colunas da fila), tabela de policies atualizada, `P0D01`, recepção vê motivo; corrigir "Atendida? não se forja por INSERT" para "o par id+dia não se forja; por nome ainda se forja".
- [ ] **Step 2:** `auditor` revisa a branch inteira contra a spec; achados corrigidos pelo degrau certo.
- [ ] **Step 3:** Commit.

---

## Ordem de entrada no ar (coordenador, fora dos subagents)

1. Aplicar migração A (após auditor) → conferir com `login_fase_a.sql`.
2. PR + merge + deploy do front (Tasks 2–5) → smoke em produção com a conta do dono.
3. Dono: desligar "Allow new users to sign up"; conferir Auth → Sessions sem time-box/inatividade.
4. Dono confere e confirma "Criar contas" (19 profissionais + Andressa/Kelle); dono cria Paula e os dois aparelhos como Recepção.
5. Aplicar migração C (Task 6) após a pré-checagem de logs.
6. Migração B quando o NFS-e estiver pronto.

Fora do repo, antes do passo 4 (spec §5): token no webhook Trinks do n8n (`?token=` conferido no primeiro nó; troca coordenada da URL no painel do Trinks) — ou decisão explícita do dono de seguir só com a revisão da lista de contas.
