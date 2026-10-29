import { supabase } from "@/lib/supabase";

export type Size = { label: string; price: number };
export type ChoiceGroup = { title: string; options: string[] };

export type Product = {
  id: string;
  category_id: string | null;
  name: string;
  description: string;
  price: number | null;
  image_url: string | null;
  sizes: Size[];
  flavors: string[];
  single_flavors: string[];
  units_base: number | null;
  units_per_flavor: number;
  allow_assorted: boolean;
  choice_groups: ChoiceGroup[];
  active: boolean;
  position: number;
};

export type Category = { id: string; title: string; position: number };

export type Store = {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  cover_url: string | null;
  whatsapp: string;
  hours_text: string;
  // Entrega
  address: string; // endereço da loja (texto, só pra consulta)
  store_lat: number | null; // ponto de saída da entrega
  store_lon: number | null;
  // Taxa adicional (chuva, feriado, alta demanda) — ligada/desligada no painel
  surcharge_active: boolean;
  surcharge_amount: number;
  surcharge_label: string;
  // Abertura: auto = segue o horário; open/closed = forçado pelo painel
  open_status: OpenStatus;
};

export type OpenStatus = "auto" | "open" | "closed";

// Horário padrão da loja: Seg-Sáb, 08h às 18h (horário local de Rio Branco).
export function dentroDoHorario(now = new Date(), hoursText = "Seg-Sáb: 8h-18h") {
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Rio_Branco" }));
  const dia = local.getDay();
  const faixa = hoursText.match(/(\d{1,2})(?::(\d{2}))?\s*h?\s*[-–a]\s*(\d{1,2})(?::(\d{2}))?\s*h?/i);
  if (!faixa || dia < 1 || dia > 6) return false;
  const inicio = Number(faixa[1]) * 60 + Number(faixa[2] ?? 0);
  const fim = Number(faixa[3]) * 60 + Number(faixa[4] ?? 0);
  const minutoAtual = local.getHours() * 60 + local.getMinutes();
  return fim > inicio && minutoAtual >= inicio && minutoAtual < fim;
}

export function lojaEstaAberta(status: OpenStatus | undefined, now = new Date(), hoursText = "Seg-Sáb: 8h-18h") {
  if (status === "open") return true;
  if (status === "closed") return false;
  return dentroDoHorario(now, hoursText);
}

export const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function fetchMenu() {
  const [cats, prods, store] = await Promise.all([
    supabase.from("menu_categories").select("*").order("position"),
    supabase.from("menu_products").select("*").order("position"),
    supabase.from("store_settings").select("*").limit(1).maybeSingle(),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (prods.error) throw new Error(prods.error.message);

  const s = (store.data ?? null) as Record<string, unknown> | null;

  return {
    categories: (cats.data ?? []) as Category[],
    products: ((prods.data ?? []) as unknown[]).map((p) => {
      const row = p as Record<string, unknown>;
      return {
        ...(row as object),
        price: row["price"] === null ? null : Number(row["price"]),
        sizes: (row["sizes"] as Size[]) ?? [],
        flavors: (row["flavors"] as string[]) ?? [],
        single_flavors: (row["single_flavors"] as string[]) ?? [],
        allow_assorted: Boolean(row["allow_assorted"]),
        choice_groups: (row["choice_groups"] as ChoiceGroup[]) ?? [],
      } as Product;
    }),
    store: s
      ? ({
          ...s,
          address: (s["address"] as string | null) ?? "",
          store_lat: numOuNull(s["store_lat"]),
          store_lon: numOuNull(s["store_lon"]),
          surcharge_active: Boolean(s["surcharge_active"]),
          surcharge_amount: numOuNull(s["surcharge_amount"]) ?? 2,
          surcharge_label:
            (s["surcharge_label"] as string | null) ?? "Dia de chuva, feriado ou alta demanda",
          open_status: (["auto", "open", "closed"].includes(s["open_status"] as string)
            ? s["open_status"]
            : "auto") as OpenStatus,
        } as Store)
      : null,
  };
}