import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function checkPassword(password: string) {
  const expected = process.env["ADMIN_PASSWORD"];
  if (!expected || password !== expected) {
    throw new Error("Senha incorreta");
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
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
    const { data: signed, error: signErr } = await db.storage
      .from("menu")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signErr || !signed) throw new Error(signErr?.message ?? "Falha ao gerar link da imagem");
    return { url: signed.signedUrl };
  });