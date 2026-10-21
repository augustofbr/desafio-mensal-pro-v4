// Destino do link mágico: a URL atual, limpa (pura; testada em
// destinoDoLink.test.ts).
// - Sem o fragmento (#...): nunca é rota (BrowserRouter) e pode ser lixo de
//   um link vencido (#error=access_denied&error_code=otp_expired). No fluxo
//   implícito o Auth devolve a sessão no fragmento da URL de destino; um
//   fragmento antigo ali estragaria o retorno.
// - Sem parâmetros de auth na query (resto de tentativa anterior ou de outro
//   fluxo); os demais parâmetros ficam.
// PRÉ-REQUISITO: a URL precisa casar com as Redirect URLs do projeto Supabase
// (ex.: "https://x3.studioxbrasil.com.br/**"); senão o Auth manda para a Site URL.
const PARAMETROS_DE_AUTH = [
  "error",
  "error_code",
  "error_description",
  "access_token",
  "refresh_token",
  "code",
  "type",
  "expires_in",
];

export function destinoDoLink(href: string): string {
  const url = new URL(href);
  url.hash = "";
  for (const p of PARAMETROS_DE_AUTH) url.searchParams.delete(p);
  return url.toString();
}
