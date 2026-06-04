import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import { auth } from "../firebase";
import { teamService } from "../services/teamService";
import { leadsService } from "../services/leadsService";
import { dealsService } from "../services/dealsService";
import Targets from "./Targets";
import toast from "react-hot-toast";
import {
  Plus, Search, Pencil, Trash2, X, Phone, Mail, FileText, Bell,
  Video, RefreshCw, Clock, LayoutList, Table2, Columns, CalendarDays,
  Flag, Circle, CheckCircle2, AlertCircle, SlidersHorizontal,
  CalendarClock, PhoneCall, Send, CheckCheck, ChevronLeft, ChevronRight,
  GripVertical, Link2, ArrowUpRight, RotateCcw, TrendingUp,
  ChevronDown, Users, Download, Upload, Target, Activity, MessageCircle,
  Zap, Star, Coffee, Building2,
} from "lucide-react";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

// ─── Constants ────────────────────────────────────────────────────────────────

// Standard types (shown in create form + filter pills) — matches activityTypes.js
const ACT_TYPES = {
  follow_up_call:  { label: "Follow-up Call",   icon: PhoneCall,    color: "#F59E0B", bg: "#FFFBEB",  border: "#FDE68A" },
  follow_up_email: { label: "Follow-up Email",  icon: Mail,         color: "#6366F1", bg: "#EEF2FF",  border: "#C7D2FE" },
  call:            { label: "Call",              icon: Phone,        color: "#3B82F6", bg: "#EFF6FF",  border: "#BFDBFE" },
  email:           { label: "Email",             icon: Mail,         color: "#EC4899", bg: "#FDF2F8",  border: "#F9A8D4" },
  meeting_virtual: { label: "Virtual Meeting",   icon: Video,        color: "#8B5CF6", bg: "#F5F3FF",  border: "#DDD6FE" },
  meeting_person:  { label: "In-Person Meeting", icon: Users,        color: "#7C3AED", bg: "#F5F3FF",  border: "#DDD6FE" },
  note:               { label: "Note",                 icon: FileText,     color: "#10B981", bg: "#ECFDF5",  border: "#A7F3D0" },
  whatsapp:           { label: "WhatsApp",             icon: MessageCircle, color: "#25D366", bg: "#F0FDF4",  border: "#86EFAC" },
  whatsapp_follow_up: { label: "WhatsApp Follow-up",   icon: MessageCircle, color: "#16A34A", bg: "#DCFCE7",  border: "#4ADE80" },
  break:              { label: "Break",                icon: Coffee,        color: "#64748B", bg: "#F8FAFC",  border: "#CBD5E1" },
  // Legacy types — kept for rendering old DB records
  meeting:         { label: "Meeting",           icon: Video,        color: "#8B5CF6", bg: "#F5F3FF",  border: "#DDD6FE" },
  followup:        { label: "Follow-up",         icon: RefreshCw,    color: "#F59E0B", bg: "#FFFBEB",  border: "#FDE68A" },
  follow_up:       { label: "Follow-up",         icon: RefreshCw,    color: "#F59E0B", bg: "#FFFBEB",  border: "#FDE68A" },
  reminder:        { label: "Reminder",          icon: Bell,         color: "#EF4444", bg: "#FEF2F2",  border: "#FECACA" },
  task:            { label: "Task",              icon: CheckCircle2, color: "#06B6D4", bg: "#ECFEFF",  border: "#A5F3FC" },
};

// Ordered list shown in the create form type selector and filter pills
const DISPLAY_TYPES = ["follow_up_call", "follow_up_email", "email", "call", "break", "meeting_person", "meeting_virtual", "note"];

const DB_TYPE_MAP = {
  "Cold Call": "call", "Demo": "call",
  "Introductory": "call", "Verification": "call", "Other": "call",
  "Meeting": "meeting", "Virtual Meeting": "meeting_virtual",
  "Follow-up Task": "followup", "Follow-up": "followup",
  "Note": "note", "Email": "email", "Reminder": "reminder", "Proposal Sent": "task",
};
const typeKey = (t) => DB_TYPE_MAP[t] || t || "task";

const STATUSES = [
  { key: "todo",        label: "Pending",     color: "#F59E0B", bg: "#FFFBEB", icon: Clock        },
  { key: "in_progress", label: "In Progress", color: "#3B82F6", bg: "#EFF6FF", icon: Clock        },
  { key: "done",        label: "Completed",   color: "#10B981", bg: "#ECFDF5", icon: CheckCircle2 },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

// Filter-panel statuses — includes computed states (overdue/upcoming/pending) for richer filtering
const FILTER_STATUSES = [
  { key: "pending",     label: "Pending",     color: "#F59E0B", bg: "#FFFBEB", icon: Clock,         desc: "Not yet completed"       },
  { key: "in_progress", label: "In Progress", color: "#3B82F6", bg: "#EFF6FF", icon: Clock,         desc: "Currently active"        },
  { key: "done",        label: "Completed",   color: "#10B981", bg: "#ECFDF5", icon: CheckCircle2,  desc: "Marked as done"          },
  { key: "overdue",     label: "Overdue",     color: "#EF4444", bg: "#FEF2F2", icon: AlertCircle,   desc: "Past due date, not done" },
  { key: "upcoming",    label: "Upcoming",    color: "#6366F1", bg: "#EEF2FF", icon: CalendarClock, desc: "Due in next 7 days"      },
];

const PRIORITIES = [
  { key: "low",    label: "Low",    color: "#6B7280" },
  { key: "medium", label: "Medium", color: "#F59E0B" },
  { key: "high",   label: "High",   color: "#EF4444" },
  { key: "urgent", label: "Urgent", color: "#7C3AED" },
];
const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));

const SMART_FILTERS = [
  { key: "today",           label: "Today",             color: "#3B82F6", bg: "#EFF6FF", icon: CalendarDays,  desc: "Due or created today"         },
  { key: "meetings_today",  label: "Meetings Today",    color: "#8B5CF6", bg: "#F5F3FF", icon: Video,         desc: "Meetings scheduled today"     },
  { key: "meetings_all",    label: "All Meetings",      color: "#7C3AED", bg: "#F5F3FF", icon: Video,         desc: "All meeting activities"       },
  { key: "follow_ups_due",  label: "Follow-ups Due",    color: "#F59E0B", bg: "#FFFBEB", icon: PhoneCall,     desc: "Pending follow-ups"           },
  { key: "calls",           label: "Calls",             color: "#3B82F6", bg: "#EFF6FF", icon: Phone,         desc: "All call activities"          },
  { key: "high_priority",   label: "High Priority",     color: "#EF4444", bg: "#FEF2F2", icon: Zap,           desc: "Urgent or high priority"      },
  { key: "lead_updates",    label: "Lead Activities",   color: "#10B981", bg: "#ECFDF5", icon: TrendingUp,    desc: "Activities linked to leads"   },
  { key: "deal_updates",    label: "Deal Activities",   color: "#F59E0B", bg: "#FFFBEB", icon: Target,        desc: "Activities linked to deals"   },
  { key: "recent",          label: "Recently Added",    color: "#0EA5E9", bg: "#F0F9FF", icon: Star,          desc: "Added in the last 24 hours"   },
  { key: "pipeline_changes",label: "Pipeline Changes",  color: "#7C3AED", bg: "#F5F3FF", icon: Activity,      desc: "Stage change activities"      },
];

const ROLE_RANK = { owner: 4, sales_head: 3, sales_manager: 2, employee: 1, inside_sales: 1 };

const CALL_SUB_TYPES  = ["Cold Call", "Follow-up", "Demo", "Introductory", "Verification", "Other"];
const CALL_RESPONSES  = ["Interested", "Not Interested", "Call Back", "No Response", "Busy", "Wrong Number", "Meeting Scheduled"];

// ─── Service ──────────────────────────────────────────────────────────────────

const actService = {
  async getAll() {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API}/api/activities?limit=500`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch activities");
    const json = await res.json();
    return json.data || [];
  },
  async create(payload) {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API}/api/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to create activity"); }
    return res.json();
  },
  async update(id, payload) {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API}/api/activities/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to update activity"); }
    return res.json();
  },
  async delete(id) {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API}/api/activities/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to delete activity"); }
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseJSON = (s) => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const toJSON    = (o) => JSON.stringify(o);

// Strip activity-type prefix from title so Description doesn't duplicate Activity Type
// e.g. "Follow-up Call: Not answered" → "Not answered"
function cleanDescription(title, actType) {
  if (!title) return "";
  const def = ACT_TYPES[typeKey(actType)];
  if (!def) return title;
  const prefixes = [def.label + ": ", def.label + "- ", def.label + " - "];
  for (const p of prefixes) {
    if (title.startsWith(p)) return title.slice(p.length).trim();
  }
  // Also strip if title IS exactly the type label
  if (title.trim().toLowerCase() === def.label.toLowerCase()) return "";
  return title;
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((dt.setHours(0,0,0,0) - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function initials(name) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function groupByTimeline(activities) {
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const nextWeek  = new Date(today); nextWeek.setDate(today.getDate() + 7);
  const groups    = { overdue: [], today: [], tomorrow: [], upcoming: [], later: [], yesterday: [], earlier: [], completed: [] };

  activities.forEach((a) => {
    if (a.status === "done") { groups.completed.push(a); return; }

    if (a.due_date) {
      const d = new Date(a.due_date); d.setHours(0,0,0,0);
      if      (d < today)                               groups.overdue.push(a);
      else if (d.getTime() === today.getTime())         groups.today.push(a);
      else if (d.getTime() === tomorrow.getTime())      groups.tomorrow.push(a);
      else if (d < nextWeek)                            groups.upcoming.push(a);
      else                                              groups.later.push(a);
    } else {
      // No due_date — group by created_at so nothing falls into a "No Date" void
      const cd = a.created_at ? new Date(a.created_at) : null;
      if (!cd) { groups.earlier.push(a); return; }
      const day = new Date(cd); day.setHours(0,0,0,0);
      if      (day.getTime() === today.getTime())     groups.today.push(a);
      else if (day.getTime() === yesterday.getTime()) groups.yesterday.push(a);
      else                                            groups.earlier.push(a);
    }
  });

  groups.completed.sort((a, b) => new Date(b.updated_at||b.created_at) - new Date(a.updated_at||a.created_at));
  groups.earlier.sort((a, b) => new Date(b.created_at||0) - new Date(a.created_at||0));
  return groups;
}

// ─── Micro Components ─────────────────────────────────────────────────────────

function Avatar({ user, size = 24 }) {
  if (!user) return null;
  return user.avatar_url
    ? <img src={user.avatar_url} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} alt="" />
    : <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initials(user.full_name)}</div>;
}

function TypeBadge({ type }) {
  const def  = ACT_TYPES[typeKey(type)] || ACT_TYPES.task;
  const Icon = def.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: def.bg, color: def.color, border: `1px solid ${def.border}`, whiteSpace: "nowrap" }}>
      <Icon size={10} strokeWidth={2} />{def.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s    = STATUS_MAP[status] || STATUS_MAP.todo;
  const Icon = s.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      <Icon size={10} strokeWidth={2.2} />{s.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const p = PRIORITY_MAP[priority?.toLowerCase()] || PRIORITY_MAP.medium;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${p.color}12`, color: p.color, border: `1px solid ${p.color}30`, whiteSpace: "nowrap" }}>
      <Flag size={9} fill={p.color} />{p.label}
    </span>
  );
}

// ─── Activity Card ────────────────────────────────────────────────────────────

function ActivityCard({ activity, onEdit, onDelete, onStatusChange, resolveEntity, resolveEntityFull }) {
  const navigate  = useNavigate();
  const { profile } = useAuth();
  const myRank      = ROLE_RANK[profile?.role] || 0;
  const isOwn       = activity.created_by === profile?.id || activity.assigned_to === profile?.id;
  const canEdit     = isOwn || myRank >= 3; // owner(4) / sales_head(3) can edit anyone's
  const canDelete   = profile?.role === "owner" || profile?.role === "sales_head";
  const def         = ACT_TYPES[typeKey(activity.type)] || ACT_TYPES.task;
  const Icon        = def.icon;
  const desc        = parseJSON(activity.description);
  const notes       = desc.remarks || desc.notes || desc.outcome || desc.agenda || desc.body || "";
  const isDone      = activity.status === "done";
  const _now        = new Date();
  const isOverdue   = !isDone && activity.due_date && new Date(activity.due_date) < _now;
  const isDueToday  = !isDone && !isOverdue && activity.due_date && new Date(activity.due_date).toDateString() === _now.toDateString();
  const entity      = resolveEntity(activity.related_type, activity.related_id);
  const { company, contact } = resolveEntityFull ? resolveEntityFull(activity) : { company: null, contact: null };

  const accentColor = isDone ? "#10B981" : isOverdue ? "#EF4444" : isDueToday ? "#F59E0B" : def.color;
  const cleanedDesc = cleanDescription(activity.title, activity.type);
  const bodyText    = notes || cleanedDesc || activity.title;

  // Status display
  const statusCfg = isOverdue
    ? { label: "Overdue",    color: "#EF4444", bg: "#FEF2F2" }
    : isDone
    ? { label: "Completed",  color: "#10B981", bg: "#ECFDF5" }
    : activity.status === "in_progress"
    ? { label: "In Progress", color: "#3B82F6", bg: "#EFF6FF" }
    : { label: "Pending",    color: "#F59E0B", bg: "#FFFBEB" };

  // Datetime display
  const createdStr = activity.created_at
    ? new Date(activity.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  const assignedPerson = (activity.assigned_profile || activity.created_by_profile);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      style={{
        background: isDone ? "#FAFAFA" : "#FFFFFF",
        border: `1px solid ${isOverdue ? "#FCA5A5" : "#E5E7EB"}`,
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: 14,
        padding: "16px 18px",
        boxShadow: isDone ? "none" : "0 2px 8px rgba(0,0,0,0.06)",
        opacity: isDone ? 0.8 : 1,
        transition: "box-shadow 0.18s, transform 0.18s",
      }}
      onMouseEnter={(e) => { if (!isDone) { e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = isDone ? "none" : "0 2px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "none"; }}
    >
      {/* ── ROW 1: Company + Contact (most important) + Actions ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {(company || contact) ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: isDone ? "#9CA3AF" : "#0F172A", letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
                {company || "—"}
              </span>
              {contact && (
                <>
                  <span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 400 }}>—</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#475569" }}>{contact}</span>
                </>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 14, fontWeight: 700, color: isDone ? "#9CA3AF" : "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activity.title}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {canEdit && !isDone && (
            <button title="Mark done" onClick={(e) => { e.stopPropagation(); onStatusChange(activity.id, "done"); }}
              style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #D1FAE5", background: "#ECFDF5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#10B981", transition: "all 0.12s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#10B981"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#ECFDF5"; e.currentTarget.style.color = "#10B981"; }}>
              <CheckCircle2 size={13} />
            </button>
          )}
          {canEdit && isDone && (
            <button title="Mark pending" onClick={(e) => { e.stopPropagation(); onStatusChange(activity.id, "todo"); }}
              style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#F3F4F6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
              <RotateCcw size={12} />
            </button>
          )}
          {canEdit && (
            <button title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(activity); }}
              style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", transition: "all 0.12s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#F3F4F6"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; }}>
              <Pencil size={12} />
            </button>
          )}
          {canDelete && (
            <button title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(activity.id); }}
              style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #FECACA", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444", transition: "all 0.12s" }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── ROW 2: Assigned Employee ── */}
      {assignedPerson && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Avatar user={assignedPerson} size={18} />
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>
            {assignedPerson.full_name}
          </span>
        </div>
      )}

      {/* ── ROW 3: Activity Type badge ── */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: def.bg, color: def.color, border: `1px solid ${def.border}` }}>
          <Icon size={11} />{def.label}
        </span>
      </div>

      {/* ── ROW 4: Description ── */}
      {bodyText && bodyText !== def.label && (
        <div style={{ fontSize: 13, color: isDone ? "#94A3B8" : "#374151", marginBottom: 10, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {bodyText}
        </div>
      )}

      {/* ── ROW 5: Status + Date & Time ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: statusCfg.bg, color: statusCfg.color }}>
          {isOverdue ? <AlertCircle size={9} strokeWidth={2.5} /> : isDone ? <CheckCircle2 size={9} strokeWidth={2.5} /> : <Clock size={9} strokeWidth={2.5} />}
          {statusCfg.label}
        </span>
        {createdStr && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94A3B8" }}>
            <CalendarClock size={10} />{createdStr}
          </span>
        )}
        {entity && (
          <button
            title={`Go to ${activity.related_type}`}
            onClick={(e) => { e.stopPropagation(); if (activity.related_type === "lead") navigate(`/leads`); else if (activity.related_type === "deal") navigate(`/deals`); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", cursor: "pointer", whiteSpace: "nowrap" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#DBEAFE"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#EFF6FF"; }}>
            <Link2 size={9} />{activity.related_type === "lead" ? "Lead" : "Deal"}: {entity}<ArrowUpRight size={9} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Group Header ─────────────────────────────────────────────────────────────

function GroupHeader({ label, count, color, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "24px 0 10px" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, fontWeight: 800, color: "#111827", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      {sub && <span style={{ fontSize: 12, color: "#6B7280" }}>— {sub}</span>}
      <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}18`, borderRadius: 99, padding: "2px 9px", border: `1px solid ${color}30` }}>{count}</span>
      <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
    </div>
  );
}

// ─── Timeline View ────────────────────────────────────────────────────────────

function TimelineView({ activities, onEdit, onDelete, onStatusChange, onNew, resolveEntity, resolveEntityFull }) {
  const groups = useMemo(() => groupByTimeline(activities), [activities]);
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const tmDate = new Date(); tmDate.setDate(tmDate.getDate() + 1);
  const tmLabel = tmDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const SECTIONS = [
    { key: "overdue",   label: "Overdue",   color: "#EF4444" },
    { key: "today",     label: "Today",     color: "#3B82F6", sub: todayLabel },
    { key: "tomorrow",  label: "Tomorrow",  color: "#F59E0B", sub: tmLabel },
    { key: "upcoming",  label: "Upcoming",  color: "#8B5CF6" },
    { key: "later",     label: "Later",     color: "#6B7280" },
    { key: "yesterday", label: "Yesterday", color: "#0EA5E9" },
    { key: "earlier",   label: "Earlier",   color: "#94A3B8" },
    { key: "completed", label: "Completed", color: "#10B981" },
  ];

  if (!activities.length) return <EmptyState onNew={onNew} />;

  return (
    <div style={{ paddingBottom: 32 }}>
      {SECTIONS.map(({ key, label, color, sub }) => {
        const items = groups[key];
        if (!items?.length) return null;
        return (
          <div key={key}>
            <GroupHeader label={label} count={items.length} color={color} sub={sub} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <AnimatePresence initial={false}>
                {items.map((a) => (
                  <ActivityCard key={a.id} activity={a} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} resolveEntity={resolveEntity} resolveEntityFull={resolveEntityFull} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Toolbar Pagination (compact, matches Pipeline/Leads/Deals) ──────────────
function ToolbarPagination({ currentPage, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const end   = Math.min(totalPages, start + 4);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);
  const b  = { height: 28, minWidth: 28, padding: "0 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.12s" };
  const ba = { ...b, background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" };
  const bd = { ...b, opacity: 0.35, cursor: "not-allowed" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
      <button style={currentPage === 1 ? bd : b} disabled={currentPage === 1} onClick={() => onChange(currentPage - 1)}>‹</button>
      {start > 1 && <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 1px" }}>…</span>}
      {pages.map((p) => <button key={p} style={p === currentPage ? ba : b} onClick={() => onChange(p)}>{p}</button>)}
      {end < totalPages && <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 1px" }}>…</span>}
      <button style={currentPage === totalPages ? bd : b} disabled={currentPage === totalPages} onClick={() => onChange(currentPage + 1)}>›</button>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────

const ACT_TBL_COLS = [
  { key: "company",  label: "Company Name"      },
  { key: "contact",  label: "Contact Person"     },
  { key: "assigned", label: "Assigned Employee"  },
  { key: "type",     label: "Activity Type"      },
  { key: "desc",     label: "Description"        },
  { key: "status",   label: "Status"             },
  { key: "datetime", label: "Date & Time"        },
];
const ACT_TBL_LS = "activities_table_cols_v1";

function TableView({ activities, onEdit, onDelete, onStatusChange, resolveEntity, resolveEntityFull }) {
  const { profile } = useAuth();

  const [hiddenCols, setHiddenCols] = useState(() => {
    try { const s = localStorage.getItem(ACT_TBL_LS); return s ? new Set(JSON.parse(s)) : new Set(); }
    catch { return new Set(); }
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setColMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggleCol = (key) => setHiddenCols((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    try { localStorage.setItem(ACT_TBL_LS, JSON.stringify([...next])); } catch {}
    return next;
  });
  const isColVisible = (key) => !hiddenCols.has(key);

  if (!activities.length) return <EmptyState />;

  const TH = "#6B7280";
  const thStyle = { padding: "9px 14px", textAlign: "left", fontSize: 10.5, fontWeight: 800, color: TH, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", background: "#F9FAFB" };

  return (
    <div>
      {/* Column management bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <div ref={colMenuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setColMenuOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 12px", borderRadius: 8, background: hiddenCols.size > 0 ? "rgba(99,102,241,0.1)" : "var(--surface-2)", border: `1px solid ${hiddenCols.size > 0 ? "rgba(99,102,241,0.3)" : "var(--border)"}`, fontSize: 12, fontWeight: 600, color: hiddenCols.size > 0 ? "#6366F1" : "var(--text-2)", cursor: "pointer", fontFamily: "inherit" }}
          >
            <SlidersHorizontal size={12} /> Columns {hiddenCols.size > 0 ? `(${ACT_TBL_COLS.length - hiddenCols.size}/${ACT_TBL_COLS.length})` : ""}
          </button>
          {colMenuOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 400, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.15)", minWidth: 200, padding: "6px 0" }}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "5px 12px 7px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TH, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                <span>Columns</span>
                <button onClick={() => { setHiddenCols(new Set()); try { localStorage.removeItem(ACT_TBL_LS); } catch {} }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#6366F1", fontFamily: "inherit", fontWeight: 700 }}>Show All</button>
              </div>
              {ACT_TBL_COLS.map((col) => (
                <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", cursor: "pointer", fontSize: 13, color: isColVisible(col.key) ? "var(--text)" : TH, fontWeight: isColVisible(col.key) ? 600 : 400 }}>
                  <input type="checkbox" checked={isColVisible(col.key)} onChange={() => toggleCol(col.key)} style={{ accentColor: "#6366F1", width: 13, height: 13, cursor: "pointer" }} />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "2px solid #E5E7EB" }}>
              <th style={{ ...thStyle, width: 36, textAlign: "center" }}>#</th>
              {isColVisible("company")  && <th style={thStyle}>Company Name</th>}
              {isColVisible("contact")  && <th style={thStyle}>Contact Person</th>}
              {isColVisible("assigned") && <th style={thStyle}>Assigned Employee</th>}
              {isColVisible("type")     && <th style={thStyle}>Activity Type</th>}
              {isColVisible("desc")     && <th style={{ ...thStyle, maxWidth: 260 }}>Description</th>}
              {isColVisible("status")   && <th style={thStyle}>Status</th>}
              {isColVisible("datetime") && <th style={thStyle}>Date & Time</th>}
              <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a, idx) => {
              const def       = ACT_TYPES[typeKey(a.type)] || ACT_TYPES.task;
              const Icon      = def.icon;
              const desc      = parseJSON(a.description);
              const notes     = desc.remarks || desc.notes || desc.outcome || desc.agenda || desc.body || a.title || "";
              const isDone    = a.status === "done";
              const isOverdue = !isDone && a.due_date && new Date(a.due_date) < new Date();
              const myRank2   = ROLE_RANK[profile?.role] || 0;
              const isOwn2    = a.created_by === profile?.id || a.assigned_to === profile?.id;
              const canEdit   = isOwn2 || myRank2 >= 3;
              const canDelete = profile?.role === "owner" || profile?.role === "sales_head";
              const { company, contact } = resolveEntityFull ? resolveEntityFull(a) : { company: resolveEntity(a.related_type, a.related_id), contact: null };

              const dateStr = a.created_at
                ? new Date(a.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : null;

              return (
                <tr key={a.id} style={{ borderBottom: "1px solid #F3F4F6", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>

                  {/* # */}
                  <td style={{ padding: "10px 6px", textAlign: "center", fontSize: 11.5, color: "#9CA3AF", fontWeight: 600 }}>{idx + 1}</td>

                  {/* Company Name */}
                  {isColVisible("company") && (
                    <td style={{ padding: "10px 14px", maxWidth: 160 }}>
                      {company
                        ? <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{company}</span>
                        : <span style={{ color: "#D1D5DB", fontSize: 12 }}>—</span>}
                    </td>
                  )}

                  {/* Contact Person */}
                  {isColVisible("contact") && (
                    <td style={{ padding: "10px 14px", maxWidth: 140 }}>
                      {contact
                        ? <span style={{ fontSize: 12.5, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{contact}</span>
                        : <span style={{ color: "#D1D5DB", fontSize: 12 }}>—</span>}
                    </td>
                  )}

                  {/* Assigned Employee */}
                  {isColVisible("assigned") && (
                    <td style={{ padding: "10px 14px" }}>
                      {(a.assigned_profile || a.created_by_profile)
                        ? (() => { const p = a.assigned_profile || a.created_by_profile; return <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Avatar user={p} size={20} /><span style={{ fontSize: 12, color: "#4B5563", whiteSpace: "nowrap" }}>{p.full_name}</span></div>; })()
                        : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}

                  {/* Activity Type */}
                  {isColVisible("type") && (
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: def.bg, color: def.color, border: `1px solid ${def.border}`, whiteSpace: "nowrap" }}>
                        <Icon size={10} />{def.label}
                      </span>
                    </td>
                  )}

                  {/* Description */}
                  {isColVisible("desc") && (
                    <td style={{ padding: "10px 14px", maxWidth: 260 }}>
                      {(() => {
                        const cleaned = cleanDescription(a.title, a.type);
                        const detail  = notes && notes !== a.title ? notes : null;
                        const display = cleaned || detail || a.title;
                        return (
                          <>
                            <div style={{ fontWeight: 600, fontSize: 12.5, color: isDone ? "#9CA3AF" : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display}</div>
                            {detail && cleaned && detail !== a.title && <div style={{ fontSize: 11.5, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{detail}</div>}
                          </>
                        );
                      })()}
                    </td>
                  )}

                  {/* Status */}
                  {isColVisible("status") && (
                    <td style={{ padding: "10px 14px" }}>
                      {isOverdue
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#FEF2F2", color: "#EF4444", whiteSpace: "nowrap" }}><AlertCircle size={10} strokeWidth={2.2} />Overdue</span>
                        : <StatusBadge status={a.status || "todo"} />}
                    </td>
                  )}

                  {/* Date & Time */}
                  {isColVisible("datetime") && (
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      {dateStr
                        ? <span style={{ fontSize: 11.5, color: "#6B7280", display: "flex", alignItems: "center", gap: 4 }}><CalendarClock size={11} />{dateStr}</span>
                        : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  )}

                  {/* Actions */}
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {canEdit && !isDone && (
                        <button onClick={() => onStatusChange(a.id, "done")} title="Mark done"
                          style={{ padding: "3px 8px", border: "1.5px solid #D1FAE5", borderRadius: 7, background: "#ECFDF5", color: "#10B981", cursor: "pointer", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <CheckCircle2 size={11} /> Done
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => onEdit(a)} title="Edit"
                          style={{ padding: "3px 7px", border: "1.5px solid #E5E7EB", borderRadius: 7, background: "#FFFFFF", color: "#6B7280", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
                          <Pencil size={11} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => onDelete(a.id)} title="Delete"
                          style={{ padding: "3px 7px", border: "1.5px solid #FECACA", borderRadius: 7, background: "#FEF2F2", color: "#EF4444", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

function KanbanBoard({ activities, onEdit, onDelete, onStatusChange, resolveEntity }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, alignItems: "start", paddingBottom: 32 }}>
      {STATUSES.map((s) => {
        const Icon  = s.icon;
        const items = activities.filter((a) => (a.status || "todo") === s.key);
        return (
          <div key={s.key} style={{ background: s.bg, border: `1.5px solid ${s.color}20`, borderRadius: 14, padding: "12px 10px", minHeight: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14, padding: "0 4px" }}>
              <Icon size={14} style={{ color: s.color }} />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>{s.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: s.color, background: `${s.color}20`, borderRadius: 99, padding: "1px 7px" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((a) => {
                const def  = ACT_TYPES[typeKey(a.type)] || ACT_TYPES.task;
                const Icon2 = def.icon;
                const entity = resolveEntity(a.related_type, a.related_id);
                return (
                  <div key={a.id} style={{ background: "#FFFFFF", border: `1.5px solid #E5E7EB`, borderLeft: `3px solid ${def.color}`, borderRadius: 10, padding: "10px 11px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", cursor: "pointer" }} onClick={() => onEdit(a)}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 7 }}>
                      <Icon2 size={13} style={{ color: def.color, flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#111827", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.title}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      <PriorityBadge priority={a.priority} />
                      {a.due_date && <span style={{ fontSize: 10.5, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 2 }}><CalendarClock size={9} />{fmtDate(a.due_date)}</span>}
                    </div>
                    {entity && <div style={{ marginTop: 6, fontSize: 10.5, color: "#1D4ED8", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}><Link2 size={9} />{entity}</div>}
                  </div>
                );
              })}
              {!items.length && <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12, color: "#D1D5DB" }}>Empty</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ activities, onEdit, resolveEntity }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const firstDay  = new Date(month.year, month.month, 1);
  const lastDay   = new Date(month.year, month.month + 1, 0);
  const startDow  = firstDay.getDay();
  const daysByDate = useMemo(() => {
    const map = {};
    activities.forEach((a) => {
      if (!a.due_date) return;
      const k = a.due_date.slice(0, 10);
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    return map;
  }, [activities]);

  const weeks = [];
  const cells = Array(startDow).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthLabel = firstDay.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const todayStr   = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => setMonth((m) => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; })} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#111827", minWidth: 160, textAlign: "center" }}>{monthLabel}</span>
        <button onClick={() => setMonth((m) => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; })} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "#E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} style={{ background: "#F9FAFB", padding: "9px 4px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>{d}</div>
        ))}
        {weeks.flat().map((day, i) => {
          if (!day) return <div key={`e-${i}`} style={{ background: "#F9FAFB", minHeight: 80 }} />;
          const dateKey = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateKey === todayStr;
          const acts    = daysByDate[dateKey] || [];
          return (
            <div key={dateKey} style={{ background: "#FFFFFF", minHeight: 80, padding: "7px 6px", position: "relative" }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? "#FFFFFF" : "#374151", width: 22, height: 22, borderRadius: "50%", background: isToday ? "#3B82F6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>{day}</div>
              {acts.slice(0, 3).map((a) => {
                const def = ACT_TYPES[typeKey(a.type)] || ACT_TYPES.task;
                return (
                  <div key={a.id} onClick={() => onEdit(a)}
                    style={{ fontSize: 10, fontWeight: 600, color: def.color, background: def.bg, border: `1px solid ${def.border}`, borderRadius: 5, padding: "2px 5px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>
                    {a.title}
                  </div>
                );
              })}
              {acts.length > 3 && <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>+{acts.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── User Grouped View ────────────────────────────────────────────────────────

const ROLE_COLORS = {
  owner:         { color: "#7C3AED", bg: "#F5F3FF" },
  sales_head:    { color: "#2563EB", bg: "#EFF6FF" },
  sales_manager: { color: "#0891B2", bg: "#ECFEFF" },
  employee:      { color: "#059669", bg: "#ECFDF5" },
  inside_sales:  { color: "#D97706", bg: "#FFFBEB" },
};

function UserGroupedView({ activities, onEdit, onDelete, onStatusChange, resolveEntity }) {
  const { profile, isManager, isSalesHead } = useAuth();
  const myRank = ROLE_RANK[profile?.role] || 0;
  const [expanded, setExpanded] = useState({});

  const byUser = useMemo(() => {
    const map = {};
    activities.forEach(a => {
      const user = a.created_by_profile || { id: a.created_by || "unknown", full_name: "Unknown", role: null };
      const uid  = user.id || a.created_by || "unknown";
      if (!map[uid]) map[uid] = { user, items: [] };
      map[uid].items.push(a);
    });
    return Object.values(map).sort((a, b) => (ROLE_RANK[b.user.role] || 0) - (ROLE_RANK[a.user.role] || 0));
  }, [activities]);

  const toggle = (uid) => setExpanded(prev => ({ ...prev, [uid]: !prev[uid] }));

  if (!activities.length) return <EmptyState />;

  return (
    <div style={{ paddingBottom: 32, display: "flex", flexDirection: "column", gap: 10 }}>
      {byUser.map(({ user, items }) => {
        const uid      = user.id || "unknown";
        const isOpen   = !!expanded[uid];
        const rc       = ROLE_COLORS[user.role] || { color: "#6B7280", bg: "#F3F4F6" };
        const ROLE_NAMES_ACT = { owner: "Super Admin", sales_head: "Sales Head", sales_manager: "Sales Manager", employee: "Sales Employee", inside_sales: "Inside Sales" };
        const roleLabel = ROLE_NAMES_ACT[user.role] || (user.role || "unknown").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        const doneCount = items.filter(a => a.status === "done").length;

        const byDate = {};
        items.forEach(a => {
          const k = a.created_at ? a.created_at.slice(0, 10) : "no-date";
          if (!byDate[k]) byDate[k] = [];
          byDate[k].push(a);
        });
        const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

        return (
          <div key={uid}>
            <button
              onClick={() => toggle(uid)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: isOpen ? "#F0F7FF" : "#FFFFFF", border: `1.5px solid ${isOpen ? "#BFDBFE" : "#E5E7EB"}`, borderRadius: isOpen ? "12px 12px 0 0" : 12, cursor: "pointer", transition: "all 0.15s", textAlign: "left" }}
            >
              <Avatar user={user} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{user.full_name || "Unknown"}</div>
                <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 1 }}>
                  {items.length} {items.length === 1 ? "activity" : "activities"} · {doneCount} done
                </div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: rc.color, background: rc.bg, padding: "3px 10px", borderRadius: 99, border: `1px solid ${rc.color}20` }}>{roleLabel}</span>
              <ChevronDown size={16} style={{ color: "#9CA3AF", transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none", flexShrink: 0 }} />
            </button>

            {isOpen && (
              <div style={{ border: "1.5px solid #BFDBFE", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden", background: "#FFFFFF" }}>
                {sortedDates.map((dateKey, di) => {
                  const dateActs  = byDate[dateKey];
                  const dateLabel = dateKey === "no-date"
                    ? "No Date"
                    : new Date(dateKey + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
                  return (
                    <div key={dateKey} style={{ borderTop: di > 0 ? "1px solid #F3F4F6" : undefined }}>
                      <div style={{ padding: "7px 18px", background: "#F9FAFB", display: "flex", alignItems: "center", gap: 6 }}>
                        <CalendarClock size={11} style={{ color: "#9CA3AF" }} />
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#374151" }}>{dateLabel}</span>
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>· {dateActs.length} {dateActs.length === 1 ? "activity" : "activities"}</span>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <tbody>
                          {dateActs.map(a => {
                            const def         = ACT_TYPES[typeKey(a.type)] || ACT_TYPES.task;
                            const ActIcon     = def.icon;
                            const isDone      = a.status === "done";
                            const isOverdue   = !isDone && a.due_date && new Date(a.due_date) < new Date();
                            const entity      = resolveEntity(a.related_type, a.related_id);
                            const isOwnRow    = a.created_by === profile?.id || a.assigned_to === profile?.id;
                            const canEdit     = isOwnRow || myRank >= 3;
                            const canDelete   = profile?.role === "owner" || profile?.role === "sales_head";
                            return (
                              <tr key={a.id}
                                style={{ borderTop: "1px solid #F9FAFB", transition: "background 0.1s" }}
                                onMouseEnter={e => e.currentTarget.style.background = "#F8FAFF"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                              >
                                <td style={{ padding: "8px 18px", width: 110 }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: def.bg, color: def.color, border: `1px solid ${def.border}` }}>
                                    <ActIcon size={9} />{def.label}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 12px" }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: isDone ? "#9CA3AF" : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{a.title}</div>
                                  {entity && <div style={{ fontSize: 10.5, color: "#1D4ED8", display: "flex", alignItems: "center", gap: 2, marginTop: 1 }}><Link2 size={8} />{entity}</div>}
                                </td>
                                <td style={{ padding: "8px 12px", width: 100 }}><StatusBadge status={a.status || "todo"} /></td>
                                <td style={{ padding: "8px 12px", width: 90 }}>
                                  {a.due_date
                                    ? <span style={{ fontSize: 11, color: isOverdue ? "#EF4444" : "#9CA3AF", display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", fontWeight: isOverdue ? 700 : 400 }}><CalendarClock size={10} />{fmtDate(a.due_date)}</span>
                                    : <span style={{ color: "#D1D5DB" }}>—</span>}
                                </td>
                                <td style={{ padding: "8px 12px", width: 96 }}>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    {canEdit && !isDone && (
                                      <button onClick={() => onStatusChange(a.id, "done")} title="Mark done"
                                        style={{ width: 26, height: 26, borderRadius: 7, border: "1.5px solid #D1FAE5", background: "#ECFDF5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#10B981" }}>
                                        <CheckCircle2 size={11} />
                                      </button>
                                    )}
                                    {canEdit && (
                                      <button onClick={() => onEdit(a)}
                                        style={{ width: 26, height: 26, borderRadius: 7, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
                                        <Pencil size={11} />
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button onClick={() => onDelete(a.id)}
                                        style={{ width: 26, height: 26, borderRadius: 7, border: "1.5px solid #FECACA", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444" }}>
                                        <Trash2 size={11} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: "#F3F4F6", border: "2px dashed #D1D5DB", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <Clock size={28} style={{ color: "#D1D5DB" }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 6 }}>No activities yet</div>
      <div style={{ fontSize: 13.5, color: "#6B7280", marginBottom: 24, maxWidth: 320, margin: "0 auto 24px" }}>
        Log a call, schedule a follow-up, send an email or set a reminder to track your interactions.
      </div>
      {onNew && (
        <button onClick={() => onNew("call")} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 20px", borderRadius: 10, background: "#3B82F6", color: "#FFFFFF", fontSize: 13.5, fontWeight: 700, border: "none", cursor: "pointer" }}>
          <Plus size={15} /> Create First Activity
        </button>
      )}
    </div>
  );
}

// ─── Filter Dropdown ─────────────────────────────────────────────────────────

function FilterDropdown({ label, options, value, onChange, searchable = false, right = false }) {
  const [open,    setOpen]   = useState(false);
  const [q,       setQ]      = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) setQ("");
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const active    = !!value;
  const activeOpt = options.find((o) => o.key === value);
  const shown     = searchable && q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 10px 0 12px",
          borderRadius: 9, border: `1.5px solid ${active ? "#3B82F6" : "#E5E7EB"}`,
          background: active ? "#EFF6FF" : "#FFFFFF",
          color: active ? "#1D4ED8" : "#6B7280",
          fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: "pointer",
          whiteSpace: "nowrap", transition: "all 0.15s",
        }}
        onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = "#D1D5DB"; e.currentTarget.style.background = "#F9FAFB"; } }}
        onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#FFFFFF"; } }}
      >
        {activeOpt?.icon && (() => { const I = activeOpt.icon; return <I size={12} style={{ color: activeOpt.color || "#3B82F6", flexShrink: 0 }} />; })()}
        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
          {active && activeOpt ? activeOpt.label : label}
        </span>
        {active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3B82F6", flexShrink: 0 }} />}
        <ChevronDown size={11} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)",
          left: right ? "auto" : 0, right: right ? 0 : "auto",
          background: "#FFFFFF", border: "1.5px solid #E5E7EB", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.13)", zIndex: 300,
          minWidth: 210, maxHeight: 320,
          display: "flex", flexDirection: "column",
        }}>
          {searchable && (
            <div style={{ padding: "8px 10px", borderBottom: "1px solid #F3F4F6", flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input
                  autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  style={{ width: "100%", paddingLeft: 26, height: 30, borderRadius: 7, border: "1.5px solid #E5E7EB", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>
          )}
          <div style={{ overflowY: "auto", padding: 6 }}>
            <button
              onClick={() => { onChange(""); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 8, border: "none", background: !value ? "#EFF6FF" : "transparent", color: !value ? "#1D4ED8" : "#6B7280", fontSize: 12.5, fontWeight: !value ? 700 : 400, cursor: "pointer", textAlign: "left" }}
              onMouseEnter={(e) => { if (value) e.currentTarget.style.background = "#F9FAFB"; }}
              onMouseLeave={(e) => { if (value) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ flex: 1 }}>All</span>
              {!value && <CheckCheck size={12} style={{ color: "#3B82F6" }} />}
            </button>
            {shown.map((opt) => {
              const isOn  = value === opt.key;
              const OIcon = opt.icon;
              return (
                <button key={opt.key}
                  onClick={() => { onChange(isOn ? "" : opt.key); setOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 8, border: "none", background: isOn ? (opt.bg || "#EFF6FF") : "transparent", color: isOn ? (opt.color || "#1D4ED8") : "#374151", fontSize: 12.5, fontWeight: isOn ? 700 : 400, cursor: "pointer", textAlign: "left", transition: "background 0.1s" }}
                  onMouseEnter={(e) => { if (!isOn) e.currentTarget.style.background = "#F9FAFB"; }}
                  onMouseLeave={(e) => { if (!isOn) e.currentTarget.style.background = "transparent"; }}
                >
                  {OIcon && (
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: isOn ? (opt.color + "20") : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <OIcon size={11} style={{ color: isOn ? opt.color : "#9CA3AF" }} />
                    </div>
                  )}
                  {opt.avatar && <div style={{ flexShrink: 0 }}><Avatar user={opt.avatar} size={20} /></div>}
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.label}</span>
                  {opt.desc && !isOn && <span style={{ fontSize: 10, color: "#D1D5DB", whiteSpace: "nowrap", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>{opt.desc}</span>}
                  {isOn && <CheckCheck size={12} style={{ flexShrink: 0, color: opt.color || "#3B82F6" }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter Panel (legacy sidebar — kept but unused; inline dropdowns are primary) ──────

function FilterPanel({ filters, onChange, smartFilter, onSmartFilter, teamMembers, onClose }) {
  const activeCount = Object.values(filters).filter(Boolean).length + (smartFilter ? 1 : 0);

  const clearAll = () => {
    onChange({ status: "", priority: "", assignedTo: "" });
    onSmartFilter("");
  };

  const SectionLabel = ({ label }) => (
    <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", marginBottom: 7, marginTop: 4 }}>{label}</div>
  );

  const FilterBtn = ({ icon: Icon, label, desc, color, bg, active, onClick }) => (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${active ? color + "40" : "transparent"}`, background: active ? bg : "transparent", color: active ? color : "#374151", fontSize: 12.5, fontWeight: active ? 700 : 400, cursor: "pointer", marginBottom: 2, transition: "all 0.12s", textAlign: "left" }}>
      <div style={{ width: 22, height: 22, borderRadius: 7, background: active ? color + "18" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={11} style={{ color: active ? color : "#9CA3AF" }} />
      </div>
      <span style={{ flex: 1, lineHeight: 1.3 }}>{label}</span>
      {desc && !active && <span style={{ fontSize: 10, color: "#D1D5DB", textAlign: "right", maxWidth: 80, lineHeight: 1.2 }}>{desc}</span>}
      {active && <CheckCheck size={11} style={{ color, flexShrink: 0 }} />}
    </button>
  );

  return createPortal(
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} exit={{ opacity: 0 }}
        style={{ position: "fixed", inset: 0, background: "#000", zIndex: 399 }}
        onClick={onClose} />
      <motion.div
        initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 300, background: "#FFFFFF", borderLeft: "1px solid #E5E7EB", zIndex: 400, overflowY: "auto", boxShadow: "-6px 0 32px rgba(0,0,0,0.12)" }}
      >
        {/* Header */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#FFFFFF", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SlidersHorizontal size={15} style={{ color: "#6366F1" }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>Filters</span>
            {activeCount > 0 && (
              <span style={{ fontSize: 10.5, background: "#6366F1", color: "#fff", borderRadius: 99, padding: "1px 8px", fontWeight: 700 }}>{activeCount} active</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {activeCount > 0 && (
              <button onClick={clearAll}
                style={{ fontSize: 11.5, color: "#EF4444", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontWeight: 700 }}>
                Clear all
              </button>
            )}
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}><X size={14} /></button>
          </div>
        </div>

        <div style={{ padding: "14px 14px 24px" }}>

          {/* ── Quick Filters ── */}
          <SectionLabel label="Quick Filters" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 18 }}>
            {SMART_FILTERS.map((sf) => {
              const on   = smartFilter === sf.key;
              const Icon = sf.icon;
              return (
                <button key={sf.key} onClick={() => onSmartFilter(on ? "" : sf.key)}
                  title={sf.desc}
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${on ? sf.color + "50" : "#E5E7EB"}`, background: on ? sf.bg : "#FAFAFA", cursor: "pointer", transition: "all 0.12s", textAlign: "left", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
                    <Icon size={12} style={{ color: on ? sf.color : "#9CA3AF", flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, fontWeight: on ? 700 : 500, color: on ? sf.color : "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sf.label}</span>
                    {on && <CheckCheck size={10} style={{ color: sf.color, flexShrink: 0 }} />}
                  </div>
                  <span style={{ fontSize: 9.5, color: "#9CA3AF", lineHeight: 1.2 }}>{sf.desc}</span>
                </button>
              );
            })}
          </div>

          {/* ── Status ── */}
          <div style={{ height: 1, background: "#F3F4F6", margin: "2px 0 14px" }} />
          <SectionLabel label="Status" />
          {FILTER_STATUSES.map((s) => {
            const on = filters.status === s.key;
            return (
              <FilterBtn key={s.key} icon={s.icon} label={s.label} desc={s.desc} color={s.color} bg={s.bg}
                active={on} onClick={() => onChange({ ...filters, status: on ? "" : s.key })} />
            );
          })}

          {/* ── Priority ── */}
          <div style={{ height: 1, background: "#F3F4F6", margin: "12px 0 14px" }} />
          <SectionLabel label="Priority" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 4 }}>
            {PRIORITIES.map((p) => {
              const on = filters.priority === p.key;
              return (
                <button key={p.key} onClick={() => onChange({ ...filters, priority: on ? "" : p.key })}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${on ? p.color + "40" : "#E5E7EB"}`, background: on ? p.color + "12" : "#FAFAFA", color: on ? p.color : "#374151", fontSize: 12, fontWeight: on ? 700 : 400, cursor: "pointer", transition: "all 0.12s" }}>
                  <Flag size={11} fill={on ? p.color : "#D1D5DB"} style={{ color: on ? p.color : "#D1D5DB", flexShrink: 0 }} />
                  {p.label}
                  {on && <CheckCheck size={10} style={{ marginLeft: "auto", color: p.color }} />}
                </button>
              );
            })}
          </div>

          {/* ── Assigned To ── */}
          {teamMembers.length > 0 && (
            <>
              <div style={{ height: 1, background: "#F3F4F6", margin: "12px 0 14px" }} />
              <SectionLabel label="Assigned To" />
              {teamMembers.map((m) => {
                const on = filters.assignedTo === m.id;
                return (
                  <FilterBtn key={m.id}
                    icon={() => <Avatar user={m} size={14} />}
                    label={m.full_name?.split(" ")[0]}
                    color="#3B82F6" bg="#EFF6FF"
                    active={on}
                    onClick={() => onChange({ ...filters, assignedTo: on ? "" : m.id })} />
                );
              })}
            </>
          )}
        </div>
      </motion.div>
    </>,
    document.body
  );
}

// ─── Activity Modal ───────────────────────────────────────────────────────────

function ActivityModal({ activity, defaultType = "task", onClose, onSave, teamMembers, leads, deals }) {
  const isEdit = !!activity;
  const desc   = parseJSON(activity?.description);

  const [type,       setType]       = useState(isEdit ? typeKey(activity?.type) : defaultType);
  const [title,      setTitle]      = useState(activity?.title || "");
  const [notes,      setNotes]      = useState(desc.notes || desc.remarks || desc.outcome || desc.body || "");
  const [status,     setStatus]     = useState(activity?.status || "todo");
  const [priority,   setPriority]   = useState(activity?.priority || "medium");
  const [dueDate,    setDueDate]    = useState(activity?.due_date ? activity.due_date.slice(0, 10) : "");
  const [assignedTo, setAssignedTo] = useState(activity?.assigned_to || "");
  const [relType,    setRelType]    = useState(activity?.related_type || "");
  const [relId,      setRelId]      = useState(activity?.related_id || "");

  const [callType,    setCallType]    = useState(activity?.type || "Cold Call");
  const [contactNo,   setContactNo]   = useState(desc.contact_no || "");
  const [contactName, setContactName] = useState(desc.name || "");
  const [email,       setEmail]       = useState(desc.email || "");
  const [designation, setDesig]       = useState(desc.designation || "");
  const [response,    setResponse]    = useState(desc.response || "");

  const [attendees, setAttendees] = useState(desc.attendees || "");
  const [location,  setLocation]  = useState(desc.location || "");
  const [agenda,    setAgenda]    = useState(desc.agenda || "");

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    let dbType = type;
    let description = toJSON({ notes });

    if (type === "call" || type === "follow_up_call" || type === "follow_up_email") {
      description = toJSON({ call_sub_type: callType, contact_no: contactNo, name: contactName, email, designation, response, remarks: notes });
    } else if (type === "meeting_virtual" || type === "meeting_person" || type === "meeting") {
      description = toJSON({ attendees, location, agenda, outcome: notes });
    } else if (type === "followup") {
      dbType      = "follow_up";
      description = toJSON({ notes });
    } else if (type === "email") {
      description = toJSON({ to: email, status: "Sent", body: notes });
    } else if (type === "reminder") {
      description = toJSON({ notes });
    }

    const payload = {
      title: title.trim(), type: dbType, description,
      status, priority,
      due_date: dueDate || null,
      assigned_to: assignedTo || null,
      related_type: relType || null,
      related_id: relId || null,
    };
    try { await onSave(payload); } finally { setSaving(false); }
  };

  const def = ACT_TYPES[type] || ACT_TYPES.task;
  const relOptions = relType === "lead" ? leads : relType === "deal" ? deals : [];

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 14 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 600, maxHeight: "92vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#FFFFFF", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: def.bg, border: `1.5px solid ${def.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {(() => { const Icon = def.icon; return <Icon size={15} style={{ color: def.color }} />; })()}
            </div>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: "#111827" }}>{isEdit ? "Edit Activity" : "New Activity"}</div>
              <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 1 }}>Fill in the details below</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}><X size={15} /></button>
        </div>

        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Type selector */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9CA3AF", display: "block", marginBottom: 8 }}>Activity Type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {DISPLAY_TYPES.map((key) => {
                const d      = ACT_TYPES[key];
                const Icon   = d.icon;
                const active = type === key;
                return (
                  <button key={key} onClick={() => setType(key)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 9, border: `1.5px solid ${active ? d.color : "#E5E7EB"}`, background: active ? d.bg : "#FFFFFF", color: active ? d.color : "#6B7280", fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: "pointer", transition: "all 0.12s" }}>
                    <Icon size={12} />{d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="crm-label">Title *</label>
            <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${def.label} title…`} autoFocus />
          </div>

          {/* Call-specific fields */}
          {(type === "call" || type === "follow_up_call" || type === "follow_up_email") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="crm-label">Call Type</label>
                <select className="crm-input" value={callType} onChange={(e) => setCallType(e.target.value)}>
                  {CALL_SUB_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="crm-label">Contact No.</label><input className="crm-input" value={contactNo} onChange={(e) => setContactNo(e.target.value)} placeholder="+91 98765 43210" /></div>
              <div><label className="crm-label">Contact Name</label><input className="crm-input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Doe" /></div>
              <div><label className="crm-label">Email</label><input className="crm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@acme.com" /></div>
              <div><label className="crm-label">Designation</label><input className="crm-input" value={designation} onChange={(e) => setDesig(e.target.value)} placeholder="CTO" /></div>
              <div>
                <label className="crm-label">Response</label>
                <select className="crm-input" value={response} onChange={(e) => setResponse(e.target.value)}>
                  <option value="">Select response</option>
                  {CALL_RESPONSES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Meeting-specific fields */}
          {(type === "meeting" || type === "meeting_virtual" || type === "meeting_person") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label className="crm-label">Attendees</label><input className="crm-input" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="John, Priya, Rahul" /></div>
              <div><label className="crm-label">Location / Link</label><input className="crm-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Zoom / Room 3" /></div>
              <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Agenda</label><textarea className="crm-input" value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={2} style={{ resize: "vertical" }} placeholder="Topics to cover…" /></div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="crm-label">{type === "note" ? "Note Content" : type === "email" ? "Email Body" : "Notes / Remarks"}</label>
            <textarea className="crm-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ resize: "vertical" }} placeholder="Add details…" />
          </div>

          {/* Status / Priority / Due Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label className="crm-label">Status</label>
              <select className="crm-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Priority</label>
              <select className="crm-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Due Date</label>
              <input className="crm-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Assigned To + Link To */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="crm-label">Assigned To</label>
              <select className="crm-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Link To</label>
              <select className="crm-input" value={relType} onChange={(e) => { setRelType(e.target.value); setRelId(""); }}>
                <option value="">None</option>
                <option value="lead">Lead</option>
                <option value="deal">Deal</option>
              </select>
            </div>
          </div>

          {relType && (
            <div>
              <label className="crm-label">{relType === "lead" ? "Select Lead" : "Select Deal"}</label>
              <select className="crm-input" value={relId} onChange={(e) => setRelId(e.target.value)}>
                <option value="">Select…</option>
                {relOptions.map((r) => <option key={r.id} value={r.id}>{r.company_name || r.title || r.contact_name}</option>)}
              </select>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4, borderTop: "1px solid #F3F4F6", marginTop: 4 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: "9px 18px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !title.trim()} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: saving || !title.trim() ? "#E5E7EB" : def.color, color: saving || !title.trim() ? "#9CA3AF" : "#FFFFFF", fontSize: 13.5, fontWeight: 700, cursor: saving || !title.trim() ? "not-allowed" : "pointer", transition: "all 0.15s" }}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Activity"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Email Activities Component ───────────────────────────────────────────────

function EmailActivities({ profile }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ company_name: "", contact_name: "", designation: "", email_id: "", linkedin_url: "" });
  const [search, setSearch] = useState("");
  const fileRef = useRef();

  const { data: emailActs = [], isLoading } = useQuery({
    queryKey: ["email-activities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*, created_by_profile:profiles!activities_created_by_fkey(full_name)")
        .eq("type", "email_contact")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const parseExtra = (desc) => { try { return desc ? JSON.parse(desc) : {}; } catch { return {}; } };

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from("activities").insert({
        type: "email_contact",
        title: payload.company_name,
        description: JSON.stringify(payload),
        user_id: profile?.id,
        created_by: profile?.id,
        status: "todo",
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-activities"] });
      toast.success("Email contact added");
      setShowForm(false);
      setForm({ company_name: "", contact_name: "", designation: "", email_id: "", linkedin_url: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-activities"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const downloadTemplate = () => {
    const csv = "Company Name,Contact Name,Designation,Email ID,LinkedIn URL\n,,,,\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "email-activity-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCSV = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Only CSV files"); e.target.value = ""; return; }
    const text = await file.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast.error("No data rows found"); e.target.value = ""; return; }
    const rawHeaders = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, ""));
    const headerMap = { company_name: rawHeaders.findIndex(h => h.includes("company")), contact_name: rawHeaders.findIndex(h => h.includes("contact")), designation: rawHeaders.findIndex(h => h.includes("design")), email_id: rawHeaders.findIndex(h => h.includes("email")), linkedin_url: rawHeaders.findIndex(h => h.includes("linked")) };
    let ok = 0, fail = 0;
    for (const line of lines.slice(1)) {
      const vals = line.split(",").map(v => v.trim());
      const payload = {
        company_name: headerMap.company_name >= 0 ? vals[headerMap.company_name] || "" : "",
        contact_name: headerMap.contact_name >= 0 ? vals[headerMap.contact_name] || "" : "",
        designation:  headerMap.designation  >= 0 ? vals[headerMap.designation]  || "" : "",
        email_id:     headerMap.email_id     >= 0 ? vals[headerMap.email_id]     || "" : "",
        linkedin_url: headerMap.linkedin_url >= 0 ? vals[headerMap.linkedin_url] || "" : "",
      };
      if (!payload.company_name && !payload.email_id) continue;
      const { error } = await supabase.from("activities").insert({ type: "email_contact", title: payload.company_name || payload.email_id, description: JSON.stringify(payload), user_id: profile?.id, created_by: profile?.id, status: "todo" });
      if (error) fail++; else ok++;
    }
    qc.invalidateQueries({ queryKey: ["email-activities"] });
    toast.success(`Imported ${ok} contacts${fail ? `, ${fail} failed` : ""}`);
    e.target.value = "";
  };

  const filtered = emailActs.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    const ex = parseExtra(a.description);
    return (ex.company_name || "").toLowerCase().includes(q) || (ex.contact_name || "").toLowerCase().includes(q) || (ex.email_id || "").toLowerCase().includes(q);
  });

  const FIELDS = [
    { key: "company_name",  label: "Company Name",  required: true },
    { key: "contact_name",  label: "Contact Person" },
    { key: "designation",   label: "Designation"    },
    { key: "email_id",      label: "Email ID",      type: "email" },
    { key: "linkedin_url",  label: "LinkedIn URL"   },
  ];

  return (
    <div style={{ padding: "0 0 32px" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 240px" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…" style={{ paddingLeft: 30, height: 36, width: "100%", borderRadius: 9, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#FFFFFF", boxSizing: "border-box", outline: "none" }} />
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={downloadTemplate} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Download size={13} /> Template
        </button>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "1.5px solid #6366F1", background: "#EEF2FF", color: "#4F46E5", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Upload size={13} /> Upload CSV
        </button>
        <button onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 9, border: "none", background: "#111827", color: "#FFFFFF", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={13} /> Add Email Contact
        </button>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 12, border: "1.5px solid #E5E7EB", overflow: "hidden", background: "#FFFFFF" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1.5px solid #E5E7EB" }}>
              {["#", "Company", "Contact", "Designation", "Email", "LinkedIn", "Added By", "Date", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11.5, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 48, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No email contacts yet. Add manually or upload a CSV.</td></tr>
            ) : filtered.map((a, idx) => {
              const ex = parseExtra(a.description);
              return (
                <tr key={a.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#111827" }}>{ex.company_name || "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13, color: "#374151" }}>{ex.contact_name || "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280" }}>{ex.designation || "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>
                    {ex.email_id ? <a href={`mailto:${ex.email_id}`} style={{ color: "#3B82F6", textDecoration: "none" }}>{ex.email_id}</a> : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>
                    {ex.linkedin_url ? <a href={ex.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: "#0A66C2", fontWeight: 600, fontSize: 11 }}>View</a> : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280" }}>{a.created_by_profile?.full_name || "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 11.5, color: "#9CA3AF" }}>{a.created_at ? new Date(a.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <button onClick={() => { if (window.confirm("Delete this contact?")) deleteMutation.mutate(a.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 4 }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>{filtered.length} contact{filtered.length !== 1 ? "s" : ""}</div>}

      {/* Add form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              style={{ background: "#FFFFFF", borderRadius: 16, padding: 28, width: 440, maxWidth: "94vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#111827" }}>Add Email Contact</h3>
                <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}><X size={18} /></button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {FIELDS.map(f => (
                  <div key={f.key}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>
                      {f.label}{f.required && <span style={{ color: "#EF4444" }}> *</span>}
                    </label>
                    <input
                      type={f.type || "text"}
                      value={form[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width: "100%", height: 38, borderRadius: 9, border: "1.5px solid #E5E7EB", padding: "0 12px", fontSize: 13, boxSizing: "border-box", outline: "none" }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
                <button onClick={() => setShowForm(false)} style={{ padding: "8px 18px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button
                  onClick={() => { if (!form.company_name) { toast.error("Company name is required"); return; } createMutation.mutate(form); }}
                  disabled={createMutation.isPending}
                  style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: "#111827", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {createMutation.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Views ────────────────────────────────────────────────────────────────────

const VIEWS = [
  { key: "timeline", label: "List View",  icon: LayoutList },
  { key: "table",    label: "Table View", icon: Table2     },
];

const STATUS_TABS = [
  { key: "all",       label: "All"        },
  { key: "mine",      label: "Mine"       },
  { key: "pending",   label: "Pending"    },
  { key: "overdue",   label: "Overdue"    },
  { key: "followups", label: "Follow-ups" },
  { key: "meetings",  label: "Meetings"   },
  { key: "completed", label: "Done"       },
];

export default function Activities() {
  const { profile, isFieldUser, isSalesHead } = useAuth();
  const qc          = useQueryClient();

  const [activeModule,     setActiveModule]     = useState("tasks"); // "tasks" | "email" | "targets"
  const [view,             setView]             = useState("timeline");
  const [search,           setSearch]           = useState("");
  const [typeFilter,       setTypeFilter]       = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all"); // "all" | "mine"
  const [statusFilter,     setStatusFilter]     = useState(""); // "" | "pending" | "in_progress" | "overdue" | "upcoming" | "done"
  const [priorityFilter,   setPriorityFilter]   = useState("");
  const [assignedFilter,   setAssignedFilter]   = useState("");
  const [quickFilter,      setQuickFilter]      = useState("");
  const [showModal,        setShowModal]        = useState(false);
  const [editActivity,     setEditActivity]     = useState(null);
  const [defaultType,      setDefaultType]      = useState("follow_up_call");

  const { data: _allActivities = [], isLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: actService.getAll,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  // Exclude email_contact entries from the tasks/activities view
  const activities = _allActivities.filter(a => a.type !== "email_contact");
  const { data: teamRaw  } = useQuery({ queryKey: ["team-all"],    queryFn: () => teamService.getAll() });
  const { data: leadsRaw } = useQuery({ queryKey: ["leads-light"], queryFn: () => leadsService.getAll({ limit: 300 }) });
  const { data: dealsRaw } = useQuery({ queryKey: ["deals-light"], queryFn: () => dealsService.getAll({ limit: 300 }) });

  const teamMembers = teamRaw?.data || teamRaw || [];
  const leads       = leadsRaw?.data || [];
  const deals       = dealsRaw?.data || [];

  const resolveEntity = useCallback((relType, relId) => {
    if (!relType || !relId) return null;
    if (relType === "lead") {
      const l = leads.find((x) => x.id === relId);
      return l ? (l.company_name || l.contact_name) : null;
    }
    if (relType === "deal") {
      const d = deals.find((x) => x.id === relId);
      return d ? (d.company_name || d.title) : null;
    }
    return null;
  }, [leads, deals]);

  const resolveEntityFull = useCallback((a) => {
    // Primary: use directly-joined data already on the activity row (fastest, always correct)
    if (a.lead) {
      const extra = (() => { try { return a.lead.other_notes ? JSON.parse(a.lead.other_notes) : {}; } catch { return {}; } })();
      const contacts = Array.isArray(extra.people_contacts) ? extra.people_contacts : [];
      const poc = contacts.find((p) => p.is_primary) || contacts[0];
      return { company: a.lead.company_name || null, contact: poc?.name || a.lead.contact_name || null };
    }
    if (a.deal) {
      return { company: a.deal.company_name || a.deal.title || null, contact: a.deal.contact_name || null };
    }
    // Fallback: look up from loaded leads/deals arrays
    const relType = a.related_type;
    const relId   = a.related_id || a.lead_id || a.deal_id;
    if (!relId) return { company: null, contact: null };
    if (relType === "lead" || a.lead_id) {
      const id = a.lead_id || relId;
      const l  = leads.find((x) => x.id === id);
      if (l) {
        const extra = (() => { try { return l.other_notes ? JSON.parse(l.other_notes) : {}; } catch { return {}; } })();
        const contacts = Array.isArray(extra.people_contacts) ? extra.people_contacts : [];
        const poc = contacts.find((p) => p.is_primary) || contacts[0];
        return { company: l.company_name || null, contact: poc?.name || l.contact_name || null };
      }
    }
    if (relType === "deal" || a.deal_id) {
      const id = a.deal_id || relId;
      const d  = deals.find((x) => x.id === id);
      if (d) return { company: d.company_name || d.title || null, contact: d.contact_name || null };
    }
    return { company: null, contact: null };
  }, [leads, deals]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["activities"] });

  // Real-time subscription — refresh when any activity changes
  useEffect(() => {
    const ch = supabase
      .channel("activities-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
        qc.invalidateQueries({ queryKey: ["activities"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const createMutation = useMutation({
    mutationFn: (payload) => actService.create({ ...payload, user_id: profile?.id, created_by: profile?.id }),
    onSuccess: async (data, variables) => {
      invalidate();
      if (variables.type === "Proposal Sent" && variables.related_type === "deal" && variables.related_id) {
        await supabase.from("deals").update({ stage: "proposal_sent", updated_at: new Date().toISOString() }).eq("id", variables.related_id);
        qc.invalidateQueries({ queryKey: ["deals-all"] });
        qc.invalidateQueries({ queryKey: ["deals"] });
        toast.success("Activity created · Deal moved to Proposal Sent");
      } else {
        toast.success("Activity created");
      }
      setShowModal(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }) => actService.update(id, payload),
    onSuccess: () => { invalidate(); toast.success("Activity updated"); setEditActivity(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: actService.delete,
    onSuccess: () => { invalidate(); toast.success("Activity deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = useCallback((payload) => {
    if (editActivity) {
      // Auto-advance status: if assigned user updates a "todo" activity → move to "in_progress"
      const isAssignedUser = editActivity.assigned_to === profile?.id;
      const autoStatus = isAssignedUser && (!editActivity.status || editActivity.status === "todo") && !payload.status
        ? { status: "in_progress" } : {};
      return updateMutation.mutateAsync({ id: editActivity.id, ...payload, ...autoStatus });
    }
    return createMutation.mutateAsync(payload);
  }, [editActivity, profile?.id, updateMutation, createMutation]);
  const handleDelete       = useCallback((id) => { if (window.confirm("Delete this activity?")) deleteMutation.mutate(id); }, [deleteMutation]);
  const handleEdit         = useCallback((a) => setEditActivity(a), []);
  const handleStatusChange = useCallback((id, status) => updateMutation.mutate({ id, status, updated_at: new Date().toISOString() }), [updateMutation]);
  const openNew            = useCallback((type) => { setDefaultType(type); setEditActivity(null); setShowModal(true); }, []);

  const now = new Date();

  const isOwnerOrHead = profile?.role === "owner" || profile?.role === "sales_head";

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const sevenDays  = new Date(now); sevenDays.setDate(now.getDate() + 7); sevenDays.setHours(23,59,59,999);
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);
    const last24h    = new Date(now); last24h.setHours(now.getHours() - 24);

    const FOLLOW_UP_TYPES    = ["follow_up_call", "follow_up_email", "follow_up", "followup"];
    const MEETING_TYPES      = ["meeting_virtual", "meeting_person", "meeting", "virtual_meeting"];
    const CALL_TYPES         = ["call", "follow_up_call", "phone_call"];
    const PIPELINE_CHG_TYPES = ["stage_change", "deal_created"];

    return activities.filter((a) => {
      const tk = typeKey(a.type);

      // Search
      if (q && !a.title?.toLowerCase().includes(q) && !a.type?.toLowerCase().includes(q)) return false;

      // Type
      if (typeFilter && tk !== typeFilter) return false;

      // Priority
      if (priorityFilter && (a.priority || "medium") !== priorityFilter) return false;

      // Assigned to
      if (assignedFilter && a.assigned_to !== assignedFilter && a.created_by !== assignedFilter) return false;

      // Visibility
      if (visibilityFilter === "mine") {
        if (a.created_by !== profile?.id && a.user_id !== profile?.id && a.assigned_to !== profile?.id) return false;
      }

      // Status
      if (statusFilter) {
        if      (statusFilter === "overdue")     { if (a.status === "done" || !a.due_date || new Date(a.due_date) >= now) return false; }
        else if (statusFilter === "upcoming")    { if (a.status === "done" || !a.due_date || new Date(a.due_date) < now || new Date(a.due_date) > sevenDays) return false; }
        else if (statusFilter === "pending")     { if (a.status === "done") return false; }
        else if (statusFilter === "done")        { if (a.status !== "done") return false; }
        else                                     { if ((a.status || "todo") !== statusFilter) return false; }
      }

      // Quick filters
      if (quickFilter) {
        if      (quickFilter === "today")            { if (!((a.due_date && new Date(a.due_date) >= todayStart && new Date(a.due_date) <= todayEnd) || (a.created_at && new Date(a.created_at) >= todayStart))) return false; }
        else if (quickFilter === "meetings_today")   { if (!MEETING_TYPES.includes(tk) || !(a.due_date && new Date(a.due_date) >= todayStart && new Date(a.due_date) <= todayEnd)) return false; }
        else if (quickFilter === "meetings_all")     { if (!MEETING_TYPES.includes(tk)) return false; }
        else if (quickFilter === "follow_ups_due")   { if (!FOLLOW_UP_TYPES.includes(tk) || a.status === "done") return false; }
        else if (quickFilter === "calls")            { if (!CALL_TYPES.includes(tk)) return false; }
        else if (quickFilter === "high_priority")    { if (!["high", "urgent"].includes(a.priority)) return false; }
        else if (quickFilter === "lead_updates")     { if (a.related_type !== "lead") return false; }
        else if (quickFilter === "deal_updates")     { if (a.related_type !== "deal") return false; }
        else if (quickFilter === "recent")           { if (!a.created_at || new Date(a.created_at) < last24h) return false; }
        else if (quickFilter === "pipeline_changes") { if (!PIPELINE_CHG_TYPES.includes(tk)) return false; }
      }

      return true;
    });
  }, [activities, search, typeFilter, priorityFilter, assignedFilter, visibilityFilter, statusFilter, quickFilter, profile?.id]);

  // ── Table View Pagination ──────────────────────────────────────────────────
  const ACT_PAGE_SIZE = 30;
  const [actPage, setActPage] = useState(1);
  useEffect(() => { setActPage(1); }, [search, typeFilter, priorityFilter, assignedFilter, visibilityFilter, statusFilter, quickFilter]);
  const actTotalPages = Math.ceil(filtered.length / ACT_PAGE_SIZE);
  const pagedFiltered = view === "table" ? filtered.slice((actPage - 1) * ACT_PAGE_SIZE, actPage * ACT_PAGE_SIZE) : filtered;

  const overdueCount = activities.filter((a) => a.due_date && new Date(a.due_date) < now && a.status !== "done").length;
  const todayCount   = activities.filter((a) => a.due_date && new Date(a.due_date).toDateString() === now.toDateString() && a.status !== "done").length;
  const doneCount    = activities.filter((a) => a.status === "done").length;
  const pendingCount = activities.filter((a) => a.status !== "done").length;

  const activeFiltersCount = [
    visibilityFilter !== "all",
    statusFilter,
    typeFilter,
    priorityFilter,
    assignedFilter,
    quickFilter,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setVisibilityFilter("all");
    setStatusFilter("");
    setTypeFilter("");
    setPriorityFilter("");
    setAssignedFilter("");
    setQuickFilter("");
    setSearch("");
  };

  return (
    <div style={{ padding: "20px 24px", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Module tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, flexShrink: 0, background: "#F3F4F6", padding: 4, borderRadius: 12, alignSelf: "flex-start" }}>
        {[
          { key: "tasks",   label: "Activities", icon: Activity },
          { key: "email",   label: "Emails",     icon: Mail     },
          { key: "targets", label: "Targets",    icon: Target   },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveModule(key)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: activeModule === key ? 700 : 500, background: activeModule === key ? "#FFFFFF" : "transparent", color: activeModule === key ? "#111827" : "#6B7280", boxShadow: activeModule === key ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all 0.15s" }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ── Email Activities Module ── */}
      {activeModule === "email" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: "#111827", letterSpacing: "-0.03em" }}>Email Activities</h1>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#6B7280" }}>Track email outreach contacts and campaigns</p>
          </div>
          <EmailActivities profile={profile} />
        </div>
      )}

      {/* ── Targets Module ── */}
      {activeModule === "targets" && (
        <div style={{ flex: 1, overflowY: "auto", marginLeft: -24, marginRight: -24, paddingLeft: 24, paddingRight: 24 }}>
          <Targets />
        </div>
      )}

      {/* ── Tasks & Activities Module ── */}
      {activeModule === "tasks" && <>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>{activities.length} total · {pendingCount} pending · {doneCount} completed</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {[
            { label: "Overdue", value: overdueCount, color: "#EF4444", bg: "#FEF2F2", border: "#FECACA" },
            { label: "Today",   value: todayCount,   color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE" },
            { label: "Done",    value: doneCount,    color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0" },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} style={{ padding: "6px 14px", background: bg, border: `1.5px solid ${border}`, borderRadius: 11, textAlign: "center", minWidth: 56 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 1 }}>{label}</div>
            </div>
          ))}
          {isOwnerOrHead && (
            <button
              onClick={() => openNew("follow_up_call")}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 18px", height: 38, borderRadius: 10, background: "#111827", color: "#FFFFFF", fontSize: 13.5, fontWeight: 700, border: "none", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#1F2937"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#111827"; }}
            >
              <Plus size={15} /> Add Activity
            </button>
          )}
        </div>
      </div>

      {/* ── Dropdown Filter Bar ── */}
      <div style={{ flexShrink: 0, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>

          {/* Visibility */}
          <FilterDropdown
            label="Visibility"
            options={[{ key: "mine", label: "Mine", icon: Users, color: "#6366F1", bg: "#EEF2FF" }]}
            value={visibilityFilter === "mine" ? "mine" : ""}
            onChange={(v) => setVisibilityFilter(v || "all")}
          />

          {/* Status */}
          <FilterDropdown
            label="Status"
            options={FILTER_STATUSES.map((s) => ({ key: s.key, label: s.label, icon: s.icon, color: s.color, bg: s.bg }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />

          {/* Activity Type */}
          <FilterDropdown
            label="Type"
            options={DISPLAY_TYPES.map((key) => ({ key, label: ACT_TYPES[key].label, icon: ACT_TYPES[key].icon, color: ACT_TYPES[key].color, bg: ACT_TYPES[key].bg }))}
            value={typeFilter}
            onChange={setTypeFilter}
          />

          {/* Priority */}
          <FilterDropdown
            label="Priority"
            options={PRIORITIES.map((p) => ({ key: p.key, label: p.label, icon: Flag, color: p.color, bg: `${p.color}12` }))}
            value={priorityFilter}
            onChange={setPriorityFilter}
          />

          {/* Quick Filters */}
          <FilterDropdown
            label="Quick Filters"
            options={SMART_FILTERS.map((sf) => ({ key: sf.key, label: sf.label, icon: sf.icon, color: sf.color, bg: sf.bg, desc: sf.desc }))}
            value={quickFilter}
            onChange={setQuickFilter}
          />

          {/* Assigned To — owner / sales_head only */}
          {isOwnerOrHead && teamMembers.length > 0 && (
            <FilterDropdown
              label="Assigned To"
              searchable
              options={teamMembers.map((m) => ({ key: m.id, label: m.full_name, avatar: m, color: "#3B82F6", bg: "#EFF6FF" }))}
              value={assignedFilter}
              onChange={setAssignedFilter}
            />
          )}

          {/* Clear All */}
          {activeFiltersCount > 0 && (
            <button
              onClick={clearAllFilters}
              style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 12px", borderRadius: 9, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              <X size={11} /> Clear
              <span style={{ background: "#EF4444", color: "#fff", borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 800, minWidth: 16, textAlign: "center" }}>{activeFiltersCount}</span>
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              style={{ paddingLeft: 28, height: 34, width: 170, fontSize: 12.5, border: "1.5px solid #E5E7EB", borderRadius: 9, background: "#FFFFFF", color: "#111827", outline: "none" }}
              placeholder="Search activities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Pagination — only in Table View, left of view switcher */}
          {view === "table" && <ToolbarPagination currentPage={actPage} totalPages={actTotalPages} onChange={setActPage} />}

          {/* View switcher */}
          <div style={{ display: "flex", background: "#F3F4F6", border: "1.5px solid #E5E7EB", borderRadius: 9, padding: 2, gap: 1 }}>
            {VIEWS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setView(key)} title={label}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", background: view === key ? "#FFFFFF" : "transparent", color: view === key ? "#111827" : "#9CA3AF", boxShadow: view === key ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s", fontSize: 12, fontWeight: view === key ? 700 : 500, fontFamily: "inherit" }}>
                <Icon size={12} />{label}
              </button>
            ))}
          </div>

        </div>

        {/* Active filter summary chips */}
        {activeFiltersCount > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
            {visibilityFilter === "mine" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#EEF2FF", color: "#4F46E5", border: "1.5px solid #C7D2FE" }}>
                <Users size={9} /> Mine
                <button onClick={() => setVisibilityFilter("all")} style={{ background: "none", border: "none", cursor: "pointer", color: "#4F46E5", padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            )}
            {statusFilter && (() => { const s = FILTER_STATUSES.find(x => x.key === statusFilter); return s ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1.5px solid ${s.color}30` }}>
                <s.icon size={9} /> {s.label}
                <button onClick={() => setStatusFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: s.color, padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            ) : null; })()}
            {typeFilter && (() => { const d = ACT_TYPES[typeFilter]; return d ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: d.bg, color: d.color, border: `1.5px solid ${d.border}` }}>
                <d.icon size={9} /> {d.label}
                <button onClick={() => setTypeFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: d.color, padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            ) : null; })()}
            {priorityFilter && (() => { const p = PRIORITY_MAP[priorityFilter]; return p ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${p.color}12`, color: p.color, border: `1.5px solid ${p.color}30` }}>
                <Flag size={9} fill={p.color} /> {p.label}
                <button onClick={() => setPriorityFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: p.color, padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            ) : null; })()}
            {quickFilter && (() => { const sf = SMART_FILTERS.find(x => x.key === quickFilter); return sf ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: sf.bg, color: sf.color, border: `1.5px solid ${sf.color}30` }}>
                <sf.icon size={9} /> {sf.label}
                <button onClick={() => setQuickFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: sf.color, padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            ) : null; })()}
            {assignedFilter && (() => { const m = teamMembers.find(x => x.id === assignedFilter); return m ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#EFF6FF", color: "#1D4ED8", border: "1.5px solid #BFDBFE" }}>
                <Avatar user={m} size={14} /> {m.full_name?.split(" ")[0]}
                <button onClick={() => setAssignedFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#1D4ED8", padding: 0, display: "flex", alignItems: "center" }}><X size={9} /></button>
              </span>
            ) : null; })()}
          </div>
        )}
      </div>

      {/* ── Upcoming 3-day banner ── */}
      {(() => {
        const three = new Date(); three.setDate(three.getDate() + 3); three.setHours(23,59,59,999);
        const upcoming3 = activities.filter((a) =>
          a.status !== "done" &&
          a.due_date &&
          new Date(a.due_date) >= now &&
          new Date(a.due_date) <= three &&
          (!statusFilter || statusFilter === "pending" || statusFilter === "upcoming")
        );
        if (!upcoming3.length) return null;
        const todayItems = upcoming3.filter((a) => new Date(a.due_date).toDateString() === now.toDateString());
        return (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ flexShrink: 0, marginBottom: 10, borderRadius: 12, border: "1.5px solid #FDE68A", background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "#F59E0B18", border: "1.5px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bell size={15} style={{ color: "#D97706" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
                {upcoming3.length} task{upcoming3.length > 1 ? "s" : ""} due in the next 3 days
                {todayItems.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: "#EF4444", color: "#fff", borderRadius: 99, padding: "1px 7px" }}>{todayItems.length} today</span>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
                {upcoming3.slice(0, 5).map((a) => {
                  const def  = ACT_TYPES[typeKey(a.type)] || ACT_TYPES.task;
                  const Icon = def.icon;
                  const isToday = new Date(a.due_date).toDateString() === now.toDateString();
                  return (
                    <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 600, background: isToday ? "#FEF2F2" : "#FFFFFF", color: isToday ? "#B91C1C" : "#92400E", border: `1.5px solid ${isToday ? "#FECACA" : "#FDE68A"}`, whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      <Icon size={9} style={{ color: def.color, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                      <span style={{ flexShrink: 0, opacity: 0.7 }}>· {fmtDate(a.due_date)}</span>
                    </span>
                  );
                })}
                {upcoming3.length > 5 && <span style={{ fontSize: 11, color: "#D97706", fontWeight: 600, alignSelf: "center" }}>+{upcoming3.length - 5} more</span>}
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* ── Content area ── */}
      <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #E5E7EB", borderTopColor: "#3B82F6", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : (
          <>
            {view === "timeline" && <TimelineView  activities={filtered} onEdit={handleEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} onNew={isOwnerOrHead ? openNew : null} resolveEntity={resolveEntity} resolveEntityFull={resolveEntityFull} />}
            {view === "table"    && <TableView     activities={pagedFiltered} onEdit={handleEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} resolveEntity={resolveEntity} resolveEntityFull={resolveEntityFull} />}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {(showModal || editActivity) && (
          <ActivityModal
            activity={editActivity}
            defaultType={defaultType}
            onClose={() => { setShowModal(false); setEditActivity(null); }}
            onSave={handleSave}
            teamMembers={teamMembers}
            leads={leads}
            deals={deals}
          />
        )}
      </AnimatePresence>

      </> /* end activeModule === "tasks" */}
    </div>
  );
}
