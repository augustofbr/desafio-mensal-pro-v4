# Design: Regras V4 — Metas de Agosto/2026

**Data:** 2026-07-25
**Status:** Aprovado
**Escopo:** Novas metas vigentes de 01 a 31 de agosto/2026, com deteccao configuravel de servico especial e desativacao de categoria por versao de regra
**Origem:** Anotacao manuscrita da gestao ("Meta Agosto 01 a 31")

---

## 1. Contexto

A gestao definiu novas metas para agosto/2026. Tres mudancas nao cabem no motor de regras atual:

1. **Cabelo** deixa de pontuar tratamentos capilares em geral e passa a pontuar apenas o servico `Cronograma Capilar [pacote]`. Hoje a deteccao do servico especial de Cabelo esta fixa em `category === "Tratamentos para Cabelo"`.
2. **Estetica** abandona o modelo de faturamento e passa a pontuar como Cabelo e Unhas, com `Limpeza de Pele` como servico especial. Hoje Estetica so possui os caminhos `revenue-percentage` e `revenue-points`.
3. **Maquiagem** sai do desafio em agosto. Hoje as categorias habilitadas vivem em `ENABLED_PROF_CATEGORIES`, uma constante estatica que nao varia por mes.

Meses anteriores devem continuar produzindo exatamente os mesmos numeros. O sistema ja seleciona a versao de regra pelo filtro de data (`getRulesForDateFromVersions`), e as versoes V1, V2 e V3 permanecem intactas.

### 1.1 Transcricao da anotacao original

| Categoria | Item | Pontos |
|-----------|------|--------|
| Geral | Estrelinhas | 3 |
| Cabeleireiro | Cronograma Completo | 5 |
| Cabeleireiro | Volume de Atendimentos | 2 |
| Unhas | Spa dos Pes | 3 |
| Unhas | Volume de Atendimento | 2 |
| Estetica | Limpeza de Pele | 3 |
| Estetica | Volume de Atendimento | 2 |

### 1.2 Decisoes tomadas na definicao dos requisitos

| Duvida | Decisao |
|--------|---------|
| O que e "Cronograma Completo" | O servico `Cronograma Capilar [pacote]`, ja cadastrado no Trinks na categoria `Tratamentos para Cabelo` (usado 1 vez, em 13/04/2026). Deteccao por nome exato. |
| Tratamentos avulsos continuam pontuando | Nao. Em agosto, dentro de `Tratamentos para Cabelo`, apenas o Cronograma gera pontos de servico especial. Os demais tratamentos entram somente no volume de atendimento. |
| O que e "Volume de Atendimento" | Mantem a regra atual de cliente unico por dia (mesma cliente no mesmo dia conta 1 vez), com o valor subindo de 1 para 2 pontos. |
| Estetica muda de modelo | Sim, pontos puros. Faturamento deixa de existir para a categoria em agosto. |
| Quais servicos sao "Limpeza de Pele" | Ambos os cadastrados: `Limpeza de Pele Profunda` e `Limpeza de Pele simples`. Deteccao por prefixo. |
| Maquiagem | Sai do desafio em agosto. |
| Restricao de fabricante no Cabelo | Desligada em agosto, pois o Cronograma nao e vinculado a marca. |
| Premios | Ainda nao definidos. Cadastrados como "A definir" e editaveis pelo painel admin. |

---

## 2. Resumo das Mudancas (V3 → V4)

### Cabelo

| Aspecto | V3 (abr/2026+) | V4 (ago/2026) |
|---------|----------------|---------------|
| Cliente unico/dia | 1 pt | **2 pts** |
| Servico especial | Tratamentos (categoria inteira), 2 pts | **`Cronograma Capilar [pacote]`, 5 pts** |
| Estrela Google | 3 pts (soma) | 3 pts (soma) |
| Meta clientes | 86 unicos | **60 unicos** |
| Meta servico especial | 30 tratamentos | **10 cronogramas** |
| Meta excelencia | 10 estrelas | 10 estrelas |
| Constraint fabricante | sim | **nao** |
| Premio | +2% na Comissao de Maio | **A definir** |

### Unhas

| Aspecto | V3 (abr/2026+) | V4 (ago/2026) |
|---------|----------------|---------------|
| Cliente unico/dia | 1 pt | **2 pts** |
| SPA dos Pes | 2 pts | **3 pts** |
| Estrela Google | 3 pts (soma) | 3 pts (soma) |
| Meta clientes | 100 unicos | **80 unicos** |
| Meta SPA | 13 SPAs | **10 SPAs** |
| Meta excelencia | 10 estrelas | 10 estrelas |
| Premio | R$ 300,00 | **A definir** |

### Estetica

| Aspecto | V3 (abr/2026+) | V4 (ago/2026) |
|---------|----------------|---------------|
| Modelo scoring | revenue-points | **points** |
| Faturamento | R$ 133,33 = 1 pt | **nao usa** |
| Cliente unico/dia | nao pontua | **2 pts** |
| Servico especial | nenhum | **`Limpeza de Pele*`, 3 pts** |
| Estrela Google | 2 pts (soma) | **3 pts (soma)** |
| Meta qualificacao | R$ 10.000 | **80 clientes unicos + 10 limpezas** |
| Meta excelencia | 10 estrelas | 10 estrelas |
| Valores na UI | ocultos (so pontos) | ocultos (so pontos) |
| Premio | +2% na Comissao de Maio | **A definir** |

### Maquiagem

| Aspecto | V3 (abr/2026+) | V4 (ago/2026) |
|---------|----------------|---------------|
| Participacao | ativa | **desativada** |
| Demais campos | revenue-points, R$ 140 = 1 pt, meta R$ 3.500 | congelados (herdados da V3) |

Os campos de Maquiagem sao mantidos na V4 para que a categoria possa ser reativada em uma versao futura sem reconstruir a configuracao.

---

## 3. Modelo de Dados

### 3.1 Extensao de `CategoryRules`

Dois campos **opcionais** sao adicionados a interface em `src/lib/rulesConfig.ts`:

```ts
export interface SpecialServiceMatch {
  type: 'exact' | 'prefix' | 'category';
  values: string[];
}

export interface CategoryRules {
  // ... campos existentes inalterados
  specialServiceMatch?: SpecialServiceMatch;
  enabled?: boolean;
}
```

**Semantica de `specialServiceMatch`:**

| type | Campo comparado | Regra |
|------|-----------------|-------|
| `exact` | `service_name` | Igualdade com qualquer valor da lista |
| `prefix` | `service_name` | Comeca com qualquer valor da lista |
| `category` | `category` | Igualdade com qualquer valor da lista |

A comparacao e feita com `trim()` em ambos os lados e **case-insensitive**, para tolerar variacoes de cadastro no Trinks (ex.: `Limpeza de Pele simples`, com "simples" em minuscula, casa com o prefixo `Limpeza de Pele`).

**Fallback legado:** quando `specialServiceMatch` esta ausente, cada categoria mantem o comportamento hardcoded atual:

| Categoria | Fallback |
|-----------|----------|
| Cabelo | `{ type: 'category', values: ['Tratamentos para Cabelo'] }` |
| Unhas | `{ type: 'exact', values: ['SPA dos Pés'] }` |
| Estetica / Maquiagem | sem servico especial |

Isso garante que V1, V2 e V3 — que nao possuem o campo — continuem produzindo resultados identicos.

**Semantica de `enabled`:** `undefined` e tratado como `true`. Somente a V4 declara `enabled: false`, e apenas para Maquiagem.

### 3.2 Versao V4

Vigencia `2026-08`. Valores por categoria:

```
cabelo:
  scoringModel: 'points'
  clientPointValue: 2
  specialServicePointValue: 5
  specialServiceLabel: 'Cronograma Capilar'
  specialServiceMatch: { type: 'exact', values: ['Cronograma Capilar [pacote]'] }
  starPointValue: 3
  starsCountInScore: true
  qualificationGoals: { minUniqueClients: 60, minSpecialServices: 10 }
  symbolicGoals: { stars: 10 }
  manufacturerConstraints: false
  prize: 'A definir'
  enabled: true

unhas:
  scoringModel: 'points'
  clientPointValue: 2
  specialServicePointValue: 3
  specialServiceLabel: 'SPA dos Pés'
  specialServiceMatch: { type: 'exact', values: ['SPA dos Pés'] }
  starPointValue: 3
  starsCountInScore: true
  qualificationGoals: { minUniqueClients: 80, minSpecialServices: 10 }
  symbolicGoals: { stars: 10 }
  manufacturerConstraints: false
  prize: 'A definir'
  enabled: true

estetica:
  scoringModel: 'points'
  clientPointValue: 2
  specialServicePointValue: 3
  specialServiceLabel: 'Limpeza de Pele'
  specialServiceMatch: { type: 'prefix', values: ['Limpeza de Pele'] }
  starPointValue: 3
  starsCountInScore: true
  qualificationGoals: { minUniqueClients: 80, minSpecialServices: 10 }
  symbolicGoals: { stars: 10 }
  manufacturerConstraints: false
  prize: 'A definir'
  enabled: true

maquiagem:
  (campos da V3 preservados)
  enabled: false
```

### 3.3 Persistencia

A V4 e inserida na tabela `regras_desafio` por migration (`valid_from = '2026-08'`, `label = 'V4 - Agosto 2026'`) e espelhada como `RULES_V4` em `src/lib/rulesConfig.ts`, que serve de fallback quando a consulta ao Supabase falha (`useRulesData` ja implementa esse degrade).

---

## 4. Motor de Calculo

### 4.1 Novo modulo `src/lib/scoring.ts`

Concentra a logica hoje espalhada e duplicada:

```ts
matchesSpecialService(service, rules, categoryKey): boolean
```
Resolve os tres tipos de match e aplica o fallback legado por categoria. Substitui os quatro pontos hardcoded existentes.

```ts
computePointsRanking(services, professionals, starsByProfessional, rules, categoryKey): PointsRankingEntry[]
```
Extrai o calculo comum ao modelo `points`, hoje duplicado entre `useHairTreatmentData` e `useManicurePedicureData` e que seria triplicado ao levar Estetica para pontos:

1. Inicializa todos os profissionais da categoria com 0 pontos.
2. Soma `specialServicePointValue` para cada servico que casa com `matchesSpecialService`.
3. Soma `clientPointValue` por cliente unico/dia, deduplicando por `clientName.trim() + "-" + serviceDate`, ignorando nomes vazios ou nulos.
4. Soma `starCount * starPointValue` quando `starsCountInScore` e verdadeiro.
5. Ordena por pontos decrescentes.

### 4.2 Hooks afetados

| Hook | Mudanca |
|------|---------|
| `useHairTreatmentData` | Passa a filtrar pelo match configurado em vez de `category === "Tratamentos para Cabelo"`. Mantem a validacao de fabricante e a lista de `invalidTreatments` quando `manufacturerConstraints` esta ligado. |
| `useManicurePedicureData` | Passa a filtrar pelo match configurado em vez de `service_name === "SPA dos Pés"`. |
| `useEsteticaData` | Ganha o caminho `scoringModel === 'points'`, delegando ao motor comum. Os caminhos `revenue-percentage` e `revenue-points` permanecem para meses anteriores. |
| `useProfessionalDetails` | Recebe os mesmos ajustes de deteccao e o caminho de pontos para Estetica. Reimplementa o scoring por design atual do projeto; a divergencia entre este hook e os hooks de categoria e a armadilha explicitamente registrada no `CLAUDE.md`. |

O contrato de saida dos hooks e preservado (`treatmentServices`, `uniqueClientDays`, `starCount`, `starPoints`, `invalidTreatmentCount`, `services`), evitando alteracoes em cascata na UI.

---

## 5. Interface

| Componente | Mudanca |
|------------|---------|
| `categoryDisplayNames` | Ganha `isCategoryActive(rules, category)`, que consulta `enabled` da categoria na regra vigente e usa a constante estatica como default. Maquiagem desaparece das abas e do painel de premiacao em agosto, e reaparece automaticamente ao filtrar meses anteriores. |
| `DataRankings` | Passa as regras vigentes para `isCategoryActive`. |
| `ComparisonChart` | **Nao sera alterado.** O componente usa `isCategoryEnabled`, mas nenhum arquivo do projeto o importa — e codigo morto. Adaptar exigiria adicionar a prop `rules` a um componente que ninguem renderiza. |
| `EvolutionChartContainer` | Nenhuma alteracao necessaria: com Estetica em `points`, ela passa a cair no caminho padrao de acumulo de `service.points`, ja usado por Cabelo e Unhas. Verificado na validacao. |
| `ProfessionalModal` | Substitui o literal "SPA dos Pés" por `rules.specialServiceLabel` nos tres pontos onde aparece fixo. |
| `ProfessionalRanking` | Estetica passa a exibir pontos em vez de percentual, pelo branch de `points` ja existente. |
| `RegrasDoDesafio` | Nenhuma alteracao: o texto ja e gerado a partir da regra vigente e passara a exibir "Cada Cronograma Capilar vale 5 pontos" e "Cada cliente atendido no dia vale 2 pontos" automaticamente. |
| `PremiacaoPanel` | Estetica passa pelo branch de pontos; a qualificacao passa a considerar `minUniqueClients` e `minSpecialServices` em vez de `minRevenue`. |
| `admin/RulesVersionForm` | Ganha os campos de deteccao (tipo de match e lista de valores) e o switch "categoria ativa". |

---

## 6. Validacao

O projeto nao possui framework de testes automatizados. A validacao sera feita por script de conferencia:

1. **Regressao:** recalcular o ranking de **abril/2026** (unico mes com dados) sob a V3, antes e depois do refactor. Os resultados devem ser identicos profissional a profissional, em pontos e posicao.
2. **Agosto:** simular com dados sinteticos cobrindo cada regra nova — cronograma detectado por nome exato, ambas as limpezas de pele detectadas por prefixo, cliente com multiplos servicos no mesmo dia contando 2 pontos uma unica vez, estrela somando 3 pontos em Estetica, e Maquiagem ausente da UI.
3. **Navegacao temporal:** alternar o filtro entre marco, abril e agosto confirmando que as regras exibidas e os rankings mudam conforme a versao, e que Maquiagem reaparece fora de agosto.

---

## 7. Riscos

### 7.1 Ingestao de dados parada (fora do escopo, bloqueante)

A tabela `trinks_services` contem dados apenas de **abril/2026** (1.352 servicos, 22 profissionais). Maio, junho e julho estao vazios — a automacao de importacao do Trinks parou ha aproximadamente tres meses. Nenhuma meta de agosto sera medida enquanto isso nao for resolvido. Deve ser tratado antes de 01/08/2026, em trabalho separado.

### 7.2 Metas de servico especial acima do historico

O historico de abril registra 1 cronograma capilar, no maximo 3 SPAs por profissional e 5 limpezas de pele (concentradas em uma unica esteticista). As metas de 10 unidades por categoria estao deliberadamente acima do observado, refletindo a decisao da gestao de empurrar esses servicos. E uma escolha de negocio consciente, nao um erro de calibragem — mas convem acompanhar a adesao na primeira quinzena.

### 7.3 Divergencia entre hooks de scoring

`useProfessionalDetails` reimplementa as regras de pontuacao dos hooks de categoria. Toda alteracao precisa ser aplicada nos dois lugares, sob pena de o modal de detalhes exibir pontuacao diferente do ranking. O motor comum em `src/lib/scoring.ts` reduz essa superficie, mas nao a elimina nesta entrega.
