import { supabase } from "../supabaseClient";
import { auth } from "../firebase";

const API = (import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || "http://localhost:5000").replace(/^﻿/, "");

export const dealsService = {
  // Routes through backend so RLS is bypassed and RBAC is enforced in code.
  // Falls back to direct Supabase if the backend is unreachable.
  async getAll({ stage = "", assignedTo = "", search = "", profileId = null, role = null } = {}) {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      const params = new URLSearchParams({ limit: 500, offset: 0 });
      if (stage) params.set("stage", stage);
      if (search) params.set("search", search);
      if (assignedTo && assignedTo !== "__unassigned__") params.set("assigned_to", assignedTo);

      const res = await fetch(`${API}/api/deals?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      const json = await res.json();
      let data = json.data || [];
      data = data.filter((d) => d.stage !== "reverted_to_lead" && d.stage !== "reverted_to_pipeline");
      if (assignedTo === "__unassigned__") data = data.filter((d) => !d.assigned_to);
      return { data, count: json.count ?? data.length };
    } catch {
      // Backend unreachable — fall back to direct Supabase
      let q = supabase
        .from("deals")
        .select("*", { count: "exact" })
        .neq("stage", "reverted_to_lead")
        .neq("stage", "reverted_to_pipeline")
        .order("created_at", { ascending: false })
        .limit(500);

      if (stage)  q = q.eq("stage", stage);
      if (search) q = q.or(`title.ilike.%${search}%,company_name.ilike.%${search}%`);
      if (role && role !== "owner" && role !== "sales_head" && profileId) q = q.eq("assigned_to", profileId);
      if (assignedTo && assignedTo !== "__unassigned__") q = q.eq("assigned_to", assignedTo);

      const { data, count, error } = await q;
      if (error) throw new Error(error.message);
      let result = data || [];
      if (assignedTo === "__unassigned__") result = result.filter((d) => !d.assigned_to);
      return { data: result, count: count || 0 };
    }
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("deals")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(payload) {
    const { data, error } = await supabase
      .from("deals")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from("deals")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("deals").delete().eq("id", id);
    if (error) throw error;
  },

  async updateStage(id, stage) {
    const closedAt = ["won", "lost"].includes(stage)
      ? new Date().toISOString()
      : null;
    return this.update(id, { stage, closed_at: closedAt });
  },

  async getPipelineSummary() {
    const { data, error } = await supabase
      .from("deals")
      .select("stage, value");
    if (error) throw error;

    const stages = ["new", "contacted", "meeting_scheduled", "proposal_sent", "negotiation", "won", "lost"];
    return stages.map((stage) => {
      const stageDeals = data?.filter((d) => d.stage === stage) || [];
      return {
        stage,
        count: stageDeals.length,
        value: stageDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
      };
    });
  },

  async getTotalRevenue() {
    const { data, error } = await supabase
      .from("deals")
      .select("value")
      .eq("stage", "won");
    if (error) throw error;
    return data?.reduce((sum, d) => sum + (Number(d.value) || 0), 0) || 0;
  },

  async getUnifiedTimeline(dealId) {
    const { data: deal } = await supabase.from("deals").select("lead_id").eq("id", dealId).maybeSingle();
    const leadId = deal?.lead_id;

    const SEL = "*, user:profiles!activities_user_id_fkey(full_name, avatar_url)";
    const queries = [
      supabase.from("activities").select(SEL).eq("related_type", "deal").eq("related_id", dealId),
      supabase.from("activities").select(SEL).eq("deal_id", dealId),
    ];
    if (leadId) {
      queries.push(
        supabase.from("activities").select(SEL).eq("lead_id", leadId),
        supabase.from("activities").select(SEL).eq("related_type", "lead").eq("related_id", leadId)
      );
    }

    const mtgQuery = supabase.from("meetings").select("id,title,mode,status,start_time,end_time,customer_name,company_name,agenda,created_at,lead_id,deal_id").eq("deal_id", dealId);
    const leadMtgQuery = leadId
      ? supabase.from("meetings").select("id,title,mode,status,start_time,end_time,customer_name,company_name,agenda,created_at,lead_id,deal_id").eq("lead_id", leadId)
      : Promise.resolve({ data: [] });

    const [actResults, { data: dealMeetings }, { data: leadMeetings }] = await Promise.all([
      Promise.all(queries),
      mtgQuery,
      leadMtgQuery,
    ]);

    const all = actResults.flatMap((r) => r.data || []);
    const seen = new Set();
    const deduped = all.filter((a) => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });

    const loggedMeetingIds = new Set(deduped.map((a) => a.meeting_id).filter(Boolean));
    const allMeetings = [...(dealMeetings || []), ...(leadMeetings || [])];
    const meetingSeen = new Set();
    const synthetic = allMeetings
      .filter((m) => { if (meetingSeen.has(m.id)) return false; meetingSeen.add(m.id); return !loggedMeetingIds.has(m.id); })
      .map((m) => ({
        id: `mtg-${m.id}`,
        type: m.mode === "offline" ? "meeting_person" : "meeting_virtual",
        title: `Meeting Scheduled: ${m.title}`,
        description: `${m.customer_name || m.company_name || ""}${m.agenda ? "\n\nAgenda: " + m.agenda : ""}`,
        status: m.status || "done",
        created_at: m.created_at,
        metadata: { scheduled_at: m.start_time },
        user: null,
        created_by_profile: null,
      }));

    return [...deduped, ...synthetic].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getLinkedLead(dealId) {
    const { data: deal } = await supabase.from("deals").select("lead_id").eq("id", dealId).maybeSingle();
    if (!deal?.lead_id) return null;
    const { data } = await supabase
      .from("leads")
      .select("id, company_name, contact_name, stage, temperature, email, phone, other_notes")
      .eq("id", deal.lead_id)
      .maybeSingle();
    return data || null;
  },

  async getMonthlyRevenue() {
    const { data, error } = await supabase
      .from("deals")
      .select("value, closed_at")
      .eq("stage", "won")
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: true });
    if (error) throw error;

    const months = {};
    data?.forEach((deal) => {
      const key = deal.closed_at?.slice(0, 7);
      if (key) months[key] = (months[key] || 0) + (Number(deal.value) || 0);
    });
    return Object.entries(months).map(([month, revenue]) => ({ month, revenue }));
  },

  async lockRecord(id) {
    const { data, error } = await supabase.from("deals").update({ is_locked: true  }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async unlockRecord(id) {
    const { data, error } = await supabase.from("deals").update({ is_locked: false }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
};
