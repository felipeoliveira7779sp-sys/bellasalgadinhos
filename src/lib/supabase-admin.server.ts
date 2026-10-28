import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./supabase";

// Cliente com service role (ignora RLS). Só no servidor, depois de checar a senha.
export function getSupabaseAdmin() {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente.");
  return createClient(process.env["SUPABASE_URL"] || SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}
