import { useMemo } from "react";
import { Pencil } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { useHolidays } from "@/hooks/useHolidays";
import { getCategoryDisplayName, isCategoryActive } from "@/lib/categoryDisplayNames";
import {
  computeProjecao,
  contarDiasUteis,
  resolveMetas,
  type MetaItem,
} from "@/lib/metaProgress";
import { getCategoryRules, type CategoryRules, type RulesVersion } from "@/lib/rulesConfig";
import { isWorkingWeekday } from "@/lib/workingDaysConfig";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

interface MeuCartaoProps {
  perfil: ProfissionalAtivo;
  /** Entry do perfil na categoria dele. null = sem dados no periodo. */
  entry: Record<string, unknown> | null;
  /** Posicao 1-based no ranking da categoria (empate = mesma posicao). */
  posicao: number | null;
  /** Pontos do 1o colocado (null se o ranking esta vazio). */
  liderPontos: number | null;
  rules: RulesVersion;
  /** Reabre o seletor de perfil. Requisito do owner: sempre visivel. */
  onTrocar: () => void;
}

const FORMATO_INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const FORMATO_DECIMAL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function paraISO(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Parse manual — `new Date('YYYY-MM-DD')` seria lido como UTC e voltaria um dia. */
function parseData(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

/** Le um campo numerico do entry; ausente/invalido vira 0. */
function numeroDoEntry(entry: Record<string, unknown> | null, campo: string): number {
  const valor = entry?.[campo];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

/** Apelido quando existe; nome completo e o fallback. So exibicao. */
function nomeExibicao(perfil: ProfissionalAtivo): string {
  const apelido = perfil.apelido?.trim();
  if (apelido) return apelido;
  const nome = perfil.nome_profissional?.trim();
  if (nome) return nome;
  return `Profissional ${perfil.profissionalId}`;
}

function inicial(nome: string): string {
  return (Array.from(nome)[0] ?? "?").toUpperCase();
}

/** Dias do mes (1..31) que sao uteis dentro do periodo, em ordem. */
function listarDiasUteisDoMes(
  startDate: string,
  endDate: string,
  holidays: string[]
): number[] {
  const inicio = parseData(startDate);
  const fim = parseData(endDate);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return [];
  if (inicio > fim) return [];

  const feriados = new Set(holidays);
  const dias: number[] = [];
  for (const cursor = inicio; cursor <= fim; cursor.setDate(cursor.getDate() + 1)) {
    if (!isWorkingWeekday(cursor.getDay())) continue;
    if (feriados.has(paraISO(cursor))) continue;
    dias.push(cursor.getDate());
  }
  return dias;
}

interface CalendarioPeriodo {
  /** null = o periodo nao contem hoje (ou cruza meses) — sem projecao. */
  diaDoMesHoje: number | null;
  diasUteisDecorridos: number;
  diasUteisRestantes: number;
  diasUteisPorDiaDoMes: number[];
  periodoEncerrado: boolean;
  periodoFuturo: boolean;
}

const CALENDARIO_VAZIO: CalendarioPeriodo = {
  diaDoMesHoje: null,
  diasUteisDecorridos: 0,
  diasUteisRestantes: 0,
  diasUteisPorDiaDoMes: [],
  periodoEncerrado: false,
  periodoFuturo: false,
};

/**
 * Traduz o range filtrado no calendario de dias uteis que a projecao consome.
 * `diasUteisDecorridos` INCLUI hoje e `decorridos + restantes` sempre fecha com
 * o total do periodo — senao a frase de ritmo mentiria.
 */
function montarCalendario(
  startDate: string,
  endDate: string,
  holidays: string[],
  hoje: Date
): CalendarioPeriodo {
  if (!startDate || !endDate) return CALENDARIO_VAZIO;

  const hojeISO = paraISO(hoje);
  const contemHoje = hojeISO >= startDate && hojeISO <= endDate;
  // "meta ~dia N" so faz sentido dentro de um unico mes: num range que cruza
  // meses os numeros dos dias se repetem e a data prevista seria inventada.
  const mesUnico = startDate.slice(0, 7) === endDate.slice(0, 7);

  const totalDiasUteis = contarDiasUteis(startDate, endDate, holidays);
  const decorridos = contemHoje ? contarDiasUteis(startDate, hojeISO, holidays) : 0;

  return {
    diaDoMesHoje: contemHoje && mesUnico ? hoje.getDate() : null,
    diasUteisDecorridos: decorridos,
    diasUteisRestantes: Math.max(0, totalDiasUteis - decorridos),
    diasUteisPorDiaDoMes: mesUnico ? listarDiasUteisDoMes(startDate, endDate, holidays) : [],
    periodoEncerrado: hojeISO > endDate,
    periodoFuturo: hojeISO < startDate,
  };
}

/**
 * Metas de faturamento aparecem sempre em percentual — o dashboard nunca expoe
 * os valores em reais (mesma convencao do PremiacaoPanel).
 */
function textoDaMeta(meta: MetaItem): string {
  if (meta.chave === "receita") return `${FORMATO_DECIMAL.format(meta.pct)}% da meta`;
  return `${FORMATO_INTEIRO.format(meta.atual)} de ${FORMATO_INTEIRO.format(meta.alvo)}`;
}

interface CabecalhoProps {
  nome: string;
  categoriaLabel: string | null;
  onTrocar: () => void;
}

function Cabecalho({ nome, categoriaLabel, onTrocar }: CabecalhoProps) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-11 w-11 shrink-0">
        <AvatarFallback className="text-base font-semibold">{inicial(nome)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">{nome}</p>
        {categoriaLabel && (
          <Badge variant="secondary" className="mt-1 text-sm">
            {categoriaLabel}
          </Badge>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onTrocar}
        className="min-h-[44px] shrink-0 gap-1.5 text-base"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Trocar
      </Button>
    </div>
  );
}

/**
 * Cartao pessoal: onde a profissional se ve no desafio do periodo filtrado —
 * pontuacao, metas com o premio, ritmo ate a meta e posicao no ranking.
 *
 * Nao busca nada: recebe o entry ja calculado pelos hooks de categoria, para
 * os numeros baterem com o ranking da mesma tela.
 */
export function MeuCartao({
  perfil,
  entry,
  posicao,
  liderPontos,
  rules,
  onTrocar,
}: MeuCartaoProps) {
  const { getFilteredDateRange } = useDateFilter();
  const { holidays } = useHolidays();
  const { startDate, endDate } = getFilteredDateRange();

  const categoria = perfil.categoria?.trim() ?? "";
  // getCategoryRules devolve undefined em runtime para categoria desconhecida.
  const regrasCategoria: CategoryRules | undefined = categoria
    ? getCategoryRules(rules, categoria)
    : undefined;

  const calendario = useMemo(
    () => montarCalendario(startDate, endDate, holidays, new Date()),
    [startDate, endDate, holidays]
  );

  // Sem entry as metas ficam zeradas (mas visiveis): o alvo continua sendo a
  // informacao util para quem ainda nao atendeu no periodo.
  const metas = useMemo(
    () => (regrasCategoria ? resolveMetas(entry ?? {}, regrasCategoria) : []),
    [entry, regrasCategoria]
  );

  const metaPrincipal = metas[0] ?? null;

  const projecao = useMemo(
    () =>
      computeProjecao({
        atual: metaPrincipal?.atual ?? 0,
        alvo: metaPrincipal?.alvo ?? 0,
        diasUteisDecorridos: calendario.diasUteisDecorridos,
        diasUteisRestantes: calendario.diasUteisRestantes,
        diaDoMesHoje: calendario.diaDoMesHoje,
        diasUteisPorDiaDoMes: calendario.diasUteisPorDiaDoMes,
      }),
    [calendario, metaPrincipal]
  );

  const nome = nomeExibicao(perfil);
  const categoriaLabel = categoria ? getCategoryDisplayName(categoria) : null;

  // Categoria fora do desafio (ex.: Maquiagem em agosto/2026) ou perfil sem
  // categoria: nada de metas, mas a troca de perfil continua ao alcance.
  if (!regrasCategoria || !isCategoryActive(rules, categoria)) {
    return (
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <Cabecalho nome={nome} categoriaLabel={categoriaLabel} onTrocar={onTrocar} />
          <p className="text-base text-muted-foreground">
            {regrasCategoria
              ? "Sua categoria está fora do desafio neste mês."
              : "Você ainda não tem uma categoria no desafio."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const modeloPercentual = regrasCategoria.scoringModel === "revenue-percentage";
  const pontosDoPerfil = numeroDoEntry(entry, "points");
  const valorHeroi = modeloPercentual
    ? numeroDoEntry(entry, "revenuePercentage")
    : pontosDoPerfil;
  const textoHeroi = modeloPercentual
    ? `${FORMATO_DECIMAL.format(valorHeroi)}%`
    : FORMATO_INTEIRO.format(valorHeroi);
  const rotuloHeroi = modeloPercentual ? "da meta do mês" : "pontos no período";

  const diferencaParaLider = liderPontos !== null ? liderPontos - pontosDoPerfil : null;
  const textoDiferenca =
    diferencaParaLider !== null && diferencaParaLider > 0
      ? modeloPercentual
        ? `${FORMATO_DECIMAL.format(diferencaParaLider)}%`
        : `${FORMATO_INTEIRO.format(diferencaParaLider)} pts`
      : null;

  let textoPosicao: string | null;
  if (!entry) {
    textoPosicao = "Ainda sem atendimentos neste período";
  } else if (posicao === null) {
    textoPosicao = null;
  } else if (posicao === 1) {
    textoPosicao = "Você é a líder! 🥇";
  } else {
    textoPosicao = textoDiferenca
      ? `Você está em ${posicao}º · ${textoDiferenca} atrás da líder`
      : `Você está em ${posicao}º`;
  }

  const todasBatidas = metas.length > 0 && metas.every((meta) => meta.batida);
  let linhaRitmo: string | null;
  if (calendario.periodoFuturo) {
    linhaRitmo = "Este período ainda não começou";
  } else if (calendario.periodoEncerrado) {
    linhaRitmo = "Resultado final do período";
  } else if (todasBatidas) {
    linhaRitmo = metas.length > 1 ? "Metas batidas! 🎉" : "Meta batida! 🎉";
  } else {
    linhaRitmo = projecao.mostrar ? projecao.ritmoTexto : null;
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <Cabecalho nome={nome} categoriaLabel={categoriaLabel} onTrocar={onTrocar} />

        <div className="flex items-baseline gap-2">
          <span className="font-mono-num text-5xl font-bold leading-none tracking-tight text-primary">
            {textoHeroi}
          </span>
          <span className="text-base text-muted-foreground">{rotuloHeroi}</span>
        </div>

        {textoPosicao && <p className="text-base font-medium">{textoPosicao}</p>}

        <div className="space-y-3">
          <p className="text-base font-semibold">Prêmio: {regrasCategoria.prize}</p>

          {metas.length === 0 ? (
            <p className="text-base text-muted-foreground">
              Esta categoria não tem meta definida neste período.
            </p>
          ) : (
            metas.map((meta) => (
              <div key={meta.chave} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-base">
                  <span className="min-w-0">
                    <span className="font-medium">{meta.rotulo}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="font-mono-num">{textoDaMeta(meta)}</span>
                  </span>
                  {meta.batida && (
                    <span role="img" aria-label="meta batida" className="shrink-0">
                      ✅
                    </span>
                  )}
                </div>
                <Progress
                  value={meta.pct}
                  aria-label={`${meta.rotulo}: ${textoDaMeta(meta)}`}
                  className="h-3"
                />
              </div>
            ))
          )}
        </div>

        {linhaRitmo && <p className="text-base text-muted-foreground">{linhaRitmo}</p>}
      </CardContent>
    </Card>
  );
}

export default MeuCartao;
