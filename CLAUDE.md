# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React + TypeScript dashboard application called "Profissional Destaque do Mês" (Professional of the Month) for Studio X salon. It tracks and displays performance metrics across **4 professional categories**: Cabelo (Hair), Unhas (Nails), Estética (Aesthetics), and Maquiagem (Makeup). Each category has unique scoring rules, and the system includes a prize qualification panel and Google Stars integration.

## Tech Stack

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite (configured with React SWC for faster compilation)
- **UI Components**: shadcn/ui (Radix UI primitives) - auto-generated, don't modify directly
- **Styling**: Tailwind CSS with custom HSL color system and animations
- **State Management**: React Query (TanStack Query) + Context API
- **Routing**: React Router v6
- **Database**: Supabase (PostgreSQL with RLS enabled)
- **Charts**: Recharts
- **Forms**: React Hook Form with Zod validation
- **Development Tools**: ESLint

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (runs on port 8080)
npm run dev

# Build for production
npm run build

# Build for development environment
npm run build:dev

# Run linting (ESLint with TypeScript support)
npm run lint

# Preview production build
npm run preview
```

## Development Configuration

### Vite Configuration
- **Dev Server**: Runs on port 8080 with IPv6 support (`host: "::"`)
- **Path Alias**: `@` maps to `./src` directory
- **Plugins**: React SWC for compilation

### Tailwind Configuration
- **Dark Mode**: Class-based dark mode support
- **Custom Theme**: Extensive HSL-based color system with semantic naming
- **Container**: Centered with 2rem padding, max-width 1400px on 2xl screens
- **Animations**: Custom accordion animations for UI components

## Project Architecture

### Core Application Structure

- **Entry Point**: `src/main.tsx` → `src/App.tsx` → `src/pages/Index.tsx`
- **Main Dashboard**: The Index page contains the main dashboard with rankings, charts, and cronograma data
- **Data Flow**: 
  - Custom hooks in `/hooks` fetch data from Supabase using React Query
  - Components use React Query for data fetching and caching
  - Context API manages global date filtering state (DateFilterContext)
  - Dados sao carregados no mount (`useDashboardData` chama `fetchServicesData()` /
    `fetchActiveProfessionals()` num `useEffect`). **Nao ha subscription de realtime**:
    `trinks_services` nem esta na publication `supabase_realtime`. Para ver dados novos,
    recarregue a pagina (a ingestao roda server-side no n8n — ver abaixo)

### Key Directories

- `/src/components/` - React components organized by feature
  - `/resultados/` - "Minha Meta + Corrida": acompanhamento pessoal mobile-first
  - `/dashboard/` - Dashboard-specific components
  - `/ui/` - shadcn/ui components (auto-generated, don't modify directly)
- `/src/hooks/` - Custom React hooks for data fetching
- `/src/contexts/` - React contexts (DateFilterContext for global date filtering)
- `/src/integrations/supabase/` - Supabase client and types (auto-generated)
- `/src/lib/` - Utility functions and constants
- `/supabase/` - Supabase configuration and edge functions
  - `/functions/` - Edge functions for automation
  - `/migrations/` - Database schema migrations

### Data Processing Components

**Nao existem mais.** `CronogramaDataProcessor` e `RealtimeSubscription` nunca existiram
como arquivos (eram ficcao desta doc). `EdgeFunctionProcessor` existia e foi **removido em
ago/2026**: ele invocava a edge function `daily-trinks-automation` no mount do dashboard,
recebia 546 (WORKER_LIMIT) e exibia um toast vermelho de erro para todo usuario a cada load.
O caminho ficou obsoleto quando a ingestao de `trinks_services` migrou para os workflows n8n
server-side (`docs/trinks-automacao/RELATORIO-IMPLANTACAO.md`). **Nao reintroduza chamadas a
edge function no load da pagina.**

### Key Custom Hooks

- `useDashboardData`: Main orchestrator hook that combines all data sources
  - Aggregates data from service-specific hooks
  - Manages loading states across all data fetches
  - Handles professional selection and details

- `useServicesData`: Core data fetching hook
  - Fetches ALL records from `trinks_services` table (no server-side filtering)
  - Returns service data, last update, and refresh function
  - Client-side filtering applied by category hooks

- `useActiveProfessionals`: Professional management hook
  - Fetches from `profissionais_ativos` table
  - Maps professionals to their categories (Cabelo, Unhas, Estética, Maquiagem)
  - Provides lookup functions: `isActiveProfessional()`, `getProfessionalCategory()`, `getProfessionalsByCategory()`
  - `getProfessionalsByCategory()` **exclui `ativo === false`** (`profissionaisDaCategoria`, ver
    "Inativos fora do ranking"); `activeProfessionals` continua sendo o cadastro inteiro

- `useStarsData`: Google Stars management hook
  - Le pela RPC `destaque_estrelas_periodo(p_inicio, p_fim)` (so `authenticated`, gate `painel:read`),
    nao mais pela tabela; guarda so as `aprovada` com `data_aprovacao`. A RPC devolve aprovadas e
    pendentes do periodo [inicio, fim) por `data_hora_cadastro` (Manaus). Sem permissao ela devolve
    0 linhas SEM erro (o `RequirePage` barra antes). Resposta com 1000 linhas ou mais (teto do
    PostgREST, `PeriodoLongoError`) conta como falha e linha fora do formato tambem: viram `error`
    (com `errorKind` `periodo_longo` | `generico` e `errorMessage`), nunca "0 estrelas"
    (`src/lib/estrelasRpc.ts`). Em QUALQUER filtro a home (`Index`) mostra um aviso acima do
    `DataRankings` ("... a pontuacao esta sem elas" no teto; "... pode estar incompleta. Recarregue
    a pagina." nos demais), alem do aviso proprio do `BonusEstrelas`
  - Returns stars count per professional per category
  - Estrela de `ativo === false` nao entra em mapa nenhum (`agruparEstrelasPorCategoria` em
    `src/lib/estrelasPorCategoria.ts`, ver "Inativos fora do ranking")
  - Stars worth 3 points each in Cabelo/Unhas (display-only in Estética/Maquiagem)
  - **Mes de atribuicao = mes do `data_hora_cadastro`** (fuso `America/Manaus`), **nao** o
    da aprovacao: aprovar hoje uma avaliacao cadastrada em maio soma os 3 pontos ao ranking
    de MAIO, ja encerrado. A aba "Aprovacoes" avisa antes de decidir uma pendente atrasada;
    quem mexer nessa copy ou no filtro tem de manter as duas pontas coerentes

- `useHairTreatmentData`: Processes hair services
  - Scoring: Treatments (2pts) + Unique clients/day (1pt) + Google Stars (3pts each)
  - Filters by professionals in "Cabelo" category
  - Treatment detection: `category === "Tratamentos para Cabelo"`

- `useManicurePedicureData`: Processes nail services
  - Scoring: SPA dos Pés (2pts) + Unique clients/day (1pt) + Google Stars (3pts each)
  - Filters by professionals in "Unhas" category
  - SPA detection: `service_name === "SPA dos Pés"`

- `useEsteticaData`: Processes aesthetics services
  - Scoring: Revenue-based (% of R$5,000 goal)
  - NO point-based scoring - ranks by revenue percentage
  - Google Stars: display-only, don't count toward score

- `useMaquiagemData`: Processes makeup services
  - Scoring: 1 point per service (no deduplication)
  - Google Stars: display-only, don't count toward score
  - Prize qualification: minimum 25 services

- `useProfessionalDetails`: Gets detailed professional information
  - Fetches individual professional's service details
  - Applies same scoring rules as category hooks
  - Used for modal display when clicking on professional

## Supabase Integration

### Database Configuration
- **Project ID**: Defined in `.env` as `VITE_SUPABASE_URL` (extract ref from URL)
- **URL**: Defined in `.env` as `VITE_SUPABASE_URL`
- **Client**: TypeScript client in `/src/integrations/supabase/client.ts` (reads from env vars)

### Database Schema
- **Tables**:
  - `trinks_services` - Stores service data from Trinks system
    - `id`: Primary key (BIGINT)
    - `service_date`: Date of service (TEXT `'DD/MM/YYYY'`, NOT DATE) - compare with `to_char(dia, 'DD/MM/YYYY')`
    - `professional`: Professional name (TEXT)
    - `service_name`: Name of service (TEXT)
    - `category`: Service category (TEXT) - used only for specific service detection
    - `client_name`: Client name (TEXT, nullable)
    - `value`: Service value (NUMERIC) - used only for Estética revenue calculation
    - `created_at`: Timestamp
    - `profissionalid`: TEXT (nullable) - matches profissionais_ativos.profissionalId
    - `clienteid`: TEXT - id da cliente no Trinks (comparado de forma numerica com `avaliacoes_cadastradas.cliente_trinks_id`)
    - Indexes on: service_date, professional, category

  - `profissionais_ativos` - Professional registry and categories
    - `profissionalId`: Primary key (INTEGER)
    - `nome_profissional`: Professional name (TEXT)
    - `categoria`: Category assignment (TEXT) - "Cabelo", "Unhas", "Estetica", "Maquiagem"
    - `apelido`: Short display name (TEXT, nullable) - used by the Aniversariantes page
    - `ativo`: Active flag (BOOLEAN, default true)
    - `dia_aniversario`: Birthday day 1-31 (SMALLINT, nullable)
    - `mes_aniversario`: Birthday month 1-12 (SMALLINT, nullable) - birth year is NOT stored, for privacy
    - `email`: TEXT, nullable, UNICO (indice parcial em `lower(email)`), CHECK normalizado (`lower(btrim)`) e so ASCII imprimivel com um `@`. Sera a chave do vinculo login -> profissional. Preenchido pelo webhook Trinks (eventos 5/6, campo `Email`; abrir e fechar o cadastro no Trinks dispara o evento 6) **so quando NULL**: divergente ou ja de outra profissional vira alerta em `automation_logs`, nunca sobrescrita. `GET /v1/profissionais` NAO traz e-mail
    - `trinks_id_profissional`: BIGINT, nullable, UNICO. Id na REDE Trinks (espaco P) = `IdDoProfissional` do webhook = `idProfissional` da API = `id_pessoa` de `trinks_profissional_id_map`. NAO e `IdPessoaDoProfissional`. A PK `profissionalId` e o espaco E. Backfill do mapa + webhook (so quando NULL, fora de quarentena)
    - As duas colunas: migracao `20261020120000_profissionais_ativos_email_id_rede.sql` (rollback autossuficiente no cabecalho); `anon` nao le nenhuma
    - `created_at`: Timestamp
    - **IMPORTANT**: Professional category comes from THIS table, NOT from trinks_services.category
    - **IMPORTANT**: Birthdays live HERE. The legacy `aniversarios` table was dropped (see below)

  - `avaliacoes_cadastradas` - Google Stars reviews
    - `id`: Primary key (UUID)
    - `profissional_id`: Foreign key to profissionais_ativos (INTEGER)
    - `nome_profissional`: Professional name snapshot (TEXT)
    - `nome_cliente`: Nome da cliente **no Google** (TEXT, NOT NULL) - chave da deteccao de duplicata
    - `nome_cliente_trinks`: Nome da cliente no Trinks (TEXT, nullable)
    - `cliente_trinks_id`: Id da cliente no Trinks (BIGINT, nullable; quando preenchido, > 0; NULL quando `origem_cliente_trinks = 'digitado'`)
    - `data_atendimento`: Dia do atendimento informado no cadastro (DATE, nullable)
    - `origem_cliente_trinks`: 'lista' (escolhida na lista do dia) | 'digitado' (TEXT, nullable)
    - Colunas novas (`nome_cliente_trinks`, `cliente_trinks_id`, `data_atendimento`, `origem_cliente_trinks`) sao todas nullable: legado = NULL. Bundle antigo continua inserindo so `nome_cliente`
    - Checks: `avaliacoes_origem_cliente_trinks_chk`, `avaliacoes_digitado_sem_cliente_id_chk` (digitado => id NULL), `avaliacoes_cliente_trinks_id_positivo_chk`. Migracao `supabase/migrations/20261019120000_avaliacoes_cliente_trinks.sql`
    - `status`: Review status (TEXT) - 'pendente', 'aprovada', 'rejeitada'
    - `data_hora_cadastro`: Review registration timestamp (TIMESTAMPTZ) - used for date filtering. Default `now()`.
      **Regra de INSERT no banco** (trigger `avaliacoes_cadastradas_antes_inserir`, migracao `20261019130000_avaliacoes_regra_cadastro.sql`, so para `anon`/`authenticated`): `data_hora_cadastro` e `created_at` viram `now()` (o relogio do celular e ignorado); `data_atendimento` fora de hoje−10..hoje (Manaus) = erro 22023; `cliente_trinks_id` sem linha no espelho (profissional + dia + clienteid) vira NULL. `postgres`/`service_role` ficam livres. Sem trigger de UPDATE
    - `aprovado_por`: Admin UID who approved (UUID, nullable)
    - `data_aprovacao`: Approval timestamp (TIMESTAMPTZ, nullable)
    - `motivo_recusa`: Motivo da recusa (TEXT, nullable, <= 500; so em `rejeitada`; legado = NULL). Obrigatorio ao recusar (trigger `avaliacoes_cadastradas_antes_atualizar`, 23514); NAO legivel por anon/authenticated — ver "Aba Aprovacoes"
    - `created_at`: Timestamp
    - **Only approved reviews** (`status = 'aprovada'` AND `data_aprovacao IS NOT NULL`) count toward scores

  - `automation_logs` - Logs for automation runs
    - `id`: Primary key (BIGINT)
    - `message`: Log message (TEXT)
    - `is_error`: Error flag (BOOLEAN)
    - `created_at`: Timestamp
    - Index on: created_at

  - `aniversarios` - **REMOVED** (dropped 2026-07-25)
    - Birthday data lives in `profissionais_ativos.dia_aniversario` / `.mes_aniversario`
    - Migrated by `20260725_move_aniversarios_to_profissionais_ativos.sql`, then dropped by
      `20260725111653_drop_deprecated_aniversarios.sql`. Do not recreate it
    - Professionals that existed here but not in `profissionais_ativos` were intentionally
      discarded — `profissionais_ativos` is the source of truth for the Studio X roster.
      Their dates remain versioned in the seed of `20260222_create_aniversarios.sql`

### Business Rules & Scoring System

**CRITICAL**: Professional categories are determined by `profissionais_ativos.categoria`, NOT by `trinks_services.category`. The service category field is only used to detect specific service types (e.g., "Tratamentos para Cabelo").

#### Category Scoring Rules

**Note**: The numbered rules below (1-4) describe the rules through July 2026. Starting
August 2026, the "Versionamento de Regras (V4 — Agosto/2026)" subsection further down
governs instead — see it for what's actually live. Months before August 2026 are still
viewable in the app and are scored by the rules described here.

1. **Cabelo (Hair)** - Prize: R$300, Goal: 60 unique clients
   - Treatments: 2 points each (`category === "Tratamentos para Cabelo"`)
   - Unique client/day: 1 point each (ALL services, deduplicated by `clientName + date`)
   - Google Stars: 3 points each (approved reviews)

2. **Unhas (Nails)** - Prize: R$200, Goal: 50 unique clients
   - SPA dos Pés: 2 points each (`service_name === "SPA dos Pés"`)
   - Unique client/day: 1 point each (ALL services, deduplicated by `clientName + date`)
   - Google Stars: 3 points each (approved reviews)

3. **Estética (Aesthetics)** - Prize: R$200, Goal: R$5,000 revenue
   - NO point-based scoring
   - Ranking by revenue percentage: `(totalRevenue / 5000) * 100`
   - Google Stars: displayed but DON'T count toward score
   - Monetary values: NOT displayed in UI (only percentages)

4. **Maquiagem (Makeup)** - Prize: R$200, Goal: 25 services
   - 1 point per service (no deduplication)
   - Google Stars: displayed but DON'T count toward score

#### Versionamento de Regras (V4 — Agosto/2026)

A partir de agosto/2026, a deteccao do servico especial e **configuravel por regra**
via `CategoryRules.specialServiceMatch` (`exact` | `prefix` | `category`), resolvida
por `matchesSpecialService()` em `src/lib/scoring.ts`. Quando o campo esta ausente,
vale o fallback legado: Cabelo por `category === "Tratamentos para Cabelo"`, Unhas por
`service_name === "SPA dos Pés"`. Comparacao sempre com trim e case-insensitive.

O calculo do modelo `points` (servico especial + cliente unico/dia + estrelas) vive em
`computePointsRanking()`, compartilhado por Cabelo, Unhas e Estetica. `useProfessionalDetails`
continua reimplementando o scoring — mudancas de regra seguem exigindo alteracao nos dois lugares.

`CategoryRules.enabled = false` remove a categoria do desafio no periodo (abas, graficos e
painel de premiacao), via `isCategoryActive()` em `src/lib/categoryDisplayNames.ts`.
Componentes que listam categorias precisam consultar essa funcao — nao a constante estatica
`ENABLED_PROF_CATEGORIES`, que nao varia por mes.

**V4 (ago/2026):** Cabelo 5 pts por `Cronograma Capilar [pacote]`; Unhas 3 pts por SPA dos Pes;
Estetica migra para `points` com 3 pts por `Limpeza de Pele*`; volume de atendimento vale 2 pts
nas tres; estrelas valem 3 pts e contam em todas; Maquiagem fora do desafio.

#### Marcas autorizadas versionadas por mes (`profissional_fabricante.valid_from`)

Quando `manufacturerConstraints` esta ligado (V2/V3 mar–mai/2026, V5 out/2026), as marcas de cada
profissional vem de `profissional_fabricante`, **versionada como `regras_desafio`**: versao = conjunto
inteiro de linhas com o mesmo `valid_from` ('YYYY-MM'); o mes M usa a versao com o maior
`valid_from <= M`, sem merge; sem versao <= M, nenhuma marca autorizada. Resolucao em
`src/lib/marcasPorMes.ts`, pelo mes do `startDate` do filtro (o mesmo das regras) dentro de
`useManufacturerData`. Filtro `custom` usa a versao do mes do `startDate`, exatamente como as regras.
As linhas anteriores ao versionamento ficaram em `'2000-01'`; a coluna **nao tem default** — todo
INSERT informa `valid_from`. No admin, editar uma versao muda TODOS os meses que ela cobre (o seletor
abre na vigente; mexer em versao que cobre mes encerrado pede confirmacao; "Sincronizar" nunca remove
em versao passada nem esvazia uma versao) — para mudar so a partir de um mes, use "Nova versao".
Se a leitura das marcas falhar com a regra ligada, o ranking de Cabelo e suprimido com aviso
(`cabeloIndisponivel`), nunca exibido com tudo reprovado. `tratamento_fabricante` NAO e versionada.

#### Bônus Estrelas (out/2026)

Extra em R$ por estrela Google aprovada, **separado do ranking e da pontuação** (não mexe em
pontos nem no `PremiacaoPanel`). Seção na home, logo abaixo de "Minha Meta + Corrida" e acima
do `DataRankings`: `src/components/resultados/BonusEstrelas.tsx` (renderizado via
`renderAbaixo` de `ResultadosSection`, que **compartilha a identidade local e o seletor
"Quem é você?"** — não crie outra identidade).

- **Config**: `CategoryRules.starBonusValue?: number` (R$ por estrela; ausente/0 = sem bônus),
  vindo do JSONB de `regras_desafio` por categoria (sem migração). Editável na aba Regras do
  `/admin` ("Bônus por estrela aprovada (R$)"); o editor espalha o objeto da categoria, então
  o campo sobrevive ao salvar. `RegrasDoDesafio` mostra a linha "Bônus extra" por categoria.
  A seção inteira só aparece se alguma categoria **ativa** do mês tiver `starBonusValue > 0`
  **ou** o mês tiver `star_bonus_extra` válido (ver "Profissionais só do bônus" abaixo).
- **Elegibilidade** (`src/lib/bonusEstrelas.ts`, testes em `bonusEstrelas.test.ts`): profissional
  em `profissionais_ativos` com `ativo !== false`, `categoria` não nula, categoria ativa no mês
  (`isCategoryActive`) e bônus > 0. O valor de cada um é o `starBonusValue` da categoria dele.
  Exceção: os ids de `star_bonus_extra` (abaixo), que entram mesmo sem categoria.
- **Mês de atribuição = mês do `data_hora_cadastro`** (Manaus), o mesmo critério de
  `useStarsData`: as aprovadas vêm de `starsData` (exposto por `useDashboardData`); as pendentes,
  de `useEstrelasPendentes` (RPC `destaque_estrelas_periodo`, as `pendente`; recorte no servidor
  `[p_inicio, p_fim)`, uma vez por período; mesma validação e mesmo teto de 1000 linhas do
  `useStarsData`, que viram erro).
- **Ranking por valor em R$** (desempate: estrelas, depois nome; posição por valor). A seção
  fica oculta no filtro `custom` (só mês atual/anterior). Se `useStarsData` falhar (`error`), a
  seção mostra aviso de erro, nunca "R$ 0,00". Mutações da aba Aprovações invalidam
  `["bonus_estrelas"]` para as pendentes não ficarem velhas.
- **Nunca mostrar soma/total da equipe**, só valores individuais. Sem botão "Atualizar":
  carrega ao abrir/recarregar a página, como o resto do app.
- **Profissionais só do bônus** (`regras_desafio.star_bonus_extra jsonb`, migração
  `20261011120000_regras_desafio_star_bonus_extra.sql`): `{"valuePerStar": 5,
  "profissionalIds": [648177, 783999]}`, versionada com a regra do mês (mesma resolução por
  `valid_from`); NULL = ninguém. Mapeada para `RulesVersion.starBonusExtra` em `useRulesData` e
  **validada no consumo** por `extrasDoBonus()` (valor arredondado em centavos, > 0 e
  <= R$ 1.000; ids inteiros > 0; forma inválida = ignorada). Quem está na lista, ativo
  (`ativo !== false`) e **sem categoria ativa no mês** (nula, desconhecida ou desativada) entra
  no bônus com esse valor. Quem tem categoria ATIVA segue SEMPRE a regra da categoria, mesmo
  listado nos extras: com `starBonusValue` 0/ausente, fica sem bônus. Nunca entra em ranking,
  pontos, `PremiacaoPanel` nem metas.
  - Valores em R$ (`starBonusValue` e `valuePerStar`): centavos (2 casas) e teto
    `TETO_VALOR_POR_ESTRELA` = R$ 1.000, no consumo (`valorPorEstrelaValido`: acima = ignorado)
    e no editor (arredonda ao salvar; acima = erro de validação).
  - Estrelas: `useStarsData` expõe `starsData.semCategoria` (aprovadas de quem não está numa das
    quatro categorias). O scoring **nunca** lê esse mapa; só o `BonusEstrelas` o soma. As
    pendentes (`useEstrelasPendentes`) já contam por id, sem filtro de categoria.
  - Tela: no ranking do bônus aparecem misturados, com o rótulo neutro "Bônus Estrelas" no lugar
    da categoria; contam em "Mais N profissionais ainda sem estrela". No "Quem é você?" ficam no
    grupo "Bônus Estrelas" (`participaSoDoBonus`/`profissionaisSoDoBonus`); o `MeuCartao` mostra
    só "Você participa só do Bônus Estrelas neste mês." (sem metas/posição). `RegrasDoDesafio`
    ganha a linha "X e Y participam só do Bônus Estrelas (R$ …)" (`fraseSoDoBonus`).
  - Cadastro de avaliação (`CadastrarAvaliacaoModal`) e `/minhas-avaliacoes` listam quem é só do
    bônus no mês atual (ver "Listas de selecao de profissional nas paginas publicas", abaixo).
  - Admin: o editor de regras tem a seção "Bônus Estrelas — sem categoria" (valor + quem
    participa). `useAdminRules` só envia `star_bonus_extra` quando o form o inclui. Na
    **edição**, só se o admin mexeu na seção (inclusive para limpar): um valor cru inválido no
    banco nunca é reescrito/apagado sem ação explícita, e a seção avisa quando ele é inválido
    (`extrasBrutoInvalido`). Criar/duplicar envia quando há extras (duplicar copia os válidos).

#### Listas de selecao de profissional nas paginas publicas

"Quem e voce?" (`ProfileSelector`), cadastro de estrela (`CadastrarAvaliacaoModal`) e
`/minhas-avaliacoes` mostram so quem aparece no desafio do mes **ou** participa so do Bonus
Estrelas. Regra unica: `profissionaisSelecionaveis(ativos, rules)` em
`src/lib/profissionaisSelecionaveis.ts` (testes ao lado). Entra: `ativo !== false` E categoria
(trim) de `PROF_CATEGORIES` ATIVA no mes (`isCategoryActive`), OU `participaSoDoBonus`
(`star_bonus_extra` validado). Saem inativos e ativos sem categoria fora dos extras; categoria
desligada no mes (Maquiagem desde ago/2026) sai, salvo se estiver nos extras. **Fallback**: com
`rules` null (regras do mes indisponiveis) vale so o filtro estatico — ativos com categoria de
`PROF_CATEGORIES`, sem extras; a lista nunca fica vazia por regras nao carregadas. Regras usadas:
nas tres listas, as do **mes atual em Manaus**, nao as do filtro do dashboard
(`useRegrasDoMesAtual` / `useProfissionaisSelecionaveis` em `src/hooks/useProfissionaisSelecionaveis.ts`,
que devolvem `rules` null se `regras_desafio` veio vazia; o segundo expoe `regrasCarregando`). A
identidade do "Quem e voce?" vale para todos os periodos, entao olhar um mes passado nao pode
esconder quem participa hoje; enquanto as regras do mes atual nao chegam, o `ProfileSelector` usa
as do periodo. `MeuCartao` e `BonusEstrelas` seguem com as regras do PERIODO: quem e so do bonus
hoje e se escolhe olhando um mes sem `star_bonus_extra` ve "ainda nao tem uma categoria" e nenhuma
secao de bonus — correto para aquele mes. O perfil ja salvo em `localStorage` continua validado
contra o cadastro inteiro (`usePerfilLocal`): sair da lista nao apaga a identidade. Nao se aplica ao `/admin` (a `StarBonusExtraFields` lista gente sem
categoria de proposito).

#### Inativos fora do ranking (out/2026)

Profissional com `profissionais_ativos.ativo === false` **nao aparece em ranking, premiacao nem
pontuacao em NENHUM mes**, inclusive os encerrados (decisao do dono: ago/set deixam de mostrar
quem foi desativado). `ativo` null/ausente conta como ativo (`ativo !== false`, mesma convencao de
`bonusEstrelas.ts` e `profissionaisSelecionaveis.ts`). A regra vive em `src/lib/rankingProfissionais.ts`
(`participaDoRanking`, `profissionaisDaCategoria`) e e aplicada nas DUAS fontes do scoring: a lista da
categoria (`getProfessionalsByCategory` em `useActiveProfessionals` — os hooks de categoria so pegam
servicos cujo `profissionalid` esta nela) e o mapa de estrelas (`agruparEstrelasPorCategoria` em
`src/lib/estrelasPorCategoria.ts`, usado por `useStarsData`; estrela de inativo nao entra nem em
`semCategoria`). `computePointsRanking` cria linha para qualquer id de servico/estrela que receber,
entao novas fontes de dados do ranking precisam passar por esses dois filtros. O `activeProfessionals`
bruto continua com o cadastro inteiro (perfil local, mensagem de inativo do Bonus Estrelas, admin).
Perfil salvo de inativo: o `MeuCartao` mostra "Seu cadastro está inativo e não participa do desafio."
(sem metas), em vez de "sem atendimentos".
Testes: `src/lib/rankingProfissionais.test.ts`.

#### Key Components

- `PremiacaoPanel`: Prize qualification panel showing leaders and prize status per category
- `ProfessionalModal`: Detailed breakdown when clicking on a professional
- `DataRankings`: Main ranking display with category tabs
- `AvaliacoesManager` (`src/components/admin/`): aba "Aprovacoes" do `/admin` — fila de estrelas
  pendentes + historico. Regras completas na secao de auth-kit, mais abaixo
- `ResultadosSection` (`src/components/resultados/`): mobile-first "Minha Meta + Corrida" section
  that replaced the old line charts. Identidade local (sem login) por `localStorage`
  (`destaque.perfil.v1`, ver `src/lib/perfilLocal.ts` + `usePerfilLocal`), sempre reversivel
  pelo botao "Trocar" / "limpar".
  - `MeuCartao`: cartao pessoal (pontos, metas de `src/lib/metaProgress.ts`, projecao de ritmo,
    posicao). `CorridaChart`: barras horizontais por categoria em HTML/CSS (sem Recharts).
    `ProfileSelector`: sheet "Quem e voce?". `MinhaSemana`: blocos seg-sab do periodo
    (`src/lib/semana.ts`). `CardCompartilhavel`: PNG 1080x1080 desenhado em canvas
    (`src/lib/shareCard.ts`), Web Share API com fallback de download.
  - Nenhum deles consulta o banco: recebem os MESMOS datasets ja rankeados que alimentam o
    `DataRankings`, entao os numeros batem entre as duas secoes.
  - O card compartilhavel so mostra numeros de quem o gerou (spec §4.5) e sai SEMPRE no tema
    claro — `shareCard.ts` le as variaveis CSS da marca com a classe `.dark` suspensa.

### Ingestao de `trinks_services` (n8n, server-side)

Desde 29/07/2026 a tabela e alimentada exclusivamente por workflows n8n que sincronizam da
API Trinks via RPCs no Postgres (`trinks_sync_executar` / `trinks_apply_snapshot`). Detalhes,
gates e cota em `docs/trinks-automacao/RELATORIO-IMPLANTACAO.md` e `HANDOFF.md`.
O app **so le** essa tabela.

### Edge Functions
- **daily-trinks-automation**: **obsoleta e sem chamador.** Era o processador da era do
  upload de CSV: lia `trinks_services` inteira, normalizava datas e reescrevia tudo. Hoje
  isso conflita com a reconciliacao do n8n e estoura o limite do worker (546 apos ~40s).
  Nenhum caller restante: nao ha pg_cron, nao ha workflow n8n e o app parou de invoca-la.
  Mantida deployada apenas como historico — **nao chame**. Seu `enableRealtime()` sempre foi
  um no-op (so grava linhas em `automation_logs`; nunca alterou a publication)
- **destaque-auth-admin**: **unica detentora do `service_role` deste app.** Toda mutacao de
  `destaque_users_app`/`destaque_perfis` passa por ela (o SQL do kit revoga escrita de
  `authenticated`). `verify_jwt: true`. O nome do diretorio de deploy **tem** que ser
  `supabase/functions/destaque-auth-admin/` — diretorio diferente = 404 em producao.
  Secret proprio: `SITE_URL` (URL COMPLETA de destino do convite, ver secao de auth)
- **create-user**: criacao de usuarios pelo painel admin
- Demais funcoes (`f360-*`, `calcular-faturamento-profissional`, `consultar-faturamento`,
  `gerar-comprovante-das`) pertencem ao projeto financeiro, nao a este app

## Autenticacao e Permissoes (auth-kit v0.1.0)

Desde 2026-08-01 o app usa o **studiox-auth-kit** (modelo copy-in, estilo shadcn: o codigo
instalado **pertence a este repo**; nao ha dependencia de runtime com o kit). Config em
`auth-kit.config.json` na raiz — e ele que descreve prefixo, sabor e o **registry de paginas**.

### A pagina publica NAO tem auth — isso e requisito de produto, nao acidente

`/`, `/aniversariantes` e `/minhas-avaliacoes` sao **100% publicas** e nao passam por auth
nenhum. O `AuthProvider` do kit e montado **so na subarvore `/admin`** (`src/App.tsx`) —
**nao mova esse provider para fora do `<Routes>`**, e nao envolva as rotas publicas com
`RequirePage`. O cadastro publico de avaliacao (modal em `/`) insere como `anon` por design.

### Rotas gateadas

| Rota | Guard | Renderiza |
|---|---|---|
| `/admin` | `RequirePage chave="admin"` | `AdminPanel` (Aprovacoes / Regras / Fabricantes / Feriados) |
| `/admin/usuarios` | `RequirePage chave="usuarios"` (dentro de `@/pages/Usuarios`) | tela de usuarios/perfis do kit |

- **Login e magic link** (`@/pages/Login`), com `shouldCreateUser: false` — login **nunca**
  cadastra; cadastro e ato de admin, pela tela de usuarios.
- O `AuthContext` antigo (lista `ADMIN_EMAILS` hardcoded + `signInWithPassword`) e o
  `AdminRouteGuard` foram **removidos**. Nao os recrie: quem decide acesso agora e a matriz
  de paginas em `destaque_perfis`.
- Controles de escrita do painel ficam dentro de `RequireWrite chave="admin"` — isso e **UX**;
  o gate real e a RLS (abaixo).

### Aba "Aprovacoes" (fila de estrelas do Google)

`src/components/admin/AvaliacoesManager.tsx` (fila) + `HistoricoDecisoes.tsx` (historico) +
`AvaliacoesUI.tsx` (pecas comuns) + `src/hooks/useAdminAvaliacoes.ts`. Portada em
2026-08-01 do app `ranking_por_categoria-estrela_google` (era a rota `/admin/painel-aprovacao`
la); antes disso o dono aprovava por SQL manual. **E a aba padrao** do `AdminPanel` — as
outras tres sao configuracao, esta e a tarefa diaria. A `TabsList` mostra o numero de
pendentes; o contador vem de `useAvaliacoesPendentes()`, que compartilha a queryKey
`["admin_avaliacoes","pendentes"]` com o manager (uma requisicao para os dois).

**Historico de decisoes** (`useHistoricoAvaliacoes`, desde 2026-08-03): recortado por
periodo — mes atual (padrao), mes anterior, hoje, ontem, semana passada (seg-dom) ou
intervalo livre — resolvido por `resolverPeriodo()` em `src/lib/periodoHistorico.ts` (fuso
Manaus, offset fixo -04:00, fim EXCLUSIVO). Pontos que nao podem ser afrouxados:

- O recorte roda **no servidor** (`.gte`/`.lt`) e por **`data_hora_cadastro`** — a data que
  define em que mes a estrela pontua. Filtrar no cliente esconderia meses inteiros atras do
  teto de linhas (mes de pico ja teve 200 decisoes; o teto e `HISTORICO_LIMITE = 500` e a
  tela avisa quando bate nele). Consequencia visivel e correta: "Ontem" pode vir vazio
  mesmo tendo havido decisoes ontem, se as avaliacoes forem de outro dia.
- Cada periodo e uma **entrada de cache propria**
  (`["admin_avaliacoes","historico",<inicioISO>,<fimISO>]`), entao a remocao otimista opera
  por **prefixo** de chave (`src/lib/avaliacoesCache.ts`, com teste em `avaliacoesCache.test.ts`).
  Voltar a usar chave exata quebra o "Devolver para a fila" em silencio: a linha so sumiria
  no refetch.
- Filtros de profissional/busca/ordenacao e as abas Todas/Aprovadas/Recusadas sao
  client-side, sobre o periodo ja carregado. A lista de profissionais sai do periodo INTEIRO
  (antes dos demais filtros), senao escolher um esvaziaria as opcoes dos outros.

Regras que **nao** podem ser afrouxadas ao mexer aqui:

- **Aprovar escreve os tres campos juntos**: `status='aprovada'`, `aprovado_por = auth.uid()`
  (o `acesso.userId` do kit — nunca um UID fixo no bundle, como era na origem) e
  `data_aprovacao = now()`. O score so conta `status='aprovada' AND data_aprovacao IS NOT NULL`
  (`useStarsData`); gravar so o status daria uma estrela que nao pontua.
- **Recusar nunca apaga**: vira `status='rejeitada'`. A tabela **nao tem policy de DELETE** —
  o painel de origem tambem nao deletava, e nao ha o que "adaptar" aqui: nao adicione delete.
- **Desfazer** ("Devolver para a fila", so no historico, com confirmacao) zera
  `aprovado_por`/`data_aprovacao` junto com o status — e o mesmo invariante que a policy de
  INSERT publico exige de uma pendente.
- Toda mutacao confere as linhas escritas (`.select("id")`): um UPDATE barrado pela RLS volta
  **sem erro e com zero linhas**, e sem essa conferencia a tela diria "salvo" sem ter salvado.
- Datas sempre por `formatDataHoraManaus` (`src/lib/dateUtils.ts`), fuso `America/Manaus`.
- Aprovar **muda o ranking ao vivo** (3 pts), **no mes do `data_hora_cadastro`** — ver
  `useStarsData` acima. Decidir uma pendente atrasada mexe em mes fechado, entao ela nunca
  passa sem confirmacao (individual) e o lote conta quantas sao. Ao testar, use transacao com
  `ROLLBACK` — nunca decida uma pendente real para "ver funcionando".
- **Recusar exige motivo** (`avaliacoes_cadastradas.motivo_recusa`, ate 500 caracteres; migracao
  propria em `supabase/migrations/`). O dialogo de recusa (`ConfirmacaoDialog` com `motivo`, em
  `AvaliacoesUI.tsx`) abre SEMPRE, inclusive na recusa individual, e deixa o botao desabilitado com o
  motivo (trim) vazio; regras puras em `src/lib/motivoRecusa.ts`. No lote ("Recusar selecionadas") e
  **um texto so**, gravado em todas as selecionadas. O banco garante: `rejeitada` sem motivo =
  erro 23514 ("Informe o motivo da recusa."), mostrado no toast como os demais erros. Nao adicione
  recusa sem motivo, nem "motivo padrao" gerado pelo front.
- **Editar motivo** (historico, so recusadas, dentro de `RequireWrite chave="admin"`): UPDATE de
  `motivo_recusa` com `.eq("status","rejeitada")` + `.select("id")` conferido (`editarMotivo` em
  `useHistoricoAvaliacoes`); zero linhas = a estrela deixou de estar recusada. O botao so aparece com o
  motivo atual ja lido, e o clique refaz a leitura pela RPC e so mostra o campo depois dela (cache
  velho nao pode sobrescrever edicao de outro admin). Os dialogos com motivo ficam abertos, com o
  texto, ate a gravacao dar certo; o botao fica desabilitado durante o envio.
- **Aprovar e recusar so atingem quem ainda esta pendente** (`.eq("status","pendente")` no UPDATE de
  `decidir`): uma decisao tomada por outro admin com o dialogo aberto nao e sobrescrita. Zero linhas
  cai no `conferirLinhasEscritas`, com mensagem que cobre as duas causas (decidida por outra pessoa
  ou sem permissao de escrita). Se o lote gravou so PARTE (`DecisaoParcialError`, em
  `avaliacoesAdmin.ts`), o dialogo fecha, TODOS os ids do lote saem da selecao (nenhum segue pendente; um devolvido a fila
  por outra pessoa nao pode reaparecer ja marcado), o snapshot otimista NAO e restaurado e o toast diz as contagens.
- **`motivo_recusa` NAO e legivel por SELECT** para `anon` nem `authenticated`: nunca ponha a coluna em
  `.select(...)` nem use `select("*")` em `avaliacoes_cadastradas` (42501 derruba a fila inteira) — por
  isso `COLUNAS` em `useAdminAvaliacoes` nao a tem. A leitura e so pela RPC
  `avaliacoes_motivos_recusa(p_ids)` (gate `destaque_can_read_page('admin')`, so linhas
  `rejeitada`, ate 500 ids), consumida por `useMotivosRecusa` (chave
  `["admin_avaliacoes","motivos",...ids]`, fora dos prefixos de remocao otimista e invalidada pelas
  mutacoes). Falha da RPC mostra aviso discreto na linha, **nunca** "Sem motivo registrado" (que e
  so recusa legada, `motivo_recusa` NULL). A busca do historico tambem casa no texto do motivo
  (`casaBuscaHistorico`).
- **Devolver para a fila e aprovar zeram o motivo**: o banco limpa `motivo_recusa` sozinho, e o front nao
  o envia nesses dois UPDATEs. Aprovar nao tem motivo.
- **`/minhas-avaliacoes` mostra o motivo** (rotulo "Motivo da recusa", so nas recusadas; legado NULL =
  "Sem motivo registrado"), lido pela RPC `destaque_minhas_avaliacoes` (`useMinhasAvaliacoes`), nao
  pela tabela. Quem ve o que (`modoMinhasAvaliacoes` em `src/lib/identidade.ts`): `estrelas: none` nao
  chama a RPC e ve "Seu perfil nao inclui a lista de avaliacoes."; `write` tem o seletor livre; `read`
  so a propria profissional, e sem vinculo utilizavel (sem ligacao, erro na RPC do vinculo ou
  profissional inativa) fica bloqueada, sem seletor e sem RPC, so com a mensagem do `motivoBloqueio`.
  As estrelas do painel (`useStarsData`, `useEstrelasPendentes`) vem da RPC `destaque_estrelas_periodo`
  (filtros em `src/lib/estrelasRpc.ts`); conferencia em
  `supabase/verificacoes/login_contagem_estrelas.sql`.

**Cliente no Trinks no cadastro e nos sinais da fila** (migracoes `20261019120000_avaliacoes_cliente_trinks.sql`, `20261019120100_avaliacoes_sinais.sql`, `20261019180000_avaliacoes_sinais_duplicata_trinks.sql` e `20261019190000_avaliacoes_sinais_mesma_cliente_trinks.sql`):

- **Cadastro** (`CadastrarAvaliacaoModal`, modal em `/`): profissional → dia → cliente no Trinks, escolhida na lista do dia ou "Nao encontrei" (cai para digitacao). Depois, o nome no Google, com "Mesmo nome do Trinks" desmarcada por padrao. Erro ou lista vazia tambem caem para digitacao. Front: `src/lib/clienteTrinks.ts` (dias permitidos, rotulos, `montarInsertAvaliacao`, `estadoDaLista`), `src/hooks/useClientesDoDia.ts`, `src/components/avaliacoes/ClienteTrinksPicker.tsx`. Historico e `/minhas-avaliacoes` mostram os dois nomes, sem selos.
- **Regra no banco** (`20261019130000_avaliacoes_regra_cadastro.sql`, verificacao em `supabase/verificacoes/avaliacoes_regra_cadastro.sql`): o INSERT publico nao escolhe mais a data do cadastro (vira `now()`), nao grava dia de atendimento fora de hoje−10..hoje (22023; o modal mostra a mensagem do banco) e so guarda `cliente_trinks_id` confirmado pelo espelho naquele dia/profissional — senao NULL, com a origem mantida. Assim os sinais "Atendida?" nao se forjam por INSERT direto. O bundle ainda envia `data_hora_cadastro`, que e sobrescrito.
- **`avaliacao_clientes_do_dia(p_profissional_id, p_data)`** (`security definer`, `search_path` vazio, execute para `anon`/`authenticated`): clientes atendidas pela profissional, em janela de 10 dias ate hoje (fuso Manaus; data fora = erro 22023). Fontes: espelho `trinks_services` e, so para hoje, `"gerencia-fila-trinks-appointments"` com status Trinks `em atendimento` ou `finalizado`. Cliente que so existe na fila entra com id NULL (o espaco de id de cliente da fila nao foi verificado) e se funde a do espelho pelo nome normalizado (`avaliacao_normalizar_nome`). Retorna `fonte` = `espelho` | `fila`. Nao depende das permissoes das tabelas da fila.
- **`avaliacoes_sinais(p_ids uuid[])`** (`security invoker`, `search_path` vazio, EXECUTE para `authenticated` e `service_role` — `anon`/`public` revogados; maximo 300 ids = erro 22023; ate 5 duplicatas por estrela, a fila mostra "5+" no teto): consumido por `useSinaisAvaliacoes` (chave `["admin_avaliacoes","sinais",...]`, fora dos prefixos de remocao otimista `pendentes`/`historico`, invalidada pelas mutacoes) e exibido em `src/components/admin/SinaisAvaliacao.tsx`. Dois sinais por estrela, sem bloquear aprovar nem recusar:
  - **"Atendida?"** (`atendida` | `provavel` | `aguardando_espelho` | `nao_encontrada`). Com `cliente_trinks_id`: `atendida` se ha linha do espelho com o mesmo `clienteid` (numerico) e `service_date` igual a `data_atendimento`, dentro de [dia do cadastro − 10, min(dia do cadastro, hoje)]. Sem id (digitada ou legado): compara o nome do Trinks (ou o do Google, se legado) normalizado com as clientes da profissional na janela (trava de 30 dias): igual → `atendida`; similaridade ≥ 0,6 → `provavel` (alvo de uma palavra usa so `similarity`). `aguardando_espelho` so quando a data de referencia e entre ontem e hoje (comanda pode nao ter fechado).
  - **Duplicata** (criterio (1) desde `20261019120100_avaliacoes_sinais.sql`; (2) e (3) em `20261019180000_avaliacoes_sinais_duplicata_trinks.sql`; o (4) em `20261019190000_avaliacoes_sinais_mesma_cliente_trinks.sql`): compara a estrela com TODAS as outras (qualquer status, mes ou profissional). Quatro criterios; basta um. Os dois primeiros usam `nome_cliente` (Google) da alvo contra o Google da outra, normalizado: **(1) nome** — igual ou `similarity` ≥ 0,7; **(2) grafia** — `similarity` ≥ 0,7 entre as chaves de `avaliacao_chave_grafia` (sem `h`; `e/o/y/z/w/k` → `i/u/i/s/v/c`; letras repetidas colapsadas; pega Nivea/Nivia, Joice/Joyce, Andrea/Andreia). **(3) Trinks × Google** — o nome do **Trinks** da alvo (so quando `nome_cliente_trinks` e real; nunca o fallback para o Google do caminho "Atendida?") contra o nome do **Google** da outra, so nessa direcao: as palavras (`avaliacao_palavras_nome`: sem stopwords de anotacao do legado, comparadas ANTES da chave de grafia, entao "Dieylle"/"May"/"Nyla" sobrevivem; depois a chave; ≥ 3 letras) do nome mais curto tem de estar TODAS no outro, e ao menos uma palavra em comum e **rara** (≤ 3 nomes de cliente distintos em `trinks_services`). **(4) mesma cliente no Trinks** (`20261019190000_avaliacoes_sinais_mesma_cliente_trinks.sql`; Trinks × Trinks, o Google nao entra): com `cliente_trinks_id` nas duas, so o id vale para o (4) (ids diferentes = clientes diferentes para este criterio, mesmo com nome igual; os criterios (1)-(3) continuam valendo); se uma delas nao tem id, vale o nome do Trinks real das duas igual apos `avaliacao_normalizar_nome` (sem grafia nem similarity). Sem id, o (4) e so igualdade de nome: duas clientes homonimas tambem disparam o aviso (aceito: o dono confere no Google). Cobre duas profissionais que escolhem a mesma cliente e escrevem Googles diferentes; o dono confere no Google e decide qual aprovar. Nome do Google vazio da alvo desliga so (1) e (2); o (3) e o (4) seguem. Cada item do jsonb traz `motivo`, com precedencia `mesma_cliente_trinks` (4) > `nome_google` ((1) ou (2), inclusive quando o (3) tambem casou) > `nome_trinks` (so o (3)). Maximo 5, escolhidas por essa mesma forca e depois por recencia (uma mesma cliente antiga nao e cortada por candidatas mais novas e mais fracas); a lista sai por recencia. As stopwords e os limiares (0,7 de similarity e 3 de raridade) sao constantes DENTRO da migracao (funcao `avaliacao_palavras_nome` e corpo de `avaliacoes_sinais`): mudar exige nova migracao. A tela acrescenta (`rotuloMotivoDuplicata`) " · o nome do Google dela bate com o nome do Trinks desta estrela" no item `nome_trinks` e " · Mesma cliente no Trinks. Possível duplicata." no `mesma_cliente_trinks`; `motivo` e opcional no tipo, porque o app pode ir ao ar antes das migracoes.
- **Achado lateral (pendencia do projeto `gerenciador-fila-interna-V2`, nao deste repo)**: `"gerencia-fila-trinks-appointments"` e `"gerencia-fila-attendances"` dao a `anon` SELECT/INSERT/UPDATE/DELETE/TRUNCATE (policy ALL to public).

### Tabelas do kit e funcoes de gate

- `destaque_perfis` (matriz de paginas por perfil), `destaque_users_app` (quem tem acesso),
  `destaque_canario_log` (auditoria diaria via `pg_cron`, job `destaque_canario` 07:00 UTC).
- `destaque_can_read_page(variadic text[])` / `destaque_can_write_page(variadic text[])` —
  `SECURITY DEFINER`, fail-closed, semantica **OR** entre as chaves passadas.
- Perfis semeados: `Admin` (tudo `write`) e `Somente Leitura` (`admin: read`, `usuarios: none`).
- **`usuarios: write` = administrador total** (quem tem isso cria um admin com o proprio email).
- **Troca de admin e promover-depois-rebaixar**, sempre — o guard anti-lockout bloqueia a
  ordem inversa ja na primeira chamada.

### Policies das tabelas de negocio (padrao `docs/convencao-policies.md` do kit)

| Tabela | Leitura | Escrita |
|---|---|---|
| `regras_desafio`, `feriados`, `tratamento_fabricante`, `profissional_fabricante` | publica (`anon`) — o dashboard le sem sessao | `<tabela>_write_admin`: `for all to authenticated using ((select public.destaque_can_write_page('admin')))` |
| `avaliacoes_cadastradas` | `anon`/`authenticated`: privilegio de COLUNA em todas MENOS `motivo_recusa` (migracao `20261020130000_avaliacoes_motivo_recusa.sql`); `select('*')` da 42501, liste colunas; o motivo so pela RPC `avaliacoes_motivos_recusa` (admin). Coluna nova precisa entrar no grant | INSERT publico com `status='pendente'` (por design); UPDATE so com `destaque_can_write_page('admin')` |
| `trinks_services` | publica | fechada para `anon` (escrita revogada) |
| `profissionais_ativos` | `anon`: so as colunas `profissionalId`, `nome_profissional`, `categoria`, `apelido`, `ativo`, `dia_aniversario`, `mes_aniversario`, `created_at`, `updated_at` (privilegio de coluna, migracao `20261019160000_profissionais_ativos_colunas_anon.sql`); cpf, telefone, documento, cnpj, endereco e dados fiscais NAO. `select('*')` como anon da erro: liste colunas. `email` e `trinks_id_profissional` tambem NAO. `authenticated` ainda le tudo, inclusive `email` (pendencia do login) | fechada para `anon` (todos os grants de escrita revogados); NFS-e escreve via `service_role` |
| `automation_logs` | nenhuma (interna) | so `service_role`/`postgres` (n8n) |

Ao criar tabela nova: `enable` + `force row level security`, `revoke all ... from anon`, e
policies com o predicado embrulhado em `(select ...)` (InitPlan). Uma `create policy` numa
tabela sem RLS ligado e **inerte** e nao avisa nada.

### Security
- RLS (Row Level Security) enabled on all tables with public policies
- Uses anon key for client-side operations
- Service role key used in edge functions — no SPA ele existe **somente** dentro da
  `destaque-auth-admin`; nunca no bundle do cliente

## Date Filtering System

### DateFilterContext
The application uses a global date filtering context that supports:
- **Filter Types**:
  - `current-month`: **DEFAULT**, shows current month's data (1st day to last day)
  - `previous-month`: Shows previous month's data
  - `custom`: Custom date range selection

### Implementation
- Context provider wraps the entire dashboard
- All data hooks automatically apply the current filter
- Date ranges calculated dynamically based on current date
- Format: YYYY-MM-DD for database queries

## Important Patterns & Conventions

### Component Organization
- **Presentation Components**: In `/components/ui/` (don't modify - auto-generated)
- **Feature Components**: In `/components/` organized by feature
- **Container Components**: Handle data fetching and state management
- **Chart Components**: Receive processed data as props

### Data Flow Pattern
1. `DateFilterContext` provides global date range
2. `useActiveProfessionals` fetches professional registry and categories
3. `useStarsData` fetches Google Stars by category
4. `useServicesData` fetches ALL service records (no server-side filtering)
5. Category hooks (`useHairTreatmentData`, `useManicurePedicureData`, etc.) filter and score
6. `useDashboardData` orchestrates all data fetching and combines results
7. Components receive processed data via props
8. O fetch acontece uma vez no mount; nao ha re-fetch automatico nem realtime.
   `useDashboardData` expoe `refreshData` (alias de `useServicesData.fetchServicesData`)
   para um eventual botao de atualizar — hoje nenhum componente o consome

**CRITICAL PATTERNS**:
- Professional categories come from `profissionais_ativos`, NOT from service categories
- ALL data filtering (dates, categories) happens CLIENT-SIDE
- Scoring rules are duplicated in `useProfessionalDetails` - changes must be made in BOTH places
- Unique client counting: deduplication by `clientName.trim() + "-" + serviceDate`
- Empty/null client names are excluded from unique client counts

### Error Handling
- Basic error boundaries in context providers
- Supabase errors handled in individual hooks
- Loading states managed at hook level

### Performance Optimizations
- React Query caching for data fetching
- Memoized data processing in hooks
- Lazy loading with Vite's code splitting
- Minimal re-renders through proper hook dependencies

## Environment Variables

### Required for Development
Copy `.env.example` to `.env` and fill in the values:
```
VITE_SUPABASE_URL=<supabase-project-url>
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
```

### Edge Function Secrets (Set in Supabase Dashboard)
```
TRINKS_USERNAME=<configured in dashboard>
TRINKS_PASSWORD=<configured in dashboard>
```
**NEVER commit credentials to the repository. All secrets are managed via Supabase Dashboard.**

## Testing & Quality

### Code Quality Tools
- **ESLint**: Configured with TypeScript and React rules
- **TypeScript**: Strict mode enabled in tsconfig
- **Vitest**: testes unitarios do motor de scoring em `src/lib/scoring.test.ts`. Rode com `npm test`.
  Componentes React e hooks ainda nao possuem testes.

### Linting Rules
- React hooks rules enforced
- TypeScript ESLint recommended rules
- Unused variables allowed (relaxed rule)

## Deployment

### Build & Deploy
- Production builds: `npm run build`
- Development builds: `npm run build:dev`
- Preview locally: `npm run preview`

### Build Output
- Static files generated in `/dist`
- Vite handles chunking and optimization
- Assets automatically hashed for caching

## Common Development Tasks

### Adding a New Visualization
1. Create component in `/src/components/resultados/`
2. Prefira HTML/CSS puro (padrao do `CorridaChart`); Recharts sobrou apenas nas primitivas
   nao usadas de `/components/ui/`
3. Accept data as props (no direct Supabase queries)
4. Apply date filtering through parent component

### Adding a New Data Hook
1. Create in `/src/hooks/`
2. Use `useDateFilter` to get current filter
3. Use React Query for fetching
4. Return loading state, data, and error

### Modifying Date Filters
1. Update `DateFilterContext` for new filter types
2. Ensure date format remains YYYY-MM-DD
3. Update UI components in `DateFilter.tsx`

### Working with Supabase
1. Don't modify files in `/src/integrations/supabase/` (auto-generated)
2. Use the typed client: `import { supabase } from "@/integrations/supabase/client"`
3. Check RLS policies if queries fail
4. Use edge functions for server-side operations

## Supabase MCP Server Integration

When working with Supabase operations in this project, **ALWAYS use the Supabase MCP Server** (mcp__supabase__*) tools instead of manual operations or direct client usage. The MCP Server provides authenticated, type-safe access to the Supabase project.

### Key Benefits
- **Authenticated Access**: Automatically handles authentication with project credentials
- **Type Safety**: Provides TypeScript-aware database operations
- **Project Management**: Direct access to project settings, logs, and monitoring
- **Database Operations**: Execute SQL, apply migrations, and manage schema changes
- **Real-time Monitoring**: Access logs, advisors, and project status

### When to Use MCP Server
- **Database Queries**: Use `mcp__supabase__execute_sql` for SELECT, INSERT, UPDATE, DELETE operations
- **Schema Changes**: Use `mcp__supabase__apply_migration` for DDL operations (CREATE, ALTER, DROP)
- **Project Management**: Use `mcp__supabase__get_project`, `mcp__supabase__list_projects` for project info
- **Monitoring**: Use `mcp__supabase__get_logs`, `mcp__supabase__get_advisors` for debugging
- **Development**: Use branch operations for testing schema changes safely

### Project Details
- **Project ID**: Extract from `VITE_SUPABASE_URL` in `.env` (the ref segment of the Supabase URL)
- **Main Tables**: `trinks_services`, `profissionais_ativos`, `avaliacoes_cadastradas`, `automation_logs`
- **Schema**: Uses `public` schema with RLS enabled

### Example Usage Patterns
```typescript
// Instead of direct supabase client usage:
// const { data } = await supabase.from('trinks_services').select('*')

// Use MCP Server:
// mcp__supabase__execute_sql with project_id and query
```

### Important Notes
- **Always use project_id**: Extract from `VITE_SUPABASE_URL` in `.env` for all MCP operations
- **DDL vs DML**: Use `apply_migration` for schema changes, `execute_sql` for data operations
- **Error Handling**: MCP tools provide better error messages and debugging info
- **Ingestao**: para debugar dados faltando em `trinks_services`, olhe `trinks_sync_log` e
  `automation_logs` (escritos pelos workflows n8n), nao os logs de edge function


## Key Configuration Files

- `src/lib/categoryDisplayNames.ts` - Category name mappings and enabled categories
- `src/lib/constants.ts` - System constants (now minimal after profissionais_ativos migration)
- `src/lib/workingDaysConfig.ts` - Working days and holidays configuration
- `src/lib/dateUtils.ts` - Date filtering and conversion utilities
- `src/lib/marcasPorMes.ts` - Resolve a versao vigente de `profissional_fabricante` para um mes
- `src/lib/utils.ts` - General utilities including date formatting and data grouping
- `src/types/profissionaisAtivos.ts` - TypeScript types for professional management

**DO NOT MODIFY**:
- `src/components/ui/*` - shadcn/ui auto-generated components
- `src/integrations/supabase/types.ts` - Auto-generated Supabase types

## Important Notes for Development

1. **Category Detection**: Professional category is determined by `profissionais_ativos.categoria`, not by the service's category field
2. **Scoring Duplication**: `useProfessionalDetails` reimplements scoring logic - any scoring rule changes must be made in BOTH the category hook AND the details hook
3. **Client-Side Filtering**: ALL filtering (dates, categories) happens in the browser - `useServicesData` fetches everything
4. **Case-Sensitive Matching**:
   - Cabelo treatments: `category === "Tratamentos para Cabelo"` (exact match)
   - Unhas SPA: `service_name === "SPA dos Pés"` (exact match)
5. **Google Stars**:
   - Count toward score: Cabelo and Unhas (3 points each)
   - Display only: Estética and Maquiagem (0 points)
   - Filter: `status = 'aprovada'` AND `data_aprovacao IS NOT NULL`
6. **Timezone**: Stars use `America/Manaus` timezone for date filtering
   **Inativos**: `ativo === false` fica fora de TODOS os rankings, em todos os meses (ver "Inativos fora do ranking"; `src/lib/rankingProfissionais.ts`)
7. **Testes**: Vitest cobre o motor de scoring e utilitarios de `src/lib` (`npm test`).
   Componentes React e hooks continuam sem cobertura

### When to Use Which Agent

#### 🏗️ Planning & Architecture
- **backend-architect:** API design, database schemas, system architecture
- **frontend-developer:** UI/UX planning, component architecture
- **ui-ux-designer:** Interface design, wireframes, design systems, user research
- **cloud-architect:** Infrastructure design, scalability planning

#### 🔧 Implementation & Development
- **python-pro:** Python-specific development tasks
- **golang-pro:** Go-specific development tasks
- **rust-pro:** Rust-specific development, memory safety, systems programming
- **c-pro:** C programming, embedded systems, performance-critical code
- **javascript-pro:** Modern JavaScript, async patterns, Node.js/browser code
- **typescript-pro:** Advanced TypeScript, generics, type inference, enterprise patterns
- **java-pro:** Modern Java development, streams, concurrency, Spring Boot
- **elixir-pro:** Elixir development, OTP patterns, Phoenix frameworks, functional programming
- **csharp-pro:** Modern C# development, .NET frameworks, enterprise patterns
- **unity-developer:** Unity game development, C# scripting, performance optimization
- **ios-developer:** Native iOS development with Swift/SwiftUI
- **sql-pro:** Database queries, schema design, query optimization
- **mobile-developer:** React Native/Flutter development

#### 🛠️ Operations & Maintenance
- **devops-troubleshooter:** Production issues, deployment problems
- **incident-responder:** Critical outages requiring immediate response
- **database-optimizer:** Query performance, indexing strategies
- **database-admin:** Backup strategies, replication, user management, disaster recovery
- **terraform-specialist:** Infrastructure as Code, Terraform modules, state management
- **network-engineer:** Network connectivity, load balancers, SSL/TLS, DNS debugging

#### 📊 Analysis & Optimization
- **performance-engineer:** Application bottlenecks, optimization
- **security-auditor:** Vulnerability scanning, compliance checks
- **data-scientist:** Data analysis, insights, reporting
- **mlops-engineer:** ML infrastructure, experiment tracking, model registries, pipeline automation

#### 🧪 Quality Assurance
- **code-reviewer:** Code quality, configuration security, production reliability
- **test-automator:** Test strategy, test suite creation
- **debugger:** Bug investigation, error resolution
- **error-detective:** Log analysis, error pattern recognition, root cause analysis
- **search-specialist:** Deep web research, competitive analysis, fact-checking

#### 📚 Documentation
- **api-documenter:** OpenAPI/Swagger specs, API documentation
- **docs-architect:** Comprehensive technical documentation, architecture guides, system manuals
- **reference-builder:** Exhaustive API references, configuration guides, parameter documentation
- **tutorial-engineer:** Step-by-step tutorials, learning paths, educational content

#### 💼 Business & Strategy
- **business-analyst:** KPIs, revenue models, growth projections, investor metrics
- **risk-manager:** Portfolio risk, hedging strategies, R-multiples, position sizing
- **content-marketer:** SEO content, blog posts, social media, email campaigns
- **sales-automator:** Cold emails, follow-ups, proposals, lead nurturing
- **customer-support:** Support tickets, FAQs, help documentation, troubleshooting
- **legal-advisor:** Draft privacy policies, terms of service, disclaimers, and legal notices
