import { supabase } from "../supabaseClient";

export const notificationsService = {
  async getAll(userId, { limit = 30 } = {}) {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    const { data, error } = await supabase
      .from("notifications")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async markRead(id) {
    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
    if (error) throw error;
  },

  async markAllRead(userId) {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) throw error;
  },

  async delete(id) {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) throw error;
  },

  async getUnreadCount(userId) {
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);
    return count || 0;
  },

  subscribeToUser(userId, callback) {
    return supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        callback
      )
      .subscribe();
  },
};
