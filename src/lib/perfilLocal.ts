import { normalizeProfessionalId } from "./scoring";

/**
 * Identidade local do painel "Minha Meta" — sem login, so um id de profissional
 * guardado no aparelho.
 *
 * Funcoes puras com o storage INJETADO (nada de `window` aqui): rodam no vitest
 * em ambiente node e permitem testar o requisito central — a identidade e SEMPRE
 * reversivel (trocar, limpar e auto-limpar quando o id sai do cadastro).
 */

/** Chave versionada: um `.v2` no futuro invalida o formato antigo sem migracao. */
export const PERFIL_KEY = "destaque.perfil.v1";

/** Formato gravado. Objeto (e nao string crua) para caber novos campos depois. */
interface PerfilGravado {
  id?: unknown;
}

/**
 * Le o id do perfil salvo, ja normalizado. Retorna null quando nao ha nada
 * gravado, quando o conteudo nao e JSON valido ou quando nao ha id utilizavel —
 * lixo no storage nunca deve travar o app.
 */
export function lerPerfil(storage: Pick<Storage, "getItem">): string | null {
  const bruto = storage.getItem(PERFIL_KEY);
  if (bruto === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bruto);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object") return null;

  const { id } = parsed as PerfilGravado;
  if (typeof id !== "string" && typeof id !== "number") return null;

  return normalizeProfessionalId(id);
}

/**
 * Grava o id do perfil. `null` (ou id vazio) REMOVE a chave — e assim que a
 * identidade se desfaz por completo, sem deixar residuo no aparelho.
 */
export function gravarPerfil(
  storage: Pick<Storage, "setItem" | "removeItem">,
  id: string | null
): void {
  const normalizado = normalizeProfessionalId(id);
  if (normalizado === null) {
    storage.removeItem(PERFIL_KEY);
    return;
  }
  storage.setItem(PERFIL_KEY, JSON.stringify({ id: normalizado } satisfies PerfilGravado));
}

/**
 * Confere o id salvo contra o cadastro vigente. Id que nao existe mais (pessoa
 * removida de profissionais_ativos, aparelho compartilhado, storage adulterado)
 * vira null — quem chama grava esse null e volta ao estado "sem perfil".
 *
 * Cadastro vazio retorna null; o hook so valida depois que a lista carrega,
 * para nao apagar o perfil durante o fetch.
 */
export function validarPerfil(
  id: string | null,
  ativos: { profissionalId: number }[]
): string | null {
  const normalizado = normalizeProfessionalId(id);
  if (normalizado === null) return null;

  const existe = ativos.some(
    (prof) => normalizeProfessionalId(prof.profissionalId) === normalizado
  );
  return existe ? normalizado : null;
}
