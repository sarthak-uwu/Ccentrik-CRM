import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { analyticsService } from "../services/analyticsService";
import { meetingsService } from "../services/meetingsService";
import { tasksService } from "../services/tasksService";
import { supabase } from "../supabaseClient";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  UserPlus, IndianRupee, BriefcaseBusiness, TrendingUp, Building2, ListChecks,
  CalendarDays, Clock, Activity, ChevronRight, ChevronDown, Plus, Zap,
  AlertCircle, Sparkles, ArrowUpRight, ExternalLink, Flame, PhoneCall,
  Video, Target, Users, ArrowUp, ArrowDown, LayoutDashboard,
  CheckCircle2, Star, Trophy, Bolt, Brain, Signal, CalendarCheck, Workflow,
  AlertTriangle,
} from "lucide-react";
import { format, isToday, isTomorrow, isPast } from "date-fns";

/* ─── Palette ──────────────────────────────────────────────────────────── */
const C = {
  blue:   { solid: "#3B82F6", light: "rgba(59,130,246,0.12)",  grad: ["#2563EB","#60A5FA"] },
  green:  { solid: "#10B981", light: "rgba(16,185,129,0.12)",  grad: ["#059669","#34D399"] },
  amber:  { solid: "#F59E0B", light: "rgba(245,158,11,0.12)",  grad: ["#D97706","#FCD34D"] },
  purple: { solid: "#8B5CF6", light: "rgba(139,92,246,0.12)",  grad: ["#7C3AED","#C4B5FD"] },
  teal:   { solid: "#14B8A6", light: "rgba(20,184,166,0.12)",  grad: ["#0D9488","#5EEAD4"] },
  rose:   { solid: "#F43F5E", light: "rgba(244,63,94,0.12)",   grad: ["#E11D48","#FB7185"] },
  orange: { solid: "#F97316", light: "rgba(249,115,22,0.12)",  grad: ["#EA580C","#FB923C"] },
  indigo: { solid: "#6366F1", light: "rgba(99,102,241,0.12)",  grad: ["#4F46E5","#818CF8"] },
  violet: { solid: "#7C3AED", light: "rgba(124,58,237,0.12)",  grad: ["#6D28D9","#A78BFA"] },
};
const CHART_COLORS = Object.values(C).map((c) => c.solid);

/* ─── Animated Counter Hook ─────────────────────────────────────────────── */
function useCountUp(target, duration = 1000, enabled = true) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    if (!enabled || target === undefined || target === null) return;
    const n = Number(target);
    if (isNaN(n)) return;
    const start = prevTarget.current;
    prevTarget.current = n;
    if (n === start) return;
    const diff = n - start;
    const steps = Math.min(60, Math.abs(diff));
    const step = diff / steps;
    let current = start;
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      current += step;
      if (frame >= steps) { setCount(n); clearInterval(timer); }
      else setCount(Math.round(current));
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target, duration, enabled]);
  return count;
}

/* ─── Sparkline ─────────────────────────────────────────────────────────── */
function SparkLine({ data = [], color = "#6366F1", width = 90, height = 36 }) {
  if (!data.length || data.length < 2) return null;
  const nums = data.map(Number).filter((n) => !isNaN(n));
  if (nums.length < 2) return null;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const range = max - min || 1;
  const pad = 2;
  const pts = nums.map((v, i) => {
    const x = (i / (nums.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const polyline = pts.map((p) => p.join(",")).join(" ");
  const areaPath = `M${pts[0][0]},${height} ` + pts.map((p) => `L${p[0]},${p[1]}`).join(" ") + ` L${pts[pts.length-1][0]},${height} Z`;
  const id = `sg-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${id})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r={2.5} fill={color} />
    </svg>
  );
}

/* ─── Stats config ─────────────────────────────────────────────────────── */
const STATS = [
  { key: "totalLeads",     label: "Total Leads",     icon: UserPlus,         ...C.blue,   to: "/leads",   sparkKey: "leads"   },
  { key: "revenue",        label: "Revenue Won",     icon: IndianRupee,      ...C.green,  prefix: "₹", to: "/reports", sparkKey: "revenue", fmt: (v) => v >= 10000000 ? `${(v/10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v/100000).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v },
  { key: "activeDeals",    label: "Active Deals",    icon: BriefcaseBusiness,...C.amber,  to: "/deals"    },
  { key: "conversionRate", label: "Conversion Rate", icon: TrendingUp,       ...C.purple, suffix: "%", to: "/reports" },
];

const QUICK_ACTIONS = [
  { label: "New Lead",    icon: UserPlus,         color: "#3B82F6", to: "/leads",      bg: "rgba(59,130,246,0.12)"  },
  { label: "New Deal",    icon: BriefcaseBusiness,color: "#F59E0B", to: "/deals",      bg: "rgba(245,158,11,0.12)"  },
  { label: "Log Call",    icon: PhoneCall,        color: "#10B981", to: "/activities", bg: "rgba(16,185,129,0.12)"  },
  { label: "Schedule",    icon: CalendarDays,     color: "#8B5CF6", to: "/meetings",   bg: "rgba(139,92,246,0.12)"  },
  { label: "Add Task",    icon: CalendarCheck,    color: "#F43F5E", to: "/tasks",      bg: "rgba(244,63,94,0.12)"   },
  { label: "AI Sidekick", icon: Brain,            color: "#6366F1", to: "/ai-assistant",bg:"rgba(99,102,241,0.12)" },
];

/* ─── Tooltip ──────────────────────────────────────────────────────────── */
const ChartTip = ({ active, payload, label, prefix = "", suffix = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 11, padding: "10px 14px", boxShadow: "var(--shadow-lg)", fontSize: 12 }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 7, fontWeight: 700, fontSize: 11 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
          {p.name}: {prefix}{typeof p.value === "number" ? p.value.toLocaleString() : p.value}{suffix}
        </div>
      ))}
    </div>
  );
};

/* ─── AI Opportunity Score ───────────────────────────────────────────────── */
function AIOppScore({ stats, deals }) {
  const score = useMemo(() => {
    if (!stats) return 0;
    let s = 50;
    if (stats.conversionRate >= 20) s += 15;
    else if (stats.conversionRate >= 10) s += 7;
    else s -= 10;
    if (stats.monthlyGrowth > 0) s += Math.min(15, stats.monthlyGrowth / 2);
    else s -= 10;
    if (stats.hotLeads > 3) s += 10;
    if (stats.hotLeads === 0) s -= 5;
    if (stats.pendingTasks > 10) s -= 8;
    const stale = (deals || []).filter((d) => {
      const days = Math.floor((Date.now() - new Date(d.updated_at || d.created_at).getTime()) / 86400000);
      return !["won","lost"].includes(d.stage) && days > 7;
    }).length;
    if (stale > 3) s -= 10;
    return Math.max(10, Math.min(99, Math.round(s)));
  }, [stats, deals]);

  const { color, label, ring } = score >= 70
    ? { color: "#10B981", label: "Strong", ring: "rgba(16,185,129,0.25)" }
    : score >= 45
    ? { color: "#F59E0B", label: "Moderate", ring: "rgba(245,158,11,0.25)" }
    : { color: "#EF4444", label: "At Risk", ring: "rgba(239,68,68,0.25)" };

  const animScore = useCountUp(score, 1200, !!stats);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <div style={{ position: "relative", width: 88, height: 88 }}>
        <svg width={88} height={88} style={{ position: "absolute", inset: 0 }}>
          <circle cx={44} cy={44} r={38} fill="none" stroke="var(--surface-3)" strokeWidth={6} />
          <circle
            cx={44} cy={44} r={38}
            fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={`${(score / 100) * 239} 239`}
            strokeLinecap="round"
            transform="rotate(-90 44 44)"
            style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)", filter: `drop-shadow(0 0 8px ${color}80)` }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
          <span style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1, letterSpacing: "-0.04em" }}>{animScore}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>/ 100</span>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color, marginBottom: 3 }}>Pipeline Score: {label}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {score >= 70 ? "Excellent pipeline health. Keep momentum." : score >= 45 ? "Monitor stale deals and follow up on hot leads." : "Urgent: review your pipeline immediately."}
        </div>
      </div>
    </div>
  );
}

/* ─── Pending Tasks Alert ────────────────────────────────────────────────── */
function PendingTasksAlert({ tasks, navigate }) {
  const [open, setOpen] = useState(false);
  if (!tasks?.length) return null;
  const overdueCount = tasks.filter((t) => t.due_date && isPast(new Date(t.due_date))).length;
  const urgentCount  = tasks.filter((t) => t.priority === "urgent" || t.priority === "high").length;
  const color = overdueCount > 0 ? C.rose.solid : C.amber.solid;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ marginBottom: 20, borderRadius: 13, border: `1.5px solid ${color}30`, background: `${color}08`, overflow: "hidden" }}
    >
      <div onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer", userSelect: "none" }}>
        <motion.div animate={{ rotate: [0,-10,10,-6,6,0] }} transition={{ duration: 0.6, delay: 0.4 }}
          style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertCircle size={17} style={{ color }} strokeWidth={2.2} />
        </motion.div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.015em" }}>
            {overdueCount > 0 ? `${overdueCount} overdue task${overdueCount > 1 ? "s" : ""} need your attention` : `${tasks.length} pending task${tasks.length > 1 ? "s" : ""} assigned to you`}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
            {urgentCount > 0 ? `${urgentCount} high priority · ` : ""}{tasks.length} total
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown size={16} style={{ color: "var(--text-muted)" }} /></motion.div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} style={{ overflow: "hidden" }}>
            <div style={{ borderTop: `1px solid ${color}20`, padding: "10px 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              {tasks.slice(0, 8).map((task) => {
                const overdue = task.due_date && isPast(new Date(task.due_date));
                const pc = task.priority === "urgent" ? C.rose.solid : task.priority === "high" ? C.amber.solid : C.blue.solid;
                return (
                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: pc, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</span>
                    {task.due_date && <span style={{ fontSize: 11, color: overdue ? C.rose.solid : "var(--text-muted)", flexShrink: 0 }}>{format(new Date(task.due_date), "MMM d")}</span>}
                    <motion.button onClick={() => navigate("/tasks")} whileHover={{ scale: 1.05 }} style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 7, fontSize: 11.5, fontWeight: 600, background: `${pc}16`, color: pc, border: `1px solid ${pc}28`, cursor: "pointer", fontFamily: "inherit" }}>
                      Open <ExternalLink size={10} strokeWidth={2.5} />
                    </motion.button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── KPI Card (animated counter + sparkline) ───────────────────────────── */
function KPICard({ stat, value, loading, index, navigate, sparkData }) {
  const Icon = stat.icon;
  const [c1, c2] = stat.grad;
  const numValue = typeof value === "number" ? value : 0;
  const animated  = useCountUp(numValue, 900 + index * 60, !loading && value !== undefined);
  const displayValue = stat.fmt ? stat.fmt(animated) : animated.toLocaleString();
  const isGrowth   = stat.key === "monthlyGrowth";
  const growthPos  = isGrowth && numValue >= 0;
  const sparkNums  = sparkData?.map((d) => d.value || 0) || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.045, duration: 0.3, ease: [0.4,0,0.2,1] }}
      className="stat-card"
      onClick={() => stat.to && navigate(stat.to)}
      style={{ cursor: stat.to ? "pointer" : "default", overflow: "hidden", position: "relative" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${c1}35`; e.currentTarget.style.boxShadow = `var(--shadow-md), 0 0 24px ${c1}14`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
    >
      {/* Background radial glow */}
      <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: `radial-gradient(circle, ${c1}14 0%, transparent 70%)`, pointerEvents: "none" }} />

      {/* Top row: icon + trend */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <motion.div
          animate={{ y: [0,-4,0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: index * 0.4 }}
          style={{ width: 40, height: 40, borderRadius: 11, background: `linear-gradient(135deg, ${c1}, ${c2})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 14px ${c1}40`, flexShrink: 0 }}
        >
          <Icon size={17} color="white" strokeWidth={1.8} />
        </motion.div>
        {isGrowth ? (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: growthPos ? C.green.solid : C.rose.solid, background: growthPos ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)", padding: "2px 7px", borderRadius: 20 }}>
            {growthPos ? <ArrowUp size={9} strokeWidth={2.5} /> : <ArrowDown size={9} strokeWidth={2.5} />}
            {Math.abs(numValue)}%
          </span>
        ) : (
          <ArrowUpRight size={13} style={{ color: "var(--text-muted)", opacity: 0.3 }} />
        )}
      </div>

      {/* Label */}
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{stat.label}</div>

      {/* Value */}
      {loading ? (
        <div style={{ width: 80, height: 30, borderRadius: 7 }} className="skeleton" />
      ) : (
        <div className="stat-metric" style={{ color: "var(--text)", animation: "count-up 0.4s ease both" }}>
          {stat.prefix || ""}{displayValue}{stat.suffix || ""}
        </div>
      )}

      {/* Sparkline */}
      {sparkNums.length >= 2 && (
        <div className="sparkline-wrap" style={{ bottom: 8, right: 8 }}>
          <SparkLine data={sparkNums} color={c1} width={72} height={28} />
        </div>
      )}
    </motion.div>
  );
}

/* ─── Quick Actions Bar ─────────────────────────────────────────────────── */
function QuickActionsBar({ navigate }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.28 }}
      style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 24 }}
    >
      {QUICK_ACTIONS.map((qa, i) => (
        <motion.button
          key={qa.label}
          onClick={() => navigate(qa.to)}
          whileHover={{ scale: 1.04, y: -2 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 8px", background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s", boxShadow: "var(--shadow-xs)" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = qa.color + "40"; e.currentTarget.style.boxShadow = `var(--shadow-md), 0 0 16px ${qa.color}12`; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "var(--shadow-xs)"; }}
        >
          <div style={{ width: 38, height: 38, borderRadius: 11, background: qa.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <qa.icon size={17} style={{ color: qa.color }} strokeWidth={1.8} />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)", letterSpacing: "-0.01em" }}>{qa.label}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

/* ─── Pipeline Snapshot ──────────────────────────────────────────────────── */
function PipelineSnapshot({ deals }) {
  const stages = [
    { key: "active",      label: "Active",     color: "#3B82F6" },
    { key: "proposal",    label: "Proposal",   color: "#F59E0B" },
    { key: "demo",        label: "Demo",       color: "#8B5CF6" },
    { key: "negotiation", label: "Negotiation",color: "#EA580C" },
    { key: "won",         label: "Won",        color: "#10B981" },
  ];
  const total = deals?.length || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {stages.map((s) => {
        const count = deals?.filter((d) => d.stage === s.key).length || 0;
        const val   = deals?.filter((d) => d.stage === s.key).reduce((sum, d) => sum + (Number(d.value) || 0), 0) || 0;
        const pct   = Math.round((count / total) * 100);
        return (
          <div key={s.key}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, boxShadow: `0 0 6px ${s.color}80`, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>{s.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {val > 0 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{val >= 100000 ? `₹${(val/100000).toFixed(1)}L` : val >= 1000 ? `₹${(val/1000).toFixed(0)}K` : `₹${val}`}</span>}
                <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{count}</span>
              </div>
            </div>
            <div className="progress-bar">
              <motion.div
                className="progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.4,0,0.2,1] }}
                style={{ background: s.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Team Leaderboard ───────────────────────────────────────────────────── */
function TeamLeaderboard({ teamPerf }) {
  const sorted = useMemo(() => (teamPerf || []).sort((a, b) => b.won - a.won).slice(0, 5), [teamPerf]);
  const maxWon = sorted[0]?.won || 1;
  const medals = ["🥇", "🥈", "🥉"];

  if (!sorted.length) return (
    <div className="empty-state" style={{ padding: "28px 0" }}><Users size={28} /><p>No team data yet</p></div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sorted.map((p, i) => (
        <motion.div
          key={p.id || p.name}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06, duration: 0.24 }}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: i === 0 ? "rgba(245,158,11,0.07)" : "var(--surface-2)", border: `1px solid ${i === 0 ? "rgba(245,158,11,0.22)" : "var(--border)"}` }}
        >
          <div style={{ width: 14, fontSize: 14, flexShrink: 0, textAlign: "center" }}>
            {medals[i] || <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>#{i+1}</span>}
          </div>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg, ${C.blue.solid}, ${C.indigo.solid})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
            {p.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            <div style={{ height: 4, background: "var(--surface-3)", borderRadius: 2, marginTop: 4 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(p.won / maxWon) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.08 }} style={{ height: "100%", borderRadius: 2, background: i === 0 ? C.amber.solid : C.blue.solid }} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? C.amber.solid : "var(--text)", letterSpacing: "-0.02em" }}>{p.won}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>won</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── AI Insights (data-driven) ──────────────────────────────────────────── */
function AIInsights({ stats, tasks, activities }) {
  const insights = useMemo(() => {
    const list = [];
    if (!stats) return list;
    if (stats.hotLeads > 0) list.push({ icon: Flame, color: C.orange.solid, text: `${stats.hotLeads} hot lead${stats.hotLeads > 1 ? "s" : ""} need immediate attention — schedule demos this week.` });
    if (stats.conversionRate < 15) list.push({ icon: AlertCircle, color: C.rose.solid, text: `Conversion at ${stats.conversionRate}%. Focus on lead qualification to improve close rate.` });
    if (stats.conversionRate >= 20) list.push({ icon: TrendingUp, color: C.green.solid, text: `${stats.conversionRate}% conversion is above benchmark — excellent team performance!` });
    if (stats.pendingTasks > 5) list.push({ icon: ListChecks, color: C.amber.solid, text: `${stats.pendingTasks} open tasks are blocking deal progress. Clear backlog to accelerate pipeline.` });
    if (stats.monthlyGrowth > 0) list.push({ icon: ArrowUp, color: C.green.solid, text: `Lead volume up ${stats.monthlyGrowth}% vs last month. Double down on top sources.` });
    if (stats.monthlyGrowth < 0) list.push({ icon: AlertCircle, color: C.amber.solid, text: `Lead volume fell ${Math.abs(stats.monthlyGrowth)}%. Review and reinvest in outreach channels.` });
    if (stats.activeDeals > 10) list.push({ icon: BriefcaseBusiness, color: C.purple.solid, text: `${stats.activeDeals} active deals. Prioritize by expected close date and deal value.` });
    list.push({ icon: Sparkles, color: C.indigo.solid, text: `Deals with follow-up activity within 48h close 3× more often — add activities to stale deals.` });
    return list.slice(0, 3);
  }, [stats]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {insights.map((ins, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 + 0.15, duration: 0.26 }}
          style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 13px", borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--border)", transition: "border-color 0.15s" }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = `${ins.color}35`}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div style={{ width: 30, height: 30, borderRadius: 8, background: `${ins.color}16`, border: `1px solid ${ins.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ins.icon size={13} style={{ color: ins.color }} strokeWidth={2} />
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55, margin: 0 }}>{ins.text}</p>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Closing This Week Alert ────────────────────────────────────────────── */
function ClosingDealsAlert({ deals, navigate }) {
  const closingSoon = useMemo(() => {
    if (!deals?.length) return [];
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    return deals
      .filter((d) => {
        if (["won","lost"].includes(d.stage) || !d.close_date) return false;
        const cd = new Date(d.close_date);
        return cd <= in7;
      })
      .sort((a, b) => new Date(a.close_date) - new Date(b.close_date));
  }, [deals]);

  if (!closingSoon.length) return null;
  const overdue = closingSoon.filter((d) => new Date(d.close_date) < new Date()).length;

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 16, borderRadius: 13, border: `1.5px solid ${C.amber.solid}30`, background: `${C.amber.solid}08`, overflow: "hidden" }}>
      <div onClick={() => navigate("/deals")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${C.amber.solid}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CalendarDays size={17} style={{ color: C.amber.solid }} strokeWidth={1.9} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.015em" }}>
            {closingSoon.length} deal{closingSoon.length > 1 ? "s" : ""} closing this week
            {overdue > 0 && <span style={{ color: "#EF4444", marginLeft: 8, fontSize: 12 }}> · {overdue} overdue</span>}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
            {closingSoon.slice(0, 2).map((d) => d.company_name || d.title).join(", ")}{closingSoon.length > 2 ? ` +${closingSoon.length - 2} more` : ""}
          </div>
        </div>
        <ChevronRight size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      </div>
    </motion.div>
  );
}

/* ─── Sales Velocity Metric ──────────────────────────────────────────────── */
function SalesVelocityCard({ deals, stats }) {
  const metrics = useMemo(() => {
    const wonDeals = (deals || []).filter((d) => d.stage === "won");
    const avgVal   = wonDeals.length ? wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0) / wonDeals.length : 0;
    const convRate = (stats?.conversionRate || 0) / 100;
    const velocity = Math.round(avgVal * convRate * (stats?.activeDeals || 0) / 30);
    return { velocity, avgVal, wonCount: wonDeals.length };
  }, [deals, stats]);

  const items = [
    { label: "Avg Deal Size", value: metrics.avgVal >= 100000 ? `₹${(metrics.avgVal/100000).toFixed(1)}L` : metrics.avgVal >= 1000 ? `₹${(metrics.avgVal/1000).toFixed(0)}K` : `₹${Math.round(metrics.avgVal)}`, color: C.green.solid },
    { label: "Deals Closed",  value: metrics.wonCount, color: C.blue.solid },
    { label: "Daily Velocity",value: metrics.velocity >= 1000 ? `₹${(metrics.velocity/1000).toFixed(0)}K` : `₹${metrics.velocity}`, color: C.violet.solid },
  ];

  return (
    <div style={{ display: "flex", gap: 12 }}>
      {items.map((m, i) => (
        <motion.div
          key={m.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07, duration: 0.24 }}
          style={{ flex: 1, padding: "14px 16px", background: "var(--surface-2)", border: `1px solid var(--border)`, borderRadius: 12, textAlign: "center" }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, color: m.color, letterSpacing: "-0.04em", lineHeight: 1 }}>{m.value}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</div>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Main Dashboard ─────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const { data: stats,          isLoading }  = useQuery({ queryKey: ["dashboard-stats"],   queryFn: analyticsService.getDashboardStats,    refetchInterval: 30000 });
  const { data: revenueData }                = useQuery({ queryKey: ["monthly-revenue"],   queryFn: () => analyticsService.getMonthlyRevenue(6) });
  const { data: leadsStageData }             = useQuery({ queryKey: ["leads-by-stage"],    queryFn: analyticsService.getLeadsByStage });
  const { data: monthlyLeads }               = useQuery({ queryKey: ["monthly-leads"],     queryFn: () => analyticsService.getMonthlyLeads(6) });
  const { data: upcomingMeetings }           = useQuery({ queryKey: ["upcoming-meetings"], queryFn: () => meetingsService.getUpcoming(5) });
  const { data: recentActivity }             = useQuery({ queryKey: ["recent-activity"],   queryFn: () => analyticsService.getRecentActivity(8) });
  const { data: teamPerf }                   = useQuery({ queryKey: ["team-performance"],  queryFn: analyticsService.getTeamPerformance });
  const { data: tasks }                      = useQuery({ queryKey: ["my-tasks"], queryFn: () => tasksService.getAll({ assignedTo: profile?.id, status: "todo" }), enabled: !!profile?.id });
  const { data: dealsData }                  = useQuery({ queryKey: ["deals-all"], queryFn: () => supabase.from("deals").select("id, stage, value, company_name, title, close_date, updated_at, created_at").then((r) => r.data || []) });
  const { data: myDeals = [] }               = useQuery({ queryKey: ["my-deals", profile?.id], queryFn: () => supabase.from("deals").select("id, stage, value, company_name, title, close_date, updated_at").eq("assigned_to", profile.id).order("updated_at", { ascending: false }).limit(8).then((r) => r.data || []), enabled: !!profile?.id });

  const chartRevenue = (revenueData || []).map((r) => ({ month: r.month ? format(new Date(r.month + "-01"), "MMM") : r.month, revenue: r.revenue }));
  const chartLeads   = (monthlyLeads || []).map((r) => ({ month: r.month ? format(new Date(r.month + "-01"), "MMM") : r.month, leads: r.leads, won: r.won }));
  const pieData      = (leadsStageData || []).filter((d) => d.count > 0);

  // Sparkline data per KPI
  const sparklines = useMemo(() => ({
    leads:   (monthlyLeads  || []).map((r) => ({ value: r.leads  || 0 })),
    revenue: (revenueData   || []).map((r) => ({ value: r.revenue || 0 })),
  }), [monthlyLeads, revenueData]);

  const fmtMeeting = (s) => {
    const d = new Date(s);
    if (isToday(d))    return `Today · ${format(d, "h:mm a")}`;
    if (isTomorrow(d)) return `Tomorrow · ${format(d, "h:mm a")}`;
    return format(d, "MMM d · h:mm a");
  };
  const actColor = (type) => ({ lead: C.blue.solid, deal: C.green.solid, task: C.amber.solid, meeting: C.purple.solid, customer: C.teal.solid }[type?.split("_")[0]] || "var(--text-muted)");

  const Card = ({ children, style = {}, onClick }) => (
    <div onClick={onClick} className="card card-hover" style={{ padding: "20px 22px", ...style, ...(onClick ? { cursor: "pointer" } : {}) }}>
      {children}
    </div>
  );

  const SHead = ({ title, sub, to, icon: Icon, iconColor }) => (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {Icon && <div style={{ width: 28, height: 28, borderRadius: 8, background: `${iconColor}14`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={14} style={{ color: iconColor }} strokeWidth={1.8} /></div>}
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      {to && (
        <button onClick={() => navigate(to)} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11.5, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
          View all <ChevronRight size={11} />
        </button>
      )}
    </div>
  );

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = profile?.full_name?.split(" ")[0] || "there";

  // ─── PRIORITY COLORS (shared across role views) ──────────────────────────
  const PCOL = { urgent: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#22C55E" };
  const PBGC = { urgent: "rgba(239,68,68,0.12)", high: "rgba(245,158,11,0.12)", medium: "rgba(59,130,246,0.12)", low: "rgba(34,197,94,0.12)" };
  const fmtDeal = (v) => !v ? null : v >= 10000000 ? `₹${(v/10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : `₹${(v/1000).toFixed(0)}K`;
  const STAGE_C = { active:"#3B82F6", proposal:"#F59E0B", demo:"#8B5CF6", negotiation:"#EA580C", won:"#22C55E", lost:"#EF4444", on_hold:"#6B7280" };

  // ════════════════════════════════════════════════════════════════════════════
  // EMPLOYEE DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════
  if (profile?.role === "employee") {
    const myPending = (tasks?.data || []).filter((t) => !["done","cancelled"].includes(t.status));
    const myActive  = myDeals.filter((d) => !["won","lost"].includes(d.stage));
    const myToday   = (recentActivity || []).filter((a) => a.user_id === profile?.id && isToday(new Date(a.created_at)));

    return (
      <div style={{ padding: "24px 28px", maxWidth: 1440, margin: "0 auto" }}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.04em" }}>
            {greeting}, {firstName} 👋
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            {format(new Date(), "EEEE, MMMM d")} · {myPending.length} task{myPending.length !== 1 ? "s" : ""} pending
          </p>
        </motion.div>

        {/* Row 1: Compact KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Pending Tasks",    value: myPending.length,  color: "#EF4444", icon: CalendarCheck,    to: "/tasks"  },
            { label: "Active Deals",     value: myActive.length,   color: "#3B82F6", icon: BriefcaseBusiness,to: "/deals"  },
            { label: "Activities Today", value: myToday.length,    color: "#22C55E", icon: Activity,         to: "/activities" },
          ].map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              onClick={() => navigate(kpi.to)}
              style={{ padding: "20px", background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${kpi.color}40`; e.currentTarget.style.boxShadow = `0 0 20px ${kpi.color}10`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: `${kpi.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <kpi.icon size={16} style={{ color: kpi.color }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{kpi.label}</span>
              </div>
              <div style={{ fontSize: 34, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.05em", lineHeight: 1 }}>{kpi.value}</div>
            </motion.div>
          ))}
        </div>

        {/* Row 2: My Tasks */}
        <Card style={{ marginBottom: 16 }}>
          <SHead title="My Tasks" sub={`${myPending.length} open`} to="/tasks" icon={CalendarCheck} iconColor="#3B82F6" />
          {!myPending.length ? (
            <div className="empty-state" style={{ padding: "24px 0" }}><CheckCircle2 size={28} style={{ color: "#22C55E" }} /><p style={{ color: "#22C55E" }}>All caught up!</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {myPending.slice(0, 8).map((task, i) => {
                const pc = PCOL[task.priority] || "#6B7280";
                const pb = PBGC[task.priority] || "var(--surface-2)";
                const overdue = task.due_date && isPast(new Date(task.due_date));
                return (
                  <motion.div key={task.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                    onClick={() => navigate("/tasks")}
                    style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer", overflow: "hidden" }}
                  >
                    <div style={{ width: 4, alignSelf: "stretch", background: pc, flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
                        {task.due_date && <div style={{ fontSize: 11, color: overdue ? "#EF4444" : "var(--text-muted)", marginTop: 2 }}>Due {format(new Date(task.due_date), "MMM d")}{overdue ? " · Overdue" : ""}</div>}
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: pc, background: pb, padding: "2px 8px", borderRadius: 99, flexShrink: 0, textTransform: "capitalize" }}>{task.priority || "normal"}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Row 3: My Deals + Activity */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <SHead title="My Deals" sub="Active pipeline" to="/deals" icon={BriefcaseBusiness} iconColor="#F59E0B" />
            {!myDeals.length ? (
              <div className="empty-state" style={{ padding: "20px 0" }}><BriefcaseBusiness size={24} /><p>No deals assigned yet</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {myDeals.slice(0, 6).map((deal) => (
                  <div key={deal.id} onClick={() => navigate("/deals")}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer" }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: STAGE_C[deal.stage] || "#6B7280", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deal.company_name || deal.title}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1, textTransform: "capitalize" }}>{(deal.stage || "").replace(/_/g, " ")}</div>
                    </div>
                    {deal.value ? <span style={{ fontSize: 11.5, fontWeight: 700, color: "#22C55E", flexShrink: 0 }}>{fmtDeal(deal.value)}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <SHead title="Recent Activity" sub="My latest actions" to="/activities" icon={Activity} iconColor={C.orange.solid} />
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {!recentActivity?.length ? (
                <div className="empty-state" style={{ padding: "20px 0" }}><Activity size={24} /><p>No recent activity</p></div>
              ) : recentActivity.slice(0, 5).map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: actColor(a.type), flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="truncate-2" style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}>{a.description}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{format(new Date(a.created_at), "MMM d, h:mm a")}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SALES MANAGER DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════
  if (profile?.role === "sales_manager") {
    return (
      <div style={{ padding: "24px 28px", maxWidth: 1440, margin: "0 auto" }}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.04em" }}>{greeting}, {firstName} 👋</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>{format(new Date(), "EEEE, MMMM d")} · Team management view</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-secondary" onClick={() => navigate("/tasks")} style={{ height: 36, display: "flex", alignItems: "center", gap: 6 }}><CalendarCheck size={13} /> Tasks</button>
            <button className="btn-primary" onClick={() => navigate("/leads")} style={{ height: 36 }}><Plus size={14} /> Add Lead</button>
          </div>
        </motion.div>

        {/* Alerts */}
        <PendingTasksAlert tasks={tasks?.data} navigate={navigate} />
        <ClosingDealsAlert deals={dealsData} navigate={navigate} />

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 13, marginBottom: 22 }}>
          {STATS.map((s, i) => <KPICard key={s.key} stat={s} value={stats?.[s.key]} loading={isLoading} index={i} navigate={navigate} sparkData={sparklines[s.sparkKey]} />)}
        </div>

        {/* Row 2: Pipeline Snapshot + Tasks */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card>
            <SHead title="Pipeline Overview" sub="Deals by stage" to="/deals" icon={LayoutDashboard} iconColor={C.purple.solid} />
            <PipelineSnapshot deals={dealsData || []} />
          </Card>
          <Card>
            <SHead title="Team Tasks" sub="Open items" to="/tasks" icon={CalendarCheck} iconColor={C.blue.solid} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {!(tasks?.data?.length) ? (
                <div className="empty-state" style={{ padding: "20px 0" }}><CheckCircle2 size={26} style={{ color: "#22C55E" }} /><p style={{ color: "#22C55E" }}>All tasks complete</p></div>
              ) : (tasks.data || []).slice(0, 7).map((task) => {
                const pc = PCOL[task.priority] || "#6B7280";
                return (
                  <div key={task.id} onClick={() => navigate("/tasks")}
                    style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer", overflow: "hidden" }}
                  >
                    <div style={{ width: 3, alignSelf: "stretch", background: pc, flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
                        {task.due_date && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>Due {format(new Date(task.due_date), "MMM d")}</div>}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: pc, flexShrink: 0, textTransform: "capitalize" }}>{task.priority}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Row 3: Meetings + Team Leaderboard */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 16 }}>
          <Card>
            <SHead title="Upcoming Meetings" to="/meetings" icon={CalendarDays} iconColor={C.teal.solid} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {!upcomingMeetings?.length ? (
                <div className="empty-state" style={{ padding: "20px 0" }}><CalendarDays size={26} /><p>No upcoming meetings</p></div>
              ) : upcomingMeetings.slice(0, 4).map((m) => (
                <div key={m.id} onClick={() => navigate("/meetings")}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer" }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.blue.solid}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <CalendarDays size={12} style={{ color: C.blue.solid }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>{fmtMeeting(m.start_time)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SHead title="Team Leaderboard" sub="Ranked by wins" to="/team" icon={Trophy} iconColor={C.amber.solid} />
            <TeamLeaderboard teamPerf={teamPerf} />
          </Card>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SALES HEAD DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════
  if (profile?.role === "sales_head") {
    const staleDeals = (dealsData || [])
      .filter((d) => {
        if (["won","lost"].includes(d.stage)) return false;
        const days = Math.floor((Date.now() - new Date(d.updated_at || d.created_at).getTime()) / 86400000);
        return days >= 5;
      })
      .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))
      .slice(0, 6);

    return (
      <div style={{ padding: "24px 28px", maxWidth: 1440, margin: "0 auto" }}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.04em" }}>{greeting}, {firstName} 👋</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
              {format(new Date(), "EEEE, MMMM d")} · Sales command center
              {stats?.activeDeals > 0 && <span style={{ color: "#F59E0B", fontWeight: 600 }}> · {stats.activeDeals} active deals</span>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={() => navigate("/ai-assistant")} style={{ height: 36, color: "#A78BFA", border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.06)", display: "flex", alignItems: "center", gap: 6 }}><Brain size={13} strokeWidth={1.75} /> AI Sidekick</button>
            <button className="btn-secondary" onClick={() => navigate("/leads")} style={{ height: 36 }}><UserPlus size={13} /> New Lead</button>
            <button className="btn-primary" onClick={() => navigate("/deals")} style={{ height: 36 }}><Plus size={14} /> New Deal</button>
          </div>
        </motion.div>

        {/* Alert */}
        <ClosingDealsAlert deals={dealsData} navigate={navigate} />

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 13, marginBottom: 22 }}>
          {STATS.map((s, i) => <KPICard key={s.key} stat={s} value={stats?.[s.key]} loading={isLoading} index={i} navigate={navigate} sparkData={sparklines[s.sparkKey]} />)}
        </div>

        {/* Row 2: Revenue + Pipeline */}
        <div style={{ display: "grid", gridTemplateColumns: "1.65fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card>
            <SHead title="Revenue Overview" sub="Monthly trend" to="/reports" icon={IndianRupee} iconColor={C.green.solid} />
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartRevenue} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="shRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTip prefix="₹" />} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3B82F6" strokeWidth={2.2} fill="url(#shRevGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <SHead title="Pipeline Status" sub="Deals by stage" icon={LayoutDashboard} iconColor={C.purple.solid} />
            <PipelineSnapshot deals={dealsData || []} />
          </Card>
        </div>

        {/* Row 3: Lead Gen + Team Comparison */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card>
            <SHead title="Lead Generation" sub="Monthly trend" to="/leads" icon={UserPlus} iconColor={C.blue.solid} />
            <ResponsiveContainer width="100%" height={185}>
              <BarChart data={chartLeads} barGap={3} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="leads" name="Total" fill={C.blue.solid} radius={[5,5,0,0]} maxBarSize={14} opacity={0.65} />
                <Bar dataKey="won"   name="Won"   fill="#22C55E"      radius={[5,5,0,0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <SHead title="Team Comparison" sub="Won deals by rep" to="/team" icon={Users} iconColor={C.purple.solid} />
            <ResponsiveContainer width="100%" height={185}>
              <BarChart
                data={(teamPerf || []).slice(0, 6).map((p) => ({ name: p.name?.split(" ")[0] || "—", won: p.won, leads: p.leads }))}
                layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: "var(--text-2)" }} axisLine={false} tickLine={false} width={58} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="won" name="Won" fill="#3B82F6" radius={[0,4,4,0]} maxBarSize={13} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Row 4: Stale Deals + AI Insights */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <SHead title="Deals Needing Attention" sub="No activity ≥ 5 days" to="/deals" icon={AlertTriangle} iconColor="#EF4444" />
            {!staleDeals.length ? (
              <div className="empty-state" style={{ padding: "20px 0" }}><CheckCircle2 size={26} style={{ color: "#22C55E" }} /><p style={{ color: "#22C55E" }}>All deals are active!</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {staleDeals.map((d) => {
                  const days = Math.floor((Date.now() - new Date(d.updated_at || d.created_at).getTime()) / 86400000);
                  const isRed = days >= 7;
                  const bc = isRed ? "#EF4444" : "#F59E0B";
                  return (
                    <div key={d.id} onClick={() => navigate("/deals")}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 9, background: isRed ? "rgba(239,68,68,0.05)" : "rgba(245,158,11,0.05)", border: `1px solid ${bc}22`, borderLeft: `3px solid ${bc}`, cursor: "pointer" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.company_name || d.title}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>No activity for <span style={{ color: bc, fontWeight: 700 }}>{days}d</span></div>
                      </div>
                      {d.value && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#22C55E", flexShrink: 0 }}>{fmtDeal(d.value)}</span>}
                      <AlertTriangle size={12} style={{ color: bc, flexShrink: 0 }} />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          <Card>
            <SHead title="AI Insights" sub="Smart suggestions" icon={Sparkles} iconColor={C.indigo.solid} />
            <AIInsights stats={stats} tasks={tasks?.data} activities={recentActivity} />
          </Card>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // OWNER DASHBOARD (default — falls through for role "owner")
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: "24px 28px", maxWidth: 1600, margin: "0 auto" }}>

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
              {greeting}, {profile?.full_name?.split(" ")[0] || "there"} 👋
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.22)", borderRadius: 99, fontSize: 11, fontWeight: 700, color: "#10B981" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10B981", animation: "pulse-dot 2s ease infinite" }} />
              LIVE
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
            <span>{format(new Date(), "EEEE, MMMM d, yyyy")}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Enterprise Sales Command Center</span>
            {stats?.activeDeals > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: "#F59E0B", fontWeight: 600 }}>{stats.activeDeals} active deals</span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn-ghost" onClick={() => navigate("/ai-assistant")} style={{ height: 38, display: "flex", alignItems: "center", gap: 6, color: "#A78BFA", border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.06)" }}>
            <Brain size={13} strokeWidth={1.75} /> AI Sidekick
          </button>
          <button className="btn-secondary" onClick={() => navigate("/leads")} style={{ height: 38, fontSize: 13 }}>
            <UserPlus size={13} strokeWidth={1.8} /> Add Lead
          </button>
          <button className="btn-primary" onClick={() => navigate("/deals")} style={{ height: 38, fontSize: 13 }}>
            <Plus size={14} strokeWidth={2.2} /> New Deal
          </button>
        </div>
      </motion.div>

      {/* ── Alerts ── */}
      <PendingTasksAlert tasks={tasks?.data} navigate={navigate} />
      <ClosingDealsAlert deals={dealsData} navigate={navigate} />

      {/* ── KPI Cards ── */}
      <div className="dashboard-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 13, marginBottom: 22 }}>
        {STATS.map((s, i) => (
          <KPICard key={s.key} stat={s} value={stats?.[s.key]} loading={isLoading} index={i} navigate={navigate} sparkData={sparklines[s.sparkKey]} />
        ))}
      </div>

      {/* ── Quick Actions ── */}
      <QuickActionsBar navigate={navigate} />

      {/* ── Charts Row 1: Revenue + Pipeline ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.65fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <SHead title="Revenue Overview" sub="Monthly performance trend" to="/reports" icon={IndianRupee} iconColor={C.green.solid} />
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={chartRevenue} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.indigo.solid} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.indigo.solid} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTip prefix="₹" />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke={C.indigo.solid} strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: C.indigo.solid, stroke: "var(--surface)", strokeWidth: 2.5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <SHead title="Pipeline Breakdown" sub="Leads by stage" icon={LayoutDashboard} iconColor={C.purple.solid} />
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="44%" innerRadius={48} outerRadius={72} dataKey="count" nameKey="stage" paddingAngle={3} strokeWidth={0}>
                {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} />
              <Legend formatter={(v) => <span style={{ fontSize: 10.5, color: "var(--text-2)" }}>{v}</span>} iconSize={7} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ── Charts Row 2: Lead Gen + Meetings + Activity ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <SHead title="Lead Generation" sub="Monthly trend" to="/leads" icon={UserPlus} iconColor={C.blue.solid} />
          <ResponsiveContainer width="100%" height={165}>
            <BarChart data={chartLeads} barGap={3} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="leads" name="Total" fill={C.blue.solid} radius={[5,5,0,0]} maxBarSize={14} opacity={0.7} />
              <Bar dataKey="won"   name="Won"   fill={C.green.solid} radius={[5,5,0,0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SHead title="Upcoming Meetings" sub="Next 5 scheduled" to="/meetings" icon={CalendarDays} iconColor={C.teal.solid} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {!upcomingMeetings?.length ? (
              <div className="empty-state" style={{ padding: "20px 0" }}><CalendarDays size={26} /><p>No upcoming meetings</p></div>
            ) : upcomingMeetings.slice(0, 4).map((m) => (
              <div key={m.id} onClick={() => navigate("/meetings")} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer", transition: "border-color 0.12s" }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = `${C.blue.solid}35`}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${C.blue.solid}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <CalendarDays size={13} style={{ color: C.blue.solid }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}><Clock size={9} /> {fmtMeeting(m.start_time)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SHead title="Recent Activity" sub="Latest team actions" to="/activities" icon={Activity} iconColor={C.orange.solid} />
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {!recentActivity?.length ? (
              <div className="empty-state" style={{ padding: "20px 0" }}><Activity size={26} /><p>No recent activity</p></div>
            ) : recentActivity.slice(0, 5).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: actColor(a.type), flexShrink: 0, marginTop: 5, boxShadow: `0 0 5px ${actColor(a.type)}55` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate-2" style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}>{a.description}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{a.user?.full_name} · {format(new Date(a.created_at), "MMM d, h:mm a")}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Bottom Row: Team + AI Insights ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 16 }}>
        <Card>
          <SHead title="Team Leaderboard" sub="Ranked by won leads" to="/team" icon={Trophy} iconColor={C.amber.solid} />
          <TeamLeaderboard teamPerf={teamPerf} />
        </Card>
        <Card>
          <SHead title="AI Insights" sub="Smart data-driven suggestions" icon={Sparkles} iconColor={C.indigo.solid} />
          <AIInsights stats={stats} tasks={tasks?.data} activities={recentActivity} />
        </Card>
      </div>

    </div>
  );
}
