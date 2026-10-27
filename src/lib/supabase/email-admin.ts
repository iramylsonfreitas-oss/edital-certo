import { createClient } from "@supabase/supabase-js";
import { emailDevelopmentUrl } from "@/lib/alerts/resend-transport";

// Separate configuration prevents an unmerged pilot from using the production database.
export function emailAdminClient() {
  const url = process.env.EMAIL_PROVIDER_DATABASE_URL;
  const key = process.env.EMAIL_PROVIDER_SERVICE_KEY;
  if (url !== emailDevelopmentUrl || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
