"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const checklistSchema = z.array(z.object({ text: z.string().trim().min(1).max(180), done: z.boolean() })).max(50);
const updateSchema = z.object({
  cardId: z.string().uuid(),
  status: z.enum(["triage", "analysis", "documentation", "proposal_sent", "won", "lost"]),
  responsibleName: z.string().trim().max(120),
  notes: z.string().max(10000),
  checklistJson: z.string().max(12000),
  checklistItem: z.string().trim().max(180)
});

async function getOrganizationClient() {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");
  const { data: organization } = await supabase.from("organizations").select("id").order("created_at").limit(1).maybeSingle();
  if (!organization) redirect("/onboarding");
  return { supabase, organization, user: authData.user };
}

export async function updatePipelineCardAction(formData: FormData): Promise<void> {
  const parsed = updateSchema.safeParse({
    cardId: formData.get("cardId"),
    status: formData.get("status"),
    responsibleName: formData.get("responsibleName"),
    notes: formData.get("notes"),
    checklistJson: formData.get("checklistJson"),
    checklistItem: formData.get("checklistItem") ?? ""
  });
  if (!parsed.success) redirect("/pipeline?notice=invalid");

  let checklist: z.infer<typeof checklistSchema>;
  try {
    const rawChecklist: unknown = JSON.parse(parsed.data.checklistJson);
    const result = checklistSchema.safeParse(rawChecklist);
    if (!result.success) redirect("/pipeline?notice=invalid");
    checklist = result.data.map((item, index) => ({
      ...item,
      done: formData.get(`check_${index}`) === "on"
    }));
  } catch {
    redirect("/pipeline?notice=invalid");
  }
  if (parsed.data.checklistItem) checklist.push({ text: parsed.data.checklistItem, done: false });

  const { supabase, organization } = await getOrganizationClient();
  const { error } = await supabase.from("pipeline_cards").update({
    status: parsed.data.status,
    responsible_name: parsed.data.responsibleName,
    notes: parsed.data.notes,
    checklist
  }).eq("id", parsed.data.cardId).eq("organization_id", organization.id);
  if (error) redirect("/pipeline?notice=save-error");
  revalidatePath("/pipeline");
  revalidatePath("/deadlines");
  revalidatePath("/panel");
  redirect("/pipeline?notice=saved");
}
