// auth-kit v0.1 — Edge Function destaque-auth-admin — operações privilegiadas do SPA.
//
// ⚠ ESTA É A ÚNICA DETENTORA DO service_role NO SABOR SPA. O SPA roda no
// browser: não existe servidor onde guardar segredo. Toda mutação do núcleo
// (destaque_users_app / destaque_perfis) passa por aqui, porque o SQL do kit
// (001_core) revoga insert/update/delete de `authenticated` e só deixa SELECT
// sob RLS. Consequência direta: o service_role IGNORA RLS — o TRIO de checagens
// do handler é a única coisa entre um usuário autenticado qualquer e o controle
// total da tabela de usuários:
//   1/3  JWT válido (revalidado no GoTrue, não só no gateway);
//   2/3  o chamador alcança a página "usuarios" (nível read OU write) —
//        espelha `can_read_page('usuarios')` do 001_core, que é quem libera o
//        SELECT das duas tabelas do núcleo;
//   3/3  a AÇÃO pedida é de leitura (allowlist ACOES_LEITURA) ou o chamador
//        tem nível "write" — deny by default.
// Nenhuma ação é alcançável antes das três; nenhuma consulta privilegiada
// acontece entre elas além da própria resolução do chamador (checagem 2/3).
//
// Contrato HTTP (amarrado por spa/auth/authAdmin.ts, que lê o corpo JSON
// inclusive em não-2xx — TODA resposta carrega corpo JSON):
//   200 {ok:true, data?}     — sucesso.
//   200 {ok:false, error}    — falha de REGRA DE NEGÓCIO ou de validação de
//                              campo (último admin ativo, perfil em uso, email
//                              já cadastrado, matriz inválida, perfil/usuário
//                              não encontrado, is_system, "Nome muito curto"…).
//                              São desfechos esperados de uma requisição
//                              válida; o texto precisa chegar INTACTO ao
//                              operador — é assim que a orientação "promova o
//                              novo admin primeiro, depois rebaixe o antigo"
//                              (guard anti-lockout do 001_core) aparece na tela.
//   400                      — requisição malformada (corpo não-JSON, payload
//                              que não é objeto) ou ação desconhecida.
//   401                      — Authorization ausente ou JWT inválido/expirado.
//   403                      — autenticado, mas sem autorização para o que
//                              pediu (falha de autorização, não de regra de
//                              negócio). Duas variantes, com textos
//                              diferentes de propósito: "não permite acessar
//                              usuários" (nível `none` — nem lê) e "não
//                              permite administrar usuários" (nível `read`
//                              pedindo uma ação de escrita).
//   405                      — método diferente de POST.
//   500                      — erro inesperado (exceção não tratada, função
//                              mal configurada).
//
// Semântica espelhada de next/lib/actions/usuarios.ts (mesmas validações,
// mesmos guards, mesmas mensagens) — os dois sabores sentam sobre o mesmo
// núcleo SQL e precisam se comportar igual.
//
// ⚠ ESCALONAMENTO DE PRIVILÉGIO (idêntico ao aviso do sabor Next): validarMatriz
// aceita "write" em QUALQUER chave, inclusive "usuarios". Dar Edição na página
// "usuarios" a um perfil equivale a dar administração total — essa pessoa pode
// criar um usuário admin no próprio email e assumir tudo. É intencional: é
// assim que se cria o segundo administrador.
//
// Deploy: fica pro piloto (Fase 2). Secrets exigidos na função:
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ambos injetados pela plataforma) e
// SITE_URL — a URL COMPLETA de destino do convite (ex.:
// https://app.exemplo.com/painel), que precisa estar na allowlist de
// Auth → URL Configuration → Redirect URLs do projeto Supabase. O SPA não tem
// rota /auth/callback como o Next: o supabase-js resolve a sessão do hash na
// própria URL de destino (detectSessionInUrl).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const cors = {
  // Origin "*" é seguro aqui: a autorização vem do header Authorization, não
  // de cookie — não existe requisição autenticada "por ambiente" pra um site
  // terceiro forjar (sem o JWT ele não passa da checagem 1).
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const AUTH_USERS_PAGE_SIZE = 1000;
const AUTH_USERS_MAX_PAGES = 50;

type PerfilEmbed = { id: string; paginas: Record<string, string> | null };
type CallerRow = { id: string; ativo: boolean; perfil: PerfilEmbed | PerfilEmbed[] | null };
type NomeEmbed = { nome: string };
type UsuarioDbRow = {
  id: string;
  nome: string;
  ativo: boolean;
  perfil_id: string;
  perfil: NomeEmbed | NomeEmbed[] | null;
};

// Pura (testável sem subir servidor): resolve o NÍVEL do chamador na página
// "usuarios" — uma vez só, no topo do handler. Não existe coluna de cargo no
// banco: a matriz é a única fonte de autorização. Fail-closed ("none") em TODA
// entrada malformada: linha ausente, inativo, perfil ausente, matriz
// ausente/array, chave ausente ou valor fora de read/write.
//
// Por que NÍVEL e não booleano (revisão final, I1): o 001_core dá SELECT em
// todas as linhas de users_app/perfis a quem tem `can_read_page('usuarios')`
// (read OU write), e o sabor Next renderiza a mesma tela em somente-leitura
// para esse nível. Um booleano `podeAdministrar` acima do switch fazia
// listar_usuarios/listar_perfis devolverem 403 para o nível read — a tela do
// SPA prometia leitura no cabeçalho e as duas listas falhavam.
export type NivelUsuarios = "none" | "read" | "write";

export function nivelUsuarios(row: CallerRow | null | undefined): NivelUsuarios {
  if (!row || row.ativo !== true) return "none";
  // Embed de relação: sem tipos gerados o PostgREST pode entregar o perfil como
  // objeto OU como array de um item (mesmo tratamento de spa/auth/AuthProvider).
  const perfil = Array.isArray(row.perfil) ? row.perfil[0] : row.perfil;
  const paginas: unknown = perfil?.paginas;
  if (!paginas || typeof paginas !== "object" || Array.isArray(paginas)) return "none";
  const v = (paginas as Record<string, unknown>)["usuarios"];
  return v === "write" ? "write" : v === "read" ? "read" : "none";
}

// Mantida (e ainda exportada) como o predicado de ADMINISTRAÇÃO: é ela que os
// caminhos de mutação exigem. Definida em cima de nivelUsuarios para que as
// duas nunca possam divergir.
export function podeAdministrar(row: CallerRow | null | undefined): boolean {
  return nivelUsuarios(row) === "write";
}

// ⚠ FRONTEIRA DE ESCRITA — ALLOWLIST FECHADA, NÃO BLOCKLIST. Só as ações
// listadas aqui são alcançáveis com nível "read"; QUALQUER outra — incluindo
// uma ação nova que alguém acrescente ao switch amanhã, e incluindo ação
// desconhecida — exige "write". É por isso que a checagem abaixo é
// `!ACOES_LEITURA.has(action)` e não uma lista de ações mutantes: esquecer de
// atualizar uma blocklist abre um caminho de escrita em silêncio; esquecer de
// atualizar esta allowlist, no pior caso, devolve 403 numa leitura nova.
const ACOES_LEITURA: ReadonlySet<string> = new Set(["listar_usuarios", "listar_perfis"]);

// Gêmea da de cima no nível do PERFIL (só a matriz, sem o `ativo`) — espelha
// perfilEhAdmin() de next/lib/actions/usuarios.ts.
function perfilEhAdmin(paginas: unknown): boolean {
  return ((paginas ?? {}) as Record<string, unknown>)["usuarios"] === "write";
}

// Os guards de auto-dano ("não pode desativar a si mesmo", "não pode alterar o
// próprio perfil") comparam o id vindo do payload com o `sub` do JWT. O do JWT é
// sempre minúsculo canônico, mas UUID_RE abaixo é case-insensitive: mandar o
// PRÓPRIO id em maiúsculas passaria na validação, falharia num `===` cru e ainda
// assim casaria a linha no banco (o `.eq` faz cast para uuid, que não distingue
// caixa), contornando o guard. Comparação normalizada dos dois lados. Sem
// escalada de privilégio — só dá pra prejudicar a si mesmo, e os guards de
// último admin continuam valendo —, mas é barato fechar.
// (Espelhado em next/lib/actions/usuarios.ts.)
function mesmoUsuario(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

type MatrizOk = { ok: true; paginas: Record<string, string> };
type MatrizErro = { ok: false; error: string };

// Diferença conhecida vs. o sabor Next: lá validarMatriz itera PAGE_KEYS (o
// registry compilado no bundle) e descarta chaves fora dele; aqui a função não
// tem acesso ao registry (é deployada avulsa), então valida as chaves que
// vierem. Efeito prático é o mesmo — o CHECK destaque_matriz_valida no banco
// aceita qualquer chave com valor válido, e as funções de gate resolvem chave
// ausente como 'none' (coalesce). Uma chave estranha vira lixo inerte no jsonb.
function validarMatriz(raw: unknown): MatrizOk | MatrizErro {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Matriz de páginas inválida." };
  }
  const paginas: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v !== "none" && v !== "read" && v !== "write") {
      return { ok: false, error: `Acesso inválido para "${k}".` };
    }
    paginas[k] = v;
  }
  return { ok: true, paginas };
}

// Busca TODAS as contas de auth.users paginando até a última. Espelha
// listarTodasContasAuth() de next/lib/queries/usuarios.ts, inclusive o teto de
// páginas: o projeto Supabase pode ser compartilhado com outro app, então
// auth.users cresce por motivos alheios a este app. Atingir o teto LANÇA em vez
// de devolver lista incompleta em silêncio (uma lista truncada faria
// criar_usuario convidar de novo alguém que já tem conta).
async function listarTodasContasAuth(admin: SupabaseClient) {
  const todas: { id: string; email?: string; last_sign_in_at?: string | null }[] = [];
  for (let pagina = 1; pagina <= AUTH_USERS_MAX_PAGES; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: pagina,
      perPage: AUTH_USERS_PAGE_SIZE,
    });
    if (error) throw error;
    todas.push(...data.users);
    if (data.users.length < AUTH_USERS_PAGE_SIZE) return todas;
  }
  throw new Error(
    `Paginação de contas auth atingiu o teto de ${AUTH_USERS_MAX_PAGES} páginas sem terminar — abortando para não devolver lista incompleta.`,
  );
}

// LIMITAÇÃO CONHECIDA (idêntica à do sabor Next): duas trocas simultâneas podem
// passar por esta checagem ao mesmo tempo, antes de qualquer update commitar —
// condição de corrida aceita como risco conhecido AQUI. O guard anti-lockout do
// banco é o backstop transacional de verdade; isto aqui só produz mensagem
// amigável antes de o banco levantar a exceção crua.
//
// "Backstop de verdade" é literal desde a revisão final do kit:
// `destaque_guard_lockout()` toma
// `pg_advisory_xact_lock(hashtext('destaque_lockout'))` como primeiro
// statement, então as checagens deferidas de duas transações concorrentes
// serializam e a segunda enxerga o commit da primeira. Antes disso a frase era
// falsa: linhas disjuntas, nenhum conflito de escrita, as duas passavam (write
// skew, zero admins ativos).
//
// Como cada request HTTP é uma transação própria, a troca de admin NÃO pode ser
// "rebaixa o antigo, depois promove o novo": a primeira metade já falha. A
// ordem correta é sempre promover o novo administrador PRIMEIRO.
//
// Fail-safe: consulta que falha devolve conjunto vazio (`ids.length === 0`) e o
// caminho BLOQUEIA (retorna true).
async function ultimoAdminAtivo(admin: SupabaseClient, excetoUserId: string): Promise<boolean> {
  const { data: perfisAdmin } = await admin
    .from("destaque_perfis")
    .select("id")
    .eq("paginas->>usuarios", "write");
  const ids = (perfisAdmin ?? []).map((p: { id: string }) => p.id);
  if (ids.length === 0) return true;
  const { count } = await admin
    .from("destaque_users_app")
    .select("id", { count: "exact", head: true })
    .eq("ativo", true)
    .neq("id", excetoUserId)
    .in("perfil_id", ids);
  return (count ?? 0) === 0;
}

// Terceiro caminho de rebaixamento (além de atualizar_usuario e alternar_ativo):
// tirar `usuarios: write` de um PERFIL derruba todos os usuários dele de uma
// vez. Verdadeiro quando não sobra nenhum admin ativo fora deste perfil.
async function semOutroAdminAtivo(admin: SupabaseClient, excetoPerfilId: string): Promise<boolean> {
  const { data: perfisAdmin } = await admin
    .from("destaque_perfis")
    .select("id")
    .eq("paginas->>usuarios", "write");
  const ids = (perfisAdmin ?? [])
    .map((p: { id: string }) => p.id)
    .filter((id: string) => id !== excetoPerfilId);
  if (ids.length === 0) return true;
  const { count } = await admin
    .from("destaque_users_app")
    .select("id", { count: "exact", head: true })
    .eq("ativo", true)
    .in("perfil_id", ids);
  return (count ?? 0) === 0;
}

// Interface sempre envia string (mesmo vazia) no campo descrição opcional;
// convertemos "" pra null, senão a tabela mostra célula vazia em vez do
// travessão do fallback.
const descricaoOuNull = (d: string): string | null => (d ? d : null);

async function handler(req: Request): Promise<Response> {
  // ── 0. Preflight e método: nenhuma chamada privilegiada acontece aqui ──────
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "Método não suportado." }, 405);

  // ── 1. CHECAGEM 1/3 — quem chama? ─────────────────────────────────────────
  // O gateway do Supabase já valida a assinatura do JWT (verify_jwt), mas não
  // podemos depender só disso: a função pode ser deployada com --no-verify-jwt.
  // getUser(token) revalida contra o GoTrue e resolve o sub.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  // Curto-circuito ANTES de instanciar o cliente privilegiado: sem token não há
  // o que checar, e getUser("") cairia no caminho de "sessão armazenada".
  if (!token) return json({ ok: false, error: "Não autenticado." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      { ok: false, error: "Função mal configurada: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes." },
      500,
    );
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) return json({ ok: false, error: "Não autenticado." }, 401);
  const callerId = userData.user.id;

  // ── 2. CHECAGEM 2/3 — o chamador alcança a página "usuarios"? ─────────────
  // .returns<>() é obrigatório nos selects com embed apelidado: o postgrest-js
  // faz o parse do select EM NÍVEL DE TIPO, e o `destaque_` do template (que
  // só vira identificador válido depois do render) faz esse parse falhar com
  // ParserError. O tipo explícito abaixo é a mesma forma que o PostgREST
  // devolve em runtime.
  const { data: caller, error: callerErr } = await admin
    .from("destaque_users_app")
    .select("id,ativo,perfil:destaque_perfis(id,paginas)")
    .eq("id", callerId)
    .returns<CallerRow[]>()
    .maybeSingle();
  // Fail-closed: erro na consulta NÃO vira "deixa passar". O log distingue
  // "consulta falhou" de "não é admin" — as duas devolvem o mesmo 403 pro
  // chamador (não vazamos detalhe de infraestrutura), mas quem opera precisa
  // conseguir diferenciar nos logs da função.
  if (callerErr) {
    console.error("destaque-auth-admin: falha ao resolver o chamador", { callerId, error: callerErr.message });
  }
  const nivel: NivelUsuarios = callerErr ? "none" : nivelUsuarios(caller);
  if (nivel === "none") {
    return json({ ok: false, error: "Seu perfil não permite acessar usuários." }, 403);
  }

  // ── 3. Só agora o corpo é interpretado ────────────────────────────────────
  // A ordem do item 15 de docs/armadilhas.md continua respeitada: nenhuma
  // consulta privilegiada acontece entre o parse do corpo e a checagem 3/3
  // logo abaixo — o parse serve só para descobrir QUAL ação está sendo pedida,
  // e é o único passo entre as duas checagens.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Requisição inválida (corpo não é JSON)." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "Requisição inválida (corpo deve ser um objeto)." }, 400);
  }
  const { action, payload: payloadRaw } = body as { action?: unknown; payload?: unknown };
  if (payloadRaw !== undefined && (typeof payloadRaw !== "object" || payloadRaw === null || Array.isArray(payloadRaw))) {
    return json({ ok: false, error: "Requisição inválida (payload deve ser um objeto)." }, 400);
  }
  const payload = (payloadRaw ?? {}) as Record<string, unknown>;

  // ── 4. CHECAGEM 3/3 — esta AÇÃO exige administração? ──────────────────────
  // Deny by default: tudo que não está em ACOES_LEITURA precisa de "write".
  // Esta é a fronteira de segurança inteira do sabor SPA — as mutações rodam
  // sob service_role, que ignora RLS (docs/armadilhas.md #15), então não há
  // policy por baixo pegando um erro aqui. Fica ANTES do switch: nenhum `case`
  // mutante é alcançável sem passar por ela.
  if (nivel !== "write" && !ACOES_LEITURA.has(typeof action === "string" ? action : "")) {
    return json({ ok: false, error: "Seu perfil não permite administrar usuários." }, 403);
  }

  try {
    switch (action) {
      // ── perfis (leitura) ────────────────────────────────────────────────
      case "listar_perfis": {
        const [perfisRes, usersRes] = await Promise.all([
          admin
            .from("destaque_perfis")
            .select("id,nome,descricao,paginas,is_system")
            .order("is_system", { ascending: false })
            .order("nome"),
          admin.from("destaque_users_app").select("perfil_id"),
        ]);
        if (perfisRes.error) throw new Error(perfisRes.error.message);
        if (usersRes.error) throw new Error(usersRes.error.message);
        const contagem = new Map<string, number>();
        for (const u of usersRes.data ?? []) {
          contagem.set(u.perfil_id, (contagem.get(u.perfil_id) ?? 0) + 1);
        }
        // Shape espelha PerfilRow de next/lib/queries/usuarios.ts — a UI da
        // Task 11 é o porte do UsuariosPerfisManager, que consome estes campos.
        // `paginas` vai crua: a normalização por PAGE_KEYS é feita no cliente,
        // que é quem tem o registry.
        const data = (perfisRes.data ?? []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          nome: p.nome as string,
          descricao: (p.descricao ?? null) as string | null,
          paginas: (p.paginas ?? {}) as Record<string, string>,
          isSystem: p.is_system === true,
          totalUsuarios: contagem.get(p.id as string) ?? 0,
        }));
        return json({ ok: true, data });
      }

      // ── usuários (leitura) ──────────────────────────────────────────────
      case "listar_usuarios": {
        const [rowsRes, authUsers] = await Promise.all([
          admin
            .from("destaque_users_app")
            .select("id,nome,ativo,perfil_id,perfil:destaque_perfis(nome)")
            .order("nome")
            .returns<UsuarioDbRow[]>(),
          listarTodasContasAuth(admin),
        ]);
        if (rowsRes.error) throw new Error(rowsRes.error.message);
        const authById = new Map(authUsers.map((u) => [u.id, u]));
        const data = (rowsRes.data ?? []).map((r) => {
          // Embed pode vir como objeto OU array de um item (fan-out do
          // PostgREST) — mesmo tratamento de spa/auth/AuthProvider.
          const perfil = Array.isArray(r.perfil) ? r.perfil[0] : r.perfil;
          const au = authById.get(r.id);
          return {
            id: r.id,
            nome: r.nome,
            email: au?.email ?? "—",
            ativo: r.ativo === true,
            perfilId: r.perfil_id,
            perfilNome: perfil?.nome ?? "—",
            ultimoAcesso: au?.last_sign_in_at ?? null,
          };
        });
        return json({ ok: true, data });
      }

      // ── usuários (escrita) ──────────────────────────────────────────────
      case "criar_usuario": {
        const nome = texto(payload.nome);
        const email = texto(payload.email);
        const perfilId = payload.perfilId;
        if (nome.length < 2) return json({ ok: false, error: "Nome muito curto" });
        if (!EMAIL_RE.test(email)) return json({ ok: false, error: "Email inválido" });
        if (!ehUuid(perfilId)) return json({ ok: false, error: "Dados inválidos." });

        const { data: perfil } = await admin
          .from("destaque_perfis")
          .select("id")
          .eq("id", perfilId)
          .maybeSingle();
        if (!perfil) return json({ ok: false, error: "Perfil não encontrado." });

        // O projeto Supabase pode ser compartilhado: o email pode já ter conta
        // auth de outro app (ou de um convite anterior). Nesse caso vincula, não
        // convida de novo.
        let contas: Awaited<ReturnType<typeof listarTodasContasAuth>>;
        try {
          contas = await listarTodasContasAuth(admin);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return json({ ok: false, error: `Falha consultando contas: ${msg}` });
        }
        const existente = contas.find((u) => u.email?.toLowerCase() === email.toLowerCase());

        let userId: string;
        let jaTinhaConta = false;
        if (existente) {
          userId = existente.id;
          jaTinhaConta = true;
          const { data: jaMembro } = await admin
            .from("destaque_users_app")
            .select("id")
            .eq("id", userId)
            .maybeSingle();
          if (jaMembro) return json({ ok: false, error: "Este email já é usuário do sistema." });
        } else {
          const siteUrl = Deno.env.get("SITE_URL");
          if (!siteUrl) {
            return json({ ok: false, error: "Não foi possível determinar a URL de retorno do convite." });
          }
          const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo: siteUrl,
          });
          if (error) return json({ ok: false, error: `Convite falhou: ${error.message}` });
          userId = data.user.id;
        }

        const { error: insErr } = await admin
          .from("destaque_users_app")
          .insert({ id: userId, nome, perfil_id: perfilId, ativo: true });
        if (insErr) return json({ ok: false, error: `Falha ao cadastrar: ${insErr.message}` });
        // jaTinhaConta decide a mensagem ("acesso liberado, já tinha conta" vs.
        // "convite enviado por email") — a cópia mora na UI (Task 11).
        return json({ ok: true, data: { jaTinhaConta } });
      }

      case "atualizar_usuario": {
        const userId = payload.userId;
        const nome = texto(payload.nome);
        const perfilId = payload.perfilId;
        if (!ehUuid(userId) || !ehUuid(perfilId)) return json({ ok: false, error: "Dados inválidos." });
        if (nome.length < 2) return json({ ok: false, error: "Nome muito curto" });

        const { data: alvo } = await admin
          .from("destaque_users_app")
          .select("id,perfil_id")
          .eq("id", userId)
          .maybeSingle();
        if (!alvo) return json({ ok: false, error: "Usuário não encontrado." });

        // Um único round-trip para os dois perfis envolvidos (o atual do alvo e
        // o novo): é a matriz deles que diz quem é administrador.
        const { data: perfisEnvolvidos } = await admin
          .from("destaque_perfis")
          .select("id,paginas")
          .in("id", [alvo.perfil_id, perfilId]);
        const perfilAtual = (perfisEnvolvidos ?? []).find((p: { id: string }) => p.id === alvo.perfil_id);
        const novoPerfil = (perfisEnvolvidos ?? []).find((p: { id: string }) => p.id === perfilId);
        if (!novoPerfil) return json({ ok: false, error: "Perfil não encontrado." });

        const mudouPerfil = alvo.perfil_id !== perfilId;
        if (mudouPerfil && mesmoUsuario(userId, callerId)) {
          return json({ ok: false, error: "Você não pode alterar o próprio perfil." });
        }
        if (
          mudouPerfil &&
          perfilEhAdmin(perfilAtual?.paginas) &&
          !perfilEhAdmin(novoPerfil.paginas) &&
          (await ultimoAdminAtivo(admin, userId))
        ) {
          return json({
            ok: false,
            error:
              "Esta pessoa é a última administradora ativa. Promova outra pessoa a um perfil com Edição em Usuários primeiro; só depois rebaixe esta.",
          });
        }

        const { error } = await admin
          .from("destaque_users_app")
          .update({ nome, perfil_id: perfilId, updated_at: new Date().toISOString() })
          .eq("id", userId);
        if (error) return json({ ok: false, error: error.message });
        return json({ ok: true });
      }

      case "alternar_ativo": {
        const userId = payload.userId;
        const ativo = payload.ativo;
        if (!ehUuid(userId) || typeof ativo !== "boolean") {
          return json({ ok: false, error: "Dados inválidos." });
        }
        if (!ativo && mesmoUsuario(userId, callerId)) {
          return json({ ok: false, error: "Você não pode desativar a si mesmo." });
        }

        const { data: alvo } = await admin
          .from("destaque_users_app")
          .select("id,perfil_id")
          .eq("id", userId)
          .maybeSingle();
        if (!alvo) return json({ ok: false, error: "Usuário não encontrado." });

        const { data: perfilAlvo, error: perfilErr } = await admin
          .from("destaque_perfis")
          .select("paginas")
          .eq("id", alvo.perfil_id)
          .maybeSingle();

        // Fail-closed, mesma postura do countErr de excluir_perfil: sem
        // conseguir LER a matriz do alvo não dá pra saber se ele é admin, e
        // pular o guard não "libera" a desativação de verdade — o constraint
        // trigger do banco levanta no commit e o operador recebe a string crua
        // dele ("auth-kit: operação deixaria o sistema sem nenhum admin
        // ativo"), em vez da orientação de promover antes de rebaixar. Só
        // bloqueia na DESATIVAÇÃO: reativar não pode deixar o sistema sem admin.
        if (!ativo && (perfilErr || !perfilAlvo)) {
          const detalhe = perfilErr ? `: ${perfilErr.message}` : ".";
          return json({ ok: false, error: `Não foi possível verificar o perfil deste usuário${detalhe}` });
        }

        if (!ativo && perfilEhAdmin(perfilAlvo?.paginas) && (await ultimoAdminAtivo(admin, userId))) {
          return json({
            ok: false,
            error:
              "Esta pessoa é a última administradora ativa. Promova outra pessoa a um perfil com Edição em Usuários primeiro; só depois desative esta.",
          });
        }

        const { error } = await admin
          .from("destaque_users_app")
          .update({ ativo, updated_at: new Date().toISOString() })
          .eq("id", userId);
        if (error) return json({ ok: false, error: error.message });
        return json({ ok: true });
      }

      // ── perfis (escrita) ────────────────────────────────────────────────
      case "criar_perfil": {
        const nome = texto(payload.nome);
        const descricao = texto(payload.descricao);
        if (nome.length < 2) return json({ ok: false, error: "Nome muito curto" });
        if (descricao.length > 200) return json({ ok: false, error: "Descrição muito longa (máx. 200)." });
        const matriz = validarMatriz(payload.paginas);
        if (!matriz.ok) return json(matriz);

        const { error } = await admin.from("destaque_perfis").insert({
          nome,
          descricao: descricaoOuNull(descricao),
          paginas: matriz.paginas,
          is_system: false,
        });
        if (error) {
          return json({
            ok: false,
            error: error.code === "23505" ? "Já existe um perfil com esse nome." : error.message,
          });
        }
        return json({ ok: true });
      }

      case "atualizar_perfil": {
        const perfilId = payload.perfilId;
        const nome = texto(payload.nome);
        const descricao = texto(payload.descricao);
        if (!ehUuid(perfilId)) return json({ ok: false, error: "Dados inválidos." });
        if (nome.length < 2) return json({ ok: false, error: "Nome muito curto" });
        if (descricao.length > 200) return json({ ok: false, error: "Descrição muito longa (máx. 200)." });

        const { data: perfil } = await admin
          .from("destaque_perfis")
          .select("id,nome,is_system,paginas")
          .eq("id", perfilId)
          .maybeSingle();
        if (!perfil) return json({ ok: false, error: "Perfil não encontrado." });
        if (perfil.is_system) {
          return json({
            ok: false,
            error: "Perfis de sistema (Admin, Somente Leitura) não podem ser alterados.",
          });
        }

        const matriz = validarMatriz(payload.paginas);
        if (!matriz.ok) return json(matriz);

        // Terceiro caminho de rebaixamento: tirar a Edição em "usuarios" de um
        // perfil admin CUSTOMIZADO derruba todos os usuários dele de uma vez. O
        // guard do banco pega, mas devolveria a string crua dele; aqui a pessoa
        // recebe a mesma orientação de ordem dos outros dois caminhos.
        if (
          perfilEhAdmin(perfil.paginas) &&
          matriz.paginas["usuarios"] !== "write" &&
          (await semOutroAdminAtivo(admin, perfil.id))
        ) {
          return json({
            ok: false,
            error:
              "Este é o único perfil administrador com gente ativa. Promova outra pessoa a um perfil com Edição em Usuários primeiro; só depois tire a Edição deste perfil.",
          });
        }

        const { error } = await admin
          .from("destaque_perfis")
          .update({
            nome,
            descricao: descricaoOuNull(descricao),
            paginas: matriz.paginas,
            updated_at: new Date().toISOString(),
          })
          .eq("id", perfil.id);
        if (error) {
          return json({
            ok: false,
            error: error.code === "23505" ? "Já existe um perfil com esse nome." : error.message,
          });
        }
        return json({ ok: true });
      }

      case "excluir_perfil": {
        const perfilId = payload.perfilId;
        if (!ehUuid(perfilId)) return json({ ok: false, error: "Dados inválidos." });

        const { data: perfil } = await admin
          .from("destaque_perfis")
          .select("id,is_system")
          .eq("id", perfilId)
          .maybeSingle();
        if (!perfil) return json({ ok: false, error: "Perfil não encontrado." });
        if (perfil.is_system) {
          return json({ ok: false, error: "Perfis de sistema não podem ser excluídos." });
        }

        const { count, error: countErr } = await admin
          .from("destaque_users_app")
          .select("id", { count: "exact", head: true })
          .eq("perfil_id", perfilId);
        // Fail-closed: se a contagem falhar, não assumimos "0 usuários" — isso
        // abriria brecha pra excluir um perfil em uso.
        if (countErr) {
          return json({ ok: false, error: `Não foi possível verificar o uso do perfil: ${countErr.message}` });
        }
        if ((count ?? 0) > 0) {
          return json({ ok: false, error: "Perfil em uso — mova os usuários antes de excluir." });
        }

        const { error } = await admin.from("destaque_perfis").delete().eq("id", perfilId);
        if (error) return json({ ok: false, error: error.message });
        return json({ ok: true });
      }

      default:
        return json({ ok: false, error: `Ação desconhecida: ${String(action)}` }, 400);
    }
  } catch (e) {
    // O detalhe fica no log da função; o operador recebe mensagem genérica.
    // Devolver `e.message` cru entregaria interno de PostgREST/GoTrue pra tela
    // de quem não tem o que fazer com isso.
    console.error("destaque-auth-admin: exceção não tratada", { action, callerId, erro: e });
    return json({ ok: false, error: "Erro inesperado — consulte os logs da função." }, 500);
  }
}

// Deno.serve executa na importação. O guard deixa authz.test.ts importar
// podeAdministrar sem subir servidor:
//   AUTH_KIT_TEST=1 deno test --allow-env template/spa/edge/auth-admin/
// Em produção a variável não existe e a função sobe normalmente.
if (!Deno.env.get("AUTH_KIT_TEST")) {
  Deno.serve(handler);
}
