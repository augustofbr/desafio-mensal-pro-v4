import type { AvaliacaoAdmin } from "@/hooks/useAdminAvaliacoes";

/**
 * Helpers puros compartilhados pelos dois blocos do painel de aprovacoes
 * (a fila `AvaliacoesManager` e o `HistoricoDecisoes`). Sem React aqui: a
 * ordenacao e testavel isolada e nao precisa de DOM.
 */

export type Ordenacao =
  | "mais_antiga"
  | "mais_recente"
  | "profissional_az"
  | "profissional_za"
  | "cliente_az"
  | "cliente_za";

/** Rotulos da FILA: ali "mais antiga" quer dizer "esperando ha mais tempo". */
export const ORDENACOES_FILA: { valor: Ordenacao; rotulo: string }[] = [
  { valor: "mais_antiga", rotulo: "Mais antigas primeiro" },
  { valor: "mais_recente", rotulo: "Mais recentes primeiro" },
  { valor: "profissional_az", rotulo: "Profissional (A-Z)" },
  { valor: "profissional_za", rotulo: "Profissional (Z-A)" },
  { valor: "cliente_az", rotulo: "Cliente (A-Z)" },
  { valor: "cliente_za", rotulo: "Cliente (Z-A)" },
];

/** Rotulos do HISTORICO: la existem duas datas (cadastro e decisao), entao
 *  "mais recente" sozinho seria ambiguo — a ordem e sempre a de CADASTRO. */
export const ORDENACOES_HISTORICO: { valor: Ordenacao; rotulo: string }[] = [
  { valor: "mais_recente", rotulo: "Cadastro mais recente" },
  { valor: "mais_antiga", rotulo: "Cadastro mais antigo" },
  { valor: "profissional_az", rotulo: "Profissional (A-Z)" },
  { valor: "profissional_za", rotulo: "Profissional (Z-A)" },
  { valor: "cliente_az", rotulo: "Cliente (A-Z)" },
  { valor: "cliente_za", rotulo: "Cliente (Z-A)" },
];

/** Ordena por copia — a lista de origem vem do cache do React Query. */
export function ordenar<T extends Pick<
  AvaliacaoAdmin,
  "data_hora_cadastro" | "nome_profissional" | "nome_cliente"
>>(lista: T[], modo: Ordenacao): T[] {
  const tempo = (a: T) => new Date(a.data_hora_cadastro).getTime();
  const copia = [...lista];
  copia.sort((a, b) => {
    switch (modo) {
      case "mais_recente":
        return tempo(b) - tempo(a);
      case "mais_antiga":
        return tempo(a) - tempo(b);
      case "profissional_az":
        return a.nome_profissional.localeCompare(b.nome_profissional, "pt-BR");
      case "profissional_za":
        return b.nome_profissional.localeCompare(a.nome_profissional, "pt-BR");
      case "cliente_az":
        return a.nome_cliente.localeCompare(b.nome_cliente, "pt-BR");
      case "cliente_za":
        return b.nome_cliente.localeCompare(a.nome_cliente, "pt-BR");
      default:
        return 0;
    }
  });
  return copia;
}

export function inicial(nome: string): string {
  return (Array.from(String(nome ?? "").trim())[0] ?? "?").toUpperCase();
}

export function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** "1 avaliação" / "3 avaliações" — o caso de 1 é o comum aqui (fila pequena),
 *  e "1 avaliação(ões) são" fica ruim justamente no caso mais frequente. */
export function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`;
}
