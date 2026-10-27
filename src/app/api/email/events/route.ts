import { handleProviderWebhook } from "@/lib/alerts/provider-http";
import { emailAdminClient } from "@/lib/supabase/email-admin";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const client = emailAdminClient();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const expectedFrom = process.env.EMAIL_FROM;
  if (!client || !secret || !expectedFrom) return new Response(null, { status: 503 });
  return handleProviderWebhook(request, { client, secret, expectedFrom });
}
