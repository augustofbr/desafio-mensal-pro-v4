# Prompt de implementação — automatizar `trinks_services` (colar no LLM do projeto consumidor)

> **Como usar:** este arquivo vive em `docs/trinks-automacao/PROMPT.md` deste repo, ao lado de `HANDOFF.md`.
> No Claude Code, basta pedir: *"Leia `docs/trinks-automacao/PROMPT.md` e execute"*. Para colar em outro chat, copie deste marcador para baixo e garanta que o agente consiga ler `docs/trinks-automacao/HANDOFF.md` — ele contém o SQL completo, as provas e os gotchas, e é referenciado o tempo todo.

---

## MISSÃO

Substituir a alimentação manual da tabela `trinks_services` (hoje: upload de CSV exportado à mão do Trinks) por uma automação que lê a API do Trinks e mantém a tabela sincronizada ao longo do dia, detectando inclusões, alterações **e exclusões** de vendas.

A investigação técnica já foi feita, validada contra dados de produção e está em **`docs/trinks-automacao/HANDOFF.md`** (neste repo). **Leia-o por inteiro antes de escrever qualquer linha.** Ele contém o SQL pronto nas seções §8.1 a §8.5 — use-o como está, não reescreva do zero. Se não conseguir abrir o arquivo, **pare e peça** antes de prosseguir.

## CONTEXTO DO AMBIENTE

- **Supabase:** projeto `kxgrprxyqeuffhczaznl` (sa-east-1). ⚠️ **Nunca** mirar outro project_id — há outros projetos na mesma organização e são de outros domínios.
- **API Trinks:** `https://api.trinks.com/v1` · headers `X-Api-Key` + `estabelecimentoId: 174976` + `Accept: application/json`. A chave está no `.env` do projeto financeiro e na credencial do n8n — **não hardcode em nó de workflow**.
- **n8n:** `https://workflows.studiox.com.br`. Credencial Postgres já existente: `cLfU1kEvGVa2MduN` ("Postgres - projeto Agente n8n atendimento"). Instância em `America/Manaus`.
- **Cota da API: 10.000 requisições/mês e 60/min**, compartilhada por **todos** os consumidores do estabelecimento (o mirror do financeiro já usa ~300/mês). O desenho abaixo consome ~600/mês. Não crie ingestão redundante.
- Tabelas já existentes e povoadas que você vai usar: `financeiro_studiox_trinks_transacoes_mirror`, `financeiro_studiox_trinks_agendamentos_mirror`, `profissionais_ativos`, `trinks_services`.

## O FATO CENTRAL QUE VOCÊ PRECISA ENTENDER ANTES DE CODAR

A Trinks usa **dois espaços de ID de profissional, disjuntos e não documentados**:

- **Espaço E** ("no estabelecimento") — usado por `/v1/profissionais`, `/v1/agendamentos`, `profissionais_ativos.profissionalId` e pela coluna **`trinks_services.profissionalid`**.
- **Espaço P** ("pessoa") — usado por `/v1/transacoes` em `servicos[].idProfissionalQueRealizouServico` e `produtos[].IdProfissionalQueRealizouAVenda`.

Interseção medida entre os dois conjuntos: **0 de 22**. E — isto é o mais perigoso — **as faixas numéricas se sobrepõem** (147.004–715.044 vs 593.837–924.461), então um ID do espaço errado **passa por qualquer validação de formato ou intervalo** e produz atribuição silenciosamente errada.

**Regra inegociável:** tudo que for gravado em `trinks_services.profissionalid` tem de estar no **espaço E**. O valor que vem da transação está no espaço P e **precisa ser traduzido** pela tabela de-para. Nunca grave o ID da transação direto.

O de-para foi derivado e validado (22/22, 100% de consistência, bijetivo):

| espaço P (transação) | → espaço E (`profissionalid`) | profissional |
|---:|---:|---|
| 147004 | 740783 | Elda Batista da Silva |
| 208140 | 649472 | Brenda Shelry Ferreira Gomes |
| 344363 | 684646 | Nerijane Queiroz Pereira (Jane) |
| 362485 | 784816 | Talita da Silva Gomes |
| 391281 | 885975 | Aline Cristina da Rocha Lopes |
| 525423 | 648177 | Andressa Fabiane Reis da Silva |
| 526564 | 649644 | Ana Paula Rodrigues Ribeiro (Paula) |
| 527210 | 853281 | Sarah Jayne dos Santos Monteiro |
| 539014 | 666471 | Letícia Ruana da Silva Gomes |
| 572731 | 788088 | Michelle Barroso dos Santos |
| 630330 | 793041 | Rilley Firmino de Albuquerque |
| 633872 | 798219 | Stefanny Monteiro dos Santos Silva |
| 638188 | 804415 | Ricardo Diogo Loureiro Barbosa |
| 642088 | 809861 | Thayna Torres Rocha |
| 656056 | 829346 | Emanuelle Ribeiro Araujo (Manu) |
| 672603 | 849997 | Jessica Alves da Silva |
| 672609 | 850004 | Jeniffer Pena Lima |
| 672769 | 850213 | Debora Marques de Albuquerque |
| 688912 | 874635 | Yago dos Santos Almeida |
| 689997 | 876180 | Lucas Martins Alves |
| 711180 | 906607 | Danielle Marques de Azevedo |
| 715044 | 912417 | Ashley Safira Moraes Mendes |

Esta tabela é o **resultado esperado** da função de derivação — use-a para conferir, não para popular à mão (o mapa precisa se manter sozinho quando entrar profissional novo).

## CADÊNCIA EXIGIDA

**Segunda a sábado. Domingo não roda nada** — o salão fecha (confirmado nos dados: zero transações em domingo, em 115 dias analisados).

| Job | Cron (America/Manaus) | Janela puxada | Por quê |
|---|---|---|---|
| `trinks_services_daily` | `40 3 * * 1-6` | **últimos 15 dias** | Rede de segurança: pega alteração/exclusão retroativa. Roda também a derivação do de-para. |
| `trinks_services_hourly` | `30 9-21 * * 1-6` | **dia corrente** | Frescor: 09:30, 10:30, …, 21:30 (13 execuções). |

As janelas são diferentes de propósito: 15 dias custa 8 páginas de API, o dia corrente custa 1 (2 aos sábados). Puxar 15 dias de hora em hora gastaria 5× mais para reconferir dados que praticamente não mudam. **Não "simplifique" unificando as duas janelas.**

Consequência importante: **o DELETE é sempre restrito à janela que foi puxada.** O job intradiário só remove linhas do dia corrente — nunca toca dias anteriores, porque não os consultou. Quem reconcilia o passado é o job da madrugada.

## O QUE CONSTRUIR

### Parte 1 — SQL (aplicar via migration, nesta ordem)

Copie o código das seções de `docs/trinks-automacao/HANDOFF.md`; não improvise:

| # | Artefato | Origem | Responsabilidade |
|---|---|---|---|
| 1 | `trinks_profissional_id_map`, `trinks_profissional_id_map_quarentena`, `trinks_sync_log` | §8.1 | Tabelas de apoio (RLS ligado, `anon`/`authenticated` revogados) |
| 2 | `trinks_refresh_profissional_id_map(dias, min_votos)` | §8.2 | Deriva o de-para cruzando o **mirror** de transações × agendamentos por `(cliente_id, servico_id, dia)`. Custo zero de API. |
| 3 | `trinks_categoria_csv(text)` | §8.3 | Traduz a categoria da API para o vocabulário do CSV (o formato que o app já consome) |
| 4 | `trinks_apply_snapshot(desde, ate, transacoes, completo, incluir_produtos)` | §8.4 | Coração: diff insert/update/delete numa transação |
| 5 | `trinks_sync_executar(transacoes, completo, dias, origem)` | §8.5 | Wrapper: calcula a janela, chama o anterior, grava em `trinks_sync_log` |

### Parte 2 — Workflows n8n

Antes de criar qualquer workflow, **invoque a skill `/n8n`** e valide com `n8n_validate_workflow`. Versões de node confirmadas: `scheduleTrigger` **1.3**, `postgres` **2.6**, `httpRequest` **4.4**, `code` **2**.

Os dois workflows têm a mesma espinha dorsal (§8.6 do `HANDOFF.md` traz o fluxo e o código dos nós):

```
[só no daily] postgres  SELECT * FROM trinks_refresh_profissional_id_map(400, 2);
scheduleTrigger → code "Compute Window" (DIAS = 15 no daily, 1 no hourly)
  → httpRequest GET /v1/transacoes  (pageSize=50, incluirEstornos=false, paginação por totalPages)
  → code "Validate & Build Snapshot"   ← a trava fail-closed
  → postgres  SELECT trinks_sync_executar($1::jsonb, $2::boolean, <15|1>, '<daily|hourly>');
  → IF (sem_depara > 0 OR snapshot_completo = false) → alerta
```

⚠️ **Defina `settings.timezone: "America/Manaus"` em cada workflow.** Não confie no default. Com o cron filtrando dia da semana (`1-6`), um timezone errado não só desloca 4h como **elimina a última execução de sábado** (21:30 Manaus = 01:30 UTC de domingo).

## OS TRÊS PONTOS ONDE ESTA IMPLEMENTAÇÃO PODE DAR ERRADO

**1. O DELETE sem trava = perda de dados silenciosa.**
Exclusão é detectada por ausência: o que está no banco na janela e não veio no snapshot é apagado. Se uma página da API falhar por timeout, tudo que estava nela "sumiu" e seria apagado.

Por isso o nó `Validate & Build Snapshot` só marca `completo = true` quando **as três** condições batem:
- nenhuma página retornou erro;
- páginas percorridas ≥ `totalPages` da 1ª resposta;
- itens coletados == `totalRecords` da 1ª resposta.

Se qualquer uma falhar → `completo = false` → a RPC ainda faz insert/update, mas **não deleta nada**; a execução seguinte reconcilia. **Nunca** force `completo = true`, nunca remova a verificação.

**2. `dataFim` em `/v1/transacoes` é EXCLUSIVE.**
Para cobrir até hoje, envie `dataFim = hoje + 1 dia`. (Em `/v1/agendamentos` é o contrário — inclusive.) Errar isso perde ou duplica um dia inteiro.

**3. `pageSize` é capado em 50 pela API.**
Pedir 100 ou 200 devolve 50 — medido ao vivo. Dimensione por 50 e **sempre** pagine por `totalPages`; nunca assuma página única. (O workflow do financeiro pede 100 e recebe 50; funciona por acidente — não copie.)

## ANTI-PADRÕES — não faça

- ❌ `TRUNCATE` em `trinks_services`. A tabela passa a ser incremental e idempotente; o `id` é determinístico (`transacao_id * 1000 + ordinalidade`, produtos com offset +500).
- ❌ Casar profissional por **nome**. É como o CSV faz e é justamente por isso que 47 das 1.352 linhas de abril ficaram com `profissionalid` NULL. Case por ID via de-para.
- ❌ Gravar `profissionalid` com o valor vindo da transação (espaço P). Sem entrada no de-para → grave **NULL** e conte em `sem_depara`. Chutar é pior que deixar nulo.
- ❌ Unificar as janelas dos dois jobs, ou rodar 15 dias de hora em hora. Quintuplica a cota sem ganho.
- ❌ Deletar fora da janela consultada. O escopo do DELETE é sempre `p_desde..p_ate`.
- ❌ Rodar aos domingos ou fora de 09:30–21:30. Requisito do negócio, não detalhe.
- ❌ Ler `financeiro_studiox_trinks_*` do front-end. RLS forçado, policy de SELECT com `qual = false`, `anon` revogado — devolve vazio **sem erro**. Só server-side (`service_role` / RPC `SECURITY DEFINER`).
- ❌ Criar uma segunda ingestão da API para dados que o mirror já tem. O de-para sai do mirror; só o sync chama a API.
- ❌ Escrever em `financeiro_studiox_trinks_transacoes_mirror` ou em qualquer tabela `financeiro_studiox_*`. Fora do escopo — é o domínio do projeto financeiro.
- ❌ Índice funcional sobre `to_date(service_date, ...)`. `to_date` é STABLE no Postgres e o `CREATE INDEX` falha. A janela é filtrada com `service_date = ANY(array de strings 'DD/MM/YYYY')`, que usa o índice já existente.

## ORDEM DE EXECUÇÃO E GATES

Execute na ordem. **Não avance com um gate vermelho** — pare e reporte.

1. Aplicar as migrations (Parte 1, itens 1→5).
2. `SELECT * FROM trinks_refresh_profissional_id_map(400, 2);`
   **🚦 GATE A** — 22 linhas inseridas; `count(*) = count(DISTINCT id_estabelecimento) = 22`; `min(confianca) = 1.0000`; quarentena vazia; e o conteúdo tem de **bater exatamente com a tabela deste prompt**.
3. Carga histórica a partir do mirror (bloco `DO $$` do §9.3 — usa `p_completo := false`, não gasta cota).
   **🚦 GATE B** — `SELECT count(*), round(sum(value),2) FROM trinks_services WHERE service_date LIKE '%/04/2026'` tem de devolver exatamente **1352** e **140795.75**. Esses números vieram da conferência linha a linha contra o CSV importado à mão. Divergiu? Pare.
4. Ensaio da reconciliação (§9, itens a–e): duas linhas fantasma, uma **dentro** da janela do dia e outra **30 dias atrás**.
   **🚦 GATE C** — a fantasma de hoje é removida (`excluidos ≥ 1`); a fantasma antiga fica **intacta** (prova de que o DELETE respeita a janela); e snapshot vazio com `completo = false` não apaga nada (`excluidos = 0`).
5. Rodar o app consumidor contra os dados reconstruídos e comparar rankings/pontuação com a última rodada do CSV.
   **🚦 GATE D** — diferenças explicadas uma a uma. Atenção: a automação **corrige** 47 linhas que o CSV deixava órfãs (Paula, Andressa, Kelle, Augusto) e trata produtos separadamente — então pequenas diferenças a favor da API são esperadas e devem ser conferidas, não ignoradas.
6. Criar e validar o Workflow A (`trinks_services_daily`); executar manualmente.
7. Criar o Workflow B (`trinks_services_hourly`); executar manualmente **duas vezes seguidas**.
   **🚦 GATE E** — a segunda execução devolve `inseridos = 0, atualizados = 0, excluidos = 0` (idempotência) e `snapshot_completo = true`.
8. Ativar os crons e ligar os alertas. O alerta de "sem execução recente" precisa conhecer o calendário: **domingo é silêncio esperado**, e das 22h às 09:30 também.
9. Desativar `jM3L50jNlIp9yzyn` (workflow do CSV) — **manter desativado, não excluir**, como fallback por um ciclo.

## DETALHES QUE PARECEM PEQUENOS E NÃO SÃO

- `dataHora` da transação vem **sem timezone** e já está em hora de Manaus. Toda conversão de data usa `AT TIME ZONE 'America/Manaus'`. Tratar como UTC joga atendimentos da noite para o dia seguinte.
- `produtos[].IdProfissionalQueRealizouAVenda` tem **I maiúsculo**; `servicos[].idProfissionalQueRealizouServico` tem **i minúsculo**. JSON é case-sensitive.
- `service_date` é **texto no formato `DD/MM/YYYY`** — mantenha, o app depende disso.
- Na tradução de categoria, `'Serviços de estética corporal'` é o único valor **sem ponto final**. Copie literalmente do §8.3.
- `trinks_services` tem trigger `trigger_sync_new_professional` (`AFTER INSERT FOR EACH ROW`) que popula `professionals`. Ele recebe `profissionalid` — mais um motivo para nunca inserir ID do espaço errado: criaria um profissional fantasma permanente.
- Dois IDs (`484900`, `623942`) só aparecem vendendo **produto**, nunca serviço, logo não têm agendamento e não podem ser derivados. Esperado que entrem com `profissionalid` NULL. Não invente mapeamento para eles.
- `profissionais_ativos` reflete só o presente: 3 dos 22 profissionais do histórico já saíram e não estão lá. Por isso o apelido é congelado no de-para.
- Se um profissional novo começar a atender no meio do dia, ele não estará no de-para (que vem do mirror de D-1) e suas linhas entram com `profissionalid` NULL até a madrugada. Quando `sem_depara > 0`, o job pode disparar uma coleta extra de `/v1/agendamentos` (15 dias, ~17 req) e rodar a derivação com dados frescos.
- Mudança em venda com **mais de 15 dias** não é detectada por nenhum dos dois jobs. Se precisar reprocessar período antigo, chame `trinks_apply_snapshot` manualmente com a janela desejada.

## REPORTE ESPERADO

Ao terminar, entregue:

1. Lista das migrations aplicadas (nome e o que faz).
2. Resultado de **cada gate** (A–E) com os números obtidos vs esperados.
3. IDs e nomes dos workflows n8n criados, com o resultado da validação e o `settings.timezone` confirmado.
4. Consumo estimado de cota (req/mês) e a fórmula usada.
5. Qualquer divergência encontrada — **reporte, não contorne**. Se um gate falhar, pare e descreva o que viu; não ajuste o número esperado para o gate passar.
