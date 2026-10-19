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

  const { supabase, user, organization } = await getUserOrganization();
  const key = {
    organization_id: organization.id,
    user_id: user.id,
    tender_id: parsed.data.tenderId
  };

  if (parsed.data.state === "clear") {
    const { error } = await supabase
      .from("tender_feedback")
      .delete()
      .match(key);
    if (error) redirect("/dashboard?notice=save-error");
  } else {
    const { error } = await supabase
      .from("tender_feedback")
      .upsert({ ...key, state: parsed.data.state }, { onConflict: "organization_id,user_id,tender_id" });
    if (error) redirect("/dashboard?notice=save-error");
  }

  revalidatePath("/dashboard");
  const destination = parsed.data.listMode === "all" ? "/dashboard" : `/dashboard?view=${parsed.data.listMode}`;
  redirect(destination);
}

export async function addTenderToPipelineAction(formData: FormData): Promise<void> {
  const parsed = tenderSchema.safeParse({ tenderId: formData.get("tenderId") });
  if (!parsed.success) redirect("/dashboard?notice=invalid-action");

  const { supabase, user, organization } = await getUserOrganization();
  const { data: existing, error: lookupError } = await supabase
    .from("pipeline_cards")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("tender_id", parsed.data.tenderId)
    .maybeSingle();
  if (lookupError) redirect("/dashboard?notice=save-error");

  if (!existing) {
    const { error } = await supabase.from("pipeline_cards").insert({
      organization_id: organization.id,
      tender_id: parsed.data.tenderId,
      status: "triage",
      created_by: user.id
    });
    if (error) redirect("/dashboard?notice=save-error");
  }

  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  redirect("/pipeline");
}
