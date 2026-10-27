import { handleUnsubscribe } from "@/lib/alerts/provider-http";
import { emailAdminClient } from "@/lib/supabase/email-admin";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleUnsubscribe(request, null); }
export async function POST(request: Request) { return handleUnsubscribe(request, emailAdminClient()); }
