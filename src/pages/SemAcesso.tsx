// auth-kit v0.1 — spa/pages/SemAcesso.tsx
// Adaptado neste repo (login em todas as rotas, 2026-10-20): conta inativa,
// sem linha ou sem perfil não chega mais aqui (é o estado "removido" do
// RequirePage, que desloga e mostra o login com aviso). Esta tela fica só para
// quem tem acesso válido, mas não à página pedida.
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAcesso, hasAnyAccess } from "@/auth/acesso";
import { PAGES, PAGE_KEYS } from "@/lib/pages";

// INVARIANTE — dois participantes, ambos precisam concordar (mesma lógica do
// sabor Next em app/sem-acesso/page.tsx, adaptada pra SPA sem framework de
// rotas):
//   1) hasAnyAccess() abaixo — verdadeiro se ALGUMA página tem "read"/"write";
//   2) o PAGE_KEYS.find abaixo, que busca essa mesma página.
// Os dois nascem do mesmo objeto `acesso.paginas`, que por sua vez é montado
// em auth/acesso.ts (carregarAcesso) via PAGE_KEYS.map (toda chave do
// registry sempre presente).
// Logo, se (1) é true, (2) SEMPRE encontra uma chave — nunca navegamos "no
// escuro" para um href fixo (ex.: "/") que pode nem existir no registry ou
// pode estar tão negado quanto a página atual.
export default function SemAcesso() {
  const { acesso } = useAcesso();
  const chaveAcessivel = acesso && hasAnyAccess(acesso)
    ? PAGE_KEYS.find((k) => acesso.paginas[k] !== "none")
    : undefined;
  const destino = chaveAcessivel ? PAGES[chaveAcessivel].href : null;
  // Se o destino calculado já é a URL atual, NÃO navegamos: isso só acontece
  // se o shell hospedeiro mapeou PAGES[chaveAcessivel].href pra uma rota que
  // — por bug de configuração do app, fora do controle deste componente —
  // também acaba caindo aqui (ex.: aponta pro RequirePage de OUTRA chave).
  // Sem esta guarda, replace(mesma URL) faria um reload idêntico ao atual, e
  // esse ciclo se repetiria pra sempre — sem o corte automático que um
  // redirect HTTP de servidor ganharia de graça via ERR_TOO_MANY_REDIRECTS.
  const jaNoDestino = destino !== null && destino === window.location.pathname;
  const navegando = destino !== null && !jaNoDestino;

  // Navegação em efeito, não no corpo do render: o React pode invocar a
  // função de render especulativamente (Strict Mode, concurrent features)
  // sem commitar o resultado — side effect ali dispararia replace() a mais.
  useEffect(() => {
    if (navegando) window.location.replace(destino);
  }, [navegando, destino]);

  if (navegando) return null; // navegação em andamento

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-semibold">Sem acesso</h1>
      <p className="text-sm text-muted-foreground">
        Seu perfil não dá acesso a esta página. Fale com o administrador se precisar dela.
      </p>
      {/* scope "local": desloga só este aparelho. O Auth é compartilhado com
          outros apps do Studio X; "global" derrubaria as sessões da pessoa
          neles também. */}
      <button onClick={() => void supabase.auth.signOut({ scope: "local" })} className="rounded-md border px-3 py-2 text-sm">
        Sair
      </button>
    </div>
  );
}
