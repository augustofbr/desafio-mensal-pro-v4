import { Badge } from "@/components/ui/badge";
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
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

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
 * desfaz uma decisao ja tomada e para o que mexe em mes fechado. Aprovar/
 * recusar uma avaliacao isolada do mes corrente sai direto: e a tarefa
 * repetitiva do painel, e o caminho de volta e o "Devolver para a fila".
 */
export interface Confirmacao {
  acao: "aprovar" | "recusar" | "reverter";
  ids: string[];
  titulo: string;
  descricao: string;
  aviso?: string;
}

export function ConfirmacaoDialog({
  confirmacao,
  onFechar,
  onConfirmar,
}: {
  confirmacao: Confirmacao | null;
  onFechar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <AlertDialog open={!!confirmacao} onOpenChange={(aberto) => !aberto && onFechar()}>
      <AlertDialogContent>
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
        <AlertDialogFooter>
          <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmar}
            className={cn(
              "font-body",
              confirmacao?.acao === "aprovar"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : confirmacao?.acao === "recusar"
                  ? "bg-red-600 hover:bg-red-700"
                  : "",
            )}
          >
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
