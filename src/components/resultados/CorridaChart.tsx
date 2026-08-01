import { useMemo } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { normalizeProfessionalId } from "@/lib/scoring";
import { cn } from "@/lib/utils";

interface CorridaChartProps {
  /** Entries da categoria ativa — os hooks ja devolvem em ordem de ranking. */
  entries: Record<string, unknown>[];
  /** Id normalizado do perfil local; destaca a barra "voce". null = sem perfil. */
  perfilId: string | null;
  /** "%" apenas no modelo revenue-percentage; nos demais, pontos. */
  unidade: "pts" | "%";
}

const FORMATO_INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const FORMATO_DECIMAL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const MEDALHAS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/** Le um campo numerico do entry; ausente/invalido vira 0. */
function numeroDoEntry(entry: Record<string, unknown>, campo: string): number {
  const valor = entry[campo];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function textoDoEntry(entry: Record<string, unknown>, campo: string): string {
  const valor = entry[campo];
  return typeof valor === "string" ? valor.trim() : "";
}

function inicial(nome: string): string {
  return (Array.from(nome)[0] ?? "?").toUpperCase();
}

interface Linha {
  chave: string;
  nome: string;
  /** Posicao exibida, 1-based. Empate de valor repete a posicao (1, 1, 3...). */
  posicao: number;
  valorTexto: string;
  /** Largura da barra em % do lider. */
  largura: number;
  euMesma: boolean;
}

/**
 * Corrida da categoria: uma barra por profissional, comprimento proporcional ao
 * lider. Sem biblioteca de grafico — divs puras, porque a leitura no celular
 * depende de linha alta, nome legivel e valor colado na barra.
 *
 * Nao ordena nem recalcula nada: os hooks de categoria ja entregam o ranking
 * pronto, entao os numeros daqui batem com os do resto da tela.
 */
export function CorridaChart({ entries, perfilId, unidade }: CorridaChartProps) {
  const percentual = unidade === "%";

  const { linhas, corridaComecou } = useMemo<{
    linhas: Linha[];
    corridaComecou: boolean;
  }>(() => {
    // `points` e o valor pelo qual TODOS os modelos ordenam; no modelo
    // revenue-percentage ele ja e o proprio percentual da meta.
    const valores = entries.map((entry) => numeroDoEntry(entry, "points"));
    const maior = valores.reduce((max, valor) => Math.max(max, valor), 0);

    let posicaoAnterior = 0;
    let valorAnterior: number | null = null;

    const montadas = entries.map((entry, indice) => {
      const valor = valores[indice];
      const id = normalizeProfessionalId(entry.professionalId as string | number | null | undefined);

      // Empate mantem a posicao do anterior; quem vem depois pula os lugares
      // ocupados (1, 1, 3) — mesma regra do ranking do dashboard.
      const posicao = valorAnterior !== null && valor === valorAnterior ? posicaoAnterior : indice + 1;
      posicaoAnterior = posicao;
      valorAnterior = valor;

      const nome = textoDoEntry(entry, "professional") || (id ?? "Sem nome");

      return {
        chave: id ?? `sem-id-${indice}`,
        nome,
        posicao,
        valorTexto: percentual
          ? `${FORMATO_DECIMAL.format(valor)}%`
          : FORMATO_INTEIRO.format(valor),
        largura: maior > 0 ? Math.max(0, (valor / maior) * 100) : 0,
        euMesma: id !== null && id === perfilId,
      };
    });

    // Todo mundo zerado nao e um empate no 1o lugar: e uma corrida que ainda
    // nao comecou. Sem isso o mes recem-aberto entrega medalha de ouro a
    // equipe inteira.
    return { linhas: montadas, corridaComecou: maior > 0 };
  }, [entries, perfilId, percentual]);

  if (linhas.length === 0 || !corridaComecou) {
    return (
      <p className="py-6 text-center text-base text-muted-foreground">
        Nenhum atendimento na categoria neste período.
      </p>
    );
  }

  return (
    <ol className="space-y-1">
      {linhas.map((linha) => {
        const medalha = MEDALHAS[linha.posicao];
        return (
          <li
            key={linha.chave}
            className="flex min-h-[44px] items-center gap-3 rounded-lg px-1 py-2"
          >
            {medalha ? (
              <span
                role="img"
                aria-label={`${linha.posicao}º lugar`}
                className="w-8 shrink-0 text-center text-lg leading-none"
              >
                {medalha}
              </span>
            ) : (
              <span className="font-mono-num w-8 shrink-0 text-center text-base text-muted-foreground">
                {linha.posicao}º
              </span>
            )}

            <Avatar className="h-9 w-9 shrink-0" aria-hidden="true">
              <AvatarFallback className="text-sm font-semibold">
                {inicial(linha.nome)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-base", linha.euMesma && "font-semibold")}>
                {linha.nome}
                {linha.euMesma && <span className="sr-only"> (você)</span>}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                {/* Trilho sem preenchimento: a barra fica sobre a propria
                    superficie do cartao, que e a cor validada na paleta. */}
                <div className="h-3 flex-1">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      linha.euMesma
                        ? "bg-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "bg-primary/55"
                    )}
                    style={{ width: `${linha.largura.toFixed(1)}%` }}
                  />
                </div>
                {/* Rotulo direto: cada barra carrega o proprio numero, sem eixo
                    nem legenda para o olho ter que cruzar. */}
                <span
                  className={cn(
                    "font-mono-num w-16 shrink-0 text-right text-sm",
                    linha.euMesma ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {linha.valorTexto}
                  {!percentual && <span className="sr-only"> pontos</span>}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default CorridaChart;
