// O que o AuthProvider faz a cada evento do onAuthStateChange (pura; testada
// em reacaoAoEvento.test.ts).
//   - "visivel":   re-resolve com loading=true (desmonta a área protegida).
//                  Só quando a IDENTIDADE muda: SIGNED_OUT, troca de usuário,
//                  primeira identidade conhecida (link mágico chegando).
//   - "silencioso": revalida o acesso sem loading e sem desmontar
//                  (refresh({ manterConteudo: true })). SIGNED_IN/USER_UPDATED
//                  do MESMO usuário: o auth-js 2.99 emite SIGNED_IN a cada
//                  visibilitychange com sessão válida (_onVisibilityChanged →
//                  _recoverAndRefresh); tratá-lo como identidade nova
//                  desmontava a página (modal aberto perdido, select pesado de
//                  trinks_services de novo) toda vez que a aba voltava.
//   - "so_sessao": TOKEN_REFRESHED do mesmo usuário: só troca o token. Não
//                  revalida o acesso, porque o dono decidiu "sem checagem
//                  periódica com a aba aberta" e a renovação é de hora em hora.
//   - "nada":      INITIAL_SESSION. O refresh() da montagem já resolve a mesma
//                  sessão; tratar este evento faria um segundo carregarAcesso
//                  no mount.
export type ReacaoAoEvento = "visivel" | "silencioso" | "so_sessao" | "nada";

export function reacaoAoEvento(
  evento: string,
  usuarioAnteriorId: string | null,
  usuarioNovoId: string | null,
): ReacaoAoEvento {
  if (evento === "INITIAL_SESSION") return "nada";
  if (evento === "SIGNED_OUT") return "visivel";
  if (usuarioNovoId === null || usuarioNovoId !== usuarioAnteriorId) return "visivel";
  if (evento === "TOKEN_REFRESHED") return "so_sessao";
  return "silencioso";
}
