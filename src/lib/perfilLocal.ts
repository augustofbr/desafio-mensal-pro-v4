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

/**
 * Formato gravado. Objeto (e nao string crua) para caber novos campos depois.
 *
 * `userId` e o `user.id` da conta que escolheu o perfil. Num tablet ou PC
 * compartilhado (recepcao), a identidade local nao pode passar de uma conta para
 * a outra: quem le confere o dono antes de usar o id.
 */
interface PerfilGravado {
  id?: unknown;
  userId?: unknown;
}

/**
 * Le o id do perfil salvo PELA CONTA `userId`, ja normalizado. Retorna null quando
 * nao ha nada gravado, quando o conteudo nao e JSON valido, quando nao ha id
 * utilizavel ou quando o perfil e de outra conta — lixo no storage nunca deve
 * travar o app.
 *
 * Perfil de outra conta e IGNORADO E LIMPO (a chave e removida). Perfil antigo,
 * gravado antes de existir o dono (sem `userId`), conta como de outra conta.
 * Sem conta atual (`userId` null) nao ha como comparar: devolve null e nao apaga.
 */
export function lerPerfil(
  storage: Pick<Storage, "getItem" | "removeItem">,
  userId: string | null
): string | null {
  const dono = normalizeProfessionalId(userId);
  if (dono === null) return null;

  const bruto = storage.getItem(PERFIL_KEY);
  if (bruto === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bruto);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object") return null;

  const { id, userId: donoGravado } = parsed as PerfilGravado;
  if (donoGravado !== dono) {
    storage.removeItem(PERFIL_KEY);
    return null;
  }

  if (typeof id !== "string" && typeof id !== "number") return null;

  return normalizeProfessionalId(id);
}

/**
 * Grava o id do perfil para a conta `userId`. `null` (ou id vazio) REMOVE a
 * chave — e assim que a identidade se desfaz por completo, sem deixar residuo
 * no aparelho. Sem conta nao se grava nada: o perfil nao teria dono.
 */
export function gravarPerfil(
  storage: Pick<Storage, "setItem" | "removeItem">,
  id: string | null,
  userId: string | null
): void {
  const normalizado = normalizeProfessionalId(id);
  const dono = normalizeProfessionalId(userId);
  if (normalizado === null || dono === null) {
    storage.removeItem(PERFIL_KEY);
    return;
  }
  storage.setItem(
    PERFIL_KEY,
    JSON.stringify({ id: normalizado, userId: dono } satisfies PerfilGravado)
  );
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
