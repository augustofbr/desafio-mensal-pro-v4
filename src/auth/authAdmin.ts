// auth-kit v0.1 — spa/auth/authAdmin.ts — cliente da Edge Function destaque-auth-admin.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type AuthAdminAction =
  | "listar_usuarios" | "criar_usuario" | "atualizar_usuario" | "alternar_ativo"
  | "listar_perfis" | "criar_perfil" | "atualizar_perfil" | "excluir_perfil";

export type AuthAdminResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

// CONTRATO DE ERRO — amarra a Task 10 (a Edge Function destaque-auth-admin
// PRECISA honrar isto; a Task 11 consome só o que authAdmin() devolve):
//
//   - Falha de REGRA DE NEGÓCIO (último admin ativo, perfil em uso, email já
//     cadastrado, matriz inválida, chamador sem write em "usuarios" etc.)
//     => HTTP 200 com corpo {ok:false, error:"<mensagem pro humano>"}.
//     É assim que a orientação "promova antes de rebaixar" do guard
//     anti-lockout (001_core.sql) e as mensagens equivalentes de
//     next/lib/actions/usuarios.ts chegam INTACTAS ao operador.
//   - Não-2xx fica reservado pra transporte (rede, CORS), autenticação
//     ausente/inválida (sem sessão, JWT expirado) e erro inesperado
//     (exceção não tratada dentro da function). Nesses casos pode não
//     existir corpo JSON utilizável nenhum.
//
// O cliente abaixo é defensivo dos dois lados:
//   1) Em não-2xx, o supabase-js rejeita com FunctionsHttpError cujo
//      `.message` é só o texto genérico "Edge Function returned a non-2xx
//      status code" — o corpo real (se existir) só está acessível via
//      `error.context`, que é a Response bruta. Tentamos ler esse corpo e
//      preferimos o `error` de dentro dele; se não houver corpo utilizável,
//      caímos no `.message` genérico.
//   2) Em 200, ainda validamos a FORMA antes de confiar: um corpo vazio dá
//      `data === null`, e um corpo malformado (bug na function) pode não
//      ter `ok` nenhum. Sem o guard abaixo, isso viraria literalmente
//      "undefined" na tela do operador.
export async function authAdmin(action: AuthAdminAction, payload: Record<string, unknown> = {}): Promise<AuthAdminResult> {
  const { data, error } = await supabase.functions.invoke("destaque-auth-admin", {
    body: { action, payload },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { error?: unknown };
        if (typeof body?.error === "string" && body.error) {
          return { ok: false, error: body.error };
        }
      } catch {
        // Corpo não era JSON (ou já foi consumido) — cai no fallback abaixo.
      }
    }
    return { ok: false, error: error.message };
  }

  if (typeof (data as { ok?: unknown } | null)?.ok !== "boolean") {
    return { ok: false, error: "Resposta inesperada do servidor (formato inválido)." };
  }
  return data as AuthAdminResult;
}
