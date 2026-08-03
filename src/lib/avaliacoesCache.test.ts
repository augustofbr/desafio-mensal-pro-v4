import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { removerDoCache, restaurarCache } from "./avaliacoesCache";
import type { AvaliacaoAdmin } from "@/hooks/useAdminAvaliacoes";

const PREFIXO = ["admin_avaliacoes", "historico"] as const;

/** Chave real do historico: prefixo + os limites do periodo. */
const chave = (inicio: string, fim: string) => [...PREFIXO, inicio, fim];

function avaliacao(id: string): AvaliacaoAdmin {
  return {
    id,
    profissional_id: 1,
    nome_profissional: "Debora",
    nome_cliente: `Cliente ${id}`,
    status: "aprovada",
    data_hora_cadastro: "2026-08-01T18:00:00Z",
    aprovado_por: "admin",
    data_aprovacao: "2026-08-01T19:00:00Z",
  };
}

function novoClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

const ids = (lista?: AvaliacaoAdmin[]) => lista?.map((a) => a.id);

describe("removerDoCache", () => {
  it("remove a linha da entrada do periodo que esta na tela", async () => {
    const qc = novoClient();
    const agosto = chave("2026-08-01T04:00:00.000Z", "2026-09-01T04:00:00.000Z");
    qc.setQueryData(agosto, [avaliacao("a"), avaliacao("b"), avaliacao("c")]);

    await removerDoCache(qc, PREFIXO, ["b"]);

    expect(ids(qc.getQueryData(agosto))).toEqual(["a", "c"]);
  });

  it("alcanca TODAS as entradas de periodo em cache, nao so a ultima buscada", async () => {
    // Este e o ponto do prefixo: o admin pode ter visto agosto e depois marco;
    // a mutacao nao sabe qual esta na tela.
    const qc = novoClient();
    const agosto = chave("2026-08-01T04:00:00.000Z", "2026-09-01T04:00:00.000Z");
    const marco = chave("2026-03-01T04:00:00.000Z", "2026-04-01T04:00:00.000Z");
    qc.setQueryData(agosto, [avaliacao("a"), avaliacao("x")]);
    qc.setQueryData(marco, [avaliacao("x"), avaliacao("z")]);

    await removerDoCache(qc, PREFIXO, ["x"]);

    expect(ids(qc.getQueryData(agosto))).toEqual(["a"]);
    expect(ids(qc.getQueryData(marco))).toEqual(["z"]);
  });

  it("remove varias de uma vez (decisao em lote)", async () => {
    const qc = novoClient();
    const k = chave("i", "f");
    qc.setQueryData(k, [avaliacao("a"), avaliacao("b"), avaliacao("c")]);

    await removerDoCache(qc, PREFIXO, ["a", "c"]);

    expect(ids(qc.getQueryData(k))).toEqual(["b"]);
  });

  it("nao materializa lista vazia para periodo que nunca foi buscado", async () => {
    const qc = novoClient();
    await removerDoCache(qc, PREFIXO, ["a"]);
    expect(qc.getQueryData(chave("i", "f"))).toBeUndefined();
  });

  it("nao encosta em outras chaves do painel (a fila de pendentes)", async () => {
    const qc = novoClient();
    const pendentes = ["admin_avaliacoes", "pendentes"];
    qc.setQueryData(pendentes, [avaliacao("p")]);
    qc.setQueryData(chave("i", "f"), [avaliacao("p")]);

    await removerDoCache(qc, PREFIXO, ["p"]);

    expect(ids(qc.getQueryData(pendentes))).toEqual(["p"]);
    expect(ids(qc.getQueryData(chave("i", "f")))).toEqual([]);
  });

  it("id inexistente nao muda nada", async () => {
    const qc = novoClient();
    const k = chave("i", "f");
    qc.setQueryData(k, [avaliacao("a")]);

    await removerDoCache(qc, PREFIXO, ["nao-existe"]);

    expect(ids(qc.getQueryData(k))).toEqual(["a"]);
  });
});

describe("restaurarCache", () => {
  it("devolve a linha quando o servidor recusa a escrita", async () => {
    const qc = novoClient();
    const k = chave("2026-08-01T04:00:00.000Z", "2026-09-01T04:00:00.000Z");
    qc.setQueryData(k, [avaliacao("a"), avaliacao("b")]);

    const snapshot = await removerDoCache(qc, PREFIXO, ["b"]);
    expect(ids(qc.getQueryData(k))).toEqual(["a"]);

    restaurarCache(qc, snapshot);

    expect(ids(qc.getQueryData(k))).toEqual(["a", "b"]);
  });

  it("restaura todos os periodos que a remocao tocou", async () => {
    const qc = novoClient();
    const agosto = chave("ag-i", "ag-f");
    const marco = chave("mar-i", "mar-f");
    qc.setQueryData(agosto, [avaliacao("x")]);
    qc.setQueryData(marco, [avaliacao("x"), avaliacao("y")]);

    const snapshot = await removerDoCache(qc, PREFIXO, ["x"]);
    restaurarCache(qc, snapshot);

    expect(ids(qc.getQueryData(agosto))).toEqual(["x"]);
    expect(ids(qc.getQueryData(marco))).toEqual(["x", "y"]);
  });

  it("snapshot ausente (mutacao que nunca chegou a mexer no cache) nao quebra", () => {
    const qc = novoClient();
    expect(() => restaurarCache(qc, undefined)).not.toThrow();
  });
});
