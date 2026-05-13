import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { Bell, Search, ChevronDown, User, Settings, LogOut, Sun, Moon, Monitor, Command, Menu, Brain, Plus, UserPlus, BriefcaseBusiness, CalendarCheck } from "lucide-react";

const ROLE_LABELS = { owner: "Super Admin", sales_head: "Sales Head", sales_manager: "Sales Manager", employee: "Employee" };
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../supabaseClient";
import { format } from "date-fns";

const PAGE_TITLES = {
  "/dashboard":    { label: "Command Center",  sub: "Sales overview & live metrics" },
  "/leads":        { label: "Lead Intelligence", sub: "Smart lead management" },
  "/deals":        { label: "Deal Pipeline",     sub: "Revenue tracking & forecasting" },
  "/customers":    { label: "Customer Hub",      sub: "Account management" },
  "/tasks":        { label: "Task Center",       sub: "Productivity & reminders" },
  "/meetings":     { label: "Meetings",          sub: "Schedule & manage calls" },
  "/chat":         { label: "Team Chat",         sub: "Real-time collaboration" },
  "/analytics":    { label: "Analytics",         sub: "Performance metrics" },
  "/team":         { label: "Team",              sub: "Manage your team" },
  "/settings":     { label: "Settings",          sub: "Account & preferences" },
  "/activities":   { label: "Activity Feed",     sub: "All CRM activity" },
  "/reports":      { label: "Reports",           sub: "Analytics & insights" },
  "/ai-assistant": { label: "AI Sidekick",       sub: "Your intelligent sales partner" },
};

function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

const QUICK_CREATE = [
  { icon: UserPlus,         label: "New Lead",    to: "/leads" },
  { icon: BriefcaseBusiness, label: "New Deal",   to: "/deals" },
  { icon: CalendarCheck,    label: "New Task",    to: "/tasks" },
  { icon: CalendarDays,     label: "New Meeting", to: "/meetings" },
];

import { CalendarDays } from "lucide-react";

export default function Header({ onMobileMenu, onCommandPalette }) {
  const { profile, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu]           = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showQuickCreate, setShowQuickCreate]     = useState(false);
  const [notifications, setNotifications]         = useState([]);
  const [unreadCount, setUnreadCount]              = useState(0);
  const userMenuRef      = useRef(null);
  const notifRef         = useRef(null);
  const quickCreateRef   = useRef(null);
  const clock            = useLiveClock();

  const pageInfo  = PAGE_TITLES[location.pathname] || { label: location.pathname.slice(1), sub: "" };
  const initials  = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  useEffect(() => {
    if (!profile?.id) return;
    fetchNotifications();
    const sub = supabase.channel("notif-hdr")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, () => fetchNotifications())
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [profile?.id]);

  const fetchNotifications = async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(20);
    if (data) { setNotifications(data); setUnreadCount(data.filter((n) => !n.read).length); }
  };

  const markAllRead = async () => {
    if (!profile?.id) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", profile.id).eq("read", false);
    fetchNotifications();
  };

  const markRead = async (id) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    fetchNotifications();
  };

  useEffect(() => {
    const h = (e) => {
      if (userMenuRef.current    && !userMenuRef.current.contains(e.target))    setShowUserMenu(false);
      if (notifRef.current       && !notifRef.current.contains(e.target))       setShowNotifications(false);
      if (quickCreateRef.current && !quickCreateRef.current.contains(e.target)) setShowQuickCreate(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleLogout = async () => { await logout(); navigate("/login"); };

  return (
    <header style={{
      height: 58,
      background: "var(--header-bg)",
      borderBottom: "1px solid var(--header-border)",
      display: "flex",
      alignItems: "center",
      paddingLeft: 22,
      paddingRight: 18,
      gap: 10,
      position: "sticky",
      top: 0,
      zIndex: 10,
      flexShrink: 0,
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
    }}>

      {/* Hamburger — mobile only */}
      <button
        className="mobile-menu-btn"
        onClick={onMobileMenu}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 4, display: "none", alignItems: "center" }}
      >
        <Menu size={20} strokeWidth={1.8} />
      </button>

      {/* Page title */}
      <div style={{ minWidth: 120 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap", letterSpacing: "-0.03em", lineHeight: 1.2 }}>
          {pageInfo.label}
        </div>
        {pageInfo.sub && (
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", letterSpacing: "-0.01em", fontWeight: 400 }}>
            {pageInfo.sub}
          </div>
        )}
      </div>

      {/* Search — opens Command Palette */}
      <button
        className="header-search"
        onClick={onCommandPalette}
        title="Search (Ctrl+K)"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          height: 36, padding: "0 12px 0 10px",
          background: "var(--surface-2)",
          border: "1.5px solid var(--border)",
          borderRadius: "var(--r-sm)",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontFamily: "inherit",
          fontSize: 13,
          transition: "border-color 0.15s, box-shadow 0.15s",
          minWidth: 200, maxWidth: 300,
          textAlign: "left",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-glow)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
      >
        <Search size={13} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Search anything...</span>
        <kbd style={{ display: "flex", alignItems: "center", gap: 1, padding: "1px 5px", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 5, fontSize: 9.5, color: "var(--text-muted)", fontFamily: "inherit", fontWeight: 600, letterSpacing: 0, flexShrink: 0 }}>
          <Command size={8} /> K
        </kbd>
      </button>

      <div style={{ flex: 1 }} />

      {/* Live Clock */}
      <div className="live-clock" style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span className="live-indicator" />
        <span>{clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span>{clock.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
      </div>

      {/* Quick Create */}
      <div style={{ position: "relative" }} ref={quickCreateRef}>
        <motion.button
          className="btn-primary"
          style={{ height: 34, padding: "0 14px", fontSize: 12.5, gap: 5 }}
          onClick={() => { setShowQuickCreate((v) => !v); setShowNotifications(false); setShowUserMenu(false); }}
          whileTap={{ scale: 0.95 }}
        >
          <Plus size={13} strokeWidth={2.5} /> New
        </motion.button>
        <AnimatePresence>
          {showQuickCreate && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.14, ease: [0.4,0,0.2,1] }}
              className="dropdown-menu"
              style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 190, zIndex: 50 }}
            >
              <div style={{ padding: "8px 0" }}>
                {QUICK_CREATE.map(({ icon: Icon, label, to }) => (
                  <button key={label} className="dropdown-item" onClick={() => { navigate(to); setShowQuickCreate(false); }}>
                    <Icon size={13} strokeWidth={1.75} style={{ color: "var(--accent)" }} /> {label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Sidekick quick link */}
      <motion.button
        className="icon-btn"
        onClick={() => navigate("/ai-assistant")}
        title="AI Sidekick"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.88 }}
        style={{ color: location.pathname === "/ai-assistant" ? "#A78BFA" : undefined }}
      >
        <Brain size={16} strokeWidth={1.75} style={location.pathname === "/ai-assistant" ? { filter: "drop-shadow(0 0 6px rgba(167,139,250,0.7))" } : {}} />
      </motion.button>

      {/* Theme toggle */}
      <div className="theme-toggle">
        {[["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]].map(([key, Icon, label]) => (
          <button
            key={key}
            className={`theme-btn${theme === key ? " active" : ""}`}
            onClick={() => setTheme(key)}
            title={`${label} mode`}
          >
            <Icon size={13} strokeWidth={1.8} />
          </button>
        ))}
      </div>

      {/* Notifications */}
      <div style={{ position: "relative" }} ref={notifRef}>
        <motion.button
          className={`icon-btn${showNotifications ? " active" : ""}`}
          onClick={() => { setShowNotifications((v) => !v); setShowUserMenu(false); }}
          title="Notifications"
          style={{ position: "relative" }}
          animate={unreadCount > 0 ? { rotate: [0, -12, 12, -8, 8, -4, 4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.75, repeat: unreadCount > 0 ? Infinity : 0, repeatDelay: 5, ease: "easeInOut" }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.88 }}
        >
          <Bell size={16} strokeWidth={1.75} />
          {unreadCount > 0 && <span className="notif-dot-lg">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </motion.button>

        <AnimatePresence>
          {showNotifications && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.16, ease: [0.4,0,0.2,1] }}
              className="dropdown-menu"
              style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 348, zIndex: 50 }}
            >
              <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", letterSpacing: "-0.02em" }}>Notifications</span>
                {unreadCount > 0 && <button onClick={markAllRead} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Mark all read</button>}
              </div>
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 }}>
                    <Bell size={28} style={{ margin: "0 auto 10px", display: "block", opacity: 0.14 }} />
                    No notifications yet
                  </div>
                ) : notifications.map((n) => (
                  <div key={n.id} onClick={() => markRead(n.id)}
                    style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: n.read ? "transparent" : "var(--accent-light)", display: "flex", gap: 10, alignItems: "flex-start", transition: "background 0.1s" }}
                    onMouseEnter={(e) => { if (n.read) e.currentTarget.style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = n.read ? "transparent" : "var(--accent-light)"; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: n.read ? 400 : 600, color: "var(--text)", marginBottom: 2 }}>{n.title}</div>
                      {n.message && <div style={{ fontSize: 12, color: "var(--text-2)" }}>{n.message}</div>}
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>{format(new Date(n.created_at), "MMM d, h:mm a")}</div>
                    </div>
                    {!n.read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 4 }} />}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0, opacity: 0.7 }} />

      {/* User menu */}
      <div style={{ position: "relative" }} ref={userMenuRef}>
        <motion.button
          onClick={() => { setShowUserMenu((v) => !v); setShowNotifications(false); }}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: showUserMenu ? "var(--surface-2)" : "transparent",
            border: "none", cursor: "pointer",
            padding: "5px 8px 5px 4px",
            borderRadius: 11, fontFamily: "inherit",
            transition: "background 0.13s",
          }}
          whileHover={{ background: "var(--surface-2)" }}
          whileTap={{ scale: 0.97 }}
        >
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,#2563EB,#4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", overflow: "hidden", flexShrink: 0, boxShadow: "0 2px 8px rgba(37,99,235,0.35)" }}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt={initials} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 9 }} /> : initials}
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.25, letterSpacing: "-0.015em" }}>{profile?.full_name?.split(" ")[0] || "User"}</div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "capitalize" }}>{ROLE_LABELS[profile?.role] || "Employee"}</div>
          </div>
          <motion.div animate={{ rotate: showUserMenu ? 180 : 0 }} transition={{ duration: 0.18 }}>
            <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {showUserMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.16, ease: [0.4,0,0.2,1] }}
              className="dropdown-menu"
              style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 215, zIndex: 50 }}
            >
              <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.01em" }}>{profile?.full_name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>{profile?.email}</div>
              </div>
              {[{ icon: User, label: "Profile" }, { icon: Settings, label: "Settings" }].map((item) => (
                <button key={item.label} className="dropdown-item" onClick={() => { navigate("/settings"); setShowUserMenu(false); }}>
                  <item.icon size={13} strokeWidth={1.7} /> {item.label}
                </button>
              ))}
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <button className="dropdown-item danger" onClick={handleLogout}>
                  <LogOut size={13} strokeWidth={1.7} /> Sign out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
