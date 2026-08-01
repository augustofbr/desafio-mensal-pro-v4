// auth-kit v0.1 — spa/auth/acesso.ts
// Contexto, hook e helpers de acesso — separados de AuthProvider.tsx pra esse
// arquivo exportar SÓ o componente `AuthProvider`. Um arquivo que mistura um
// componente React com exports não-componente (hook, tipos, funções) trava o
// Fast Refresh do Vite (react-refresh/only-export-components: "Fast refresh
// only works when a file only exports components") — este arquivo aqui não
// exporta nenhum componente, então a regra nem se aplica a ele.
import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { PAGE_KEYS, type PageAccess, type PageKey } from "@/lib/pages";

export type Acesso = {
  userId: string;
  email: string;
  nome: string;
  perfilId: string;
  perfilNome: string;
  paginas: Record<PageKey, PageAccess>;
};

export type RefreshOpts = {
  // true: re-resolve session+acesso SEM levantar `loading` — RequirePage/
  // RequireWrite continuam renderizando a árvore atual (com o `acesso`
  // antigo) até a nova chegar, em vez de devolver null e desmontar tudo.
  // Existe pro caminho pós-mutação da Task 11 (editar o próprio usuário ou o
  // perfil ao qual pertence): é o MESMO usuário, a chamada nasce de uma ação
  // deliberada dele, e RLS/Edge Function continuam sendo a autoridade real —
  // a matriz antiga governar por um round-trip é inofensivo; apagar a tela
  // bem no instante em que a confirmação da própria mutação acabou de
  // aparecer não é. `onAuthStateChange` e a montagem continuam chamando
  // refresh() sem opções (default false): ali a IDENTIDADE pode ter mudado,
  // e é exatamente o caso pra que `loading` levantar exista.
  manterConteudo?: boolean;
};

export type Ctx = {
  session: Session | null;
  acesso: Acesso | null;
  loading: boolean;
  refresh: (opts?: RefreshOpts) => Promise<void>;
};

export const AuthContext = createContext<Ctx>({
  session: null,
  acesso: null,
  loading: true,
  refresh: async () => {},
});

export async function carregarAcesso(userId: string, email: string): Promise<Acesso | null> {
  const { data, error } = await supabase
    .from("destaque_users_app")
    .select("id,nome,ativo,perfil_id,destaque_perfis(id,nome,paginas)")
    .eq("id", userId)
    .maybeSingle();
  // Fail-closed em todo ramo abaixo — mas mudo por padrão engoliria um soluço
  // de rede sem deixar rastro nenhum (o usuário só vê "Sem acesso", sem pista
  // pra ninguém depurar). console.error/warn distingue os três motivos.
  if (error) {
    console.error("carregarAcesso: falha na consulta a destaque_users_app", { userId, error: error.message });
    return null;
  }
  if (!data) {
    console.error("carregarAcesso: nenhuma linha em destaque_users_app para este usuário autenticado", { userId });
    return null;
  }
  if (!data.ativo) {
    console.warn("carregarAcesso: usuário inativo", { userId });
    return null;
  }
  const perfilRaw = (data as Record<string, unknown>)["destaque_perfis"] as
    | { id: string; nome: string; paginas: Record<string, unknown> }
    | { id: string; nome: string; paginas: Record<string, unknown> }[]
    | null;
  const perfil = Array.isArray(perfilRaw) ? perfilRaw[0] : perfilRaw;
  if (!perfil) {
    console.error("carregarAcesso: perfil ausente (apagado ou bloqueado por RLS)", { userId, perfilId: data.perfil_id });
    return null;
  }
  const matriz = (perfil.paginas ?? {}) as Record<string, unknown>;
  const paginas = Object.fromEntries(
    PAGE_KEYS.map((k) => {
      const v = matriz[k];
      return [k, v === "read" || v === "write" ? v : "none"];
    }),
  ) as Record<PageKey, PageAccess>;
  return { userId, email, nome: data.nome, perfilId: perfil.id, perfilNome: perfil.nome, paginas };
}

export function useAcesso() {
  return useContext(AuthContext);
}

export function hasAnyAccess(a: Acesso): boolean {
  return Object.values(a.paginas).some((x) => x !== "none");
}
export function hasAnyWrite(a: Acesso): boolean {
  return Object.values(a.paginas).some((x) => x === "write");
}
