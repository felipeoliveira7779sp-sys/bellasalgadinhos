import { describe, expect, it } from "vitest";
import { calcularTaxaEntrega } from "@/lib/frete";
import { lojaEstaAberta } from "@/lib/menu-data";

// Quarta 15h em Brasília (18h UTC) e domingo 15h
const quarta15h = new Date("2026-10-28T18:00:00Z");
const domingo15h = new Date("2026-11-01T18:00:00Z");

describe("abertura da loja", () => {
  it("auto segue o horário", () => {
    expect(lojaEstaAberta("auto", quarta15h)).toBe(true);
    expect(lojaEstaAberta("auto", domingo15h)).toBe(false);
  });
  it("open força aberta", () => expect(lojaEstaAberta("open", domingo15h)).toBe(true));
  it("closed força fechada", () => expect(lojaEstaAberta("closed", quarta15h)).toBe(false));
});

describe("frete", () => {
  it("Pix paga só a ida", () => expect(calcularTaxaEntrega(3, "Pix")?.taxa).toBe(8));
  it("Cartão/Dinheiro paga retorno", () => {
    expect(calcularTaxaEntrega(3, "Cartão")?.taxa).toBe(12);
    expect(calcularTaxaEntrega(3, "Dinheiro")?.taxa).toBe(12);
  });
  it("acima de 17 km não entrega", () => expect(calcularTaxaEntrega(17.5, "Pix")).toBeNull());
});
