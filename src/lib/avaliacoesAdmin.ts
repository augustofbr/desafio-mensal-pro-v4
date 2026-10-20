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

/**
 * Texto do erro para o toast. O postgrest-js entrega `error` como objeto simples
 * (`{ message, code, details, hint }`), NAO como `Error` — com `String(erro)` o toast
 * mostrava "[object Object]" e escondia, por exemplo, o 23514 "Informe o motivo da
 * recusa.". Vale qualquer objeto com `message` em texto.
 */
export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === "object" && erro !== null) {
    const { message } = erro as { message?: unknown };
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return String(erro);
}

/**
 * Mensagem de uma decisao em lote que gravou so parte das linhas: as demais ja
 * tinham sido decididas por outra pessoa (o UPDATE so atinge `pendente`).
 */
export function mensagemDecisaoParcial(
  status: "aprovada" | "rejeitada",
  gravadas: number,
  pedidas: number,
): string {
  const feitas = status === "aprovada" ? "aprovadas" : "recusadas";
  const restantes = pedidas - gravadas;
  return (
    `${gravadas} de ${pedidas} avaliações foram ${feitas}. ` +
    `${plural(
      restantes,
      "avaliação já tinha sido decidida",
      "avaliações já tinham sido decididas",
    )} por outra pessoa e ${restantes === 1 ? "não foi alterada" : "não foram alteradas"}.`
  );
}

/**
 * Lancado por `decidir` quando o UPDATE gravou ALGUMAS das linhas (nao todas, nem
 * nenhuma). Diferente de erro de banco/rede: parte do lote ja foi gravada, entao
 * repetir com os mesmos ids so erra de novo — quem captura fecha o dialogo, tira TODOS os
 * ids do lote da selecao (nenhum segue pendente) e avisa as contagens.
 */
export class DecisaoParcialError extends Error {
  constructor(
    readonly status: "aprovada" | "rejeitada",
    readonly gravadas: string[],
    readonly pedidas: number,
  ) {
    super(mensagemDecisaoParcial(status, gravadas.length, pedidas));
    this.name = "DecisaoParcialError";
  }
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

/**
 * Busca do HISTORICO: cliente (Google ou Trinks), profissional OU o texto do
 * motivo da recusa. `motivo` e `undefined`/`null` quando a avaliacao foi aprovada,
 * e a recusa legada ou ainda sem motivo carregado — nesses casos so os outros dois
 * campos contam. Termo vazio casa tudo.
 */
export function casaBuscaHistorico(
  a: Pick<
    AvaliacaoAdmin,
    "nome_cliente" | "nome_cliente_trinks" | "nome_profissional"
  >,
  termo: string,
  motivo?: string | null,
): boolean {
  const alvo = normalizarBusca(termo);
  if (!alvo) return true;
  return (
    casaBuscaCliente(a, termo) ||
    normalizarBusca(a.nome_profissional ?? "").includes(alvo) ||
    normalizarBusca(motivo ?? "").includes(alvo)
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

/**
 * Por que a RPC apontou a duplicata: 'nome_google' (nome do Google igual, parecido
 * ou de grafia parecida) ou 'nome_trinks' (so o nome do Trinks desta estrela bate
 * com o nome do Google da outra) ou 'mesma_cliente_trinks' (as duas estrelas apontam a
 * mesma cliente no Trinks, por id ou, sem id, pelo nome). Opcional: o app pode ir ao ar
 * antes das migracoes 20261019180000 e 20261019190000, e a RPC antiga nao devolve o campo
 * (nem o motivo novo).
 */
export type MotivoDuplicata = "nome_google" | "nome_trinks" | "mesma_cliente_trinks";

export interface DuplicataAvaliacao {
  id: string;
  nome_profissional: string;
  nome_cliente: string;
  status: string;
  data_hora_cadastro: string;
  motivo?: MotivoDuplicata;
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

/** Trecho extra do item de duplicata para os motivos do Trinks; vazio nos demais casos. */
export function rotuloMotivoDuplicata(motivo?: MotivoDuplicata | null): string {
  switch (motivo) {
    case "nome_trinks":
      return " · o nome do Google dela bate com o nome do Trinks desta estrela";
    case "mesma_cliente_trinks":
      return " · Mesma cliente no Trinks. Possível duplicata.";
    default:
      return "";
  }
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
