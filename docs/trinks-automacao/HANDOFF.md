# HANDOFF — Automatizar `trinks_services` via API Trinks (sem CSV manual)

> **Para:** projeto consumidor de `trinks_services` (destaque-mensal-pro-v4 / studio-x1-rank-up).
> **De:** financeiro-studiox (dono do mirror Trinks).
> **Ambiente:** Estabelecimento `174976` · Supabase `kxgrprxyqeuffhczaznl` · n8n `workflows.studiox.com.br`.
> **Status:** solução provada com dados de produção (reconstrução idêntica ao CSV até o centavo). Nada aplicado no banco — este documento é a especificação de implementação.

---

## 1. TL;DR

O CSV manual pode ser aposentado. Tudo que ele entrega já está na API, e o mirror do financeiro já a consome diariamente.

O problema dos IDs de profissional é real, total e silencioso — mas tem solução determinística:

| | |
|---|---|
| **Problema** | `/v1/transacoes` e `/v1/profissionais` usam **espaços de ID disjuntos**. Interseção medida: **0 de 22**. |
| **Armadilha** | As faixas numéricas **se sobrepõem** (147.004–715.044 vs 593.837–924.461). Um ID trocado parece plausível — nenhuma validação de intervalo detecta. |
| **Brecha** | `cliente_id` e `servico_id` **são compartilhados** entre `/v1/agendamentos` e `/v1/transacoes`. O agendamento traz o profissional no espaço que `trinks_services.profissionalid` já usa. Essa é a Pedra de Roseta. |
| **Resultado** | De-para derivado: **22/22 profissionais, 100% de consistência, bijetivo, zero ambiguidade**. |
| **Prova** | Abril/2026 reconstruído da API: **1.352 linhas / R$ 140.795,75** — idêntico ao CSV importado à mão. |
| **Cadência** | Madrugada (15 dias) + de hora em hora das 09:30 às 21:30 (dia corrente). **Segunda a sábado** — domingo não roda. |
| **Custo** | **~600 req/mês** de uma cota de 10.000 (folga de ~90%). |

---

## 2. O que já existe (inventário)

### 2.1 Ingestão Trinks → Supabase

Workflow n8n **`trinks_daily_mirror`** (`af1laBdzN8dlu9cM`, **ativo**), cron `0 3 * * *` America/Manaus — logo após o `f360_daily_mirror` (02h).

Janela: `dataInicio = D-1`, `dataFim = D` (agendamentos, **inclusive**) / `D+1` (transações, **exclusive**). 4 ramos paralelos, `requestInterval: 1100ms`.

| Ramo | Endpoint | Tabela destino | Volume atual |
|---|---|---|---|
| Transações | `GET /v1/transacoes` (`incluirEstornos=false`) | `financeiro_studiox_trinks_transacoes_mirror` | 2.789 linhas (01/04 → 24/07) |
| Agendamentos | `GET /v1/agendamentos` | `financeiro_studiox_trinks_agendamentos_mirror` | 6.370 linhas (01/04 → 25/07) |
| Profissionais | `GET /v1/profissionais` | `profissionais_ativos` (upsert por `profissionalId`) | 22 linhas |
| Formas pgto | `GET /v1/formaspagamentos` | `financeiro_studiox_trinks_formaspagamentos_mirror` | — |

Outras tabelas Trinks: `financeiro_studiox_trinks_lancamentos_mirror` (despesas, via `trinks_despesas_daily` / `VZbTGFiZGfFvw73S`) e `financeiro_studiox_trinks_faturamento_profissional` (agregado).

**Este job continua como está.** Os novos jobs são aditivos e não o substituem.

### 2.2 Estrutura da transação (payload real, não a doc)

Campos que a API **de fato** devolve, verificados em 2.789 registros:

```jsonc
{
  "id": 278434818,                          // PK global da transação
  "dataHora": "2026-07-24T19:47:43",        // sem timezone → já é hora de Manaus
  "dataReferencia": "2026-07-24T19:47:43",
  "cliente":  { "id": 83311789, "nome": "..." },
  "servicos": [{
      "id": 11990496,                       // ID do serviço no catálogo
      "nome": "Escova",
      "descricao": "Escova + Hidratação Simples",
      "categoria": "Cabelo",
      "duracaoEmMinutos": 60,
      "preco": 60,
      "idProfissionalQueRealizouServico": 638188   // ⚠️ ESPAÇO "PESSOA"
  }],
  "produtos": [{
      "id": 0, "nome": "...", "quantidade": 1, "valorUnitario": 0,
      "IdProfissionalQueRealizouAVenda": 362485    // ⚠️ ESPAÇO "PESSOA" (I maiúsculo!)
  }],
  "pacotes": [],                            // sempre vazio no Studio X (0 de 2.789)
  "formasPagamentos": [{ "nome": "PIX", "valor": 120, "parcelas": 1 }],
  "descontos": 0, "troco": 0, "totalPagar": 120,
  "etiquetasAssociadas": [], "codigoExternoPagamento": null
}
```

Não existe nome do profissional na transação — **só o ID**. Daí o problema.

### 2.3 O workflow atual do CSV (`jM3L50jNlIp9yzyn`)

`formTrigger` (upload manual) → `extractFromFile` → Code (parser LATIN1, header na linha 8, separador `;`) → `TRUNCATE trinks_services RESTART IDENTITY` → insert → `UPDATE ... SET profissionalid = pa."profissionalId" ... WHERE ts.professional = pa.nome_profissional`.

Três fragilidades que a automação elimina:
1. **`TRUNCATE` + `id = randomBigInt()`** — sem idempotência; qualquer reimportação é destrutiva, carga incremental é impossível.
2. **Join por nome** — **47 das 1.352 linhas de abril ficaram com `profissionalid = NULL`**, incluindo 2 serviços de R$ 2.215,00 da Paula. Nome é chave frágil.
3. **Dado sempre defasado** — depende de alguém exportar o relatório.

Colunas `servicoid`, `clienteid`, `produtoid`, `produto_name` existem e estão **100% NULL** hoje. A API preenche todas.

---

## 3. Anatomia do problema de IDs (provado)

A Trinks opera **dois espaços de identificador de profissional** e não documenta isso na referência da API — só aparece implicitamente no payload dos webhooks.

| | **Espaço E** — "no estabelecimento" | **Espaço P** — "pessoa / global" |
|---|---|---|
| Nome no webhook | `IdDoProfissionalNoEstabelecimento` | `IdDoProfissional` |
| `GET /v1/profissionais` → `id` | ✅ | — |
| `GET /v1/agendamentos` → `profissional.id` | ✅ | — |
| `GET /v1/agendamentos/profissionais/{data}` → `id` | ✅ | — |
| `GET /v1/profissionais/{id}/servicos` | ✅ aceita | ❌ **404** |
| `GET /v1/transacoes` → `servicos[].idProfissionalQueRealizouServico` | — | ✅ |
| `GET /v1/transacoes` → `produtos[].IdProfissionalQueRealizouAVenda` | — | ✅ |
| Webhook `IdsDosProfissionaisEmServicos[]` | — | ✅ |
| `profissionais_ativos."profissionalId"` | ✅ | — |
| **`trinks_services.profissionalid`** | ✅ | — |

### Medições

```
IDs distintos em /v1/transacoes ....................... 22   (faixa 147.004 – 715.044)
IDs distintos em /v1/agendamentos ..................... 23   (faixa       0 – 912.417)
IDs distintos em /v1/profissionais .................... 22   (faixa 593.837 – 924.461)

transacoes ∩ profissionais ............................  0   ← disjuntos
transacoes ∩ agendamentos .............................  0   ← disjuntos
agendamentos ∩ profissionais .......................... 19   ← MESMO espaço
```

Os 4 agendamentos fora de `profissionais_ativos`: 3 ex-profissionais (Stefanny `798219`, Sarah Jayne `853281`, Letícia `666471`) + `id = 0` (agendamento sem profissional). **`profissionais_ativos` é fotografia do presente, não histórico.**

### Provas independentes

**(a) Teste na API.** Ricardo Diogo — espaço E = `804415`, espaço P = `638188`:

```
GET /v1/profissionais/804415/servicos → 200  (retorna o catálogo dele)
GET /v1/profissionais/638188/servicos → 404  "Profissional com ID 638188 não foi encontrado"
```

**(b) Prova cruzada no banco.** O workflow `Webhook Trinks - Geral` (`yTCvrwWynVGB3dqo`, ativo) grava `professional_id` a partir de `IdDoProfissionalNoEstabelecimento`:

```
gerencia-fila-trinks-appointments.professional_id → 18/18 no espaço E · 0/18 no espaço P
```

Isso ancora a nomenclatura: **`IdDoProfissionalNoEstabelecimento` = espaço E**, logo `IdDoProfissional` = espaço P.

### ⚠️ Por que isso é perigoso

As faixas **se sobrepõem**. `638188` (espaço P) cai no meio do intervalo do espaço E — nenhuma validação de range, dígito ou formato detecta a troca. O sintoma seria silencioso: linhas atribuídas ao profissional errado ou órfãs, sem erro nenhum.

---

## 4. A solução

### 4.1 A brecha: `cliente_id` e `servico_id` são compartilhados

```
servico_id : agendamentos ∩ transações = 142/142  (faixas idênticas: 11.315.127 – 15.355.177)
cliente_id : agendamentos ∩ transações = 1.440/1.442
```

Como o agendamento carrega o profissional no espaço E e a transação no espaço P, a tupla **(cliente_id, servico_id, dia)** liga os dois lados e revela o par.

### 4.2 Cobertura da ponte

```
Itens de serviço em transações .................... 5.228
  ├─ sem agendamento correspondente ...............     0   (0,0 %)
  ├─ match ÚNICO (1 agendamento) .................. 4.799
  └─ match ambíguo (2+ agendamentos) ..............   429
```

**Zero** serviço vendido sem agendamento. A ponte é completa.

### 4.3 De-para derivado (resultado real)

Usando **apenas** os 4.799 matches únicos, por votação: **22 de 22** mapeados, **100 % dos votos concordantes** em todos, **bijetivo**, votos de 2 (Andressa) a 389 (Jeniffer).

| espaço P (transações) | → espaço E (agenda) | profissional |
|---:|---:|---|
| 147004 | 740783 | Elda Batista da Silva |
| 208140 | 649472 | Brenda Shelry Ferreira Gomes |
| 344363 | 684646 | Nerijane Queiroz Pereira (*Jane*) |
| 362485 | 784816 | Talita da Silva Gomes |
| 391281 | 885975 | Aline Cristina da Rocha Lopes |
| 525423 | 648177 | Andressa Fabiane Reis da Silva |
| 526564 | 649644 | Ana Paula Rodrigues Ribeiro (*Paula*) |
| 527210 | 853281 | Sarah Jayne dos Santos Monteiro |
| 539014 | 666471 | Letícia Ruana da Silva Gomes |
| 572731 | 788088 | Michelle Barroso dos Santos |
| 630330 | 793041 | Rilley Firmino de Albuquerque |
| 633872 | 798219 | Stefanny Monteiro dos Santos Silva |
| 638188 | 804415 | Ricardo Diogo Loureiro Barbosa |
| 642088 | 809861 | Thayna Torres Rocha |
| 656056 | 829346 | Emanuelle Ribeiro Araujo (*Manu*) |
| 672603 | 849997 | Jessica Alves da Silva |
| 672609 | 850004 | Jeniffer Pena Lima |
| 672769 | 850213 | Debora Marques de Albuquerque |
| 688912 | 874635 | Yago dos Santos Almeida |
| 689997 | 876180 | Lucas Martins Alves |
| 711180 | 906607 | Danielle Marques de Azevedo |
| 715044 | 912417 | Ashley Safira Moraes Mendes |

Não há fórmula (nem offset, nem monotônico) — o mapa tem de ser materializado.

### 4.4 Validação contra o CSV — abril/2026

```
API abril · serviços ......  1.306 itens   R$ 135.640,88
API abril · produtos ......     46 itens   R$   5.154,87
                              ───────────  ──────────────
                              1.352 itens   R$ 140.795,75

CSV importado .............   1.352 linhas  R$ 140.795,75      ✅ idêntico
```

**16 de 20 profissionais com delta exatamente zero** (contagem *e* valor). As 4 divergências, todas **defeitos do CSV**:

| Profissional | Δ | Causa |
|---|---|---|
| Talita | −1 linha, −R$ 46,00 | *Pasta esfoliante* — é **produto**, está em `produtos[]` |
| Sarah | −1 linha, −R$ 100,00 | *Óleo capilar Wella* — é **produto** |
| Ana Paula | +2 linhas, +R$ 2.215,00 | CSV tinha `profissionalid` **NULL** (join por nome falhou) |
| Andressa | +1 linha, +R$ 10,00 | idem |

A automação **corrige** 47 linhas hoje órfãs. Compatibilidade: `service_name` **110/110 idênticos**; `category = 'Tratamentos para Cabelo'` (usada pelo scoring) **125 = 125 linhas, R$ 14.710,00 = R$ 14.710,00**.

### 4.5 Velocidade de convergência do mapa

| janela | cobertos |
|---:|---:|
| 1 dia | 16 / 22 |
| 7 dias | 18 / 22 |
| 30 dias | 18 / 22 |
| 60 dias | 20 / 22 |
| 120 dias | **22 / 22** |

**Consequência:** o mapa é **cache acumulativo** (upsert incremental), nunca recalculado por janela. Bootstrap usa todo o histórico; o incremento diário só acrescenta. Profissional novo entra no primeiro dia em que atender.

### 4.6 Lacuna conhecida e sua cobertura

`produtos[].IdProfissionalQueRealizouAVenda` também vive no espaço P — e revelou **2 IDs (`484900`, `623942`) que nunca aparecem em serviços**: gente do balcão que só vende produto e nunca tem agendamento, portanto invisível para a derivação da §4.1.

Não afeta serviços (100% cobertos). Duas saídas:

- **(A) Produtos entram com `profissionalid` NULL** — visíveis, contabilizados no `sem_depara`, sem risco de atribuição errada.
- **(B) Fechar pelo webhook** — o evento **Fechamento de Conta** (`TipoDeEvento: 1`) entrega o par pronto para **todos** os envolvidos:

```jsonc
{
  "IdDaTransacao": 47999,
  "IdsDosProfissionaisEnvolvidos": [{
      "IdDosItens": [3880825, 4497],
      "IdPessoaDoProfissional": 445989,
      "IdDoProfissional": 9678,                    // espaço P
      "IdDoProfissionalNoEstabelecimento": 14073   // espaço E   ← o par, de graça
  }],
  "IdsDosProfissionaisEmServicos": [9678]
}
```

O webhook **já chega** em `yTCvrwWynVGB3dqo` e os eventos **5/6/7** (inclusão / alteração / inativação de profissional — que trazem os dois IDs + CPF) caem hoje em nós **NoOp, sem gravar nada**. Plugar um Postgres node em cada um materializa o mapa direto da fonte. Evolução natural, não pré-requisito.

---

## 5. Cadência, cota e reconciliação

### 5.1 Regime de execução

**Segunda a sábado. Domingo não roda nenhuma requisição** — o salão fecha. Confirmado nos dados: em 115 dias de mirror, **domingo não tem uma única transação**.

| Job | Cron (America/Manaus) | Janela puxada | Execuções | Papel |
|---|---|---|---|---|
| **`trinks_services_daily`** | `40 3 * * 1-6` | **últimos 15 dias** | 1/dia · 26/mês | Rede de segurança: pega alteração e exclusão retroativa, e reconcilia tudo que o intradiário não alcança. Roda também a derivação do de-para. |
| **`trinks_services_hourly`** | `30 9-21 * * 1-6` | **dia corrente** | 13/dia · 338/mês | Frescor: 09:30, 10:30, …, 21:30. |

A separação existe porque as duas coisas têm custo muito diferente: a janela de 15 dias custa 8 páginas, o dia corrente custa 1 (2 aos sábados). Rodar 15 dias de hora em hora gastaria 5× mais para reconferir dados que praticamente não mudam.

### 5.2 SLA de detecção

| Evento | Detectado em |
|---|---|
| Venda de **hoje** incluída, alterada ou excluída | até **1 hora** (próxima execução intradiária) |
| Venda de **dia anterior** (últimos 15 dias) alterada ou excluída | até a **madrugada seguinte** |
| Qualquer mudança ocorrida no **domingo** | **segunda, 03h40** |
| Mudança em venda com **mais de 15 dias** | **não é detectada** — fora da janela. Se for preciso reprocessar período antigo, rode `trinks_apply_snapshot` manualmente com a janela desejada. |

### 5.3 Orçamento de cota — 10.000 req/mês

⚠️ A cota é do **estabelecimento**, não do projeto. Todos os consumidores dividem o mesmo balde. Limite adicional: **60 req/min**.

**`pageSize` medido ao vivo — a API capa em 50**, independente do que se pede:

```
pedido= 50 → pageSize=50  totalPages=8  totalRecords=385
pedido=100 → pageSize=50  totalPages=8  totalRecords=385      ← ignora
pedido=200 → pageSize=50  totalPages=8  totalRecords=385      ← ignora
```

(O `trinks_daily_mirror` pede 100 e recebe 50; funciona só porque pagina por `totalPages`. Não replique.)

**Volume medido por dia da semana** (115 dias de mirror):

| dia | média/dia | pico | páginas (pageSize 50) |
|---|---:|---:|---:|
| segunda | 20,5 | 29 | 1 |
| terça | 14,3 | 39 | 1 |
| quarta | 17,6 | 22 | 1 |
| quinta | 26,4 | 36 | 1 |
| sexta | 38,8 | 51 | 1 (2 em 1 de 17 sextas) |
| sábado | 51,9 | 67 | 2 (em 9 de 17 sábados) |
| **domingo** | **0** | **0** | — (não roda) |

Janela de 15 dias: 385 transações → **8 páginas**.

| Consumidor | Cálculo | req/mês |
|---|---|---:|
| `trinks_daily_mirror` (financeiro, 03h, todo dia) | ~10/dia × 30 | ~300 |
| **`trinks_services_daily`** | 26 dias × 8 páginas | **208** |
| **`trinks_services_hourly`** | (5 dias × 13 × 1 + 1 sáb × 13 × 2) × 4,33 sem | **394** |
| Derivação do de-para | lê o **mirror**, não a API | 0 |
| Fallback de de-para (só quando entra profissional novo) | ~17 páginas, esporádico | ~50 |
| | **Total** | **≈ 950** |
| | **Folga sobre 10.000** | **≈ 90 %** |

O cálculo do intradiário é conservador: assume o pior caso o dia inteiro, mas as execuções da manhã veem poucas transações acumuladas e gastam 1 página mesmo aos sábados.

Fórmula para revalidar: `req/mês ≈ 26 × páginas_15dias + 4,33 × (5 × 13 × páginas_dia_util + 13 × páginas_sabado)`. O movimento poderia **mais que quadruplicar** antes de a cota apertar. Monitore: se o sábado passar de 100 transações/dia, recalcule.

### 5.4 Como detectar exclusão — reconciliação de janela

A API com `incluirEstornos=false` simplesmente **não retorna** a transação excluída/estornada. Não existe evento de "deletado" no endpoint. A única forma correta é **diff de conjunto**:

```
snapshot da API (janela)  vs  trinks_services (mesma janela)

  id só na API .................. INSERT
  id nos dois, conteúdo difere .. UPDATE  (+ mexe em created_at)
  id nos dois, conteúdo igual ... nada    (não escreve — evita I/O e ruído)
  id só no banco ................ DELETE  ← a venda sumiu do Trinks
```

**O DELETE é sempre restrito à janela que foi puxada.** O job intradiário só pode remover linhas do dia corrente — nunca toca em dias anteriores, porque não os consultou. Quem reconcilia o passado é o job da madrugada, com sua janela de 15 dias. É isso que torna seguro puxar só o dia no intradiário.

### 5.5 ⚠️ Trava fail-closed — a parte que mais pode dar errado

Um DELETE baseado em ausência é **destrutivo se o snapshot estiver incompleto**. Se a página 5 de 8 falhar por timeout, tudo que estava nela "sumiu" e seria apagado.

**Regra inegociável:** o `DELETE` só executa quando a paginação foi **comprovadamente íntegra**. O job verifica, antes de chamar a RPC:

1. Nenhuma página retornou erro / status ≠ 200;
2. Páginas percorridas ≥ `totalPages` da primeira resposta;
3. Itens coletados == `totalRecords` da primeira resposta.

Se qualquer condição falhar → chamar a RPC com **`p_completo := false`**. Ela ainda faz insert/update (nada se perde), mas **não deleta nada**. A execução seguinte reconcilia.

Sem essa trava, um timeout vira perda de dados silenciosa.

### 5.6 Novo profissional dentro do dia

O de-para é derivado do **mirror** (agendamentos), que só tem até D-1. Se alguém começa a atender hoje às 10h, os itens dele entram com `profissionalid = NULL` até a madrugada.

Fallback: quando o job detectar `sem_depara > 0`, disparar uma coleta extra de `GET /v1/agendamentos` dos últimos 15 dias e rodar a derivação com esses dados frescos. Custo ~17 requisições, só quando acontece.

---

## 6. Restrições que condicionam a arquitetura

### 6.1 RLS — o mirror do financeiro está fechado

```
financeiro_studiox_trinks_transacoes_mirror   RLS on + FORCED · SELECT policy qual = false · anon revogado
financeiro_studiox_trinks_agendamentos_mirror RLS on + FORCED · SELECT policy qual = false · anon revogado
```

**Nem `anon` nem `authenticated` leem essas tabelas** — nem com usuário logado. Só `service_role` / `postgres`.

Os jobs **têm de ser server-side** (n8n com credencial Postgres, Edge Function com service_role, ou RPC `SECURITY DEFINER`). Ler o mirror do front-end devolve vazio, sem erro.

### 6.2 Fronteira entre projetos

Os jobs escrevem **apenas em `trinks_services`** e nas tabelas novas do §8. **Não escrevem no mirror do financeiro.** Fronteira limpa — o outro projeto não altera o domínio financeiro.

*Oportunidade de fase 2 (decisão do owner):* como os jobs já puxam a API, poderiam alimentar `financeiro_studiox_trinks_transacoes_mirror` no mesmo movimento, dando ao financeiro frescor intradiário de graça. Verificado: as únicas triggers ali são de `updated_at` (`financeiro_studiox_set_updated_at`), sem efeito colateral. Fica fora do escopo desta entrega.

### 6.3 ⚠️ Achado de segurança colateral (fora do escopo, mas reporte)

`trinks_services` está **totalmente aberta ao papel `public`**:

```
Public can view   trinks_services  SELECT  USING (true)
Public can insert trinks_services  INSERT
Public can update trinks_services  UPDATE  USING (true)
Public can delete trinks_services  DELETE  USING (true)
```

Com a chave `anon` (que vai no bundle do front) qualquer pessoa **lê nomes de clientes e pode apagar a tabela inteira**. Ao migrar, revogar `INSERT/UPDATE/DELETE` de `anon`/`authenticated` (a escrita passa a ser só dos jobs server-side) e avaliar se `client_name` precisa ser público.

---

## 7. Arquitetura

```
                       (já existe — não mexer)
  API Trinks ──► trinks_daily_mirror (n8n, 03h todo dia)
                          ├──► financeiro_studiox_trinks_transacoes_mirror
                          ├──► financeiro_studiox_trinks_agendamentos_mirror
                          └──► profissionais_ativos
                                   │
   ┌───────────────────────────────┴────────────────── NOVO ───────────────────────────────┐
   │ trinks_services_daily   ·  cron 40 3 * * 1-6                                          │
   │   1. trinks_refresh_profissional_id_map(400, 2)   ← lê o MIRROR, 0 req à API          │
   │   2. GET /v1/transacoes  janela = últimos 15 dias  (8 páginas)                        │
   │   3. valida integridade → trinks_sync_executar(snapshot, completo, 15)                │
   │                                                                                       │
   │ trinks_services_hourly  ·  cron 30 9-21 * * 1-6   (09:30 … 21:30)                     │
   │   1. GET /v1/transacoes  janela = dia corrente     (1–2 páginas)                      │
   │   2. valida integridade → trinks_sync_executar(snapshot, completo, 1)                 │
   │                                                                                       │
   │   ambos:  INSERT / UPDATE / DELETE  →  trinks_services   ·   log  →  trinks_sync_log  │
   └───────────────────────────────────────────────────────────────────────────────────────┘
                                   ▼
                            trinks_services  ◄── consumidor lê como sempre (contrato intacto)
```

**Princípios:**
1. **Janela proporcional ao custo** — 15 dias uma vez ao dia; dia corrente de hora em hora.
2. **Contrato preservado** — `trinks_services` mantém colunas, tipos e formatos. O consumidor não muda uma linha.
3. **Idempotente** — sem `TRUNCATE`. `id` estável = `transacao_id * 1000 + ordinalidade`. Reprocessar dá o mesmo resultado.
4. **Fail-closed** — item sem de-para entra com `profissionalid = NULL` e conta como alerta; snapshot incompleto não deleta nada; DELETE nunca sai da janela consultada.
5. **Delta-only** — linha sem mudança não é reescrita (`created_at` preservado).

### Chave primária estável

```
id = transacao_id * 1000 + ordinalidade_do_item        (produtos usam offset +500)
max transacao_id observado ....... 278.434.818
chave máxima projetada ........... 278.434.818.600   (bigint suporta 9,2×10¹⁸) ✅
máx. itens por transação ..........          11      (folga de ~45×)           ✅
```

---

## 8. SQL de implementação

> Aplicar em `kxgrprxyqeuffhczaznl` via `apply_migration`. Ordem: 8.1 → 8.2 → 8.3 → 8.4 → 8.5 → bootstrap §9.

### 8.1 Tabelas de apoio

```sql
-- De-para dos dois espaços de ID
CREATE TABLE IF NOT EXISTS public.trinks_profissional_id_map (
  id_pessoa          bigint PRIMARY KEY,             -- espaço P (transações)
  id_estabelecimento bigint NOT NULL UNIQUE,         -- espaço E — UNIQUE garante bijeção
  nome_completo      text,
  apelido            text,                           -- congelado: profissionais_ativos é só o presente
  fonte              text NOT NULL DEFAULT 'derivado_agenda',
  votos              integer NOT NULL DEFAULT 0,
  confianca          numeric(6,4),
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trinks_map_fonte_ck CHECK (fonte IN
    ('derivado_agenda','webhook_profissional','webhook_fechamento','manual'))
);
ALTER TABLE public.trinks_profissional_id_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trinks_profissional_id_map FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.trinks_profissional_id_map FROM anon, authenticated;

-- Quarentena: candidatos rejeitados (voto insuficiente, ambiguidade, conflito de bijeção)
CREATE TABLE IF NOT EXISTS public.trinks_profissional_id_map_quarentena (
  id           bigserial PRIMARY KEY,
  id_pessoa    bigint NOT NULL,
  candidatos   jsonb  NOT NULL,
  motivo       text   NOT NULL,
  detectado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trinks_profissional_id_map_quarentena ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trinks_profissional_id_map_quarentena FROM anon, authenticated;

-- Log de execução (também serve de "última verificação" para a UI)
CREATE TABLE IF NOT EXISTS public.trinks_sync_log (
  id                    bigserial PRIMARY KEY,
  executado_em          timestamptz NOT NULL DEFAULT now(),
  origem                text,                     -- 'daily' | 'hourly' | 'manual'
  janela_desde          date    NOT NULL,
  janela_ate            date    NOT NULL,
  snapshot_completo     boolean NOT NULL,
  transacoes_recebidas  integer,
  inseridos             integer,
  atualizados           integer,
  excluidos             integer,
  inalterados           integer,
  sem_depara            integer,
  duracao_ms            integer,
  erro                  text
);
CREATE INDEX IF NOT EXISTS idx_trinks_sync_log_exec ON public.trinks_sync_log (executado_em DESC);
ALTER TABLE public.trinks_sync_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trinks_sync_log FROM anon, authenticated;
-- Se a UI precisar exibir "última atualização", libere só leitura:
-- GRANT SELECT ON public.trinks_sync_log TO authenticated;
-- CREATE POLICY trinks_sync_log_read ON public.trinks_sync_log FOR SELECT TO authenticated USING (true);
```

### 8.2 Derivação incremental do de-para (lê o mirror, 0 req à API)

Aceite: **unanimidade** entre matches únicos **e** `votos >= p_min_votos` (default 2 — piso observado em produção). Fora disso, vai para quarentena, nunca para o mapa.

```sql
CREATE OR REPLACE FUNCTION public.trinks_refresh_profissional_id_map(
  p_dias      integer DEFAULT 60,
  p_min_votos integer DEFAULT 2
) RETURNS TABLE (acao text, id_pessoa bigint, id_estabelecimento bigint, votos integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH tx AS (
    SELECT (t.raw_json->'cliente'->>'id')::bigint            AS cliente_id,
           (s->>'id')::bigint                                AS servico_id,
           (s->>'idProfissionalQueRealizouServico')::bigint  AS pid_p,
           (t.data_hora AT TIME ZONE 'America/Manaus')::date AS dia
    FROM financeiro_studiox_trinks_transacoes_mirror t,
         LATERAL jsonb_array_elements(t.servicos) s
    WHERE t.data_hora >= now() - make_interval(days => p_dias)
      AND s->>'idProfissionalQueRealizouServico' IS NOT NULL
  ),
  cand AS (   -- só matches ÚNICOS: exatamente 1 agendamento para (cliente, serviço, dia)
    SELECT x.pid_p, a.profissional_id AS pid_e, a.profissional_nome,
           count(*) OVER (PARTITION BY x.cliente_id, x.servico_id, x.dia) AS n_ag
    FROM tx x
    JOIN financeiro_studiox_trinks_agendamentos_mirror a
      ON a.cliente_id = x.cliente_id
     AND a.servico_id = x.servico_id
     AND (a.data_hora_inicio AT TIME ZONE 'America/Manaus')::date = x.dia
    WHERE a.profissional_id > 0
  ),
  votos AS (
    SELECT pid_p, pid_e, max(profissional_nome) AS nome, count(*)::int AS v
    FROM cand WHERE n_ag = 1 GROUP BY 1, 2
  ),
  agg AS (
    SELECT pid_p,
           count(*)                              AS n_destinos,
           (array_agg(pid_e ORDER BY v DESC))[1] AS pid_e,
           (array_agg(nome  ORDER BY v DESC))[1] AS nome,
           max(v)                                AS v_top,
           sum(v)::int                           AS v_tot
    FROM votos GROUP BY 1
  ),
  quarentena AS (
    INSERT INTO trinks_profissional_id_map_quarentena (id_pessoa, candidatos, motivo)
    SELECT a.pid_p,
           (SELECT jsonb_agg(jsonb_build_object('id_estabelecimento', v.pid_e, 'votos', v.v))
              FROM votos v WHERE v.pid_p = a.pid_p),
           CASE WHEN a.n_destinos > 1 THEN 'ambiguo_multiplos_destinos'
                ELSE 'votos_insuficientes' END
    FROM agg a
    WHERE (a.n_destinos > 1 OR a.v_top < p_min_votos)
      AND NOT EXISTS (SELECT 1 FROM trinks_profissional_id_map m WHERE m.id_pessoa = a.pid_p)
    RETURNING 1
  ),
  aceitos AS (
    SELECT a.pid_p, a.pid_e, a.nome, a.v_top, a.v_tot
    FROM agg a
    WHERE a.n_destinos = 1 AND a.v_top >= p_min_votos
      AND NOT EXISTS (   -- trava de bijeção: destino já usado por outra origem
        SELECT 1 FROM trinks_profissional_id_map m
        WHERE m.id_estabelecimento = a.pid_e AND m.id_pessoa <> a.pid_p)
  ),
  gravado AS (
    INSERT INTO trinks_profissional_id_map AS m
      (id_pessoa, id_estabelecimento, nome_completo, apelido, fonte, votos, confianca)
    SELECT ac.pid_p, ac.pid_e, ac.nome,
           (SELECT pa.nome_profissional FROM profissionais_ativos pa
             WHERE pa."profissionalId" = ac.pid_e),
           'derivado_agenda', ac.v_top, ac.v_top::numeric / NULLIF(ac.v_tot, 0)
    FROM aceitos ac
    -- fix 2026-07-29: ON CONFLICT ON CONSTRAINT evita colisão com a variável OUT id_pessoa (RETURNS TABLE)
    ON CONFLICT ON CONSTRAINT trinks_profissional_id_map_pkey DO UPDATE SET
      votos         = GREATEST(m.votos, EXCLUDED.votos),
      confianca     = EXCLUDED.confianca,
      nome_completo = COALESCE(EXCLUDED.nome_completo, m.nome_completo),
      apelido       = COALESCE(EXCLUDED.apelido,       m.apelido),  -- nunca apaga apelido histórico
      updated_at    = now()
    WHERE m.id_estabelecimento = EXCLUDED.id_estabelecimento        -- só atualiza se o destino não mudou
    RETURNING (xmax = 0) AS inserido, m.id_pessoa, m.id_estabelecimento, m.votos
  )
  SELECT CASE WHEN g.inserido THEN 'inserido' ELSE 'atualizado' END,
         g.id_pessoa, g.id_estabelecimento, g.votos
  FROM gravado g;
END $$;

REVOKE ALL ON FUNCTION public.trinks_refresh_profissional_id_map(integer, integer) FROM PUBLIC, anon, authenticated;
```

> **Atualizada em 2026-07-30** por `20260730235500_trinks_map_webhook_reversibilidade.sql` (Task 9).
> O código acima é a versão anterior — a vigente difere em três pontos, todos para tornar o par
> derivado **soberano sobre par de webhook não corroborado** (`votos = 0 AND fonte LIKE 'webhook%'`):
> 1. O `ON CONFLICT` passou a incluir `id_estabelecimento = EXCLUDED.id_estabelecimento` no `SET`, e
>    o `WHERE` ganhou `OR (m.votos = 0 AND m.fonte LIKE 'webhook%')` — antes o destino divergente
>    **nunca** era corrigido, nem com 300 votos contra.
> 2. Candidato barrado pela trava de bijeção passou a gerar quarentena
>    (`motivo = 'bijecao_bloqueada'`); antes o descarte era silencioso. E só destino ocupado por
>    entrada **corroborada** (`votos > 0`) barra — squatter de webhook é despejado.
> 3. O corpo virou multi-statement com temp table `_trinks_agg`: o despejo do squatter tem de ser um
>    statement **anterior** ao INSERT, senão o UNIQUE de `id_estabelecimento` estoura (CTEs de um
>    mesmo comando compartilham snapshot e não veriam o DELETE).
>
> Ao gravar um par, a função marca `resolvido_em = now()` nos conflitos abertos daquele `id_pessoa`
> (coluna nova em `trinks_profissional_id_map_quarentena`; o watchdog alerta enquanto for NULL).
>
> Motivo: a Task 9 passou a aceitar o par vindo do webhook, cuja barra de evidência é um POST não
> autenticado. Sem essas mudanças, uma escrita ruim — ataque **ou** payload legítimo com quirk —
> fixava um profissional com `profissionalid` inexistente em `profissionais_ativos`, tirando-o do
> ranking e da premiação **permanentemente**, e o alerta se calava em 24h. Agora o erro dura no
> máximo um ciclo diário e fica visível na quarentena.

### 8.3 Tradução de categoria (compatibilidade com o CSV)

As categorias **divergem** entre relatório CSV e API. Mapa 1:1 medido sobre os serviços em comum:

| API (`servicos[].categoria`) | CSV (`trinks_services.category`) | serviços |
|---|---|---:|
| `Cabelo` | `Serviços para o cabelo.` | 29 |
| `Tratamentos para Cabelo` | `Tratamentos para Cabelo` (igual) | 26 |
| `Manicure e Pedicure` | `Manicure e Pedicure` (igual) | 21 |
| `Estética Facial` | `Serviços de estética facial.` | 12 |
| `Depilação` | `Serviços de depilação.` | 9 |
| `Sobrancelha` | `Serviços de sobrancelha.` | 7 |
| `Estética Corporal` | `Serviços de estética corporal` (**sem** ponto final) | 3 |
| `Maquiagem` | `Serviços de maquiagem.` | 2 |
| `Outros` | `Outros` (igual) | 1 |

Repare nos pontos finais e na ausência dele em *estética corporal* — copiar literalmente. `Pedicure` (serviço *Pedicure - Reflexologia*) surgiu em jun/2026 sem correspondente no CSV: **categorias novas aparecem com o tempo**, por isso o fallback devolve o valor original em vez de `NULL`.

```sql
CREATE OR REPLACE FUNCTION public.trinks_categoria_csv(p_api text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_api
    WHEN 'Cabelo'            THEN 'Serviços para o cabelo.'
    WHEN 'Estética Facial'   THEN 'Serviços de estética facial.'
    WHEN 'Estética Corporal' THEN 'Serviços de estética corporal'
    WHEN 'Depilação'         THEN 'Serviços de depilação.'
    WHEN 'Sobrancelha'       THEN 'Serviços de sobrancelha.'
    WHEN 'Maquiagem'         THEN 'Serviços de maquiagem.'
    ELSE p_api   -- Tratamentos para Cabelo, Manicure e Pedicure, Outros, Pedicure, futuras…
  END $$;
```

> Para migrar à nomenclatura da API (mais limpa), troque `trinks_categoria_csv(...)` por `el->>'categoria'` no §8.4 — **mas revise antes** `src/lib/scoring.ts`: o `specialServiceMatch` do tipo `category` compara com `"Tratamentos para Cabelo"`, idêntico nas duas fontes, então esse caso não quebra.

### 8.4 Reconciliação — a função central

Recebe o snapshot da API como `jsonb` e aplica insert/update/delete numa única transação. Serve às duas cadências — só muda a janela.

```sql
CREATE OR REPLACE FUNCTION public.trinks_apply_snapshot(
  p_desde            date,
  p_ate              date,
  p_transacoes       jsonb,                  -- array cru de /v1/transacoes (todas as páginas)
  p_completo         boolean DEFAULT false,  -- true SOMENTE se a paginação foi íntegra ⇒ habilita DELETE
  p_incluir_produtos boolean DEFAULT true
) RETURNS TABLE (inseridos int, atualizados int, excluidos int, inalterados int, sem_depara int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dias text[];
  v_ins int; v_upd int; v_del int; v_tot int; v_nil int;
BEGIN
  -- Janela como lista literal de datas 'DD/MM/YYYY' → usa o índice btree existente em service_date.
  -- (to_date() é STABLE no Postgres, então NÃO dá para indexar por expressão — ver §10.)
  SELECT array_agg(to_char(d, 'DD/MM/YYYY'))
    INTO v_dias
    FROM generate_series(p_desde, p_ate, interval '1 day') d;

  WITH alvo AS (
    -- SERVIÇOS
    SELECT (t.el->>'id')::bigint * 1000 + it.ord                        AS id,
           to_char(((t.el->>'dataHora')::timestamp)::date,'DD/MM/YYYY') AS service_date,
           it.el->>'nome'                                               AS service_name,
           trinks_categoria_csv(it.el->>'categoria')                    AS category,
           (it.el->>'preco')::numeric                                   AS value,
           (it.el->>'id')::text                                         AS servicoid,
           NULL::text                                                   AS produtoid,
           NULL::text                                                   AS produto_name,
           (it.el->>'idProfissionalQueRealizouServico')::bigint         AS pid_p,
           (t.el->'cliente'->>'id')::text                               AS clienteid,
           t.el->'cliente'->>'nome'                                     AS client_name
    FROM jsonb_array_elements(p_transacoes) t(el),
         LATERAL jsonb_array_elements(t.el->'servicos') WITH ORDINALITY AS it(el, ord)

    UNION ALL

    -- PRODUTOS (offset +500 na ordinalidade evita colisão com serviços)
    SELECT (t.el->>'id')::bigint * 1000 + 500 + it.ord,
           to_char(((t.el->>'dataHora')::timestamp)::date,'DD/MM/YYYY'),
           it.el->>'nome',
           NULL,                                    -- a API não categoriza produto
           (it.el->>'valorUnitario')::numeric * COALESCE((it.el->>'quantidade')::int, 1),
           NULL, (it.el->>'id')::text, it.el->>'nome',
           (it.el->>'IdProfissionalQueRealizouAVenda')::bigint,
           (t.el->'cliente'->>'id')::text,
           t.el->'cliente'->>'nome'
    FROM jsonb_array_elements(p_transacoes) t(el),
         LATERAL jsonb_array_elements(t.el->'produtos') WITH ORDINALITY AS it(el, ord)
    WHERE p_incluir_produtos
  ),
  resolvido AS (
    SELECT a.id, a.service_date,
           COALESCE(m.apelido, pa.nome_profissional, m.nome_completo) AS professional,
           a.service_name, a.category, a.client_name, a.value, a.servicoid,
           m.id_estabelecimento::text AS profissionalid,     -- ✅ espaço E, o que o consumidor espera
           a.produtoid, a.produto_name, a.clienteid
    FROM alvo a
    LEFT JOIN trinks_profissional_id_map m ON m.id_pessoa = a.pid_p
    LEFT JOIN profissionais_ativos pa      ON pa."profissionalId" = m.id_estabelecimento
  ),
  ins AS (
    INSERT INTO trinks_services AS ts
      (id, service_date, professional, service_name, category, client_name,
       value, servicoid, profissionalid, produtoid, produto_name, clienteid, created_at)
    SELECT r.id, r.service_date, r.professional, r.service_name, r.category, r.client_name,
           r.value, r.servicoid, r.profissionalid, r.produtoid, r.produto_name, r.clienteid,
           to_char(now() AT TIME ZONE 'America/Manaus', 'YYYY-MM-DD"T"HH24:MI:SS.MS-04:00')
    FROM resolvido r
    ON CONFLICT (id) DO UPDATE SET
      service_date = EXCLUDED.service_date, professional   = EXCLUDED.professional,
      service_name = EXCLUDED.service_name, category       = EXCLUDED.category,
      client_name  = EXCLUDED.client_name,  value          = EXCLUDED.value,
      servicoid    = EXCLUDED.servicoid,    profissionalid = EXCLUDED.profissionalid,
      produtoid    = EXCLUDED.produtoid,    produto_name   = EXCLUDED.produto_name,
      clienteid    = EXCLUDED.clienteid,    created_at     = EXCLUDED.created_at
    WHERE (ts.service_date, ts.professional, ts.service_name, ts.category, ts.client_name,
           ts.value, ts.servicoid, ts.profissionalid, ts.produtoid, ts.produto_name, ts.clienteid)
      IS DISTINCT FROM
          (EXCLUDED.service_date, EXCLUDED.professional, EXCLUDED.service_name, EXCLUDED.category,
           EXCLUDED.client_name, EXCLUDED.value, EXCLUDED.servicoid, EXCLUDED.profissionalid,
           EXCLUDED.produtoid, EXCLUDED.produto_name, EXCLUDED.clienteid)
    RETURNING (xmax = 0) AS inserido
  ),
  del AS (
    -- Só deleta quando o snapshot é íntegro (§5.5) E apenas dentro da janela consultada (§5.4).
    -- Compara contra `resolvido` (não contra a tabela): linhas recém-inseridas estão protegidas.
    DELETE FROM trinks_services ts
    WHERE p_completo
      AND ts.service_date = ANY (v_dias)
      AND NOT EXISTS (SELECT 1 FROM resolvido r WHERE r.id = ts.id)
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins WHERE inserido)::int,
         (SELECT count(*) FROM ins WHERE NOT inserido)::int,
         (SELECT count(*) FROM del)::int,
         (SELECT count(*) FROM resolvido)::int,
         (SELECT count(*) FROM resolvido WHERE profissionalid IS NULL)::int
    INTO v_ins, v_upd, v_del, v_tot, v_nil;

  RETURN QUERY SELECT v_ins, v_upd, v_del, (v_tot - v_ins - v_upd), v_nil;
END $$;

REVOKE ALL ON FUNCTION public.trinks_apply_snapshot(date, date, jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;
```

### 8.5 Wrapper com log — chamado pelos dois workflows

```sql
CREATE OR REPLACE FUNCTION public.trinks_sync_executar(
  p_transacoes jsonb,
  p_completo   boolean,
  p_dias       integer DEFAULT 1,      -- 15 no job da madrugada, 1 no intradiário
  p_origem     text    DEFAULT 'hourly'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desde date; v_ate date; v_t0 timestamptz := clock_timestamp(); r record;
BEGIN
  v_ate   := (now() AT TIME ZONE 'America/Manaus')::date;
  v_desde := v_ate - (p_dias - 1);          -- p_dias = 1 → janela do dia corrente

  SELECT * INTO r FROM trinks_apply_snapshot(v_desde, v_ate, p_transacoes, p_completo, true);

  INSERT INTO trinks_sync_log (origem, janela_desde, janela_ate, snapshot_completo,
                               transacoes_recebidas, inseridos, atualizados, excluidos,
                               inalterados, sem_depara, duracao_ms)
  VALUES (p_origem, v_desde, v_ate, p_completo, jsonb_array_length(p_transacoes),
          r.inseridos, r.atualizados, r.excluidos, r.inalterados, r.sem_depara,
          (extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int);

  RETURN jsonb_build_object('origem', p_origem, 'janela_desde', v_desde, 'janela_ate', v_ate,
    'snapshot_completo', p_completo, 'inseridos', r.inseridos, 'atualizados', r.atualizados,
    'excluidos', r.excluidos, 'inalterados', r.inalterados, 'sem_depara', r.sem_depara);
END $$;

REVOKE ALL ON FUNCTION public.trinks_sync_executar(jsonb, boolean, integer, text) FROM PUBLIC, anon, authenticated;
```

### 8.6 Workflows n8n

Versões confirmadas via `get_node`: `scheduleTrigger` **1.3**, `postgres` **2.6**, `httpRequest` **4.4**, `code` **2**.

⚠️ **Defina `settings.timezone: "America/Manaus"` em cada workflow** — não confie no default da instância. Com o cron filtrando dia da semana (`1-6`), um timezone errado não só desloca o horário como **pula o sábado à noite** (21:30 Manaus = 01:30 UTC de domingo).

Os dois workflows têm a mesma espinha dorsal; mudam o cron, a janela e dois parâmetros da RPC.

**Workflow A — `trinks_services_daily`** · cron `40 3 * * 1-6`

```
scheduleTrigger 1.3  "40 3 * * 1-6"
  └─► postgres 2.6   SELECT * FROM trinks_refresh_profissional_id_map(400, 2);
      └─► code 2  "Compute Window"      DIAS = 15
          └─► httpRequest 4.4  GET /v1/transacoes
              └─► code 2  "Validate & Build Snapshot"
                  └─► postgres 2.6  SELECT trinks_sync_executar($1::jsonb, $2::boolean, 15, 'daily');
                      └─► IF  sem_depara > 0 OR snapshot_completo = false  → alerta
```

**Workflow B — `trinks_services_hourly`** · cron `30 9-21 * * 1-6` (13 execuções: 09:30, 10:30, …, 21:30)

Igual ao A, **sem** o primeiro nó Postgres, com `DIAS = 1` e a chamada final:

```
SELECT trinks_sync_executar($1::jsonb, $2::boolean, 1, 'hourly');
```

Nó **"Compute Window"**:

```javascript
const DIAS = 15;                               // Workflow B: 1
const hoje = $now.setZone('America/Manaus').startOf('day');
return [{ json: {
  dias: DIAS,
  dataInicio:       hoje.minus({ days: DIAS - 1 }).toFormat('yyyy-MM-dd'),
  dataFimExclusive: hoje.plus({ days: 1 }).toFormat('yyyy-MM-dd')   // /v1/transacoes é EXCLUSIVE
}}];
```

Nó **`httpRequest`** — `GET https://api.trinks.com/v1/transacoes`:

```
query   : page=1, pageSize=50,
          dataInicio={{ $('Compute Window').item.json.dataInicio }},
          dataFim={{ $('Compute Window').item.json.dataFimExclusive }},
          incluirEstornos=false
headers : X-Api-Key (credencial/env — não hardcode), estabelecimentoId=174976, Accept=application/json
pagination : page = {{ $pageCount + 1 }}
             completeExpression = {{ $response.body.page >= $response.body.totalPages
                                     || ($response.body.data || []).length === 0 }}
             maxRequests = 50, requestInterval = 1100      (rate limit: 60 req/min)
retryOnFail = true, maxTries = 3, waitBetweenTries = 5000, timeout = 60000
onError = continueRegularOutput          ← nunca aborta; quem decide é a validação de integridade
```

Nó **"Validate & Build Snapshot"** — o coração da trava fail-closed:

```javascript
const paginas = $input.all();
const primeira = paginas[0]?.json ?? {};
const totalPages   = Number(primeira.totalPages   ?? 0);
const totalRecords = Number(primeira.totalRecords ?? 0);

const transacoes = [];
let erro = null;
for (const p of paginas) {
  if (p.json?.error || p.json?.data === undefined) { erro = 'pagina_com_erro'; break; }
  transacoes.push(...(p.json.data || []));
}

// Integridade tríplice — só libera o DELETE se as 3 baterem
const completo =
  !erro &&
  paginas.length >= totalPages &&
  transacoes.length === totalRecords;

return [{ json: {
  transacoes,
  completo,
  diagnostico: { paginas: paginas.length, totalPages, coletados: transacoes.length, totalRecords, erro }
}}];
```

No nó Postgres seguinte, `queryReplacement`: `={{ JSON.stringify($json.transacoes) }},={{ $json.completo }}`.

Credencial Postgres existente: **`cLfU1kEvGVa2MduN`** — *"Postgres - projeto Agente n8n atendimento"*.
Antes de criar, invocar a skill `/n8n` e validar com `n8n_validate_workflow`.

**Política de alerta implantada (2026-07-29)** — daily `zH0gQMGC2rzPQeow`, hourly `clU85XVDUbmOaI2E`, ambos ativos:
- **Guarda anti-payload-vazio**: `completo` exige também `transacoes.length > 0` (um 200 vazio espúrio apagaria a janela inteira).
- **`motivo_incompleto`**: `pagina_com_erro` | `contagem_divergente` | `payload_vazio` — separa vazio esperado de divergência real.
- **`servicos_orfaos`**: identidades distintas de `servicos[]` do próprio snapshot sem de-para, **incluindo** profissional null/0. Produtos ficam fora (órfãos permanentes, §4.6).
- **Níveis**: `alerta` (Telegram + `automation_logs` `is_error=true`) se `servicos_orfaos>0` OU `excluidos>50` OU (`completo=false` E motivo≠`payload_vazio`) OU (`payload_vazio` E (daily OU hora Manaus ≥ 11)); `log` (`is_error=false`, sem ping) para `sem_depara>0` só de balcão e vazio esperado antes das 11h; `silencio` no resto.
- **Watchdog** `hYRrWimva0mHTaoT` (`15 11-22 * * 1-6`, timezone Manaus): sem execução há 90 min OU daily de hoje ausente → alerta dual, com **cooldown de 3h** no ping (o log continua sempre).
- **`settings.errorWorkflow: vK3rJRL9sKZFFgaa`** (Error Tracking v0) declarado nos três — em n8n o error handler é opt-in por workflow.

---

## 9. Bootstrap e validação

```sql
-- 1) Popular o mapa com todo o histórico (não use 60 dias no bootstrap — cobre só 20/22)
SELECT * FROM trinks_refresh_profissional_id_map(400, 2);
-- esperado: 22 linhas 'inserido'

-- 2) Conferir bijeção e quarentena
SELECT count(*) AS mapeados,
       count(DISTINCT id_estabelecimento) AS destinos,   -- tem de ser igual a mapeados
       min(confianca) AS pior_confianca                  -- esperado: 1.0000
FROM trinks_profissional_id_map;
SELECT * FROM trinks_profissional_id_map_quarentena;      -- esperado: vazio

-- 3) Carga histórica a partir do MIRROR (sem gastar cota da API).
--    Reaproveita trinks_apply_snapshot montando o snapshot do próprio mirror,
--    mês a mês, com p_completo := false (não deletar durante o bootstrap).
DO $$
DECLARE m date;
BEGIN
  FOR m IN SELECT generate_series('2026-04-01'::date, date_trunc('month', CURRENT_DATE)::date, '1 month') LOOP
    PERFORM trinks_apply_snapshot(
      m, (m + interval '1 month - 1 day')::date,
      (SELECT COALESCE(jsonb_agg(t.raw_json), '[]'::jsonb)
         FROM financeiro_studiox_trinks_transacoes_mirror t
        WHERE (t.data_hora AT TIME ZONE 'America/Manaus')::date
              BETWEEN m AND (m + interval '1 month - 1 day')::date),
      false, true);
  END LOOP;
END $$;

-- 4) GATE — a reconstrução tem de bater com o CSV de abril
SELECT count(*) AS linhas, round(sum(value),2) AS valor
FROM trinks_services WHERE service_date LIKE '%/04/2026';
-- esperado: 1352  |  140795.75
```

Se o gate 4 não bater exatamente, **não avance** — algo divergiu do que foi medido.

**Ensaio da reconciliação** (antes de ligar os crons — valide que o DELETE funciona, é seguro e não sai da janela):

```sql
-- (a) fantasma DENTRO da janela do dia: a próxima execução completa deve removê-la
INSERT INTO trinks_services (id, service_date, professional, service_name, value)
VALUES (999999999999, to_char(CURRENT_DATE,'DD/MM/YYYY'), 'FANTASMA_HOJE', 'TESTE', 1);

-- (b) fantasma FORA da janela do intradiário (30 dias atrás): NÃO pode ser tocada por ele
INSERT INTO trinks_services (id, service_date, professional, service_name, value)
VALUES (999999999998, to_char(CURRENT_DATE - 30,'DD/MM/YYYY'), 'FANTASMA_ANTIGO', 'TESTE', 1);

-- (c) rodar o Workflow B (janela = dia) manualmente e conferir
SELECT * FROM trinks_sync_log ORDER BY executado_em DESC LIMIT 1;   -- excluidos >= 1
SELECT count(*) FROM trinks_services WHERE id = 999999999999;       -- esperado: 0  (removida)
SELECT count(*) FROM trinks_services WHERE id = 999999999998;       -- esperado: 1  (intacta!)

-- (d) provar o fail-closed: snapshot vazio + completo=false NÃO pode apagar nada
SELECT * FROM trinks_apply_snapshot(CURRENT_DATE - 14, CURRENT_DATE, '[]'::jsonb, false, true);
-- esperado: excluidos = 0

-- (e) limpar a fantasma antiga
DELETE FROM trinks_services WHERE id = 999999999998;
```

**Monitoramento contínuo:**

```sql
-- IDs do espaço P vistos em transações e ainda não mapeados
SELECT DISTINCT (s->>'idProfissionalQueRealizouServico')::bigint AS pid_p_orfao
FROM financeiro_studiox_trinks_transacoes_mirror t, LATERAL jsonb_array_elements(t.servicos) s
WHERE t.data_hora >= now() - interval '14 days'
  AND NOT EXISTS (SELECT 1 FROM trinks_profissional_id_map m
                  WHERE m.id_pessoa = (s->>'idProfissionalQueRealizouServico')::bigint);

-- Saúde das últimas 24h
SELECT executado_em, origem, janela_desde, janela_ate, snapshot_completo,
       inseridos, atualizados, excluidos, sem_depara, duracao_ms
FROM trinks_sync_log
WHERE executado_em >= now() - interval '24 hours'
ORDER BY executado_em DESC;

-- Consumo de cota do mês (páginas ≈ requisições)
SELECT origem, count(*) AS execucoes, sum(ceil(transacoes_recebidas / 50.0)) AS req_estimadas
FROM trinks_sync_log
WHERE executado_em >= date_trunc('month', now())
GROUP BY origem;
```

**Alerta se:** `snapshot_completo = false` em 2 execuções seguidas · `sem_depara > 0` · `excluidos > 50` numa execução (anomalia provável, não exclusão real) · nenhuma execução nos últimos 90 min **dentro da janela operacional de um dia útil** (o alerta precisa conhecer o calendário: domingo é silêncio esperado, e das 22h às 09:30 também).

---

## 10. Gotchas — a lista que economiza um dia de debug

1. **`dataFim` muda de semântica por endpoint.** `/v1/transacoes` é **exclusive** (some +1 dia); `/v1/agendamentos` e `/v1/lancamentos` são **inclusive**. Errar aqui perde ou duplica um dia inteiro.
2. **`pageSize` é capado em 50** pela API, sempre — pedir 100 ou 200 devolve 50 (medido). Dimensione páginas por 50 e pagine sempre por `totalPages`.
3. **Timezone do workflow tem de ser `America/Manaus`.** Com o cron filtrando dia da semana (`1-6`), UTC não só desloca 4h como **elimina a última execução de sábado** (21:30 Manaus = 01:30 UTC de domingo). A instância atual está em `America/Manaus`, mas defina explicitamente em `settings.timezone`.
4. **`dataHora` vem sem timezone** e já está em hora de Manaus. Toda conversão usa `AT TIME ZONE 'America/Manaus'`. Tratar como UTC desloca serviços da noite para o dia seguinte.
5. **`profissionalId` como query param é ignorado** em `/v1/transacoes` **e** em `/v1/agendamentos` — validado ao vivo: pedir `profissionalId=804415` devolveu agendamento de outro profissional. Filtre client-side.
6. **`incluirEstornos`** muda o total (julho: 624 → 632). Mantenha `false` — **e note que é exatamente por isso que o DELETE existe**: um estorno faz a transação desaparecer do snapshot.
7. **`produtos[].IdProfissionalQueRealizouAVenda` tem "I" maiúsculo**, ao contrário de `servicos[].idProfissionalQueRealizouServico`. JSON é case-sensitive.
8. **`to_date()` é STABLE, não IMMUTABLE** no Postgres → **não dá para criar índice funcional** sobre `to_date(service_date,'DD/MM/YYYY')`. Por isso a janela é filtrada com `service_date = ANY(array de strings)`, que usa o índice `idx_trinks_services_service_date` já existente.
9. **`trinks_services` tem trigger `trigger_sync_new_professional`** — `AFTER INSERT FOR EACH ROW`, insere em `professionals (id, name, nickname, active)` com `ON CONFLICT DO NOTHING`. Consequências: (a) `professionals.id` recebe o **espaço E**, consistente com o de-para; (b) um ID errado criaria profissional fantasma permanente — mais uma razão para nunca inserir ID não mapeado; (c) o trigger **não** dispara em UPDATE/DELETE, então `professionals` só acumula (resíduo inofensivo).
10. **Nenhuma FK aponta para `trinks_services`** — verificado. O DELETE é seguro. (As FKs existentes miram `professionals`.)
11. **`profissionais_ativos` é o presente, não o histórico.** 3 dos 22 profissionais do período já saíram. Por isso `apelido` é congelado no mapa com `COALESCE(EXCLUDED.apelido, m.apelido)`.
12. **`id = 0`** aparece em agendamento sem profissional — a derivação filtra com `a.profissional_id > 0`.
13. **`pacotes[]` é sempre vazio** no Studio X (0 de 2.789). Se deixar de ser, o sync ignora silenciosamente — vale um monitor.
14. **A chave de API está hardcoded** nos nós HTTP do `trinks_daily_mirror` (não é credencial n8n). Se for rotacionada, tem de ser trocada nó a nó. **Não replique esse padrão** — use credencial ou variável de ambiente.
15. **Rate limit de 60 req/min.** Com `requestInterval: 1100ms`, a execução da madrugada (8 páginas) leva ~9s. Não remova o intervalo.

---

## 11. Checklist de implementação

- [x] ~~Confirmar PK/UNIQUE em `trinks_services.id`~~ — verificado: `trinks_services_pkey PRIMARY KEY (id)` ✅
- [x] ~~Confirmar índice em `service_date`~~ — `idx_trinks_services_service_date` (btree) ✅
- [x] ~~Confirmar timezone da instância n8n~~ — `settings.timezone: "America/Manaus"` ✅ (definir também nos novos)
- [x] ~~Aplicar §8.1 (tabelas) → §8.2 (derivação) → §8.3 (categoria) → §8.4 (reconciliação) → §8.5 (wrapper)~~ ✅
- [x] ~~Bootstrap §9 passos 1–3~~ ✅ (de-para 22/22, confiança 1.0000, quarentena vazia)
- [x] ~~**Gate §9.4: abril = 1.352 linhas / R$ 140.795,75**~~ ✅ conferido de novo depois de cada rodada de sync
- [x] ~~Ensaio da reconciliação §9 (a)–(e) — provar DELETE, escopo de janela e fail-closed~~ ✅
- [x] ~~Rodar o app consumidor contra os dados reconstruídos e comparar rankings com a última rodada do CSV~~ ✅
- [x] ~~Criar Workflow A (`trinks_services_daily`, `40 3 * * 1-6`)~~ ✅ `zH0gQMGC2rzPQeow` — validado e executado manualmente 1×
- [x] ~~Criar Workflow B (`trinks_services_hourly`, `30 9-21 * * 1-6`)~~ ✅ `clU85XVDUbmOaI2E` — `settings.timezone: America/Manaus` conferido
- [x] ~~Executar B manualmente 2×; a 2ª deve dar `inseridos=0, atualizados=0, excluidos=0`~~ ✅ Gate E verde (as duas deram 0/0/0, `totalRecords` idêntico)
- [x] ~~Ativar os crons e ligar os alertas (§9), com o calendário correto~~ ✅ 2026-07-29; o calendário está no próprio cron do watchdog
- [x] ~~Aposentar `jM3L50jNlIp9yzyn` (manter desativado como fallback por 1 ciclo)~~ ✅ **já estava inativo desde 2026-04-11** — verificado e deliberadamente não alterado
- [ ] Corrigir as policies abertas de `trinks_services` (§6.3)
- [ ] *(opcional)* Plugar os NoOps dos eventos 5/6/7 do webhook `yTCvrwWynVGB3dqo`
- [ ] *(opcional, fase 2)* Jobs também alimentarem o mirror do financeiro (§6.2)

---

## 12. Referências

> Caminhos marcados **[fin]** vivem no repo `financeiro-studiox` (não neste). Peça ao owner se precisar deles.

| Assunto | Onde |
|---|---|
| Prompt de implementação (passo a passo + gates) | `docs/trinks-automacao/PROMPT.md` — **neste repo**, ao lado deste arquivo |
| Referência da API Trinks | **[fin]** `docs/refs/trinks-api-reference.md` |
| `/v1/lancamentos` (despesas, não documentado oficialmente) | **[fin]** `docs/refs/trinks-v1-lancamentos.md` |
| Algoritmo de batimento de faturamento | **[fin]** `docs/refs/algoritmo-batimento-faturamento-trinks.md` |
| Workflow do mirror | n8n `af1laBdzN8dlu9cM` — `trinks_daily_mirror` |
| Workflow do webhook | n8n `yTCvrwWynVGB3dqo` — `Webhook Trinks - Geral` |
| Workflow CSV (a aposentar) | n8n `jM3L50jNlIp9yzyn` |
| Credencial Postgres | `cLfU1kEvGVa2MduN` — *Postgres - projeto Agente n8n atendimento* |
