import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { isCategoryActive } from "@/lib/categoryDisplayNames";
import { getCategoryRules, type CategoryRules, type RulesVersion } from "@/lib/rulesConfig";
import {
  montarSemana,
  referenciaDaSemana,
  valorPorDia,
  type DiaSemana,
  type ServicoDoDia,
} from "@/lib/semana";
import { cn } from "@/lib/utils";

interface MinhaSemanaProps {
  /**
   * Servicos do entry BRUTO do perfil na categoria dele (o mesmo array que
   * alimenta o detalhamento). Vazio = sem atendimentos no periodo.
   */
  services: ServicoDoDia[];
  /** Categoria do perfil (profissionais_ativos.categoria). */
  categoria: string;
  rules: RulesVersion;
}

const FORMATO_INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const FORMATO_DECIMAL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Nome completo do dia, so para leitores de tela (o bloco mostra a inicial). */
const NOMES_DOS_DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/**
 * Quatro degraus de intensidade por quartil do maior valor da semana.
 * A cor do texto muda junto com o preenchimento porque os temas caminham em
 * direcoes opostas (no claro o bloco escurece, no escuro ele clareia); todos os
 * pares foram medidos e ficam acima de 4,5:1 nos dois temas.
 */
const DEGRAUS = [
  "bg-primary/20 text-foreground",
  "bg-primary/40 text-foreground",
  "bg-primary/70 text-foreground dark:text-background",
  "bg-primary text-primary-foreground",
];

/**
 * O toggle padrao pinta selecionado e hover com a MESMA cor de destaque — e no
 * celular o hover gruda depois do toque, entao as duas semanas pareciam
 * escolhidas. Selecionado usa a matiz da marca; hover fica neutro.
 */
const ITEM_SEMANA =
  "min-h-[44px] px-3 text-base hover:bg-muted hover:text-foreground " +
  "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

function paraISO(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** "2026-08-01" -> "01/08". Parse manual nao e necessario: so recorta o texto. */
function diaEMes(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

/**
 * Converte o mapa de valores diarios na unidade exibida.
 * Faturamento nunca aparece em reais: no modelo revenue-points ele vira pontos
 * pela mesma conversao do ranking.
 */
function valoresExibidos(
  services: ServicoDoDia[],
  regras: CategoryRules
): Record<string, number> {
  const brutos = valorPorDia(
    services,
    regras.scoringModel,
    regras.qualificationGoals.minRevenue
  );
  if (regras.scoringModel !== "revenue-points") return brutos;

  const conversao = regras.revenuePointConversion;
  if (!conversao || conversao <= 0) return {};

  return Object.fromEntries(
    Object.entries(brutos).map(([data, valor]) => [data, Math.floor(valor / conversao)])
  );
}

/** Degrau 0..4 do bloco: 0 e "sem atendimento", 4 e o melhor dia da semana. */
function degrauDoDia(valor: number, maior: number): number {
  if (valor <= 0 || maior <= 0) return 0;
  return Math.min(DEGRAUS.length, Math.ceil((valor / maior) * DEGRAUS.length));
}

interface BlocoProps {
  dia: DiaSemana;
  indice: number;
  maior: number;
  percentual: boolean;
}

function Bloco({ dia, indice, maior, percentual }: BlocoProps) {
  const foraDoPeriodo = dia.valor === null;
  const valor = dia.valor ?? 0;
  const degrau = foraDoPeriodo ? 0 : degrauDoDia(valor, maior);

  const valorTexto = percentual
    ? `${FORMATO_DECIMAL.format(valor)}%`
    : FORMATO_INTEIRO.format(valor);
  const texto = foraDoPeriodo ? "–" : valorTexto;

  const descricao = foraDoPeriodo
    ? `${NOMES_DOS_DIAS[indice]} ${diaEMes(dia.data)}: fora do período`
    : `${NOMES_DOS_DIAS[indice]} ${diaEMes(dia.data)}: ${valorTexto}${percentual ? " da meta" : " pontos"}`;

  return (
    <li
      aria-label={descricao}
      title={descricao}
      className={cn(
        "flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2",
        degrau === 0
          ? cn("bg-muted text-muted-foreground", foraDoPeriodo && "bg-muted/50")
          : DEGRAUS[degrau - 1]
      )}
    >
      <span className="text-xs leading-none">
        {dia.diaLabel} {dia.diaDoMes}
      </span>
      <span
        className={cn(
          "font-mono-num font-semibold leading-none",
          percentual ? "text-sm" : "text-lg"
        )}
      >
        {texto}
      </span>
    </li>
  );
}

/**
 * "Minha semana": os dias da semana em blocos, para a profissional ver de
 * relance onde o mes rendeu. Nao busca nada — recebe os servicos ja pontuados
 * do entry dela, entao os numeros batem com o resto da tela.
 *
 * Semana = segunda a sabado (domingo o Studio X nao abre). A semana que cruza a
 * virada do mes mostra os dias de fora do periodo como vazios, e nao como zero.
 */
export function MinhaSemana({ services, categoria, rules }: MinhaSemanaProps) {
  const { getFilteredDateRange } = useDateFilter();
  const { startDate, endDate } = getFilteredDateRange();
  const [querSemanaAnterior, setQuerSemanaAnterior] = useState(false);

  // getCategoryRules devolve undefined em runtime para categoria desconhecida.
  const regras: CategoryRules | undefined = categoria
    ? getCategoryRules(rules, categoria)
    : undefined;

  const valores = useMemo(
    () => (regras ? valoresExibidos(services, regras) : {}),
    [services, regras]
  );

  const { semanaAtual, semanaAnterior } = useMemo(() => {
    const range = { startDate, endDate };
    const referencia = referenciaDaSemana(new Date(), range);
    if (!referencia) return { semanaAtual: [], semanaAnterior: [] };

    const anterior = new Date(
      referencia.getFullYear(),
      referencia.getMonth(),
      referencia.getDate() - 7
    );

    return {
      semanaAtual: montarSemana(referencia, valores, range),
      semanaAnterior: montarSemana(anterior, valores, range),
    };
  }, [valores, startDate, endDate]);

  // Categoria fora do desafio (ou perfil sem categoria): o MeuCartao ja explica
  // a situacao — repetir a mensagem aqui so faria barulho.
  if (!regras || !isCategoryActive(rules, categoria)) return null;
  if (semanaAtual.length === 0) return null;

  // So oferece a semana passada quando ela tem algum dia dentro do periodo.
  const temSemanaAnterior = semanaAnterior.some((dia) => dia.valor !== null);
  const mostrandoAnterior = querSemanaAnterior && temSemanaAnterior;
  const dias = mostrandoAnterior ? semanaAnterior : semanaAtual;

  const percentual = regras.scoringModel === "revenue-percentage";
  const maior = dias.reduce((max, dia) => Math.max(max, dia.valor ?? 0), 0);
  const semAtendimento = maior <= 0;

  // Fora do mes corrente "esta semana" seria mentira: o periodo ja acabou (ou
  // nem comecou), e a semana mostrada e a da borda dele.
  const hojeISO = paraISO(new Date());
  const hojeNoPeriodo = hojeISO >= startDate && hojeISO <= endDate;
  const rotuloAtual = hojeNoPeriodo ? "Esta semana" : "Última semana";
  const rotuloAnterior = hojeNoPeriodo ? "Semana passada" : "Semana anterior";

  const intervalo = `${diaEMes(dias[0].data)} a ${diaEMes(dias[dias.length - 1].data)}`;
  const unidade = percentual ? "% da meta por dia" : "Pontos por dia";

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Minha semana</h2>
            <p className="text-base text-muted-foreground">
              {unidade} · {intervalo}
            </p>
          </div>

          {temSemanaAnterior && (
            <ToggleGroup
              type="single"
              value={mostrandoAnterior ? "anterior" : "atual"}
              onValueChange={(valor) => {
                if (valor) setQuerSemanaAnterior(valor === "anterior");
              }}
              variant="outline"
            >
              <ToggleGroupItem
                value="anterior"
                className={ITEM_SEMANA}
                aria-label={rotuloAnterior}
              >
                {rotuloAnterior}
              </ToggleGroupItem>
              <ToggleGroupItem value="atual" className={ITEM_SEMANA} aria-label={rotuloAtual}>
                {rotuloAtual}
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        <ol className="grid grid-cols-6 gap-1.5">
          {dias.map((dia, indice) => (
            <Bloco
              key={dia.data}
              dia={dia}
              indice={indice}
              maior={maior}
              percentual={percentual}
            />
          ))}
        </ol>

        {semAtendimento && (
          <p className="text-base text-muted-foreground">
            Nenhum atendimento nesta semana.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default MinhaSemana;
