// auth-kit v0.1 — registry de páginas (gerado por render.mjs; edite via auth-kit.config.json + re-render)
import {
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export const PAGE_KEYS = [
  "admin",
  "usuarios",
] as const;

export type PageKey = (typeof PAGE_KEYS)[number];
export type PageAccess = "none" | "read" | "write";

export type PageDef = {
  key: PageKey;
  href: string;
  label: string;
  icon: LucideIcon;
  resumo: string;
  isConfig: boolean;
};

export const PAGES: Record<PageKey, PageDef> = {
  "admin": {
    key: "admin",
    href: "/admin",
    label: "Administração",
    icon: Settings,
    resumo: "Aprovacoes, regras, fabricantes e feriados",
    isConfig: false,
  },
  "usuarios": {
    key: "usuarios",
    href: "/admin/usuarios",
    label: "Usuários",
    icon: Users,
    resumo: "",
    isConfig: true,
  },
};

export const NAV_ITEMS: PageDef[] = PAGE_KEYS.map((k) => PAGES[k]);

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  return !NAV_ITEMS.some(
    (other) =>
      other.href !== href &&
      other.href.startsWith(`${href}/`) &&
      (pathname === other.href || pathname.startsWith(`${other.href}/`)),
  );
}
