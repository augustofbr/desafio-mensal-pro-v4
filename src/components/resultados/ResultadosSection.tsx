import { useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { usePerfilLocal } from "@/hooks/usePerfilLocal";
import { PROF_CATEGORIES } from "@/lib/categoryDisplayNames";
import { calcularPosicoes } from "@/lib/posicoes";
import { type RulesVersion } from "@/lib/rulesConfig";
import { normalizeProfessionalId } from "@/lib/scoring";
import type { ServicoDoDia } from "@/lib/semana";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";
import CardCompartilhavel from "./CardCompartilhavel";
import MeuCartao from "./MeuCartao";
import MinhaSemana from "./MinhaSemana";
import ProfileSelector from "./ProfileSelector";

interface ResultadosSectionProps {
  hairData: Record<string, unknown>[];
  manicureData: Record<string, unknown>[];
  esteticaData: Record<string, unknown>[];
  maquiagemData: Record<string, unknown>[];
  rules: RulesVersion;
  activeProfessionals: ProfissionalAtivo[];
}

/** Le um campo numerico do entry; ausente/invalido vira 0. */
function numeroDoEntry(entry: Record<string, unknown>, campo: string): number {
  const valor = entry[campo];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

/**
 * Secao "Minha Meta": o acompanhamento pessoal do desafio.
 *
 * Nao busca nem recalcula nada — consome os mesmos datasets ja rankeados que
 * alimentam o ranking da pagina, entao os numeros daqui batem com os de la.
 * A identidade e local (localStorage) e sempre reversivel.
 */
export default function ResultadosSection({
  hairData,
  manicureData,
  esteticaData,
  maquiagemData,
  rules,
  activeProfessionals,
}: ResultadosSectionProps) {
  const { perfilId, perfil, escolher, limpar, autoLimpou, reconhecerAutoLimpeza } =
    usePerfilLocal(activeProfessionals);
  const [seletorAberto, setSeletorAberto] = useState(false);

  const dadosPorCategoria = useMemo<Record<string, Record<string, unknown>[]>>(
    () => ({
      [PROF_CATEGORIES.CABELO]: hairData,
      [PROF_CATEGORIES.UNHAS]: manicureData,
      [PROF_CATEGORIES.ESTETICA]: esteticaData,
      [PROF_CATEGORIES.MAQUIAGEM]: maquiagemData,
    }),
    [hairData, manicureData, esteticaData, maquiagemData]
  );

  const categoriaDoPerfil = perfil?.categoria?.trim() ?? null;

  // Entry / posicao / lider do perfil na PROPRIA categoria (mesmo dataset do
  // ranking, sem reordenar).
  const meuRanking = useMemo(() => {
    const semDados = {
      entry: null,
      posicao: null,
      liderPontos: null,
      servicos: [] as ServicoDoDia[],
    };
    if (!perfilId || !categoriaDoPerfil) return semDados;

    const entries = dadosPorCategoria[categoriaDoPerfil] ?? [];
    const indice = entries.findIndex(
      (entry) =>
        normalizeProfessionalId(
          entry.professionalId as string | number | null | undefined
        ) === perfilId
    );
    if (indice < 0) return semDados;

    const pontosDoLider = numeroDoEntry(entries[0], "points");
    const liderPontos = pontosDoLider > 0 ? pontosDoLider : null;
    // Os servicos vem do entry BRUTO: a semana mostra os dias trabalhados mesmo
    // quando o guard de podio abaixo zera o entry do cartao.
    const bruto = entries[indice].services;
    const servicos = Array.isArray(bruto) ? (bruto as ServicoDoDia[]) : [];

    // Zerado no periodo = sem atendimento, nao "1o lugar". Com o mes inteiro em
    // zero a ordem do array decidiria a lideranca, e o cartao coroaria quem
    // simplesmente veio primeiro na lista.
    if (numeroDoEntry(entries[indice], "points") <= 0) {
      return { entry: null, posicao: null, liderPontos, servicos };
    }

    // Mesma regra de empate do ranking da pagina (1, 1, 3...).
    const posicoes = calcularPosicoes(
      entries.map((item) => numeroDoEntry(item, "points"))
    );

    return {
      entry: entries[indice],
      posicao: posicoes[indice],
      liderPontos,
      servicos,
    };
  }, [perfilId, categoriaDoPerfil, dadosPorCategoria]);

  // Perfil salvo que sumiu do cadastro: em vez de a pessoa voltar ao convite sem
  // entender por que, ela e avisada e o seletor abre uma vez (spec §4.1).
  useEffect(() => {
    if (!autoLimpou) return;
    // Topo: o seletor abre como folha inferior e cobriria um toast na posicao
    // padrao (canto de baixo) — o aviso ficaria invisivel justo quando importa.
    toast("Seu perfil foi atualizado — escolha novamente", {
      position: "top-center",
      duration: 6000,
    });
    setSeletorAberto(true);
    reconhecerAutoLimpeza();
  }, [autoLimpou, reconhecerAutoLimpeza]);

  return (
    <div className="space-y-5">
      {perfil ? (
        <MeuCartao
          perfil={perfil}
          entry={meuRanking.entry}
          posicao={meuRanking.posicao}
          liderPontos={meuRanking.liderPontos}
          rules={rules}
          onTrocar={() => setSeletorAberto(true)}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <button
              type="button"
              onClick={() => setSeletorAberto(true)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-lg p-4 text-left transition-colors hover:bg-accent sm:p-6"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <UserRound className="h-6 w-6 text-primary" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold">
                  Toque para ver seu progresso
                </span>
                <span className="block text-base text-muted-foreground">
                  Escolha seu nome e acompanhe suas metas do período.
                </span>
              </span>
            </button>
          </CardContent>
        </Card>
      )}

      {/* Detalhe pessoal logo apos o cartao: a pessoa ve o total do periodo e
          entao de onde ele veio, dia a dia. Sem perfil nao ha semana. */}
      {perfil && (
        <MinhaSemana
          services={meuRanking.servicos}
          categoria={categoriaDoPerfil ?? ""}
          rules={rules}
        />
      )}

      {/* Fecha a secao: a pessoa viu os proprios numeros e os proprios dias, e
          agora leva o resultado embora. Sem perfil nao ha o que compartilhar;
          sem entry (nem um atendimento no periodo) o proprio card se esconde. */}
      {perfil && (
        <CardCompartilhavel
          perfil={perfil}
          entry={meuRanking.entry}
          posicao={meuRanking.posicao}
          rules={rules}
        />
      )}

      <ProfileSelector
        aberto={seletorAberto}
        onFechar={() => setSeletorAberto(false)}
        ativos={activeProfessionals}
        rules={rules}
        perfilId={perfilId}
        onEscolher={escolher}
        onLimpar={limpar}
      />
    </div>
  );
}

export { ResultadosSection };
