import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageResult<T> = { data: T[] | null; error: { message: string } | null };
type PageReader<T> = (from: number, to: number) => PromiseLike<PageResult<T>>;

async function readAllPages<T>(readPage: PageReader<T>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  const maximumRows = 50_000;
  for (let offset = 0; offset <= maximumRows; offset += pageSize) {
    const { data, error } = await readPage(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    if (offset === maximumRows && page.length > 0) {
      throw new Error("A exportação excede o limite de 50.000 registros.");
    }
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error("A exportação excede o limite de 50.000 registros; contate o suporte para concluir a solicitação.");
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Autenticação necessária." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const userId = authData.user.id;
    const [userRows, consentRows, requestRows, membershipRows, feedbackRows, commentRows, documentRows, auditRows] = await Promise.all([
      readAllPages((from, to) => supabase.from("users").select("id,full_name,avatar_url,created_at,updated_at").eq("id", userId).range(from, to)),
      readAllPages((from, to) => supabase.from("privacy_consents").select("consent_type,document_version,accepted_at").eq("user_id", userId).range(from, to)),
      readAllPages((from, to) => supabase.from("data_subject_requests").select("request_type,status,created_at,completed_at").eq("user_id", userId).range(from, to)),
      readAllPages((from, to) => supabase.from("memberships").select("organization_id,role,joined_at,organizations(id,name,slug)").eq("user_id", userId).range(from, to)),
      readAllPages((from, to) => supabase.from("tender_feedback").select("organization_id,tender_id,state,created_at,updated_at").eq("user_id", userId).range(from, to)),
      readAllPages((from, to) => supabase.from("comments").select("id,organization_id,pipeline_card_id,body,created_at,updated_at").eq("author_user_id", userId).range(from, to)),
      readAllPages((from, to) => supabase.from("documents").select("id,organization_id,pipeline_card_id,file_name,mime_type,size_bytes,expires_at,created_at").eq("uploaded_by", userId).range(from, to)),
      readAllPages((from, to) => supabase.from("audit_logs").select("organization_id,action,target_type,target_id,metadata,created_at").eq("actor_user_id", userId).range(from, to))
    ]);
    const organizationIds = membershipRows.map((membership) => membership.organization_id);
    const [profileRows, alertRows, pipelineRows] = organizationIds.length
      ? await Promise.all([
        readAllPages((from, to) => supabase.from("interest_profiles").select("id,organization_id,name,segment_key,required_keywords,optional_keywords,excluded_keywords,ufs,municipality_codes,modality_codes,agency_terms,spheres,minimum_value,maximum_value,cnae_codes,exclusive_me_epp,is_active,created_at,updated_at").in("organization_id", organizationIds).range(from, to)),
        readAllPages((from, to) => supabase.from("alerts").select("id,organization_id,profile_id,frequency,minimum_score,email_enabled,telegram_enabled,timezone,daily_send_time,is_enabled,created_at,updated_at").in("organization_id", organizationIds).range(from, to)),
        readAllPages((from, to) => supabase.from("pipeline_cards").select("id,organization_id,tender_id,status,archived_at,responsible_user_id,notes,created_at,updated_at").in("organization_id", organizationIds).range(from, to))
      ])
      : [[], [], []];

    const exportData = {
      exportedAt: new Date().toISOString(),
      account: { id: userId, email: authData.user.email ?? null, createdAt: authData.user.created_at },
      profile: userRows,
      privacyConsents: consentRows,
      privacyRequests: requestRows,
      memberships: membershipRows,
      interestProfiles: profileRows,
      alerts: alertRows,
      tenderFeedback: feedbackRows,
      pipelineCards: pipelineRows,
      authoredComments: commentRows,
      uploadedDocuments: documentRows,
      auditEvents: auditRows
    };
    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=edital-certo-export.json",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "privacy_export_failed", userId: authData.user.id, message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: "Não foi possível gerar a exportação completa. Tente novamente ou contate o suporte." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
