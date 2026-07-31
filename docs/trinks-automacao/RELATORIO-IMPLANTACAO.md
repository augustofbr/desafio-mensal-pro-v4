# Relatório de implantação — Automação `trinks_services` via API Trinks

> **Data:** 2026-07-29 · **Supabase:** `kxgrprxyqeuffhczaznl` (sa-east-1) · **n8n:** workflows.studiox.com.br
> **Execução:** orquestração subagent-driven (todos os subagents em Opus 5; a ferramenta de dispatch não expõe parâmetro de effort — herdado da sessão). Artefatos de processo em `.superpowers/sdd/trinks-automacao/` (ledger, briefs, relatórios por task e reviews).

## 1. Migrations aplicadas (em ordem)

| Migration | O que faz |
|---|---|
| `20260729120001_trinks_sync_tabelas_apoio` | Tabelas `trinks_profissional_id_map` (+quarentena) e `trinks_sync_log`, RLS ligado, grants de anon/authenticated revogados (HANDOFF §8.1) |
| `20260729120002_trinks_refresh_profissional_id_map` | Derivação incremental do de-para espaço P→E cruzando mirror de transações × agendamentos (§8.2) |
| `20260729120003_trinks_categoria_csv` | Tradução de categoria API → vocabulário do CSV (§8.3) |
| `20260729120004_trinks_apply_snapshot` | Reconciliação central: diff insert/update/delete numa transação, DELETE só com snapshot íntegro e restrito à janela (§8.4) |
| `20260729120005_trinks_sync_executar` | Wrapper com janela calculada + log em `trinks_sync_log` (§8.5) |
| `20260729120006_fix_trinks_refresh_on_conflict` | **Fix de defeito do HANDOFF §8.2**: `ON CONFLICT (id_pessoa)` colidia com a variável OUT do `RETURNS TABLE` (erro 42702 na 1ª execução). Corrigido para `ON CONFLICT ON CONSTRAINT trinks_profissional_id_map_pkey` — semântica idêntica, contrato intacto. Arquivo 120002 e HANDOFF §8.2 atualizados com a mesma linha + comentário |

Fidelidade verificada por reviewer independente: arquivos byte-idênticos ao HANDOFF (fora o fix), corpos no banco com md5 igual aos arquivos, RLS/REVOKE/índices conforme spec.

## 2. Gates — obtido vs esperado

| Gate | Esperado | Obtido | Veredito |
|---|---|---|---|
| **A** — de-para | 22 inseridos; mapeados=destinos=22; min(confianca)=1.0000; quarentena vazia; pares idênticos à tabela do prompt | 22 'inserido'; 22=22; 1.0000; quarentena 0; FULL OUTER JOIN → 22 idênticos / 0 faltando / 0 extras / 0 divergentes. Reproduzido de forma independente pelo reviewer. Bônus: 2ª execução idempotente (22 'atualizado') | ✅ |
| **B** — abril | 1352 linhas / R$ 140.795,75 | **1352 / 140795.75** — e a igualdade veio ANTES da limpeza do legado (convergência independente da reconstrução). Verificado também pelo orquestrador via query direta | ✅ |
| **C** — reconciliação | fantasma de hoje removida (excluidos ≥ 1); fantasma de 30 dias intacta; snapshot vazio+completo=false não apaga (excluidos = 0) | excluidos=1 e fantasma de hoje count=0; fantasma antiga count=1; fail-closed excluidos=0 com janela de 15 dias inalterada (644→644 linhas, R$ 66.603,20 idêntico) | ✅ |
| **D** — app vs CSV | diferenças explicadas uma a uma | 8 classes de delta (412 linhas), 8/8 explicadas com evidência, **0 impacto em métrica de scoring, rankings de abril idênticos ponto a ponto** nos dois mundos. Tratamentos 125=125 / R$ 14.710,00 = R$ 14.710,00; SPA 9=9. As 4 divergências previstas no §4.4 conferidas: Talita/Sarah não viraram delta (produtos entram como linhas próprias com `p_incluir_produtos=true`); Paula/Andressa são correção real de `profissionalid`, sem efeito no app (que associa por nome) | ✅ |
| **E** — idempotência | 2ª execução do hourly com inseridos=0, atualizados=0, excluidos=0 e snapshot_completo=true | Exec 1 e 2 idênticas: `0/0/0`, completo=true, totalRecords estável em 6 (zero exceção honesta a documentar) | ✅ |

Nota sobre o Gate B/D: a fotografia inicial revelou que `trinks_services` continha **apenas abril/2026** — a última rodada do CSV foi a de abril (o workflow do CSV estava inativo desde 11/04). Por isso o Gate D comparou abril. Antes de qualquer escrita foi criado o backup integral `trinks_services_backup_csv_20260729` (1.352 linhas, RLS ligada, sem grants a anon/authenticated); as 1.352 linhas legadas (assinatura `servicoid IS NULL AND produtoid IS NULL`, bijeção por id contra o backup conferida) foram removidas após o backup para a tabela não duplicar CSV+API. Reversível a qualquer momento pelo backup — **não remover o backup antes de um ciclo de validação**.

Carga histórica resultante (do mirror, 0 requisições à API): abril 1.352 / 140.795,75 · maio 1.398 / 146.567,90 · junho 1.400 / 155.544,01 · julho 1.322 / 139.172,59 (até 28/07; hoje cresce via hourly).

## 3. Workflows n8n

| Workflow | ID | Cron (America/Manaus) | Validação | Estado |
|---|---|---|---|---|
| `trinks_services_daily` | `zH0gQMGC2rzPQeow` | `40 3 * * 1-6` (janela 15 dias + refresh do de-para) | `valid: true`, 0 erros/0 warnings (revalidado após cada mudança) | ✅ ativo |
| `trinks_services_hourly` | `clU85XVDUbmOaI2E` | `30 9-21 * * 1-6` (dia corrente, 13 exec/dia) | idem | ✅ ativo |
| `trinks_sync_watchdog` | `hYRrWimva0mHTaoT` | `15 11-22 * * 1-6` (calendário-ciente: domingo e 22h–09:30 = silêncio esperado) | idem | ✅ ativo |
| CSV `jM3L50jNlIp9yzyn` | — | — | — | ⛔ inativo (já estava desde 11/04; verificado e preservado como fallback — **não excluído**) |
| mirror `af1laBdzN8dlu9cM` | — | — | — | ✅ ativo, **intocado** |

`settings.timezone: "America/Manaus"` confirmado por leitura de volta nos 3 novos; `settings.errorWorkflow: "vK3rJRL9sKZFFgaa"` (handler WhatsApp Z-API da instância, comprovado disparando) nos 3. Chave da API em credencial `QBiVapHJM1f67oum` (httpHeaderAuth) — **zero chave hardcoded nos nós novos** (varredura do reviewer). Paginação conforme §8.6 (pageSize 50, paginação por totalPages, requestInterval 1100ms, retry 3×).

**Provas em produção no dia da implantação:**
- Execução manual do daily: janela 15–29/07, `snapshot_completo=true`, 8 páginas/351 transações, ins 15 / atu 280 / exc 4 / inal 360. Os 4 excluídos foram investigados: transação 278152237 estornada e reemitida como 278422716 — exatamente o cenário de estorno que motiva o DELETE (§10.6).
- Cron real: o hourly disparou sozinho às 15:30:04 e 16:30 (Manaus), e o watchdog às 16:15/17:15/21:15Z, já com o código pós-fixes (`hora_manaus` correto, nível `silencio`, zero alerta espúrio). Abril permaneceu exato em todas as execuções.

## 4. Cota estimada (req/mês)

Fórmula (§5.3): `req/mês ≈ 26 × páginas_15dias + 4,33 × (5 × 13 × páginas_dia_util + 13 × páginas_sabado)`

| Consumidor | Cálculo | req/mês |
|---|---:|---:|
| `trinks_services_daily` | 26 × 8 | 208 |
| `trinks_services_hourly` | (5×13×1 + 1×13×2) × 4,33 | ≈ 394 |
| mirror do financeiro (existente) | ~10/dia × 30 | ≈ 300 |
| fallback do de-para (esporádico) | ~17 páginas por evento | ≈ 50 |
| derivação do de-para / watchdog | lê mirror/log, não a API | 0 |
| **Total** | | **≈ 950 de 10.000 (~90% de folga)** |

Consumo da implantação de hoje: 10 requisições manuais (8 daily + 2 hourly) + ~1/execução automática desde 15:30.

## 5. Divergências e desvios (reportados, não contornados)

**Defeitos encontrados na spec (HANDOFF):**
1. §8.2: `ON CONFLICT (id_pessoa)` × variável OUT — bloqueava a 1ª execução. Fix cirúrgico aplicado e documentado (migration 120006). Lição: `CREATE FUNCTION` não valida corpo PL/pgSQL; migrations de função merecem smoke-test imediato.
2. §9 (monitoramento): a query de verificação de janela usa `= ANY ((SELECT array_agg(...)))`, que não executa (erro 42883). Doc apenas — a função de produção usa a forma correta. Não corrigido no documento.
3. Contradição interna: §4.6 prevê órfãos permanentes de balcão em `sem_depara`, mas §8.6/§9 alertam em `sem_depara > 0` — geraria alerta falso diário. Resolvido no desvio (c) abaixo.

**Desvios de implementação (todos documentados no HANDOFF §8.6 pós-implantação):**
a. Guarda anti-payload-vazio: `completo=true` exige também `transacoes.length > 0` (um 200 vazio espúrio apagaria a janela — fortalece o fail-closed; dia legitimamente zerado reconcilia no daily).
b. `motivo_incompleto` (`pagina_com_erro` | `contagem_divergente` | `payload_vazio`) para o alerta distinguir anomalia real de manhã sem vendas.
c. Política de alerta: ping em `servicos_orfaos > 0` (calculado do próprio snapshot, incluindo serviço com profissional null/0) OU `excluidos > 50` OU incompleto por motivo ≠ vazio OU vazio no daily/após 11h; produto de balcão órfão = só `automation_logs` (`is_error=false`).
d. Alerta dual Telegram (padrão `$env` da instância) + `automation_logs`; watchdog com cooldown de 3h.
e. Envelope `jsonb_to_record` no retorno da RPC (argumentos inalterados) para o IF ler escalares tipados.
f. Ensaio do Gate C via `trinks_apply_snapshot` direto (a ordem da missão põe o ensaio antes de existir o Workflow B).
g. Limpeza das 1.352 linhas legadas do CSV com backup integral prévio (necessária para a tabela não duplicar; ver §2).
h. `saveDataSuccessExecution: none` em daily/hourly (o rastro durável é `trinks_sync_log` + `automation_logs`); erros retêm dados completos.

**⚠️ Achado de segurança (HANDOFF §6.3 — reportado, NÃO alterado por estar fora dos passos da missão):** `trinks_services` segue com policies públicas de SELECT/INSERT/UPDATE/DELETE — com a chave anon do bundle, qualquer pessoa lê nomes de clientes e pode apagar a tabela. Agora que a escrita é 100% server-side, recomenda-se revogar INSERT/UPDATE/DELETE de anon/authenticated e avaliar a exposição de `client_name`. Decisão do owner.

**Achados sobre o app (pré-existentes, fora do escopo):** associação profissional↔serviço por **nome exato** sem trim (`useHairTreatmentData.ts:31-33`, `useProfessionalDetails.ts:45`) ignorando o `profissionalid` agora 100% confiável; versão "V3 - Abril 2026" existe em `regras_desafio` mas não em `src/lib/rulesConfig.ts` (fallback silencioso para V2); produtos podem somar no dedupe de cliente único/dia (igual ao CSV — decidir regra).

**Pendências/observações menores:** primeiro teste real do ramo `log` é o daily de amanhã 03:40 (esperado: `automation_logs` `is_error=false`, sem Telegram); idempotência com paginação múltipla no hourly só será exercitada num sábado cheio; chave ainda hardcoded em 5 workflows legados (migrar para `QBiVapHJM1f67oum` é barato); limiar `excluidos > 50` é absoluto (envelhece com o volume); alerta de órfãos em A/B não tem cooldown (condição não-auto-curável pode gerar pings repetidos); cooldown do watchdog depende do prefixo textual em `automation_logs` (contrato frágil — ideal seria coluna própria); histórico remoto da migration 120002 guarda o texto pré-fix (banco e replay corretos).

**Mudanças em venda com mais de 15 dias** seguem fora do alcance dos jobs (por design) — reprocessar via `trinks_apply_snapshot` manual com a janela desejada.

## 6. Arquivos novos no repo (untracked — commit não solicitado)

`supabase/migrations/2026072912000{1..6}_*.sql`, este relatório, e edições em `docs/trinks-automacao/HANDOFF.md` (§8.2 fix, §8.6 política implantada, §11 checklist). Artefatos de processo em `.superpowers/sdd/trinks-automacao/`.
