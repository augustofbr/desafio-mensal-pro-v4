import { CircleCheck, CircleHelp, Copy, Hourglass, SearchX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mesPorExtensoManaus } from "@/lib/dateUtils";
import {
  rotuloAtendida,
  statusPorExtenso,
  type EstadoAtendida,
  type SinalAvaliacao,
  type TomSelo,
} from "@/lib/avaliacoesAdmin";

/**
 * Selos de conferência da fila de aprovação: "Atendida?" (cruza com o espelho do
 * Trinks) e "Possível duplicata". São AVISOS para quem decide — nunca bloqueiam
 * aprovar ou recusar, então o tom é informativo, não de alarme.
 */

const ICONE: Record<EstadoAtendida, LucideIcon> = {
  atendida: CircleCheck,
  provavel: CircleHelp,
  aguardando_espelho: Hourglass,
  nao_encontrada: SearchX,
};

// Cor nunca é o único sinal: todo selo tem ícone e texto.
const TOM: Record<TomSelo, string> = {
  verde:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  ambar:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  cinza:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  vermelho:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
};

function Selo({
  tom,
  Icone,
  titulo,
  detalhe,
}: {
  tom: TomSelo;
  Icone: LucideIcon;
  titulo: string;
  detalhe?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-start gap-1.5 rounded-xl border px-2.5 py-1 font-body text-xs leading-snug",
        TOM[tom],
      )}
    >
      <Icone className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="font-semibold">{titulo}</span>
        {detalhe ? <span> — {detalhe}</span> : null}
      </span>
    </span>
  );
}

export function SinaisAvaliacao({ sinal }: { sinal?: SinalAvaliacao }) {
  // Sem sinal (carregando, ou id fora do teto da RPC): nada, o card segue inteiro.
  if (!sinal) return null;

  const atendida = rotuloAtendida(sinal);
  const duplicatas = sinal.duplicatas;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-start gap-1.5">
        <Selo
          tom={atendida.tom}
          Icone={ICONE[sinal.atendida] ?? SearchX}
          titulo={atendida.titulo}
          detalhe={atendida.detalhe}
        />
      </div>

      {duplicatas.length > 0 && (
        <details className="group rounded-xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 px-2.5 font-body text-xs font-semibold [&::-webkit-details-marker]:hidden">
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Possível duplicata ({duplicatas.length})
            <span className="ml-auto font-normal underline group-open:hidden">ver</span>
          </summary>
          <ul className="space-y-1 px-2.5 pb-2.5 font-body text-xs">
            {duplicatas.map((d) => (
              <li key={d.id} className="leading-snug">
                <span className="font-semibold">{d.nome_cliente}</span>
                {" — "}
                {d.nome_profissional}, {mesPorExtensoManaus(d.data_hora_cadastro)},{" "}
                {statusPorExtenso(d.status)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
