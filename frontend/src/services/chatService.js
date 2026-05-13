import { supabase } from "../supabaseClient";

export const chatService = {
  // Auto-join all public channels for a new user
  async ensurePublicChannels(userId) {
    const { data: joined } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", userId);

    const { data: publicChannels } = await supabase
      .from("chat_channels")
      .select("id")
      .eq("type", "channel")
      .eq("is_private", false);

    if (!publicChannels?.length) return;

    const joinedIds = new Set((joined || []).map((m) => m.channel_id));
    const toJoin = publicChannels.filter((c) => !joinedIds.has(c.id));

    if (toJoin.length > 0) {
      await supabase.from("channel_members").insert(
        toJoin.map((c) => ({ channel_id: c.id, user_id: userId }))
      );
    }
  },

  async getChannels(userId) {
    const { data, error } = await supabase
      .from("channel_members")
      .select(`channel:chat_channels(*), last_read_at`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const channels = (data || []).map((d) => ({ ...d.channel, last_read_at: d.last_read_at })).filter(Boolean);

    // For DM channels, resolve the other user's name
    for (const ch of channels) {
      if (ch.type === "direct") {
        const { data: other } = await supabase
          .from("channel_members")
          .select("user:profiles(id, full_name, avatar_url, online_at)")
          .eq("channel_id", ch.id)
          .neq("user_id", userId)
          .limit(1)
          .single();
        if (other?.user) {
          ch._dmUser = other.user;
          ch.displayName = other.user.full_name;
        }
      }
    }

    return channels;
  },

  async getAllPublicChannels() {
    const { data, error } = await supabase
      .from("chat_channels")
      .select("*")
      .eq("is_private", false)
      .eq("type", "channel")
      .order("name");
    if (error) throw error;
    return data || [];
  },

  async getOrCreateDM(userId1, userId2) {
    // Find existing DM between these two users
    const { data: m1 } = await supabase
      .from("channel_members")
      .select("channel_id, channel:chat_channels(id,type)")
      .eq("user_id", userId1);

    const { data: m2 } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", userId2);

    const ids2 = new Set((m2 || []).map((m) => m.channel_id));
    const shared = (m1 || []).find(
      (m) => ids2.has(m.channel_id) && m.channel?.type === "direct"
    );

    if (shared?.channel_id) {
      const { data: ch } = await supabase
        .from("chat_channels")
        .select("*")
        .eq("id", shared.channel_id)
        .single();
      if (ch) return ch;
    }

    // Create new DM channel
    const { data: newChannel, error } = await supabase
      .from("chat_channels")
      .insert({ type: "direct", name: `dm-${userId1.slice(0,8)}-${userId2.slice(0,8)}`, is_private: true })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("channel_members").insert([
      { channel_id: newChannel.id, user_id: userId1 },
      { channel_id: newChannel.id, user_id: userId2 },
    ]);

    return newChannel;
  },

  async joinChannel(channelId, userId) {
    const { error } = await supabase
      .from("channel_members")
      .upsert({ channel_id: channelId, user_id: userId });
    if (error) throw error;
  },

  async getMessages(channelId, limit = 60, before = null) {
    let query = supabase
      .from("chat_messages")
      .select(`
        *,
        sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url),
        reply:chat_messages!chat_messages_reply_to_fkey(id, content, sender:profiles!chat_messages_sender_id_fkey(full_name))
      `)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) query = query.lt("created_at", before);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).reverse();
  },

  async sendMessage(payload) {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert(payload)
      .select(`*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)`)
      .single();
    if (error) throw error;
    return data;
  },

  async editMessage(id, content) {
    const { data, error } = await supabase
      .from("chat_messages")
      .update({ content, edited_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteMessage(id) {
    const { error } = await supabase
      .from("chat_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async addReaction(messageId, userId, emoji) {
    const { data: msg } = await supabase
      .from("chat_messages")
      .select("reactions")
      .eq("id", messageId)
      .single();

    const reactions = msg?.reactions || {};
    if (!reactions[emoji]) reactions[emoji] = [];
    if (reactions[emoji].includes(userId))
      reactions[emoji] = reactions[emoji].filter((id) => id !== userId);
    else reactions[emoji].push(userId);

    await supabase.from("chat_messages").update({ reactions }).eq("id", messageId);
  },

  async markChannelRead(channelId, userId) {
    await supabase
      .from("channel_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("user_id", userId);
  },

  async getChannelMembers(channelId) {
    const { data, error } = await supabase
      .from("channel_members")
      .select("user:profiles(id, full_name, avatar_url, online_at, role)")
      .eq("channel_id", channelId);
    if (error) throw error;
    return (data || []).map((m) => m.user).filter(Boolean);
  },

  subscribeToMessages(channelId, callback) {
    return supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        callback
      )
      .subscribe();
  },
};
