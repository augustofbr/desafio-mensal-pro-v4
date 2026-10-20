// Interpretação pura da resposta de destaque_users_app (sem Supabase aqui,
// para ser testável: interpretarAcesso.test.ts). Separa os dois tipos de
// "sem acesso", que pedem reações opostas:
//   - "erro": a consulta falhou (rede, timeout, PostgREST). Não sabemos se a
//     pessoa tem acesso. Nunca desloga; a tela oferece "Tentar de novo".
//   - "ausente": a consulta respondeu e a pessoa não tem acesso (sem linha,
//     inativa, sem perfil). É o "removido": desloga este aparelho.
import { PAGE_KEYS, type PageAccess, type PageKey } from "@/lib/pages";
import type { Acesso } from "./acesso";

export type ResultadoAcesso =
  | { tipo: "ok"; acesso: Acesso }
  | { tipo: "ausente" }
  | { tipo: "erro" };

type PerfilEmbutido = { id: string; nome: string; paginas: Record<string, unknown> | null };

export function interpretarAcesso(
  userId: string,
  email: string,
  data: unknown,
  error: { message: string } | null,
): ResultadoAcesso {
  if (error) {
    console.error("carregarAcesso: falha na consulta a destaque_users_app", { userId, error: error.message });
    return { tipo: "erro" };
  }
  if (!data) {
    console.error("carregarAcesso: nenhuma linha em destaque_users_app para este usuário autenticado", { userId });
    return { tipo: "ausente" };
  }
  const linha = data as Record<string, unknown>;
  if (!linha.ativo) {
    console.warn("carregarAcesso: usuário inativo", { userId });
    return { tipo: "ausente" };
  }
  const perfilRaw = linha["destaque_perfis"] as PerfilEmbutido | PerfilEmbutido[] | null | undefined;
  const perfil = Array.isArray(perfilRaw) ? perfilRaw[0] : perfilRaw;
  if (!perfil) {
    // perfil_id nulo: a pessoa está sem perfil (perfil apagado com FK set
    // null) → ausente. perfil_id preenchido e embed nulo: a linha do perfil
    // não veio, o que pode ser RLS em destaque_perfis ou outra falha de
    // leitura, e não prova que o acesso acabou → erro (não desloga).
    if (linha.perfil_id == null) {
      console.error("carregarAcesso: usuário sem perfil", { userId });
      return { tipo: "ausente" };
    }
    console.error("carregarAcesso: perfil não veio na consulta (RLS ou falha de leitura)", { userId, perfilId: linha.perfil_id });
    return { tipo: "erro" };
  }
  const matriz = (perfil.paginas ?? {}) as Record<string, unknown>;
  const paginas = Object.fromEntries(
    PAGE_KEYS.map((k) => {
      const v = matriz[k];
      return [k, v === "read" || v === "write" ? v : "none"];
    }),
  ) as Record<PageKey, PageAccess>;
  return {
    tipo: "ok",
    acesso: { userId, email, nome: String(linha.nome ?? ""), perfilId: perfil.id, perfilNome: perfil.nome, paginas },
  };
}
