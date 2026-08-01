import { useCallback, useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePerfilLocal } from "@/hooks/usePerfilLocal";
import {
  PROF_CATEGORIES,
  getCategoryDisplayName,
  isCategoryActive,
} from "@/lib/categoryDisplayNames";
import { getCategoryRules, type RulesVersion } from "@/lib/rulesConfig";
import { normalizeProfessionalId } from "@/lib/scoring";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";
import CorridaChart from "./CorridaChart";
import MeuCartao from "./MeuCartao";
import ProfileSelector from "./ProfileSelector";

interface ResultadosSectionProps {
  hairData: Record<string, unknown>[];
  manicureData: Record<string, unknown>[];
  esteticaData: Record<string, unknown>[];
  maquiagemData: Record<string, unknown>[];
  rules: RulesVersion;
  activeProfessionals: ProfissionalAtivo[];
}

/** Mesma ordem de categorias do ranking da pagina. */
const ORDEM_CATEGORIAS: string[] = [
  PROF_CATEGORIES.CABELO,
  PROF_CATEGORIES.UNHAS,
  PROF_CATEGORIES.MAQUIAGEM,
  PROF_CATEGORIES.ESTETICA,
];

/** Le um campo numerico do entry; ausente/invalido vira 0. */
function numeroDoEntry(entry: Record<string, unknown>, campo: string): number {
  const valor = entry[campo];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

/**
 * Posicao 1-based do entry dentro do ranking ja ordenado.
 * Empate de pontos repete a posicao (1, 1, 3...) — mesma regra da Corrida.
 */
function posicaoNoRanking(
  entries: Record<string, unknown>[],
  indiceAlvo: number
): number {
  let posicao = 1;
  for (let i = 1; i <= indiceAlvo; i++) {
    if (numeroDoEntry(entries[i], "points") !== numeroDoEntry(entries[i - 1], "points")) {
      posicao = i + 1;
    }
  }
  return posicao;
}

/**
 * Secao "Minha Meta + Corrida": o acompanhamento pessoal do desafio.
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
  const { perfilId, perfil, escolher, limpar } = usePerfilLocal(activeProfessionals);
  const [seletorAberto, setSeletorAberto] = useState(false);
  // null = seguir a categoria do perfil; string = aba escolhida na mao.
  const [abaManual, setAbaManual] = useState<string | null>(null);

  const dadosPorCategoria = useMemo<Record<string, Record<string, unknown>[]>>(
    () => ({
      [PROF_CATEGORIES.CABELO]: hairData,
      [PROF_CATEGORIES.UNHAS]: manicureData,
      [PROF_CATEGORIES.ESTETICA]: esteticaData,
      [PROF_CATEGORIES.MAQUIAGEM]: maquiagemData,
    }),
    [hairData, manicureData, esteticaData, maquiagemData]
  );

  const abas = useMemo(
    () =>
      ORDEM_CATEGORIAS.filter((categoria) => isCategoryActive(rules, categoria)).map(
        (categoria) => ({
          categoria,
          titulo: getCategoryDisplayName(categoria),
          entries: dadosPorCategoria[categoria] ?? [],
          unidade: (getCategoryRules(rules, categoria)?.scoringModel === "revenue-percentage"
            ? "%"
            : "pts") as "pts" | "%",
        })
      ),
    [rules, dadosPorCategoria]
  );

  const categoriaDoPerfil = perfil?.categoria?.trim() ?? null;

  // A aba abre na categoria de quem esta olhando; sem perfil (ou com categoria
  // fora do desafio) cai na primeira ativa.
  const abaPadrao =
    (categoriaDoPerfil && abas.some((aba) => aba.categoria === categoriaDoPerfil)
      ? categoriaDoPerfil
      : abas[0]?.categoria) ?? "";
  const abaAtiva =
    abaManual && abas.some((aba) => aba.categoria === abaManual) ? abaManual : abaPadrao;

  // Entry / posicao / lider do perfil na PROPRIA categoria (mesmo dataset do
  // ranking, sem reordenar).
  const meuRanking = useMemo(() => {
    const semDados = { entry: null, posicao: null, liderPontos: null };
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

    // Zerado no periodo = sem atendimento, nao "1o lugar". Com o mes inteiro em
    // zero a ordem do array decidiria a lideranca, e o cartao coroaria quem
    // simplesmente veio primeiro na lista.
    if (numeroDoEntry(entries[indice], "points") <= 0) {
      return { entry: null, posicao: null, liderPontos };
    }

    return {
      entry: entries[indice],
      posicao: posicaoNoRanking(entries, indice),
      liderPontos,
    };
  }, [perfilId, categoriaDoPerfil, dadosPorCategoria]);

  // ProfileSelector ja fecha sozinho ao escolher/limpar; aqui so zeramos a aba
  // manual para a Corrida voltar a seguir a categoria do novo perfil.
  const aoEscolher = useCallback(
    (id: string) => {
      escolher(id);
      setAbaManual(null);
    },
    [escolher]
  );

  const aoLimpar = useCallback(() => {
    limpar();
    setAbaManual(null);
  }, [limpar]);

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

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">Quem está na frente</h2>
            <p className="text-base text-muted-foreground">
              Toda a equipe da categoria, do primeiro ao último.
            </p>
          </div>

          {abas.length === 0 ? (
            <p className="py-6 text-center text-base text-muted-foreground">
              Nenhuma categoria participa do desafio neste período.
            </p>
          ) : (
            <Tabs value={abaAtiva} onValueChange={setAbaManual} className="w-full">
              {/* h-auto + min-h nos gatilhos: o padrao do shadcn tem 36px de
                  altura, abaixo do alvo de toque de 44px do celular. */}
              <TabsList
                className="grid h-auto w-full"
                style={{ gridTemplateColumns: `repeat(${abas.length}, minmax(0, 1fr))` }}
              >
                {abas.map((aba) => (
                  <TabsTrigger
                    key={aba.categoria}
                    value={aba.categoria}
                    className="min-h-[44px] text-base"
                  >
                    {aba.titulo}
                  </TabsTrigger>
                ))}
              </TabsList>

              {abas.map((aba) => (
                <TabsContent key={aba.categoria} value={aba.categoria} className="mt-4">
                  <CorridaChart
                    entries={aba.entries}
                    perfilId={perfilId}
                    unidade={aba.unidade}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <ProfileSelector
        aberto={seletorAberto}
        onFechar={() => setSeletorAberto(false)}
        ativos={activeProfessionals}
        rules={rules}
        perfilId={perfilId}
        onEscolher={aoEscolher}
        onLimpar={aoLimpar}
      />
    </div>
  );
}

export { ResultadosSection };
