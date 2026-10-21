import { afterEach, describe, expect, it, vi } from "vitest";
import { iniciarLote, loteEmAndamento, encerrarLote, assinarLote } from "./loteEmAndamento";

afterEach(() => encerrarLote());

describe("loteEmAndamento", () => {
  it("só deixa iniciar um lote por vez", () => {
    expect(loteEmAndamento()).toBe(false);
    expect(iniciarLote()).toBe(true);
    expect(loteEmAndamento()).toBe(true);
    expect(iniciarLote()).toBe(false);
    encerrarLote();
    expect(loteEmAndamento()).toBe(false);
    expect(iniciarLote()).toBe(true);
  });

  it("avisa quem assinou quando muda, e para de avisar depois de cancelar", () => {
    const cb = vi.fn();
    const cancelar = assinarLote(cb);
    iniciarLote();
    encerrarLote();
    expect(cb).toHaveBeenCalledTimes(2);
    cancelar();
    iniciarLote();
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
