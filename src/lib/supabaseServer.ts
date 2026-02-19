// src/lib/supabaseServer.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using Service Role key.
 * NEVER import this from client components.
 *
 * Supports either env var name:
 * - SUPABASE_SERVICE_ROLE_KEY (your Vercel screenshot)
 * - SUPABASE_SERVICE_ROLE_KEY (fallback)
 */
export function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
