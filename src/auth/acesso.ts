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
import type { PageAccess, PageKey } from "@/lib/pages";
import { interpretarAcesso, type ResultadoAcesso } from "./interpretarAcesso";

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
  // true quando a verificação do acesso FALHOU (rede, PostgREST, exceção), e
  // não quando a pessoa não tem acesso. Ver interpretarAcesso.ts.
  erroAcesso: boolean;
  loading: boolean;
  refresh: (opts?: RefreshOpts) => Promise<void>;
};

export const AuthContext = createContext<Ctx>({
  session: null,
  acesso: null,
  erroAcesso: false,
  loading: true,
  refresh: async () => {},
});

// Distingue erro de consulta ("erro") de ausência legítima ("ausente"); ver
// interpretarAcesso.ts. Nunca rejeita: exceção também vira "erro".
export async function carregarAcesso(userId: string, email: string): Promise<ResultadoAcesso> {
  try {
    const { data, error } = await supabase
      .from("destaque_users_app")
      .select("id,nome,ativo,perfil_id,destaque_perfis(id,nome,paginas)")
      .eq("id", userId)
      .maybeSingle();
    return interpretarAcesso(userId, email, data, error);
  } catch (e) {
    console.error("carregarAcesso: exceção ao consultar destaque_users_app", { userId, e });
    return { tipo: "erro" };
  }
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
