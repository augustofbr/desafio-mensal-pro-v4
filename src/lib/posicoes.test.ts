import { describe, it, expect } from "vitest";
import { calcularPosicoes, medalhaPara } from "./posicoes";

describe("calcularPosicoes", () => {
  it("numera 1..n quando nao ha empate", () => {
    expect(calcularPosicoes([213, 195, 194, 188])).toEqual([1, 2, 3, 4]);
  });

  it("empate duplo repete a posicao e o seguinte pula o lugar ocupado", () => {
    expect(calcularPosicoes([10, 8, 8, 5])).toEqual([1, 2, 2, 4]);
  });

  it("empate triplo pula dois lugares", () => {
    expect(calcularPosicoes([10, 8, 8, 8, 5])).toEqual([1, 2, 2, 2, 5]);
  });

  it("empate na lideranca mantem os dois em 1o", () => {
    expect(calcularPosicoes([10, 10, 7])).toEqual([1, 1, 3]);
  });

  it("todos zerados ficam todos em 1o (quem exibe decide se ha podio)", () => {
    expect(calcularPosicoes([0, 0, 0])).toEqual([1, 1, 1]);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(calcularPosicoes([])).toEqual([]);
  });

  it("um unico valor e sempre o 1o", () => {
    expect(calcularPosicoes([42])).toEqual([1]);
  });

  it("empates separados nao se misturam", () => {
    expect(calcularPosicoes([9, 9, 7, 4, 4, 4])).toEqual([1, 1, 3, 4, 4, 4]);
  });

  it("valores decimais empatam pela igualdade exata", () => {
    expect(calcularPosicoes([88.4, 88.4, 12.5])).toEqual([1, 1, 3]);
  });
});

describe("medalhaPara", () => {
  it("dá ouro, prata e bronze ao pódio com pontuação", () => {
    expect(medalhaPara(1, 213)).toBe("🥇");
    expect(medalhaPara(2, 195)).toBe("🥈");
    expect(medalhaPara(3, 194)).toBe("🥉");
  });

  it("não dá medalha do 4º lugar em diante", () => {
    expect(medalhaPara(4, 188)).toBeNull();
    expect(medalhaPara(10, 5)).toBeNull();
  });

  it("zerado em 2º fica sem medalha (mas a posição continua honesta)", () => {
    expect(medalhaPara(2, 0)).toBeNull();
  });

  it("líder zerado fica sem medalha — mês vazio por outra via", () => {
    expect(medalhaPara(1, 0)).toBeNull();
  });

  it("valor negativo nunca vira pódio", () => {
    expect(medalhaPara(1, -3)).toBeNull();
  });

  it("pontuação fracionada acima de zero vale medalha (revenue-percentage)", () => {
    expect(medalhaPara(1, 0.4)).toBe("🥇");
  });

  it("posição fora do pódio conhecido devolve null", () => {
    expect(medalhaPara(0, 10)).toBeNull();
  });
});
