import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function checkPassword(password: string) {
  const expected = process.env["ADMIN_PASSWORD"];
  if (!expected) {
    throw new Error(
      "Configuração do painel incompleta: ADMIN_PASSWORD não está configurada no servidor.",
    );
  }
  // Remove espaços acidentais no início/fim sem alterar espaços internos.
  if (password.trim() !== expected.trim()) {
    throw new Error("Senha incorreta");
  }
}

async function admin() {
  const { getSupabaseAdmin } = await import("@/lib/supabase-admin.server");
  return getSupabaseAdmin();
}

export const loginAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => z.object({ password: z.string() }).parse(d))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    return { ok: true };
  });

const storeSchema = z.object({
  password: z.string(),
  name: z.string().min(1),
  description: z.string(),
  logo_url: z.string().nullable(),
  cover_url: z.string().nullable(),
  whatsapp: z.string(),
  hours_text: z.string(),
  address: z.string(),
  store_lat: z.number().nullable(),
  store_lon: z.number().nullable(),
  open_status: z.enum(["auto", "open", "closed"]),
  surcharge_active: z.boolean(),
  surcharge_amount: z.number().min(0),
  surcharge_label: z.string(),
});

export const saveStore = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => storeSchema.parse(d))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const db = await admin();
    const { password: _pw, ...fields } = data;
    const { data: existing } = await db.from("store_settings").select("id").limit(1).maybeSingle();
    if (existing) {
      const { error } = await db
        .from("store_settings")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("store_settings").insert(fields);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const categorySchema = z.object({
  password: z.string(),
  id: z.string().nullable(),
  title: z.string().min(1),
  position: z.number(),
});

export const saveCategory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => categorySchema.parse(d))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const db = await admin();
    if (data.id) {
      const { error } = await db
        .from("menu_categories")
        .update({ title: data.title, position: data.position })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db
        .from("menu_categories")
        .insert({ title: data.title, position: data.position });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; id: string }) =>
    z.object({ password: z.string(), id: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const db = await admin();
    const { error } = await db.from("menu_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const productSchema = z.object({
  password: z.string(),
  id: z.string().nullable(),
  category_id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  price: z.number().nullable(),
  image_url: z.string().nullable(),
  sizes: z.array(z.object({ label: z.string(), price: z.number() })),
  flavors: z.array(z.string()),
  single_flavors: z.array(z.string()),
  units_base: z.number().nullable(),
  units_per_flavor: z.number().int().min(1),
  allow_assorted: z.boolean(),
  choice_groups: z.array(z.object({ title: z.string(), options: z.array(z.string()) })),
  active: z.boolean(),
  is_promotion: z.boolean().default(false),
  position: z.number(),
});

export const saveProduct = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => productSchema.parse(d))
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const db = await admin();
    const { password: _pw, id, ...fields } = data;
    if (id) {
      const { error } = await db.from("menu_products").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("menu_products").insert(fields);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; id: string }) =>
    z.object({ password: z.string(), id: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const db = await admin();
    const { error } = await db.from("menu_products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uploadImage = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; fileName: string; contentType: string; base64: string }) =>
    z
      .object({
        password: z.string(),
        fileName: z.string(),
        contentType: z.string(),
        base64: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    checkPassword(data.password);
    const db = await admin();
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const safeName = data.fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `${Date.now()}-${safeName}`;
    const { error } = await db.storage
      .from("menu")
      .upload(path, bytes, { contentType: data.contentType, upsert: true });
    if (error) throw new Error(error.message);
    // Bucket "menu" é público: devolve a URL pública permanente
    const { data: pub } = db.storage.from("menu").getPublicUrl(path);
    return { url: pub.publicUrl };
  });

// ================= Pedidos =================
const orderItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  qty: z.number().int().min(1),
  unitPrice: z.number().nonnegative(),
  sizeLabel: z.string().optional().default(""),
  // O cardápio novo envia arrays; string permanece aceita para pedidos antigos.
  flavors: z.union([z.array(z.string()), z.string()]).optional().default([]),
  singleFlavor: z.string().optional().default(""),
  // O cardápio novo envia objeto de escolhas; string permanece aceita para pedidos antigos.
  choices: z.union([z.record(z.string(), z.string()), z.string()]).optional().default({}),
  checklist: z.array(z.string()).optional().default([]),
  obs: z.string().optional().default(""),
});

const orderSchema = z.object({
  customer_name: z.string().trim().min(1).max(120),
  customer_phone: z.string().trim().min(1).max(40),
  order_type: z.enum(["entrega", "retirada"]),
  order_mode: z.enum(["agora", "agendado"]).default("agora"),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduled_time: z.string().max(10),
  payment_method: z.string().max(40),
  change_for: z.string().max(40).nullable(),
  cep: z.string().max(10).nullable(),
  address: z.string().max(400).nullable(),
  distance_km: z.number().nullable(),
  distance_estimated: z.boolean(),
  delivery_fee: z.number().min(0),
  return_fee_applied: z.boolean(),
  surcharge: z.number().min(0),
  subtotal: z.number().min(0),
  total: z.number().min(0),
  items: z.array(orderItemSchema).min(1).max(100),
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => orderSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row, error } = await db.from("orders").insert(data).select("id").single();
    if (error || !row) {
      console.error("createOrder", error);
      throw new Error("Não foi possível registrar o pedido. Tente novamente.");
    }
    return { id: row.id as string };
  });
