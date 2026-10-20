import { useMemo } from "react";
import { Star, UserRound } from "lucide-react";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { useEstrelasPendentes } from "@/hooks/useEstrelasPendentes";
import type { StarsByCategory } from "@/hooks/useStarsData";
import {
  bonusDisponivel,
  calcularBonus,
  extrasDoBonus,
  formatarBRL,
  formatarBRLCompacto,
  juntarContagens,
  nomeDoMes,
  nomeExibicaoBonus,
  participaSoDoBonus,
  periodoEncerrado,
  profissionaisElegiveis,
  valoresPorCategoria,
  valorUnicoPorEstrela,
  type LinhaBonus,
} from "@/lib/bonusEstrelas";
import { getCategoryDisplayName } from "@/lib/categoryDisplayNames";
import { MOTIVO_ERRO_VINCULO } from "@/lib/identidade";
import { diaEmManaus } from "@/lib/periodoHistorico";
import { calcularPosicoes } from "@/lib/posicoes";
import type { RulesVersion } from "@/lib/rulesConfig";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

interface BonusEstrelasProps {
  starsData: StarsByCategory;
  /** A leitura das estrelas falhou: `starsData` esta zerado e NAO vale como "0 estrelas". */
  starsError: boolean;
  rules: RulesVersion;
  activeProfessionals: ProfissionalAtivo[];
  perfilId: string | null;
  perfil: ProfissionalAtivo | null;
  /**
   * Abre o MESMO seletor "Quem é você?" da seção Minha Meta. Ausente quando a
   * identidade vem da conta (fixa) ou ainda carrega: sem "Trocar" nem convite.
   */
  onAbrirSeletor?: () => void;
  /** O vínculo da conta ainda carrega: nem convite nem identidade por enquanto. */
  identidadeCarregando?: boolean;
  /** A leitura do vínculo falhou: não convida a escolher nem culpa o cadastro. */
  identidadeErro?: boolean;
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

/** Rotulo de quem participa so do bonus (sem categoria no desafio do mes). */
const ROTULO_SO_BONUS = "Bônus Estrelas";
/** Cinza neutro (contraste AA sobre branco), distinto das cores de categoria. */
const COR_SO_BONUS = "#4b5563";

function corDaCategoria(categoria: string | null): string {
  if (!categoria) return COR_SO_BONUS;
  return COR_CATEGORIA[categoria] ?? "#374151";
}

function rotuloDaCategoria(categoria: string | null): string {
  return categoria ? getCategoryDisplayName(categoria) : ROTULO_SO_BONUS;
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

function ChipCategoria({ categoria }: { categoria: string | null }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-black/10 bg-white px-2.5 py-0.5 text-xs font-semibold font-body"
      style={{ color: corDaCategoria(categoria) }}
    >
      {rotuloDaCategoria(categoria)}
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
  valorExtras,
}: {
  mes: string;
  valorUnico: number | null;
  porCategoria: { categoria: string; valor: number }[];
  /** R$ por estrela de quem participa só do bônus; null = mês sem extras. */
  valorExtras: number | null;
}) {
  const itens = porCategoria.map(
    (item) => `${getCategoryDisplayName(item.categoria)} ${formatarBRL(item.valor)}`
  );
  if (valorExtras !== null) itens.push(`só do bônus ${formatarBRL(valorExtras)}`);

  let quem: string;
  if (porCategoria.length > 0 && valorExtras !== null) {
    quem = "Vale para todos os profissionais do desafio e para quem participa só do bônus neste mês";
  } else if (valorExtras !== null) {
    quem = "Vale para quem participa do bônus neste mês";
  } else {
    quem = "Vale para todos os profissionais do desafio";
  }

  return (
    <p className="font-body text-sm leading-relaxed text-gray-700">
      Cada estrela do Google <strong>aprovada</strong> e{" "}
      <strong>cadastrada em {mes}</strong> vale{" "}
      {valorUnico !== null ? (
        <strong>{formatarBRL(valorUnico)}</strong>
      ) : (
        <>
          o valor da sua categoria ({itens.join(" · ")})
        </>
      )}
      . {quem}, sem mínimo e sem limite.
    </p>
  );
}

interface MeuBonusProps {
  perfil: ProfissionalAtivo;
  /** Participa só do bônus no mês (extras): chip "Bônus Estrelas". */
  soBonus: boolean;
  linha: LinhaBonus | null;
  /** undefined = carregando ou falhou: o número não aparece. */
  pendentes: number | undefined;
  valorPendente: number;
  mes: string;
  encerrado: boolean;
  onTrocar?: () => void;
}

function MeuBonus({
  perfil,
  soBonus,
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
        {soBonus ? (
          <ChipCategoria categoria={null} />
        ) : (
          categoria && <ChipCategoria categoria={categoria} />
        )}
      </div>
      {onTrocar && <BotaoTrocar onClick={onTrocar} />}
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
            : categoria
              ? "Sua categoria não participa do bônus neste mês."
              : "Você não participa do bônus neste mês."}
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
        className="mt-2 font-mono-num text-3xl font-medium leading-none sm:text-4xl"
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

function SemPerfil({
  onAbrirSeletor,
  carregando,
  erro,
}: {
  onAbrirSeletor?: () => void;
  carregando: boolean;
  erro: boolean;
}) {
  if (erro) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 p-4 text-center">
        <p role="alert" className="font-body text-sm text-gray-700">
          {MOTIVO_ERRO_VINCULO}
        </p>
      </div>
    );
  }

  // Vínculo da conta ainda carregando: nada de convite que logo depois some.
  if (carregando) {
    return <div className="h-24 animate-shimmer rounded-xl" aria-busy="true" />;
  }

  // Identidade fixa da conta, mas sem cadastro correspondente nesta lista.
  if (!onAbrirSeletor) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 p-4 text-center">
        <p className="font-body text-sm text-gray-700">
          Não encontramos o seu cadastro para mostrar o bônus. Fale com a recepção.
        </p>
      </div>
    );
  }

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
  // Posição por VALOR em R$ (a lista já vem ordenada por valor desc). Mesma
  // regra de empate do ranking da página (1, 1, 3...), só quando o valor empata.
  const posicoes = useMemo(() => calcularPosicoes(linhas.map((l) => l.valor)), [linhas]);

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
                    {rotuloDaCategoria(linha.categoria)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-mono-num text-sm text-gray-700">
                  <EstrelaIcone className="h-3.5 w-3.5" />
                  <span className="sr-only">Estrelas aprovadas: </span>
                  {linha.aprovadas}
                </span>
                <span
                  className="min-w-[5.5rem] shrink-0 whitespace-nowrap text-right font-mono-num text-sm font-medium"
                  style={{ color: COR_VERDE }}
                >
                  {formatarBRL(linha.valor)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {semEstrela > 0 && linhas.length > 0 && (
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
  const { filterType, getFilteredDateRange } = useDateFilter();

  // Intervalo livre não é "o mês": o bônus é mensal e o texto/pagamento falam em
  // mês fechado. A área só aparece em mês atual e mês anterior.
  if (filterType === "custom") return null;

  // Sem bônus configurado nas categorias ativas do mês, a área some — e nem a
  // consulta de pendentes é feita.
  if (!bonusDisponivel(props.rules)) return null;

  // Estrelas não carregaram: nunca mostrar "nenhuma estrela" / R$ 0,00 no lugar
  // de um erro. Sem ranking e sem valores.
  if (props.starsError) {
    return (
      <section aria-labelledby="bonus-estrelas-titulo" className="space-y-4">
        <div className={CARD}>
          <Cabecalho mes={nomeDoMes(getFilteredDateRange().startDate)} valorUnico={null} />
          <p
            role="alert"
            className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 font-body text-sm text-gray-700"
          >
            Não foi possível carregar as estrelas agora. Recarregue a página para ver seu bônus.
          </p>
        </div>
      </section>
    );
  }

  return <BonusEstrelasConteudo {...props} />;
}

function BonusEstrelasConteudo({
  starsData,
  rules,
  activeProfessionals,
  perfilId,
  perfil,
  onAbrirSeletor,
  identidadeCarregando = false,
  identidadeErro = false,
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
      // Quem participa só do bônus (extras); só conta para quem é elegível.
      starsData.semCategoria,
    ]);
    return calcularBonus(elegiveis, aprovadas, pendentesQuery.data ?? {});
  }, [activeProfessionals, rules, starsData, pendentesQuery.data]);

  const valorUnico = valorUnicoPorEstrela(rules);
  const porCategoria = valoresPorCategoria(rules);
  const valorExtras = extrasDoBonus(rules)?.valorPorEstrela ?? null;

  const minhaLinha = perfilId ? resultado.porId.get(perfilId) ?? null : null;

  return (
    <section aria-labelledby="bonus-estrelas-titulo" className="space-y-4">
      <div className={CARD}>
        <Cabecalho mes={mes} valorUnico={valorUnico} />

        <div className="mt-4">
          {perfil ? (
            <MeuBonus
              perfil={perfil}
              soBonus={participaSoDoBonus(perfil, rules)}
              linha={minhaLinha}
              pendentes={pendentesQuery.data ? minhaLinha?.pendentes ?? 0 : undefined}
              valorPendente={minhaLinha?.valorPendente ?? 0}
              mes={mes}
              encerrado={encerrado}
              onTrocar={onAbrirSeletor}
            />
          ) : (
            <SemPerfil
              onAbrirSeletor={onAbrirSeletor}
              carregando={identidadeCarregando}
              erro={identidadeErro}
            />
          )}
        </div>

        <div className="mt-4">
          <TextoDaRegra
            mes={mes}
            valorUnico={valorUnico}
            porCategoria={porCategoria}
            valorExtras={valorExtras}
          />
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
