/** Perfis que a tela "Criar contas das profissionais" oferece. Admin e Somente Leitura ficam de fora. */
export const PERFIS_DA_CRIACAO = ["Profissional", "Recepção"] as const;
export type PerfilDaCriacao = (typeof PERFIS_DA_CRIACAO)[number];

/**
 * Perfil sugerido na tela "Criar contas": sempre Profissional, o de MENOR privilégio
 * (Recepção vê todas as estrelas e cadastra para qualquer uma). Recepção é escolha explícita
 * do dono por linha (ex.: Andressa e Kelle). O parâmetro fica para a assinatura não mudar.
 */
export function perfilSugerido(_categoria: string | null | undefined): PerfilDaCriacao {
  return "Profissional";
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
