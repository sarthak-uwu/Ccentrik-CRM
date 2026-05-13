import { supabase } from "../supabaseClient";

export const dealsService = {
  async getAll({ stage = "", assignedTo = "", search = "" } = {}) {
    let query = supabase
      .from("deals")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (stage) query = query.eq("stage", stage);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    if (search) query = query.or(`title.ilike.%${search}%,company_name.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
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
    const closedAt = ["closed_won", "closed_lost"].includes(stage)
      ? new Date().toISOString()
      : null;
    return this.update(id, { stage, closed_at: closedAt });
  },

  async getPipelineSummary() {
    const { data, error } = await supabase
      .from("deals")
      .select("stage, value");
    if (error) throw error;

    const stages = ["prospecting", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"];
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
      .eq("stage", "closed_won");
    if (error) throw error;
    return data?.reduce((sum, d) => sum + (Number(d.value) || 0), 0) || 0;
  },

  async getMonthlyRevenue() {
    const { data, error } = await supabase
      .from("deals")
      .select("value, closed_at")
      .eq("stage", "closed_won")
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
};
