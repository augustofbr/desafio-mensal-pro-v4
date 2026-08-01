import { useCallback, useMemo, useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { getCategoryDisplayName, isCategoryActive } from "@/lib/categoryDisplayNames";
import { resolveMetas } from "@/lib/metaProgress";
import { getCategoryRules, type CategoryRules, type RulesVersion } from "@/lib/rulesConfig";
import {
  aguardarFontes,
  cancelouCompartilhamento,
  compartilharOuBaixar,
  desenharCard,
  type DadosCard,
} from "@/lib/shareCard";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

interface CardCompartilhavelProps {
  perfil: ProfissionalAtivo;
  /** Entry do perfil na categoria dele. null = sem dados no periodo. */
  entry: Record<string, unknown> | null;
  /** Posicao 1-based no ranking da categoria. */
  posicao: number | null;
  rules: RulesVersion;
}

const FORMATO_INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const FORMATO_DECIMAL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Le um campo numerico do entry; ausente/invalido vira 0. */
function numeroDoEntry(entry: Record<string, unknown>, campo: string): number {
  const valor = entry[campo];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

/** Apelido quando existe; nome completo e o fallback. So exibicao. */
function nomeExibicao(perfil: ProfissionalAtivo): string {
  return (
    perfil.apelido?.trim() ||
    perfil.nome_profissional?.trim() ||
    `Profissional ${perfil.profissionalId}`
  );
}

/** "2026-08-01" -> "01/08". So recorta o texto, sem virar Date. */
function diaEMes(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

/**
 * Nome do periodo no rodape do card: "Agosto de 2026" quando o range cabe num
 * mes; intervalo curto quando e um range custom que cruza meses.
 */
function rotuloDoPeriodo(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "";
  if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
    return `${diaEMes(startDate)} a ${diaEMes(endDate)}`;
  }

  // Parse manual — `new Date('YYYY-MM-DD')` seria lido como UTC e voltaria um dia.
  const [ano, mes] = startDate.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(ano, mes - 1, 1));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** "Ana Paula" -> "ana-paula", para um nome de arquivo previsivel. */
function paraSlug(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "profissional"
  );
}

/**
 * Botao de compartilhar o proprio resultado como imagem.
 *
 * PRIVACIDADE (spec §4.5): a imagem carrega apenas os numeros de quem a gerou —
 * posicao, pontos, meta e mes. Nada de outras profissionais entra no card.
 *
 * Nao renderiza quando nao ha resultado honesto a compartilhar:
 * - sem `entry` (ninguem compartilha "0 pts" sem ter atendido) ou sem posicao;
 * - categoria fora do desafio no periodo — a posicao nao valeria nada.
 */
export function CardCompartilhavel({
  perfil,
  entry,
  posicao,
  rules,
}: CardCompartilhavelProps) {
  const { getFilteredDateRange } = useDateFilter();
  const { startDate, endDate } = getFilteredDateRange();
  const [gerando, setGerando] = useState(false);

  const categoria = perfil.categoria?.trim() ?? "";
  // getCategoryRules devolve undefined em runtime para categoria desconhecida.
  const regras: CategoryRules | undefined = categoria
    ? getCategoryRules(rules, categoria)
    : undefined;
  const participando = Boolean(regras) && isCategoryActive(rules, categoria);
  const podeCompartilhar = participando && entry !== null && posicao !== null;

  const dados = useMemo<DadosCard | null>(() => {
    if (!regras || !entry || posicao === null) return null;

    const percentual = regras.scoringModel === "revenue-percentage";
    const pontosTexto = percentual
      ? `${FORMATO_DECIMAL.format(numeroDoEntry(entry, "revenuePercentage"))}%`
      : `${FORMATO_INTEIRO.format(numeroDoEntry(entry, "points"))} pts`;

    // Mesma meta que o MeuCartao usa no ritmo: a primeira EM ABERTO. Com todas
    // batidas o card mostra 100% — e nao a media, que faria uma meta batida
    // "puxar para baixo" o numero de quem ja cumpriu tudo.
    const metas = resolveMetas(entry, regras);
    const metaEmAberto = metas.find((meta) => !meta.batida);
    const metaPct = metas.length === 0 ? 0 : (metaEmAberto?.pct ?? 100);
    // O rotulo acompanha o MESMO seletor do percentual, para a imagem falar da
    // meta que a tela esta cobrando. Com tudo batido e mais de uma meta, o nome
    // generico e o honesto: eleger uma das metas cumpridas seria arbitrario.
    const rotuloMeta =
      metaEmAberto?.rotulo ?? (metas.length === 1 ? metas[0].rotulo : "Meta do mês");

    return {
      apelido: nomeExibicao(perfil),
      categoria: getCategoryDisplayName(categoria),
      posicao,
      pontosTexto,
      rotuloMeta,
      metaPct,
      mesLabel: rotuloDoPeriodo(startDate, endDate),
    };
  }, [regras, entry, posicao, perfil, categoria, startDate, endDate]);

  const compartilhar = useCallback(async () => {
    if (!dados || gerando) return;
    setGerando(true);

    try {
      await aguardarFontes();
      // Canvas descartavel: nada do card precisa existir na arvore da pagina.
      const canvas = document.createElement("canvas");
      desenharCard(canvas, dados);

      const arquivo = `studiox-${paraSlug(dados.apelido)}-${startDate.slice(0, 7)}.png`;
      const resultado = await compartilharOuBaixar(canvas, arquivo);

      toast.success(
        resultado === "share"
          ? "Imagem compartilhada!"
          : "Imagem salva nos seus downloads"
      );
    } catch (erro) {
      // Fechar a folha de compartilhamento e uma escolha, nao uma falha.
      if (!cancelouCompartilhamento(erro)) {
        toast.error("Não foi possível gerar a imagem. Tente de novo.");
      }
    } finally {
      setGerando(false);
    }
  }, [dados, gerando, startDate]);

  if (!podeCompartilhar || !dados) return null;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={compartilhar}
        disabled={gerando}
        className="min-h-[48px] w-full gap-2 text-base"
      >
        {gerando ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Share2 className="h-5 w-5" aria-hidden="true" />
        )}
        {gerando ? "Gerando imagem…" : "Compartilhar meu resultado"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        A imagem mostra só os seus números.
      </p>
    </div>
  );
}

export default CardCompartilhavel;
