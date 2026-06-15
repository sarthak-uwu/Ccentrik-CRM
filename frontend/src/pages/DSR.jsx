import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import {
  Phone, Video, RefreshCw, Mail, FileText, CheckCircle2, CheckSquare,
  Briefcase, TrendingUp, Zap, ChevronDown, User,
  BarChart2, Clock, AlertCircle, ChevronLeft, ChevronRight, Calendar,
  Users, Target, ArrowRight, Award, Download, Printer,
  LayoutGrid, CalendarDays, PieChart, Activity, X, Search,
  DollarSign, Star, BarChart3, Bell, Send, Loader2, Settings, History,
} from "lucide-react";

const API = (import.meta.env.VITE_FIREBASE_FUNCTIONS_URL ?? import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid,
} from "recharts";
import {
  format, parseISO,
  startOfDay, endOfDay, addDays, subDays, isSameDay,
  startOfWeek, endOfWeek, addWeeks, subWeeks, isSameWeek,
  startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth,
  startOfQuarter, endOfQuarter, addQuarters, subQuarters, getQuarter,
  startOfYear, endOfYear, addYears, subYears, isSameYear,
  getHours, getMonth, getYear, isToday,
} from "date-fns";

/* ─── 7 Exact Activity Types ─────────────────────────────────────────── */
const CORE_TYPES = {
  follow_up_call:  { label: "Follow-up Call",    short: "FU Call",   icon: RefreshCw, color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  follow_up_email: { label: "Follow-up Email",   short: "FU Email",  icon: RefreshCw, color: "#06B6D4", bg: "rgba(6,182,212,0.1)"   },
  call:            { label: "Call",              short: "Call",      icon: Phone,     color: "#3B82F6", bg: "rgba(59,130,246,0.1)"  },
  email:           { label: "Email",             short: "Email",     icon: Mail,      color: "#EC4899", bg: "rgba(236,72,153,0.1)"  },
  email_sent:      { label: "Email Sent",        short: "Sent",      icon: Mail,      color: "#EC4899", bg: "rgba(236,72,153,0.1)"  },
  note:            { label: "Note",              short: "Note",      icon: FileText,  color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
  meeting_person:  { label: "In-Person Meeting", short: "In-Person", icon: Users,     color: "#8B5CF6", bg: "rgba(139,92,246,0.1)"  },
  meeting_virtual: { label: "Virtual Meeting",   short: "Virtual",   icon: Video,     color: "#6366F1", bg: "rgba(99,102,241,0.1)"  },
};

function resolveType(t) {
  if (!t) return "note";
  const s = t.toLowerCase().replace(/[-\s]/g, "_");
  if (s === "follow_up_call" || s === "follow_up") return "follow_up_call";
  if (s === "follow_up_email") return "follow_up_email";
  if (s === "meeting_person" || s === "in_person" || s === "visit") return "meeting_person";
  if (s === "meeting_virtual" || s === "virtual_meeting" || s === "meeting") return "meeting_virtual";
  if (["call","phone_call","cold_call","demo","introductory","verification","other"].includes(s)) return "call";
  if (s === "email" || s === "email_sent") return "email_sent";
  return "note";
}

function calcScore({ actCount, tasksCompleted, dealsUpdated, leadsCreated }) {
  const a = Math.min(actCount * 6, 40);
  const t = Math.min(tasksCompleted * 6, 20);
  const d = Math.min(dealsUpdated * 8, 20);
  const l = Math.min((leadsCreated || 0) * 5, 20);
  return { total: Math.min(100, Math.round(a + t + d + l)), a, t, d, l };
}

function fmtCurrency(n) {
  if (!n) return "₹0";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

/* ─── Half-year helpers ──────────────────────────────────────────────── */
function startOfHalfYear(date) { return getMonth(date) < 6 ? startOfYear(date) : new Date(getYear(date), 6, 1); }
function endOfHalfYear(date)   { return getMonth(date) < 6 ? endOfDay(new Date(getYear(date), 5, 30)) : endOfYear(date); }
function addHalfYears(date, n) { return addMonths(date, n * 6); }
function subHalfYears(date, n) { return subMonths(date, n * 6); }
function isSameHalfYear(a, b)  { return getYear(a) === getYear(b) && (getMonth(a) < 6) === (getMonth(b) < 6); }

/* ─── Period helpers ─────────────────────────────────────────────────── */
function getPeriodRange(range, date) {
  switch (range) {
    case "daily":       return { start: startOfDay(date), end: endOfDay(date) };
    case "weekly":      return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) };
    case "monthly":     return { start: startOfMonth(date), end: endOfMonth(date) };
    case "quarterly":   return { start: startOfQuarter(date), end: endOfQuarter(date) };
    case "half_yearly": return { start: startOfHalfYear(date), end: endOfHalfYear(date) };
    case "yearly":      return { start: startOfYear(date), end: endOfYear(date) };
    default:            return { start: startOfDay(date), end: endOfDay(date) };
  }
}
function isCurrentPeriod(range, date) {
  const now = new Date();
  switch (range) {
    case "daily":       return isSameDay(date, now);
    case "weekly":      return isSameWeek(date, now, { weekStartsOn: 1 });
    case "monthly":     return isSameMonth(date, now);
    case "quarterly":   return getQuarter(date) === getQuarter(now) && getYear(date) === getYear(now);
    case "half_yearly": return isSameHalfYear(date, now);
    case "yearly":      return isSameYear(date, now);
    default: return false;
  }
}
function navigatePeriod(range, date, dir) {
  switch (range) {
    case "daily":       return dir > 0 ? addDays(date, 1) : subDays(date, 1);
    case "weekly":      return dir > 0 ? addWeeks(date, 1) : subWeeks(date, 1);
    case "monthly":     return dir > 0 ? addMonths(date, 1) : subMonths(date, 1);
    case "quarterly":   return dir > 0 ? addQuarters(date, 1) : subQuarters(date, 1);
    case "half_yearly": return dir > 0 ? addHalfYears(date, 1) : subHalfYears(date, 1);
    case "yearly":      return dir > 0 ? addYears(date, 1) : subYears(date, 1);
    default: return date;
  }
}
function getPeriodLabel(range, date) {
  const q = getQuarter(date); const hy = getMonth(date) < 6 ? "H1" : "H2";
  switch (range) {
    case "daily":       return format(date, "EEEE, MMMM d, yyyy");
    case "weekly":      return `${format(startOfWeek(date, { weekStartsOn: 1 }), "MMM d")} – ${format(endOfWeek(date, { weekStartsOn: 1 }), "MMM d, yyyy")}`;
    case "monthly":     return format(date, "MMMM yyyy");
    case "quarterly":   return `Q${q} ${getYear(date)}  (${format(startOfQuarter(date), "MMM")} – ${format(endOfQuarter(date), "MMM yyyy")})`;
    case "half_yearly": return `${hy} ${getYear(date)}  (${format(startOfHalfYear(date), "MMM")} – ${format(endOfHalfYear(date), "MMM yyyy")})`;
    case "yearly":      return String(getYear(date));
    default: return "";
  }
}
function ctxLabel(range) {
  return { daily: "today", weekly: "this week", monthly: "this month", quarterly: "this quarter", half_yearly: "this half-year", yearly: "this year" }[range] || "this period";
}

/* ─── Chart builder ──────────────────────────────────────────────────── */
function buildChartData(range, selectedDate, acts) {
  if (range === "daily") {
    return Array.from({ length: 24 }, (_, h) => ({
      label: h % 4 === 0 ? `${h}:00` : "", fullLabel: `${h}:00–${h + 1}:00`,
      count: acts.filter((a) => getHours(new Date(a.created_at)) === h).length,
      isCurrent: isToday(selectedDate) && getHours(new Date()) === h,
    }));
  }
  if (range === "weekly") {
    const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(ws, i);
      return { label: format(d, "EEE"), fullLabel: format(d, "EEEE, MMM d"), count: acts.filter((a) => a.created_at?.slice(0, 10) === format(d, "yyyy-MM-dd")).length, isCurrent: isToday(d) };
    });
  }
  if (range === "monthly") {
    const ms = startOfMonth(selectedDate), me = endOfMonth(selectedDate);
    const weeks = []; let ws = ms, wn = 1;
    while (ws <= me) {
      const we = new Date(Math.min(addDays(ws, 6).getTime(), me.getTime()));
      weeks.push({ label: `W${wn}`, fullLabel: `${format(ws, "MMM d")}–${format(we, "MMM d")}`, count: acts.filter((a) => { const d = new Date(a.created_at); return d >= ws && d <= we; }).length, isCurrent: new Date() >= ws && new Date() <= we });
      ws = addDays(we, 1); wn++;
    }
    return weeks;
  }
  if (range === "quarterly") {
    const qs = startOfQuarter(selectedDate);
    return Array.from({ length: 3 }, (_, i) => { const md = addMonths(qs, i), ms = startOfMonth(md), me = endOfMonth(md); return { label: format(md, "MMM"), fullLabel: format(md, "MMMM yyyy"), count: acts.filter((a) => { const d = new Date(a.created_at); return d >= ms && d <= me; }).length, isCurrent: isSameMonth(md, new Date()) }; });
  }
  if (range === "half_yearly") {
    const hs = startOfHalfYear(selectedDate);
    return Array.from({ length: 6 }, (_, i) => { const md = addMonths(hs, i), ms = startOfMonth(md), me = endOfMonth(md); return { label: format(md, "MMM"), fullLabel: format(md, "MMMM yyyy"), count: acts.filter((a) => { const d = new Date(a.created_at); return d >= ms && d <= me; }).length, isCurrent: isSameMonth(md, new Date()) }; });
  }
  const yr = getYear(selectedDate);
  return Array.from({ length: 12 }, (_, i) => { const md = new Date(yr, i, 1), ms = startOfMonth(md), me = endOfMonth(md); return { label: format(md, "MMM"), fullLabel: format(md, "MMMM yyyy"), count: acts.filter((a) => { const d = new Date(a.created_at); return d >= ms && d <= me; }).length, isCurrent: isSameMonth(md, new Date()) }; });
}

const RANGES = [
  { key: "daily", label: "Daily" }, { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" }, { key: "quarterly", label: "Quarterly" },
  { key: "half_yearly", label: "Half-Yearly" }, { key: "yearly", label: "Yearly" },
  { key: "custom", label: "Custom" },
];
const CHART_TITLE = { daily: "Hourly Activity", weekly: "Day-by-Day", monthly: "Weekly Breakdown", quarterly: "Month-by-Month", half_yearly: "Monthly Breakdown", yearly: "Monthly Breakdown", custom: "Activity Trend" };
const TABS = [
  { key: "overview",  label: "Overview",  icon: LayoutGrid },
  { key: "calendar",  label: "Calendar",  icon: CalendarDays },
  { key: "analytics", label: "Analytics", icon: PieChart },
  { key: "team",      label: "Team",      icon: Users, managerOnly: true },
];

/* ─── Score Ring ─────────────────────────────────────────────────────── */
function ScoreRing({ score, size = 100, strokeWidth = 7 }) {
  const r = (size / 2) - strokeWidth;
  const circ = 2 * Math.PI * r;
  const color = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";
  const label = score >= 70 ? "Excellent" : score >= 40 ? "On Track" : "Building";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={`${(score / 100) * circ} ${circ}`} strokeLinecap="round"
            transform={`rotate(-90 ${size/2} ${size/2})`}
            style={{ transition: "stroke-dasharray 1.2s ease", filter: `drop-shadow(0 0 7px ${color}55)` }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: size * 0.26, fontWeight: 900, color, lineHeight: 1, letterSpacing: "-0.04em" }}>{score}</span>
          <span style={{ fontSize: size * 0.09, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>/100</span>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>Productivity Score</div>
      </div>
    </div>
  );
}

/* ─── Metric Bar ─────────────────────────────────────────────────────── */
function MetricBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: "var(--text-2)" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>{value}</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }}
          style={{ height: "100%", borderRadius: 99, background: color }} />
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{pct}%</div>
    </div>
  );
}

/* ─── Calendar Heatmap ───────────────────────────────────────────────── */
function CalendarHeatmap({ acts, month, onDayClick, selectedDay }) {
  const monthStart = startOfMonth(month);
  const monthEnd   = endOfMonth(month);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const dayMap = useMemo(() => {
    const m = {};
    acts.forEach((a) => { const k = a.created_at.slice(0, 10); if (!m[k]) m[k] = []; m[k].push(a); });
    return m;
  }, [acts]);

  const days = [];
  let d = gridStart;
  while (d <= gridEnd) { days.push(d); d = addDays(d, 1); }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((wd) => (
          <div key={wd} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "4px 0" }}>{wd}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {days.map((day) => {
          const dayStr  = format(day, "yyyy-MM-dd");
          const dayActs = dayMap[dayStr] || [];
          const inMonth = isSameMonth(day, month);
          const today   = isToday(day);
          const sel     = selectedDay && format(selectedDay, "yyyy-MM-dd") === dayStr;
          const types   = [...new Set(dayActs.map((a) => resolveType(a.type)))];
          return (
            <motion.div key={dayStr} whileHover={inMonth ? { scale: 1.04 } : {}} onClick={() => inMonth && onDayClick(day)}
              style={{ minHeight: 64, padding: "6px 7px", borderRadius: 9, border: `1px solid ${sel ? "rgba(99,102,241,0.45)" : today ? "rgba(99,102,241,0.25)" : "var(--border)"}`, background: sel ? "rgba(99,102,241,0.1)" : today ? "rgba(99,102,241,0.04)" : "var(--surface-2)", cursor: inMonth ? "pointer" : "default", opacity: inMonth ? 1 : 0.3 }}>
              <div style={{ fontSize: 12, fontWeight: today ? 800 : 500, color: today ? "#6366F1" : "var(--text)", marginBottom: 4 }}>{format(day, "d")}</div>
              {dayActs.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 2 }}>
                  {types.slice(0, 4).map((type) => {
                    const cnt = dayActs.filter((a) => resolveType(a.type) === type).length;
                    return <div key={type} title={`${cnt} ${CORE_TYPES[type]?.label}`} style={{ width: cnt > 2 ? 9 : 7, height: cnt > 2 ? 9 : 7, borderRadius: "50%", background: CORE_TYPES[type]?.color || "#888", flexShrink: 0 }} />;
                  })}
                  {types.length > 4 && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--text-muted)", flexShrink: 0 }} />}
                </div>
              )}
              {dayActs.length > 0 && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)" }}>{dayActs.length}</div>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── DSR Activity Card ──────────────────────────────────────────────── */
// Structured, duplicate-free card showing company, contact, activity type,
// outcome/notes, status, and module — each field appears exactly once.
const MODULE_BADGE = {
  Pipeline: { color: "#6366F1", bg: "rgba(99,102,241,0.08)"  },
  Lead:     { color: "#3B82F6", bg: "rgba(59,130,246,0.08)"  },
  Deal:     { color: "#10B981", bg: "rgba(16,185,129,0.08)"  },
};

function DSRActivityCard({ act, cfg, timestampFmt, selectedUser }) {
  const [expanded, setExpanded] = useState(false);

  // Company / contact from joined lead or deal
  const company = act.lead?.company_name || act.deal?.company_name || act.deal?.title || null;
  const contact = act.lead?.contact_name || act.deal?.contact_name || null;

  // Module type — distinguishes pipeline entries from regular leads
  const module = act.related_type === "pipeline"              ? "Pipeline"
    : act.deal_id || act.related_type === "deal"               ? "Deal"
    : act.lead_id && act.lead?.stage === "pipeline"            ? "Pipeline"
    : act.lead_id || act.related_type === "lead"               ? "Lead"
    : null;

  // Strip the type label prefix from title to get meaningful content.
  // e.g. "Follow-up Call: Customer not available" → "Customer not available"
  const rawTitle = act.title || "";
  let notes = rawTitle;
  for (const pat of [cfg.label, cfg.short]) {
    if (rawTitle.toLowerCase().startsWith(pat.toLowerCase() + ":")) {
      notes = rawTitle.slice(pat.length + 1).trim();
      break;
    }
  }
  if (!notes && act.description) notes = act.description;
  const hasLong = notes && notes.length > 130;

  const done     = act.status === "done";
  const isOver   = !done && act.due_date && new Date(act.due_date) < new Date();
  const stColor  = done ? "#10B981" : isOver ? "#EF4444" : "#F59E0B";
  const stLabel  = done ? "Done" : act.status === "in_progress" ? "In Progress" : isOver ? "Overdue" : "Pending";
  const modStyle = module ? MODULE_BADGE[module] : null;

  return (
    <div
      style={{ borderRadius: 10, border: "1px solid var(--border)", borderLeft: `3px solid ${cfg.color}`, background: "var(--surface)", padding: "11px 14px", marginBottom: 8, transition: "background 0.12s" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>

        {/* Type icon */}
        <div style={{ width: 32, height: 32, borderRadius: 8, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
          <cfg.icon size={13} style={{ color: cfg.color }} strokeWidth={2} />
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Company + Module badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: company ? "var(--text)" : "var(--text-muted)", fontStyle: company ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
              {company || "No record linked"}
            </span>
            {modStyle && (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: modStyle.color, background: modStyle.bg, padding: "1px 7px", borderRadius: 99, flexShrink: 0 }}>{module}</span>
            )}
          </div>

          {/* Contact */}
          {contact && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3, marginBottom: 5 }}>
              <User size={9} strokeWidth={2} /> {contact}
            </div>
          )}

          {/* Activity type badge — shown exactly once */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "2px 8px", borderRadius: 99, marginBottom: notes ? 6 : 0 }}>
            <cfg.icon size={9} strokeWidth={2} /> {cfg.label}
          </span>

          {/* Outcome / Notes */}
          {notes && (
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55, marginTop: 5 }}>
              {expanded || !hasLong ? notes : notes.slice(0, 130) + "…"}
              {hasLong && (
                <button onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                  style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: cfg.color, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                  {expanded ? "less" : "more"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Time + Status + Employee */}
        <div style={{ textAlign: "right", flexShrink: 0, minWidth: 90 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            {format(new Date(act.created_at), timestampFmt)}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: `${stColor}12`, color: stColor, marginBottom: 4 }}>
            {done ? <CheckCircle2 size={8} /> : <Clock size={8} />}
            {stLabel}
          </div>
          {selectedUser?.full_name && (
            <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 2 }}>
              <User size={9} /> {selectedUser.full_name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SEND DSR MODAL  —  multi-step: Date → Employees → Recipients → Preview
═══════════════════════════════════════════════════════════════════════ */
function SendDSRModal({ onClose, viewableEmployees = [] }) {
  const { user, profile }       = useAuth();
  const normRoleModal           = (profile?.role || "").toLowerCase().replace(/[- ]/g, "_");
  const isOwnerOrHeadModal      = ["owner", "sales_head"].includes(normRoleModal);

  // step: "date" | "employees" | "recipients" | "preview" | "sending" | "done" | "error"
  const [step, setStep]                   = useState("date");

  // Date selection
  const now = new Date();
  const curY = getYear(now);
  const curQ = getQuarter(now);
  const prevQ = curQ === 1 ? 4 : curQ - 1;
  const prevQY = curQ === 1 ? curY - 1 : curY;

  const DATE_PRESETS = [
    { key: "today",         label: "Today",            sub: format(now, "MMM d") },
    { key: "yesterday",     label: "Yesterday",        sub: format(subDays(now, 1), "MMM d") },
    { key: "last_7",        label: "Last 7 Days",      sub: `${format(subDays(now, 6), "MMM d")} – ${format(now, "MMM d")}` },
    { key: "this_week",     label: "This Week",        sub: format(startOfWeek(now, { weekStartsOn: 1 }), "MMM d") + " onwards" },
    { key: "last_week",     label: "Last Week",        sub: format(startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), "MMM d") },
    { key: "this_month",    label: "This Month",       sub: format(now, "MMMM yyyy") },
    { key: "last_month",    label: "Last Month",       sub: format(subMonths(now, 1), "MMMM yyyy") },
    { key: "this_quarter",  label: `Q${curQ} ${curY}`,  sub: "This Quarter" },
    { key: "last_quarter",  label: `Q${prevQ} ${prevQY}`, sub: "Last Quarter" },
    { key: "current_year",  label: `Year ${curY}`,     sub: "Current Year" },
    { key: "previous_year", label: `Year ${curY - 1}`, sub: "Previous Year" },
    { key: "custom",        label: "Custom Range",     sub: "Pick dates" },
  ];

  const [datePreset, setDatePreset]       = useState("today");
  const [customStart, setCustomStart]     = useState(format(subDays(now, 6), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd]         = useState(format(now, "yyyy-MM-dd"));

  // Employee selection (owner/sales_head only)
  const [empSearch, setEmpSearch]         = useState("");
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);

  // Recipients
  const [recipients, setRecipients]       = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [recipSearch, setRecipSearch]     = useState("");

  // Sending
  const [loadingStep, setLoadingStep]     = useState(0);
  const [result, setResult]               = useState(null);

  const LOADING_MSGS = [
    "Fetching sales data…",
    "Generating PDF report…",
    "Composing email…",
    "Sending…",
  ];

  // Steps — employees step only for owner/sales_head
  const steps = useMemo(() =>
    isOwnerOrHeadModal
      ? ["date", "employees", "recipients", "preview"]
      : ["date", "recipients", "preview"],
    [isOwnerOrHeadModal]
  );
  const STEP_LABELS = { date: "Date Range", employees: "Employees", recipients: "Recipients", preview: "Preview" };
  const stepIndex = steps.indexOf(step);

  const goNext = () => {
    const i = stepIndex + 1;
    if (i < steps.length) setStep(steps[i]);
  };
  const goBack = () => {
    const i = stepIndex - 1;
    if (i >= 0) setStep(steps[i]);
  };

  // Fetch recipients on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API}/api/reports/recipients`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setRecipients(await res.json());
      } catch {}
    })();
  }, [user]);

  // Derived
  const filteredEmps = useMemo(() => {
    if (!empSearch.trim()) return viewableEmployees;
    const q = empSearch.toLowerCase();
    return viewableEmployees.filter(u =>
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q)
    );
  }, [viewableEmployees, empSearch]);

  const filteredRecipients = useMemo(() => {
    const q = recipSearch.toLowerCase();
    return recipients.filter(r =>
      !selectedEmails.includes(r.email) &&
      (q === "" || (r.name || "").toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q))
    );
  }, [recipients, selectedEmails, recipSearch]);

  const selectedPreset    = DATE_PRESETS.find(p => p.key === datePreset);
  const selectedEmpNames  = viewableEmployees.filter(u => selectedEmpIds.includes(u.id)).map(u => u.full_name || u.email);
  const selectedRcpNames  = recipients.filter(r => selectedEmails.includes(r.email)).map(r => r.name);

  const rlabel    = r => r === "owner" ? "Super Admin" : r === "sales_head" ? "Sales Head" : (r || "").replace(/_/g, " ");
  const roleClr   = r => r === "owner" ? "#6366F1" : r === "sales_head" ? "#10B981" : "#3B82F6";

  const dateValid = datePreset !== "custom" || (customStart && customEnd && customStart <= customEnd);

  // Send handler
  const handleSend = async () => {
    setStep("sending");
    setLoadingStep(0);
    const t1 = setTimeout(() => setLoadingStep(1), 900);
    const t2 = setTimeout(() => setLoadingStep(2), 2000);
    const t3 = setTimeout(() => setLoadingStep(3), 3200);
    try {
      const token = await user.getIdToken();
      const body = {
        selectedEmails,
        selectedEmployeeIds: selectedEmpIds,
        datePreset,
        ...(datePreset === "custom" ? { customStart, customEnd } : {}),
      };
      const res  = await fetch(`${API}/api/reports/send-dsr`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      setLoadingStep(3);
      await new Promise(r => setTimeout(r, 350));
      if (!res.ok) {
        setResult({ success: false, error: data.error || data.details || `HTTP ${res.status}` });
        setStep("error");
      } else {
        setResult({ success: true, sent_to: data.sent_to });
        setStep("done");
      }
    } catch (err) {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      setResult({ success: false, error: err.message || "Network error" });
      setStep("error");
    }
  };

  const isSpecialStep = ["sending", "done", "error"].includes(step);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)" }} onClick={() => { if (!isSpecialStep) onClose(); }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{    opacity: 0, scale: 0.94, y: 18  }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: "relative", width: "100%", maxWidth: 520, background: "var(--surface)", borderRadius: 20, border: "1px solid var(--border)", boxShadow: "0 32px 80px rgba(0,0,0,0.35)", overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }}
      >
        {/* Rainbow accent bar */}
        <div style={{ height: 3, background: "linear-gradient(90deg,#6366F1,#8B5CF6,#EC4899)", flexShrink: 0 }} />

        {/* Header + step indicator */}
        {!isSpecialStep && (
          <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Generate & Send DSR</h2>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-muted)" }}>Daily Sales Report — PDF + Email</p>
              </div>
              <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>

            {/* Step pills */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
              {steps.map((s, i) => (
                <Fragment key={s}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: s === step ? "#6366F1" : i < stepIndex ? "#10B981" : "var(--surface-2)", border: `2px solid ${s === step ? "#6366F1" : i < stepIndex ? "#10B981" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: s === step || i < stepIndex ? "#fff" : "var(--text-muted)", transition: "all 0.2s" }}>
                      {i < stepIndex ? "✓" : i + 1}
                    </div>
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: s === step ? "#6366F1" : "var(--text-muted)", whiteSpace: "nowrap" }}>{STEP_LABELS[s]}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: i < stepIndex ? "#10B981" : "var(--border)", margin: "0 5px", marginBottom: 18, transition: "background 0.25s" }} />
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1, padding: isSpecialStep ? 0 : "0 24px 20px" }} className="custom-scroll">

          {/* ── Date step ── */}
          {step === "date" && (
            <div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>Select the date range for this report</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
                {DATE_PRESETS.map(p => (
                  <button key={p.key} onClick={() => setDatePreset(p.key)}
                    style={{ padding: "9px 8px", borderRadius: 10, border: `1.5px solid ${datePreset === p.key ? (p.key === "custom" ? "#8B5CF6" : "#6366F1") : "var(--border)"}`, background: datePreset === p.key ? (p.key === "custom" ? "rgba(139,92,246,0.1)" : "rgba(99,102,241,0.09)") : "var(--surface-2)", cursor: "pointer", textAlign: "left", transition: "all 0.14s" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: datePreset === p.key ? (p.key === "custom" ? "#8B5CF6" : "#6366F1") : "var(--text)" }}>{p.label}</div>
                    <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 2 }}>{p.sub}</div>
                  </button>
                ))}
              </div>

              {datePreset === "custom" && (
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "var(--text-2)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>From</label>
                    <input type="date" value={customStart} max={customEnd || format(now, "yyyy-MM-dd")}
                      onChange={e => setCustomStart(e.target.value)}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "var(--text-2)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>To</label>
                    <input type="date" value={customEnd} min={customStart} max={format(now, "yyyy-MM-dd")}
                      onChange={e => setCustomEnd(e.target.value)}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
                  </div>
                </div>
              )}
              {datePreset === "custom" && customStart && customEnd && customStart > customEnd && (
                <p style={{ fontSize: 11.5, color: "#EF4444", margin: "8px 0 0" }}>Start date must be before end date</p>
              )}
            </div>
          )}

          {/* ── Employees step (owner/sales_head only) ── */}
          {step === "employees" && (
            <div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>Choose whose data to include in the report</p>

              {/* All team */}
              <button onClick={() => setSelectedEmpIds([])}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${selectedEmpIds.length === 0 ? "#6366F1" : "var(--border)"}`, background: selectedEmpIds.length === 0 ? "rgba(99,102,241,0.08)" : "var(--surface-2)", cursor: "pointer", marginBottom: 9, textAlign: "left", transition: "all 0.14s" }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(99,102,241,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Users size={15} style={{ color: "#6366F1" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: selectedEmpIds.length === 0 ? "#6366F1" : "var(--text)" }}>Entire Team</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{viewableEmployees.length} accessible employees</div>
                </div>
                {selectedEmpIds.length === 0 && <span style={{ fontSize: 12, color: "#6366F1", fontWeight: 800 }}>✓</span>}
              </button>

              {/* Search */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, marginBottom: 7 }}>
                <Search size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search by name, role…"
                  style={{ border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 12.5, flex: 1, minWidth: 0 }} />
                {empSearch && <button onClick={() => setEmpSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}><X size={11} /></button>}
              </div>

              {/* List */}
              <div style={{ maxHeight: 220, overflowY: "auto" }} className="custom-scroll">
                {filteredEmps.map(u => {
                  const on = selectedEmpIds.includes(u.id);
                  const rc = roleClr(u.role);
                  return (
                    <button key={u.id} onClick={() => setSelectedEmpIds(prev => on ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, border: `1px solid ${on ? rc + "33" : "var(--border)"}`, background: on ? rc + "0d" : "transparent", cursor: "pointer", marginBottom: 5, textAlign: "left", transition: "all 0.12s" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: rc + "1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: rc, flexShrink: 0 }}>
                        {(u.full_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.full_name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{rlabel(u.role)}</div>
                      </div>
                      {on && <div style={{ width: 18, height: 18, borderRadius: "50%", background: rc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff", flexShrink: 0 }}>✓</div>}
                    </button>
                  );
                })}
                {filteredEmps.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: "var(--text-muted)" }}>
                    {empSearch ? "No employees match your search" : "No accessible employees"}
                  </div>
                )}
              </div>

              {selectedEmpIds.length > 0 && (
                <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--text-muted)" }}>
                  {selectedEmpIds.length} employee{selectedEmpIds.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          )}

          {/* ── Recipients step ── */}
          {step === "recipients" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>Who should receive this report?</p>
                {recipients.length > 0 && (
                  <button onClick={() => setSelectedEmails(recipients.map(r => r.email))}
                    style={{ fontSize: 11, fontWeight: 700, color: "#6366F1", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                    Select All
                  </button>
                )}
              </div>

              {/* Chips */}
              {selectedEmails.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 9 }}>
                  {selectedEmails.map(email => {
                    const r = recipients.find(x => x.email === email);
                    return (
                      <div key={email} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px 3px 10px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 20, fontSize: 11.5, fontWeight: 600, color: "#6366F1" }}>
                        <span>{r ? r.name : email}</span>
                        <button onClick={() => setSelectedEmails(s => s.filter(e => e !== email))}
                          style={{ width: 14, height: 14, borderRadius: "50%", border: "none", background: "rgba(99,102,241,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#6366F1" }}>
                          <X size={8} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Search */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, marginBottom: 7 }}>
                <Search size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <input value={recipSearch} onChange={e => setRecipSearch(e.target.value)}
                  placeholder="Search Super Admins & Sales Heads…"
                  style={{ border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 12.5, flex: 1, minWidth: 0 }} />
              </div>

              {/* Recipient list */}
              <div style={{ maxHeight: 260, overflowY: "auto" }} className="custom-scroll">
                {recipients.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <Loader2 size={20} style={{ animation: "spin 0.8s linear infinite", color: "#6366F1", margin: "0 auto 8px" }} />
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading recipients…</div>
                  </div>
                ) : filteredRecipients.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12, color: "var(--text-muted)" }}>
                    {recipSearch ? "No recipients match your search" : "All recipients already selected"}
                  </div>
                ) : (
                  filteredRecipients.map(r => {
                    const rc = roleClr(r.role);
                    return (
                      <button key={r.email} onClick={() => setSelectedEmails(s => [...s, r.email])}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", marginBottom: 5, textAlign: "left", transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: rc + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: rc, flexShrink: 0 }}>
                          {(r.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.email}</div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: rc + "15", color: rc, whiteSpace: "nowrap", flexShrink: 0 }}>
                          {rlabel(r.role)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ── Preview step ── */}
          {step === "preview" && (
            <div>
              <p style={{ margin: "0 0 14px", fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>Review before sending</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ padding: "12px 14px", background: "var(--surface-2)", borderRadius: 11, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Date Range</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{selectedPreset?.label}</div>
                  {datePreset === "custom" && <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3 }}>{customStart} → {customEnd}</div>}
                </div>

                {isOwnerOrHeadModal && (
                  <div style={{ padding: "12px 14px", background: "var(--surface-2)", borderRadius: 11, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Employees Included</div>
                    {selectedEmpIds.length === 0 ? (
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Entire Team ({viewableEmployees.length} employees)</div>
                    ) : (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{selectedEmpIds.length} employee{selectedEmpIds.length !== 1 ? "s" : ""}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{selectedEmpNames.join(", ")}</div>
                      </>
                    )}
                  </div>
                )}

                <div style={{ padding: "12px 14px", background: "var(--surface-2)", borderRadius: 11, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Send To</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{selectedEmails.length} recipient{selectedEmails.length !== 1 ? "s" : ""}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{selectedRcpNames.join(", ")}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 9, fontSize: 12, color: "var(--text-2)" }}>
                  <FileText size={13} style={{ color: "#6366F1", flexShrink: 0 }} />
                  <span>A professional A4 PDF will be generated and attached to the email.</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Sending ── */}
          {step === "sending" && (
            <div style={{ padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
              <div style={{ position: "relative", width: 68, height: 68 }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                  style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "#6366F1", borderRightColor: "#8B5CF6" }} />
                <div style={{ position: "absolute", inset: 9, borderRadius: "50%", background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Send size={19} style={{ color: "#6366F1" }} />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "100%", maxWidth: 290 }}>
                {LOADING_MSGS.map((msg, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, opacity: i <= loadingStep ? 1 : 0.3, transition: "opacity 0.35s" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: i < loadingStep ? "#10B981" : i === loadingStep ? "#6366F1" : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.3s" }}>
                      {i < loadingStep ? (
                        <span style={{ fontSize: 9, color: "#fff" }}>✓</span>
                      ) : i === loadingStep ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
                          style={{ width: 9, height: 9, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#fff" }} />
                      ) : (
                        <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700 }}>{i + 1}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: i === loadingStep ? 700 : 500, color: i === loadingStep ? "var(--text)" : "var(--text-muted)" }}>{msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Success ── */}
          {step === "done" && (
            <div style={{ padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
              <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 18 }}
                style={{ width: 68, height: 68, borderRadius: "50%", background: "rgba(16,185,129,0.12)", border: "2px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={30} style={{ color: "#10B981" }} />
              </motion.div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Report Sent!</h3>
                <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>
                  Delivered to {result?.sent_to} recipient{result?.sent_to !== 1 ? "s" : ""} with PDF attached
                </p>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", padding: "8px 14px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 9 }}>
                ✓ PDF generated &nbsp;·&nbsp; ✓ Email delivered &nbsp;·&nbsp; ✓ Audit logged
              </div>
              <button onClick={onClose} style={{ padding: "9px 28px", borderRadius: 10, border: "none", background: "#10B981", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
                Done
              </button>
            </div>
          )}

          {/* ── Error ── */}
          {step === "error" && (
            <div style={{ padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
              <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 18 }}
                style={{ width: 68, height: 68, borderRadius: "50%", background: "rgba(239,68,68,0.1)", border: "2px solid rgba(239,68,68,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertCircle size={30} style={{ color: "#EF4444" }} />
              </motion.div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--text)" }}>Send Failed</h3>
                <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--text-muted)", maxWidth: 320 }}>{result?.error}</p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep("preview")} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Back
                </button>
                <button onClick={handleSend} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#EF4444", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        {!isSpecialStep && (
          <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            {stepIndex > 0 ? (
              <button onClick={goBack} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 15px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <ChevronLeft size={13} /> Back
              </button>
            ) : (
              <button onClick={onClose} style={{ padding: "8px 15px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
            )}

            {step === "preview" ? (
              <button onClick={handleSend} disabled={!selectedEmails.length}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 22px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700, cursor: !selectedEmails.length ? "not-allowed" : "pointer", opacity: !selectedEmails.length ? 0.5 : 1 }}>
                <Send size={13} /> Send DSR
              </button>
            ) : (
              <button onClick={goNext}
                disabled={!dateValid && step === "date" || (step === "recipients" && selectedEmails.length === 0)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 22px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: ((!dateValid && step === "date") || (step === "recipients" && selectedEmails.length === 0)) ? 0.5 : 1 }}>
                Next <ChevronRight size={13} />
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DSR EMAIL LOGS PANEL  —  recent email send history (owner + sales_head)
═══════════════════════════════════════════════════════════════════════ */
function DSREmailLogsPanel() {
  const { user }                      = useAuth();
  const [logs, setLogs]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [collapsed, setCollapsed]     = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res   = await fetch(`${API}/api/reports/dsr-logs?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setLogs(await res.json());
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const statusColor = (s) => s === "sent" ? "#10B981" : s === "failed" ? "#EF4444" : "#F59E0B";
  const statusIcon  = (s) => s === "sent" ? <CheckCircle2 size={9} /> : s === "failed" ? <AlertCircle size={9} /> : <Clock size={9} />;
  const statusLabel = (s) => s === "sent" ? "Sent" : s === "failed" ? "Failed" : "Pending";

  return (
    <div style={{ marginTop: 24, background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden" }}>

      {/* Header row */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: collapsed ? "none" : "1px solid var(--border)", cursor: "pointer" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <History size={14} style={{ color: "#6366F1" }} />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>Email Send History</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Recent DSR email delivery log</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={(e) => { e.stopPropagation(); fetchLogs(); }}
            title="Refresh logs"
            style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", flexShrink: 0 }}
          >
            <RefreshCw size={11} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
          </button>
          <ChevronDown size={14} style={{ color: "var(--text-muted)", transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
        </div>
      </div>

      {!collapsed && (
        <div style={{ overflowX: "auto" }}>
          {loading && logs.length === 0 ? (
            <div style={{ padding: "28px 18px", textAlign: "center" }}>
              <Loader2 size={20} style={{ animation: "spin 0.8s linear infinite", color: "#6366F1", margin: "0 auto 8px", display: "block" }} />
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading logs…</div>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: "28px 18px", textAlign: "center", fontSize: 12.5, color: "var(--text-muted)" }}>
              No email logs yet — send a DSR to see history here.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)" }}>
                  {["Report Date", "Type", "Recipients", "Status", "Sent By", "Time"].map((h) => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id || i}
                    style={{ borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "9px 14px", fontSize: 12, color: "var(--text)", whiteSpace: "nowrap" }}>
                      {log.report_date || "—"}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", textTransform: "capitalize", whiteSpace: "nowrap" }}>
                        {(log.report_type || "daily").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: "var(--text-2)", maxWidth: 260 }}>
                      <span style={{ fontWeight: 700, color: "var(--text)" }}>{log.recipient_count || (log.recipients?.length ?? 0)}</span>
                      {Array.isArray(log.recipients) && log.recipients.length > 0 && (
                        <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginLeft: 6 }} title={log.recipients.join(", ")}>
                          {log.recipients.slice(0, 2).join(", ")}{log.recipients.length > 2 ? ` +${log.recipients.length - 2} more` : ""}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: `${statusColor(log.delivery_status)}18`, color: statusColor(log.delivery_status), whiteSpace: "nowrap" }}>
                        {statusIcon(log.delivery_status)}
                        {statusLabel(log.delivery_status)}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {log.sent_by_profile?.full_name
                        ? <span>{log.sent_by_profile.full_name}</span>
                        : <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>System (Auto)</span>
                      }
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {log.sent_at ? format(new Date(log.sent_at), "MMM d, h:mm a") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DSR CONFIG MODAL  —  configure auto 8 PM DSR recipients (owner only)
═══════════════════════════════════════════════════════════════════════ */
function DSRConfigModal({ onClose }) {
  const { user }                          = useAuth();
  const [allUsers, setAllUsers]           = useState([]);
  const [selectedIds, setSelectedIds]     = useState(new Set());
  const [isLoading, setIsLoading]         = useState(false);
  const [isSaving, setIsSaving]           = useState(false);

  const rlabel = (r) => r === "owner" ? "Super Admin" : "Sales Head";

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const token = await user.getIdToken();
        const [usersRes, configRes] = await Promise.all([
          fetch(`${API}/api/reports/recipients`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/reports/dsr-config`,  { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const [users, config] = await Promise.all([usersRes.json(), configRes.json()]);
        setAllUsers(Array.isArray(users) ? users : []);
        setSelectedIds(new Set((Array.isArray(config) ? config : []).map(c => c.id)));
      } catch {
        toast.error("Failed to load DSR config");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user]);

  const toggle = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API}/api/reports/dsr-config`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ userIds: [...selectedIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(`Auto-DSR configured for ${data.configured_count} recipient${data.configured_count !== 1 ? "s" : ""}`);
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to save config");
    } finally {
      setIsSaving(false);
    }
  };

  const owners     = allUsers.filter(u => u.role === "owner");
  const salesHeads = allUsers.filter(u => u.role === "sales_head");

  const checkboxRow = (u, accentColor) => (
    <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 9, border: `1px solid ${selectedIds.has(u.id) ? `${accentColor}55` : "var(--border)"}`, background: selectedIds.has(u.id) ? `${accentColor}0d` : "var(--surface-2)", marginBottom: 7, cursor: "pointer", transition: "all 0.15s" }}>
      <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggle(u.id)} style={{ width: 15, height: 15, accentColor, cursor: "pointer", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{u.email}</div>
      </div>
    </label>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{    opacity: 0, scale: 0.96, y: 14  }}
        transition={{ duration: 0.18 }}
        style={{ position: "relative", width: "100%", maxWidth: 460, background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", boxShadow: "0 24px 60px rgba(0,0,0,0.28)", padding: "26px 28px", maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Auto DSR Recipients</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>Configure who receives the automated 8 PM daily report</p>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        <p style={{ margin: "0 0 20px", fontSize: 12, color: "var(--text-2)", padding: "8px 12px", background: "rgba(99,102,241,0.06)", borderRadius: 8, border: "1px solid rgba(99,102,241,0.15)" }}>
          If no recipients are configured, the automated DSR falls back to all Super Admins.
        </p>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 36 }}>
            <Loader2 size={22} style={{ animation: "spin 0.8s linear infinite", color: "#6366F1" }} />
          </div>
        ) : (
          <>
            {owners.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6366F1", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Super Admins</div>
                {owners.map(u => checkboxRow(u, "#6366F1"))}
              </div>
            )}
            {salesHeads.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Sales Heads</div>
                {salesHeads.map(u => checkboxRow(u, "#10B981"))}
              </div>
            )}
            {allUsers.length === 0 && (
              <div style={{ textAlign: "center", padding: "28px 0", fontSize: 13, color: "var(--text-muted)" }}>No Super Admins or Sales Heads found</div>
            )}
          </>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} disabled={isSaving}
            style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving || isLoading}
            style={{ padding: "9px 22px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            {isSaving ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Saving…</> : "Save Configuration"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════ */
export default function DSRPage() {
  const { profile } = useAuth();
  const qc        = useQueryClient();
  const pickerRef = useRef(null);
  const dateRef   = useRef(null);

  const normRole      = (profile?.role || "").toLowerCase().replace(/[- ]/g, "_");
  const isManager     = ["owner", "sales_head", "sales_manager"].includes(normRole);
  const isOwnerOrHead = ["owner", "sales_head"].includes(normRole);
  const isOwner       = normRole === "owner";

  const [dsrModalOpen, setDsrModalOpen]     = useState(false);
  const [dsrConfigOpen, setDsrConfigOpen]   = useState(false);
  const [activeTab, setActiveTab]           = useState("overview");
  const [range, setRange]                   = useState("daily");
  const [selectedDate, setSelectedDate]     = useState(new Date());
  const [targetUserId, setTargetUserId]     = useState(null);
  const [pickerOpen, setPickerOpen]         = useState(false);
  const [dateInputOpen, setDateInputOpen]   = useState(false);
  const [empPickerOpen, setEmpPickerOpen]   = useState(false);
  const [empSearch, setEmpSearch]           = useState("");
  const empPickerRef                        = useRef(null);
  const [customStart, setCustomStart]       = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd]           = useState(format(new Date(), "yyyy-MM-dd"));
  const [calMonth, setCalMonth]             = useState(startOfMonth(new Date()));
  const [selectedCalDay, setSelectedCalDay] = useState(null);
  const [actTypeFilter, setActTypeFilter]   = useState("all");
  const [actStatusFilter, setActStatusFilter] = useState("all");
  const [actSearch, setActSearch]           = useState("");

  useEffect(() => {
    const h = (e) => {
      if (pickerRef.current    && !pickerRef.current.contains(e.target))    setPickerOpen(false);
      if (dateRef.current      && !dateRef.current.contains(e.target))      setDateInputOpen(false);
      if (empPickerRef.current && !empPickerRef.current.contains(e.target)) setEmpPickerOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleRangeChange = (r) => { setRange(r); if (r !== "custom") setSelectedDate(new Date()); };

  const { start: periodStart, end: periodEnd } = useMemo(() => {
    if (range === "custom") {
      const s = customStart ? startOfDay(parseISO(customStart)) : subDays(new Date(), 6);
      const e = customEnd   ? endOfDay(parseISO(customEnd))     : new Date();
      return { start: s, end: e };
    }
    return getPeriodRange(range, selectedDate);
  }, [range, selectedDate, customStart, customEnd]);

  const rangeStart  = periodStart.toISOString();
  const rangeEnd    = periodEnd.toISOString();
  const atCurrent   = range === "custom" ? false : isCurrentPeriod(range, selectedDate);
  const periodLabel = range === "custom" ? `${customStart} → ${customEnd}` : getPeriodLabel(range, selectedDate);
  const ctx         = range === "custom" ? "in this range" : ctxLabel(range);
  const userId      = targetUserId || profile?.id;

  /* ═══ QUERIES ═══ */
  const { data: allUsers = [] } = useQuery({
    queryKey: ["dsr-all-users"],
    queryFn: async () => { const { data } = await supabase.from("profiles").select("id, full_name, email, role, avatar_url").not("status", "in", '("deleted","inactive")').order("full_name"); return data || []; },
    enabled: isManager, staleTime: 120000,
  });

  const selectedUser = targetUserId ? allUsers.find((u) => u.id === targetUserId) : { full_name: profile?.full_name, role: profile?.role };

  // Employees the current user may view: owner → all; sales_head → non-privileged staff only
  const viewableUsers = useMemo(() => {
    if (!isOwnerOrHead) return [];
    const others = allUsers.filter(u => u.id !== profile?.id);
    if (isOwner) return others;
    // Sales Head can view inside_sales, sales_employee, sales_manager
    return others.filter(u => ["inside_sales", "sales_employee", "sales_manager"].includes(u.role));
  }, [isOwner, isOwnerOrHead, allUsers, profile?.id]);

  const filteredViewableUsers = useMemo(() => {
    if (!empSearch.trim()) return viewableUsers;
    const q = empSearch.toLowerCase();
    return viewableUsers.filter(u => (u.full_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.role || "").toLowerCase().includes(q));
  }, [viewableUsers, empSearch]);

  const { data: acts = [], isFetching } = useQuery({
    queryKey: ["dsr-acts", userId, rangeStart, rangeEnd],
    queryFn: async () => {
      const { data } = await supabase.from("activities")
        .select("id, type, title, description, created_at, status, due_date, lead_id, deal_id, related_type, related_id, lead:leads!activities_lead_id_fkey(id,company_name,contact_name,stage), deal:deals!activities_deal_id_fkey(id,company_name,contact_name,title)")
        .or(`created_by.eq.${userId},user_id.eq.${userId}`)
        .gte("created_at", rangeStart).lte("created_at", rangeEnd)
        .neq("type", "email_contact").order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!userId, refetchInterval: atCurrent ? 30000 : false, refetchOnWindowFocus: true,
  });

  const { data: tasksCompleted = 0 } = useQuery({
    queryKey: ["dsr-tasks-done", userId, rangeStart, rangeEnd],
    queryFn: async () => { const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("status", "done").gte("updated_at", rangeStart).lte("updated_at", rangeEnd); return count || 0; },
    enabled: !!userId, refetchInterval: atCurrent ? 60000 : false,
  });

  const { data: pendingTasks = 0 } = useQuery({
    queryKey: ["dsr-tasks-pending", userId],
    queryFn: async () => { const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", userId).not("status", "in", '("done","cancelled")'); return count || 0; },
    enabled: !!userId, refetchInterval: atCurrent ? 120000 : false,
  });

  const { data: overdueTasks = 0 } = useQuery({
    queryKey: ["dsr-tasks-overdue", userId],
    queryFn: async () => { const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", userId).not("status", "in", '("done","cancelled")').lt("due_date", new Date().toISOString()); return count || 0; },
    enabled: !!userId, refetchInterval: atCurrent ? 120000 : false,
  });

  const { data: actsDone = 0 } = useQuery({
    queryKey: ["dsr-acts-done", userId, rangeStart, rangeEnd],
    queryFn: async () => { const { count } = await supabase.from("activities").select("id", { count: "exact", head: true }).or(`created_by.eq.${userId},user_id.eq.${userId}`).eq("status", "done").gte("updated_at", rangeStart).lte("updated_at", rangeEnd); return count || 0; },
    enabled: !!userId, refetchInterval: atCurrent ? 60000 : false,
  });

  const { data: dealsUpdated = 0 } = useQuery({
    queryKey: ["dsr-deals-moved", userId, rangeStart, rangeEnd],
    queryFn: async () => { const { count } = await supabase.from("change_history").select("id", { count: "exact", head: true }).eq("changed_by", userId).eq("field_name", "stage").gte("created_at", rangeStart).lte("created_at", rangeEnd); return count || 0; },
    enabled: !!userId, refetchInterval: atCurrent ? 60000 : false,
  });

  const { data: newLeads = [] } = useQuery({
    queryKey: ["dsr-new-leads", userId, rangeStart, rangeEnd],
    queryFn: async () => { const { data } = await supabase.from("leads").select("id, stage, contact_name, company_name, created_at").eq("assigned_to", userId).gte("created_at", rangeStart).lte("created_at", rangeEnd).order("created_at", { ascending: false }); return data || []; },
    enabled: !!userId, refetchInterval: atCurrent ? 60000 : false,
  });

  const { data: dealsWon = 0 } = useQuery({
    queryKey: ["dsr-deals-won", userId, rangeStart, rangeEnd],
    queryFn: async () => { const { count } = await supabase.from("deals").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("stage", "won").gte("updated_at", rangeStart).lte("updated_at", rangeEnd); return count || 0; },
    enabled: !!userId, refetchInterval: atCurrent ? 60000 : false,
  });

  const { data: dealsLost = 0 } = useQuery({
    queryKey: ["dsr-deals-lost", userId, rangeStart, rangeEnd],
    queryFn: async () => { const { count } = await supabase.from("deals").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("stage", "lost").gte("updated_at", rangeStart).lte("updated_at", rangeEnd); return count || 0; },
    enabled: !!userId, refetchInterval: atCurrent ? 60000 : false,
  });

  const { data: revenueWon = 0 } = useQuery({
    queryKey: ["dsr-revenue-won", userId, rangeStart, rangeEnd],
    queryFn: async () => { const { data } = await supabase.from("deals").select("value").eq("assigned_to", userId).eq("stage", "won").gte("updated_at", rangeStart).lte("updated_at", rangeEnd); return (data || []).reduce((s, d) => s + (parseFloat(d.value) || 0), 0); },
    enabled: !!userId, refetchInterval: atCurrent ? 60000 : false,
  });

  /* Uncompleted past meetings — triggers reminder banner */
  const { data: uncompletedMeetings = [] } = useQuery({
    queryKey: ["dsr-meeting-alerts", userId],
    queryFn: async () => {
      const { data } = await supabase.from("meetings")
        .select("id, title, start_time, meeting_type, status")
        .or(`created_by.eq.${userId},user_id.eq.${userId}`)
        .in("status", ["scheduled", "pending"])
        .lt("start_time", new Date().toISOString())
        .order("start_time", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!userId && atCurrent,
    refetchInterval: 300000,
  });

  const { data: calActs = [] } = useQuery({
    queryKey: ["dsr-cal-acts", userId, format(calMonth, "yyyy-MM")],
    queryFn: async () => {
      const { data } = await supabase.from("activities").select("id, type, title, status, created_at")
        .or(`created_by.eq.${userId},user_id.eq.${userId}`)
        .gte("created_at", startOfMonth(calMonth).toISOString()).lte("created_at", endOfMonth(calMonth).toISOString())
        .neq("type", "email_contact").order("created_at");
      return data || [];
    },
    enabled: !!userId && activeTab === "calendar", staleTime: 60000,
  });

  const { data: teamActs = [] } = useQuery({
    queryKey: ["dsr-team-acts", rangeStart, rangeEnd],
    queryFn: async () => {
      const { data } = await supabase.from("activities").select("created_by, user_id, status, type")
        .gte("created_at", rangeStart).lte("created_at", rangeEnd).neq("type", "email_contact");
      return data || [];
    },
    enabled: isOwnerOrHead, refetchInterval: atCurrent ? 60000 : false,
  });

  /* ─── Real-time ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!userId || !atCurrent) return;
    const ch = supabase.channel(`dsr-v4-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
        qc.invalidateQueries({ queryKey: ["dsr-acts", userId] });
        qc.invalidateQueries({ queryKey: ["dsr-acts-done", userId] });
        if (isOwnerOrHead) qc.invalidateQueries({ queryKey: ["dsr-team-acts"] });
        if (activeTab === "calendar") qc.invalidateQueries({ queryKey: ["dsr-cal-acts", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["dsr-tasks-done", userId] });
        qc.invalidateQueries({ queryKey: ["dsr-tasks-pending", userId] });
        qc.invalidateQueries({ queryKey: ["dsr-tasks-overdue", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => {
        qc.invalidateQueries({ queryKey: ["dsr-meeting-alerts", userId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, atCurrent, isOwnerOrHead, activeTab, qc]);

  /* ═══ DERIVED VALUES ═══ */
  const typeCounts = useMemo(() => {
    const m = {};
    acts.forEach((a) => { const k = resolveType(a.type); m[k] = (m[k] || 0) + 1; });
    return m;
  }, [acts]);

  const totalActs  = acts.length;
  const totalDone  = tasksCompleted + actsDone;
  const scoreData  = calcScore({ actCount: totalActs, tasksCompleted: totalDone, dealsUpdated, leadsCreated: newLeads.length });
  const score      = scoreData.total;
  const chartData  = useMemo(() => buildChartData(range, selectedDate, acts), [range, selectedDate, acts]);

  const leadsByStage = useMemo(() => {
    const m = {};
    newLeads.forEach((l) => { const s = l.stage || "new"; m[s] = (m[s] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [newLeads]);

  const winRate = (dealsWon + dealsLost) > 0 ? Math.round((dealsWon / (dealsWon + dealsLost)) * 100) : 0;
  const actCompletionRate = totalActs > 0 ? Math.round((actsDone / totalActs) * 100) : 0;
  const taskCompletionRate = (tasksCompleted + pendingTasks) > 0 ? Math.round((tasksCompleted / (tasksCompleted + pendingTasks)) * 100) : 0;

  const bestDay = useMemo(() => {
    if (!chartData.length) return null;
    return chartData.reduce((best, d) => d.count > (best?.count || 0) ? d : best, null);
  }, [chartData]);

  const avgPerUnit = useMemo(() => {
    return chartData.length > 0 ? Math.round(totalActs / chartData.length) : 0;
  }, [chartData, totalActs]);

  /* Filtered activities */
  const filteredActs = useMemo(() => {
    return acts.filter((a) => {
      if (actTypeFilter !== "all" && resolveType(a.type) !== actTypeFilter) return false;
      if (actStatusFilter !== "all" && a.status !== actStatusFilter) return false;
      if (actSearch) {
        const q = actSearch.toLowerCase();
        const company = (a.lead?.company_name || a.deal?.company_name || a.deal?.title || "").toLowerCase();
        const contact = (a.lead?.contact_name || a.deal?.contact_name || "").toLowerCase();
        if (!a.title?.toLowerCase().includes(q) && !a.description?.toLowerCase().includes(q) && !company.includes(q) && !contact.includes(q)) return false;
      }
      return true;
    });
  }, [acts, actTypeFilter, actStatusFilter, actSearch]);

  /* Timeline groups */
  const timelineGroups = useMemo(() => {
    const todayStr    = format(new Date(), "yyyy-MM-dd");
    const yestStr     = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const weekStart   = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const groupMap    = {};
    filteredActs.forEach((a) => {
      const day = a.created_at?.slice(0, 10) || "";
      let label;
      if (day === todayStr)      label = "Today";
      else if (day === yestStr)  label = "Yesterday";
      else if (day >= weekStart) label = "Earlier This Week";
      else                       label = format(parseISO(day), "MMM d, yyyy");
      if (!groupMap[label]) groupMap[label] = [];
      groupMap[label].push(a);
    });
    const order = ["Today", "Yesterday", "Earlier This Week"];
    const result = [];
    order.forEach((l) => { if (groupMap[l]) { result.push({ label: l, acts: groupMap[l] }); delete groupMap[l]; } });
    Object.entries(groupMap).sort((a, b) => b[0].localeCompare(a[0])).forEach(([label, acts]) => result.push({ label, acts }));
    return result;
  }, [filteredActs]);

  /* Calendar day activities */
  const calDayActs = useMemo(() => {
    if (!selectedCalDay) return [];
    const dayStr = format(selectedCalDay, "yyyy-MM-dd");
    return calActs.filter((a) => a.created_at.slice(0, 10) === dayStr);
  }, [selectedCalDay, calActs]);

  /* Team performance */
  const teamPerformance = useMemo(() => {
    if (!isOwnerOrHead || !allUsers.length) return [];
    const m = {};
    teamActs.forEach((a) => {
      const uid = a.created_by || a.user_id;
      if (!uid) return;
      if (!m[uid]) m[uid] = { total: 0 };
      m[uid].total++;
      const k = resolveType(a.type);
      m[uid][k] = (m[uid][k] || 0) + 1;
    });
    return allUsers.map((u) => {
      const st = m[u.id] || {};
      return {
        ...u,
        actCount:     st.total || 0,
        callCount:    st.call || 0,
        fuCallCount:  st.follow_up_call || 0,
        fuEmailCount: st.follow_up_email || 0,
        meetCount:    (st.meeting_person || 0) + (st.meeting_virtual || 0),
        emailCount:   st.email || 0,
        noteCount:    st.note || 0,
        score:        calcScore({ actCount: st.total || 0, tasksCompleted: 0, dealsUpdated: 0, leadsCreated: 0 }).total,
      };
    }).sort((a, b) => b.actCount - a.actCount);
  }, [isOwnerOrHead, allUsers, teamActs]);

  /* Communication chart data */
  const commChartData = useMemo(() =>
    Object.entries(CORE_TYPES).map(([key, cfg]) => ({ name: cfg.short, fullName: cfg.label, count: typeCounts[key] || 0, color: cfg.color }))
      .filter((d) => d.count > 0).sort((a, b) => b.count - a.count),
    [typeCounts]);

  /* Export CSV */
  const handleExportCSV = useCallback(() => {
    const headers = ["Date", "Time", "Type", "Title", "Status", "Description"];
    const rows = acts.map((a) => [
      format(new Date(a.created_at), "yyyy-MM-dd"),
      format(new Date(a.created_at), "HH:mm"),
      CORE_TYPES[resolveType(a.type)]?.label || resolveType(a.type),
      a.title || "",
      a.status || "",
      (a.description || "").replace(/"/g, '""'),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const el   = document.createElement("a");
    el.href = url; el.download = `DSR_${format(new Date(), "yyyyMMdd")}.csv`;
    el.click(); URL.revokeObjectURL(url);
  }, [acts]);

  const timestampFmt = range === "daily" ? "h:mm a" : range === "weekly" ? "EEE, h:mm a" : "MMM d, h:mm a";

  /* Meeting counts for right panel */
  const totalMeetings   = (typeCounts.meeting_person || 0) + (typeCounts.meeting_virtual || 0);
  const doneMeetings    = acts.filter((a) => (resolveType(a.type) === "meeting_person" || resolveType(a.type) === "meeting_virtual") && a.status === "done").length;
  const pendingMeetings = totalMeetings - doneMeetings;

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>

      {/* ════ Top Header ════ */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.025em", margin: 0 }}>Daily Sales Report</h1>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3, margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
            <Calendar size={11} style={{ color: "var(--text-muted)" }} />
            {periodLabel}
            {isFetching && atCurrent && (
              <span style={{ fontSize: 10.5, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block", animation: "pulse 1.4s ease-in-out infinite" }} />
                live
              </span>
            )}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleExportCSV} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            <Download size={13} /> Export CSV
          </button>
          <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            <Printer size={13} /> Print
          </button>

          {isOwnerOrHead && (
            <button
              onClick={() => setDsrModalOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 9, border: "1px solid rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.08)", color: "#6366F1", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              <Send size={13} /> Send DSR
            </button>
          )}
          {isOwner && (
            <button
              onClick={() => setDsrConfigOpen(true)}
              title="Configure auto DSR recipients"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              <Settings size={13} /> Configure
            </button>
          )}

          <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 10, padding: 3, border: "1px solid var(--border)", gap: 1 }}>
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => handleRangeChange(r.key)}
                style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: range === r.key ? "var(--accent)" : "transparent", color: range === r.key ? "#fff" : "var(--text-muted)", fontWeight: range === r.key ? 700 : 500, fontSize: 11, cursor: "pointer", transition: "all 0.14s", whiteSpace: "nowrap" }}>
                {r.label}
              </button>
            ))}
          </div>

          {/* compact fallback for non-owner/head managers (sales_manager) */}
          {isManager && !isOwnerOrHead && (
            <div ref={pickerRef} style={{ position: "relative" }}>
              <button onClick={() => setPickerOpen((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>
                <User size={13} style={{ color: "var(--text-muted)" }} />
                My Report
                <ChevronDown size={11} style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ════ Employee Context Selector (Super Admin + Sales Head only) ════ */}
      {isOwnerOrHead && (
        <div style={{ marginBottom: 16, padding: "14px 18px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>

          {/* Avatar + name + role of currently viewed employee */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 180 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", background: !targetUserId ? "#6366F1" : selectedUser?.role === "sales_head" ? "#10B981" : selectedUser?.role === "owner" ? "#6366F1" : "#3B82F6" }}>
              {((targetUserId ? selectedUser?.full_name : profile?.full_name) || "?").charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {targetUserId ? (selectedUser?.full_name || "Unknown") : `${profile?.full_name || "Me"}`}
                {!targetUserId && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", marginLeft: 5 }}>(You)</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>
                {((targetUserId ? selectedUser?.role : profile?.role) || "").replace(/_/g, " ")}
              </div>
            </div>
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 32, background: "var(--border)", flexShrink: 0 }} />

          {/* Searchable employee picker */}
          <div ref={empPickerRef} style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 340 }}>
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", background: "var(--surface-2)", border: `1px solid ${empPickerOpen ? "rgba(99,102,241,0.5)" : "var(--border)"}`, borderRadius: 10, cursor: "text", transition: "border-color 0.15s" }}
              onClick={() => { setEmpPickerOpen(true); }}
            >
              <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              {empPickerOpen ? (
                <input
                  autoFocus
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder="Search by name or role…"
                  style={{ border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 13, flex: 1, minWidth: 0 }}
                />
              ) : (
                <span style={{ fontSize: 13, color: "var(--text-2)", flex: 1, userSelect: "none" }}>
                  {targetUserId ? "Change employee…" : "Select an employee to view their DSR…"}
                </span>
              )}
              <ChevronDown size={12} style={{ color: "var(--text-muted)", flexShrink: 0, transform: empPickerOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </div>

            {empPickerOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.12 }}
                style={{ position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, zIndex: 80, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", maxHeight: 240, overflowY: "auto" }}
                className="custom-scroll"
              >
                {/* My Report option */}
                <button
                  onClick={() => { setTargetUserId(null); setEmpSearch(""); setEmpPickerOpen(false); }}
                  style={{ width: "100%", textAlign: "left", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border)", background: !targetUserId ? "rgba(99,102,241,0.07)" : "transparent", cursor: "pointer" }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: !targetUserId ? "#6366F1" : "var(--text)" }}>My Report</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{profile?.full_name}</div>
                </button>

                {/* Employee list */}
                {filteredViewableUsers.length === 0 ? (
                  <div style={{ padding: "14px 16px", fontSize: 12.5, color: "var(--text-muted)", textAlign: "center" }}>
                    {empSearch ? "No employees match your search" : "No employees accessible"}
                  </div>
                ) : (
                  filteredViewableUsers.map((u) => {
                    const roleColor = u.role === "sales_head" ? "#10B981" : u.role === "owner" ? "#6366F1" : "#3B82F6";
                    return (
                      <button key={u.id}
                        onClick={() => { setTargetUserId(u.id); setEmpSearch(""); setEmpPickerOpen(false); }}
                        style={{ width: "100%", textAlign: "left", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border)", background: targetUserId === u.id ? "rgba(99,102,241,0.07)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                        onMouseEnter={(e) => { if (targetUserId !== u.id) e.currentTarget.style.background = "var(--surface-2)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = targetUserId === u.id ? "rgba(99,102,241,0.07)" : "transparent"; }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: targetUserId === u.id ? "#6366F1" : "var(--text)" }}>{u.full_name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{u.email || ""}</div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: `${roleColor}18`, color: roleColor, whiteSpace: "nowrap", flexShrink: 0 }}>
                          {(u.role || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      </button>
                    );
                  })
                )}
              </motion.div>
            )}
          </div>

          {/* Clear button — only when viewing someone else */}
          {targetUserId && (
            <button
              onClick={() => { setTargetUserId(null); setEmpSearch(""); }}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}
            >
              <X size={12} /> My Report
            </button>
          )}

          {/* Accessible count chip */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 20, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
            <Users size={11} />
            {viewableUsers.length} employee{viewableUsers.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* ════ Tabs ════ */}
      <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 11, padding: 4, border: "1px solid var(--border)", marginBottom: 18, width: "fit-content" }}>
        {TABS.filter((t) => !t.managerOnly || isManager).map((tab) => {
          const Icon = tab.icon; const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: active ? "var(--surface)" : "transparent", color: active ? "var(--text)" : "var(--text-muted)", fontWeight: active ? 700 : 500, fontSize: 13, boxShadow: active ? "var(--shadow-xs)" : "none", transition: "all 0.14s" }}>
              <Icon size={14} strokeWidth={1.8} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ════ Period Navigator ════ */}
      {activeTab !== "calendar" && range !== "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "9px 14px", background: "var(--surface-2)", borderRadius: 11, border: "1px solid var(--border)" }}>
          <button onClick={() => setSelectedDate((d) => navigatePeriod(range, d, -1))}
            style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            <ChevronLeft size={14} />
          </button>
          <div ref={dateRef} style={{ flex: 1, position: "relative" }}>
            <button onClick={() => setDateInputOpen((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, color: "var(--text)", fontWeight: 700, fontSize: 13.5 }}>
              <Calendar size={13} style={{ color: "var(--accent)" }} />
              {periodLabel}
              <ChevronDown size={11} style={{ color: "var(--text-muted)" }} />
            </button>
            <AnimatePresence>
              {dateInputOpen && (range === "daily" || range === "monthly" || range === "yearly") && (
                <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 3 }} transition={{ duration: 0.11 }}
                  style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 10, boxShadow: "var(--shadow-lg)" }}>
                  <input type={range === "daily" ? "date" : range === "monthly" ? "month" : "number"} min={range === "yearly" ? "2020" : undefined} max={range === "yearly" ? String(getYear(new Date())) : undefined}
                    value={range === "daily" ? format(selectedDate, "yyyy-MM-dd") : range === "monthly" ? format(selectedDate, "yyyy-MM") : String(getYear(selectedDate))}
                    onChange={(e) => { if (!e.target.value) return; setSelectedDate(range === "yearly" ? new Date(Number(e.target.value), 0, 1) : new Date(e.target.value)); setDateInputOpen(false); }}
                    style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13 }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={() => { if (!atCurrent) setSelectedDate((d) => navigatePeriod(range, d, 1)); }} disabled={atCurrent}
            style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", cursor: atCurrent ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", opacity: atCurrent ? 0.35 : 1 }}>
            <ChevronRight size={14} />
          </button>
          {!atCurrent && (
            <button onClick={() => setSelectedDate(new Date())}
              style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.08)", cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: "#6366F1", whiteSpace: "nowrap" }}>
              Today
            </button>
          )}
        </div>
      )}

      {/* Custom date range */}
      {activeTab !== "calendar" && range === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", borderRadius: 11, border: "1px solid rgba(99,102,241,0.2)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>From</span>
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} max={customEnd}
            style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>To</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} min={customStart} max={format(new Date(), "yyyy-MM-dd")}
            style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>{periodLabel}</span>
        </div>
      )}

      {/* Viewing-as badge */}
      {targetUserId && selectedUser && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 9, marginBottom: 16 }}>
          <User size={13} style={{ color: "#6366F1" }} />
          <span style={{ fontSize: 12.5, color: "var(--text)" }}>Viewing: <b>{selectedUser.full_name}</b></span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)", textTransform: "capitalize" }}>— {selectedUser.role?.replace(/_/g, " ")}</span>
          <button onClick={() => setTargetUserId(null)} style={{ marginLeft: "auto", fontSize: 11, color: "#6366F1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Back to my report</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          OVERVIEW TAB
      ════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <>
          {/* Compact KPI Pill Strip */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14, padding: "10px 14px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
            {/* Total */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 99, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)" }}>
              <Zap size={10} style={{ color: "#6366F1" }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{totalActs}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Total</span>
            </div>

            {/* 7 type pills */}
            {Object.entries(CORE_TYPES).map(([key, cfg]) => {
              const count = typeCounts[key] || 0;
              const Icon  = cfg.icon;
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 99, background: count > 0 ? cfg.bg : "transparent", border: `1px solid ${count > 0 ? cfg.color + "35" : "var(--border)"}`, opacity: count > 0 ? 1 : 0.5, cursor: "pointer", transition: "opacity 0.12s" }}
                  onClick={() => setActTypeFilter(actTypeFilter === key ? "all" : key)}>
                  <Icon size={10} style={{ color: cfg.color }} strokeWidth={2.2} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: count > 0 ? "var(--text)" : "var(--text-muted)" }}>{count}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{cfg.short}</span>
                </div>
              );
            })}

            {/* Summary pills — pushed to right */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 99, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}>
                <CheckCircle2 size={10} style={{ color: "#10B981" }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{totalDone}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Done</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 99, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <Clock size={10} style={{ color: "#F59E0B" }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{pendingTasks}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Pending</span>
              </div>
              {overdueTasks > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 99, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <AlertCircle size={10} style={{ color: "#EF4444" }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#EF4444" }}>{overdueTasks}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Overdue</span>
                </div>
              )}
            </div>
          </div>

          {/* Meeting Alert Banner */}
          <AnimatePresence>
            {uncompletedMeetings.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.22)", borderRadius: 10, marginBottom: 14 }}>
                <Bell size={14} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#EF4444", marginBottom: 3 }}>
                    {uncompletedMeetings.length} past meeting{uncompletedMeetings.length > 1 ? "s" : ""} not yet marked completed
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>
                    Please mark past meetings as Done/Completed to update your DSR and productivity metrics.
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {uncompletedMeetings.map((m) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", fontSize: 11.5, color: "var(--text)" }}>
                        <Calendar size={10} style={{ color: "#EF4444" }} />
                        <span style={{ fontWeight: 600 }}>{m.title || "Meeting"}</span>
                        <span style={{ color: "var(--text-muted)" }}>{format(new Date(m.start_time), "MMM d, h:mm a")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 2-column layout: 65% timeline | 35% right panel */}
          <div style={{ display: "grid", gridTemplateColumns: "65% 1fr", gap: 16, alignItems: "start" }}>

            {/* ── Activity Timeline ── */}
            <div className="card" style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Clock size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Activity Timeline</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "2px 8px", borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    {filteredActs.length}{filteredActs.length !== acts.length ? ` / ${acts.length}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ position: "relative" }}>
                    <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input value={actSearch} onChange={(e) => setActSearch(e.target.value)} placeholder="Search…"
                      style={{ paddingLeft: 26, paddingRight: 8, paddingTop: 5, paddingBottom: 5, borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 11.5, width: 130 }} />
                    {actSearch && <button onClick={() => setActSearch("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}><X size={10} /></button>}
                  </div>
                  <select value={actTypeFilter} onChange={(e) => setActTypeFilter(e.target.value)}
                    style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 11.5, cursor: "pointer" }}>
                    <option value="all">All Types</option>
                    {Object.entries(CORE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <select value={actStatusFilter} onChange={(e) => setActStatusFilter(e.target.value)}
                    style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 11.5, cursor: "pointer" }}>
                    <option value="all">All Status</option>
                    <option value="todo">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                  {(actTypeFilter !== "all" || actStatusFilter !== "all" || actSearch) && (
                    <button onClick={() => { setActTypeFilter("all"); setActStatusFilter("all"); setActSearch(""); }}
                      style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}>
                      <X size={10} /> Clear
                    </button>
                  )}
                </div>
              </div>

              {filteredActs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "52px 0", color: "var(--text-muted)" }}>
                  <Zap size={30} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)", marginBottom: 5 }}>No activities found</div>
                  <div style={{ fontSize: 12 }}>{acts.length === 0 ? (atCurrent ? "Log calls, follow-ups, and meetings to build your report" : `No activities during ${periodLabel}`) : "Try clearing filters"}</div>
                </div>
              ) : (
                <div>
                  {timelineGroups.map((group) => (
                    <div key={group.label} style={{ marginBottom: 18 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{group.label}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "1px 6px", borderRadius: 99 }}>{group.acts.length}</span>
                        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                      </div>
                      {group.acts.map((act, idx) => {
                        const cfg = CORE_TYPES[resolveType(act.type)];
                        return (
                          <motion.div key={act.id}
                            initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(idx * 0.02, 0.18), duration: 0.16 }}
                          >
                            <DSRActivityCard act={act} cfg={cfg} timestampFmt={timestampFmt} selectedUser={selectedUser} />
                          </motion.div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Right Panel ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Productivity Score */}
              <div className="card" style={{ padding: "20px 18px" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                  <ScoreRing score={score} size={90} strokeWidth={7} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {[
                    { label: "Activity done", val: `${actCompletionRate}%`, color: "#6366F1" },
                    { label: "Task done",     val: `${taskCompletionRate}%`, color: "#10B981" },
                    { label: "Win rate",      val: `${winRate}%`,           color: "#8B5CF6" },
                    { label: "Deals moved",   val: String(dealsUpdated),    color: "#F59E0B" },
                    { label: "New leads",     val: String(newLeads.length), color: "#06B6D4" },
                  ].map((m) => (
                    <div key={m.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--text-muted)" }}>{m.label}</span>
                      <span style={{ fontWeight: 800, color: m.color }}>{m.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Communication Mix */}
              <div className="card" style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Communication Mix</div>
                {totalActs === 0 ? (
                  <div style={{ textAlign: "center", padding: "12px 0", fontSize: 12, color: "var(--text-muted)" }}>No activities {ctx}</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {Object.entries(CORE_TYPES).map(([key, cfg]) => {
                      const count = typeCounts[key] || 0;
                      const pct   = totalActs ? Math.round((count / totalActs) * 100) : 0;
                      const Icon  = cfg.icon;
                      return (
                        <div key={key}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 5, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Icon size={9} style={{ color: cfg.color }} strokeWidth={2.2} />
                            </div>
                            <span style={{ flex: 1, fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cfg.short}</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: count > 0 ? "var(--text)" : "var(--text-muted)", minWidth: 16, textAlign: "right" }}>{count}</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 24, textAlign: "right" }}>{pct}%</span>
                          </div>
                          <div style={{ height: 3, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }}
                              style={{ height: "100%", background: cfg.color, borderRadius: 99 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Meeting Status */}
              <div className="card" style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Meeting Status</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "Total",   val: totalMeetings,   color: "#8B5CF6", bg: "rgba(139,92,246,0.08)", bd: "rgba(139,92,246,0.2)" },
                    { label: "Done",    val: doneMeetings,    color: "#10B981", bg: "rgba(16,185,129,0.08)", bd: "rgba(16,185,129,0.2)" },
                    { label: "Pending", val: pendingMeetings, color: pendingMeetings > 0 ? "#EF4444" : "var(--text-muted)", bg: pendingMeetings > 0 ? "rgba(239,68,68,0.06)" : "var(--surface-2)", bd: pendingMeetings > 0 ? "rgba(239,68,68,0.2)" : "var(--border)" },
                  ].map((s) => (
                    <div key={s.label} style={{ flex: 1, padding: "9px 6px", borderRadius: 8, background: s.bg, border: `1px solid ${s.bd}`, textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
                      <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Users size={10} style={{ color: "#8B5CF6" }} />
                    <span style={{ color: "var(--text-muted)" }}>In-Person:</span>
                    <b style={{ color: "var(--text)" }}>{typeCounts.meeting_person || 0}</b>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Video size={10} style={{ color: "#6366F1" }} />
                    <span style={{ color: "var(--text-muted)" }}>Virtual:</span>
                    <b style={{ color: "var(--text)" }}>{typeCounts.meeting_virtual || 0}</b>
                  </span>
                </div>
                {pendingMeetings > 0 && (
                  <div style={{ fontSize: 10.5, color: "#EF4444", padding: "6px 10px", background: "rgba(239,68,68,0.04)", borderRadius: 7, border: "1px solid rgba(239,68,68,0.15)" }}>
                    Mark pending meetings as Done to update your productivity score.
                  </div>
                )}
              </div>

            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════
          CALENDAR TAB
      ════════════════════════════════════════════════════ */}
      {activeTab === "calendar" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
          <div className="card" style={{ padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <button onClick={() => setCalMonth((m) => subMonths(m, 1))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                <ChevronLeft size={14} />
              </button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>{format(calMonth, "MMMM yyyy")}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{calActs.length} activities this month</div>
              </div>
              <button onClick={() => setCalMonth((m) => addMonths(m, 1))} disabled={isSameMonth(calMonth, new Date())}
                style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: isSameMonth(calMonth, new Date()) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", opacity: isSameMonth(calMonth, new Date()) ? 0.35 : 1 }}>
                <ChevronRight size={14} />
              </button>
            </div>
            <CalendarHeatmap acts={calActs} month={calMonth} onDayClick={setSelectedCalDay} selectedDay={selectedCalDay} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              {Object.entries(CORE_TYPES).map(([key, cfg]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color }} />
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cfg.short}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 14 }}>Month Summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {Object.entries(CORE_TYPES).map(([key, cfg]) => {
                  const count = calActs.filter((a) => resolveType(a.type) === key).length;
                  const Icon  = cfg.icon;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 8, background: count > 0 ? cfg.bg : "var(--surface-2)", border: `1px solid ${count > 0 ? cfg.color + "25" : "var(--border)"}` }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={10} style={{ color: cfg.color }} strokeWidth={2} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: count > 0 ? cfg.color : "var(--text-muted)", lineHeight: 1 }}>{count}</div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{cfg.short}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card" style={{ padding: "18px 20px" }}>
              {!selectedCalDay ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)" }}>
                  <CalendarDays size={26} style={{ margin: "0 auto 10px", opacity: 0.2 }} />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Click a date</div>
                  <div style={{ fontSize: 11, marginTop: 3 }}>to see that day's activities</div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{format(selectedCalDay, "EEEE, MMM d")}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{calDayActs.length} {calDayActs.length === 1 ? "activity" : "activities"}</div>
                    </div>
                    <button onClick={() => setSelectedCalDay(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}><X size={14} /></button>
                  </div>
                  {calDayActs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-muted)", fontSize: 12 }}>No activities logged on this day</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {calDayActs.map((act) => {
                        const k = resolveType(act.type); const cfg = CORE_TYPES[k];
                        return (
                          <div key={act.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ width: 24, height: 24, borderRadius: 6, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <cfg.icon size={10} style={{ color: cfg.color }} strokeWidth={2} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{act.title || cfg.label}</div>
                              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{format(new Date(act.created_at), "h:mm a")}</div>
                            </div>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: act.status === "done" ? "#10B981" : "#F59E0B", flexShrink: 0 }} title={act.status} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          ANALYTICS TAB
      ════════════════════════════════════════════════════ */}
      {activeTab === "analytics" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>

            {/* Score Breakdown */}
            <div className="card" style={{ padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <Star size={14} style={{ color: "#F59E0B" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Score Breakdown</span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <ScoreRing score={score} size={96} strokeWidth={7} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Activities", earned: scoreData.a, max: 40, color: "#6366F1" },
                  { label: "Tasks",      earned: scoreData.t, max: 20, color: "#10B981" },
                  { label: "Deals",      earned: scoreData.d, max: 20, color: "#8B5CF6" },
                  { label: "Leads",      earned: scoreData.l, max: 20, color: "#06B6D4" },
                ].map((s) => (
                  <div key={s.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ color: "var(--text-2)" }}>{s.label}</span>
                      <span style={{ fontWeight: 700, color: s.color }}>{s.earned} / {s.max}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.round((s.earned / s.max) * 100)}%`, background: s.color, borderRadius: 99 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Completion Metrics */}
            <div className="card" style={{ padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <CheckCircle2 size={14} style={{ color: "#10B981" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Completion Metrics</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <MetricBar label="Activity Completion" value={actsDone} max={totalActs || 1} color="#10B981" />
                <MetricBar label="Task Completion" value={tasksCompleted} max={tasksCompleted + pendingTasks || 1} color="#6366F1" />
                <MetricBar label="Deal Win Rate" value={dealsWon} max={dealsWon + dealsLost || 1} color="#8B5CF6" />
                <MetricBar label="Meeting Completion" value={doneMeetings} max={totalMeetings || 1} color="#8B5CF6" />
              </div>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  { label: "Activity done rate",  val: `${actCompletionRate}%`,   color: "#10B981" },
                  { label: "Task done rate",       val: `${taskCompletionRate}%`,  color: "#6366F1" },
                  { label: "Overdue tasks",         val: String(overdueTasks),    color: overdueTasks > 0 ? "#EF4444" : "#10B981" },
                ].map((m) => (
                  <div key={m.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-muted)" }}>{m.label}</span>
                    <span style={{ fontWeight: 700, color: m.color }}>{m.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Revenue & Pipeline */}
            <div className="card" style={{ padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <BarChart3 size={14} style={{ color: "#F59E0B" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Revenue & Pipeline</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.07em" }}>Revenue Won</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#F59E0B", letterSpacing: "-0.04em", marginTop: 4 }}>{fmtCurrency(revenueWon)}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>from {dealsWon} deal{dealsWon !== 1 ? "s" : ""} won {ctx}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                  {[
                    { label: "Win Rate",    val: `${winRate}%`,    color: winRate >= 50 ? "#10B981" : "#F59E0B" },
                    { label: "Deals Moved", val: String(dealsUpdated), color: "#8B5CF6" },
                    { label: "Leads",       val: String(newLeads.length), color: "#06B6D4" },
                    { label: "Deals Won",   val: String(dealsWon), color: "#10B981" },
                  ].map((s) => (
                    <div key={s.label} style={{ padding: "10px 12px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center" }}>
                      <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: s.color, marginTop: 3 }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Communication Distribution + Productivity Insights */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Activity size={14} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Communication Distribution</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>{totalActs} total — {periodLabel}</div>
              {commChartData.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 12 }}>No activity data for this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={commChartData} layout="vertical" margin={{ top: 0, right: 44, left: 10, bottom: 0 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11.5, fill: "var(--text-2)" }} width={68} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? (
                      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 11px", fontSize: 12 }}>
                        <b style={{ color: "var(--text)" }}>{payload[0].payload.fullName}:</b> <span style={{ color: "var(--text-muted)" }}>{payload[0].value} activities</span>
                      </div>
                    ) : null} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: "right", style: { fill: "var(--text-muted)", fontSize: 11, fontWeight: 700 } }}>
                      {commChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card" style={{ padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <TrendingUp size={14} style={{ color: "#10B981" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Productivity Insights</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { label: "Total Activities", value: String(totalActs), sub: ctx, color: "#6366F1" },
                  { label: "Avg per unit",     value: String(avgPerUnit), sub: `per ${range === "weekly" ? "day" : range === "monthly" ? "week" : range === "daily" ? "hour" : "month"}`, color: "#3B82F6" },
                  { label: "Best period",      value: bestDay ? String(bestDay.count) : "—", sub: bestDay ? (bestDay.fullLabel || bestDay.label) : "no data yet", color: "#F59E0B" },
                  { label: "Activity score",   value: String(score), sub: "out of 100", color: score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444" },
                  { label: "New leads",        value: String(newLeads.length), sub: `assigned ${ctx}`, color: "#06B6D4" },
                  { label: "Revenue won",      value: fmtCurrency(revenueWon), sub: "closed deals value", color: "#F59E0B" },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text)" }}>{item.label}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>{item.sub}</div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: item.color, letterSpacing: "-0.03em" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trend chart */}
          <div className="card" style={{ padding: "22px 24px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <BarChart3 size={14} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Activity Trend — {CHART_TITLE[range] || "Activity Trend"}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 18 }}>{periodLabel}</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barCategoryGap="22%" margin={{ top: 4, right: 8, left: -26, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} interval={range === "daily" ? 2 : 0} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(99,102,241,0.06)" }} content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 11px", fontSize: 12, boxShadow: "var(--shadow-lg)" }}>
                      <b style={{ color: "var(--text)" }}>{payload[0].payload.fullLabel || payload[0].payload.label}:</b> <span style={{ color: "var(--text-muted)" }}>{payload[0].value} activities</span>
                    </div>
                  ) : null
                } />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={52}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.isCurrent ? "#6366F1" : "rgba(99,102,241,0.25)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════
          TEAM TAB
      ════════════════════════════════════════════════════ */}
      {activeTab === "team" && isManager && (
        <>
          {!isOwnerOrHead && (
            <div style={{ padding: "12px 16px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 10, marginBottom: 16, fontSize: 12.5, color: "var(--text-muted)" }}>
              Team analytics access is limited. Contact your manager for full team reports.
            </div>
          )}
          {isOwnerOrHead && (
            <div className="card" style={{ padding: "22px 24px", overflowX: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <Award size={14} style={{ color: "#F59E0B" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Team Performance</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", padding: "2px 9px", borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--border)" }}>{allUsers.length} members</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" }}>{periodLabel}</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    {["#", "Employee", "Role", "Total", "Calls", "FU Calls", "FU Emails", "Meetings", "Emails", "Notes", "Score"].map((h, i) => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: i >= 3 ? "right" : "left", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamPerformance.map((emp, i) => (
                    <tr key={emp.id} onClick={() => setTargetUserId(emp.id === profile?.id ? null : emp.id)}
                      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: emp.id === userId ? "rgba(99,102,241,0.04)" : "transparent", transition: "background 0.1s" }}
                      onMouseEnter={(e) => { if (emp.id !== userId) e.currentTarget.style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = emp.id === userId ? "rgba(99,102,241,0.04)" : "transparent"; }}>
                      <td style={{ padding: "10px 10px", fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: "10px 10px", fontSize: 12.5, color: "var(--text)", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg,#2563EB,#4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
                            {emp.avatar_url ? <img src={emp.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : emp.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 600 }}>{emp.full_name}</span>
                          {emp.id === profile?.id && <span style={{ fontSize: 9, fontWeight: 700, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "1px 6px", borderRadius: 99 }}>You</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 10px", fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>{emp.role?.replace(/_/g, " ")}</td>
                      <td style={{ padding: "10px 10px", fontSize: 14, fontWeight: 900, color: "var(--text)", textAlign: "right" }}>{emp.actCount}</td>
                      <td style={{ padding: "10px 10px", fontSize: 12, color: "#3B82F6", textAlign: "right", fontWeight: 600 }}>{emp.callCount}</td>
                      <td style={{ padding: "10px 10px", fontSize: 12, color: "#F59E0B", textAlign: "right", fontWeight: 600 }}>{emp.fuCallCount}</td>
                      <td style={{ padding: "10px 10px", fontSize: 12, color: "#06B6D4", textAlign: "right", fontWeight: 600 }}>{emp.fuEmailCount}</td>
                      <td style={{ padding: "10px 10px", fontSize: 12, color: "#8B5CF6", textAlign: "right", fontWeight: 600 }}>{emp.meetCount}</td>
                      <td style={{ padding: "10px 10px", fontSize: 12, color: "#EC4899", textAlign: "right", fontWeight: 600 }}>{emp.emailCount}</td>
                      <td style={{ padding: "10px 10px", fontSize: 12, color: "#10B981", textAlign: "right", fontWeight: 600 }}>{emp.noteCount}</td>
                      <td style={{ padding: "10px 10px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden", minWidth: 44 }}>
                            <div style={{ height: "100%", width: `${emp.score}%`, borderRadius: 3, background: emp.score >= 70 ? "#10B981" : emp.score >= 40 ? "#F59E0B" : "#EF4444", transition: "width 0.8s ease" }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, minWidth: 22, textAlign: "right", color: emp.score >= 70 ? "#10B981" : emp.score >= 40 ? "#F59E0B" : "#EF4444" }}>{emp.score}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {teamPerformance.length === 0 && (
                    <tr><td colSpan={11} style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 }}>No team activity data for this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Email Logs Panel (owner + sales_head) ── */}
      {isOwnerOrHead && <DSREmailLogsPanel />}

      {/* ── Send DSR Modal ── */}
      <AnimatePresence>
        {dsrModalOpen && <SendDSRModal onClose={() => setDsrModalOpen(false)} viewableEmployees={viewableUsers} />}
      </AnimatePresence>

      {/* ── DSR Config Modal (owner only) ── */}
      <AnimatePresence>
        {dsrConfigOpen && <DSRConfigModal onClose={() => setDsrConfigOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
