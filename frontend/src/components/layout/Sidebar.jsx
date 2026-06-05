import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../supabaseClient";
import {
  ChevronLeft, ChevronRight,
  LayoutDashboard, Workflow, UserSearch, Handshake,
  Target, CalendarDays, Activity, ClipboardList,
  MessageCircle, PieChart, TrendingUp, Users2, ShieldCheck, Brain,
} from "lucide-react";
import logoWhite from "../../assets/logo-white.png";
import logoBlue from "../../assets/Logo-blue.png";


const NAV = [
  {
    section: "SALES",
    items: [
      { to: "/dashboard",  icon: LayoutDashboard, label: "Dashboard" },
      { to: "/pipeline",   icon: Workflow,        label: "Pipeline"  },
      { to: "/leads",      icon: UserSearch,      label: "Leads"     },
      { to: "/deals",      icon: Handshake,       label: "Deals"     },
    ],
  },
  {
    section: "PRODUCTIVITY",
    items: [
      { to: "/targets",    icon: Target,         label: "Targets"    },
      { to: "/meetings",   icon: CalendarDays,   label: "Meetings"   },
      { to: "/activities", icon: Activity,       label: "Activities" },
      { to: "/dsr",        icon: ClipboardList,  label: "DSR"        },
      { to: "/chat",       icon: MessageCircle,  label: "Chat"       },
    ],
  },
  {
    section: "INSIGHTS",
    items: [
      { to: "/reports",       icon: PieChart,    label: "Reports",       ownerOnly: true },
      { to: "/analytics",     icon: TrendingUp,  label: "Analytics" },
      { to: "/team",          icon: Users2,      label: "Team" },
      { to: "/security-logs", icon: ShieldCheck, label: "Security Logs", ownerOnly: true },
    ],
  },
  {
    section: "INTELLIGENCE",
    items: [
      { to: "/ai-assistant", icon: Brain, label: "AI Command", highlight: true },
    ],
  },
];


/* Sidebar palette — Ccentrik brand: deep navy + high-contrast white type + blue accents */
const SB = {
  bg:       "#1E1E2F",
  border:   "rgba(255,255,255,0.09)",
  divider:  "rgba(255,255,255,0.06)",
  text:     "rgba(255,255,255,0.65)",
  textHov:  "#E5E7EB",
  active:   "#FFFFFF",
  activeBg: "#3B82F6",
  violet:   "#A78BFA",
  violetBg: "rgba(139,92,246,0.15)",
};

function SidebarLink({ item, collapsed, badge }) {
  const location = useLocation();
  const isActive = location.pathname === item.to ||
    (item.to !== "/dashboard" && location.pathname.startsWith(item.to));
  const isHighlight = item.highlight && !isActive;

  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: collapsed ? "11px 0" : "10px 14px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 9,
        textDecoration: "none",
        marginBottom: 2,
        position: "relative",
        overflow: "hidden",
        whiteSpace: "nowrap",
        letterSpacing: "-0.01em",
        fontSize: 14,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? SB.active : isHighlight ? SB.violet : SB.text,
        transition: "color 0.15s",
        background: isHighlight && !collapsed ? SB.violetBg : undefined,
        border: isHighlight && !collapsed ? `1px solid rgba(139,92,246,0.18)` : "1px solid transparent",
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = isHighlight ? "#C4B5FD" : SB.textHov; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = isHighlight ? SB.violet : SB.text; }}
    >
      {/* Active background pill */}
      <AnimatePresence>
        {isActive && (
          <motion.span
            key="pill"
            layoutId="sb-active-pill"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            style={{
              position: "absolute", inset: 0,
              background: SB.activeBg,
              borderRadius: 9,
              zIndex: 0,
            }}
          />
        )}
      </AnimatePresence>

      {/* Hover background */}
      <motion.span
        style={{ position: "absolute", inset: 0, borderRadius: 9, zIndex: 0, background: "rgba(255,255,255,0)" }}
        whileHover={!isActive ? { background: "rgba(255,255,255,0.08)" } : {}}
        transition={{ duration: 0.12 }}
      />

      {/* Icon */}
      <motion.span
        style={{ position: "relative", zIndex: 1, display: "flex", flexShrink: 0 }}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.88 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
      >
        <item.icon
          size={20}
          strokeWidth={isActive ? 1.8 : 1.5}
          style={
            isActive
              ? { filter: "drop-shadow(0 0 5px rgba(255,255,255,0.5))" }
              : isHighlight
              ? { filter: "drop-shadow(0 0 4px rgba(167,139,250,0.45))" }
              : {}
          }
        />
        {/* Active accent dot */}
        <AnimatePresence>
          {isActive && (
            <motion.span
              key="glow-dot"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              style={{
                position: "absolute",
                top: -1, right: -2,
                width: 5, height: 5,
                borderRadius: "50%",
                background: "#FFFFFF",
                boxShadow: `0 0 6px rgba(255,255,255,0.9), 0 0 12px rgba(255,255,255,0.4)`,
              }}
            />
          )}
        </AnimatePresence>
        {/* Badge on icon when collapsed */}
        {collapsed && badge > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -5,
            minWidth: 14, height: 14, borderRadius: 7,
            background: "#EF4444", border: `1.5px solid ${SB.bg}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8.5, fontWeight: 800, color: "#fff",
            lineHeight: 1, padding: "0 2px",
          }}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </motion.span>

      {/* Label */}
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            key="label"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.18 }}
            style={{ position: "relative", zIndex: 1, flex: 1 }}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Badge on label when expanded */}
      {!collapsed && badge > 0 && (
        <AnimatePresence>
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            style={{
              position: "relative", zIndex: 1,
              minWidth: 18, height: 16, borderRadius: 8,
              background: "rgba(239,68,68,0.8)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, color: "#fff",
              padding: "0 4px",
            }}
          >
            {badge > 99 ? "99+" : badge}
          </motion.span>
        </AnimatePresence>
      )}
    </NavLink>
  );
}

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { profile, isManager } = useAuth();
  const normRole = (profile?.role || "").toLowerCase().replace(/[- ]/g, "_");
  const isOwnerOrHead = ["owner", "sales_head"].includes(normRole);

  // Live badge counts
  const { data: pendingTaskCount = 0 } = useQuery({
    queryKey: ["sidebar-task-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .not("status", "in", '("done","cancelled")');
      return count || 0;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: unreadNotifCount = 0 } = useQuery({
    queryKey: ["sidebar-notif-count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("read", false);
      return count || 0;
    },
    enabled: !!profile?.id,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const BADGES = { "/tasks": pendingTaskCount, "/targets": 0 };

  return (
    <div className={`sidebar-wrapper${mobileOpen ? " sidebar-mobile-open" : ""}`}>
    <motion.aside
      animate={{ width: collapsed ? 60 : 236, minWidth: collapsed ? 60 : 236 }}
      transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
      style={{
        background: SB.bg,
        borderRight: `1px solid ${SB.border}`,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        overflow: "visible",
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Subtle top depth — barely visible, just for depth */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 160,
        background: "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)",
        pointerEvents: "none",
      }} />

      {/* Branding Header */}
      <div style={{
        height: 72,
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "0 14px" : "0 14px 0 20px",
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
        flexShrink: 0, position: "relative",
        overflow: "hidden",
      }}>
        {/* Violet top cap */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, rgba(139,92,246,0.5) 0%, rgba(139,92,246,0.12) 55%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* Logo — mix-blend-mode:screen removes the baked-in black PNG background */}
        <img
          src={logoWhite}
          alt="Ccentrik"
          style={{
            height: collapsed ? 24 : 44,
            width: "auto",
            maxWidth: collapsed ? 30 : 162,
            objectFit: "contain",
            display: "block",
            mixBlendMode: "screen",
            transition: "height 0.22s ease",
            flexShrink: 0,
          }}
          onError={(e) => { e.currentTarget.src = logoBlue; e.currentTarget.style.filter = "brightness(0) invert(1)"; e.currentTarget.style.mixBlendMode = "normal"; }}
        />

        {/* Collapse button */}
        {!collapsed && (
          <motion.button
            whileHover={{ color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.05)" }}
            whileTap={{ scale: 0.88 }}
            onClick={() => setCollapsed(true)}
            style={{
              background: "none", border: "none",
              color: "rgba(255,255,255,0.35)",
              cursor: "pointer", padding: "5px 6px",
              borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "color 0.15s, background 0.15s",
            }}
          >
            <ChevronLeft size={13} />
          </motion.button>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "10px 8px 8px", overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 0 }} className="custom-scroll">
        {NAV.map((section) => (
          <div key={section.section} style={{ marginBottom: 4 }}>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="nav-section-label"
                >
                  {section.section}
                </motion.div>
              )}
            </AnimatePresence>
            {collapsed && <div style={{ height: 10 }} />}
            {section.items
              .filter((item) => {
                if (item.ownerOnly   && !isOwnerOrHead) return false;
                if (item.managerOnly && !isManager)     return false;
                return true;
              })
              .map((item) => (
                <SidebarLink key={item.to} item={item} collapsed={collapsed} badge={BADGES[item.to] || 0} />
              ))}
          </div>
        ))}

      </nav>


      {/* Expand toggle */}
      <AnimatePresence>
        {collapsed && (
          <motion.button
            key="expand-btn"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            whileHover={{ borderColor: "rgba(59,130,246,0.6)", color: "#60A5FA", background: "#2A2A45" }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setCollapsed(false)}
            style={{
              position: "absolute", top: "50%", right: -12,
              transform: "translateY(-50%)",
              background: "#252542",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "50%",
              width: 24, height: 24,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              color: "rgba(255,255,255,0.32)",
              zIndex: 30,
              boxShadow: "0 2px 12px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)",
              transition: "color 0.15s, background 0.15s, border-color 0.15s",
            }}
          >
            <ChevronRight size={11} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.aside>
    </div>
  );
}
