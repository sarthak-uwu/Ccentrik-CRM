import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { chatService } from "../services/chatService";
import { teamService } from "../services/teamService";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import { format, isToday, isYesterday } from "date-fns";
import {
  Hash, Send, Plus, Search, Smile, Paperclip, MoreHorizontal,
  Edit2, Trash2, X, ChevronDown, Users, MessageSquare, AtSign,
  Video, VideoOff, PhoneOff, Maximize2
} from "lucide-react";

function Avatar({ user, size = 32, showOnline = false }) {
  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
  const isOnline = user?.online_at && new Date(user.online_at) > new Date(Date.now() - 5 * 60 * 1000);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt={initials} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg, #1B76D3, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 700, color: "white" }}>
          {initials}
        </div>
      )}
      {showOnline && (
        <div style={{ position: "absolute", bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: "50%", background: isOnline ? "#10B981" : "#94A3B8", border: "2px solid white" }} />
      )}
    </div>
  );
}

function MessageGroup({ messages, currentUserId, onReact, onDelete }) {
  const sender = messages[0]?.sender;
  const isMine = sender?.id === currentUserId;

  const formatTime = (ts) => format(new Date(ts), "h:mm a");
  const formatDate = (ts) => {
    const d = new Date(ts);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "EEEE, MMMM d");
  };

  return (
    <div style={{ display: "flex", flexDirection: isMine ? "row-reverse" : "row", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
      {!isMine && <Avatar user={sender} size={28} />}
      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 2, alignItems: isMine ? "flex-end" : "flex-start" }}>
        {!isMine && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#475569", marginLeft: 2 }}>
            {sender?.full_name}
          </span>
        )}
        {messages.map((msg, i) => (
          <div
            key={msg.id}
            className="group"
            style={{ position: "relative" }}
            onMouseEnter={(e) => e.currentTarget.querySelector(".msg-actions")?.style.setProperty("display", "flex")}
            onMouseLeave={(e) => e.currentTarget.querySelector(".msg-actions")?.style.setProperty("display", "none")}
          >
            {msg.reply && (
              <div style={{
                background: isMine ? "rgba(255,255,255,0.15)" : "#F1F5F9",
                borderLeft: `3px solid ${isMine ? "rgba(255,255,255,0.5)" : "#1B76D3"}`,
                padding: "4px 8px",
                borderRadius: "4px 8px 8px 4px",
                fontSize: 11.5,
                color: isMine ? "rgba(255,255,255,0.8)" : "#64748B",
                marginBottom: 2,
                maxWidth: "100%",
              }}>
                <span style={{ fontWeight: 600 }}>{msg.reply.sender?.full_name}</span>: {msg.reply.content}
              </div>
            )}
            {msg.deleted_at ? (
              <div style={{ fontStyle: "italic", color: "#94A3B8", fontSize: 12.5, padding: "8px 12px" }}>Message deleted</div>
            ) : (
              <div className={isMine ? "chat-bubble-sent" : "chat-bubble-received"}>
                {msg.type === "image" ? (
                  <img src={msg.file_url} alt="img" style={{ maxWidth: 220, borderRadius: 8, display: "block" }} />
                ) : msg.type === "file" ? (
                  <a href={msg.file_url} download={msg.file_name} style={{ color: "inherit", textDecoration: "underline", fontSize: 13 }}>
                    📎 {msg.file_name}
                  </a>
                ) : (
                  msg.content
                )}
                {msg.edited_at && <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>(edited)</span>}
              </div>
            )}
            {/* Reactions */}
            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                {Object.entries(msg.reactions).map(([emoji, users]) =>
                  users.length > 0 ? (
                    <button
                      key={emoji}
                      onClick={() => onReact(msg.id, emoji)}
                      style={{ background: users.includes(currentUserId) ? "#EBF4FF" : "#F8FAFC", border: `1px solid ${users.includes(currentUserId) ? "#1B76D3" : "#E2E8F0"}`, borderRadius: 12, padding: "1px 6px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
                    >
                      {emoji} <span style={{ fontSize: 11, color: "#64748B" }}>{users.length}</span>
                    </button>
                  ) : null
                )}
              </div>
            )}
            {/* Hover Actions */}
            {!msg.deleted_at && (
              <div
                className="msg-actions"
                style={{ display: "none", position: "absolute", top: -28, [isMine ? "left" : "right"]: 0, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: "2px 4px", gap: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", zIndex: 10 }}
              >
                {["👍", "❤️", "😂", "🎉"].map((e) => (
                  <button key={e} onClick={() => onReact(msg.id, e)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 3, borderRadius: 4 }} className="hover:bg-slate-50">{e}</button>
                ))}
                {isMine && (
                  <button onClick={() => onDelete(msg.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 4 }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <span style={{ fontSize: 10, color: "#94A3B8" }}>{formatTime(messages[messages.length - 1]?.created_at)}</span>
      </div>
    </div>
  );
}

function DateSeparator({ date }) {
  const d = new Date(date);
  const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMMM d, yyyy");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
      <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
      <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
    </div>
  );
}

export default function Chat() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [activeCall, setActiveCall] = useState(false);
  const [callFullscreen, setCallFullscreen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelDesc, setChannelDesc] = useState("");
  const [search, setSearch] = useState("");
  const [dmSearch, setDmSearch] = useState("");
  const [showDmSearch, setShowDmSearch] = useState(false);
  const messagesEndRef = useRef(null);
  const subscriptionRef = useRef(null);

  // Auto-join public channels on first load
  useEffect(() => {
    if (profile?.id) chatService.ensurePublicChannels(profile.id);
  }, [profile?.id]);

  const { data: channels, refetch: refetchChannels } = useQuery({
    queryKey: ["chat-channels", profile?.id],
    queryFn: () => chatService.getChannels(profile?.id),
    enabled: !!profile?.id,
    refetchInterval: 5000, // poll every 5s as realtime fallback
  });

  const { data: teamData } = useQuery({
    queryKey: ["team-all"],
    queryFn: () => teamService.getAll(),
  });

  const loadMessages = useCallback(async (channelId) => {
    if (!channelId) return;
    const msgs = await chatService.getMessages(channelId, 60);
    setMessages(msgs);
    await chatService.markChannelRead(channelId, profile?.id);
    refetchChannels();
  }, [profile?.id, refetchChannels]);

  useEffect(() => {
    if (!activeChannel?.id) return;
    loadMessages(activeChannel.id);

    // Realtime subscription
    if (subscriptionRef.current) supabase.removeChannel(subscriptionRef.current);
    subscriptionRef.current = chatService.subscribeToMessages(activeChannel.id, async (payload) => {
      if (payload.eventType === "INSERT") {
        const { data } = await supabase
          .from("chat_messages")
          .select("*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)")
          .eq("id", payload.new.id)
          .single();
        if (data) setMessages((prev) => [...prev, data]);
        await chatService.markChannelRead(activeChannel.id, profile?.id);
        refetchChannels();
      } else if (payload.eventType === "UPDATE") {
        setMessages((prev) => prev.map((m) => m.id === payload.new.id ? { ...m, ...payload.new } : m));
      }
    });

    // Polling fallback every 3s in case realtime isn't enabled
    const pollInterval = setInterval(() => loadMessages(activeChannel.id), 3000);

    return () => {
      if (subscriptionRef.current) supabase.removeChannel(subscriptionRef.current);
      clearInterval(pollInterval);
    };
  }, [activeChannel?.id, loadMessages, profile?.id, refetchChannels]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!input.trim() || !activeChannel?.id || !profile?.id) return;
    setSending(true);
    const content = input.trim();
    setInput("");
    try {
      await chatService.sendMessage({
        channel_id: activeChannel.id,
        sender_id: profile.id,
        content,
        type: "text",
      });
    } catch (err) {
      toast.error("Failed to send message");
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCreateChannel = async () => {
    if (!channelName.trim() || !profile?.id) return;
    try {
      const ch = await supabase
        .from("chat_channels")
        .insert({ name: channelName.toLowerCase().replace(/\s+/g, "-"), type: "channel", description: channelDesc, created_by: profile.id, is_private: false })
        .select()
        .single();
      if (ch.data) {
        await chatService.joinChannel(ch.data.id, profile.id);
        refetchChannels();
        setActiveChannel(ch.data);
        setShowNewChannel(false);
        setChannelName("");
        setChannelDesc("");
        toast.success("Channel created");
      }
    } catch (err) {
      toast.error("Failed to create channel");
    }
  };

  const handleStartDM = async (user) => {
    if (!profile?.id) return;
    try {
      const channel = await chatService.getOrCreateDM(profile.id, user.id);
      channel._dmUser = user;
      refetchChannels();
      setActiveChannel(channel);
      setShowDmSearch(false);
      setDmSearch("");
    } catch (err) {
      toast.error("Failed to open DM");
    }
  };

  const handleReact = async (msgId, emoji) => {
    await chatService.addReaction(msgId, profile?.id, emoji);
    loadMessages(activeChannel.id);
  };

  const handleDeleteMessage = async (msgId) => {
    await chatService.deleteMessage(msgId);
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, deleted_at: new Date().toISOString() } : m));
  };

  // Group messages by sender and time proximity
  const groupMessages = (msgs) => {
    const groups = [];
    let currentGroup = [];
    let currentDate = null;
    const dateSeps = [];

    msgs.forEach((msg, i) => {
      const msgDate = msg.created_at?.slice(0, 10);
      if (msgDate !== currentDate) {
        if (currentGroup.length > 0) groups.push({ type: "messages", messages: [...currentGroup] });
        groups.push({ type: "date", date: msg.created_at });
        currentGroup = [msg];
        currentDate = msgDate;
      } else {
        const prev = currentGroup[currentGroup.length - 1];
        const sameUser = prev?.sender?.id === msg.sender?.id;
        const withinMinute = prev && Math.abs(new Date(msg.created_at) - new Date(prev.created_at)) < 60000;
        if (sameUser && withinMinute) {
          currentGroup.push(msg);
        } else {
          if (currentGroup.length > 0) groups.push({ type: "messages", messages: [...currentGroup] });
          currentGroup = [msg];
        }
      }
    });
    if (currentGroup.length > 0) groups.push({ type: "messages", messages: [...currentGroup] });
    return groups;
  };

  const channelList = (channels || []).filter((c) => c?.type === "channel");
  const dmList = (channels || []).filter((c) => c?.type === "direct");
  const filteredTeam = teamData?.data?.filter((m) => m.id !== profile?.id && (dmSearch ? m.full_name?.toLowerCase().includes(dmSearch.toLowerCase()) : true)) || [];

  const getChannelName = (ch) => {
    if (ch.type === "direct") return ch.displayName || ch._dmUser?.full_name || ch.name;
    return ch.name;
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* LEFT SIDEBAR */}
      <div style={{ width: 260, background: "#0F172A", display: "flex", flexDirection: "column", borderRight: "1px solid #1E293B", flexShrink: 0 }}>
        {/* Workspace Name */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1E293B" }}>
          <div style={{ color: "#F8FAFC", fontSize: 13.5, fontWeight: 700 }}>Team Chat</div>
          <div style={{ color: "#475569", fontSize: 11.5, marginTop: 1 }}>{profile?.full_name}</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }} className="custom-scroll">
          {/* Channels */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px 2px" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", letterSpacing: "0.06em" }}>CHANNELS</span>
              <button
                onClick={() => setShowNewChannel(true)}
                style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 2, borderRadius: 4 }}
                title="New Channel"
              >
                <Plus size={13} />
              </button>
            </div>
            {channelList.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 10px",
                  background: activeChannel?.id === ch.id ? "#1E293B" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: activeChannel?.id === ch.id ? "#F8FAFC" : "#94A3B8",
                  fontSize: 13,
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "all 0.1s",
                }}
              >
                <Hash size={14} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
              </button>
            ))}
          </div>

          {/* Direct Messages */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px 2px" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", letterSpacing: "0.06em" }}>DIRECT MESSAGES</span>
              <button
                onClick={() => setShowDmSearch((v) => !v)}
                style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 2, borderRadius: 4 }}
                title="New DM"
              >
                <Plus size={13} />
              </button>
            </div>
            {showDmSearch && (
              <div style={{ padding: "4px 8px 8px" }}>
                <input
                  autoFocus
                  className="crm-input"
                  value={dmSearch}
                  onChange={(e) => setDmSearch(e.target.value)}
                  placeholder="Search teammates..."
                  style={{ fontSize: 12, height: 30, background: "#1E293B", border: "1px solid #334155", color: "#F8FAFC" }}
                />
                {dmSearch && filteredTeam.slice(0, 5).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleStartDM(m)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "none", border: "none", cursor: "pointer", color: "#CBD5E1", fontSize: 12.5, borderRadius: 6, fontFamily: "inherit" }}
                    className="hover:bg-slate-800"
                  >
                    <Avatar user={m} size={20} />
                    {m.full_name}
                  </button>
                ))}
              </div>
            )}
            {dmList.map((ch) => {
              const dmUser = ch._dmUser;
              const displayName = ch.displayName || dmUser?.full_name || ch.name;
              const isOnline = dmUser?.online_at && new Date(dmUser.online_at) > new Date(Date.now() - 5 * 60 * 1000);
              return (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannel(ch)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", background: activeChannel?.id === ch.id ? "#1E293B" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: activeChannel?.id === ch.id ? "#F8FAFC" : "#94A3B8", fontSize: 13, fontFamily: "inherit", textAlign: "left", transition: "all 0.1s" }}
                >
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "linear-gradient(135deg,#1B76D3,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white" }}>
                      {displayName?.[0]?.toUpperCase() || "D"}
                    </div>
                    <div style={{ position: "absolute", bottom: -1, right: -1, width: 7, height: 7, borderRadius: "50%", background: isOnline ? "#10B981" : "#475569", border: "1.5px solid #0F172A" }} />
                  </div>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      {activeChannel ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Channel Header */}
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", flexShrink: 0 }}>
            <Hash size={16} style={{ color: "#1B76D3" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{activeChannel.name}</div>
              {activeChannel.description && <div style={{ fontSize: 11.5, color: "#94A3B8" }}>{activeChannel.description}</div>}
            </div>
            <button
              onClick={() => { setActiveCall((v) => !v); setCallFullscreen(false); }}
              title={activeCall ? "End video call" : "Start video call"}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                background: activeCall ? "#FEE2E2" : "linear-gradient(135deg, #1B76D3, #0EA5E9)",
                color: activeCall ? "#EF4444" : "white",
                fontSize: 12.5, fontWeight: 600, transition: "all 0.15s",
              }}
            >
              {activeCall ? <><VideoOff size={14} /> End Call</> : <><Video size={14} /> Video Call</>}
            </button>
          </div>

          {/* Video Call Panel */}
          {activeCall && (
            <div style={{
              height: callFullscreen ? "100%" : 340,
              position: callFullscreen ? "absolute" : "relative",
              top: 0, left: 0, right: 0, bottom: 0,
              background: "#0F172A",
              borderBottom: "1px solid #1E293B",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              zIndex: callFullscreen ? 50 : "auto",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: "#1E293B" }}>
                <span style={{ color: "#94A3B8", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981" }} />
                  Video Call · #{activeChannel.name}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setCallFullscreen((v) => !v)} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", padding: 4 }} title="Toggle fullscreen">
                    <Maximize2 size={13} />
                  </button>
                  <button onClick={() => setActiveCall(false)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", padding: 4 }} title="Leave call">
                    <PhoneOff size={13} />
                  </button>
                </div>
              </div>
              <iframe
                src={`https://meet.jit.si/ccentrik-${activeChannel.id?.replace(/-/g, "").slice(0, 16)}#userInfo.displayName="${encodeURIComponent(profile?.full_name || "User")}"&config.startWithVideoMuted=false&config.startWithAudioMuted=false&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.TOOLBAR_BUTTONS=["microphone","camera","hangup","chat","tileview","fullscreen"]`}
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                style={{ flex: 1, border: "none", width: "100%" }}
                title="Video Call"
              />
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "var(--bg)" }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
                <MessageSquare size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>Start the conversation</div>
                <p style={{ fontSize: 12.5, marginTop: 4 }}>Be the first to send a message in #{activeChannel.name}</p>
              </div>
            ) : (
              groupMessages(messages).map((group, i) =>
                group.type === "date" ? (
                  <DateSeparator key={`date-${i}`} date={group.date} />
                ) : (
                  <MessageGroup
                    key={`group-${i}`}
                    messages={group.messages}
                    currentUserId={profile?.id}
                    onReact={handleReact}
                    onDelete={handleDeleteMessage}
                  />
                )
              )
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
            <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "8px 12px", transition: "border 0.15s" }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message #${activeChannel.name}`}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13.5, color: "var(--text)", fontFamily: "inherit", resize: "none", maxHeight: 120, lineHeight: 1.5 }}
                  rows={1}
                />
              </div>
              <button
                type="submit"
                disabled={!input.trim() || sending}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: input.trim() ? "#1B76D3" : "#F1F5F9",
                  border: "none",
                  cursor: input.trim() ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s",
                  flexShrink: 0,
                }}
              >
                <Send size={16} style={{ color: input.trim() ? "white" : "#CBD5E1" }} />
              </button>
            </form>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
              Press Enter to send · Shift+Enter for new line
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#94A3B8" }}>
          <MessageSquare size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "#64748B" }}>Welcome to Team Chat</div>
          <p style={{ fontSize: 13, marginTop: 8, textAlign: "center" }}>
            Select a channel from the left to start chatting
          </p>
          <button
            className="btn-primary"
            onClick={() => setShowNewChannel(true)}
            style={{ marginTop: 16, fontSize: 13 }}
          >
            <Hash size={14} /> Create a channel
          </button>
        </div>
      )}

      {/* New Channel Modal */}
      {showNewChannel && (
        <div className="modal-overlay" onClick={() => setShowNewChannel(false)}>
          <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Create Channel</h2>
              <button onClick={() => setShowNewChannel(false)} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label className="crm-label">Channel Name</label>
                <div style={{ position: "relative" }}>
                  <Hash size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
                  <input className="crm-input" value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="general" style={{ paddingLeft: 28 }} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label className="crm-label">Description (optional)</label>
                <input className="crm-input" value={channelDesc} onChange={(e) => setChannelDesc(e.target.value)} placeholder="What's this channel about?" />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn-secondary" onClick={() => setShowNewChannel(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreateChannel} disabled={!channelName.trim()}>Create Channel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
