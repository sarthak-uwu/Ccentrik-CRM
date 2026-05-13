import { supabase } from "../supabaseClient";

export const leadsService = {
  async getAll({ search = "", stage = "", temperature = "", source = "", assignedTo = "", page = 1, limit = 50 } = {}) {
    let query = supabase
      .from("leads")
      .select(`*, assigned_profile:profiles!leads_assigned_to_fkey(id, full_name, avatar_url, email)`, { count: "exact" })
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(
        `contact_name.ilike.%${search}%,company_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }
    if (stage) query = query.eq("stage", stage);
    if (temperature) query = query.eq("temperature", temperature);
    if (source) query = query.eq("source", source);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("leads")
      .select(`*, assigned_profile:profiles!leads_assigned_to_fkey(id, full_name, avatar_url, email)`)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(payload) {
    const { data, error } = await supabase
      .from("leads")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from("leads")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) throw error;
  },

  async updateStage(id, stage) {
    return this.update(id, { stage });
  },

  async getStageCount() {
    const { data, error } = await supabase
      .from("leads")
      .select("stage")
      .not("stage", "is", null);
    if (error) throw error;
    const counts = { new: 0, contacted: 0, qualified: 0, proposal: 0, won: 0, lost: 0 };
    data?.forEach((l) => { if (counts[l.stage] !== undefined) counts[l.stage]++; });
    return counts;
  },

  async getActivities(leadId) {
    const { data, error } = await supabase
      .from("activities")
      .select(`*, user:profiles!activities_user_id_fkey(full_name, avatar_url)`)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
};
