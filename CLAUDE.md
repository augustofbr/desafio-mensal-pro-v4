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
  - Real-time updates handled via Supabase subscriptions

### Key Directories

- `/src/components/` - React components organized by feature
  - `/charts/` - Chart components (Evolution, Distribution, Comparison)
  - `/dashboard/` - Dashboard-specific components including data processors
  - `/ui/` - shadcn/ui components (auto-generated, don't modify directly)
- `/src/hooks/` - Custom React hooks for data fetching
- `/src/contexts/` - React contexts (DateFilterContext for global date filtering)
- `/src/integrations/supabase/` - Supabase client and types (auto-generated)
- `/src/lib/` - Utility functions and constants
- `/supabase/` - Supabase configuration and edge functions
  - `/functions/` - Edge functions for automation
  - `/migrations/` - Database schema migrations

### Data Processing Components

The application uses background processor components for data handling:
- **CronogramaDataProcessor**: Processes schedule/timeline data
- **EdgeFunctionProcessor**: Handles edge function interactions
- **RealtimeSubscription**: Manages real-time data updates from Supabase

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

- `useStarsData`: Google Stars management hook
  - Fetches approved reviews from `avaliacoes_cadastradas`
  - Returns stars count per professional per category
  - Stars worth 3 points each in Cabelo/Unhas (display-only in Estética/Maquiagem)

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
    - `service_date`: Date of service (DATE)
    - `professional`: Professional name (TEXT)
    - `service_name`: Name of service (TEXT)
    - `category`: Service category (TEXT) - used only for specific service detection
    - `client_name`: Client name (TEXT, nullable)
    - `value`: Service value (NUMERIC) - used only for Estética revenue calculation
    - `created_at`: Timestamp
    - `profissionalid`: TEXT (nullable) - matches profissionais_ativos.profissionalId
    - Indexes on: service_date, professional, category

  - `profissionais_ativos` - Professional registry and categories
    - `profissionalId`: Primary key (INTEGER)
    - `nome_profissional`: Professional name (TEXT)
    - `categoria`: Category assignment (TEXT) - "Cabelo", "Unhas", "Estetica", "Maquiagem"
    - `created_at`: Timestamp
    - **IMPORTANT**: Professional category comes from THIS table, NOT from trinks_services.category

  - `avaliacoes_cadastradas` - Google Stars reviews
    - `id`: Primary key (UUID)
    - `profissional_id`: Foreign key to profissionais_ativos (INTEGER)
    - `nome_profissional`: Professional name snapshot (TEXT)
    - `nome_cliente`: Client name (TEXT)
    - `status`: Review status (TEXT) - 'pendente', 'aprovada', 'rejeitada'
    - `data_hora_cadastro`: Review registration timestamp (TIMESTAMPTZ) - used for date filtering
    - `aprovado_por`: Admin UID who approved (UUID, nullable)
    - `data_aprovacao`: Approval timestamp (TIMESTAMPTZ, nullable)
    - `created_at`: Timestamp
    - **Only approved reviews** (`status = 'aprovada'` AND `data_aprovacao IS NOT NULL`) count toward scores

  - `automation_logs` - Logs for automation runs
    - `id`: Primary key (BIGINT)
    - `message`: Log message (TEXT)
    - `is_error`: Error flag (BOOLEAN)
    - `created_at`: Timestamp
    - Index on: created_at

### Business Rules & Scoring System

**CRITICAL**: Professional categories are determined by `profissionais_ativos.categoria`, NOT by `trinks_services.category`. The service category field is only used to detect specific service types (e.g., "Tratamentos para Cabelo").

#### Category Scoring Rules

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

#### Key Components

- `PremiacaoPanel`: Prize qualification panel showing leaders and prize status per category
- `ProfessionalModal`: Detailed breakdown when clicking on a professional
- `DataRankings`: Main ranking display with category tabs
- `EvolutionChartContainer`: Daily accumulated points chart per category

### Edge Functions
- **daily-trinks-automation**: Processes and formats service data
  - Handles date format conversion (DD/MM/YYYY → YYYY-MM-DD)
  - Enables real-time subscriptions
  - Includes CORS headers for browser requests
  - Uses Deno runtime with Supabase client

### Security
- RLS (Row Level Security) enabled on all tables with public policies
- Uses anon key for client-side operations
- Service role key used in edge functions

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
8. Real-time updates trigger automatic re-fetches

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
- **No test framework**: Currently no unit/integration tests

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

### Adding a New Chart
1. Create component in `/src/components/charts/`
2. Use Recharts components for consistency
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
- **Real-time Updates**: Check logs via MCP when debugging real-time subscription issues


## Key Configuration Files

- `src/lib/categoryDisplayNames.ts` - Category name mappings and enabled categories
- `src/lib/constants.ts` - System constants (now minimal after profissionais_ativos migration)
- `src/lib/workingDaysConfig.ts` - Working days and holidays configuration
- `src/lib/dateUtils.ts` - Date filtering and conversion utilities
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
7. **No Tests**: Project has no automated test framework configured

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
