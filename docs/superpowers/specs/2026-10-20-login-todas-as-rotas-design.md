# Login em todas as rotas do Destaque — design

Data: 2026-10-20 · Dono: Augusto · Sessão: "tarefas desafio prof parceiro 01"
Zona vermelha (auth, RLS, grants em banco compartilhado). Escrita `opus-med`, revisão `auditor`.

## 1. Decisões do dono (não reabrir)

- A página deixa de ser pública. **Nenhum acesso sem login**, inclusive o tablet e o PC da recepção.
- Login **só por magic link** (Supabase, `shouldCreateUser: false`). Sem senha, sem CPF.
- Sessão dura o máximo possível no aparelho. Revogar o e-mail derruba o aparelho **no próximo carregamento ou ação**, sem conferência periódica de aba aberta.
- **E-mail ligado à profissional** (`profissionais_ativos.email`, migração `20261020120000`): o "Quem é você?" fica fixo nela, ela só cadastra estrela no próprio nome e `/minhas-avaliacoes` mostra só as dela, com o motivo das recusadas.
- A **recepção** cadastra estrela para qualquer profissional e vê o **detalhe de todas** as estrelas, **com o motivo de recusa** (decisão do dono em 2026-10-20, revendo a regra anterior "motivo só para a própria e o admin").
- Contas e perfis:

| Perfil | Quem |
|---|---|
| Admin | Augusto |
| Recepção | Andressa, Kelle, Paula, `studioxmanaustablet1@gmail.com` (tablet), `studioxmanauspctimbiras@gmail.com` (PC da recepção) |
| Profissional | as 19 ativas com categoria (lista conferida em 2026-10-20) |

  Andressa e Kelle são Recepção **e** estão ligadas ao próprio cadastro (participam só do Bônus Estrelas): o cartão delas é o delas, e elas cadastram para qualquer uma. As contas de aparelho são linhas normais de usuário (perfil e revogação pela tela de usuários), sem nada fixo no código.
- Tela de aprovação: só Admin (e quem o dono puser em "Somente Leitura").

## 2. Modelo de acesso

### 2.1 Páginas do kit (`auth-kit.config.json` → `src/lib/pages.ts`)

| Chave | Rotas | `read` | `write` |
|---|---|---|---|
| `painel` (nova) | `/`, `/aniversariantes`, `/minhas-avaliacoes` | ver o painel | — (não usado) |
| `estrelas` (nova) | modal de cadastro, `/minhas-avaliacoes` | cadastrar **só para a profissional ligada** e ver **só as próprias** (com motivo) | cadastrar **para qualquer uma** e ver o detalhe de **todas**, com motivo |
| `admin` | `/admin` | ver a fila de aprovação | aprovar, recusar, editar regras |
| `usuarios` | `/admin/usuarios` | — | administrar usuários |

Perfis semeados/ajustados:

| Perfil | painel | estrelas | admin | usuarios |
|---|---|---|---|---|
| Admin | read | write | write | write |
| Recepção (novo) | read | write | none | none |
| Profissional (novo) | read | read | none | none |
| Somente Leitura (existe) | read | none | read | none |

### 2.2 Vínculo e-mail → profissional

`public.destaque_minha_profissional() returns integer` — `security definer`, `search_path` vazio, `stable`. Devolve o `"profissionalId"` da linha com `email = lower(auth.email())` **e** `ativo is not false`, **só se** o usuário está ativo em `destaque_users_app`; senão NULL. `auth.email()` vem do JWT do magic link (e-mail verificado pelo clique). EXECUTE para `authenticated`, revogado de `anon`/`public`.

Consequências:
- Perfil Profissional sem vínculo (e-mail ausente, divergente ou cadastro inativo) entra no painel, mas não cadastra estrela; a tela explica "seu e-mail não está ligado a nenhum cadastro, fale com a recepção".
- Recontratação (novo id E): o e-mail fica preso na linha inativa → sem vínculo até o dono mover o e-mail. Esperado.

### 2.3 Revogação

`alternar_ativo` (edge function `destaque-auth-admin`) põe `destaque_users_app.ativo = false`. A partir daí:
- **Banco**: toda policy nova passa por `destaque_can_read_page`/`destaque_can_write_page`, que já são fail-closed para usuário inativo → zero linhas / 42501 em qualquer leitura ou escrita do Destaque, mesmo com JWT ainda válido.
- **App**: no carregamento, `carregarAcesso` devolve null para inativo → o app faz `signOut({ scope: 'local' })` e mostra "Seu acesso a este painel foi removido".
- **Sem ban no Auth**: os usuários do Auth são compartilhados com fila, NFS-e e financeiro (ex.: Paula). Banir derrubaria o acesso dela nos outros apps. O corte é por app, no banco.

### 2.4 Sessão longa

`supabase-js` com `persistSession` + `autoRefreshToken` (padrão) em localStorage: o refresh token não expira enquanto o projeto não tiver time-box/inatividade. **Verificar no dashboard** (Auth → Sessions) que "Time-box user sessions" e "Inactivity timeout" estão desligados e registrar no CLAUDE.md. Unificar o client: hoje há `@/lib/supabase` (kit) e `@/integrations/supabase/client` (app); dois `createClient` com a mesma storage key geram dois GoTrue no mesmo aparelho. Fica um só.

## 3. Banco (por tabela)

Princípio: rotas do Destaque leem como `authenticated` com `destaque_can_read_page('painel')`; `anon` perde o que só o Destaque usa; o que a **fila** lê sem login continua aberto (levantamento de 2026-10-20: a fila lê como anon só `profissionais_ativos` (`profissionalId`, `nome_profissional`, `categoria`, `ativo`) e as próprias `"gerencia-fila-*"`/`servicos`).

| Objeto | Hoje | Depois |
|---|---|---|
| `avaliacoes_cadastradas` | SELECT por coluna (anon e authenticated, sem `motivo_recusa`, PR #9); INSERT anon com status pendente | **anon: nada.** authenticated: SELECT por RLS — `destaque_can_read_page('admin') OR destaque_can_write_page('estrelas') OR (destaque_can_read_page('estrelas') AND profissional_id = destaque_minha_profissional())`. INSERT por RLS: invariantes de pendente de hoje **e** (`destaque_can_write_page('estrelas')` OR (`read` em estrelas AND `profissional_id = destaque_minha_profissional()`)). UPDATE: segue só admin. Revogar DELETE/TRUNCATE/REFERENCES/TRIGGER de authenticated. Trigger `antes_inserir` inalterado (já cobre authenticated) |
| contagem para ranking/bônus | `useStarsData` e `useEstrelasPendentes` leem a tabela | RPC nova `destaque_estrelas_periodo(p_inicio timestamptz, p_fim timestamptz)` — `security definer`, gate `destaque_can_read_page('painel')`, devolve só `profissional_id, status, data_hora_cadastro, data_aprovacao` (aprovadas e pendentes do período). Nada de nome de cliente |
| `/minhas-avaliacoes` | anon lê por `profissional_id` | RPC `destaque_minhas_avaliacoes(p_profissional_id int)` — `security definer`. Profissional (read em estrelas): só o próprio id. Recepção e Admin (write em estrelas): qualquer id. Todos recebem `motivo_recusa` das recusadas |
| `trinks_services` | SELECT public `true` | **anon: revogar SELECT.** authenticated: policy `destaque_can_read_page('painel')`. Escrita segue só n8n/postgres |
| `regras_desafio`, `feriados`, `tratamento_fabricante`, `profissional_fabricante` | SELECT public `true` | **anon: revogar SELECT.** authenticated: leitura com `destaque_can_read_page('painel')`; escrita admin inalterada |
| `profissionais_ativos` | anon: 9 colunas; authenticated: tabela inteira (`arwdDxt`, policy SELECT true, update admin/contador NFS-e) | **anon: só** `profissionalId, nome_profissional, categoria, ativo` (o que a fila usa). **authenticated: revogar INSERT/UPDATE/DELETE/TRUNCATE** (nenhum escritor usa authenticated; NFS-e e financeiro escrevem com service_role). **Leitura de authenticated restrita às colunas do app** (`profissionalId, nome_profissional, categoria, apelido, ativo, dia_aniversario, mes_aniversario, created_at, updated_at`) — ver pré-requisito NFS-e (§5) |
| `avaliacao_clientes_do_dia` | EXECUTE anon | **anon: revogar.** Dentro: exige `destaque_can_write_page('estrelas')` ou (`read` e `p_profissional_id = destaque_minha_profissional()`) |
| `avaliacoes_sinais`, `avaliacoes_motivos_recusa` | authenticated | inalterados (admin) |

Pendências herdadas que entram aqui:
- O EXISTS do trigger `antes_inserir` lê `trinks_services` como invoker: com a policy de `painel`, Profissional e Recepção leem → ok. Mesmo assim, mover o EXISTS para helper `security definer` (search_path vazio), **sem** tornar o trigger definer.
- Trocar o errcode 22023 da regra de cadastro por código próprio (classe P0) e o toast do modal checar esse código.
- Corrigir no CLAUDE.md o "Atendida? não se forja" (por nome ainda se forja).

## 4. Front

- `AuthProvider` envolve **todas** as rotas (sai a regra "não mova o provider"). `/`, `/aniversariantes`, `/minhas-avaliacoes` sob `RequirePage chave="painel"`. Sem sessão → tela de login (magic link, `emailRedirectTo` = URL atual). Inativo → signOut local + aviso.
- **"Quem é você?"**: com vínculo → fixo na profissional ligada (sem "Trocar"); sem vínculo (aparelhos, Paula, admin) → livre, como hoje (`localStorage`). O perfil local antigo de quem passa a ter vínculo é substituído.
- **Modal de estrela**: `read` em estrelas → profissional fixa (a ligada); `write` → seletor como hoje.
- **`/minhas-avaliacoes`**: Profissional → as dela; Recepção e Admin → escolhem a profissional. Todos veem o motivo das recusadas.
- `useStarsData`/`useEstrelasPendentes` → RPC `destaque_estrelas_periodo`. `useMinhasAvaliacoes` → RPC `destaque_minhas_avaliacoes`.
- Header com e-mail logado e "Sair".
- Tela de usuários: ação "Criar contas das profissionais" lista as ativas com e-mail e sem conta, com perfil sugerido (Profissional; Recepção para Andressa/Kelle), para o dono **conferir e confirmar** (é a revisão humana que mitiga o webhook sem autenticação). Contas de aparelho e da Paula entram pelo "novo usuário" normal. Usa `criar_usuario` da edge function (convite por e-mail). Usuário de Auth que já existe (Augusto, Paula) é vinculado sem novo convite.

## 5. Pré-requisitos e ordem de entrada no ar

1. **Proteger o webhook Trinks no n8n** — token na URL (`?token=...`) conferido no primeiro nó; quem souber a URL hoje grava e-mail em profissional sem e-mail. Depende de o dono trocar a URL no painel do Trinks (a mesma URL atende fila, CRM e profissional: troca coordenada). Alternativa aceita só com decisão do dono: seguir sem token, apoiado na revisão da lista de contas.
2. **App NFS-e** (`emissao-nota-prof-parceiro`): trocar `select('*')` de `profissionais_ativos` como authenticated por leitura no servidor com service_role após checar papel (ou RPC definer com `user_has_role`). Sem isso, toda profissional logada leria CPF/telefone/e-mail das colegas pela API. Repo separado, PR separado, deploy antes do item 4.
3. **Migração A (aditiva, bundle antigo segue funcionando)**: páginas `painel`/`estrelas`, perfis Recepção/Profissional, `destaque_minha_profissional`, RPCs novas, policies novas para authenticated, revogar escrita de authenticated em `profissionais_ativos` e DELETE/TRUNCATE em `avaliacoes_cadastradas`.
4. **Migração B**: leitura de authenticated em `profissionais_ativos` por colunas (depois do item 2).
5. **Deploy do front** com login em tudo.
6. **Criar as contas** (convites) pela tela de usuários, lista conferida pelo dono.
7. **Migração C (fecha anon)**: revogar o que a tabela de §3 manda, **depois** de confirmar nos logs da API (`edge_logs`, referer x3) que não há mais leitura anon vinda do Destaque. A fila continua com as 4 colunas de `profissionais_ativos`.
8. Desligar "Allow new users to sign up" no Auth (dono, dashboard) — antes do item 6 de preferência: com signup aberto, qualquer um vira `authenticated`, e as policies novas dependem de `destaque_users_app`, mas grants largos de outras tabelas ainda valem.
9. CLAUDE.md: reescrever "A pagina publica NAO tem auth" e as tabelas de policies.

## 6. Testes e verificação

- SQL em `begin…rollback` com `set local role authenticated` + `request.jwt.claims` simulando: profissional ligada, profissional sem vínculo, recepção, admin, usuário inativo, anon. Matriz esperada por tabela/RPC (ler, inserir própria, inserir de outra, ver motivo).
- Vitest das regras puras (seleção fixa/livre do "Quem é você?", profissional do modal).
- E2E manual em preview: login por magic link, revogar e recarregar (cai), cadastro pela recepção, `/minhas-avaliacoes` pela profissional com motivo.
- Pós-deploy: logs da API sem 401/42501 inesperados; contagem do ranking igual antes/depois.

## 7. Fora do escopo

- Login na fila e fechamento das tabelas `"gerencia-fila-*"` para anon (dívida da fila).
- `pesquisa_clientes_n8n`, `candidates`, `financeiro_studiox_inter_apply_classification` (vazamentos laterais já reportados).
- TRUNCATE/DELETE excedentes de authenticated/anon nas demais ~90 tabelas (achado da sessão do motivo de recusa) — só as tabelas do Destaque entram aqui.
