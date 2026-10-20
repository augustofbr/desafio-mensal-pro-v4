import { PROF_CATEGORIES } from "@/lib/categoryDisplayNames";

/** Perfis que a tela "Criar contas das profissionais" oferece. Admin e Somente Leitura ficam de fora. */
export const PERFIS_DA_CRIACAO = ["Profissional", "Recepção"] as const;
export type PerfilDaCriacao = (typeof PERFIS_DA_CRIACAO)[number];

const CATEGORIAS = new Set<string>(Object.values(PROF_CATEGORIES));

/**
 * Perfil sugerido pela categoria em `profissionais_ativos`: categoria do desafio
 * (`PROF_CATEGORIES`, com trim) vira Profissional; sem categoria ou desconhecida vira
 * Recepção. É só sugestão: o dono troca por linha (ex.: Andressa e Kelle são Recepção
 * mesmo com categoria).
 */
export function perfilSugerido(categoria: string | null | undefined): PerfilDaCriacao {
  return categoria != null && CATEGORIAS.has(categoria.trim()) ? "Profissional" : "Recepção";
}

function chaveDeNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Id do perfil de `destaque_perfis` pelo nome (sem diferenciar acento, caixa e espaços), ou null. */
export function acharPerfilId(
  perfis: ReadonlyArray<{ id: string; nome: string }>,
  nome: PerfilDaCriacao,
): string | null {
  const alvo = chaveDeNome(nome);
  return perfis.find((p) => chaveDeNome(p.nome) === alvo)?.id ?? null;
}
