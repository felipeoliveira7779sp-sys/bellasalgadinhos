import { describe, expect, it } from "vitest";
import { agruparCardapio, precoSalgado, TAMANHO_CENTO, TAMANHO_MEIO } from "@/lib/agrupar-cardapio";
import type { Product } from "@/lib/menu-data";

const p = (id: string, cat: string, name: string, price: number): Product =>
  ({ id, category_id: cat, name, description: "", price, image_url: null, sizes: [], flavors: [],
    single_flavors: [], units_base: null, units_per_flavor: 25, allow_assorted: true,
    choice_groups: [], active: true, position: 0 }) as Product;

const cats = [
  { id: "c", title: "Salgadinhos (cento)", position: 0 },
  { id: "m", title: "Salgadinhos (1/2 cento)", position: 1 },
  { id: "r", title: "Refrigerantes", position: 2 },
];
const prods = [
  p("1", "c", "Salgadinhos Misto", 30), p("2", "c", "Coxinha de Frango", 30), p("3", "c", "Pastel de Carne", 35),
  p("4", "m", "Salgadinhos Misto (1/2 cento)", 15), p("5", "m", "Coxinha de Frango (1/2 cento)", 15),
  p("6", "m", "Pastel de Carne (1/2 cento)", 17.5),
  p("7", "r", "Coca-Cola 2lt", 13), p("8", "r", "Kina Guaraná 2lt", 8),
];

describe("agruparCardapio", () => {
  const g = agruparCardapio(cats, prods);
  it("cria um único card de salgadinhos e um de refrigerantes", () => {
    expect(g.map((x) => x.items.length)).toEqual([1, 1]);
    expect(g[0]!.items[0]!.flavors).toEqual(["Coxinha de Frango", "Pastel de Carne"]);
    expect(g[0]!.items[0]!.sizes.map((s) => s.price)).toEqual([30, 15]);
  });
  it("cobra o sabor mais caro escolhido", () => {
    const s = g[0]!.items[0]!;
    expect(precoSalgado(s, TAMANHO_CENTO, ["Coxinha de Frango", "Pastel de Carne"], false)).toBe(35);
    expect(precoSalgado(s, TAMANHO_MEIO, ["Pastel de Carne"], false)).toBe(17.5);
    expect(precoSalgado(s, TAMANHO_CENTO, [], true)).toBe(30);
  });
  it("refrigerantes guardam preço por sabor", () => {
    expect(g[1]!.items[0]!._refriPrecos).toEqual({ "Coca-Cola 2lt": 13, "Kina Guaraná 2lt": 8 });
  });
});
