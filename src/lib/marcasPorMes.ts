/**
 * Versionamento por mes de `profissional_fabricante` (marcas autorizadas por profissional).
 *
 * Mesmo modelo de `regras_desafio`: uma VERSAO e o conjunto inteiro de linhas que
 * compartilham o mesmo `valid_from` ('YYYY-MM'). Para um mes M vale a versao com o
 * MAIOR `valid_from <= M` — o conjunto inteiro dela, sem merge linha a linha com
 * versoes anteriores. Sem nenhuma versao <= M, nenhuma marca esta autorizada.
 *
 * Comparacao de 'YYYY-MM' como string e correta porque o formato tem largura fixa
 * (o CHECK do banco garante isso).
 */

export const MES_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface LinhaVersionada {
  valid_from: string;
}

export function isMesValido(mes: string): boolean {
  return MES_REGEX.test(mes);
}

/** 'YYYY-MM-DD' (ou qualquer data ISO) -> 'YYYY-MM'. */
export function mesDaData(data: string): string {
  return (data || "").substring(0, 7);
}

/** `valid_from` distintos, do mais recente para o mais antigo. */
export function listarVersoes(linhas: LinhaVersionada[]): string[] {
  return [...new Set(linhas.map((l) => l.valid_from))].sort().reverse();
}

/** O `valid_from` vigente no mes, ou null se nenhuma versao comeca ate ele. */
export function versaoVigente(versoes: string[], mes: string): string | null {
  if (!isMesValido(mes)) return null;
  let vigente: string | null = null;
  for (const v of versoes) {
    if (v <= mes && (vigente === null || v > vigente)) vigente = v;
  }
  return vigente;
}

/** Linhas da versao vigente no mes (conjunto inteiro dessa versao). */
export function linhasDoMes<T extends LinhaVersionada>(linhas: T[], mes: string): T[] {
  const vigente = versaoVigente(listarVersoes(linhas), mes);
  if (vigente === null) return [];
  return linhas.filter((l) => l.valid_from === vigente);
}

/**
 * Ultimo mes coberto por uma versao: o mes anterior a proxima versao, ou null
 * se ela e a mais recente (vale "em diante").
 */
export function ultimoMesDaVersao(versoes: string[], versao: string): string | null {
  const proxima = versoes.filter((v) => v > versao).sort()[0];
  if (!proxima) return null;
  const [ano, mes] = proxima.split("-").map(Number);
  const anterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  return `${anterior.ano}-${String(anterior.mes).padStart(2, "0")}`;
}
