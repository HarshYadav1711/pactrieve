import {createClient} from "@supabase/supabase-js";

export function serverSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Server Supabase environment variables are missing");
  return createClient(url, secret, {auth: {persistSession: false, autoRefreshToken: false}});
}

export function storageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || "pactrieve-documents";
}
