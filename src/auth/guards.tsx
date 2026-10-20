// auth-kit v0.1 — spa/auth/guards.tsx — wrappers de UX, independentes de router.
// Adaptado neste repo (login em todas as rotas, 2026-10-20): a decisão vive em
// decidirTela (pura, testada) e o estado "removido" desloga só este aparelho.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAcesso } from "./acesso";
import { decidirTela } from "./decidirTela";
import { supabase } from "@/lib/supabase";
import type { PageKey } from "@/lib/pages";
import Login from "@/pages/Login";
import SemAcesso from "@/pages/SemAcesso";

export const AVISO_ACESSO_REMOVIDO = "Seu acesso a este painel foi removido.";

// Tela de "erro": a verificação do acesso falhou (rede, PostgREST). Nunca
// chama signOut: um soluço de rede não pode exigir link mágico novo. "Tentar
// de novo" refaz a carga (refresh levanta loading e re-resolve).
function ErroAoVerificarAcesso({ tentarDeNovo }: { tentarDeNovo: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <p role="alert" className="max-w-sm text-sm text-muted-foreground">
        Não foi possível verificar seu acesso. Verifique a conexão e tente de novo.
      </p>
      <button onClick={tentarDeNovo} className="rounded-md border px-3 py-2 text-sm">
        Tentar de novo
      </button>
    </div>
  );
}

export function RequirePage({ chave, children }: { chave: PageKey; children: ReactNode }) {
  const { session, acesso, erroAcesso, loading, refresh } = useAcesso();
  const tela = decidirTela({ loading, erro: erroAcesso, temSessao: session !== null, acesso, chave });

  // O aviso precisa sobreviver ao próprio signOut: ele dispara SIGNED_OUT, o
  // AuthProvider re-resolve (tela "carregando") e cai em "login" sem sessão.
  // Sem este estado, o aviso piscaria e sumiria, e a pessoa veria um login
  // "normal" sem saber por quê. Ajuste de estado durante o render (padrão do
  // React para estado derivado de mudança de entrada), não em efeito.
  const [avisoRemovido, setAvisoRemovido] = useState(false);
  if (tela === "removido" && !avisoRemovido) setAvisoRemovido(true);
  if (avisoRemovido && (tela === "ok" || tela === "sem_acesso")) setAvisoRemovido(false);

  // signOut uma vez por episódio de "removido". O ref sobrevive ao
  // mount→cleanup→mount do Strict Mode e aos re-renders; só é rearmado quando
  // a tela sai do ciclo removido/carregando (login concluído, ok, sem_acesso).
  // Não há loop: o signOut leva a "login" (sem sessão), nunca de volta a
  // "removido". Se o signOut falhar (rede), a sessão local fica, a tela
  // continua "removido" com o aviso, e a nova tentativa é no próximo
  // carregamento. scope "local": o Auth é compartilhado com outros apps do
  // Studio X; "global" derrubaria as sessões da pessoa neles também.
  const signOutDisparadoRef = useRef(false);
  useEffect(() => {
    if (tela === "removido") {
      if (signOutDisparadoRef.current) return;
      signOutDisparadoRef.current = true;
      void supabase.auth.signOut({ scope: "local" }).then(({ error }) => {
        if (error) console.error("RequirePage: signOut local falhou no estado removido", error.message);
      });
    } else if (tela !== "carregando") {
      signOutDisparadoRef.current = false;
    }
  }, [tela]);

  if (tela === "removido") return <Login aviso={AVISO_ACESSO_REMOVIDO} />;
  if (avisoRemovido && (tela === "carregando" || tela === "login")) {
    return <Login aviso={AVISO_ACESSO_REMOVIDO} />;
  }
  if (tela === "carregando") return null;
  if (tela === "erro") return <ErroAoVerificarAcesso tentarDeNovo={() => void refresh()} />;
  if (tela === "login") return <Login />;
  if (tela === "sem_acesso") return <SemAcesso />;
  return <>{children}</>;
}

export function RequireWrite({ chave, children, fallback = null }: {
  chave: PageKey; children: ReactNode; fallback?: ReactNode;
}) {
  const { acesso } = useAcesso();
  if (!acesso || acesso.paginas[chave] !== "write") return <>{fallback}</>;
  return <>{children}</>;
}
