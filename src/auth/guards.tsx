// auth-kit v0.1 — spa/auth/guards.tsx — wrappers de UX, independentes de router.
import type { ReactNode } from "react";
import { useAcesso } from "./acesso";
import type { PageKey } from "@/lib/pages";
import Login from "@/pages/Login";
import SemAcesso from "@/pages/SemAcesso";

export function RequirePage({ chave, children }: { chave: PageKey; children: ReactNode }) {
  const { session, acesso, loading } = useAcesso();
  if (loading) return null;
  if (!session) return <Login />;
  if (!acesso || acesso.paginas[chave] === "none") return <SemAcesso />;
  return <>{children}</>;
}

export function RequireWrite({ chave, children, fallback = null }: {
  chave: PageKey; children: ReactNode; fallback?: ReactNode;
}) {
  const { acesso } = useAcesso();
  if (!acesso || acesso.paginas[chave] !== "write") return <>{fallback}</>;
  return <>{children}</>;
}
