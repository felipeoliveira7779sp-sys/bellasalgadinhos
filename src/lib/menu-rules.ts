import type { Product } from "@/lib/menu-data";

export type ChoiceGroup = { title: string; options: string[] };
export type KitChecklistItem = { title: string };

export const cakeFlavors = [
  "Brigadeiro",
  "Ninho com Morango",
  "Doce de Leite",
  "Prestígio",
];

export const standaloneDrinkOptions = [
  "Coca Original",
  "Coca Zero",
  "Guaraná Antarctica",
  "Kuat",
  "Sukita Laranja",
  "Sukita Uva",
  "Fanta Laranja",
  "Fanta Uva",
  "Sprite",
  "Suco de Laranja",
  "Suco de Uva",
];

const lataOptions = [
  "Coca Original",
  "Coca Zero",
  "Guaraná Antarctica",
  "Kuat",
  "Sukita Laranja",
  "Sukita Uva",
];

const refrigerante2LOptions = [
  "Coca Original",
  "Coca Zero",
  "Guaraná Antarctica",
  "Kuat",
  "Sukita Laranja",
  "Sukita Uva",
  "Fanta Laranja",
  "Fanta Uva",
];

const kuatSukitaOptions = ["Kuat", "Sukita Laranja", "Sukita Uva"];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function numberFromName(product: Product, prefix: string): number | null {
  const match = normalize(product.name).match(new RegExp(`${prefix}\\s*(\\d+)`));
  return match?.[1] ? Number(match[1]) : null;
}

function genericFlavorList(product: Product) {
  if (product.flavors?.length) return product.flavors;
  return ["Coxinha", "Milho", "Queijo", "Calabresa", "Napolitano", "Carne", "Kibe", "Bolinho de Queijo"];
}

export function isStandaloneDrink(product: Product, categoryTitle = "") {
  const category = normalize(categoryTitle);
  const text = normalize(`${product.name} ${product.description ?? ""}`);
  const drinkCategory = /bebida|refrigerante|lata|suco/.test(category);
  const drinkName = /refrigerante|coca|guarana|kuat|sukita|fanta|sprite|suco/.test(text);
  const comboOrKit = /combo|kit festa/.test(text);
  return !comboOrKit && (drinkCategory || drinkName);
}

export function usesFlavorQuantities(product: Product, categoryTitle = "") {
  const category = normalize(categoryTitle);
  const text = normalize(`${product.name} ${product.description ?? ""}`);
  if (/combo|kit festa/.test(text) || /combo|kit/.test(category)) return false;
  if (isStandaloneDrink(product, categoryTitle)) return false;
  return product.flavors?.length > 1 || /mini pizza|mini-pizza|salgado avulso|avulso/.test(category + " " + text);
}

function drinkGroups(quantity: number, options: string[], title = "Refrigerante"): ChoiceGroup[] {
  if (quantity <= 0) return [];
  if (quantity === 1) return [{ title, options }];
  return Array.from({ length: quantity }, (_, index) => ({ title: `${title} ${index + 1}`, options }));
}

export function fixedComboDrinks(comboNumber: number): ChoiceGroup[] {
  switch (comboNumber) {
    case 1: return drinkGroups(2, lataOptions, "Refrigerante 350ml");
    case 2:
    case 3: return drinkGroups(1, kuatSukitaOptions, "Refrigerante 2L");
    case 4: return drinkGroups(1, ["Coca Original", "Coca Zero", "Fanta Laranja", "Fanta Uva"], "Refrigerante 2L");
    case 5: return [];
    case 6: return [
      { title: "Refrigerante 2 (2L)", options: kuatSukitaOptions },
      { title: "Refrigerante 3 (2L)", options: kuatSukitaOptions },
    ];
    default: return [];
  }
}

export function partyKitDrinks(kitNumber: number): ChoiceGroup[] {
  const quantity: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 3 };
  return drinkGroups(quantity[kitNumber] ?? 1, refrigerante2LOptions, "Refrigerante 2L");
}

export function kitChecklist(product: Product): KitChecklistItem[] {
  const text = `${product.name} ${product.description ?? ""}`;
  if (!/kit\s*festa/i.test(text)) return [];
  const items: string[] = [];
  const add = (value: string) => { if (!items.includes(value)) items.push(value); };
  const regex = /\b(\d+)\s*(doces?|docinhos?|churros?|salgados?|empadas?|pizzas?|bolos?)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const word = normalize(match[2]);
    add(`${match[1]} ${word.startsWith("docinh") ? "doces" : word}`);
  }
  if (/\bbolo\b/i.test(text)) add("Bolo");
  if (/\bchurros?\b/i.test(text)) add("Churros");
  const number = numberFromName(product, "kit festa");
  if (number === 2 && !items.includes("25 doces")) items.unshift("25 doces");
  return items.map((title) => ({ title }));
}

export function packFlavorLimit(product: Product, sizeIdx: number, categoryTitle = "") {
  const label = normalize(product.sizes?.[sizeIdx]?.label ?? product.name);
  const text = normalize(`${label} ${product.name} ${categoryTitle}`);
  if (/\b15\b/.test(text)) return 1;
  if (/\b25\b/.test(text)) return 2;
  if (/\b50\b/.test(text)) return 3;
  if (/\b100\b/.test(text)) return 4;
  if (/\b200\b|\b300\b/.test(text)) return 6;
  if (product.units_base) return Math.max(1, Math.floor(product.units_base / (product.units_per_flavor || 25)));
  return product.flavors?.length || 0;
}

export function splitFriedProducts(products: Product[]) {
  const groups = [
    { title: "Salgados Fritos — 15 e 25 unidades", quantities: [15, 25] },
    { title: "Salgados Fritos — 50 unidades", quantities: [50] },
    { title: "Salgados Fritos — 100 unidades", quantities: [100] },
    { title: "Salgados Fritos — 200 unidades", quantities: [200] },
    { title: "Salgados Fritos — 300 unidades", quantities: [300] },
  ];
  const result = groups.map((group) => ({
    title: group.title,
    items: products.map((product) => {
      const sizes = product.sizes?.filter((size) => {
        const label = normalize(size.label);
        return group.quantities.some((quantity) => new RegExp(`\\b${quantity}\\b`).test(label));
      }) ?? [];
      return sizes.length ? { ...product, sizes } : null;
    }).filter((product): product is Product => product !== null),
  })).filter((group) => group.items.length > 0);
  return result.length ? result : [{ title: "Salgados Fritos", items: products }];
}

export function applyCatalogChoices(product: Product): Product {
  const existing = Array.isArray(product.choice_groups) ? product.choice_groups as ChoiceGroup[] : [];
  if (existing.length) return product;
  if (isStandaloneDrink(product)) {
    const text = normalize(product.name);
    if (/refrigerante 2l|refri 2l|2 litros/.test(text)) {
      return { ...product, choice_groups: [{ title: "Escolha o refrigerante", options: refrigerante2LOptions }] };
    }
    if (/refrigerante.*350|lata/.test(text)) {
      return { ...product, choice_groups: [{ title: "Escolha o refrigerante", options: lataOptions }] };
    }
  }
  return product;
}
