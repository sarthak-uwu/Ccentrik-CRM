import { supabase } from "../supabaseClient";

export const meetingsService = {
  async getAll({ status = "", search = "" } = {}) {
    let query = supabase
      .from("meetings")
      .select(`
        *,
        created_by_profile:profiles!meetings_created_by_fkey(id, full_name, avatar_url),
        attendees:meeting_attendees(user:profiles(id, full_name, avatar_url))
      `, { count: "exact" })
      .order("start_time", { ascending: true });

    if (status) query = query.eq("status", status);
    if (search) query = query.ilike("title", `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  },

  async getUpcoming(limit = 5) {
    const { data, error } = await supabase
      .from("meetings")
      .select(`*, created_by_profile:profiles!meetings_created_by_fkey(id, full_name, avatar_url)`)
      .eq("status", "scheduled")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async create(payload, attendeeIds = []) {
    const { data: meeting, error } = await supabase
      .from("meetings")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    if (attendeeIds.length > 0) {
      await supabase.from("meeting_attendees").insert(
        attendeeIds.map((uid) => ({ meeting_id: meeting.id, user_id: uid }))
      );
    }
    return meeting;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from("meetings")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("meetings").delete().eq("id", id);
    if (error) throw error;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("meetings")
      .select(`
        *,
        created_by_profile:profiles!meetings_created_by_fkey(id, full_name, avatar_url),
        attendees:meeting_attendees(user:profiles(id, full_name, avatar_url))
      `)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};
