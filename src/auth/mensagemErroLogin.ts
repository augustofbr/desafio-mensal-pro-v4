// Tradução dos erros do signInWithOtp para pt-BR (pura; testada em
// mensagemErroLogin.test.ts). Nunca mostra a mensagem crua do Supabase.
export const MSG_MUITOS_PEDIDOS = "Muitos pedidos de link agora. Tente de novo em alguns minutos.";
export const MSG_AGUARDE = "Aguarde alguns segundos antes de pedir outro link.";
export const MSG_NAO_CADASTRADO = "E-mail não cadastrado. Peça a um administrador para criar seu acesso.";
export const MSG_GENERICA = "Não foi possível enviar o link agora. Verifique a conexão e tente de novo.";

export function mensagemErroLogin(mensagem: string): string {
  // A ordem importa: "email rate limit exceeded" também casaria "rate limit".
  if (/email rate limit exceeded/i.test(mensagem)) return MSG_MUITOS_PEDIDOS;
  if (/only request this after|rate limit|too many requests/i.test(mensagem)) return MSG_AGUARDE;
  if (/not.*found|signup|disabled/i.test(mensagem)) return MSG_NAO_CADASTRADO;
  return MSG_GENERICA;
}
