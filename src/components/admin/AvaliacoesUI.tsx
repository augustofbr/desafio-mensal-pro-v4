import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTIVO_MAX, erroDoMotivo, normalizarMotivo } from "@/lib/motivoRecusa";

/** Pecas visuais usadas pela fila e pelo historico do painel de aprovacoes. */

export function StatusBadge({ status }: { status: string }) {
  if (status === "aprovada") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 font-body text-xs text-emerald-700 hover:bg-emerald-100">
        Aprovada
      </Badge>
    );
  }
  if (status === "rejeitada") {
    return (
      <Badge className="border-red-200 bg-red-100 font-body text-xs text-red-700 hover:bg-red-100">
        Recusada
      </Badge>
    );
  }
  return (
    <Badge className="border-yellow-200 bg-yellow-100 font-body text-xs text-yellow-700 hover:bg-yellow-100">
      Pendente
    </Badge>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return (
    <div className="py-10 text-center">
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="font-body text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

/** Consulta que falhou. Nunca use `Vazio` no lugar disto: "nenhuma avaliacao"
 *  numa falha esconde trabalho real (ver `estadoDaLista`). */
export function ErroCarregamento({ texto }: { texto: string }) {
  return (
    <div role="alert" className="py-10 text-center">
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-300" aria-hidden="true" />
      </span>
      <p className="font-body text-sm font-semibold text-red-700 dark:text-red-300">{texto}</p>
      <p className="mt-1 font-body text-xs text-muted-foreground">
        Recarregue a página. Se continuar, avise quem administra o sistema.
      </p>
    </div>
  );
}

/** Refetch falhou, mas ainda ha dados em cache: a lista fica, com este aviso. */
export function AvisoDesatualizada() {
  return (
    <p role="status" className="font-body text-xs text-red-700 dark:text-red-300">
      Não foi possível atualizar agora — a lista abaixo pode estar desatualizada.
      Recarregue a página.
    </p>
  );
}

/** `<select>` nativo: no celular abre a roda do proprio sistema, que e mais
 *  rapida de operar com uma mao do que um popover — e nao rouba o scroll da
 *  lista. Aqui so para nao repetir a classe em cinco lugares. */
export function SelectFiltro({
  rotulo,
  valor,
  onChange,
  children,
  className,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      aria-label={rotulo}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-11 w-full rounded-md border border-input bg-background px-3 py-2 font-body text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className,
      )}
    >
      {children}
    </select>
  );
}

/**
 * Confirmacao exigida para o que atinge varias linhas de uma vez, para o que
 * desfaz uma decisao ja tomada e para o que mexe em mes fechado. Aprovar uma
 * avaliacao isolada do mes corrente sai direto: e a tarefa repetitiva do painel,
 * e o caminho de volta e o "Devolver para a fila". Recusar SEMPRE passa por aqui,
 * porque pede o motivo.
 */
export interface Confirmacao {
  acao: "aprovar" | "recusar" | "reverter" | "editar_motivo";
  ids: string[];
  titulo: string;
  descricao: string;
  aviso?: string;
  /** Presente = o dialogo pede um motivo (obrigatorio), comecando em `inicial`. */
  motivo?: { inicial: string };
  /** O texto atual do motivo ainda esta sendo lido: o campo so aparece depois. */
  carregandoMotivo?: boolean;
}

export function ConfirmacaoDialog({
  confirmacao,
  onFechar,
  onConfirmar,
}: {
  confirmacao: Confirmacao | null;
  onFechar: () => void;
  /** `motivo` ja vem sem espacos nas pontas; so e passado quando o dialogo pede um.
   *  A Promise resolve quando a gravacao termina: ate la o botao fica desabilitado e o
   *  dialogo aberto. Quem chama decide se fecha (`onFechar`) — com motivo, so no sucesso,
   *  para o texto digitado nao se perder numa falha. */
  onConfirmar: (motivo?: string) => void | Promise<void>;
}) {
  const pedeMotivo = !!confirmacao?.motivo;
  const carregandoMotivo = !!confirmacao?.carregandoMotivo;
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  // Cada abertura comeca do texto atual (edicao) ou em branco — nunca do que ficou
  // digitado num dialogo anterior que foi cancelado. Uma falha mantem o MESMO objeto
  // `confirmacao`, entao o texto digitado sobrevive a ela.
  useEffect(() => {
    setTexto(confirmacao?.motivo?.inicial ?? "");
    setEnviando(false);
  }, [confirmacao]);

  const erroMotivo = pedeMotivo ? erroDoMotivo(texto) : null;

  const confirmar = async () => {
    setEnviando(true);
    try {
      await onConfirmar(pedeMotivo ? normalizarMotivo(texto) : undefined);
    } finally {
      setEnviando(false);
    }
  };

  return (
    // Durante o envio o dialogo nao fecha (Esc, clique fora ou Cancelar): fechar
    // agora soltaria o texto sem saber se a gravacao deu certo.
    <AlertDialog
      open={!!confirmacao}
      onOpenChange={(aberto) => !aberto && !enviando && onFechar()}
    >
      <AlertDialogContent
        // No celular o teclado abre ja no campo; sem isto o foco cairia no "Cancelar".
        onOpenAutoFocus={(e) => {
          if (!campoRef.current) return;
          e.preventDefault();
          campoRef.current.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading">
            {confirmacao?.titulo}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-body">
            {confirmacao?.descricao}
          </AlertDialogDescription>
          {confirmacao?.aviso && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 font-body text-sm text-amber-900">
              {confirmacao.aviso}
            </p>
          )}
        </AlertDialogHeader>
        {pedeMotivo && carregandoMotivo && (
          <p role="status" className="font-body text-sm text-muted-foreground">
            Carregando o motivo atual…
          </p>
        )}
        {pedeMotivo && !carregandoMotivo && (
          <div className="space-y-1">
            <label
              htmlFor="motivo-recusa"
              className="font-body text-sm font-medium text-gray-700"
            >
              Motivo da recusa (obrigatório)
            </label>
            <Textarea
              id="motivo-recusa"
              ref={campoRef}
              autoFocus
              disabled={enviando}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={MOTIVO_MAX}
              rows={4}
              placeholder="Ex.: a cliente não foi atendida por esta profissional"
              className="font-body text-sm"
            />
            <p
              className={cn(
                "text-right font-mono-num text-xs",
                texto.length >= MOTIVO_MAX ? "text-red-600" : "text-muted-foreground",
              )}
            >
              {texto.length}/{MOTIVO_MAX}
            </p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando} className="font-body">
            Cancelar
          </AlertDialogCancel>
          {/* `Button` e nao `AlertDialogAction`: a Action fecha o dialogo no clique, e
              aqui ele so fecha quando quem chama mandar (ver `onConfirmar`). */}
          <Button
            type="button"
            onClick={() => void confirmar()}
            disabled={enviando || carregandoMotivo || erroMotivo !== null}
            className={cn(
              "font-body",
              confirmacao?.acao === "aprovar"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : confirmacao?.acao === "recusar"
                  ? "bg-red-600 hover:bg-red-700"
                  : "",
            )}
          >
            {enviando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
