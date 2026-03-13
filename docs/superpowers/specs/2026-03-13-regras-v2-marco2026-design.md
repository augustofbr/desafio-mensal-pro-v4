# Design: Regras V2 — Mudancas Estruturais Marco/2026

**Data:** 2026-03-13
**Status:** Aprovado
**Escopo:** Novas regras de scoring, metas, premios e constraints de fabricante a partir de marco/2026

---

## 1. Contexto

O sistema "Profissional Destaque do Mes" precisa de mudancas significativas nas regras do desafio a partir de marco/2026. Meses anteriores devem manter as regras originais (V1). O sistema aplica automaticamente a versao correta das regras com base no filtro de data selecionado.

## 2. Resumo das Mudancas

### 2.1 Scoring por Categoria

#### Cabelo (V1 → V2)
| Aspecto | V1 (ate fev/2026) | V2 (mar/2026+) |
|---------|-------------------|-----------------|
| Cliente unico/dia | 1 pt | 1 pt |
| Tratamento capilar | 2 pts | 3 pts (so marca autorizada) |
| Estrela Google | 3 pts (soma) | 3 pts (soma) |
| Meta clientes | 60 unicos | 50 unicos |
| Meta tratamentos | sem minimo | 40 tratamentos (marca autorizada) |
| Meta excelencia | sem | Estrelas Google: 30 estrelas |
| Constraint fabricante | nao | sim |
| Premio | R$300 | SPA Especial + Voucher surpresa |

#### Unhas (V1 → V2)
| Aspecto | V1 (ate fev/2026) | V2 (mar/2026+) |
|---------|-------------------|-----------------|
| Cliente unico/dia | 1 pt | 1 pt |
| SPA dos Pes | 2 pts | 3 pts |
| Estrela Google | 3 pts (soma) | 3 pts (soma) |
| Meta clientes | 50 unicos | 70 unicos |
| Meta SPA | sem minimo | 10 SPA dos Pes |
| Meta excelencia | sem | Estrelas Google: 30 estrelas |
| Premio | R$200 | SPA Especial + Voucher surpresa |

#### Estetica (V1 → V2)
| Aspecto | V1 (ate fev/2026) | V2 (mar/2026+) |
|---------|-------------------|-----------------|
| Modelo scoring | revenue-percentage | revenue-points |
| Faturamento | % de R$5.000 | R$100 = 1 pt |
| Estrela Google | display only | 3 pts (soma) |
| Meta qualificacao | R$5.000 | R$10.000 |
| Meta excelencia | sem | Estrelas Google: 30 estrelas |
| Valores na UI | ocultos (so %) | ocultos (so pontos) |
| Premio | R$200 | SPA Especial + Voucher surpresa |

#### Maquiagem (V1 → V2)
| Aspecto | V1 (ate fev/2026) | V2 (mar/2026+) |
|---------|-------------------|-----------------|
| Modelo scoring | 1 pt/servico | revenue-points |
| Faturamento | nao usa | R$100 = 1 pt |
| Estrela Google | display only | 3 pts (soma) |
| Meta qualificacao | 25 servicos | R$3.500 |
| Meta excelencia | sem | Estrelas Google: 15 estrelas |
| Valores na UI | servicos | ocultos (so pontos) |
| Premio | R$200 | SPA Especial + Voucher surpresa |

### 2.2 Constraints de Fabricante (Cabelo V2)

Cada profissional de cabelo so pontua com tratamentos de fabricantes especificos:

| Profissional | Fabricantes Permitidos |
|--------------|----------------------|
| Joia | L'Oreal |
| Manu | Nuance, Keune |
| Sarah | L'Oreal |
| Rilley | Wella |
| Brenda | Truss, Davines |
| Ricardo | Vitaliss, Cadiveu |

**Regras de classificacao:**
- Kerastase conta como L'Oreal
- Sebastian conta como Wella
- "Lavagem Especial (loreal, wella, kerastase, joico)" conta para profissionais com L'Oreal OU Wella
- Tratamentos de fabricantes nao autorizados: nao contam pontos, mas sao sinalizados na UI
- Fabricantes sem profissional atribuido (ex: Joico, Schwarzkopf, Senscience): tratamentos existem na tabela de mapeamento mas nao contam pontos para nenhum profissional, pois nenhum tem essas marcas como permitidas. Isso e intencional — se no futuro um profissional precisar dessas marcas, basta adicionar na tabela `profissional_fabricante`
- Tratamentos com `fabricante = 'Nao classificado'` ou sem entrada na tabela `tratamento_fabricante`: nao contam pontos e sao sinalizados como "Nao classificado" no array `invalidTreatments[]`. A tabela e editavel pelo admin para reclassificacao futura
- **Meta excelencia profissional** (Estrelas Google): e uma meta aspiracional/display-only — NAO desqualifica. Apenas as metas de qualificacao (clientes, tratamentos, faturamento) determinam se o profissional esta qualificado

## 3. Arquitetura: Abordagem A — Modulo Centralizado de Regras

### 3.1 Novas Tabelas no Banco (Supabase)

#### `tratamento_fabricante`
Mapeia servicos de tratamento capilar aos seus fabricantes.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | SERIAL PK | Auto-incremento |
| service_name | TEXT NOT NULL | Nome do servico (match com trinks_services.service_name) |
| fabricante | TEXT NOT NULL | Nome do fabricante |
| created_at | TIMESTAMPTZ | Default now() |

- Unique constraint em (service_name, fabricante)
- Pre-populada com 59 tratamentos classificados
- Suporta multiplos fabricantes por tratamento (ex: Lavagem Especial)
- Tratamentos ambiguos inseridos como fabricante = 'Nao classificado'

#### `profissional_fabricante`
Define fabricantes permitidos por profissional de cabelo.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | SERIAL PK | Auto-incremento |
| profissional_id | INTEGER NOT NULL | FK para profissionais_ativos.profissionalId |
| nome_profissional | TEXT NOT NULL | Nome para referencia rapida |
| fabricante | TEXT NOT NULL | Fabricante permitido |
| created_at | TIMESTAMPTZ | Default now() |

- Unique constraint em (profissional_id, fabricante)

**Dados iniciais profissional_fabricante:**
```
(788360, "Joia", "L'Oreal")
(829346, "Manu", "Nuance")
(829346, "Manu", "Keune")
(853281, "Sarah", "L'Oreal")
(793041, "Rilley", "Wella")
(649472, "Brenda", "Truss")
(649472, "Brenda", "Davines")
(804415, "Ricardo", "Vitaliss")
(804415, "Ricardo", "Cadiveu")
```

### 3.2 Modulo de Regras: `src/lib/rulesConfig.ts`

Define versoes de regras como objetos tipados TypeScript:

```typescript
interface CategoryRules {
  scoringModel: 'points' | 'revenue-percentage' | 'revenue-points';
  clientPointValue: number;
  specialServicePointValue: number;
  specialServiceLabel: string; // ex: "Tratamentos", "SPA dos Pes" — para labels dinamicos na UI
  starPointValue: number;
  starsCountInScore: boolean;
  revenuePointConversion?: number; // R$ por ponto
  qualificationGoals: {
    minUniqueClients?: number;
    minSpecialServices?: number;
    minRevenue?: number;
    minServices?: number;
  };
  symbolicGoals: {
    stars?: number; // meta aspiracional, NAO desqualifica
  };
  manufacturerConstraints: boolean;
  prize: string;
}

interface RulesVersion {
  id: string;
  validFrom: string; // 'YYYY-MM'
  cabelo: CategoryRules;
  unhas: CategoryRules;
  estetica: CategoryRules;
  maquiagem: CategoryRules;
}
```

Funcao `getRulesForDate(startDate: string): RulesVersion` seleciona a versao correta comparando o mes do startDate com validFrom de cada versao.

### 3.3 Novo Hook: `useManufacturerData`

```typescript
interface ManufacturerData {
  getTreatmentManufacturers: (serviceName: string) => string[];
  getProfessionalAllowedManufacturers: (profissionalId: number) => string[];
  isTreatmentAllowed: (serviceName: string, profissionalId: number) => boolean;
  isLoading: boolean;
}
```

- Busca tratamento_fabricante e profissional_fabricante via React Query
- Usado apenas quando rules.manufacturerConstraints === true
- React Query staleTime: 5 minutos (dados mudam raramente; refresh manual ou reload para atualizar apos admin editar as tabelas)

### 3.4 Mudancas nos Hooks Existentes

Todos passam a consumir `getRulesForDate(startDate)`.

**Regra critica de inicializacao:** Todos os hooks de categoria DEVEM inicializar o mapa de profissionais a partir de `categoryProfessionals` (lista completa de profissionais ativos da categoria), NAO a partir dos dados de servico filtrados. Isso garante que um profissional sem servicos (ou com todos os tratamentos invalidos) ainda apareca no ranking com 0 pontos. Esse comportamento ja e necessario no V1, mas se torna critico no V2 com as constraints de fabricante.

**useHairTreatmentData:**
- treatmentPoints vem de rules.cabelo.specialServicePointValue
- V2: valida fabricante via useManufacturerData
- Recebe `profLookup: Map<string, ProfissionalAtivo>` (do useActiveProfessionals) para resolver nome → profissionalId na validacao de fabricante
- Tratamentos invalidos nao contam pontos mas sao retornados em `invalidTreatments[]`
- Retorna novo campo: `invalidTreatments: { professional, serviceName, fabricante }[]`
- Tratamentos sem entrada em `tratamento_fabricante`: tratados como invalidos com `fabricante = 'Desconhecido'`
- **Dependencia de loading:** nao processa dados ate que `useManufacturerData.isLoading === false` (quando V2). Retorna dados vazios/loading enquanto manufacturer data nao esta disponivel, evitando flash de dados incorretos

**useManicurePedicureData:**
- spaPoints vem de rules.unhas.specialServicePointValue

**useEsteticaData:**
- V1: mantem logica revenue-percentage (totalRevenue / 5000 * 100)
- V2: muda para revenue-points (Math.floor(totalRevenue / 100) + starCount * 3)
- Ranking por totalPoints em V2
- Exportacao `ESTETICA_REVENUE_MINIMUM` removida; consumidores passam a usar `getRulesForDate().estetica.qualificationGoals.minRevenue`
- Output shape V2: inclui `totalRevenue`, `revenuePoints`, `starPoints`, `totalPoints`

**useMaquiagemData:**
- V1: mantem logica 1pt/servico, output inclui `totalServices`
- V2: muda para revenue-points (mesma logica de Estetica V2, meta R$3.500)
- Output shape V2: inclui `totalRevenue`, `revenuePoints`, `starPoints`, `totalPoints` (e NAO mais `totalServices`)
- PremiacaoPanel V2 usa `qualificationGoals.minRevenue` em vez de `totalServices >= 25`

**useProfessionalDetails:**
- Espelha todas as mudancas acima
- Recebe `starCount` para o profissional selecionado (via useDashboardData que ja tem useStarsData), permitindo calcular starPoints corretamente em V2 para todas as categorias
- Para Cabelo V2: mostra breakdown validos vs invalidos

**useDashboardData (orquestracao):**
- Passa `profLookup` para useHairTreatmentData
- Passa `starCount` do profissional selecionado para useProfessionalDetails
- Adiciona `useManufacturerData` ao loading state: `isLoading = servicesLoading || profsLoading || starsLoading || (rules.cabelo.manufacturerConstraints && manufacturerLoading)`

### 3.5 Mudancas na UI

#### RegrasDoDesafio (torna-se dinamico)
- Consome useDateFilter() + getRulesForDate()
- Gera textos das regras a partir do objeto de regras da versao ativa

**Textos V2:**

Cabelo:
- "Cada cliente atendido no dia vale 1 ponto (mesmo cliente no mesmo dia conta so 1 vez)"
- "Cada tratamento capilar da marca autorizada vale 3 pontos"
- "Cada avaliacao Google aprovada vale 3 pontos"
- Meta: "Metas minimas: 50 clientes unicos + 40 tratamentos no mes"
- Meta excelencia profissional: "Estrelas Google: 30 estrelas"

Unhas:
- "Cada cliente atendido no dia vale 1 ponto (mesmo cliente no mesmo dia conta so 1 vez)"
- "Cada SPA dos Pes realizado vale 3 pontos"
- "Cada avaliacao Google aprovada vale 3 pontos"
- Meta: "Metas minimas: 70 clientes unicos + 10 SPA dos Pes no mes"
- Meta excelencia profissional: "Estrelas Google: 30 estrelas"

Estetica:
- "A pontuacao e baseada no faturamento: a cada R$ 100,00 faturados, voce ganha 1 ponto"
- "Cada avaliacao Google aprovada vale 3 pontos"
- "Existe uma meta minima de faturamento para se qualificar ao premio"
- Meta excelencia profissional: "Estrelas Google: 30 estrelas"

Maquiagem:
- "A pontuacao e baseada no faturamento: a cada R$ 100,00 faturados, voce ganha 1 ponto"
- "Cada avaliacao Google aprovada vale 3 pontos"
- "Existe uma meta minima de faturamento para se qualificar ao premio"
- Meta excelencia profissional: "Estrelas Google: 15 estrelas"

Premio (todas): "SPA Especial + Voucher surpresa"

#### PremiacaoPanel
- Consome getRulesForDate() em vez de PREMIACAO_CONFIG hardcoded
- Cabelo V2: duas barras de progresso (clientes + tratamentos validos), ambas devem atingir 100%
- Unhas V2: duas barras de progresso (clientes + SPA), ambas devem atingir 100%
- Estetica V2: barra de progresso por % de faturamento (sem expor valor)
- Maquiagem V2: barra de progresso por % de faturamento (sem expor valor)

#### ProfessionalRanking
- Cabelo V2: badge de tratamentos mostra so validos; icone de alerta quando ha invalidos
- Estetica/Maquiagem V2: exibe "XX Pts" em vez de "45%" ou "12 serv"

#### ProfessionalModal
- Cabelo V2: secao de tratamentos validos vs nao contabilizados (com fabricante)
- Estetica/Maquiagem V2: breakdown "Pontos faturamento: X + Pontos estrelas: Y = Total: Z"

### 3.6 Grafico de Evolucao (EvolutionChartContainer)

O grafico de evolucao diaria acumulada precisa de ajustes para o modelo `revenue-points`.

**Cabelo e Unhas V2:** Sem mudanca estrutural no grafico — o modelo continua sendo pontos (cliente + servico especial + estrelas). Apenas os valores mudam (3 pts em vez de 2 pts para servico especial).

**Estetica e Maquiagem V2 (revenue-points):**
- Algoritmo de acumulacao diaria: para cada dia, calcular `floor(faturamentoAcumuladoAteDia / 100)` + `pontosEstrelasAcumulados`
- NAO somar `floor(valor/100)` por servico individual (causaria erro de arredondamento)
- O eixo Y continua sendo "Pontos Acumulados"

**Estetica e Maquiagem V1:** Sem mudanca (V1 mantem logica original).

## 4. Versionamento Temporal

- `getRulesForDate()` determina qual versao aplicar com base no startDate do DateFilterContext
- Ao visualizar fevereiro/2026 ou anterior: sistema aplica V1 automaticamente
- Ao visualizar marco/2026 ou posterior: sistema aplica V2
- Futuras versoes (V3, V4...) podem ser adicionadas ao array de versoes
- **Limitacao conhecida:** ranges customizados que cruzam a fronteira de versoes (ex: jan-mar 2026) usam a versao do startDate. Isso e aceitavel pois o uso principal e visualizar meses individuais

## 5. Pre-populacao da Tabela tratamento_fabricante

Classificacao dos 59 tratamentos por fabricante:

**L'Oreal:**
Loreal Cachos, Loreal Inforcer, Loreal Metal Detox, Loreal Molecular, Loreal Nutrifier, Loreal Pos Quimica, Loreal Pro Longer, Loreal Scalp Argila, Loreal Vitamino Color Spectrum, Loreal Vitamino Color Tradicional, Kerastase Nutricao, Kerastase Reconstrucao

**Wella:**
Wella BlondorPlex, Wella Collor Brilliance, Wella Color Motion, Wella Ellements, Wella Enrich, Wella Fusion, Wella Luxe Ultimate, Wella Oil Reflections, Wella Ultimate - reconstrucao imediata, Sebastian Penetraite, NO BREAKER SEBASTIAN

**Truss:**
Truss Blond, Truss Infusion, Truss Net Mask, Truss Nutri Infusion

**Davines:**
Davines calming, Davines Purifying

**Cadiveu:**
Cadiveu Blond Reconstrutor, Cadiveu Hair Remedy, Cadiveu Nutri Glow

**Keune:**
Keune Smoth - Reconstrucao, Keune Vital Hidratacao, Keune Vital Nutricao

**Nuance:**
Nuance Nutricao

**Vitaliss:**
Vitallis, Vitallis Reposicao de Carbono, Plastica Premium - Vitallis

**Joico:**
Joico Blonde Life, Joico Defy Damage, Joico K-Pack Reconstrutor, Joico k-pak 4 passos, Joico K-Pak Color Therapy, Joico K-PAK Revitaluxe, Joico Moisture Recovery, Trat. Joico Luster lock

**L'Oreal + Wella (multiplo):**
Lavagem Especial (loreal, wella, kerastase, joico)

**Nao classificado:**
Banho de Ouro, Cauterizacao Trivitt, Detox Capilar e escova, Donatti Profissional, Hidratacao Princesse, Olaplex Donatti, Plastica dos Fios, Schwarzkopf bonacure, Senscience Blond, Senscience Nutricao, Trat. CPR

## 6. Arquivos Afetados

### Novos
- `src/lib/rulesConfig.ts` — modulo centralizado de regras versionadas
- `src/hooks/useManufacturerData.ts` — hook para dados de fabricante
- `supabase/migrations/YYYYMMDD_create_manufacturer_tables.sql` — migracao das tabelas

### Modificados
- `src/hooks/useHairTreatmentData.ts` — scoring + constraints fabricante
- `src/hooks/useManicurePedicureData.ts` — scoring atualizado
- `src/hooks/useEsteticaData.ts` — modelo revenue-points + remover export ESTETICA_REVENUE_MINIMUM
- `src/hooks/useMaquiagemData.ts` — modelo revenue-points
- `src/hooks/useProfessionalDetails.ts` — espelha mudancas de scoring + recebe starCount
- `src/hooks/useDashboardData.ts` — orquestra manufacturerData + profLookup + starCount
- `src/components/RegrasDoDesafio.tsx` — regras dinamicas por versao
- `src/components/PremiacaoPanel.tsx` — metas e premios dinamicos
- `src/components/ProfessionalRanking.tsx` — badges e display
- `src/components/ProfessionalModal.tsx` (ou equivalente) — breakdown detalhado
- `src/components/charts/EvolutionChartContainer.tsx` — acumulacao revenue-points para Estetica/Maquiagem V2

### Removidos/Deprecados
- `ESTETICA_REVENUE_MINIMUM` export de useEsteticaData.ts — substituido por rulesConfig

## 7. Notas de Implementacao

1. **RLS para novas tabelas:** Ambas `tratamento_fabricante` e `profissional_fabricante` devem ter RLS habilitado com politica de leitura publica (mesmo padrao das demais tabelas)
2. **Debito tecnico reconhecido:** A duplicacao de scoring entre hooks de categoria e `useProfessionalDetails` se torna mais critica com V2. Recomenda-se, em refactor futuro, extrair um scoring engine compartilhado. Nao faz parte deste escopo para manter o PR focado
3. **Cache de manufacturer data:** React Query com staleTime de 5 minutos. Apos admin editar as tabelas de fabricante, um refresh da pagina e suficiente
4. **Privacidade Estetica/Maquiagem V2:** O display em pontos (R$100=1pt) abstrai o valor monetario. A barra de progresso mostra "X% da meta" sem revelar o valor absoluto. Embora o valor seja matematicamente derivavel dos pontos, o requisito e nao exibir "R$X.XXX" explicitamente na UI
