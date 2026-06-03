import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { analyticsService } from "../services/analyticsService";
import { meetingsService } from "../services/meetingsService";
import { tasksService } from "../services/tasksService";
import { leadsService } from "../services/leadsService";
import { teamService } from "../services/teamService";
import { LeadModal } from "./Leads";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  UserPlus, IndianRupee, Briefcase, TrendingUp, Building2, ListChecks,
  CalendarDays, CalendarPlus, CalendarCheck, Clock, Activity,
  ChevronRight, ChevronDown, ChevronUp, Plus, Zap, AlertCircle,
  Sparkles, ArrowUpRight, ExternalLink, Flame, PhoneCall, Video,
  Target, Users, ArrowUp, ArrowDown, LayoutDashboard, CheckCircle2,
  Star, Trophy, Bolt, Signal, Workflow, AlertTriangle, GripVertical,
  Mail, FileText, RefreshCw, Phone, Eye, EyeOff, BarChart2, X,
  TrendingDown, Layers, Maximize2, Minimize2, Pin, PinOff,
} from "lucide-react";
import { format, isToday, isTomorrow, isPast, startOfDay, endOfDay, subDays } from "date-fns";

/* ─── Palette ───────────────────────────────────────────────────────────── */
const C = {
  blue:   { solid: "#3B82F6", light: "rgba(59,130,246,0.1)",  grad: ["#2563EB","#60A5FA"] },
  green:  { solid: "#10B981", light: "rgba(16,185,129,0.1)",  grad: ["#059669","#34D399"] },
  amber:  { solid: "#F59E0B", light: "rgba(245,158,11,0.1)",  grad: ["#D97706","#FCD34D"] },
  purple: { solid: "#8B5CF6", light: "rgba(139,92,246,0.1)",  grad: ["#7C3AED","#C4B5FD"] },
  teal:   { solid: "#14B8A6", light: "rgba(20,184,166,0.1)",  grad: ["#0D9488","#5EEAD4"] },
  rose:   { solid: "#F43F5E", light: "rgba(244,63,94,0.1)",   grad: ["#E11D48","#FB7185"] },
  orange: { solid: "#F97316", light: "rgba(249,115,22,0.1)",  grad: ["#EA580C","#FB923C"] },
  indigo: { solid: "#6366F1", light: "rgba(99,102,241,0.1)",  grad: ["#4F46E5","#818CF8"] },
};

/* ─── Activity Types ───────────────────────────────────────────────────── */
const ACT_TYPES = {
  follow_up_call:  { label: "Follow-up Call",  short: "FU Call",   icon: RefreshCw, color: "#F59E0B" },
  follow_up_email: { label: "Follow-up Email", short: "FU Email",  icon: RefreshCw, color: "#06B6D4" },
  call:            { label: "Call",            short: "Call",      icon: Phone,     color: "#3B82F6" },
  email:           { label: "Email",           short: "Email",     icon: Mail,      color: "#EC4899" },
  note:            { label: "Note",            short: "Note",      icon: FileText,  color: "#10B981" },
  meeting_person:  { label: "In-Person",       short: "In-Person", icon: Users,     color: "#8B5CF6" },
  meeting_virtual: { label: "Virtual Meeting", short: "Virtual",   icon: Video,     color: "#6366F1" },
};

function resolveActType(t) {
  if (!t) return "note";
  const s = t.toLowerCase().replace(/[-\s]/g, "_");
  if (s === "follow_up_call" || s === "follow_up") return "follow_up_call";
  if (s === "follow_up_email") return "follow_up_email";
  if (s === "meeting_person"  || s === "in_person" || s === "visit") return "meeting_person";
  if (s === "meeting_virtual" || s === "virtual_meeting" || s === "meeting") return "meeting_virtual";
  if (["call","phone_call","cold_call","demo","introductory","verification","other"].includes(s)) return "call";
  if (s === "email") return "email";
  return "note";
}

function getContextRoute(item) {
  // Explicit entity references (highest priority)
  if (item.entity_type === "lead"     && item.entity_id) return `/leads?selected=${item.entity_id}`;
  if (item.entity_type === "deal"     && item.entity_id) return `/deals?selected=${item.entity_id}`;
  if (item.entity_type === "meeting"  || item._cat === "meeting")  return "/meetings";
  if (item.entity_type === "pipeline")                             return "/pipeline";

  // FK references on the activity/task row itself
  if (item.lead_id)  return `/leads?selected=${item.lead_id}`;
  if (item.deal_id)  return `/deals?selected=${item.deal_id}`;

  // Type-based routing for meeting activities with no explicit lead/deal link
  const t = (item.type || "").toLowerCase();
  if (t === "meeting_virtual" || t === "meeting_person" || t === "meeting") return "/meetings";
  if (t === "pipeline") return "/pipeline";

  // Tasks and standalone activities — route to the Activities module
  // (activities page is the correct home for standalone items)
  return "/activities";
}

/* ─── Greeting ─────────────────────────────────────────────────────────── */
const ROLE_LABELS = {
  owner: "Super Admin", sales_head: "Sales Head",
  sales_manager: "Sales Manager", inside_sales: "Inside Sales",
  employee: "Sales Rep",
};
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ─── Counter Hook ─────────────────────────────────────────────────────── */
function useCountUp(target, duration = 800) {
  const [count, setCount] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const n = Number(target) || 0;
    const diff = n - prev.current;
    if (!diff) return;
    const steps = Math.min(40, Math.abs(diff));
    const step = diff / steps;
    let cur = prev.current, frame = 0;
    const t = setInterval(() => {
      frame++;
      cur += step;
      if (frame >= steps) { setCount(n); prev.current = n; clearInterval(t); }
      else setCount(Math.round(cur));
    }, duration / steps);
    return () => clearInterval(t);
  }, [target, duration]);
  return count;
}

/* ─── Widget persistence ──────────────────────────────────────────────── */
function useWidgetPrefs(userId, defaultOrder, defaultCollapsed = []) {
  const orderKey     = `dash_order_${userId}`;
  const colKey       = `dash_collapsed_${userId}`;
  const [order, setOrder_]         = useState(() => {
    try { const s = localStorage.getItem(orderKey); return s ? JSON.parse(s) : defaultOrder; }
    catch { return defaultOrder; }
  });
  const [collapsed, setCollapsed_] = useState(() => {
    try { const s = localStorage.getItem(colKey); return s ? new Set(JSON.parse(s)) : new Set(defaultCollapsed); }
    catch { return new Set(defaultCollapsed); }
  });

  const setOrder = useCallback((v) => {
    setOrder_(v); localStorage.setItem(orderKey, JSON.stringify(v));
  }, [orderKey]);
  const toggleCollapse = useCallback((id) => {
    setCollapsed_((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(colKey, JSON.stringify([...next]));
      return next;
    });
  }, [colKey]);

  return { order, setOrder, collapsed, toggleCollapse };
}

/* ─── Sortable Widget Shell ─────────────────────────────────────────────── */
function SortableWidget({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 50 : "auto",
      }}
    >
      {children({ dragHandleProps: { ...attributes, ...listeners } })}
    </div>
  );
}

/* ─── Widget Container ──────────────────────────────────────────────────── */
function Widget({ id, title, sub, icon: Icon, iconColor = "#6366F1", collapsed, onToggle,
  dragHandleProps, to, navigate, actions, children, noPad = false }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      transition: "box-shadow 0.15s",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        borderBottom: collapsed ? "none" : "1px solid var(--border)",
        background: "var(--surface)",
        minHeight: 48,
      }}>
        {/* Drag handle */}
        <div {...dragHandleProps} style={{ cursor: "grab", color: "var(--text-muted)", opacity: 0.4, flexShrink: 0, display: "flex", alignItems: "center" }}>
          <GripVertical size={14} />
        </div>

        {Icon && (
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `${iconColor}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={13} style={{ color: iconColor }} strokeWidth={2} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          {sub && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {actions}
          {to && (
            <button onClick={() => navigate(to)} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit", padding: "2px 0" }}>
              All <ChevronRight size={10} />
            </button>
          )}
          <button onClick={() => onToggle(id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", padding: 2 }}>
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>
      {/* Body */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={noPad ? {} : { padding: "14px 16px" }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── KPI Pill (single, hook-safe) ──────────────────────────────────────── */
function KPIPill({ label, value, color, to, loading, navigate, fmt }) {
  const anim    = useCountUp(Number(value) || 0);
  const display = fmt ? fmt(Number(value) || 0) : anim.toLocaleString();
  return (
    <motion.button
      onClick={() => to && navigate(to)}
      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 99, background: "var(--surface)", border: "1.5px solid var(--border)", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "border-color 0.15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}50`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}80`, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{label}</span>
      {loading ? (
        <span style={{ width: 28, height: 14, borderRadius: 4, background: "var(--surface-3)" }} className="skeleton" />
      ) : (
        <span style={{ fontSize: 13.5, fontWeight: 800, color, letterSpacing: "-0.03em" }}>{display}</span>
      )}
    </motion.button>
  );
}

/* ─── KPI Strip ──────────────────────────────────────────────────────────── */
function KPIStrip({ stats, loading, fieldKPIs, isFieldUser, navigate, formatCompact, symbol }) {
  const pills = isFieldUser ? fieldKPIs : [
    { label: "Pipeline",    value: stats?.totalPipeline || 0, color: C.indigo.solid, to: "/pipeline"  },
    { label: "Total Leads", value: stats?.totalLeads    || 0, color: C.blue.solid,   to: "/leads"     },
    { label: "Active Deals",value: stats?.activeDeals   || 0, color: C.amber.solid,  to: "/deals"     },
    { label: "Revenue Won", value: stats?.revenue       || 0, color: C.green.solid,  to: "/reports",  fmt: (v) => formatCompact(v) },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {pills.map((p) => (
        <KPIPill key={p.label} {...p} loading={loading} navigate={navigate} />
      ))}
    </div>
  );
}

/* ─── Smart Activity Strip ──────────────────────────────────────────────── */
function ActivityCard({ item, navigate, index }) {
  const isActivity = item._source === "activity";
  const typeKey    = isActivity ? resolveActType(item.type) : null;
  const actCfg     = typeKey ? ACT_TYPES[typeKey] : null;
  const isMeeting  = item._cat === "meeting";
  const isOverdue  = item._cat === "overdue";
  const isAnytime  = item._cat === "anytime";
  const baseColor  = isOverdue ? "#EF4444" : isMeeting ? "#8B5CF6" : (actCfg?.color || "#3B82F6");
  const ActIcon    = isMeeting ? CalendarDays : (actCfg?.icon || ListChecks);
  const PCOL       = { urgent: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#22C55E" };
  const prioColor  = PCOL[item.priority] || "#6B7280";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.18 }}
      style={{
        display: "flex", alignItems: "center", gap: 0,
        borderRadius: 10, border: `1px solid ${baseColor}20`,
        borderLeft: `3px solid ${baseColor}`,
        background: isOverdue ? `${baseColor}04` : "var(--surface)",
        overflow: "hidden", transition: "background 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${baseColor}06`; e.currentTarget.style.borderColor = `${baseColor}38`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isOverdue ? `${baseColor}04` : "var(--surface)"; e.currentTarget.style.borderColor = `${baseColor}20`; }}
    >
      {/* Type icon */}
      <div style={{ width: 34, height: 34, borderRadius: 8, background: `${baseColor}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, margin: "9px 10px 9px 10px" }}>
        <ActIcon size={14} style={{ color: baseColor }} strokeWidth={2} />
      </div>
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, padding: "9px 0" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          {actCfg && <span style={{ fontSize: 10, fontWeight: 700, color: actCfg.color, background: `${actCfg.color}12`, padding: "1px 6px", borderRadius: 99 }}>{actCfg.short}</span>}
          {isMeeting && <span style={{ fontSize: 10, fontWeight: 700, color: "#8B5CF6", background: "rgba(139,92,246,0.1)", padding: "1px 6px", borderRadius: 99 }}>Meeting</span>}
          {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", display: "flex", alignItems: "center", gap: 3 }}><AlertTriangle size={9} /> Overdue</span>}
          {isAnytime && <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", background: "rgba(107,114,128,0.1)", padding: "1px 6px", borderRadius: 99 }}>No due date</span>}
          {item.due_date && (
            <span style={{ fontSize: 10.5, color: isOverdue ? "#EF4444" : "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
              <Clock size={9} />
              {isMeeting ? format(new Date(item.due_date), "EEE, MMM d · h:mm a") : format(new Date(item.due_date), "MMM d, h:mm a")}
            </span>
          )}
        </div>
      </div>
      {/* Priority + Open */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", flexShrink: 0 }}>
        {item.priority && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: prioColor, background: `${prioColor}14`, padding: "2px 7px", borderRadius: 99, textTransform: "capitalize" }}>
            {item.priority}
          </span>
        )}
        <motion.button
          whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
          onClick={(e) => { e.stopPropagation(); navigate(isMeeting ? "/meetings" : getContextRoute(item)); }}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, background: `${baseColor}12`, color: baseColor, border: `1px solid ${baseColor}25`, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
        >
          Open <ExternalLink size={10} strokeWidth={2.5} />
        </motion.button>
      </div>
    </motion.div>
  );
}

function SmartActivityStrip({ tasks = [], activities = [], meetings = [], navigate }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const now = new Date();

  const { overdue, todayItems, upcomingItems, meetingItems, undated } = useMemo(() => {
    const allTasks = tasks.filter((t) => !["done","cancelled"].includes(t.status));
    const allActs  = activities;

    const overdue = [
      ...allTasks.filter((t) => t.due_date && isPast(new Date(t.due_date))).map((t) => ({ ...t, _cat: "overdue", _source: "task" })),
      ...allActs.filter((a)  => a.due_date && isPast(new Date(a.due_date))).map((a) => ({ ...a, _cat: "overdue" })),
    ];
    const todayItems = [
      ...allTasks.filter((t) => t.due_date && isToday(new Date(t.due_date)) && !isPast(new Date(t.due_date))).map((t) => ({ ...t, _cat: "today", _source: "task" })),
      ...allActs.filter((a)  => a.due_date && isToday(new Date(a.due_date)) && !isPast(new Date(a.due_date))).map((a) => ({ ...a, _cat: "today" })),
    ];
    const upcomingItems = [
      ...allTasks.filter((t) => t.due_date && !isToday(new Date(t.due_date)) && !isPast(new Date(t.due_date))).map((t) => ({ ...t, _cat: "upcoming", _source: "task" })),
      ...allActs.filter((a)  => a.due_date && !isToday(new Date(a.due_date)) && !isPast(new Date(a.due_date))).map((a) => ({ ...a, _cat: "upcoming" })),
    ];
    const meetingItems = meetings
      .filter((m) => new Date(m.start_time) >= now)
      .map((m) => ({ ...m, _cat: "meeting", _source: "meeting", due_date: m.start_time }));
    const undated = [
      ...allTasks.filter((t) => !t.due_date).map((t) => ({ ...t, _cat: "anytime", _source: "task" })),
      ...allActs.filter((a)  => !a.due_date).map((a) => ({ ...a, _cat: "anytime" })),
    ];

    return { overdue, todayItems, upcomingItems, meetingItems, undated };
  }, [tasks, activities, meetings]);

  const totalPending   = overdue.length + todayItems.length;
  const totalUpcoming  = upcomingItems.length;
  const totalMeetings  = meetingItems.length;
  const hasAnything    = totalPending + totalUpcoming + totalMeetings + undated.length > 0;

  const tabItems = {
    all:      [...overdue, ...todayItems, ...upcomingItems.slice(0, 5), ...meetingItems.slice(0, 3), ...undated.slice(0, 5)],
    overdue:  overdue,
    today:    todayItems,
    upcoming: upcomingItems,
    meetings: meetingItems,
    anytime:  undated,
  };
  const displayItems = tabItems[activeTab] || [];

  const TABS = [
    { key: "all",      label: "All",     count: overdue.length + todayItems.length + upcomingItems.length + meetingItems.length + undated.length },
    { key: "overdue",  label: "Overdue", count: overdue.length,      color: "#EF4444" },
    { key: "today",    label: "Today",   count: todayItems.length,   color: "#F59E0B" },
    { key: "upcoming", label: "Upcoming",count: upcomingItems.length, color: "#3B82F6" },
    { key: "meetings", label: "Meetings",count: meetingItems.length,  color: "#8B5CF6" },
    { key: "anytime",  label: "Anytime", count: undated.length,       color: "#6B7280" },
  ];

  /* Summary chips */
  const chips = [
    overdue.length      && { label: `${overdue.length} Overdue`,       color: "#EF4444", bg: "rgba(239,68,68,0.1)"     },
    todayItems.length   && { label: `${todayItems.length} Due Today`,   color: "#F59E0B", bg: "rgba(245,158,11,0.1)"    },
    upcomingItems.length && { label: `${upcomingItems.length} Upcoming`,color: "#3B82F6", bg: "rgba(59,130,246,0.1)"   },
    meetingItems.length && { label: `${meetingItems.length} Meeting${meetingItems.length > 1 ? "s" : ""}`, color: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
    undated.length      && { label: `${undated.length} Anytime`,        color: "#6B7280", bg: "rgba(107,114,128,0.1)"  },
  ].filter(Boolean);

  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
      {/* Summary bar — always visible */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 8, background: hasAnything ? (overdue.length ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)") : "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {hasAnything
            ? <AlertCircle size={14} style={{ color: overdue.length ? "#EF4444" : "#F59E0B" }} />
            : <CheckCircle2 size={14} style={{ color: "#10B981" }} />
          }
        </div>
        {!hasAnything ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: "#10B981" }}>All clear — no pending activities today</span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", flexShrink: 0 }}>My Activities</span>
            <span style={{ color: "var(--border)", fontSize: 12 }}>·</span>
            {chips.map((chip) => (
              <span key={chip.label} style={{ fontSize: 11.5, fontWeight: 700, color: chip.color, background: chip.bg, padding: "2px 9px", borderRadius: 99 }}>{chip.label}</span>
            ))}
          </div>
        )}
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }} style={{ flexShrink: 0, color: "var(--text-muted)" }}>
          <ChevronDown size={15} />
        </motion.div>
      </div>

      {/* Expanded panel */}
      <AnimatePresence initial={false}>
        {expanded && hasAnything && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ borderTop: "1px solid var(--border)" }}>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 2, padding: "8px 16px", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
                {TABS.filter((t) => t.count > 0 || t.key === "all").map((tab) => (
                  <button
                    key={tab.key}
                    onClick={(e) => { e.stopPropagation(); setActiveTab(tab.key); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 12px", borderRadius: 8, border: "none",
                      fontFamily: "inherit", cursor: "pointer", fontSize: 12, fontWeight: 600,
                      background: activeTab === tab.key ? (tab.color ? `${tab.color}14` : "var(--surface-2)") : "transparent",
                      color: activeTab === tab.key ? (tab.color || "var(--text)") : "var(--text-muted)",
                      flexShrink: 0,
                      transition: "background 0.12s, color 0.12s",
                    }}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: activeTab === tab.key ? (tab.color || "var(--text)") : "var(--text-muted)", background: activeTab === tab.key ? (tab.color ? `${tab.color}18` : "var(--surface-3)") : "var(--surface-2)", padding: "1px 5px", borderRadius: 99, minWidth: 18, textAlign: "center" }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Activity cards */}
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
                {displayItems.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 12.5 }}>
                    <CheckCircle2 size={18} style={{ color: "#10B981", display: "block", margin: "0 auto 6px" }} />
                    Nothing in this category
                  </div>
                ) : displayItems.map((item, i) => (
                  <ActivityCard key={item.id + i} item={item} navigate={navigate} index={i} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Activity Summary Widget ───────────────────────────────────────────── */
function ActivitySummaryWidget({ activities = [], loading = false, isOwner, isSalesHead, navigate, dragHandleProps, collapsed, onToggle }) {
  const [expandedKey, setExpandedKey] = useState(null);
  const now = new Date();

  const pending   = activities.filter((a) => !["done","completed","cancelled","archived"].includes(a.status));
  const overdue   = pending.filter((a) => a.due_date && isPast(new Date(a.due_date)) && !isToday(new Date(a.due_date)));
  const upcoming  = pending.filter((a) => a.due_date && !isPast(new Date(a.due_date)));
  const completed = activities.filter((a) => ["done","completed"].includes(a.status));
  const followups = pending.filter((a) => {
    const t = (a.type || "").toLowerCase().replace(/[-\s]/g, "_");
    return (t === "follow_up_call" || t === "follow_up_email" || t === "follow_up" || t === "followup") && a.due_date && isToday(new Date(a.due_date));
  });

  const CARDS = [
    { key: "pending",   label: "Pending Activities",    count: pending.length,   color: "#F59E0B", icon: Clock,         items: pending   },
    { key: "overdue",   label: "Overdue Activities",    count: overdue.length,   color: "#EF4444", icon: AlertCircle,   items: overdue   },
    { key: "upcoming",  label: "Upcoming Activities",   count: upcoming.length,  color: "#3B82F6", icon: CalendarDays,  items: upcoming  },
    { key: "completed", label: "Completed Activities",  count: completed.length, color: "#10B981", icon: CheckCircle2,  items: completed },
    { key: "followups", label: "Follow-Ups Due Today",  count: followups.length, color: "#8B5CF6", icon: RefreshCw,     items: followups },
  ];

  const expandedItems = expandedKey ? (CARDS.find((c) => c.key === expandedKey)?.items || []) : [];
  const expandedCard  = CARDS.find((c) => c.key === expandedKey);

  const title = isOwner ? "Org Activity Overview" : isSalesHead ? "Team Activity Overview" : "My Activity Summary";
  const sub   = isOwner ? "All users · org-wide" : isSalesHead ? "Team-wide" : "Your activities";

  return (
    <Widget
      id="activity-summary" title={title} sub={sub}
      icon={Activity} iconColor={C.amber.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/activities" navigate={navigate}
      noPad
    >
      {/* ── Count cards ── */}
      <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
        {CARDS.map((card) => {
          const CardIcon = card.icon;
          const active   = expandedKey === card.key;
          return (
            <motion.button
              key={card.key}
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setExpandedKey(active ? null : card.key)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: "12px 6px", borderRadius: 10, fontFamily: "inherit", cursor: "pointer",
                border: `1.5px solid ${active ? card.color + "55" : "var(--border)"}`,
                background: active ? `${card.color}0A` : "var(--surface-2)",
                transition: "all 0.15s",
              }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${card.color}16`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CardIcon size={13} style={{ color: card.color }} strokeWidth={2} />
              </div>
              {loading ? (
                <span className="skeleton" style={{ width: 26, height: 22, borderRadius: 4, display: "block" }} />
              ) : (
                <span style={{ fontSize: 20, fontWeight: 800, color: card.color, lineHeight: 1, letterSpacing: "-0.03em" }}>{card.count}</span>
              )}
              <span style={{ fontSize: 9.5, fontWeight: 600, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.3 }}>
                {card.label}
              </span>
              <span style={{ fontSize: 9, color: active ? card.color : "var(--text-muted)", fontWeight: 600, opacity: 0.7 }}>
                {active ? "▲ Hide" : "▼ View"}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* ── Expanded detail list ── */}
      <AnimatePresence initial={false}>
        {expandedKey && (
          <motion.div
            key={expandedKey}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ borderTop: `2px solid ${expandedCard?.color || "var(--border)"}20` }}>
              {/* List header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 6px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: expandedCard?.color || "var(--text)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
                  {expandedCard && <expandedCard.icon size={11} style={{ color: expandedCard.color }} strokeWidth={2.5} />}
                  {expandedCard?.label} · {expandedItems.length}
                </span>
                <button onClick={() => setExpandedKey(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex", alignItems: "center" }}>
                  <X size={13} />
                </button>
              </div>

              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,2fr) 90px 70px 70px minmax(0,1.4fr) 72px", gap: 8, padding: "6px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                {["Prospect","Company","Type","Due Date","Status","Assigned To",""].map((h) => (
                  <span key={h} style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                ))}
              </div>

              {/* Activity rows */}
              <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                {expandedItems.length === 0 ? (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 }}>
                    <CheckCircle2 size={18} style={{ color: "#10B981", display: "block", margin: "0 auto 6px" }} />
                    Nothing in this category
                  </div>
                ) : expandedItems.slice(0, 60).map((act, i) => {
                  const typeKey   = resolveActType(act.type);
                  const actCfg    = ACT_TYPES[typeKey];
                  const isOvd     = act.due_date && isPast(new Date(act.due_date)) && !isToday(new Date(act.due_date));
                  const isTdy     = act.due_date && isToday(new Date(act.due_date));
                  const leadStage = act.lead?.stage;
                  const actParam  = `&activity=${act.id}`;
                  const route = leadStage === "pipeline"
                    ? `/pipeline?selected=${act.lead_id}${actParam}`
                    : act.lead_id  ? `/leads?selected=${act.lead_id}${actParam}`
                    : act.deal_id  ? `/deals?selected=${act.deal_id}${actParam}`
                    : "/activities";
                  const prospect    = act.lead?.contact_name || "—";
                  const company     = act.lead?.company_name || act.deal?.company_name || "—";
                  const assignedTo  = act.user?.full_name || "—";
                  const userRole    = act.user?.role ? (ROLE_LABELS[act.user.role] || act.user.role) : null;
                  const statusColor = ["done","completed"].includes(act.status) ? "#10B981" : act.status === "cancelled" ? "#6B7280" : isOvd ? "#EF4444" : isTdy ? "#F97316" : "#F59E0B";
                  const rowBg       = isOvd ? "rgba(239,68,68,0.03)" : isTdy ? "rgba(249,115,22,0.02)" : "transparent";

                  return (
                    <motion.div
                      key={act.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.3) }}
                      style={{
                        display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,2fr) 90px 70px 70px minmax(0,1.4fr) 72px",
                        gap: 8, padding: "9px 16px", alignItems: "center",
                        background: rowBg, borderBottom: "1px solid var(--border)",
                        borderLeft: isOvd ? "3px solid #EF4444" : isTdy ? "3px solid #F97316" : "3px solid transparent",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = rowBg; }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={prospect}>{prospect}</span>
                      <span style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={company}>{company}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: actCfg?.color || "#6B7280", background: `${actCfg?.color || "#6B7280"}14`, padding: "2px 7px", borderRadius: 99, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {actCfg?.short || act.type || "Note"}
                      </span>
                      <span style={{ fontSize: 11, color: isOvd ? "#EF4444" : isTdy ? "#F97316" : "var(--text-muted)", fontWeight: (isOvd || isTdy) ? 700 : 400 }}>
                        {act.due_date ? format(new Date(act.due_date), "MMM d") : "—"}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {act.status || "pending"}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={assignedTo}>{assignedTo}</span>
                        {(isOwner || isSalesHead) && userRole && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "1px 6px", borderRadius: 99, display: "inline-block", width: "fit-content", whiteSpace: "nowrap" }}>{userRole}</span>
                        )}
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.94 }}
                        onClick={(e) => { e.stopPropagation(); navigate(route); }}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.22)", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                      >
                        Open <ChevronRight size={10} strokeWidth={2.5} />
                      </motion.button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Widget>
  );
}

/* ─── My Activities Widget ──────────────────────────────────────────────── */
function MyActivitiesWidget({ tasks = [], activities = [], navigate, dragHandleProps, collapsed, onToggle }) {
  const merged = useMemo(() => {
    const t = tasks.filter((t) => !["done","cancelled"].includes(t.status)).map((t) => ({ ...t, _source: "task" }));
    const a = activities.map((a) => ({ ...a, _source: "activity" }));
    const all = [...t, ...a];
    all.sort((a, b) => {
      if (!a.due_date) return 1; if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
    return all.slice(0, 10);
  }, [tasks, activities]);

  return (
    <Widget
      id="my-activities" title="My Activities" sub={`${merged.length} open`}
      icon={Activity} iconColor={C.blue.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/activities" navigate={navigate}
      noPad
    >
      {merged.length === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 }}>
          <CheckCircle2 size={22} style={{ color: "#10B981", marginBottom: 8, display: "block", margin: "0 auto 8px" }} />
          All activities complete!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {merged.map((item, i) => {
            const isActivity = item._source === "activity";
            const typeKey    = isActivity ? resolveActType(item.type) : null;
            const actCfg     = typeKey ? ACT_TYPES[typeKey] : null;
            const isOverdue  = item.due_date && isPast(new Date(item.due_date));
            const pc         = isOverdue ? "#EF4444" : (actCfg?.color || { urgent: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#22C55E" }[item.priority] || "#6B7280");
            const ActIcon    = actCfg?.icon || ListChecks;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(getContextRoute(item))}
                style={{
                  display: "flex", alignItems: "center", gap: 0,
                  borderBottom: i < merged.length - 1 ? "1px solid var(--border)" : "none",
                  cursor: "pointer", overflow: "hidden",
                  background: isOverdue ? "rgba(239,68,68,0.02)" : "transparent",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isOverdue ? "rgba(239,68,68,0.02)" : "transparent"; }}
              >
                <div style={{ width: 3, alignSelf: "stretch", background: pc, flexShrink: 0 }} />
                <div style={{ width: 28, height: 28, borderRadius: 7, background: `${pc}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, margin: "10px 10px 10px 10px" }}>
                  <ActIcon size={12} style={{ color: pc }} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: "10px 12px 10px 0" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2, display: "flex", align: "center", gap: 6 }}>
                    {actCfg && <span style={{ color: actCfg.color, fontWeight: 700 }}>{actCfg.short}</span>}
                    {item.due_date && <span style={{ color: isOverdue ? "#EF4444" : "var(--text-muted)" }}>
                      {isOverdue ? "Overdue · " : ""}{format(new Date(item.due_date), "MMM d, h:mm a")}
                    </span>}
                  </div>
                </div>
                <div style={{ padding: "0 12px 0 0", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {item.priority && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: pc, background: `${pc}14`, padding: "2px 6px", borderRadius: 99, textTransform: "capitalize" }}>
                      {item.priority}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </Widget>
  );
}

/* ─── Pipeline Health Widget ─────────────────────────────────────────────── */
function PipelineWidget({ deals = [], navigate, dragHandleProps, collapsed, onToggle, formatCompact }) {
  const STAGES = [
    { key: "new",               label: "New",        color: "#6B7280" },
    { key: "contacted",         label: "Contacted",  color: "#3B82F6" },
    { key: "meeting_scheduled", label: "Meeting",    color: "#8B5CF6" },
    { key: "proposal_sent",     label: "Proposal",   color: "#F59E0B" },
    { key: "negotiation",       label: "Negotiation",color: "#F97316" },
    { key: "won",               label: "Won",        color: "#10B981" },
  ];
  const total = deals.length || 1;
  const hotLeads = deals.filter((d) => !["won","lost"].includes(d.stage)).length;
  return (
    <Widget
      id="pipeline" title="Pipeline Health" sub={`${hotLeads} active deals`}
      icon={LayoutDashboard} iconColor={C.purple.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/deals" navigate={navigate}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {STAGES.map((s) => {
          const count = deals.filter((d) => d.stage === s.key).length;
          const val   = deals.filter((d) => d.stage === s.key).reduce((sum, d) => sum + (Number(d.value) || 0), 0);
          const pct   = Math.round((count / total) * 100);
          return (
            <div key={s.key}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                  <span style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 500 }}>{s.label}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {val > 0 && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatCompact(val)}</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{count}</span>
                </div>
              </div>
              <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 99 }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, ease: [0.4,0,0.2,1] }}
                  style={{ height: "100%", background: s.color, borderRadius: 99 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Widget>
  );
}

/* ─── Upcoming Meetings Widget ─────────────────────────────────────────── */
function MeetingsWidget({ meetings = [], navigate, dragHandleProps, collapsed, onToggle }) {
  const upcoming = meetings.filter((m) => new Date(m.start_time) >= new Date()).slice(0, 5);
  return (
    <Widget
      id="meetings" title="Upcoming Meetings" sub={`${upcoming.length} scheduled`}
      icon={CalendarDays} iconColor={C.teal.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/meetings" navigate={navigate}
      noPad
    >
      {!upcoming.length ? (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
          <CalendarDays size={20} style={{ opacity: 0.4, display: "block", margin: "0 auto 6px" }} />
          No upcoming meetings
        </div>
      ) : upcoming.map((m, i) => {
        const d     = new Date(m.start_time);
        const label = isToday(d) ? `Today · ${format(d, "h:mm a")}` : isTomorrow(d) ? `Tomorrow · ${format(d, "h:mm a")}` : format(d, "EEE, MMM d · h:mm a");
        const isVirtual = (m.type || "").includes("virtual") || (m.title || "").toLowerCase().includes("virtual");
        const MIcon = isVirtual ? Video : Users;
        const mColor = isVirtual ? C.indigo.solid : C.teal.solid;
        return (
          <div key={m.id}
            onClick={() => navigate("/meetings")}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: i < upcoming.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer", transition: "background 0.1s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${mColor}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MIcon size={13} style={{ color: mColor }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={9} /> {label}
              </div>
            </div>
            {m.status && (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: m.status === "completed" ? "#10B981" : "#F59E0B", background: m.status === "completed" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>
                {m.status}
              </span>
            )}
          </div>
        );
      })}
    </Widget>
  );
}

/* ─── Stale Deals / Closing Soon Widget ─────────────────────────────────── */
function StaleDealsWidget({ deals = [], navigate, dragHandleProps, collapsed, onToggle, formatCompact }) {
  const stale = useMemo(() => {
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const closingSoon = deals.filter((d) => !["won","lost"].includes(d.stage) && d.close_date && new Date(d.close_date) <= in7);
    const staleItems  = deals.filter((d) => {
      if (["won","lost"].includes(d.stage)) return false;
      return Math.floor((Date.now() - new Date(d.updated_at || d.created_at).getTime()) / 86400000) >= 5;
    }).sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
    const merged = [...closingSoon, ...staleItems.filter((d) => !closingSoon.find((c) => c.id === d.id))];
    return merged.slice(0, 5);
  }, [deals]);

  const count = stale.length;
  return (
    <Widget
      id="stale-deals" title="Deals Needing Action"
      sub={count ? `${count} require attention` : "All deals active"}
      icon={AlertTriangle} iconColor={count ? "#EF4444" : "#10B981"}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/deals" navigate={navigate}
      noPad
    >
      {!count ? (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "#10B981", fontSize: 12 }}>
          <CheckCircle2 size={20} style={{ display: "block", margin: "0 auto 6px" }} />
          All deals are active
        </div>
      ) : stale.map((d, i) => {
        const days = Math.floor((Date.now() - new Date(d.updated_at || d.created_at).getTime()) / 86400000);
        const isRed = days >= 7 || (d.close_date && new Date(d.close_date) < new Date());
        const bc = isRed ? "#EF4444" : "#F59E0B";
        return (
          <div key={d.id} onClick={() => navigate(`/deals?selected=${d.id}`)}
            style={{ display: "flex", alignItems: "center", gap: 0, padding: "11px 16px", borderBottom: i < stale.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer", borderLeft: `3px solid ${bc}`, background: `${bc}04`, transition: "background 0.1s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${bc}08`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = `${bc}04`; }}
          >
            <div style={{ flex: 1, minWidth: 0, paddingLeft: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.company_name || d.title}</div>
              <div style={{ fontSize: 10.5, color: bc, marginTop: 2, fontWeight: 600 }}>
                {d.close_date && new Date(d.close_date) < new Date() ? `Close date overdue` : `No activity ${days}d`}
              </div>
            </div>
            {d.value && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#10B981", flexShrink: 0 }}>{formatCompact(d.value)}</span>}
            <AlertTriangle size={11} style={{ color: bc, flexShrink: 0, marginLeft: 8 }} />
          </div>
        );
      })}
    </Widget>
  );
}

/* ─── Team Activity Feed Widget ──────────────────────────────────────────── */
function TeamFeedWidget({ activities = [], navigate, dragHandleProps, collapsed, onToggle }) {
  const actColor = (type) => ({
    lead: C.blue.solid, deal: C.green.solid, task: C.amber.solid,
    meeting: C.purple.solid, customer: C.teal.solid,
  })[type?.split("_")[0]] || "var(--text-muted)";

  return (
    <Widget
      id="team-feed" title="Team Activity" sub="Live updates"
      icon={Users} iconColor={C.blue.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/activities" navigate={navigate}
      noPad
    >
      {!activities.length ? (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
          No recent activity
        </div>
      ) : activities.slice(0, 6).map((a, i) => (
        <div key={a.id}
          style={{ display: "flex", gap: 10, padding: "10px 16px", borderBottom: i < Math.min(activities.length, 6) - 1 ? "1px solid var(--border)" : "none", alignItems: "flex-start" }}
        >
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: actColor(a.type), flexShrink: 0, marginTop: 4, boxShadow: `0 0 5px ${actColor(a.type)}55` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}
              className="truncate-2">{a.description}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              {a.user?.full_name || a.created_by_profile?.full_name || ""}{" "}
              · {format(new Date(a.created_at), "MMM d, h:mm a")}
            </div>
          </div>
        </div>
      ))}
    </Widget>
  );
}

/* ─── AI Insights Widget ─────────────────────────────────────────────────── */
function InsightsWidget({ stats, tasks, activities, dragHandleProps, collapsed, onToggle }) {
  const insights = useMemo(() => {
    const list = [];
    if (!stats) return list;
    if (stats.hotLeads > 0)         list.push({ icon: Flame,       color: C.orange.solid, text: `${stats.hotLeads} hot lead${stats.hotLeads > 1 ? "s" : ""} need immediate action — schedule demos this week.` });
    if (stats.conversionRate < 15)  list.push({ icon: AlertCircle, color: C.rose.solid,   text: `Conversion at ${stats.conversionRate}%. Focus on lead qualification to improve close rate.` });
    if (stats.conversionRate >= 20) list.push({ icon: TrendingUp,  color: C.green.solid,  text: `${stats.conversionRate}% conversion is above benchmark — excellent performance!` });
    if (stats.pendingTasks > 5)     list.push({ icon: ListChecks,  color: C.amber.solid,  text: `${stats.pendingTasks} open tasks blocking pipeline. Clear backlog to accelerate.` });
    if (stats.monthlyGrowth > 0)    list.push({ icon: ArrowUp,     color: C.green.solid,  text: `Lead volume up ${stats.monthlyGrowth}% vs last month.` });
    if (stats.monthlyGrowth < 0)    list.push({ icon: AlertCircle, color: C.amber.solid,  text: `Lead volume fell ${Math.abs(stats.monthlyGrowth)}%. Review outreach channels.` });
    list.push({ icon: Sparkles, color: C.indigo.solid, text: `Deals with follow-up within 48h close 3× more often.` });
    return list.slice(0, 3);
  }, [stats]);

  return (
    <Widget
      id="insights" title="AI Insights" sub="Data-driven recommendations"
      icon={Sparkles} iconColor={C.violet?.solid || "#7C3AED"}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {insights.map((ins, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
            style={{ display: "flex", gap: 10, padding: "9px 11px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${ins.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ins.icon size={12} style={{ color: ins.color }} strokeWidth={2} />
            </div>
            <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55, margin: 0 }}>{ins.text}</p>
          </motion.div>
        ))}
      </div>
    </Widget>
  );
}

/* ─── Leaderboard Widget ─────────────────────────────────────────────────── */
function LeaderboardWidget({ teamPerf, dragHandleProps, collapsed, onToggle, navigate }) {
  const sorted = useMemo(() => (teamPerf || []).sort((a, b) => b.won - a.won).slice(0, 5), [teamPerf]);
  const maxWon = sorted[0]?.won || 1;
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <Widget
      id="leaderboard" title="Team Leaderboard" sub="Ranked by won deals"
      icon={Trophy} iconColor={C.amber.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/team" navigate={navigate}
      noPad
    >
      {!sorted.length ? (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>No team data</div>
      ) : sorted.map((p, i) => (
        <div key={p.id || p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: i < sorted.length - 1 ? "1px solid var(--border)" : "none", background: i === 0 ? "rgba(245,158,11,0.03)" : "transparent" }}>
          <div style={{ width: 18, fontSize: 13, textAlign: "center", flexShrink: 0 }}>
            {medals[i] || <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>#{i+1}</span>}
          </div>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${C.blue.solid}, ${C.indigo.solid})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
            {p.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            <div style={{ height: 3, background: "var(--surface-3)", borderRadius: 2, marginTop: 4 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(p.won / maxWon) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.07 }} style={{ height: "100%", borderRadius: 2, background: i === 0 ? C.amber.solid : C.blue.solid }} />
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? C.amber.solid : "var(--text)", flexShrink: 0 }}>{p.won}</span>
        </div>
      ))}
    </Widget>
  );
}

/* ─── Revenue Chart Widget ─────────────────────────────────────────────── */
function RevenueWidget({ revenueData = [], monthlyLeads = [], dragHandleProps, collapsed, onToggle, navigate, symbol }) {
  const chartData = (revenueData || []).map((r) => ({
    month: r.month ? format(new Date(r.month + "-01"), "MMM") : r.month,
    revenue: r.revenue || 0,
  }));
  return (
    <Widget
      id="revenue" title="Revenue Trend" sub="Monthly overview"
      icon={IndianRupee} iconColor={C.green.solid}
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/reports" navigate={navigate}
    >
      <ResponsiveContainer width="100%" height={130}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.green.solid} stopOpacity={0.25} />
              <stop offset="100%" stopColor={C.green.solid} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${(v/1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => [`${symbol}${Number(v).toLocaleString()}`, "Revenue"]} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }} />
          <Area type="monotone" dataKey="revenue" stroke={C.green.solid} strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </Widget>
  );
}

/* ─── DSR Snapshot Widget ─────────────────────────────────────────────── */
function DSRSnapshotWidget({ userId, navigate, dragHandleProps, collapsed, onToggle }) {
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd   = endOfDay(new Date()).toISOString();

  const { data: todayActs = [] } = useQuery({
    queryKey: ["dsr-snap-acts", userId],
    queryFn: async () => {
      const { data } = await supabase.from("activities")
        .select("id, type")
        .or(`created_by.eq.${userId},user_id.eq.${userId}`)
        .gte("created_at", todayStart).lte("created_at", todayEnd)
        .neq("type", "email_contact");
      return data || [];
    },
    enabled: !!userId, refetchInterval: 30000,
  });

  const typeCounts = useMemo(() => {
    const map = {};
    todayActs.forEach((a) => { const k = resolveActType(a.type); map[k] = (map[k] || 0) + 1; });
    return map;
  }, [todayActs]);

  const total = todayActs.length;
  const score = Math.min(100, Math.round(Math.min(total * 8, 50) + 50));
  const scoreColor = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";

  return (
    <Widget
      id="dsr-snapshot" title="DSR Today" sub={format(new Date(), "EEEE, MMM d")}
      icon={Zap} iconColor="#6366F1"
      collapsed={collapsed} onToggle={onToggle}
      dragHandleProps={dragHandleProps}
      to="/dsr" navigate={navigate}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {/* Score ring */}
        <div style={{ position: "relative", width: 60, height: 60, flexShrink: 0 }}>
          <svg width={60} height={60} style={{ position: "absolute", inset: 0 }}>
            <circle cx={30} cy={30} r={24} fill="none" stroke="var(--border)" strokeWidth={4} />
            <circle cx={30} cy={30} r={24} fill="none" stroke={scoreColor} strokeWidth={4}
              strokeDasharray={`${(score / 100) * 150.8} 150.8`}
              strokeLinecap="round" transform="rotate(-90 30 30)"
              style={{ transition: "stroke-dasharray 0.8s ease", filter: `drop-shadow(0 0 4px ${scoreColor}60)` }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 7.5, color: "var(--text-muted)", fontWeight: 700 }}>SCORE</span>
          </div>
        </div>
        {/* Activity type pills */}
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 5 }}>
          {Object.entries(ACT_TYPES).map(([key, cfg]) => {
            const cnt = typeCounts[key] || 0;
            const Icon = cfg.icon;
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, background: cnt ? `${cfg.color}12` : "var(--surface-2)", border: `1px solid ${cnt ? cfg.color + "30" : "var(--border)"}` }}>
                <Icon size={9} style={{ color: cnt ? cfg.color : "var(--text-muted)" }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: cnt ? cfg.color : "var(--text-muted)" }}>{cnt}</span>
                <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>{cfg.short}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Widget>
  );
}

/* ─── Quick Add Modal ──────────────────────────────────────────────────── */
function QuickAddModal({ type, onClose, profile, qc, navigate }) {
  const { symbol } = useCurrency();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", company_name: "", value: "", priority: "medium", due_date: "", notes: "", start_time: "" });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (type === "add_prospect") {
        await leadsService.create({ company_name: form.title || "New Prospect", contact_name: "", stage: "pipeline", pipeline_stage: "new_prospect", created_by: profile?.id, assigned_to: profile?.id });
        qc.invalidateQueries({ queryKey: ["pipeline"] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        qc.invalidateQueries({ queryKey: ["monthly-leads"] });
        toast.success("Prospect added!"); navigate("/pipeline");
      } else if (type === "add_task") {
        await supabase.from("tasks").insert({ title: form.title, priority: form.priority, due_date: form.due_date || null, status: "todo", assigned_to: profile?.id, created_by: profile?.id });
        qc.invalidateQueries({ queryKey: ["my-tasks"] });
        toast.success("Task created!");
      } else if (type === "schedule_meeting") {
        if (!form.start_time) { toast.error("Start time required"); setSaving(false); return; }
        await meetingsService.create({ title: form.title || "Meeting", start_time: new Date(form.start_time).toISOString(), notes: form.notes || null, status: "scheduled", created_by: profile?.id });
        qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
        toast.success("Meeting scheduled!");
      }
      onClose();
    } catch (err) { toast.error(err.message || "Failed"); }
    finally { setSaving(false); }
  };

  const titles = { add_prospect: "Add Prospect", add_task: "Quick Add Task", schedule_meeting: "Schedule Meeting" };
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ type: "spring", damping: 22, stiffness: 300 }} style={{ maxWidth: 440 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{titles[type]}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {type === "add_prospect" && (
            <div><label className="crm-label">Prospect / Company Name *</label>
              <input className="crm-input" required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Acme Corp" /></div>
          )}
          {type === "add_task" && (<>
            <div><label className="crm-label">Task Title *</label>
              <input className="crm-input" required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What needs to be done?" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label className="crm-label">Priority</label>
                <select className="crm-input" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                  {["urgent","high","medium","low"].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select></div>
              <div><label className="crm-label">Due Date</label>
                <input className="crm-input" type="datetime-local" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
            </div>
          </>)}
          {type === "schedule_meeting" && (<>
            <div><label className="crm-label">Meeting Title *</label>
              <input className="crm-input" required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Discovery call" /></div>
            <div><label className="crm-label">Start Time *</label>
              <input className="crm-input" type="datetime-local" required value={form.start_time} onChange={(e) => set("start_time", e.target.value)} /></div>
            <div><label className="crm-label">Notes</label>
              <textarea className="crm-input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Agenda..." style={{ resize: "none" }} /></div>
          </>)}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Create"}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ─── Widget definitions ─────────────────────────────────────────────────── */
const OWNER_WIDGETS    = ["activity-summary","my-activities","pipeline","meetings","stale-deals","team-feed","insights","leaderboard","revenue","dsr-snapshot"];
const MANAGER_WIDGETS  = ["activity-summary","my-activities","pipeline","meetings","stale-deals","team-feed","insights","leaderboard","revenue","dsr-snapshot"];
const FIELD_WIDGETS    = ["activity-summary","dsr-snapshot","my-activities","meetings","pipeline","insights"];

/* ─── Main Dashboard ──────────────────────────────────────────────────── */
export default function Dashboard() {
  const { profile }              = useAuth();
  const { formatCompact, symbol } = useCurrency();
  const navigate                 = useNavigate();
  const qc                       = useQueryClient();

  const normRole    = (profile?.role || "").toLowerCase().replace(/[- ]/g, "_");
  const isFieldUser = ["employee", "inside_sales"].includes(normRole);
  const isManager   = ["sales_manager", "sales_head", "owner"].includes(normRole);
  const isSalesHead = ["sales_head", "owner"].includes(normRole);
  const isOwner     = normRole === "owner" || normRole === "sales_head";

  const defaultWidgets = isSalesHead ? OWNER_WIDGETS : isManager ? MANAGER_WIDGETS : FIELD_WIDGETS;
  const { order, setOrder, collapsed, toggleCollapse } = useWidgetPrefs(profile?.id || "guest", defaultWidgets);
  const [activeId, setActiveId] = useState(null);
  const [quickModal, setQuickModal] = useState(null);
  const [showLeadModal, setShowLeadModal] = useState(false);

  /* ── Data queries ── */
  const { data: stats, isLoading }   = useQuery({ queryKey: ["dashboard-stats"],   queryFn: analyticsService.getDashboardStats,    refetchInterval: 30000, staleTime: 0 });
  const { data: revenueData = [] }   = useQuery({ queryKey: ["monthly-revenue"],   queryFn: () => analyticsService.getMonthlyRevenue(6) });
  const { data: monthlyLeads = [] }  = useQuery({ queryKey: ["monthly-leads"],     queryFn: () => analyticsService.getMonthlyLeads(6) });
  const { data: upcomingMeetings = [] } = useQuery({ queryKey: ["upcoming-meetings"], queryFn: () => meetingsService.getUpcoming(8), staleTime: 0, refetchOnMount: "always", refetchInterval: 60000 });
  const { data: recentActivity = [] }   = useQuery({ queryKey: ["recent-activity"],   queryFn: () => analyticsService.getRecentActivity(12) });
  const { data: teamPerf = [] }         = useQuery({ queryKey: ["team-performance"],  queryFn: analyticsService.getTeamPerformance });
  const { data: tasks } = useQuery({
    queryKey: ["my-tasks"],
    queryFn: () => tasksService.getAll({ assignedTo: profile?.id }),
    enabled: !!profile?.id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const { data: pendingActivities = [] } = useQuery({
    queryKey: ["my-pending-activities", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      // Fetch with optional source-existence validation via embedded join.
      // Falls back to plain fetch if the FK relationship is not declared in schema.
      let rows = null;
      try {
        const { data, error } = await supabase.from("activities")
          .select("id, title, due_date, priority, status, type, assigned_to, created_by, lead_id, deal_id, lead:leads(id), deal:deals(id)")
          .or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`)
          .neq("status", "done").neq("status", "completed").neq("status", "cancelled")
          .neq("type", "email_contact")
          .order("due_date", { ascending: true, nullsFirst: false }).limit(40);
        if (!error) {
          // Strip orphaned activities whose source lead/deal was deleted
          rows = (data || [])
            .filter((a) => {
              if (a.lead_id && a.lead !== undefined) return a.lead !== null;
              if (a.deal_id && a.deal !== undefined) return a.deal !== null;
              return true;
            })
            .map(({ lead, deal, ...rest }) => ({ ...rest, _source: "activity" }));
        }
      } catch { /* join not supported — fall through */ }

      if (rows !== null) return rows;

      // Plain fallback (no join)
      const { data: fallback } = await supabase.from("activities")
        .select("id, title, due_date, priority, status, type, assigned_to, created_by, lead_id, deal_id")
        .or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`)
        .neq("status", "done").neq("status", "completed").neq("status", "cancelled")
        .neq("type", "email_contact")
        .order("due_date", { ascending: true, nullsFirst: false }).limit(40);
      return (fallback || []).map((a) => ({ ...a, _source: "activity" }));
    },
    enabled: !!profile?.id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  /* Activity summary — scoped by role: owner/head = all, others = own */
  const { data: activitySummaryData = [], isLoading: actSummaryLoading } = useQuery({
    queryKey: ["activity-summary", profile?.id, isSalesHead],
    queryFn: async () => {
      if (!profile?.id) return [];
      try {
        let q = supabase.from("activities")
          .select("id, title, type, status, due_date, assigned_to, created_by, lead_id, deal_id, lead:leads(id, company_name, contact_name, stage), deal:deals(id, company_name, title), user:profiles!activities_assigned_to_fkey(id, full_name, role)")
          .neq("type", "email_contact")
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(300);
        if (!isSalesHead) q = q.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`);
        const { data, error } = await q;
        if (!error) return data || [];
      } catch { /* join not supported */ }
      /* Fallback — no relation join */
      let q2 = supabase.from("activities")
        .select("id, title, type, status, due_date, assigned_to, created_by, lead_id, deal_id")
        .neq("type", "email_contact")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(300);
      if (!isSalesHead) q2 = q2.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`);
      const { data: fb } = await q2;
      return fb || [];
    },
    enabled: !!profile?.id,
    staleTime: 30000,
    refetchInterval: 60000,
    refetchOnMount: "always",
  });

  const { data: dealsData = [] }  = useQuery({ queryKey: ["deals-all"], queryFn: () => supabase.from("deals").select("id, stage, value, company_name, title, close_date, updated_at, created_at, assigned_to").then((r) => r.data || []) });
  const { data: myDeals = [] }    = useQuery({ queryKey: ["my-deals", profile?.id], queryFn: () => supabase.from("deals").select("id, stage, value, company_name, title, close_date, updated_at").eq("assigned_to", profile.id).order("updated_at", { ascending: false }).limit(10).then((r) => r.data || []), enabled: !!profile?.id });
  const { data: teamData = [] }   = useQuery({ queryKey: ["team-all"], queryFn: () => teamService.getAll() });
  const { data: lockSetting }     = useQuery({ queryKey: ["crm-setting-phone-email-lock"], queryFn: async () => { const { data } = await supabase.from("crm_settings").select("value").eq("key", "phone_email_lock").single(); return data?.value === "true"; }, staleTime: 60000 });

  /* ── Real-time subscriptions ── */
  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase.channel("dash-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
        qc.invalidateQueries({ queryKey: ["my-pending-activities", profile.id] });
        qc.invalidateQueries({ queryKey: ["recent-activity"] });
        qc.invalidateQueries({ queryKey: ["dsr-snap-acts", profile.id] });
        qc.invalidateQueries({ queryKey: ["activity-summary"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["my-tasks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        qc.invalidateQueries({ queryKey: ["deals-all"] });
        qc.invalidateQueries({ queryKey: ["my-deals", profile.id] });
        // Deal changes (including deletions) can orphan linked activities and tasks
        qc.invalidateQueries({ queryKey: ["my-pending-activities", profile.id] });
        qc.invalidateQueries({ queryKey: ["my-tasks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        qc.invalidateQueries({ queryKey: ["pipeline"] });
        qc.invalidateQueries({ queryKey: ["leads"] });
        qc.invalidateQueries({ queryKey: ["monthly-leads"] });
        qc.invalidateQueries({ queryKey: ["recent-activity"] });
        qc.invalidateQueries({ queryKey: ["my-pending-activities", profile.id] });
        qc.invalidateQueries({ queryKey: ["my-tasks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => {
        qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, qc]);

  /* ── Orphan cleanup (owner only) ── */
  useEffect(() => {
    if (!isOwner || !profile?.id) return;
    (async () => {
      try {
        const { data: converted } = await supabase.from("leads").select("id").eq("stage", "converted");
        if (converted?.length) {
          const ids = converted.map((l) => l.id);
          const { data: linked } = await supabase.from("deals").select("lead_id").in("lead_id", ids);
          const linkedSet = new Set((linked || []).map((d) => d.lead_id));
          const orphanLeads = ids.filter((id) => !linkedSet.has(id));
          if (orphanLeads.length) await supabase.from("leads").update({ stage: "new", updated_at: new Date().toISOString() }).in("id", orphanLeads);
        }
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      } catch { /* non-critical */ }
    })();
  }, [isOwner, profile?.id]);

  /* ── Derived data ── */
  const myTasks    = (tasks?.data || []).filter((t) => !["done","completed","cancelled","archived"].includes(t.status));
  const pipeDeals  = isFieldUser ? myDeals : dealsData;
  const teamFeed   = isFieldUser ? recentActivity.filter((a) => a.created_by === profile?.id || a.user_id === profile?.id) : recentActivity;

  const myActivitiesCount = myTasks.length + pendingActivities.length;
  const todayActCount     = recentActivity.filter((a) => (a.created_by === profile?.id || a.user_id === profile?.id) && isToday(new Date(a.created_at))).length;

  const fieldKPIs = [
    { label: "My Activities",  value: myActivitiesCount,           color: "#EF4444", to: null },
    { label: "Active Deals",   value: (myDeals.filter((d) => !["won","lost"].includes(d.stage))).length, color: "#3B82F6", to: "/deals" },
    { label: "Done Today",     value: todayActCount,               color: "#22C55E", to: "/activities" },
    { label: "Meetings",       value: (upcomingMeetings || []).length, color: "#8B5CF6", to: "/meetings" },
  ];

  /* ── DnD sensors ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveId(null);
    if (over && active.id !== over.id) {
      setOrder((prev) => {
        const oldIdx = prev.indexOf(active.id);
        const newIdx = prev.indexOf(over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }, [setOrder]);

  const isOwnerOrHeadDash   = ["owner", "sales_head"].includes(profile?.role);
  const canEditContactInfo   = isOwnerOrHeadDash || !(lockSetting ?? false);

  const createLeadMutation = useMutation({
    // Strip _activity (LeadModal embeds a pending follow-up inside the form data;
    // Leads.jsx handles it via pendingActivityRef — here we just discard it to
    // prevent Supabase from rejecting the insert with "column not found").
    mutationFn: (data) => {
      const { _activity, ...leadData } = data;
      return leadsService.create(leadData);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["monthly-leads"] });
      qc.invalidateQueries({ queryKey: ["recent-activity"] });
      toast.success("Lead added!");
      setShowLeadModal(false);
    },
    onError: (e) => toast.error("Failed: " + e.message),
  });

  /* ── Widget renderer ── */
  const renderWidget = (id, dragHandleProps) => {
    const props = { key: id, id, collapsed: collapsed.has(id), onToggle: toggleCollapse, dragHandleProps, navigate };
    switch (id) {
      case "activity-summary":
        return <ActivitySummaryWidget {...props} activities={activitySummaryData} loading={actSummaryLoading} isOwner={isOwner} isSalesHead={isSalesHead} />;
      case "my-activities":
        return <MyActivitiesWidget {...props} tasks={myTasks} activities={pendingActivities} />;
      case "pipeline":
        return <PipelineWidget {...props} deals={pipeDeals} formatCompact={formatCompact} />;
      case "meetings":
        return <MeetingsWidget {...props} meetings={upcomingMeetings} />;
      case "stale-deals":
        return <StaleDealsWidget {...props} deals={pipeDeals} formatCompact={formatCompact} />;
      case "team-feed":
        return isManager ? <TeamFeedWidget {...props} activities={teamFeed} /> : null;
      case "insights":
        return <InsightsWidget {...props} stats={stats} tasks={myTasks} activities={recentActivity} />;
      case "leaderboard":
        return isManager ? <LeaderboardWidget {...props} teamPerf={teamPerf} /> : null;
      case "revenue":
        return isSalesHead ? <RevenueWidget {...props} revenueData={revenueData} monthlyLeads={monthlyLeads} symbol={symbol} /> : null;
      case "dsr-snapshot":
        return <DSRSnapshotWidget {...props} userId={profile?.id} />;
      default: return null;
    }
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1500, margin: "0 auto" }}>

      {/* ── KPI Strip ── */}
      <div style={{ marginBottom: 16 }}>
        <KPIStrip
          stats={stats} loading={isLoading}
          fieldKPIs={fieldKPIs} isFieldUser={isFieldUser}
          navigate={navigate} formatCompact={formatCompact} symbol={symbol}
        />
      </div>

      {/* ── Secondary CTAs ── */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        {/* Secondary compact actions — admin/sales head only for create actions */}
        {[
          isSalesHead && { label: "Add Lead",     icon: UserPlus,    color: "#3B82F6", action: () => setShowLeadModal(true) },
          isSalesHead && { label: "Add Activity", icon: CalendarCheck, color: "#F43F5E", action: () => navigate("/activities") },
          isSalesHead && { label: "Add Task",     icon: ListChecks,  color: "#F59E0B", action: () => setQuickModal("add_task") },
                         { label: "View Reports", icon: BarChart2,   color: "#10B981", action: () => navigate("/reports") },
        ].filter(Boolean).map((a) => (
          <motion.button
            key={a.label}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={a.action}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12.5, transition: "border-color 0.15s, color 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${a.color}50`; e.currentTarget.style.color = a.color; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)"; }}
          >
            <a.icon size={13} strokeWidth={2} /> {a.label}
          </motion.button>
        ))}
      </div>

      {/* ── Drag-and-drop widget grid ── */}
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <GripVertical size={11} /> Workspace — drag to rearrange
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active }) => setActiveId(active.id)} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {order.map((id) => (
              <SortableWidget key={id} id={id}>
                {({ dragHandleProps }) => renderWidget(id, dragHandleProps)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId ? (
            <div style={{ opacity: 0.8, pointerEvents: "none", borderRadius: 14, background: "var(--surface)", border: "2px solid var(--accent)", padding: 16, fontWeight: 700, color: "var(--text)", fontSize: 13, boxShadow: "0 20px 40px rgba(0,0,0,0.18)" }}>
              {activeId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showLeadModal && (
          <LeadModal
            onClose={() => setShowLeadModal(false)}
            onSave={async (data) => { await createLeadMutation.mutateAsync({ ...data, created_by: profile?.id }); }}
            canEditContactInfo={canEditContactInfo}
            teamMembers={teamData?.data || []}
          />
        )}
        {(quickModal === "add_prospect" || quickModal === "add_task" || quickModal === "schedule_meeting") && (
          <QuickAddModal type={quickModal} onClose={() => setQuickModal(null)} profile={profile} qc={qc} navigate={navigate} />
        )}
      </AnimatePresence>
    </div>
  );
}
