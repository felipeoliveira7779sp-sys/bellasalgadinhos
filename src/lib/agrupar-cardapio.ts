import type { Product } from "@/lib/menu-data";

// Junta os produtos soltos cadastrados no painel em "abas" únicas, no estilo
// do cardápio de referência: um único card de Salgadinhos (Cento / Meio cento,
// com escolha de sabores ou Sortidos) e um único card de Refrigerantes
// (quantidade por sabor).

export type CategoriaBase = { id: string; title: string; position: number | null };

export type ProdutoAgrupado = Product & {
  _modo?: "salgados" | "refri";
  // preço de cada sabor por tamanho (label do tamanho -> sabor -> preço)
  _precos?: Record<string, Record<string, number>>;
  // máximo de sabores por tamanho
  _maxSabores?: Record<string, number>;
  // refrigerante: sabor -> preço
  _refriPrecos?: Record<string, number>;
};

export type GrupoCardapio = { id: string; title: string; items: ProdutoAgrupado[] };

export const TAMANHO_CENTO = "Cento (100 un)";
export const TAMANHO_MEIO = "Meio cento (50 un)";
export const MAX_SABORES: Record<string, number> = { [TAMANHO_CENTO]: 4, [TAMANHO_MEIO]: 3 };

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function nomeSabor(nome: string) {
  return nome.replace(/\s*\(\s*1\/2\s*cento\s*\)\s*/i, "").trim();
}

function ehMisto(nome: string) {
  return /misto|sortid/.test(norm(nome));
}

const pos = (x: { position?: number | null }) => x.position ?? 0;

export function agruparCardapio(
  categorias: CategoriaBase[],
  produtos: Product[],
): GrupoCardapio[] {
  const cats = [...categorias].sort((a, b) => pos(a) - pos(b));
  const grupos: GrupoCardapio[] = [];
  let salgados: GrupoCardapio | null = null;

  for (const c of cats) {
    const itens = produtos.filter((p) => p.category_id === c.id).sort((a, b) => pos(a) - pos(b));
    if (itens.length === 0) continue;
    const t = norm(c.title);

    if (t.includes("salgad")) {
      const meio = /1\/2|meio/.test(t);
      if (!salgados) {
        salgados = { id: `grupo-salgados`, title: "Salgadinhos", items: [] };
        grupos.push(salgados);
        salgados.items.push(novoSalgado(c.id));
      }
      const prod = salgados.items[0]!;
      const label = meio ? TAMANHO_MEIO : TAMANHO_CENTO;
      const precos = (prod._precos![label] ??= {});
      for (const p of itens) {
        if (!p.active) continue;
        if (!prod.image_url && p.image_url) prod.image_url = p.image_url;
        const preco = p.price ?? p.sizes[0]?.price ?? 0;
        if (ehMisto(p.name)) {
          precos["__sortidos"] = preco;
          continue;
        }
        const sabor = nomeSabor(p.name);
        precos[sabor] = preco;
        if (!prod.flavors.includes(sabor)) prod.flavors.push(sabor);
      }
      continue;
    }

    if (t.includes("refri") || t.includes("bebida")) {
      const ativos = itens.filter((p) => p.active);
      const refriPrecos: Record<string, number> = {};
      for (const p of ativos) refriPrecos[p.name] = p.price ?? p.sizes[0]?.price ?? 0;
      const valores = Object.values(refriPrecos);
      grupos.push({
        id: c.id,
        title: c.title,
        items: [
          {
            ...base(c.id),
            id: `refri-${c.id}`,
            name: c.title,
            description: "Escolha a quantidade de cada refrigerante",
            price: valores.length ? Math.min(...valores) : 0,
            image_url: ativos.find((p) => p.image_url)?.image_url ?? null,
            active: ativos.length > 0,
            flavors: Object.keys(refriPrecos),
            _modo: "refri",
            _refriPrecos: refriPrecos,
          },
        ],
      });
      continue;
    }

    grupos.push({ id: c.id, title: c.title, items: itens });
  }

  // Finaliza os tamanhos do salgado
  if (salgados) {
    const prod = salgados.items[0]!;
    const sizes = [TAMANHO_CENTO, TAMANHO_MEIO]
      .filter((l) => prod._precos![l] && Object.keys(prod._precos![l]!).length > 0)
      .map((l) => ({ label: l, price: precoBase(prod, l) }));
    prod.sizes = sizes;
    prod.price = sizes[0]?.price ?? 0;
    prod.active = sizes.length > 0;
    if (sizes.length === 0) salgados.items = [];
  }

  return grupos.filter((g) => g.items.length > 0);
}

function base(categoryId: string): Product {
  return {
    id: "",
    category_id: categoryId,
    name: "",
    description: "",
    price: 0,
    image_url: null,
    sizes: [],
    flavors: [],
    single_flavors: [],
    units_base: null,
    units_per_flavor: 25,
    allow_assorted: true,
    choice_groups: [],
    active: true,
    position: 0,
  } as unknown as Product;
}

function novoSalgado(categoryId: string): ProdutoAgrupado {
  return {
    ...base(categoryId),
    id: "grupo-salgados",
    name: "Cento de Salgadinhos",
    description: "Monte seu cento ou meio cento: escolha os sabores ou peça Sortidos.",
    _modo: "salgados",
    _precos: {},
    _maxSabores: MAX_SABORES,
  };
}

// Menor preço entre os sabores (preço do Sortidos, quando cadastrado)
export function precoBase(p: ProdutoAgrupado, tamanho: string): number {
  const tabela = p._precos?.[tamanho] ?? {};
  if (tabela["__sortidos"] !== undefined) return tabela["__sortidos"];
  const vals = Object.values(tabela);
  return vals.length ? Math.min(...vals) : 0;
}

// Preço do salgado: maior preço entre os sabores escolhidos
export function precoSalgado(
  p: ProdutoAgrupado,
  tamanho: string,
  sabores: string[],
  sortido: boolean,
): number {
  const tabela = p._precos?.[tamanho] ?? {};
  if (sortido || sabores.length === 0) return precoBase(p, tamanho);
  return Math.max(...sabores.map((s) => tabela[s] ?? precoBase(p, tamanho)));
}
