import type { Product } from "@/lib/menu-data";

export type CategoriaBase = { id: string; title: string; position: number | null };

export type ProdutoAgrupado = Product & {
  _modo?: "salgados" | "refri";
  _precos?: Record<string, Record<string, number>>;
  _maxSabores?: Record<string, number>;
  _refriPrecos?: Record<string, number>;
};

export type GrupoCardapio = { id: string; title: string; items: ProdutoAgrupado[] };

/**
 * Exibe o cardápio no formato individual:
 * cada categoria mantém seus próprios produtos, sem juntar salgados
 * em um card de cento nem bebidas em um card genérico.
 */
export function agruparCardapio(
  categorias: CategoriaBase[],
  produtos: Product[],
): GrupoCardapio[] {
  const pos = (x: { position?: number | null }) => x.position ?? 0;
  return [...categorias]
    .sort((a, b) => pos(a) - pos(b))
    .map((categoria) => ({
      id: categoria.id,
      title: categoria.title,
      items: produtos
        .filter((produto) => produto.category_id === categoria.id)
        .sort((a, b) => pos(a) - pos(b)),
    }))
    .filter((grupo) => grupo.items.length > 0);
}

// Mantidas exportações usadas pelo modal legado; produtos individuais não usam preços agregados.
export const TAMANHO_CENTO = "Cento (100 un)";
export const TAMANHO_MEIO = "Meio cento (50 un)";
export const MAX_SABORES: Record<string, number> = { [TAMANHO_CENTO]: 4, [TAMANHO_MEIO]: 3 };

export function precoBase(p: ProdutoAgrupado, tamanho: string): number {
  const tabela = p._precos?.[tamanho] ?? {};
  if (tabela["__sortidos"] !== undefined) return tabela["__sortidos"];
  const vals = Object.values(tabela);
  return vals.length ? Math.min(...vals) : 0;
}

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
