/**
 * Periodos do "Historico de decisoes" do painel de aprovacoes.
 *
 * Funcoes puras (sem React, sem Supabase, sem `new Date()` implicito): quem
 * chama injeta o "agora". Isso e o que permite testar "mes anterior" numa
 * virada de mes sem depender do relogio da maquina.
 *
 * Os limites saem prontos para o filtro do Supabase: `inicioISO` INCLUSIVO
 * (`.gte`) e `fimISO` EXCLUSIVO (`.lt`). Intervalo semiaberto de proposito —
 * com `.lte` na meia-noite do ultimo dia, uma avaliacao cadastrada as 00:00:00
 * em ponto entraria em dois periodos vizinhos.
 *
 * Tudo e ancorado em America/Manaus (o fuso do salao, e o mesmo que decide em
 * que MES uma estrela pontua — ver `mesManaus` em `dateUtils.ts`). O Amazonas
 * nao adota horario de verao desde 2008, entao o deslocamento e fixo em -04:00
 * e nao existe dia em que "00:00 de Manaus" mude de offset.
 */

const OFFSET_MANAUS = "-04:00";

export type PeriodoChave =
  | "mes_atual"
  | "mes_anterior"
  | "hoje"
  | "ontem"
  | "semana_passada"
  | "personalizado";

export const PERIODOS: { valor: PeriodoChave; rotulo: string }[] = [
  { valor: "mes_atual", rotulo: "Mês atual" },
  { valor: "mes_anterior", rotulo: "Mês anterior" },
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "ontem", rotulo: "Ontem" },
  { valor: "semana_passada", rotulo: "Semana passada" },
  { valor: "personalizado", rotulo: "Período personalizado" },
];

/** Dias "YYYY-MM-DD" em Manaus, ambos INCLUSIVOS — e o que o usuario ve e digita. */
export interface PeriodoPersonalizado {
  de: string;
  ate: string;
}

export interface PeriodoResolvido {
  chave: PeriodoChave;
  /** Limite inferior inclusivo, UTC ISO — direto no `.gte()`. */
  inicioISO: string;
  /** Limite superior EXCLUSIVO, UTC ISO — direto no `.lt()`. */
  fimISO: string;
  /** Primeiro dia do intervalo em Manaus ("YYYY-MM-DD"). */
  de: string;
  /** Ultimo dia do intervalo em Manaus ("YYYY-MM-DD"), inclusivo. */
  ate: string;
  /** "01/08/2026 a 03/08/2026" (ou so a data, quando o periodo tem 1 dia). */
  rotulo: string;
}

const formatadorDiaManaus = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Manaus",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" do instante, lido no fuso do salao. */
export function diaEmManaus(instante: Date): string {
  return formatadorDiaManaus.format(instante);
}

/**
 * Aritmetica de calendario feita em UTC de proposito: `YYYY-MM-DDT00:00:00Z`
 * nao tem hora de verao nem fuso local, entao somar 86.400.000ms sempre anda
 * exatamente um dia. Fazer a mesma conta com `new Date(ano, mes, dia)` traria
 * o fuso de quem abriu o navegador para dentro do calculo.
 */
function comoUTC(dia: string): Date {
  return new Date(`${dia}T00:00:00Z`);
}

function somarDias(dia: string, dias: number): string {
  const base = comoUTC(dia);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function primeiroDiaDoMes(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

function primeiroDiaDoMesSeguinte(dia: string): string {
  const base = comoUTC(primeiroDiaDoMes(dia));
  base.setUTCMonth(base.getUTCMonth() + 1);
  return base.toISOString().slice(0, 10);
}

function primeiroDiaDoMesAnterior(dia: string): string {
  const base = comoUTC(primeiroDiaDoMes(dia));
  base.setUTCMonth(base.getUTCMonth() - 1);
  return base.toISOString().slice(0, 10);
}

/** Segunda-feira da semana que contem `dia`. Semana seg-dom (padrao ISO). */
function segundaDaSemana(dia: string): string {
  const diaDaSemana = comoUTC(dia).getUTCDay(); // 0 = domingo
  return somarDias(dia, -((diaDaSemana + 6) % 7));
}

/** "2026-08-03" -> "03/08/2026". */
export function formatarDiaBR(dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

/** Meia-noite (Manaus) do dia, como instante UTC — o limite que o banco entende. */
function inicioDoDiaISO(dia: string): string {
  return new Date(`${dia}T00:00:00${OFFSET_MANAUS}`).toISOString();
}

function ehDiaValido(dia: unknown): dia is string {
  return typeof dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dia);
}

function montar(chave: PeriodoChave, de: string, ate: string): PeriodoResolvido {
  return {
    chave,
    de,
    ate,
    inicioISO: inicioDoDiaISO(de),
    // O fim e exclusivo: meia-noite do dia SEGUINTE ao ultimo dia do periodo.
    fimISO: inicioDoDiaISO(somarDias(ate, 1)),
    rotulo:
      de === ate
        ? formatarDiaBR(de)
        : `${formatarDiaBR(de)} a ${formatarDiaBR(ate)}`,
  };
}

/**
 * Resolve a escolha do filtro em limites concretos.
 *
 * `personalizado` incompleto ou invertido nao quebra a busca: datas ausentes
 * caem no mes corrente e um intervalo de tras para frente e desinvertido. O
 * campo de data fica vazio enquanto o admin digita, e um periodo invalido no
 * meio da digitacao nao pode zerar a tela.
 */
export function resolverPeriodo(
  chave: PeriodoChave,
  agora: Date,
  personalizado?: Partial<PeriodoPersonalizado>,
): PeriodoResolvido {
  const hoje = diaEmManaus(agora);

  switch (chave) {
    case "hoje":
      return montar(chave, hoje, hoje);

    case "ontem": {
      const ontem = somarDias(hoje, -1);
      return montar(chave, ontem, ontem);
    }

    case "semana_passada": {
      const segundaDesta = segundaDaSemana(hoje);
      return montar(chave, somarDias(segundaDesta, -7), somarDias(segundaDesta, -1));
    }

    case "mes_anterior": {
      const inicio = primeiroDiaDoMesAnterior(hoje);
      return montar(chave, inicio, somarDias(primeiroDiaDoMes(hoje), -1));
    }

    case "personalizado": {
      const de = ehDiaValido(personalizado?.de) ? personalizado.de : primeiroDiaDoMes(hoje);
      const ate = ehDiaValido(personalizado?.ate) ? personalizado.ate : hoje;
      return de <= ate ? montar(chave, de, ate) : montar(chave, ate, de);
    }

    case "mes_atual":
    default:
      return montar(
        "mes_atual",
        primeiroDiaDoMes(hoje),
        somarDias(primeiroDiaDoMesSeguinte(hoje), -1),
      );
  }
}
