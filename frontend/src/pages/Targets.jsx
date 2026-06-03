import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { auth } from "../firebase";
import { supabase } from "../supabaseClient";
import { useCurrency } from "../context/CurrencyContext";
import toast from "react-hot-toast";
import {
  Target, Plus, X, TrendingUp, Calendar, Trophy,
  Activity, Briefcase, Trash2, CheckCircle2, AlertCircle,
  Clock, Edit2, Eye, LayoutList, BarChart2, ChevronUp, ChevronDown,
  Phone, Mail, RefreshCw, Users, CheckCheck, Zap, ChevronDown as ChevronDownIcon,
  Search, CalendarDays, Flag, Award,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const API = (import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || "http://localhost:5000").replace(/^﻿/, "");

const METRICS = [
  { key: "pipelines",       label: "Pipeline",        icon: Zap,          color: "#7C3AED", bg: "#F5F3FF", unit: "pipelines"  },
  { key: "leads_total",     label: "Leads Created",   icon: TrendingUp,   color: "#10B981", bg: "#ECFDF5", unit: "leads"      },
  { key: "leads_contacted", label: "Leads Contacted", icon: Users,        color: "#3B82F6", bg: "#EFF6FF", unit: "leads"      },
  { key: "deals_created",   label: "Deals Created",   icon: Briefcase,    color: "#F97316", bg: "#FFF7ED", unit: "deals"      },
  { key: "deals_closed",    label: "Deals Closed",    icon: Trophy,       color: "#059669", bg: "#ECFDF5", unit: "deals"      },
  { key: "meetings",        label: "Meetings",        icon: Calendar,     color: "#8B5CF6", bg: "#F5F3FF", unit: "meetings"   },
  { key: "follow_ups",      label: "Follow-Ups",      icon: RefreshCw,    color: "#06B6D4", bg: "#ECFEFF", unit: "follow-ups" },
  { key: "tasks",           label: "Tasks",           icon: CheckCheck,   color: "#F59E0B", bg: "#FFFBEB", unit: "tasks"      },
  { key: "calls",           label: "Calls",           icon: Phone,        color: "#2563EB", bg: "#EFF6FF", unit: "calls"      },
  { key: "emails_sent",     label: "Emails Sent",     icon: Mail,         color: "#EC4899", bg: "#FDF2F8", unit: "emails"     },
  { key: "revenue",         label: "Revenue (Won)",   icon: Award,        color: "#16A34A", bg: "#DCFCE7", unit: "currency"   },
  { key: "activities",      label: "All Activities",  icon: Activity,     color: "#6366F1", bg: "#EEF2FF", unit: "activities" },
  { key: "custom",          label: "Custom Metric",   icon: Edit2,        color: "#64748B", bg: "#F8FAFC", unit: "items"      },
];

const PERIOD_TYPES = [
  { key: "daily",       label: "Daily"       },
  { key: "weekly",      label: "Weekly"      },
  { key: "monthly",     label: "Monthly"     },
  { key: "quarterly",   label: "Quarterly"   },
  { key: "half_yearly", label: "Half-Yearly" },
  { key: "yearly",      label: "Yearly"      },
];

const CALL_TYPES_LIST = ["call", "follow_up_call", "phone_call", "Cold Call", "Follow-up", "Demo", "Introductory", "Verification", "Other"];
const FOLLOW_UP_TYPES_LIST = ["follow_up_call", "follow_up_email", "follow_up", "followup"];
const MEETING_TYPES_LIST = ["meeting", "meeting_person", "meeting_virtual", "follow_up_meeting", "virtual_meeting"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function targetsApi(method, path, body) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

function metricInfo(key) {
  if (key?.startsWith("custom:")) {
    const label = key.slice(7) || "Custom";
    return { key, label, icon: Edit2, color: "#64748B", bg: "#F8FAFC", unit: "items" };
  }
  return METRICS.find(m => m.key === key) || METRICS[0];
}

function getStatusConfig(pct, isOverdue) {
  if (pct >= 100) return { label: "Completed",  color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", icon: CheckCircle2 };
  if (isOverdue)  return { label: "Overdue",    color: "#EF4444", bg: "#FEF2F2", border: "#FECACA", icon: AlertCircle  };
  if (pct >= 70)  return { label: "On Track",   color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", icon: TrendingUp   };
  if (pct >= 30)  return { label: "At Risk",    color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", icon: Clock        };
  return            { label: "Behind",      color: "#EF4444", bg: "#FEF2F2", border: "#FECACA", icon: AlertCircle  };
}

function getBarColor(pct) {
  if (pct >= 100) return "#10B981";
  if (pct >= 70)  return "#3B82F6";
  if (pct >= 30)  return "#F59E0B";
  return "#EF4444";
}

async function fetchAllProgress() {
  const [leadsRes, activitiesRes, dealsRes, meetingsRes, tasksRes] = await Promise.all([
    supabase.from("leads").select("id, assigned_to, stage, created_at, updated_at"),
    supabase.from("activities").select("id, created_by, type, status, lead_id, deal_id, created_at, updated_at"),
    supabase.from("deals").select("id, assigned_to, stage, value, created_at, updated_at"),
    supabase.from("meetings").select("id, created_by, status, start_time, created_at, lead_id, deal_id"),
    supabase.from("tasks").select("id, assigned_to, status, created_at, updated_at").catch(() => ({ data: [] })),
  ]);
  return {
    leads:      leadsRes.data      || [],
    activities: activitiesRes.data || [],
    deals:      dealsRes.data      || [],
    meetings:   meetingsRes.data   || [],
    tasks:      tasksRes.data      || [],
  };
}

function computeProgress(target, progressData) {
  if (!progressData) return 0;
  const { leads = [], activities = [], deals = [], meetings = [], tasks = [] } = progressData;
  const metric = target.metric;

  const start  = new Date(target.start_date + "T00:00:00");
  const end    = new Date(target.end_date   + "T23:59:59");
  const inRange = (d) => { if (!d) return false; const t = new Date(d); return t >= start && t <= end; };

  const uid = target.assigned_to;
  const assignedLeadIds = new Set(leads.filter(l => l.assigned_to === uid).map(l => l.id));
  const assignedDealIds = new Set(deals.filter(d => d.assigned_to === uid).map(d => d.id));

  // ── Pipeline
  if (metric === "pipelines") {
    return leads.filter(l =>
      l.assigned_to === uid &&
      ["pipeline", "qualified", "contacted", "new"].includes(l.stage) &&
      inRange(l.created_at)
    ).length;
  }

  // ── Leads Created
  if (metric === "leads_total") {
    return leads.filter(l => l.assigned_to === uid && inRange(l.created_at)).length;
  }

  // ── Leads Contacted
  if (metric === "leads_contacted") {
    const contactedIds = new Set(
      activities.filter(a => a.created_by === uid && a.lead_id && inRange(a.created_at)).map(a => a.lead_id)
    );
    return contactedIds.size;
  }

  // ── Deals Created
  if (metric === "deals_created") {
    return deals.filter(d => d.assigned_to === uid && inRange(d.created_at)).length;
  }

  // ── Deals Closed / Won
  if (metric === "deals_closed" || metric === "deals_won") {
    return deals.filter(d =>
      d.assigned_to === uid && d.stage === "won" && inRange(d.updated_at || d.created_at)
    ).length;
  }

  // ── Revenue
  if (metric === "revenue") {
    return deals
      .filter(d => d.assigned_to === uid && d.stage === "won" && inRange(d.updated_at || d.created_at))
      .reduce((s, d) => s + (Number(d.value) || 0), 0);
  }

  // ── Meetings
  if (metric === "meetings") {
    const meetingCount = meetings.filter(m => {
      const belongs = m.created_by === uid ||
        (m.lead_id && assignedLeadIds.has(m.lead_id)) ||
        (m.deal_id && assignedDealIds.has(m.deal_id));
      return belongs && ["completed", "done"].includes(m.status) && inRange(m.start_time || m.created_at);
    }).length;
    const actCount = activities.filter(a =>
      a.created_by === uid && MEETING_TYPES_LIST.includes(a.type) && inRange(a.created_at)
    ).length;
    return Math.max(meetingCount, actCount);
  }

  // ── Follow-Ups
  if (metric === "follow_ups") {
    return activities.filter(a =>
      a.created_by === uid &&
      FOLLOW_UP_TYPES_LIST.includes(a.type) &&
      a.status === "done" &&
      inRange(a.created_at)
    ).length;
  }

  // ── Tasks
  if (metric === "tasks") {
    return tasks.filter(t =>
      t.assigned_to === uid &&
      ["done", "completed"].includes(t.status) &&
      inRange(t.updated_at || t.created_at)
    ).length;
  }

  // ── Calls
  if (metric === "calls") {
    return activities.filter(a =>
      a.created_by === uid && CALL_TYPES_LIST.includes(a.type) && inRange(a.created_at)
    ).length;
  }

  // ── Emails Sent
  if (metric === "emails_sent") {
    return activities.filter(a =>
      a.created_by === uid && ["email", "follow_up_email"].includes(a.type) && inRange(a.created_at)
    ).length;
  }

  // ── All Activities
  if (metric === "activities") {
    return activities.filter(a => a.created_by === uid && inRange(a.created_at)).length;
  }

  // ── Deals in Proposal (legacy)
  if (metric === "deals_proposal") {
    return deals.filter(d =>
      d.assigned_to === uid &&
      ["proposal_sent", "negotiation", "won"].includes(d.stage) &&
      inRange(d.updated_at || d.created_at)
    ).length;
  }

  return 0;
}

function computeTodayContribution(target, progressData) {
  const today = new Date().toISOString().slice(0, 10);
  return computeProgress({ ...target, start_date: today, end_date: today }, progressData);
}

function fmtMetric(v, metric, fmtCurrency) {
  if (metric === "revenue") return fmtCurrency ? fmtCurrency(Number(v || 0)) : `₹${Number(v || 0).toLocaleString("en-IN")}`;
  const info = metricInfo(metric);
  return `${Number(v || 0).toLocaleString("en-IN")} ${info.unit}`;
}

// ─── Filter Dropdown ──────────────────────────────────────────────────────────

function FilterDropdown({ label, options, value, onChange, searchable = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const shown    = searchable && q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const active   = !!value;
  const activeOpt = options.find(o => o.key === value);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 14px",
        borderRadius: 10, border: `1.5px solid ${active ? "#6366F1" : "#E5E7EB"}`,
        background: active ? "#EEF2FF" : "#FFFFFF", color: active ? "#4F46E5" : "#6B7280",
        fontSize: 13, fontWeight: active ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap",
        transition: "all 0.15s", fontFamily: "inherit",
      }}>
        {activeOpt?.icon && (() => { const I = activeOpt.icon; return <I size={13} style={{ color: activeOpt.color || "#4F46E5" }} />; })()}
        {active && activeOpt ? activeOpt.label : label}
        {active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366F1" }} />}
        <ChevronDownIcon size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", left: 0, zIndex: 400,
          background: "#FFFFFF", border: "1.5px solid #E5E7EB", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.13)", minWidth: 200, maxHeight: 320,
          display: "flex", flexDirection: "column",
        }}>
          {searchable && (
            <div style={{ padding: "8px 10px", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ position: "relative" }}>
                <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                  style={{ width: "100%", paddingLeft: 26, height: 30, borderRadius: 7, border: "1.5px solid #E5E7EB", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
          )}
          <div style={{ overflowY: "auto", padding: 6 }}>
            <button onClick={() => { onChange(""); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 8, border: "none", background: !value ? "#EEF2FF" : "transparent", color: !value ? "#4F46E5" : "#6B7280", fontSize: 12.5, fontWeight: !value ? 700 : 400, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              All
            </button>
            {shown.map(opt => {
              const isOn = value === opt.key;
              const OIcon = opt.icon;
              return (
                <button key={opt.key} onClick={() => { onChange(isOn ? "" : opt.key); setOpen(false); setQ(""); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 8, border: "none", background: isOn ? (opt.bg || "#EEF2FF") : "transparent", color: isOn ? (opt.color || "#4F46E5") : "#374151", fontSize: 12.5, fontWeight: isOn ? 700 : 400, cursor: "pointer", textAlign: "left", transition: "background 0.1s", fontFamily: "inherit" }}
                  onMouseEnter={e => { if (!isOn) e.currentTarget.style.background = "#F9FAFB"; }}
                  onMouseLeave={e => { if (!isOn) e.currentTarget.style.background = "transparent"; }}>
                  {OIcon && <div style={{ width: 22, height: 22, borderRadius: 6, background: isOn ? (opt.color + "20") : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><OIcon size={11} style={{ color: isOn ? opt.color : "#9CA3AF" }} /></div>}
                  <span style={{ flex: 1 }}>{opt.label}</span>
                  {isOn && <CheckCircle2 size={12} style={{ color: opt.color || "#4F46E5", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, height = 8 }) {
  const color = getBarColor(pct);
  return (
    <div style={{ height, background: "#F3F4F6", borderRadius: 99, overflow: "hidden" }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, pct)}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{ height: "100%", background: color, borderRadius: 99 }}
      />
    </div>
  );
}

// ─── Target Card ──────────────────────────────────────────────────────────────

function TargetCard({ target, progressData, teamMembers, canManage, myId, onView, onEdit, onDelete, fmtCurrency }) {
  const current   = computeProgress(target, progressData);
  const pct       = target.target_value > 0 ? Math.min(100, Math.round((current / target.target_value) * 100)) : 0;
  const isOverdue = target.end_date && new Date(target.end_date) < new Date() && pct < 100;
  const status    = getStatusConfig(pct, isOverdue);
  const metric    = metricInfo(target.metric);
  const MetIcon   = metric.icon;
  const StatusIcon = status.icon;
  const assignee  = teamMembers.find(m => m.id === target.assigned_to);
  const creator   = teamMembers.find(m => m.id === target.created_by);
  const remaining = Math.max(0, target.target_value - current);
  const canEdit   = canManage || target.created_by === myId;

  const daysLeft = target.end_date
    ? Math.ceil((new Date(target.end_date) - new Date()) / 86400000)
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{
        background: "#FFFFFF",
        border: `1.5px solid ${isOverdue ? "#FECACA" : pct >= 100 ? "#A7F3D0" : "#E5E7EB"}`,
        borderRadius: 16,
        padding: "20px",
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.15s, transform 0.15s",
        cursor: "default",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "none"; }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: metric.bg, border: `1.5px solid ${metric.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <MetIcon size={18} style={{ color: metric.color }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target.title}</div>
            <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 1 }}>{metric.label}</div>
          </div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: status.bg, color: status.color, border: `1px solid ${status.border}`, flexShrink: 0, marginLeft: 8 }}>
          <StatusIcon size={10} />{status.label}
        </span>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>
            {fmtMetric(current, target.metric, fmtCurrency)}
            <span style={{ color: "#9CA3AF", fontWeight: 400 }}> / {fmtMetric(target.target_value, target.metric, fmtCurrency)}</span>
          </span>
          <span style={{ fontSize: 20, fontWeight: 800, color: getBarColor(pct) }}>{pct}%</span>
        </div>
        <ProgressBar pct={pct} height={10} />
      </div>

      {/* Meta */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10.5, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Assigned To</div>
          <div style={{ fontSize: 12.5, color: "#111827", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {assignee?.full_name || "—"}
          </div>
        </div>
        <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10.5, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Assigned By</div>
          <div style={{ fontSize: 12.5, color: "#111827", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {creator?.full_name || "—"}
          </div>
        </div>
        <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10.5, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Remaining</div>
          <div style={{ fontSize: 12.5, color: pct >= 100 ? "#10B981" : "#111827", fontWeight: 700 }}>
            {pct >= 100 ? "✓ Complete" : fmtMetric(remaining, target.metric, fmtCurrency)}
          </div>
        </div>
        <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10.5, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
            {daysLeft !== null && daysLeft > 0 ? "Days Left" : "End Date"}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: isOverdue ? "#EF4444" : daysLeft !== null && daysLeft <= 3 ? "#F59E0B" : "#111827" }}>
            {isOverdue ? "Overdue"
              : daysLeft !== null && daysLeft > 0 ? `${daysLeft}d left`
              : target.end_date ? new Date(target.end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, paddingTop: 12, borderTop: "1px solid #F3F4F6" }}>
        <button onClick={() => onView(target)}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all 0.12s" }}
          onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
          onMouseLeave={e => e.currentTarget.style.background = "#FFFFFF"}>
          <Eye size={13} /> View
        </button>
        {canEdit && (
          <button onClick={() => onEdit(target)}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", borderRadius: 9, border: "1.5px solid #BFDBFE", background: "#EFF6FF", color: "#1D4ED8", fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all 0.12s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#DBEAFE"}
            onMouseLeave={e => e.currentTarget.style.background = "#EFF6FF"}>
            <Edit2 size={13} /> Edit
          </button>
        )}
        {canManage && (
          <button onClick={() => onDelete(target.id)}
            style={{ width: 34, display: "flex", alignItems: "center", justifyContent: "center", padding: "7px 0", borderRadius: 9, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#EF4444", cursor: "pointer", transition: "all 0.12s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#FEE2E2"}
            onMouseLeave={e => e.currentTarget.style.background = "#FEF2F2"}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Target Table ─────────────────────────────────────────────────────────────

function TargetTable({ targets, progressData, teamMembers, canManage, myId, onView, onEdit, onDelete, fmtCurrency }) {
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  const rows = useMemo(() => targets.map(t => {
    const current   = computeProgress(t, progressData);
    const pct       = t.target_value > 0 ? Math.min(100, Math.round((current / t.target_value) * 100)) : 0;
    const isOverdue = t.end_date && new Date(t.end_date) < new Date() && pct < 100;
    const assignee  = teamMembers.find(m => m.id === t.assigned_to);
    const creator   = teamMembers.find(m => m.id === t.created_by);
    const metric    = metricInfo(t.metric);
    return { ...t, current, pct, isOverdue, assigneeName: assignee?.full_name || "—", creatorName: creator?.full_name || "—", metricLabel: metric.label, metricColor: metric.color, metricBg: metric.bg };
  }), [targets, progressData, teamMembers]);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    let av = a[sortKey] ?? "", bv = b[sortKey] ?? "";
    if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  }), [rows, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const TH = ({ label, sk }) => (
    <th onClick={() => sk && handleSort(sk)}
      style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1.5px solid #E5E7EB", whiteSpace: "nowrap", cursor: sk ? "pointer" : "default", userSelect: "none", background: "#F9FAFB" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {label}
        {sk && sortKey === sk && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  );

  if (!sorted.length) return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <Target size={48} style={{ color: "#E5E7EB", margin: "0 auto 16px", display: "block" }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 6 }}>No targets found</div>
      <div style={{ fontSize: 13, color: "#9CA3AF" }}>Adjust filters or create a new target.</div>
    </div>
  );

  return (
    <div style={{ overflowX: "auto", borderRadius: 14, border: "1.5px solid #E5E7EB" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <TH label="#" />
            <TH label="Target" sk="title" />
            <TH label="Type" sk="metricLabel" />
            <TH label="Assigned To" sk="assigneeName" />
            <TH label="Target" />
            <TH label="Achieved" />
            <TH label="Progress" sk="pct" />
            <TH label="End Date" sk="end_date" />
            <TH label="Status" sk="pct" />
            <TH label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const status = getStatusConfig(row.pct, row.isOverdue);
            const StatusIcon = status.icon;
            const canEdit = canManage || row.created_by === myId;
            return (
              <tr key={row.id} style={{ borderBottom: "1px solid #F3F4F6", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "12px 14px", color: "#9CA3AF", fontWeight: 600, fontSize: 12 }}>{idx + 1}</td>
                <td style={{ padding: "12px 14px", maxWidth: 200 }}>
                  <div style={{ fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
                  {row.description && <div style={{ fontSize: 11.5, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{row.description}</div>}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: row.metricBg, color: row.metricColor }}>
                    {row.metricLabel}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", fontWeight: 500, color: "#374151", whiteSpace: "nowrap" }}>{row.assigneeName}</td>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{fmtMetric(row.target_value, row.metric, fmtCurrency)}</td>
                <td style={{ padding: "12px 14px", fontWeight: 700, color: getBarColor(row.pct), whiteSpace: "nowrap" }}>{fmtMetric(row.current, row.metric, fmtCurrency)}</td>
                <td style={{ padding: "12px 14px", minWidth: 140 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, row.pct)}%`, background: getBarColor(row.pct), borderRadius: 99, transition: "width 0.4s" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: getBarColor(row.pct), minWidth: 34, textAlign: "right" }}>{row.pct}%</span>
                  </div>
                </td>
                <td style={{ padding: "12px 14px", whiteSpace: "nowrap", color: row.isOverdue ? "#EF4444" : "#374151", fontWeight: row.isOverdue ? 700 : 400 }}>
                  {row.end_date ? new Date(row.end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: status.bg, color: status.color, border: `1px solid ${status.border}` }}>
                    <StatusIcon size={10} />{status.label}
                  </span>
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => onView(row)} title="View" style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#374151" }}>
                      <Eye size={12} />
                    </button>
                    {canEdit && <button onClick={() => onEdit(row)} title="Edit" style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #BFDBFE", background: "#EFF6FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#1D4ED8" }}>
                      <Edit2 size={12} />
                    </button>}
                    {canManage && <button onClick={() => onDelete(row.id)} title="Delete" style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #FECACA", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444" }}>
                      <Trash2 size={12} />
                    </button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── View Modal ───────────────────────────────────────────────────────────────

function ViewModal({ target, progressData, teamMembers, onClose, fmtCurrency }) {
  const metric    = metricInfo(target.metric);
  const MetIcon   = metric.icon;
  const current   = computeProgress(target, progressData);
  const pct       = target.target_value > 0 ? Math.min(100, Math.round((current / target.target_value) * 100)) : 0;
  const isOverdue = target.end_date && new Date(target.end_date) < new Date() && pct < 100;
  const status    = getStatusConfig(pct, isOverdue);
  const StatusIcon = status.icon;
  const assignee  = teamMembers.find(m => m.id === target.assigned_to);
  const creator   = teamMembers.find(m => m.id === target.created_by);
  const todayContrib = computeTodayContribution(target, progressData);
  const remaining = Math.max(0, target.target_value - current);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 500, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: metric.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MetIcon size={20} style={{ color: metric.color }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#111827" }}>{target.title}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <span style={{ fontSize: 11.5, color: "#6B7280" }}>{metric.label}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: status.bg, color: status.color }}><StatusIcon size={9} />{status.label}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}><X size={15} /></button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Big Progress */}
          <div style={{ background: "#F9FAFB", borderRadius: 14, padding: 18, border: "1.5px solid #E5E7EB" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "#374151" }}>Progress</span>
              <span style={{ fontSize: 28, fontWeight: 900, color: getBarColor(pct) }}>{pct}%</span>
            </div>
            <ProgressBar pct={pct} height={12} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}>
              <span style={{ color: "#374151", fontWeight: 600 }}>Achieved: {fmtMetric(current, target.metric, fmtCurrency)}</span>
              <span style={{ color: "#9CA3AF" }}>Goal: {fmtMetric(target.target_value, target.metric, fmtCurrency)}</span>
            </div>
          </div>

          {/* Today + Remaining */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: "#EFF6FF", border: "1.5px solid #BFDBFE", borderRadius: 12, padding: "12px 16px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Today's Progress</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1D4ED8" }}>+{fmtMetric(todayContrib, target.metric, fmtCurrency)}</div>
            </div>
            <div style={{ background: pct >= 100 ? "#ECFDF5" : "#FEF2F2", border: `1.5px solid ${pct >= 100 ? "#A7F3D0" : "#FECACA"}`, borderRadius: 12, padding: "12px 16px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: pct >= 100 ? "#10B981" : "#EF4444", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Remaining</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: pct >= 100 ? "#059669" : "#DC2626" }}>
                {pct >= 100 ? "✓ Done" : fmtMetric(remaining, target.metric, fmtCurrency)}
              </div>
            </div>
          </div>

          {/* Details */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Assigned To",  value: assignee?.full_name || "—" },
              { label: "Assigned By",  value: creator?.full_name  || "—" },
              { label: "Period",       value: target.period_type?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "—" },
              { label: "Target Value", value: fmtMetric(target.target_value, target.metric, fmtCurrency) },
              { label: "Start Date",   value: target.start_date ? new Date(target.start_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
              { label: "End Date",     value: target.end_date   ? new Date(target.end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
            ].map(f => (
              <div key={f.label} style={{ background: "#F9FAFB", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 10.5, color: "#9CA3AF", fontWeight: 600, marginBottom: 3 }}>{f.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{f.value}</div>
              </div>
            ))}
          </div>

          {target.description && (
            <div style={{ background: "#FFFBEB", border: "1.5px solid #FDE68A", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 10.5, color: "#D97706", fontWeight: 700, marginBottom: 4 }}>DESCRIPTION</div>
              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{target.description}</div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

function CreateEditModal({ existing, onClose, onSave, teamMembers }) {
  const isEdit = !!existing;
  const initMetricKey    = existing?.metric?.startsWith("custom:") ? "custom" : (existing?.metric || "meetings");
  const initCustomLabel  = existing?.metric?.startsWith("custom:") ? existing.metric.slice(7) : "";

  const [selectedMetric,    setSelectedMetric]    = useState(initMetricKey);
  const [customMetricLabel, setCustomMetricLabel] = useState(initCustomLabel);
  const [periodType,        setPeriodType]        = useState(existing?.period_type || "monthly");

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      title:        existing?.title        || "",
      description:  existing?.description  || "",
      target_value: existing?.target_value || "",
      start_date:   existing?.start_date   || new Date().toISOString().slice(0, 10),
      end_date:     existing?.end_date     || "",
      assigned_to:  existing?.assigned_to  || "",
    },
  });

  const startDate = watch("start_date");

  useEffect(() => {
    if (!startDate) return;
    const d = new Date(startDate + "T00:00:00");
    if      (periodType === "weekly")      { d.setDate(d.getDate() + 6); }
    else if (periodType === "monthly")     { d.setMonth(d.getMonth() + 1); d.setDate(d.getDate() - 1); }
    else if (periodType === "quarterly")   { d.setMonth(d.getMonth() + 3); d.setDate(d.getDate() - 1); }
    else if (periodType === "half_yearly") { d.setMonth(d.getMonth() + 6); d.setDate(d.getDate() - 1); }
    else if (periodType === "yearly")      { d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1); }
    else { return; }
    setValue("end_date", d.toISOString().slice(0, 10));
  }, [startDate, periodType, setValue]);

  const onSubmit = async (data) => {
    if (selectedMetric === "custom" && !customMetricLabel.trim()) { toast.error("Enter custom metric name"); return; }
    const finalMetric = selectedMetric === "custom" ? `custom:${customMetricLabel.trim()}` : selectedMetric;
    await onSave({ ...data, metric: finalMetric, period_type: periodType, target_value: Number(data.target_value) });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 580, maxHeight: "92vh", overflowY: "auto" }}>

        <div style={{ padding: "18px 24px", borderBottom: "1.5px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#FFFFFF", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Target size={18} style={{ color: "#6366F1" }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#111827" }}>{isEdit ? "Edit Target" : "Create Target"}</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>{isEdit ? "Update target details" : "Assign a new performance target"}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}><X size={15} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>

          <div>
            <label className="crm-label">Target Title *</label>
            <input className="crm-input" {...register("title", { required: "Required" })} placeholder="e.g. Q2 Meetings Goal, Monthly Calls Target" />
            {errors.title && <span style={{ color: "#EF4444", fontSize: 11.5 }}>{errors.title.message}</span>}
          </div>

          {/* Target Type */}
          <div>
            <label className="crm-label">Target Type *</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
              {METRICS.filter(m => m.key !== "custom").map(m => {
                const MIcon = m.icon;
                const isOn  = selectedMetric === m.key;
                return (
                  <button key={m.key} type="button" onClick={() => setSelectedMetric(m.key)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "10px 6px", borderRadius: 10, border: `1.5px solid ${isOn ? m.color : "#E5E7EB"}`, background: isOn ? m.bg : "#FAFAFA", cursor: "pointer", transition: "all 0.12s" }}>
                    <MIcon size={16} style={{ color: isOn ? m.color : "#9CA3AF" }} />
                    <span style={{ fontSize: 10.5, fontWeight: isOn ? 700 : 500, color: isOn ? m.color : "#6B7280", textAlign: "center", lineHeight: 1.2 }}>{m.label}</span>
                  </button>
                );
              })}
              <button type="button" onClick={() => setSelectedMetric("custom")}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "10px 6px", borderRadius: 10, border: `1.5px solid ${selectedMetric === "custom" ? "#64748B" : "#E5E7EB"}`, background: selectedMetric === "custom" ? "#F8FAFC" : "#FAFAFA", cursor: "pointer", transition: "all 0.12s" }}>
                <Edit2 size={16} style={{ color: selectedMetric === "custom" ? "#64748B" : "#9CA3AF" }} />
                <span style={{ fontSize: 10.5, fontWeight: selectedMetric === "custom" ? 700 : 500, color: selectedMetric === "custom" ? "#64748B" : "#6B7280", textAlign: "center" }}>Custom</span>
              </button>
            </div>
            {selectedMetric === "custom" && (
              <input className="crm-input" style={{ marginTop: 8 }} value={customMetricLabel} onChange={e => setCustomMetricLabel(e.target.value)} placeholder="e.g. Product Demos, Client Visits…" />
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="crm-label">Period *</label>
              <select className="crm-input" value={periodType} onChange={e => setPeriodType(e.target.value)}>
                {PERIOD_TYPES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Target Value *</label>
              <input className="crm-input" type="number" min="1"
                {...register("target_value", { required: "Required", min: { value: 1, message: "Must be ≥ 1" } })}
                placeholder="e.g. 50" />
              {errors.target_value && <span style={{ color: "#EF4444", fontSize: 11.5 }}>{errors.target_value.message}</span>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="crm-label">Start Date *</label>
              <input className="crm-input" type="date" {...register("start_date", { required: "Required" })} />
              {errors.start_date && <span style={{ color: "#EF4444", fontSize: 11.5 }}>{errors.start_date.message}</span>}
            </div>
            <div>
              <label className="crm-label">End Date <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(auto-set)</span></label>
              <input className="crm-input" type="date" {...register("end_date")} />
            </div>
          </div>

          <div>
            <label className="crm-label">Assign To *</label>
            <select className="crm-input" {...register("assigned_to", { required: "Required" })}>
              <option value="">Select team member</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name} ({m.role?.replace(/_/g, " ")})</option>
              ))}
            </select>
            {errors.assigned_to && <span style={{ color: "#EF4444", fontSize: 11.5 }}>{errors.assigned_to.message}</span>}
          </div>

          <div>
            <label className="crm-label">Description</label>
            <textarea className="crm-input" {...register("description")} placeholder="Optional notes about this target…" rows={2} style={{ resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4, borderTop: "1.5px solid #E5E7EB" }}>
            <button type="button" onClick={onClose} style={{ padding: "9px 20px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={isSubmitting}
              style={{ padding: "9px 24px", borderRadius: 10, border: "none", background: isSubmitting ? "#E5E7EB" : "#111827", color: isSubmitting ? "#9CA3AF" : "#FFFFFF", fontSize: 13.5, fontWeight: 700, cursor: isSubmitting ? "not-allowed" : "pointer", minWidth: 130 }}>
              {isSubmitting ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save Changes" : "Create Target")}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Targets() {
  const { profile } = useAuth();
  const { fmtCurrency } = useCurrency();
  const qc = useQueryClient();

  const canManage = ["owner", "sales_head"].includes(profile?.role);

  const [view,            setView]           = useState("cards");
  const [showModal,       setShowModal]      = useState(false);
  const [editTarget,      setEditTarget]     = useState(null);
  const [viewTarget,      setViewTarget]     = useState(null);
  const [typeFilter,      setTypeFilter]     = useState("");
  const [statusFilter,    setStatusFilter]   = useState("");
  const [assigneeFilter,  setAssigneeFilter] = useState("");
  const [search,          setSearch]         = useState("");

  // ── Fetch targets
  const { data: targetsRaw = [], isLoading: targetsLoading } = useQuery({
    queryKey: ["targets", profile?.id],
    queryFn: async () => {
      const json = await targetsApi("GET", "/api/targets");
      return json.data || [];
    },
    enabled: !!profile?.id,
    staleTime: 0,
    refetchInterval: 30000,
  });

  // ── Fetch all CRM progress data (auto-tracking)
  const { data: progressData } = useQuery({
    queryKey: ["targets-progress"],
    queryFn: fetchAllProgress,
    enabled: !!profile?.id,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // ── Fetch team members
  const { data: teamRaw } = useQuery({
    queryKey: ["team-all"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, role, avatar_url").order("full_name");
      return data || [];
    },
    staleTime: 60000,
  });
  const teamMembers = teamRaw || [];

  // ── Real-time refresh when CRM data changes
  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase.channel("targets-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => qc.invalidateQueries({ queryKey: ["targets-progress"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" },   () => qc.invalidateQueries({ queryKey: ["targets-progress"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" },      () => qc.invalidateQueries({ queryKey: ["targets-progress"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" },      () => qc.invalidateQueries({ queryKey: ["targets-progress"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" },      () => qc.invalidateQueries({ queryKey: ["targets-progress"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "targets" },    () => qc.invalidateQueries({ queryKey: ["targets", profile.id] }))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [profile?.id, qc]);

  // ── Mutations
  const invalidate = () => qc.invalidateQueries({ queryKey: ["targets", profile?.id] });

  const createMutation = useMutation({
    mutationFn: (body) => targetsApi("POST", "/api/targets", body),
    onSuccess: () => { invalidate(); toast.success("Target created"); setShowModal(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => targetsApi("PUT", `/api/targets/${id}`, body),
    onSuccess: () => { invalidate(); toast.success("Target updated"); setEditTarget(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => targetsApi("DELETE", `/api/targets/${id}`),
    onSuccess: () => { invalidate(); toast.success("Target deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (data) => {
    if (editTarget) await updateMutation.mutateAsync({ id: editTarget.id, ...data });
    else await createMutation.mutateAsync(data);
  };

  const handleDelete = (id) => {
    if (window.confirm("Delete this target?")) deleteMutation.mutate(id);
  };

  // ── Filtered targets with computed progress
  const enriched = useMemo(() => {
    if (!progressData) return [];
    return targetsRaw.map(t => {
      const current   = computeProgress(t, progressData);
      const pct       = t.target_value > 0 ? Math.min(100, Math.round((current / t.target_value) * 100)) : 0;
      const isOverdue = t.end_date && new Date(t.end_date) < new Date() && pct < 100;
      return { ...t, _current: current, _pct: pct, _isOverdue: isOverdue };
    });
  }, [targetsRaw, progressData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter(t => {
      if (typeFilter && !t.metric?.includes(typeFilter)) return false;
      if (statusFilter) {
        if (statusFilter === "completed" && t._pct < 100)    return false;
        if (statusFilter === "active"    && (t._pct >= 100 || t._isOverdue)) return false;
        if (statusFilter === "overdue"   && !t._isOverdue)   return false;
        if (statusFilter === "pending"   && (t._pct > 0 || t._isOverdue)) return false;
      }
      if (assigneeFilter && t.assigned_to !== assigneeFilter) return false;
      if (q && !t.title?.toLowerCase().includes(q) && !metricInfo(t.metric).label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, typeFilter, statusFilter, assigneeFilter, search]);

  // ── Summary stats
  const stats = useMemo(() => {
    const total     = enriched.length;
    const completed = enriched.filter(t => t._pct >= 100).length;
    const overdue   = enriched.filter(t => t._isOverdue).length;
    const active    = enriched.filter(t => t._pct < 100 && !t._isOverdue).length;
    const avgPct    = total > 0 ? Math.round(enriched.reduce((s, t) => s + t._pct, 0) / total) : 0;
    return { total, completed, overdue, active, avgPct };
  }, [enriched]);

  const activeFilters = [typeFilter, statusFilter, assigneeFilter].filter(Boolean).length;

  return (
    <div style={{ padding: "24px", minHeight: "100%" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.03em" }}>Target Management</h1>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "#6B7280" }}>Track and manage team performance targets</p>
        </div>
        {canManage && (
          <button onClick={() => { setEditTarget(null); setShowModal(true); }}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 20px", height: 40, borderRadius: 10, background: "#111827", color: "#FFFFFF", fontSize: 13.5, fontWeight: 700, border: "none", cursor: "pointer", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#1F2937"}
            onMouseLeave={e => e.currentTarget.style.background = "#111827"}>
            <Plus size={15} /> Create Target
          </button>
        )}
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Targets",    value: stats.total,     color: "#6366F1", bg: "#EEF2FF",  border: "#C7D2FE", icon: Target      },
          { label: "Active",           value: stats.active,    color: "#3B82F6", bg: "#EFF6FF",  border: "#BFDBFE", icon: Activity    },
          { label: "Completed",        value: stats.completed, color: "#10B981", bg: "#ECFDF5",  border: "#A7F3D0", icon: CheckCircle2},
          { label: "Overdue",          value: stats.overdue,   color: "#EF4444", bg: "#FEF2F2",  border: "#FECACA", icon: AlertCircle },
          { label: "Avg Achievement",  value: `${stats.avgPct}%`, color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", icon: Trophy    },
        ].map(({ label, value, color, bg, border, icon: Icon }) => (
          <div key={label} style={{ background: "#FFFFFF", border: `1.5px solid ${border}`, borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={16} style={{ color }} />
              </div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1.1 }}>{value}</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "#6B7280", marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ background: "#FFFFFF", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: "12px 16px", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>

          <FilterDropdown label="Target Type" value={typeFilter} onChange={setTypeFilter}
            options={METRICS.filter(m => m.key !== "custom").map(m => ({ key: m.key, label: m.label, icon: m.icon, color: m.color, bg: m.bg }))} />

          <FilterDropdown label="Status" value={statusFilter} onChange={setStatusFilter}
            options={[
              { key: "active",    label: "Active",    icon: Activity,    color: "#3B82F6", bg: "#EFF6FF" },
              { key: "completed", label: "Completed", icon: CheckCircle2,color: "#10B981", bg: "#ECFDF5" },
              { key: "overdue",   label: "Overdue",   icon: AlertCircle, color: "#EF4444", bg: "#FEF2F2" },
              { key: "pending",   label: "Pending",   icon: Clock,       color: "#F59E0B", bg: "#FFFBEB" },
            ]} />

          {canManage && teamMembers.length > 0 && (
            <FilterDropdown label="Employee" value={assigneeFilter} onChange={setAssigneeFilter} searchable
              options={teamMembers.map(m => ({ key: m.id, label: m.full_name, color: "#6366F1", bg: "#EEF2FF" }))} />
          )}

          {activeFilters > 0 && (
            <button onClick={() => { setTypeFilter(""); setStatusFilter(""); setAssigneeFilter(""); setSearch(""); }}
              style={{ display: "flex", alignItems: "center", gap: 5, height: 38, padding: "0 12px", borderRadius: 10, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#EF4444", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              <X size={12} /> Clear ({activeFilters})
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input style={{ paddingLeft: 32, height: 38, width: 200, fontSize: 13, border: "1.5px solid #E5E7EB", borderRadius: 10, background: "#FAFAFA", color: "#111827", outline: "none", fontFamily: "inherit" }}
              placeholder="Search targets…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* View toggle */}
          <div style={{ display: "flex", background: "#F3F4F6", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: 3, gap: 2 }}>
            {[{ key: "cards", label: "Cards", icon: LayoutList }, { key: "table", label: "Table", icon: BarChart2 }].map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setView(key)} title={label}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: view === key ? "#FFFFFF" : "transparent", color: view === key ? "#111827" : "#9CA3AF", fontSize: 12, fontWeight: view === key ? 700 : 400, boxShadow: view === key ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {targetsLoading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80, gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid #E5E7EB", borderTopColor: "#6366F1", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 13, color: "#9CA3AF" }}>Loading targets…</span>
        </div>
      ) : view === "cards" ? (
        filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <Target size={52} style={{ color: "#E5E7EB", margin: "0 auto 16px", display: "block" }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "#374151", marginBottom: 6 }}>No targets found</div>
            <div style={{ fontSize: 13, color: "#9CA3AF" }}>
              {canManage ? "Create your first target to start tracking performance." : "No targets have been assigned to you yet."}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            <AnimatePresence initial={false}>
              {filtered.map(t => (
                <TargetCard key={t.id} target={t} progressData={progressData} teamMembers={teamMembers}
                  canManage={canManage} myId={profile?.id}
                  onView={setViewTarget} onEdit={setEditTarget} onDelete={handleDelete} fmtCurrency={fmtCurrency} />
              ))}
            </AnimatePresence>
          </div>
        )
      ) : (
        <TargetTable targets={filtered} progressData={progressData} teamMembers={teamMembers}
          canManage={canManage} myId={profile?.id}
          onView={setViewTarget} onEdit={setEditTarget} onDelete={handleDelete} fmtCurrency={fmtCurrency} />
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {(showModal || editTarget) && (
          <CreateEditModal
            key={editTarget?.id || "new"}
            existing={editTarget}
            onClose={() => { setShowModal(false); setEditTarget(null); }}
            onSave={handleSave}
            teamMembers={teamMembers.filter(m => m.id !== profile?.id || canManage)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {viewTarget && (
          <ViewModal target={viewTarget} progressData={progressData} teamMembers={teamMembers}
            onClose={() => setViewTarget(null)} fmtCurrency={fmtCurrency} />
        )}
      </AnimatePresence>
    </div>
  );
}
