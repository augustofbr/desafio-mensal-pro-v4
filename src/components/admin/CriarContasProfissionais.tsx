import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authAdmin } from "@/auth/authAdmin";
import {
  assinarLote,
  encerrarLote,
  iniciarLote,
  loteEmAndamento,
} from "@/lib/loteEmAndamento";
import { supabase } from "@/lib/supabase";
import { PROF_CATEGORY_DISPLAY_NAMES } from "@/lib/categoryDisplayNames";
import {
  acharPerfilId,
  perfilSugerido,
  PERFIS_DA_CRIACAO,
  type PerfilDaCriacao,
} from "@/lib/perfilSugerido";
import {
  classificarResultado,
  contarResultados,
  marcadasEfetivas,
  normalizarLinha,
  resumoDoLote,
  separarParaConfirmacao,
  type LinhaSemConta,
  type ResultadoCriacao,
} from "@/lib/criarContasProfissionais";

export const CHAVE_SEM_CONTA = ["destaque_profissionais_sem_conta"] as const;

const AVISO_OUTRO_APP =
  "Essas pessoas já têm senha em outro app. Ao liberar o acesso, quem souber a senha entra no Destaque. Confirme com a pessoa antes.";

type Props = {
  /** Perfis de `destaque_perfis` (o `perfilId` sai do id da linha, pelo nome). */
  perfis: ReadonlyArray<{ id: string; nome: string }>;
  /** Chamado ao fim do lote, para a lista de usuários da tela recarregar. */
  onFeito?: () => void;
};

type ItemDoLote = { linha: LinhaSemConta; perfil: PerfilDaCriacao; resultado: ResultadoCriacao };

function rotuloLinha(l: LinhaSemConta): string {
  return l.apelido?.trim() || l.nome_profissional;
}

/**
 * Seção "Criar contas das profissionais" da tela de usuários (só com `usuarios: write`).
 * Cria uma a uma, em sequência: a falha de uma não para as outras. Nunca chama a edge
 * function sem a confirmação do dono.
 */
export function CriarContasProfissionais({ perfis, onFeito }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: CHAVE_SEM_CONTA,
    queryFn: async (): Promise<LinhaSemConta[]> => {
      const { data: rows, error: err } = await supabase.rpc("destaque_profissionais_sem_conta");
      if (err) throw err;
      return ((rows as Parameters<typeof normalizarLinha>[0][] | null) ?? []).map(normalizarLinha);
    },
    refetchOnWindowFocus: false,
  });
  const linhas = useMemo(() => data ?? [], [data]);

  // Só o que o dono mexeu fica guardado; o resto vem do padrão (`marcadasEfetivas`: marcada se
  // não tem login em outro app; perfil pela categoria). Assim a lista recarregada não precisa
  // de efeito.
  const [marcaManual, setMarcaManual] = useState<Record<number, boolean>>({});
  const [perfilManual, setPerfilManual] = useState<Record<number, PerfilDaCriacao>>({});
  const perfilDe = (l: LinhaSemConta) => perfilManual[l.profissionalId] ?? perfilSugerido(l.categoria);

  const [confirmando, setConfirmando] = useState(false);
  // O estado do lote vive fora do componente: trocar de aba desmonta a seção, o loop segue, e
  // a seção remontada precisa saber que há um lote rodando.
  const executando = useSyncExternalStore(assinarLote, loteEmAndamento, loteEmAndamento);
  const [atual, setAtual] = useState<number | null>(null);
  // Resultado por profissional: as que falharam seguem na lista e mostram o motivo; as que deram
  // certo ficam registradas para não entrarem de novo num lote enquanto a lista não recarrega.
  const [resultados, setResultados] = useState<Record<number, ResultadoCriacao>>({});
  const [lote, setLote] = useState<{ itens: ItemDoLote[]; resumo: string } | null>(null);

  const jaCriadas = useMemo(
    () =>
      new Set(
        Object.entries(resultados)
          .filter(([, r]) => r.tipo === "convite" || r.tipo === "ja_tinha_conta")
          .map(([id]) => Number(id)),
      ),
    [resultados],
  );
  const marcadas = useMemo(
    () => marcadasEfetivas(linhas, marcaManual, jaCriadas),
    [linhas, marcaManual, jaCriadas],
  );
  const { novas, existentes } = useMemo(() => separarParaConfirmacao(linhas, marcadas), [linhas, marcadas]);

  const perfilIdDe = (l: LinhaSemConta) => acharPerfilId(perfis, perfilDe(l));
  const perfisFaltando = PERFIS_DA_CRIACAO.filter((p) => acharPerfilId(perfis, p) === null);
  const totalMarcadas = marcadas.size;
  const podeCriar = !executando && totalMarcadas > 0 && perfis.length > 0;

  const criar = async () => {
    // Trava síncrona (fora do componente): o duplo clique e o lote de antes de uma troca de
    // aba não abrem um segundo lote.
    if (!iniciarLote()) return;
    const alvo = linhas.filter((l) => marcadas.has(l.profissionalId));
    setConfirmando(false);
    setLote(null);
    // Mantém só o que deu certo; as falhas do lote anterior serão tentadas de novo.
    setResultados((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([, r]) => r.tipo === "convite" || r.tipo === "ja_tinha_conta"),
      ),
    );
    const itens: ItemDoLote[] = [];
    try {
      for (const l of alvo) {
        setAtual(l.profissionalId);
        const perfil = perfilDe(l);
        const perfilId = perfilIdDe(l);
        let resultado: ResultadoCriacao;
        if (!perfilId) {
          resultado = { tipo: "erro", mensagem: `Perfil "${perfil}" não encontrado.` };
        } else {
          try {
            resultado = classificarResultado(
              await authAdmin("criar_usuario", {
                nome: l.nome_profissional.trim(),
                email: l.email,
                perfilId,
              }),
            );
          } catch (e) {
            resultado = {
              tipo: "erro",
              mensagem: e instanceof Error ? e.message : "Falha inesperada.",
            };
          }
        }
        itens.push({ linha: l, perfil, resultado });
        setResultados((prev) => ({ ...prev, [l.profissionalId]: resultado }));
      }
    } finally {
      setAtual(null);
      setLote({ itens, resumo: resumoDoLote(contarResultados(itens.map((i) => i.resultado))) });
      try {
        // As que deram certo saem da lista; as que falharam ficam para uma nova tentativa. O
        // lote só termina depois do refetch, senão uma criada ainda apareceria marcada.
        await queryClient.invalidateQueries({ queryKey: CHAVE_SEM_CONTA });
        onFeito?.();
      } finally {
        encerrarLote();
      }
    }
  };

  return (
    <section
      aria-labelledby="criar-contas-titulo"
      className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <header className="mb-3 flex flex-col gap-1">
        <h2 id="criar-contas-titulo" className="text-base font-semibold tracking-tight">
          Criar contas das profissionais
        </h2>
        <p className="text-sm text-muted-foreground">
          Profissionais ativas com e-mail cadastrado e ainda sem acesso. Cada conta recebe um convite
          por e-mail; quem já tem conta no Supabase só tem o acesso liberado, sem convite.
        </p>
      </header>

      {executando ? (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          Um lote está em andamento… Aguarde terminar antes de criar outras contas.
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : isError ? (
        <div role="alert" className="text-sm text-destructive">
          Falha ao carregar as profissionais: {error instanceof Error ? error.message : "erro desconhecido"}
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma profissional pendente de conta.</p>
      ) : (
        <>
          {perfisFaltando.length > 0 && perfis.length > 0 ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              Perfil não encontrado em Perfis: {perfisFaltando.join(", ")}. As linhas com esse perfil
              vão falhar.
            </p>
          ) : null}

          <ul className="flex flex-col divide-y divide-border">
            {linhas.map((l) => {
              const res = resultados[l.profissionalId];
              const categoria = l.categoria
                ? (PROF_CATEGORY_DISPLAY_NAMES[l.categoria.trim()] ?? l.categoria)
                : "Sem categoria";
              const idCampo = `conta-${l.profissionalId}`;
              return (
                <li
                  key={l.profissionalId}
                  className="grid gap-x-4 gap-y-2 py-3 md:grid-cols-[auto_1fr_auto] md:items-start"
                >
                  <Checkbox
                    id={idCampo}
                    className="mt-1"
                    checked={marcadas.has(l.profissionalId)}
                    disabled={executando}
                    onCheckedChange={(v) =>
                      setMarcaManual((prev) => ({ ...prev, [l.profissionalId]: v === true }))
                    }
                    aria-label={`Criar conta de ${rotuloLinha(l)}`}
                  />
                  <div className="min-w-0 text-sm">
                    <label htmlFor={idCampo} className="font-medium">
                      {rotuloLinha(l)}
                      {l.apelido?.trim() && l.apelido.trim() !== l.nome_profissional ? (
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({l.nome_profissional})
                        </span>
                      ) : null}
                    </label>
                    <div className="truncate text-xs text-muted-foreground">{l.email}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{categoria}</Badge>
                      <Badge variant={l.vincula_automatico ? "secondary" : "outline"}>
                        {l.vincula_automatico ? "liga ao cadastro" : "sem ligação"}
                      </Badge>
                    </div>
                    {l.ja_tem_login ? (
                      <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                        Já tem login em outro app
                        {!l.vincula_automatico ? " — será criada sem ligação ao cadastro" : ""}.
                      </p>
                    ) : null}
                    {atual === l.profissionalId ? (
                      <p role="status" className="mt-1.5 text-xs text-muted-foreground">
                        Criando…
                      </p>
                    ) : res ? (
                      <p
                        role={res.tipo === "convite" || res.tipo === "ja_tinha_conta" ? "status" : "alert"}
                        className={
                          res.tipo === "convite" || res.tipo === "ja_tinha_conta"
                            ? "mt-1.5 text-xs text-muted-foreground"
                            : "mt-1.5 text-xs text-destructive"
                        }
                      >
                        {res.mensagem}
                      </p>
                    ) : null}
                  </div>
                  <div className="md:w-40">
                    <Select
                      value={perfilDe(l)}
                      disabled={executando}
                      onValueChange={(v) =>
                        setPerfilManual((prev) => ({
                          ...prev,
                          [l.profissionalId]: v as PerfilDaCriacao,
                        }))
                      }
                    >
                      <SelectTrigger aria-label={`Perfil de ${rotuloLinha(l)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERFIS_DA_CRIACAO.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex justify-end">
            <Button disabled={!podeCriar} onClick={() => setConfirmando(true)}>
              {executando
                ? "Criando…"
                : totalMarcadas === 1
                  ? "Criar 1 conta"
                  : `Criar ${totalMarcadas} contas`}
            </Button>
          </div>
        </>
      )}

      {lote ? (
        <div role="status" className="mt-4 rounded-xl border border-border bg-background p-3 text-sm">
          <p className="font-medium">{lote.resumo}</p>
          {lote.itens.some((i) => i.resultado.tipo === "limite_email" || i.resultado.tipo === "erro") ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {isError
                ? "Não foi possível recarregar a lista. Use \"Tentar de novo\" acima para ver quem falhou e tentar outra vez."
                : "As que falharam continuam na lista acima para uma nova tentativa."}
            </p>
          ) : null}
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {lote.itens.map((i) => (
              <li key={i.linha.profissionalId}>
                <span className="font-medium">{rotuloLinha(i.linha)}</span>{" "}
                <span className="text-muted-foreground">({i.perfil})</span>:{" "}
                <span
                  className={
                    i.resultado.tipo === "convite" || i.resultado.tipo === "ja_tinha_conta"
                      ? "text-muted-foreground"
                      : "text-destructive"
                  }
                >
                  {i.resultado.mensagem}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AlertDialog open={confirmando} onOpenChange={(aberto) => !aberto && setConfirmando(false)}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {totalMarcadas === 1 ? "Criar 1 conta?" : `Criar ${totalMarcadas} contas?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cada conta nova recebe um convite por e-mail. As contas serão criadas uma a uma.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {novas.length > 0 ? (
            <div className="text-sm">
              <p className="mb-1 font-medium">Convite por e-mail ({novas.length})</p>
              <ul className="flex flex-col gap-0.5 text-xs">
                {novas.map((l) => (
                  <li key={l.profissionalId}>
                    {l.email} <span className="text-muted-foreground">({perfilDe(l)})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {existentes.length > 0 ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <p className="mb-1 font-medium">Já têm login em outro app ({existentes.length})</p>
              <p className="mb-2 text-xs">{AVISO_OUTRO_APP}</p>
              <ul className="flex flex-col gap-0.5 text-xs">
                {existentes.map((l) => (
                  <li key={l.profissionalId}>
                    {l.email} <span>({perfilDe(l)})</span>
                    {!l.vincula_automatico ? " — sem ligação ao cadastro" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={executando} onClick={() => void criar()}>
              {totalMarcadas === 1 ? "Criar 1 conta" : `Criar ${totalMarcadas} contas`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
