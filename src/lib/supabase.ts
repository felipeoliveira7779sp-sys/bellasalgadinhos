import { createClient } from "@supabase/supabase-js";

// Chave publicável (pode ficar no código). A leitura é liberada por RLS.
export const SUPABASE_URL = "https://wbxhlfosyhqgdbhvjhop.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fE_JfJm9FQTOuN65_AI6zQ_vCyNWeOh";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
