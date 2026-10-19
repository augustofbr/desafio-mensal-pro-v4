# Estrelas do Google: nome da cliente no Google + no Trinks, e apoio à aprovação

Data: 2026-10-18 · Dono: Augusto · Protótipo aprovado: https://claude.ai/artifact/YCeqLSu2hX9bUtdof46fLs
(telas "Cadastro (celular)" e "Aprovação (admin)"; nomes fictícios)

## Por quê

O aprovador confere cada estrela à mão contra duas regras de negócio:

1. **A estrela corresponde a uma cliente de fato atendida pela profissional que cadastrou.**
2. **Uma avaliação do Google só pode ser aprovada uma única vez, para uma única profissional.** O Google aceita
   uma avaliação por conta de usuário, em qualquer tempo — então o mesmo nome do Google aparecer de novo é
   suspeito em qualquer mês, para qualquer profissional e com qualquer status anterior.

A dificuldade: o nome no Google costuma diferir do nome no Trinks (conta do marido, da filha, da loja, grafia
diferente). Hoje o cadastro guarda só um nome (`nome_cliente`), digitado livremente.

Medição nos dados reais (2026-10-18, só leitura): das 241 estrelas aprovadas nos últimos 90 dias, comparando o
nome do Google com as clientes da profissional nos 10 dias anteriores (pg_trgm + unaccent): 64 idênticas, 97
fortes (≥0,6), 50 médias (0,4–0,6), 30 fracas. Há 68 nomes do Google repetidos entre as 1.069 estrelas; 44 entre
profissionais diferentes; 56 com 2+ aprovações.

A ideia central: **quem atendeu identifica a cliente no Trinks** (escolhendo de uma lista), e o algoritmo cuida do
resto. A parte "semântica" (Google ≠ Trinks) fica com a profissional, que conhece a cliente; IA fica para uma
fase 2, só se os casos residuais pesarem.

## Objetivos

- O modal de cadastro passa a ter: profissional → **dia do atendimento** → **cliente no Trinks escolhida de uma
  lista** (com saída "digitar o nome") → **nome da cliente no Google** com a caixa "Mesmo nome do Trinks".
- A fila de aprovação mostra os dois nomes e dois sinais por estrela pendente: **"Atendida?"** e
  **"Possível duplicata"**.
- Histórico e `/minhas-avaliacoes` mostram os dois nomes; a busca do admin procura nos dois.

## Não-objetivos

- Revisar as 56 aprovações repetidas do passado (relatório separado, se o dono pedir depois).
- IA / LLM para casar nomes (fase 2, eventual).
- Mudar pontuação, ranking, Bônus Estrelas ou o mês de atribuição (continua `data_hora_cadastro`).
- Corrigir as permissões das tabelas da fila (ver "Achado lateral").

## Anti-objetivos (falha mesmo que "funcione")

- **Quebrar as estrelas pendentes reais do modelo legado.** Existem pendentes hoje (10 em 2026-10-18) com só
  `nome_cliente`. Elas precisam continuar aparecendo, sendo aprovadas/recusadas/devolvidas normalmente, com o
  campo do Trinks vazio. O mesmo vale para todo o histórico (1.069 linhas).
- Os sinais decidirem sozinhos ou bloquearem aprovar/recusar. São apoio; o aprovador decide.
- Tratar como suspeita a mesma cliente do Trinks em duas estrelas com nomes do Google diferentes — **não é
  suspeito** (duas clientes podem ser atendidas sob um único nome na comanda).
- Reintroduzir chamada a edge function no load da página pública (ver CLAUDE.md).

## Restrições

- Página pública `/` não tem auth; o cadastro insere como `anon` por design. A policy de INSERT público
  (`status='pendente' AND aprovado_por IS NULL AND data_aprovacao IS NULL`) continua valendo.
- Migração de schema = zona vermelha do projeto: escrita por `opus-med`, revisão por `auditor`, aplicada pelo
  MCP do Supabase (o dono autorizou executar SQL aprovado direto). Teste de mutação real só em transação com
  `ROLLBACK` — nunca decidir uma pendente real para "ver funcionando".
- Clientes com bundle antigo em cache continuarão inserindo só `nome_cliente`: o banco tem de aceitar isso.
- `src/integrations/supabase/types.ts` e `src/components/ui/*` não se editam à mão.
- Fuso de tudo: `America/Manaus`.

## Decisões do dono

- `nome_cliente` (coluna existente) **passa a significar "Nome da Cliente no Google"**. Nenhum dado é movido;
  só o rótulo muda. (Proposto e aceito.)
- Ordem do modal invertida em relação ao pedido original: Trinks antes, Google depois; a caixa fica no campo do
  Google e se chama **"Mesmo nome do Trinks"**. (Aceito.)
- A lista de clientes mostra **só as atendidas por aquela profissional naquele dia**. Fontes:
  - **dia atual**: tabela da fila `"gerencia-fila-trinks-appointments"` (webhooks do Trinks, mesmo projeto
    Supabase `kxgrprxyqeuffhczaznl`), unida ao espelho (`trinks_services`), que também cobre hoje mas com
    atraso de até ~1h (sync horário aos :30, 9h–21h, seg–sáb) e só após o fechamento da comanda;
  - **dias anteriores**: espelho (`trinks_services`).
- Dia do atendimento: Hoje, Ontem, ou "Outro dia" até **10 dias para trás**.
- Sinal "Atendida?": dados oficiais do espelho da profissional, janela de 10 dias.
- Duplicata = **nome do Google** parecido com o de qualquer outra estrela, qualquer mês, qualquer profissional,
  qualquer status (recusada inclusive, sinalizando o status).
- Legado: pendentes antigas são aprovadas só com o nome do Google.

## O desenho

### Dados (`avaliacoes_cadastradas`, migração aditiva)

Colunas novas, **todas nullable, sem default que mude linhas existentes**:

| Coluna | Tipo | Significado |
|---|---|---|
| `nome_cliente_trinks` | text | Nome da cliente como está no Trinks |
| `cliente_trinks_id` | bigint | Id da cliente no Trinks, quando escolhida da lista (`trinks_services.clienteid` é `text` — comparar com cast; fila `trinks_client_id` é integer) |
| `data_atendimento` | date | Dia do atendimento informado no cadastro |
| `origem_cliente_trinks` | text, check `in ('lista','digitado')` | Como o nome do Trinks foi informado |

`nome_cliente` continua NOT NULL (é o Google). A policy de INSERT não muda. Linhas legadas: tudo novo = NULL.

### Lista de clientes do dia (leitura pública)

RPC `avaliacao_clientes_do_dia(p_profissional_id int, p_data date)` → linhas `(cliente_trinks_id, nome,
servicos text[], fonte)` deduplicadas por cliente; `fonte` ∈ `espelho|fila`. Une:
- `trinks_services` com `profissionalid = p_profissional_id::text` e `service_date = to_char(p_data,'DD/MM/YYYY')`;
- se `p_data` = hoje (Manaus): `"gerencia-fila-trinks-appointments"` com `professional_id = p_profissional_id`,
  `appointment_date = p_data`, excluindo status de cancelado / cliente faltou.

Recusa `p_data` fora de [hoje−10, hoje]. Executável por `anon`. Não expõe nada além do que `trinks_services`
já expõe publicamente hoje (nome da cliente é público por decisão adiada do dono).

### Modal (`CadastrarAvaliacaoModal`)

Conforme o protótipo:
1. Profissional (lista atual `useProfissionaisSelecionaveis`, sem mudança).
2. Dia: chips Hoje / Ontem / Outro dia (seletor limitado a 10 dias).
3. Cliente no Trinks: busca + lista da RPC (nome e serviços). Última opção "Não encontrei a cliente — digitar o
   nome" abre um campo livre (`origem='digitado'`, sem id). Trocar profissional ou dia limpa a escolha.
   Estados: carregando; lista vazia ("nenhuma cliente encontrada para este dia" + a opção de digitar); erro da RPC
   (cai para digitação livre, nunca trava o cadastro).
4. Nome no Google (obrigatório, ≥2 caracteres) + caixa "Mesmo nome do Trinks": marcada, copia o nome do Trinks,
   trava o campo e acompanha mudanças; desmarcada, libera.

Obrigatórios em cadastro novo: profissional, dia, nome no Trinks (da lista ou digitado), nome no Google.
O toast de sucesso usa o nome do Google.

### Sinais na fila de aprovação

Calculados no servidor (pg_trgm + unaccent já instalados), uma chamada para as pendentes carregadas — ex.:
RPC `avaliacoes_sinais(p_ids uuid[])`. Normalização: `lower(unaccent(trim))`, espaços colapsados.

**"Atendida?"** — compara contra `trinks_services` da mesma profissional:
- com `cliente_trinks_id`: existe serviço dessa cliente no `data_atendimento` → **Atendida** (mostra serviço e
  data). Não existe e `data_atendimento` = hoje/ontem → **Aguardando espelho** (veio da fila; comanda pode não
  ter fechado). Não existe e mais antigo → **Não encontrada no espelho**.
- sem id (digitado ou legado): nome do Trinks — ou, se vazio (legado), o nome do Google — contra as clientes da
  profissional entre `data_atendimento` (ou a data do cadastro, se legado) −10 dias e a data do cadastro:
  idêntico → **Atendida**; similaridade forte → **Provável** (mostra o nome mais parecido e a data); senão →
  **Não encontrada**. Limiares iniciais: forte ≥0,6 (`greatest(similarity, word_similarity)`), calibráveis.

**"Possível duplicata"** — nome do Google desta estrela contra o de **todas** as outras estrelas (qualquer
status/mês/profissional): idêntico após normalização, ou similaridade muito alta. Mostra para cada uma:
profissional, mês, status e um jeito de vê-la. Nunca compara pelo nome do Trinks.

### Telas do admin e demais

- Fila e histórico: "Google: …" e "Trinks: … (digitado à mão)" + data do atendimento; legado mostra
  "Trinks: — (cadastro antigo)". Busca casa em qualquer um dos dois nomes. Ordenação "por cliente" segue pelo
  nome do Google.
- Os sinais aparecem na fila (pendentes). O histórico só mostra os dois nomes.
- `/minhas-avaliacoes`: os dois nomes.
- `useAdminAvaliacoes` / `useMinhasAvaliacoes`: incluir as colunas novas no `select`.
- Atualizar o CLAUDE.md (schema de `avaliacoes_cadastradas`, aba Aprovações, RPCs novas).

## Achado lateral (fora do escopo)

As tabelas da fila (`"gerencia-fila-trinks-appointments"`, `"gerencia-fila-attendances"`) dão a `anon`
SELECT/INSERT/UPDATE/DELETE/TRUNCATE com policy "ALL to public". A RPC nova só lê; não piora nem depende disso,
mas o dono deve decidir depois (é do projeto `gerenciador-fila-interna-V2`).

## Deixado para quem constrói

- Forma exata das RPCs (SQL vs plpgsql, `security definer` com `search_path` fixo vs `invoker`), nomes finais.
- Limiar exato de "muito alta" na duplicata e calibração dos limiares com o histórico real (há 1.069 linhas e as
  56 repetições para testar).
- Valores exatos de `trinks_status` da fila que significam cancelado/faltou (conferir no projeto da fila ou nos
  dados de um dia útil — em 2026-10-18, domingo, a tabela estava vazia).
- Confirmar que `trinks_services.clienteid` e o `trinks_client_id` da fila estão no mesmo espaço de id (há dois
  espaços de id de *profissional* no Trinks; checar se cliente também tem). Se não estiverem, a fila entra só por
  nome: escolha vinda da fila grava `origem_cliente_trinks='lista'` com `cliente_trinks_id` NULL, e o sinal
  "Atendida?" usa o caminho por nome. *(decisão do coordenador)*
- Atenção: `trinks_services.service_date` é `text` 'DD/MM/YYYY' no banco real, apesar de o CLAUDE.md dizer
  `DATE`; conferir o tipo antes de escrever SQL (e corrigir o CLAUDE.md junto).
- Componentização do modal e da lista; testes (Vitest para lógica pura extraída; SQL em transação com ROLLBACK).
- Se o horário do atendimento aparece na lista: o protótipo mostra hora, mas nenhuma das duas fontes guarda
  hora — mostrar só os serviços.
