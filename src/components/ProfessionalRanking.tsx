
import { Star, Trophy, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PROF_CATEGORIES } from "@/lib/categoryDisplayNames";
import { calcularPosicoes, medalhaPara } from "@/lib/posicoes";
import { CategoryRules } from "@/lib/rulesConfig";
import { cn } from "@/lib/utils";

interface ProfessionalRankingProps {
  data: any[];
  categoryKey: string;
  onSelectProfessional: (professionalId: string, professional: string) => void;
  rules: CategoryRules;
}

function inicial(nome: string): string {
  return (Array.from(String(nome ?? "").trim())[0] ?? "?").toUpperCase();
}

interface MetricaProps {
  valor: number | string;
  rotulo: string;
}

/**
 * Badge de metrica: o numero em mono, a unidade em texto discreto.
 * `whitespace-nowrap` porque rotulo longo ("Cronograma Capilar") quebrava
 * DENTRO da pilula; melhor a pilula inteira descer para a linha de baixo.
 */
function Metrica({ valor, rotulo }: MetricaProps) {
  return (
    <Badge variant="secondary" className="gap-1 whitespace-nowrap text-sm font-normal">
      <span className="font-mono-num font-semibold">{valor}</span>
      <span className="text-muted-foreground">{rotulo}</span>
    </Badge>
  );
}

export default function ProfessionalRanking({
  data,
  categoryKey,
  onSelectProfessional,
  rules,
}: ProfessionalRankingProps) {
  // `points` e o valor pelo qual TODOS os modelos ordenam (no revenue-percentage
  // ele ja e o proprio percentual da meta).
  const valores = data.map(item =>
    typeof item?.points === 'number' && Number.isFinite(item.points) ? item.points : 0
  );
  const posicoes = calcularPosicoes(valores);
  // Todo mundo zerado nao e empate no 1o lugar: e uma corrida que ainda nao
  // comecou. Sem isso o mes recem-aberto entrega podio a equipe inteira.
  const corridaComecou = valores.some(valor => valor > 0);

  if (data.length === 0 || !corridaComecou) {
    return (
      <div className="py-8 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Trophy className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <p className="text-base text-muted-foreground">
          Nenhum atendimento na categoria neste período.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-2.5">
        {data.map((item, index) => {
          const posicao = posicoes[index];
          // Destaque de lider = medalha de ouro: empate na lideranca destaca as
          // duas, e sem pontuacao ninguem sobe ao podio (medalhaPara devolve
          // null). A regra do "so com valor > 0" mora no helper.
          const medalha = medalhaPara(posicao, valores[index]);
          const isFirst = medalha !== null && posicao === 1;
          const score = rules.scoringModel === 'revenue-percentage'
            ? `${item.revenuePercentage}%`
            : `${item.points} Pts`;

          return (
            <li key={item.professionalId ?? item.professional}>
              <button
                type="button"
                onClick={() => onSelectProfessional(item.professionalId, item.professional)}
                className={cn(
                  "ranking-card-touch flex min-h-[56px] w-full items-center gap-2 rounded-xl border p-2.5 text-left transition-colors sm:gap-3 sm:p-3",
                  `animate-fade-slide-up stagger-${Math.min(index + 1, 8)}`,
                  // Hover neutro (mesma decisao do ToggleGroup da MinhaSemana):
                  // `accent` aqui e o dourado da marca, nao um cinza de hover, e
                  // no celular ele gruda depois do toque.
                  isFirst ? "border-primary/40 bg-primary/5" : "bg-card hover:bg-muted/70"
                )}
              >
                <span className="w-7 shrink-0 text-center font-mono-num text-sm font-semibold text-muted-foreground">
                  {posicao}º
                </span>

                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="text-base font-semibold">
                    {inicial(item.professional)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex items-center gap-1.5 text-base font-semibold">
                    <span className="truncate">{item.professional}</span>
                    {medalha && (
                      <span role="img" aria-label={`${posicao}º lugar`} className="shrink-0">
                        {medalha}
                      </span>
                    )}
                  </p>

                  <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                    {item.starCount > 0 && (
                      <>
                        <Badge variant="secondary" className="gap-1 text-sm font-normal">
                          <Star
                            className="h-3.5 w-3.5 fill-accent text-accent"
                            aria-hidden="true"
                          />
                          <span className="font-mono-num font-semibold">{item.starCount}</span>
                        </Badge>
                        {rules.starsCountInScore && (
                          <Metrica
                            valor={`+${item.starCount * rules.starPointValue}`}
                            rotulo="pts"
                          />
                        )}
                      </>
                    )}
                    {categoryKey === PROF_CATEGORIES.CABELO && (
                      <>
                        <Metrica valor={item.uniqueClientDays} rotulo="cli" />
                        <Metrica
                          valor={item.treatmentServices}
                          rotulo={rules.specialServiceLabel}
                        />
                        {rules.manufacturerConstraints && item.invalidTreatmentCount > 0 && (
                          <Badge variant="outline" className="gap-1 text-sm font-normal">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="font-mono-num font-semibold">
                              {item.invalidTreatmentCount}
                            </span>
                          </Badge>
                        )}
                      </>
                    )}
                    {categoryKey === PROF_CATEGORIES.UNHAS && (
                      <>
                        <Metrica valor={item.uniqueClientDays} rotulo="cli" />
                        <Metrica valor={item.spaServices} rotulo={rules.specialServiceLabel} />
                      </>
                    )}
                    {categoryKey === PROF_CATEGORIES.MAQUIAGEM && (
                      <Metrica
                        valor={
                          rules.scoringModel === 'revenue-points'
                            ? item.serviceCount ?? item.totalServices
                            : item.totalServices
                        }
                        rotulo="serv"
                      />
                    )}
                    {categoryKey === PROF_CATEGORIES.ESTETICA && (
                      rules.scoringModel === 'points' ? (
                        <>
                          <Metrica valor={item.uniqueClientDays} rotulo="cli" />
                          <Metrica
                            valor={item.specialServices}
                            rotulo={rules.specialServiceLabel}
                          />
                        </>
                      ) : (
                        <Metrica valor={item.serviceCount} rotulo="serv" />
                      )
                    )}
                  </div>
                </div>

                <span
                  className={cn(
                    "shrink-0 font-mono-num text-base font-bold sm:text-lg",
                    isFirst ? "text-primary" : "text-foreground"
                  )}
                >
                  {score}
                </span>
              </button>
            </li>
          );
        })}
    </ol>
  );
}
