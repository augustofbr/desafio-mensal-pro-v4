// Decide o que uma rota protegida mostra. Pura, sem React nem Supabase, para
// ser testável (decidirTela.test.ts) e para o RequirePage não ter regra
// escondida em if encadeado.
//
// Ordem de precedência (a primeira que casa vence):
//   1. loading     → "carregando": enquanto a sessão/acesso estão sendo
//      resolvidos, nada protegido é decidido (nem liberado, nem barrado).
//   2. erro        → "erro": a verificação do acesso FALHOU (rede, PostgREST,
//      exceção). Não sabemos se a pessoa tem acesso: nada é liberado e nada
//      desloga; a tela oferece "Tentar de novo". Vem antes de "login" porque
//      só há erro sem sessão quando o próprio getSession falhou, e aí também
//      não sabemos se há sessão.
//   3. sem sessão  → "login".
//   4. sessão, mas acesso null (sem erro) → "removido": inativo, sem linha em
//      destaque_users_app ou perfil apagado (interpretarAcesso → "ausente").
//   5. acesso presente com paginas[chave] === "none" → "sem_acesso".
//   6. senão → "ok".
//
// Isto é UX. Quem barra de verdade é a RLS (e as RPCs com gate).
import type { Acesso } from "./acesso";
import type { PageKey } from "@/lib/pages";

export type Tela = "carregando" | "erro" | "login" | "removido" | "sem_acesso" | "ok";

export function decidirTela(i: {
  loading: boolean;
  erro: boolean;
  temSessao: boolean;
  acesso: Acesso | null;
  chave: PageKey;
}): Tela {
  if (i.loading) return "carregando";
  if (i.erro) return "erro";
  if (!i.temSessao) return "login";
  if (i.acesso === null) return "removido";
  if (i.acesso.paginas[i.chave] === "none") return "sem_acesso";
  return "ok";
}
