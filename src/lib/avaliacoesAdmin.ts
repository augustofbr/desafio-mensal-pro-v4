import type { AvaliacaoAdmin } from "@/hooks/useAdminAvaliacoes";
import { normalizarBusca } from "@/lib/clienteTrinks";

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

/**
 * Busca por cliente: casa o termo contra o nome do GOOGLE e o do TRINKS, sem
 * acento e sem diferenciar caixa. Termo vazio casa tudo. O nome do Trinks e
 * NULL em todo cadastro legado — nesse caso so o do Google conta.
 */
export function casaBuscaCliente(
  a: Pick<AvaliacaoAdmin, "nome_cliente" | "nome_cliente_trinks">,
  termo: string,
): boolean {
  const alvo = normalizarBusca(termo);
  if (!alvo) return true;
  return (
    normalizarBusca(a.nome_cliente ?? "").includes(alvo) ||
    normalizarBusca(a.nome_cliente_trinks ?? "").includes(alvo)
  );
}

/** 'YYYY-MM-DD' -> 'DD/MM'. Fatia a string: `new Date('2026-10-16')` e UTC e
 *  mostraria o dia anterior em Manaus. Formato inesperado -> "". */
export function dataCurta(dia: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia ?? "");
  return m ? `${m[3]}/${m[2]}` : "";
}

/**
 * Segunda linha do card: o que a cliente (ou a recepcao) informou como nome no
 * Trinks, e o dia do atendimento. Cadastro legado nao tem nada disso.
 */
export function linhaTrinks(
  a: Pick<
    AvaliacaoAdmin,
    "nome_cliente_trinks" | "origem_cliente_trinks" | "data_atendimento"
  >,
): string {
  const nome = (a.nome_cliente_trinks ?? "").trim();
  if (!nome) return "Trinks: — (cadastro antigo)";
  const origem = a.origem_cliente_trinks === "digitado" ? " (digitado à mão)" : "";
  const dia = dataCurta(a.data_atendimento);
  return `Trinks: ${nome}${origem}${dia ? ` · ${dia}` : ""}`;
}

/** Status de uma estrela, por extenso e no feminino do resto da tela. */
export function statusPorExtenso(status: string): string {
  switch (status) {
    case "aprovada":
      return "aprovada";
    case "rejeitada":
      return "recusada";
    case "pendente":
      return "pendente";
    default:
      return status;
  }
}

// --- Sinais da fila (RPC `avaliacoes_sinais`) --------------------------------

export type EstadoAtendida =
  | "atendida"
  | "provavel"
  | "aguardando_espelho"
  | "nao_encontrada";

export interface DuplicataAvaliacao {
  id: string;
  nome_profissional: string;
  nome_cliente: string;
  status: string;
  data_hora_cadastro: string;
}

/** Uma linha da RPC, com `duplicatas` ja tipado (nunca null). */
export interface SinalAvaliacao {
  avaliacao_id: string;
  atendida: EstadoAtendida;
  atendida_nome: string | null;
  /** 'YYYY-MM-DD' */
  atendida_data: string | null;
  atendida_servico: string | null;
  duplicatas: DuplicataAvaliacao[];
}

/** A RPC limita a 300 ids por chamada (erro 22023 acima disso). */
export const LIMITE_IDS_SINAIS = 300;

/**
 * Ids que vao para a RPC. A fila chega da mais antiga para a mais nova; acima do
 * teto ficam de fora as MAIS NOVAS (a mais antiga e a que o admin ve primeiro).
 * Quem ficou de fora simplesmente nao mostra selos.
 */
export function idsParaSinais(ids: string[]): string[] {
  return ids.slice(0, LIMITE_IDS_SINAIS);
}

export function normalizarSinal(linha: SinalAvaliacao): SinalAvaliacao {
  return {
    ...linha,
    duplicatas: Array.isArray(linha.duplicatas) ? linha.duplicatas : [],
  };
}

export type TomSelo = "verde" | "ambar" | "cinza" | "vermelho";

/** Texto e cor do selo "Atendida?". `detalhe` vazio = so o titulo. */
export function rotuloAtendida(
  s: Pick<
    SinalAvaliacao,
    "atendida" | "atendida_nome" | "atendida_data" | "atendida_servico"
  >,
): { titulo: string; detalhe: string; tom: TomSelo } {
  const partes = [
    (s.atendida_nome ?? "").trim(),
    dataCurta(s.atendida_data),
    (s.atendida_servico ?? "").trim(),
  ].filter(Boolean);
  switch (s.atendida) {
    case "atendida":
      return { titulo: "Atendida", detalhe: partes.join(" · "), tom: "verde" };
    case "provavel":
      // Servico fica de fora: a cliente e so "parecida", listar o que ela fez
      // reforcaria uma certeza que o sinal nao tem.
      return {
        titulo: "Provável",
        detalhe: partes.slice(0, 2).join(" · "),
        tom: "ambar",
      };
    case "aguardando_espelho":
      return {
        titulo: "Aguardando espelho",
        detalhe: "a comanda pode não ter fechado ainda",
        tom: "cinza",
      };
    default:
      return { titulo: "Não encontrada", detalhe: "", tom: "vermelho" };
  }
}

/**
 * Teto de duplicatas por estrela devolvido por `avaliacoes_sinais` (`limit 5` na
 * RPC). Com exatamente esse numero, pode haver mais — a tela mostra "5+".
 */
export const LIMITE_DUPLICATAS = 5;

export function rotuloContagemDuplicatas(n: number): string {
  return n >= LIMITE_DUPLICATAS ? `${LIMITE_DUPLICATAS}+` : String(n);
}

export type EstadoLista = "carregando" | "erro" | "vazio" | "lista" | "lista_desatualizada";

/**
 * O que uma lista carregada do banco deve mostrar. Erro vence "vazio" de
 * proposito: uma consulta que falhou (rede, RLS, bundle novo antes da migracao)
 * nunca pode aparecer como "nenhuma avaliacao" — isso esconde trabalho real.
 * Se a falha foi de um REFETCH e ainda ha dados em cache, a lista continua na
 * tela, mas marcada como possivelmente desatualizada.
 */
export function estadoDaLista(q: {
  isLoading: boolean;
  isError: boolean;
  total: number;
}): EstadoLista {
  if (q.isLoading) return "carregando";
  if (q.isError) return q.total === 0 ? "erro" : "lista_desatualizada";
  return q.total === 0 ? "vazio" : "lista";
}

/**
 * Texto do contador da aba "Aprovacoes". `null` = nao mostrar nada. Consulta
 * que falhou mostra "!", nunca 0 nem sumir como se a fila estivesse vazia.
 */
export function rotuloContadorPendentes(q: {
  isLoading: boolean;
  isError: boolean;
  total: number;
}): string | null {
  if (q.isError) return "!";
  if (q.isLoading || q.total === 0) return null;
  return String(q.total);
}
