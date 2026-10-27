"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const feedbackSchema = z.object({
  tenderId: z.string().uuid(),
  state: z.enum(["favorite", "discarded", "clear"]),
  listMode: z.enum(["all", "favorites", "discarded"])
});

const tenderSchema = z.object({ tenderId: z.string().uuid() });

async function getUserOrganization() {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: organization } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!organization) redirect("/onboarding");

  return { supabase, user: authData.user, organization };
}

export async function updateTenderFeedbackAction(formData: FormData): Promise<void> {
  const parsed = feedbackSchema.safeParse({
    tenderId: formData.get("tenderId"),
    state: formData.get("state"),
    listMode: formData.get("listMode")
  });
  if (!parsed.success) redirect("/dashboard?notice=invalid-action");

  const { supabase, organization } = await getUserOrganization();
  const { error } = await supabase.rpc("set_tender_group_feedback", {
    p_organization_id: organization.id, p_tender_id: parsed.data.tenderId,
    p_state: parsed.data.state === "clear" ? null : parsed.data.state
  });
  if (error) redirect("/dashboard?notice=save-error");

  revalidatePath("/dashboard");
  const destination = parsed.data.listMode === "all" ? "/dashboard" : `/dashboard?view=${parsed.data.listMode}`;
  redirect(destination);
}

export async function addTenderToPipelineAction(formData: FormData): Promise<void> {
  const parsed = tenderSchema.safeParse({ tenderId: formData.get("tenderId") });
  if (!parsed.success) redirect("/dashboard?notice=invalid-action");

  const { supabase, organization } = await getUserOrganization();
  const { error } = await supabase.rpc("follow_tender", {
    p_organization_id: organization.id,
    p_tender_id: parsed.data.tenderId
  });
  if (error) redirect("/dashboard?notice=save-error");

  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  redirect("/pipeline");
}
