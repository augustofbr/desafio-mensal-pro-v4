// Decide o que uma rota protegida mostra. Pura, sem React nem Supabase, para
// ser testável (decidirTela.test.ts) e para o RequirePage não ter regra
// escondida em if encadeado.
//
// Ordem de precedência (a primeira que casa vence):
//   1. loading     → "carregando": enquanto a sessão/acesso estão sendo
//      resolvidos, nada protegido é decidido (nem liberado, nem barrado).
//   2. sem sessão  → "login".
//   3. sessão, mas acesso null → "removido": inativo, sem linha em
//      destaque_users_app, perfil apagado (ou falha ao ler o acesso; ver
//      carregarAcesso em ./acesso.ts, que é fail-closed e devolve null nos
//      quatro casos).
//   4. acesso presente com paginas[chave] === "none" → "sem_acesso".
//   5. senão → "ok".
//
// Isto é UX. Quem barra de verdade é a RLS (e as RPCs com gate).
import type { Acesso } from "./acesso";
import type { PageKey } from "@/lib/pages";

export type Tela = "carregando" | "login" | "removido" | "sem_acesso" | "ok";

export function decidirTela(i: {
  loading: boolean;
  temSessao: boolean;
  acesso: Acesso | null;
  chave: PageKey;
}): Tela {
  if (i.loading) return "carregando";
  if (!i.temSessao) return "login";
  if (i.acesso === null) return "removido";
  if (i.acesso.paginas[i.chave] === "none") return "sem_acesso";
  return "ok";
}
