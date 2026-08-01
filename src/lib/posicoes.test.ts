import { describe, it, expect } from "vitest";
import { calcularPosicoes } from "./posicoes";

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
