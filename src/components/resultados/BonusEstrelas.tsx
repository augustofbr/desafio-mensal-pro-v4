import { useMemo } from "react";
import { Star, UserRound } from "lucide-react";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { useEstrelasPendentes } from "@/hooks/useEstrelasPendentes";
import type { StarsByCategory } from "@/hooks/useStarsData";
import {
  bonusDisponivel,
  calcularBonus,
  formatarBRL,
  formatarBRLCompacto,
  juntarContagens,
  nomeDoMes,
  nomeExibicaoBonus,
  periodoEncerrado,
  profissionaisElegiveis,
  valoresPorCategoria,
  valorUnicoPorEstrela,
  type LinhaBonus,
} from "@/lib/bonusEstrelas";
import { getCategoryDisplayName } from "@/lib/categoryDisplayNames";
import { diaEmManaus } from "@/lib/periodoHistorico";
import { calcularPosicoes } from "@/lib/posicoes";
import type { RulesVersion } from "@/lib/rulesConfig";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

interface BonusEstrelasProps {
  starsData: StarsByCategory;
  rules: RulesVersion;
  activeProfessionals: ProfissionalAtivo[];
  perfilId: string | null;
  perfil: ProfissionalAtivo | null;
  /** Abre o MESMO seletor "Quem é você?" da seção Minha Meta. */
  onAbrirSeletor: () => void;
}

/** Cores de texto por categoria (contraste AA sobre branco). */
const COR_CATEGORIA: Record<string, string> = {
  Cabelo: "#1d4ed8",
  Unhas: "#b91c1c",
  Estetica: "#6d28d9",
  Maquiagem: "#a16207",
};

const COR_VERDE = "#146C34";
const CARD = "rounded-2xl bg-white p-4 shadow-[0_2px_14px_rgba(60,40,20,0.07)] sm:p-5";

function corDaCategoria(categoria: string): string {
  return COR_CATEGORIA[categoria] ?? "#374151";
}

function plural(qtd: number, singular: string, pluralForma: string): string {
  return qtd === 1 ? singular : pluralForma;
}

function EstrelaIcone({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <Star
      className={className}
      fill="#E8A317"
      stroke="#E8A317"
      aria-hidden="true"
    />
  );
}

function ChipCategoria({ categoria }: { categoria: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-black/10 bg-white px-2.5 py-0.5 text-xs font-semibold font-body"
      style={{ color: corDaCategoria(categoria) }}
    >
      {getCategoryDisplayName(categoria)}
    </span>
  );
}

function BotaoTrocar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] shrink-0 items-center px-2 text-sm font-semibold font-body underline underline-offset-4 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ color: COR_VERDE, outlineColor: COR_VERDE }}
    >
      Trocar
    </button>
  );
}

interface CabecalhoProps {
  mes: string;
  /** Valor único por estrela; null = valores diferem por categoria (sem selo). */
  valorUnico: number | null;
}

function Cabecalho({ mes, valorUnico }: CabecalhoProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-[14rem] items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: "#FFF4D6" }}
          aria-hidden="true"
        >
          <Star className="h-6 w-6" fill="#E8A317" stroke="#E8A317" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="bonus-estrelas-titulo"
            className="font-display text-xl font-bold leading-tight text-gray-800"
          >
            Bônus Estrelas
          </h2>
          <p className="font-body text-sm text-gray-600">
            Extra de {mes} · separado do ranking
          </p>
        </div>
      </div>
      {valorUnico !== null && (
        <span
          className="shrink-0 rounded-full px-3 py-1 font-mono-num text-xs font-semibold"
          style={{ backgroundColor: "#FFF4D6", color: "#7a4d00" }}
        >
          {formatarBRLCompacto(valorUnico)} / estrela
        </span>
      )}
    </div>
  );
}

function TextoDaRegra({
  mes,
  valorUnico,
  porCategoria,
}: {
  mes: string;
  valorUnico: number | null;
  porCategoria: { categoria: string; valor: number }[];
}) {
  return (
    <p className="font-body text-sm leading-relaxed text-gray-700">
      Cada estrela do Google <strong>aprovada</strong> e{" "}
      <strong>cadastrada em {mes}</strong> vale{" "}
      {valorUnico !== null ? (
        <strong>{formatarBRL(valorUnico)}</strong>
      ) : (
        <>
          o valor da sua categoria (
          {porCategoria
            .map((item) => `${getCategoryDisplayName(item.categoria)} ${formatarBRL(item.valor)}`)
            .join(" · ")}
          )
        </>
      )}
      . Vale para todos os profissionais do desafio, sem mínimo e sem limite.
    </p>
  );
}

interface MeuBonusProps {
  perfil: ProfissionalAtivo;
  linha: LinhaBonus | null;
  /** undefined = carregando ou falhou: o número não aparece. */
  pendentes: number | undefined;
  valorPendente: number;
  mes: string;
  encerrado: boolean;
  onTrocar: () => void;
}

function MeuBonus({
  perfil,
  linha,
  pendentes,
  valorPendente,
  mes,
  encerrado,
  onTrocar,
}: MeuBonusProps) {
  const nome = nomeExibicaoBonus(perfil);
  const categoria = perfil.categoria?.trim() ?? "";

  const cabecalho = (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <p className="truncate font-body text-base font-semibold text-gray-800">{nome}</p>
        {categoria && <ChipCategoria categoria={categoria} />}
      </div>
      <BotaoTrocar onClick={onTrocar} />
    </div>
  );

  if (!linha) {
    return (
      <div
        className="rounded-xl border p-3"
        style={{ backgroundColor: "#F9FAFB", borderColor: "#E5E7EB" }}
      >
        {cabecalho}
        <p className="mt-1 font-body text-sm text-gray-700">
          {perfil.ativo === false
            ? "Seu cadastro está inativo, então você não participa do bônus."
            : "Sua categoria não participa do bônus neste mês."}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-3"
      style={{ backgroundColor: "#F3FAF5", borderColor: "#CDE8D5" }}
    >
      {cabecalho}
      <p
        className="mt-2 font-mono-num text-4xl font-medium leading-none"
        style={{ color: COR_VERDE }}
      >
        {formatarBRL(linha.valor)}
      </p>
      <p className="mt-1.5 font-body text-sm text-gray-700">
        {encerrado
          ? `a receber referente a ${mes}`
          : `acumulado para receber após o fechamento de ${mes}`}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
        <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 font-body text-sm text-gray-800 ring-1 ring-black/5">
          <EstrelaIcone />
          <span>
            <strong className="font-mono-num">{linha.aprovadas}</strong>{" "}
            {plural(linha.aprovadas, "estrela aprovada", "estrelas aprovadas")}
          </span>
        </div>
        {pendentes !== undefined && (
          <div className="rounded-lg bg-white px-3 py-2.5 font-body text-sm text-gray-800 ring-1 ring-black/5">
            <strong className="font-mono-num">{pendentes}</strong> aguardando aprovação
            {pendentes > 0 && (
              <span className="ml-1 whitespace-nowrap font-mono-num font-medium" style={{ color: COR_VERDE }}>
                (+{formatarBRL(valorPendente)})
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SemPerfil({ onAbrirSeletor }: { onAbrirSeletor: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-gray-300 p-4 text-center">
      <p className="font-body text-sm text-gray-700">
        Escolha seu nome para ver quanto você já acumulou de bônus neste mês.
      </p>
      <button
        type="button"
        onClick={onAbrirSeletor}
        className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 font-body text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ backgroundColor: COR_VERDE, outlineColor: COR_VERDE }}
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        Quem é você?
      </button>
    </div>
  );
}

interface RankingProps {
  linhas: LinhaBonus[];
  semEstrela: number;
  mes: string;
  perfilId: string | null;
}

function RankingBonus({ linhas, semEstrela, mes, perfilId }: RankingProps) {
  // Mesma regra de empate do ranking da página (1, 1, 3...).
  const posicoes = useMemo(() => calcularPosicoes(linhas.map((l) => l.aprovadas)), [linhas]);

  return (
    <div className={CARD}>
      <h3 className="font-display text-lg font-bold text-gray-800">Ranking do bônus</h3>

      {linhas.length === 0 ? (
        <p className="mt-3 font-body text-sm text-gray-700">
          Nenhuma estrela aprovada em {mes} ainda.
        </p>
      ) : (
        <ol className="mt-2 divide-y divide-gray-100">
          {linhas.map((linha, indice) => {
            const ehVoce = linha.id === perfilId;
            return (
              <li
                key={linha.id}
                className="-mx-2 flex min-h-[52px] items-center gap-3 rounded-lg px-2 py-2"
                style={ehVoce ? { backgroundColor: "#F3FAF5" } : undefined}
              >
                <span className="w-6 shrink-0 text-center font-mono-num text-sm text-gray-600">
                  {posicoes[indice]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body text-sm font-semibold text-gray-800">
                    {linha.nome}
                    {ehVoce && <span className="sr-only"> (você)</span>}
                  </span>
                  <span
                    className="block font-body text-xs font-medium"
                    style={{ color: corDaCategoria(linha.categoria) }}
                  >
                    {getCategoryDisplayName(linha.categoria)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-mono-num text-sm text-gray-700">
                  <EstrelaIcone className="h-3.5 w-3.5" />
                  <span className="sr-only">Estrelas aprovadas: </span>
                  {linha.aprovadas}
                </span>
                <span
                  className="w-24 shrink-0 text-right font-mono-num text-sm font-medium"
                  style={{ color: COR_VERDE }}
                >
                  {formatarBRL(linha.valor)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {semEstrela > 0 && (
        <p className="mt-3 font-body text-xs text-gray-600">
          Mais {semEstrela} {plural(semEstrela, "profissional ainda sem", "profissionais ainda sem")}{" "}
          estrela aprovada em {mes}.
        </p>
      )}
    </div>
  );
}

/**
 * "Bônus Estrelas": extra em R$ por estrela Google aprovada, SEPARADO do
 * ranking e da pontuação. Só valores individuais — nunca a soma da equipe.
 *
 * As aprovadas vêm de `useStarsData` (mesmo mês de cadastro e mesmo fuso do
 * scoring); as pendentes, de uma consulta leve própria. A identidade é a
 * MESMA da seção Minha Meta (recebida por props), nunca uma segunda.
 */
export default function BonusEstrelas(props: BonusEstrelasProps) {
  // Sem bônus configurado nas categorias ativas do mês, a área some — e nem a
  // consulta de pendentes é feita.
  if (!bonusDisponivel(props.rules)) return null;
  return <BonusEstrelasConteudo {...props} />;
}

function BonusEstrelasConteudo({
  starsData,
  rules,
  activeProfessionals,
  perfilId,
  perfil,
  onAbrirSeletor,
}: BonusEstrelasProps) {
  const { getFilteredDateRange } = useDateFilter();
  const { startDate, endDate } = getFilteredDateRange();
  const pendentesQuery = useEstrelasPendentes(startDate, endDate);

  const mes = nomeDoMes(startDate);
  const encerrado = periodoEncerrado(endDate, diaEmManaus(new Date()));

  const resultado = useMemo(() => {
    const elegiveis = profissionaisElegiveis(activeProfessionals, rules);
    const aprovadas = juntarContagens([
      starsData.cabelo,
      starsData.unhas,
      starsData.estetica,
      starsData.maquiagem,
    ]);
    return calcularBonus(elegiveis, aprovadas, pendentesQuery.data ?? {});
  }, [activeProfessionals, rules, starsData, pendentesQuery.data]);

  const valorUnico = valorUnicoPorEstrela(rules);
  const porCategoria = valoresPorCategoria(rules);

  const minhaLinha = perfilId ? resultado.porId.get(perfilId) ?? null : null;

  return (
    <section aria-labelledby="bonus-estrelas-titulo" className="space-y-4">
      <div className={CARD}>
        <Cabecalho mes={mes} valorUnico={valorUnico} />

        <div className="mt-4">
          {perfil ? (
            <MeuBonus
              perfil={perfil}
              linha={minhaLinha}
              pendentes={pendentesQuery.data ? minhaLinha?.pendentes ?? 0 : undefined}
              valorPendente={minhaLinha?.valorPendente ?? 0}
              mes={mes}
              encerrado={encerrado}
              onTrocar={onAbrirSeletor}
            />
          ) : (
            <SemPerfil onAbrirSeletor={onAbrirSeletor} />
          )}
        </div>

        <div className="mt-4">
          <TextoDaRegra mes={mes} valorUnico={valorUnico} porCategoria={porCategoria} />
        </div>
      </div>

      <RankingBonus
        linhas={resultado.ranking}
        semEstrela={resultado.semEstrela}
        mes={mes}
        perfilId={perfilId}
      />

      <p className="px-1 font-body text-xs text-gray-600">
        Atualiza ao abrir ou recarregar a página · pago após o fechamento do mês
      </p>
    </section>
  );
}

export { BonusEstrelas };
