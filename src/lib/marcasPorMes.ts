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

export const MES_REGEX = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

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

/** Mes anterior a 'YYYY-MM'. */
export function mesAnterior(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, "0")}`;
}

export interface IntervaloMeses {
  de: string;
  /** null = "em diante" (sem versao posterior). */
  ate: string | null;
}

/** Meses cobertos por uma versao. */
export function mesesDaVersao(versoes: string[], versao: string): IntervaloMeses {
  return { de: versao, ate: ultimoMesDaVersao(versoes, versao) };
}

/**
 * Meses JA ENCERRADOS (estritamente antes de `mesCorrente`) cobertos pela versao,
 * ou null se ela so cobre o mes corrente e/ou o futuro. Mexer numa versao que
 * cobre meses encerrados reescreve rankings ja apurados.
 */
export function mesesFechadosDaVersao(
  versoes: string[],
  versao: string,
  mesCorrente: string
): { de: string; ate: string } | null {
  const ultimoFechado = mesAnterior(mesCorrente);
  const fim = ultimoMesDaVersao(versoes, versao);
  const ate = fim !== null && fim < ultimoFechado ? fim : ultimoFechado;
  if (versao > ate) return null;
  return { de: versao, ate };
}

/**
 * Versao "passada": ja existe uma versao mais nova vigente no mes corrente.
 * A vigente e as futuras nao sao passadas.
 */
export function isVersaoPassada(versoes: string[], versao: string, mesCorrente: string): boolean {
  const vigente = versaoVigente(versoes, mesCorrente);
  return vigente !== null && versao < vigente;
}

export interface ImpactoNovaVersao {
  /** Versao que hoje vale no mes de destino (null = nenhuma marca). */
  vigenteNoDestino: string | null;
  /**
   * true quando a origem copiada NAO e a versao que ja vale no destino: o ranking
   * dos meses em `meses` muda ja na criacao, antes de qualquer edicao.
   */
  mudaRankingNaCriacao: boolean;
  /** Meses que passam a usar a nova versao. */
  meses: IntervaloMeses;
  /** Parte encerrada de `meses` (destino < mes corrente), ou null. */
  mesesFechados: { de: string; ate: string } | null;
}

/** O que acontece ao criar a versao `destino` copiando `origem`. */
export function impactoNovaVersao(
  versoes: string[],
  origem: string,
  destino: string,
  mesCorrente: string
): ImpactoNovaVersao {
  const comNova = versoes.includes(destino) ? versoes : [...versoes, destino];
  const vigenteNoDestino = versaoVigente(versoes, destino);
  return {
    vigenteNoDestino,
    mudaRankingNaCriacao: vigenteNoDestino !== origem,
    meses: mesesDaVersao(comNova, destino),
    mesesFechados: mesesFechadosDaVersao(comNova, destino, mesCorrente),
  };
}

export interface LinhaSync {
  id: number;
  profissional_id: number;
  nome_profissional: string;
}

export type BloqueioRemocao = "lista-vazia" | "versao-passada" | "esvaziaria";

export interface PlanoSincronizacao {
  renomear: { id: number; nome: string }[];
  remover: number[];
  /** Linhas que sairiam (quem deixou Cabelo) mas NAO serao removidas, e por que. */
  bloqueadas: number[];
  bloqueio: BloqueioRemocao | null;
}

/**
 * Plano do "Sincronizar Profissionais" para UMA versao.
 * - Lista de Cabelo vazia = cadastro nao carregou: nada e feito.
 * - Versao passada: so renomeia (remover reescreveria meses ja apurados).
 * - Remover todas as linhas apagaria a versao (os meses dela cairiam na anterior): bloqueado.
 */
export function planejarSincronizacao(
  linhas: LinhaSync[],
  cabeloNomes: Map<number, string>,
  versaoPassada: boolean
): PlanoSincronizacao {
  if (cabeloNomes.size === 0) {
    return { renomear: [], remover: [], bloqueadas: [], bloqueio: "lista-vazia" };
  }
  const renomear = linhas
    .filter((l) => {
      const nome = cabeloNomes.get(l.profissional_id);
      return !!nome && nome !== l.nome_profissional;
    })
    .map((l) => ({ id: l.id, nome: cabeloNomes.get(l.profissional_id)! }));
  const saem = linhas.filter((l) => !cabeloNomes.has(l.profissional_id)).map((l) => l.id);

  let bloqueio: BloqueioRemocao | null = null;
  if (saem.length > 0 && versaoPassada) bloqueio = "versao-passada";
  else if (saem.length > 0 && saem.length === linhas.length) bloqueio = "esvaziaria";

  return bloqueio
    ? { renomear, remover: [], bloqueadas: saem, bloqueio }
    : { renomear, remover: saem, bloqueadas: [], bloqueio: null };
}

export type EstadoMarcas ="desligado" | "carregando" | "erro" | "ok";

/**
 * Estado das marcas autorizadas para o ranking de Cabelo. Com a regra ligada e a
 * leitura falhando, o ranking NAO pode ser exibido: sem marcas, todo tratamento
 * seria reprovado e a tela mostraria numeros falsos em silencio.
 */
export function estadoMarcas(regraLigada: boolean, isLoading: boolean, isError: boolean): EstadoMarcas {
  if (!regraLigada) return "desligado";
  if (isError) return "erro";
  if (isLoading) return "carregando";
  return "ok";
}
