// Quando o cache do React Query precisa ser zerado (pura; testada em
// deveLimparCache.test.ts). O tablet e o PC da recepção são compartilhados:
// sem isso, o próximo login veria por um instante dados de quem saiu
// (estrelas, motivos de recusa). Regra: limpa em SIGNED_OUT e sempre que o
// usuário da sessão muda em relação ao anterior. A primeira sessão conhecida
// (nenhum → alguém) não limpa: não havia dono anterior, e quem saiu antes já
// limpou no próprio SIGNED_OUT.
export function deveLimparCache(
  evento: string,
  usuarioAnteriorId: string | null,
  usuarioNovoId: string | null,
): boolean {
  if (evento === "SIGNED_OUT") return true;
  if (usuarioAnteriorId === null) return false;
  return usuarioNovoId !== usuarioAnteriorId;
}
