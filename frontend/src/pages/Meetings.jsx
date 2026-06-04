import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { auth } from "../firebase";
import { meetingsService } from "../services/meetingsService";
import { teamService } from "../services/teamService";
import { leadsService } from "../services/leadsService";
import { dealsService } from "../services/dealsService";
import { changeHistoryService } from "../services/changeHistoryService";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import { format, isToday, isTomorrow, isPast, formatDistanceToNow, startOfDay, endOfDay, addDays } from "date-fns";
import {
  Plus, X, Pencil, Trash2, Calendar, Clock, MapPin, ExternalLink,
  Users, CheckCircle2, Video, Phone, Building2, Search, Filter,
  CalendarCheck, ChevronDown, FileText, Target, Lock, Globe,
  Link2, AlertCircle, RefreshCw, Trophy, ArrowRight, Briefcase,
  Mail, MessageCircle, UserCheck, Globe2, AtSign, Hash, RotateCcw,
  GitBranch, Copy, ChevronUp,
} from "lucide-react";
import SkeletonTable from "../components/SkeletonTable";
import { ColumnToggle, TemplateMenu } from "../components/TableControls";
import { useTablePreferences } from "../hooks/useTablePreferences";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

const MTG_COLUMNS = [
  { key: "meeting_id", label: "Meeting ID",  required: true },
  { key: "meeting",    label: "Meeting",     required: true },
  { key: "client",     label: "Client" },
  { key: "datetime",   label: "Date & Time", required: true },
  { key: "mode",       label: "Mode" },
  { key: "team",       label: "Team" },
  { key: "status",     label: "Status" },
  { key: "outcome",    label: "Outcome" },
];

function getMeetingCode(n) {
  return `MEET-${String(n).padStart(3, "0")}`;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MEETING_PURPOSES = [
  { key: "follow_up",    label: "Follow-up",            color: "#F59E0B", bg: "rgba(245,158,11,0.1)"   },
  { key: "discovery",    label: "Discovery Call",        color: "#6366F1", bg: "rgba(99,102,241,0.1)"   },
  { key: "demo",         label: "Product Demo",          color: "#3B82F6", bg: "rgba(59,130,246,0.1)"   },
  { key: "negotiation",  label: "Negotiation",           color: "#8B5CF6", bg: "rgba(139,92,246,0.1)"   },
  { key: "proposal",     label: "Proposal Discussion",   color: "#F97316", bg: "rgba(249,115,22,0.1)"   },
  { key: "requirements", label: "Requirement Gathering", color: "#06B6D4", bg: "rgba(6,182,212,0.1)"    },
  { key: "onboarding",   label: "Onboarding",            color: "#10B981", bg: "rgba(16,185,129,0.1)"   },
  { key: "support",      label: "Support Meeting",       color: "#EF4444", bg: "rgba(239,68,68,0.1)"    },
  { key: "internal",     label: "Internal Discussion",   color: "#6B7280", bg: "rgba(107,114,128,0.1)"  },
  { key: "presentation", label: "Client Presentation",   color: "#EC4899", bg: "rgba(236,72,153,0.1)"   },
  { key: "payment",      label: "Payment Discussion",    color: "#84CC16", bg: "rgba(132,204,22,0.1)"   },
  { key: "closing",      label: "Closing Discussion",    color: "#10B981", bg: "rgba(16,185,129,0.1)"   },
  { key: "others",       label: "Others",                color: "#6B7280", bg: "rgba(107,114,128,0.1)"  },
];

const OUTCOMES = [
  { key: "won",       label: "Won",         color: "#10B981", bg: "rgba(16,185,129,0.1)",   icon: Trophy        },
  { key: "positive",  label: "Positive",    color: "#3B82F6", bg: "rgba(59,130,246,0.1)",   icon: CheckCircle2  },
  { key: "neutral",   label: "Neutral",     color: "#6B7280", bg: "rgba(107,114,128,0.1)",  icon: ArrowRight    },
  { key: "negative",  label: "Negative",    color: "#EF4444", bg: "rgba(239,68,68,0.1)",    icon: X             },
  { key: "no_show",   label: "No Show",     color: "#F59E0B", bg: "rgba(245,158,11,0.1)",   icon: AlertCircle   },
];

const STATUS_META = {
  scheduled:   { color: "#3B82F6", bg: "rgba(59,130,246,0.1)",  label: "Scheduled"    },
  completed:   { color: "#10B981", bg: "rgba(16,185,129,0.1)",  label: "Completed"    },
  cancelled:   { color: "#EF4444", bg: "rgba(239,68,68,0.1)",   label: "Cancelled"    },
  rescheduled: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  label: "Rescheduled"  },
};

const TIME_SLOTS = Array.from({ length: 68 }, (_, i) => {
  const total = 7 * 60 + i * 15; // 7:00 AM to 11:45 PM in 15-min steps
  const h = Math.floor(total / 60), m = total % 60;
  if (h >= 24) return null;
  const hh = String(h).padStart(2, "0"), mm = String(m).padStart(2, "0");
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { value: `${hh}:${mm}`, label: `${h12}:${mm} ${period}` };
}).filter(Boolean);

const DURATIONS = [
  { value: 15,  label: "15 min"  },
  { value: 30,  label: "30 min"  },
  { value: 45,  label: "45 min"  },
  { value: 60,  label: "1 hour"  },
  { value: 90,  label: "1.5 hrs" },
  { value: 120, label: "2 hours" },
];

const TIMEZONES = [
  "Asia/Kolkata", "UTC", "America/New_York", "America/Los_Angeles", "America/Chicago",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore",
  "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", "Asia/Karachi", "Asia/Dhaka",
];

const fmt = (d, pattern = "dd MMM yyyy, h:mm a") => {
  if (!d) return "—";
  try { return format(new Date(d), pattern); }
  catch { return d; }
};

const fmtDate = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isToday(date)) return `Today · ${format(date, "h:mm a")}`;
  if (isTomorrow(date)) return `Tomorrow · ${format(date, "h:mm a")}`;
  return format(date, "dd MMM, h:mm a");
};

const getDurationStr = (start, end) => {
  if (!start || !end) return null;
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const generateJitsiRoom = (id) =>
  `https://meet.jit.si/Ccentrik-${id.slice(0, 8).toUpperCase()}`;


// ─── Small helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.scheduled;
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: m.bg, color: m.color }}>{m.label}</span>;
}

function PurposeBadge({ purpose }) {
  if (!purpose) return null;
  const p = MEETING_PURPOSES.find((x) => x.key === purpose);
  if (p && p.key !== "others") return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: p.bg, color: p.color }}>{p.label}</span>;
  // Custom purpose (stored when user selected "Others" and typed a custom value)
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(107,114,128,0.1)", color: "#6B7280" }}>{purpose}</span>;
}

function OutcomeBadge({ outcome }) {
  const o = OUTCOMES.find((x) => x.key === outcome);
  if (!o) return null;
  const Icon = o.icon;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: o.bg, color: o.color, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <Icon size={9} /> {o.label}
    </span>
  );
}

function AvatarStack({ attendees = [] }) {
  const shown = attendees.slice(0, 3);
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {shown.map((a, i) => {
        const u = a.user || a;
        const initials = u?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
        return u?.avatar_url ? (
          <img key={u.id} src={u.avatar_url} alt={initials} title={u.full_name} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--surface)", marginLeft: i > 0 ? -6 : 0 }} />
        ) : (
          <div key={u?.id || i} title={u?.full_name} style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff", border: "2px solid var(--surface)", marginLeft: i > 0 ? -6 : 0 }}>
            {initials}
          </div>
        );
      })}
      {attendees.length > 3 && (
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", border: "2px solid var(--surface)", marginLeft: -6 }}>
          +{attendees.length - 3}
        </div>
      )}
    </div>
  );
}

// ─── Meeting Form Modal ───────────────────────────────────────────────────────

function MeetingFormModal({ meeting, onClose, onSave, teamMembers = [], leads = [], deals = [], pipeline = [], allMeetings = [], codeMap = {}, reuseFrom = null }) {
  const [mode,           setMode]          = useState(meeting?.mode || "online");
  const [purpose,        setPurpose]       = useState(meeting?.meeting_purpose || "");
  const [purposeOther,   setPurposeOther]  = useState("");
  const [attendeeIds,    setAttendeeIds]   = useState(() =>
    meeting?.attendees ? meeting.attendees.map((a) => (a.user || a).id).filter(Boolean) : []
  );
  const [autoJitsi,      setAutoJitsi]     = useState(false);
  const [allDay,         setAllDay]        = useState(false);
  const [externalEmails, setExternalEmails]= useState("");
  const [internalNotes,  setInternalNotes] = useState(meeting?.internal_notes || "");
  const [teamSearch,     setTeamSearch]    = useState("");
  const [teamDropOpen,   setTeamDropOpen]  = useState(false);
  const teamDropRef = useRef(null);

  /* ── Reuse previous meeting state ─────────────────────────────────────── */
  const [showReuse,     setShowReuse]     = useState(!!reuseFrom);
  const [reuseSearch,   setReuseSearch]   = useState("");
  const [reuseDropOpen, setReuseDropOpen] = useState(false);
  const [selectedParent,setSelectedParent]= useState(reuseFrom || null);
  const reuseDropRef = useRef(null);

  useEffect(() => {
    if (!reuseDropOpen) return;
    const h = (e) => { if (!reuseDropRef.current?.contains(e.target)) setReuseDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [reuseDropOpen]);

  // ── CRM entity lookup ─────────────────────────────────────────────────────
  const parseNotes = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };
  const normalizeEntity = (rec, src) => {
    const x = parseNotes(rec.other_notes);
    return { ...rec, _src: src, email: rec.email || x.email || "", phone: rec.phone || x.phone || x.whatsapp || "" };
  };
  const normalizeDeal = (d) => {
    const n = parseNotes(d.notes);
    return {
      ...d,
      _src:      "deal",
      lead_code: n.lead_code || d.linked_lead?.lead_code || null,
      email:     d.customer_email || n.email || "",
      phone:     n.contact || d.customer_phone || "",
    };
  };

  const allCrmSources = [
    ...leads.map((l) => normalizeEntity(l, "lead")),
    ...pipeline.map((p) => normalizeEntity(p, "pipeline")),
    ...(deals || []).map(normalizeDeal),
  ];

  const resolveInitialEntity = () => {
    if (!meeting?.lead_id) return null;
    return allCrmSources.find((x) => x.id === meeting.lead_id) || null;
  };
  const resolveInitialInput = () => {
    if (!meeting?.lead_id) return "";
    const found = allCrmSources.find((x) => x.id === meeting.lead_id);
    if (!found) return "";
    if (found._src === "deal") return `Deal — ${found.company_name || found.title || ""}`.trim();
    return `${found.lead_code || ""} — ${found.company_name || ""}`.trim().replace(/^—\s*/, "");
  };

  const [leadCodeInput, setLeadCodeInput] = useState(resolveInitialInput);
  const [crmEntity,     setCrmEntity]     = useState(resolveInitialEntity);
  const [lookupStatus,  setLookupStatus]  = useState(meeting?.lead_id ? "found" : "idle");
  const [noPocError,    setNoPocError]    = useState(false);
  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const dropdownRef = useRef(null);

  // Click-outside closes lead dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    const handle = (e) => { if (!dropdownRef.current?.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen]);

  // Click-outside closes team dropdown
  useEffect(() => {
    if (!teamDropOpen) return;
    const handle = (e) => { if (!teamDropRef.current?.contains(e.target)) setTeamDropOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [teamDropOpen]);

  // ── Normalize any input format → numeric string for comparison
  const normalizeNum = (v) => v.replace(/[^0-9]/g, "").replace(/^0+/, "") || "";

  // ── Filter CRM sources matching the search query (lead code, company, contact, email, phone)
  const filteredSources = leadCodeInput.trim()
    ? allCrmSources.filter((l) => {
        const q       = leadCodeInput.trim().toUpperCase();
        const code    = (l.lead_code || "").toUpperCase();
        const num     = normalizeNum(q);
        const codeNum = normalizeNum(code);
        const phone   = (l.phone || "").replace(/[^0-9]/g, "");
        return (
          code.includes(q) ||
          (num && codeNum === num) ||
          (l.company_name  || "").toUpperCase().includes(q) ||
          (l.contact_name  || "").toUpperCase().includes(q) ||
          (l.email         || "").toUpperCase().includes(q) ||
          (l.title         || "").toUpperCase().includes(q) ||
          (num.length >= 4 && phone.includes(num)) ||
          (l.phone || "").includes(leadCodeInput.trim())
        );
      })
    : allCrmSources.slice(0, 30);

  // ── Date + time slot states ───────────────────────────────────────────────
  const [meetingDate, setMeetingDate] = useState(() => {
    if (!meeting?.start_time) return "";
    return new Date(meeting.start_time).toISOString().split("T")[0];
  });
  const [meetingSlot, setMeetingSlot] = useState(() => {
    if (!meeting?.start_time) return "";
    const d = new Date(meeting.start_time);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(Math.floor(d.getMinutes() / 30) * 30).padStart(2, "0");
    return `${h}:${m}`;
  });
  const [duration, setDuration] = useState(() => {
    if (!meeting?.start_time || !meeting?.end_time) return 60;
    return Math.round((new Date(meeting.end_time) - new Date(meeting.start_time)) / 60000) || 60;
  });

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      title:          meeting?.title          || "",
      company_name:   meeting?.company_name   || "",
      customer_name:  meeting?.customer_name  || "",
      customer_email: meeting?.customer_email || "",
      customer_phone: meeting?.customer_phone || "",
      timezone:       meeting?.timezone       || "Asia/Kolkata",
      meeting_link:   meeting?.meeting_link   || "",
      location:       meeting?.location       || "",
      agenda:         meeting?.agenda         || "",
      status:         meeting?.status         || "scheduled",
    },
  });

  const watchLink = watch("meeting_link");
  const todayStr  = new Date().toISOString().split("T")[0];

  // ── Lead ID lookup (text input path) ──────────────────────────────────────
  const handleLeadCodeChange = (val) => {
    setLeadCodeInput(val);
    setNoPocError(false);
    setCrmEntity(null);
    if (!val.trim()) { setLookupStatus("idle"); setDropdownOpen(false); return; }
    // Always show dropdown so partial inputs (e.g. "2") show all matching leads
    setLookupStatus("searching");
    setDropdownOpen(true);
  };

  const selectEntity = (entity) => {
    setCrmEntity(entity);
    if (entity._src === "deal") {
      setLeadCodeInput(`Deal — ${entity.company_name || entity.title || ""}`.trim());
    } else {
      setLeadCodeInput(`${entity.lead_code || ""} — ${entity.company_name || ""}`.trim().replace(/^—\s*/, ""));
    }
    setLookupStatus("found");
    setDropdownOpen(false);
    setNoPocError(false);
    // Auto-fill all client detail fields from CRM record
    setValue("company_name",   entity.company_name || entity.title || "");
    setValue("customer_name",  entity.contact_name || "");
    setValue("customer_email", entity.email        || "");
    setValue("customer_phone", entity.phone        || "");
    if (!watch("title") && (entity.company_name || entity.title)) {
      setValue("title", `Meeting — ${entity.company_name || entity.title}`);
    }
  };

  const clearSelection = () => {
    setCrmEntity(null);
    setLeadCodeInput("");
    setLookupStatus("idle");
    setNoPocError(false);
    setDropdownOpen(false);
  };

  const toggleAttendee = (id) => setAttendeeIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  /* ── Apply a previous meeting's data to the form ─────────────────────── */
  const applyReuseMeeting = useCallback((src) => {
    setSelectedParent(src);
    setReuseDropOpen(false);
    setReuseSearch("");
    setValue("title",          src.title          || "");
    setValue("company_name",   src.company_name   || "");
    setValue("customer_name",  src.customer_name  || "");
    setValue("customer_email", src.customer_email || "");
    setValue("customer_phone", src.customer_phone || "");
    setValue("agenda",         src.agenda         || "");
    setMode(src.mode || "online");
    setPurpose(src.meeting_purpose || "");
    // Keep notes blank so user can add fresh notes; embed parent ref
    const parentCode = codeMap[src.id] || "MEET-?";
    setInternalNotes(`[Follow-up of ${parentCode}: ${src.title}]\n\n`);
    if (src.customer_email) setExternalEmails("");
    // Re-link CRM entity if lead/deal exists
    const srcEntity = allCrmSources.find((x) => x.id === (src.lead_id || src.deal_id));
    if (srcEntity) selectEntity(srcEntity);
    toast.success(`Pre-filled from ${parentCode}`, { duration: 2500 });
  }, [codeMap, allCrmSources, setValue]);

  // Auto-apply reuseFrom when provided (follow-up workflow)
  const reuseAppliedRef = useRef(false);
  useEffect(() => {
    if (reuseFrom && !reuseAppliedRef.current) {
      reuseAppliedRef.current = true;
      applyReuseMeeting(reuseFrom);
    }
  }, [reuseFrom, applyReuseMeeting]);

  // Filtered reuse meeting list
  const reuseMeetings = useMemo(() => {
    const q = reuseSearch.trim().toLowerCase();
    return allMeetings
      .filter((m) => !q ||
        (codeMap[m.id] || "").toLowerCase().includes(q) ||
        (m.title || "").toLowerCase().includes(q) ||
        (m.company_name || "").toLowerCase().includes(q) ||
        (m.customer_name || "").toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [allMeetings, reuseSearch, codeMap]);

  const handleGenerateJitsi = () => {
    setValue("meeting_link", generateJitsiRoom(meeting?.id || Date.now().toString(36)));
    setAutoJitsi(true);
  };

  // ── Form submission ────────────────────────────────────────────────────────
  const handleFormSubmit = async (data) => {
    if (!meetingDate) { toast.error("Select a meeting date"); return; }
    if (!allDay && !meetingSlot) { toast.error("Select a meeting time slot"); return; }

    const startISO = allDay
      ? new Date(`${meetingDate}T09:00:00`).toISOString()
      : new Date(`${meetingDate}T${meetingSlot}:00`).toISOString();
    const endISO = allDay
      ? new Date(`${meetingDate}T18:00:00`).toISOString()
      : new Date(new Date(startISO).getTime() + duration * 60000).toISOString();

    const externalList = externalEmails.split(",").map((e) => e.trim()).filter(Boolean);
    const teamEmails   = attendeeIds
      .map((id) => teamMembers.find((tm) => tm.id === id)?.email)
      .filter(Boolean);
    const extras = [...new Set([...externalList, ...teamEmails])];

    const finalPurpose = purpose === "others" ? (purposeOther.trim() || "others") : (purpose || null);
    const isDealLink   = crmEntity?._src === "deal";

    await onSave({
      title:           data.title,
      customer_name:   data.customer_name  || "",
      customer_email:  data.customer_email || "",
      company_name:    data.company_name   || null,
      customer_phone:  data.customer_phone || null,
      start_time:      startISO,
      end_time:        endISO,
      timezone:        data.timezone,
      meeting_type:    mode === "online" ? "google_meet" : "in_person",
      mode,
      meeting_purpose: finalPurpose,
      meeting_link:    mode === "online" ? (data.meeting_link || null) : null,
      location:        mode === "offline" ? (data.location || null) : null,
      agenda:          data.agenda || null,
      internal_notes:  internalNotes || null,
      lead_id:         !isDealLink ? (crmEntity?.id || meeting?.lead_id || null) : null,
      deal_id:         isDealLink  ? crmEntity?.id : null,
      status:          data.status,
      _extra_emails:   extras,
      _all_day:        allDay,
      _lead_code:      crmEntity?.lead_code || null,
    }, attendeeIds);
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const SectionHeader = ({ icon: Icon, label }) => (
    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, margin: "8px 0 2px" }}>
      <div style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={13} style={{ color: "#6366F1" }} />
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );

  // Read-only locked display for CRM-sourced fields
  const LockedField = ({ label, value, missing }) => (
    <div>
      <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        <Lock size={10} style={{ color: "var(--text-muted)" }} />
        {missing && <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 700, marginLeft: 4 }}>MISSING</span>}
      </label>
      <div style={{
        padding: "0 12px", height: 36, borderRadius: 8,
        border: `1px solid ${missing ? "#FCA5A5" : "var(--border)"}`,
        background: missing ? "rgba(239,68,68,0.04)" : "var(--surface-2)",
        color: value ? "var(--text)" : "#EF4444",
        fontSize: 13, display: "flex", alignItems: "center", fontWeight: value ? 600 : 500,
      }}>
        {value || (missing ? "Not set in CRM — update the lead first" : "—")}
      </div>
    </div>
  );

  const canSubmit = true; // all fields editable — no gate

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ type: "spring", damping: 22, stiffness: 280 }} style={{ maxWidth: 900, width: "96vw", maxHeight: "94vh", overflowY: "auto" }}>

        {/* ── Modal Header ── */}
        <div style={{ background: "var(--surface)", padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarCheck size={18} style={{ color: "#2563EB" }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
                  {reuseFrom ? "Schedule Follow-up Meeting" : meeting ? "Edit Meeting" : "Schedule Meeting"}
                </h2>
                {selectedParent && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", display: "flex", alignItems: "center", gap: 4 }}>
                    <GitBranch size={9} /> Follow-up of {codeMap[selectedParent.id] || "MEET-?"}
                  </span>
                )}
              </div>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                {reuseFrom ? `Pre-filled from ${codeMap[reuseFrom.id] || "previous meeting"} — update fields as needed` : meeting ? "Revise details — a new iCal invite will be sent" : "Search a CRM record or fill details manually"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!meeting && !reuseFrom && allMeetings.length > 0 && (
              <button type="button" onClick={() => setShowReuse((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${showReuse ? "#6366F1" : "var(--border)"}`, background: showReuse ? "rgba(99,102,241,0.08)" : "var(--surface-2)", cursor: "pointer", fontSize: 12, fontWeight: 600, color: showReuse ? "#6366F1" : "var(--text-muted)", fontFamily: "inherit", transition: "all 0.15s" }}>
                <RotateCcw size={12} /> Reuse Previous
              </button>
            )}
            <button onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center" }}><X size={16} /></button>
          </div>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── Reuse Previous Meeting Panel ── */}
          {showReuse && !reuseFrom && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.05), rgba(139,92,246,0.04))", border: "1.5px solid rgba(99,102,241,0.25)", borderRadius: 14, padding: "16px", overflow: "hidden" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <RotateCcw size={14} style={{ color: "#6366F1" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>Reuse a Previous Meeting</span>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>— select a past meeting to auto-fill this form</span>
              </div>
              <div ref={reuseDropRef} style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none", zIndex: 1 }} />
                <input
                  value={reuseSearch}
                  onChange={(e) => { setReuseSearch(e.target.value); setReuseDropOpen(true); }}
                  onFocus={() => setReuseDropOpen(true)}
                  placeholder="Search by MEET-001, company, title…"
                  style={{ width: "100%", boxSizing: "border-box", height: 40, paddingLeft: 36, paddingRight: 14, borderRadius: 10, border: "1px solid rgba(99,102,241,0.3)", background: "var(--surface)", fontSize: 13, color: "var(--text)", fontFamily: "inherit", outline: "none" }}
                />
                {reuseDropOpen && reuseMeetings.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid rgba(99,102,241,0.2)", borderRadius: 12, boxShadow: "0 12px 36px rgba(0,0,0,0.14)", zIndex: 9999, maxHeight: 260, overflowY: "auto" }}>
                    {reuseMeetings.map((src) => {
                      const code = codeMap[src.id] || "MEET-?";
                      const sm   = STATUS_META[src.status] || STATUS_META.scheduled;
                      return (
                        <button key={src.id} type="button"
                          onMouseDown={(e) => { e.preventDefault(); applyReuseMeeting(src); setShowReuse(false); }}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", borderBottom: "1px solid var(--border)" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(99,102,241,0.05)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                        >
                          <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "2px 7px", borderRadius: 6, flexShrink: 0 }}>{code}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src.title}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{src.company_name || src.customer_name || ""}{src.start_time ? ` · ${format(new Date(src.start_time), "dd MMM yyyy")}` : ""}</div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: sm.bg, color: sm.color, flexShrink: 0 }}>{sm.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {selectedParent && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.22)", borderRadius: 8 }}>
                  <CheckCircle2 size={13} style={{ color: "#10B981" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Pre-filled from <span style={{ fontFamily: "monospace", color: "#6366F1" }}>{codeMap[selectedParent.id]}</span>: {selectedParent.title}</span>
                  <button type="button" onClick={() => { setSelectedParent(null); setInternalNotes(""); }} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}><X size={10} /> Clear</button>
                </div>
              )}
            </motion.div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* ── § 1: CRM Quick Link (optional) ── */}
            <SectionHeader icon={Target} label="CRM Quick Link (Optional)" />

            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">
                Search CRM Record
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>Lead ID · Company · Contact name · Email · Phone — across Pipeline, Leads &amp; Deals</span>
              </label>

              {/* ── Premium frosted glass CRM search combobox ── */}
              <div ref={dropdownRef} style={{ position: "relative" }}>
                {/* Glow ring when focused / found */}
                <div style={{ position: "relative", borderRadius: 16, boxShadow: lookupStatus === "found" ? "0 0 0 3px rgba(16,185,129,0.2), 0 4px 20px rgba(16,185,129,0.12)" : lookupStatus === "searching" ? "0 0 0 3px rgba(11,95,255,0.18), 0 4px 20px rgba(11,95,255,0.1)" : "0 2px 12px rgba(11,95,255,0.08)", transition: "box-shadow 0.2s" }}>
                  <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: lookupStatus === "found" ? "#10B981" : "#0B5FFF", pointerEvents: "none", zIndex: 1 }} />
                  <input
                    value={leadCodeInput}
                    onChange={(e) => handleLeadCodeChange(e.target.value)}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder="Search Lead ID / Company / Contact / Deal / Pipeline…"
                    autoFocus={false}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      height: 50, paddingLeft: 42, paddingRight: crmEntity ? 80 : 16,
                      borderRadius: 16, border: `1.5px solid ${lookupStatus === "found" ? "rgba(16,185,129,0.45)" : "rgba(11,95,255,0.2)"}`,
                      background: lookupStatus === "found" ? "rgba(16,185,129,0.04)" : "rgba(11,95,255,0.03)",
                      fontSize: 14, fontWeight: 500, color: "var(--text)", fontFamily: "inherit",
                      outline: "none", transition: "all 0.2s",
                    }}
                  />
                  {lookupStatus === "found" && (
                    <>
                      <CheckCircle2 size={15} style={{ position: "absolute", right: 58, top: "50%", transform: "translateY(-50%)", color: "#10B981", pointerEvents: "none" }} />
                      <button
                        type="button" onClick={clearSelection} title="Change"
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.18)", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", padding: "3px 7px", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 700, gap: 2, fontFamily: "inherit" }}
                      ><X size={10} /> Clear</button>
                    </>
                  )}
                </div>

                {/* Premium dropdown */}
                {dropdownOpen && filteredSources.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.14 }}
                    style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid rgba(11,95,255,0.15)", borderRadius: 14, boxShadow: "0 16px 48px rgba(11,95,255,0.14), 0 4px 12px rgba(0,0,0,0.1)", zIndex: 999, maxHeight: 240, overflowY: "auto" }}
                  >
                    <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: "#0B5FFF", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid rgba(11,95,255,0.08)" }}>
                      {filteredSources.length} record{filteredSources.length !== 1 ? "s" : ""} found
                    </div>
                    {filteredSources.map((entity) => {
                      const srcConfig = {
                        lead:     { bg: "linear-gradient(135deg,#6366F1,#8B5CF6)", label: "LEAD",     dot: "#6366F1" },
                        pipeline: { bg: "linear-gradient(135deg,#8B5CF6,#A78BFA)", label: "PIPELINE", dot: "#8B5CF6" },
                        deal:     { bg: "linear-gradient(135deg,#10B981,#34D399)", label: "DEAL",     dot: "#10B981" },
                      };
                      const sc = srcConfig[entity._src] || srcConfig.lead;
                      return (
                        <button
                          key={entity.id} type="button"
                          onMouseDown={(e) => { e.preventDefault(); selectEntity(entity); }}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.1s", fontFamily: "inherit" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(11,95,255,0.05)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                        >
                          {/* Source dot + code */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 90 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
                            <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: "#0B5FFF" }}>{entity.lead_code || (entity._src === "deal" ? "DEAL" : "—")}</span>
                          </div>
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entity.company_name || entity.title || "—"}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {[entity.contact_name, entity.email].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: sc.bg, color: "#fff", flexShrink: 0, letterSpacing: "0.06em" }}>{sc.label}</span>
                        </button>
                      );
                    })}
                    {allCrmSources.length === 0 && (
                      <div style={{ padding: "16px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>No CRM records found — add leads or pipeline entries first</div>
                    )}
                  </motion.div>
                )}
                {dropdownOpen && leadCodeInput.trim() && filteredSources.length === 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid rgba(239,68,68,0.15)", borderRadius: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 999, padding: "14px 16px", fontSize: 12.5, color: "var(--text-muted)", textAlign: "center" }}>
                    No match for &ldquo;<strong style={{ color: "var(--text)" }}>{leadCodeInput}</strong>&rdquo; — try company name, LEAD-001, or just &ldquo;1&rdquo;
                  </div>
                )}
              </div>

              {lookupStatus === "idle" && (
                <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--text-muted)" }}>Optional — select a CRM record to auto-fill company, contact, email and phone below.</p>
              )}
            </div>

            {/* Linked badge */}
            {crmEntity && (
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10 }}>
                <CheckCircle2 size={15} style={{ color: "#10B981", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                    Linked to {crmEntity._src === "pipeline" ? "Pipeline" : crmEntity._src === "deal" ? "Deal" : "Lead"}:
                    {crmEntity.lead_code && <span style={{ fontFamily: "monospace", marginLeft: 6, color: "var(--accent)" }}>{crmEntity.lead_code}</span>}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{crmEntity.company_name || crmEntity.title}</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
                  <Lock size={10} /> Auto-filled
                </span>
              </div>
            )}

            {/* No POC error */}
            {noPocError && (
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10 }}>
                <AlertCircle size={15} style={{ color: "#EF4444", flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: "#EF4444", fontWeight: 600 }}>
                  No Contact Person or Email found for this lead. Please update the lead in the Leads module before scheduling a meeting.
                </span>
              </div>
            )}

            {/* ── § 2: Client Details (always editable, auto-filled from CRM) ── */}
            <SectionHeader icon={Users} label="Client Details" />

            {crmEntity && (
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.22)", borderRadius: 8, fontSize: 12, color: "#059669", fontWeight: 600 }}>
                <CheckCircle2 size={13} style={{ color: "#10B981", flexShrink: 0 }} />
                Auto-filled from CRM · {crmEntity.lead_code ? <span style={{ fontFamily: "monospace" }}>{crmEntity.lead_code}</span> : <span style={{ color: "#10B981" }}>{crmEntity._src?.toUpperCase()}</span>} — {crmEntity.company_name || crmEntity.title}
                <button type="button" onClick={clearSelection} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                  <X size={10} /> Clear
                </button>
              </div>
            )}

            <div>
              <label className="crm-label">Company Name <span style={{ color: "#EF4444" }}>*</span></label>
              <input className="crm-input" {...register("company_name", { required: "Company name is required" })} placeholder="Acme Corporation" />
              {errors.company_name && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.company_name.message}</span>}
            </div>
            <div>
              <label className="crm-label">Contact Person</label>
              <input className="crm-input" {...register("customer_name")} placeholder="John Doe" />
            </div>
            <div>
              <label className="crm-label">Email <span style={{ fontSize: 10.5, fontWeight: 400, color: "var(--text-muted)" }}>(for invite)</span></label>
              <input className="crm-input" type="email" {...register("customer_email")} placeholder="john@company.com" />
            </div>
            <div>
              <label className="crm-label">Phone</label>
              <input className="crm-input" {...register("customer_phone")} placeholder="+91 98765 43210" />
            </div>

            {/* External attendees */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">
                Other Attendees
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>Clients, vendors, partners — comma-separated emails (each gets an invite)</span>
              </label>
              <input className="crm-input" value={externalEmails} onChange={(e) => setExternalEmails(e.target.value)} placeholder="client@company.com, partner@firm.com, vendor@co.com..." />
            </div>

            {/* ── § 3: Meeting Details ── */}
            <SectionHeader icon={CalendarCheck} label="Meeting Details" />

            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Meeting Title <span style={{ color: "#EF4444" }}>*</span></label>
              <input className="crm-input" {...register("title", { required: "Title is required" })} placeholder={crmEntity ? `Product Demo — ${crmEntity.company_name}` : "Meeting title…"} />
              {errors.title && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.title.message}</span>}
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label" style={{ marginBottom: 6 }}>Meeting Purpose / Type</label>
              <select
                className="crm-input"
                value={purpose}
                onChange={(e) => { setPurpose(e.target.value); if (e.target.value !== "others") setPurposeOther(""); }}
                style={{ height: 36 }}
              >
                <option value="">— Select purpose —</option>
                {MEETING_PURPOSES.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
              {purpose === "others" && (
                <input
                  className="crm-input"
                  value={purposeOther}
                  onChange={(e) => setPurposeOther(e.target.value)}
                  placeholder="Please specify the meeting purpose..."
                  style={{ marginTop: 8 }}
                />
              )}
              {purpose && purpose !== "others" && (() => {
                const p = MEETING_PURPOSES.find((x) => x.key === purpose);
                if (!p) return null;
                return <span style={{ display: "inline-block", marginTop: 6, fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: p.bg, color: p.color }}>{p.label}</span>;
              })()}
            </div>

            {/* ── § 4: Meeting Mode ── */}
            <SectionHeader icon={Globe} label="Meeting Mode" />

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", gap: 0, background: "var(--surface-2)", borderRadius: 9, padding: 3, width: "fit-content", border: "1px solid var(--border)" }}>
                {[{ key: "online", label: "Google Meet", icon: Video }, { key: "offline", label: "In Person", icon: MapPin }].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button key={m.key} type="button" onClick={() => setMode(m.key)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, background: mode === m.key ? "var(--accent)" : "transparent", color: mode === m.key ? "#fff" : "var(--text-muted)", transition: "all 0.15s" }}>
                      <Icon size={13} /> {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === "online" ? (
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="crm-label">Meeting Link <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>(optional — Google Calendar generates it automatically)</span></label>
                <input className="crm-input" {...register("meeting_link")} placeholder="https://meet.google.com/abc-defg-hij" />
                <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <Video size={11} /> Leave blank — Google Calendar will auto-generate a Meet link when you save the event.
                </p>
                {watchLink && <a href={watchLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: "var(--accent)", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}><ExternalLink size={11} /> Preview link</a>}
              </div>
            ) : (
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="crm-label">Location / Venue</label>
                <input className="crm-input" {...register("location")} placeholder="Office address, meeting room, building name…" />
              </div>
            )}

            {/* ── § 5: Agenda ── */}
            <SectionHeader icon={FileText} label="Agenda" />

            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">
                Meeting Agenda <span style={{ color: "#EF4444" }}>*</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>Sent verbatim in the client email invite</span>
              </label>
              <textarea className="crm-input" {...register("agenda", { required: "Agenda is required" })} rows={3} placeholder="1. Introduction&#10;2. Product demonstration&#10;3. Pricing discussion&#10;4. Q&A" style={{ resize: "vertical" }} />
              {errors.agenda && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.agenda.message}</span>}
            </div>

            {/* ── § 6: Schedule ── */}
            <SectionHeader icon={Clock} label="Schedule" />

            {/* All Day toggle */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", background: allDay ? "rgba(99,102,241,0.06)" : "var(--surface-2)", borderRadius: 8, border: `1px solid ${allDay ? "rgba(99,102,241,0.3)" : "var(--border)"}`, width: "fit-content", transition: "all 0.15s" }}>
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ accentColor: "#6366F1", width: 14, height: 14 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: allDay ? "#6366F1" : "var(--text-2)" }}>☐ All Day Event</span>
              </label>
            </div>

            <div>
              <label className="crm-label">Date <span style={{ color: "#EF4444" }}>*</span></label>
              <input
                className="crm-input"
                type="date"
                min={todayStr}
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
              />
              {!meetingDate && <span style={{ color: "var(--red)", fontSize: 11.5 }}>Date is required</span>}
            </div>

            {!allDay && (
              <div>
                <label className="crm-label">Start Time <span style={{ color: "#EF4444" }}>*</span></label>
                <select
                  className="crm-input"
                  value={meetingSlot}
                  onChange={(e) => setMeetingSlot(e.target.value)}
                  style={{ color: meetingSlot ? "var(--text)" : "var(--text-muted)" }}
                >
                  <option value="">— Pick a time —</option>
                  {TIME_SLOTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                {!meetingSlot && <span style={{ color: "var(--red)", fontSize: 11.5 }}>Time is required</span>}
              </div>
            )}

            {!allDay && (
              <div>
                <label className="crm-label">Duration</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {DURATIONS.map((d) => (
                    <button key={d.value} type="button" onClick={() => setDuration(d.value)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${duration === d.value ? "var(--accent)" : "var(--border)"}`, background: duration === d.value ? "rgba(99,102,241,0.1)" : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: duration === d.value ? "var(--accent)" : "var(--text-muted)", transition: "all 0.14s" }}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!allDay && (
              <div>
                <label className="crm-label">Timezone</label>
                <select className="crm-input" {...register("timezone")}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="crm-label">Status</label>
              <select className="crm-input" {...register("status")}>
                <option value="scheduled">Scheduled</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* ── § 7: Internal Team ── */}
            <SectionHeader icon={Briefcase} label="Internal Team Attendees" />

            <div style={{ gridColumn: "1 / -1" }}>
              {/* Selected chips */}
              {attendeeIds.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {attendeeIds.map((id) => {
                    const member = teamMembers.find((tm) => tm.id === id);
                    if (!member) return null;
                    return (
                      <div key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 6px 3px 10px", borderRadius: 99, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>
                        {member.full_name}
                        <button type="button" onClick={() => toggleAttendee(id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", display: "flex", alignItems: "center", padding: "0 2px" }}>
                          <X size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Searchable dropdown */}
              <div ref={teamDropRef} style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none", zIndex: 1 }} />
                <input
                  className="crm-input"
                  value={teamSearch}
                  onChange={(e) => { setTeamSearch(e.target.value); setTeamDropOpen(true); }}
                  onFocus={() => setTeamDropOpen(true)}
                  placeholder={attendeeIds.length ? "Add more team members…" : "Search team members to add…"}
                  style={{ paddingLeft: 32 }}
                />
                {teamDropOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", zIndex: 999, maxHeight: 200, overflowY: "auto" }}>
                    {teamMembers.filter((tm) => !teamSearch.trim() || tm.full_name.toLowerCase().includes(teamSearch.toLowerCase())).length === 0 ? (
                      <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>No match found</div>
                    ) : teamMembers
                      .filter((tm) => !teamSearch.trim() || tm.full_name.toLowerCase().includes(teamSearch.toLowerCase()))
                      .map((tm) => {
                        const selected = attendeeIds.includes(tm.id);
                        return (
                          <button key={tm.id} type="button"
                            onMouseDown={(e) => { e.preventDefault(); toggleAttendee(tm.id); setTeamSearch(""); setTeamDropOpen(false); }}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: selected ? "rgba(99,102,241,0.06)" : "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                            onMouseEnter={(e) => e.currentTarget.style.background = selected ? "rgba(99,102,241,0.1)" : "var(--surface-2)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = selected ? "rgba(99,102,241,0.06)" : "none"}
                          >
                            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                              {tm.full_name?.charAt(0).toUpperCase() || "?"}
                            </div>
                            <div style={{ flex: 1, overflow: "hidden" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tm.full_name}</div>
                              {tm.email && <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tm.email}</div>}
                            </div>
                            {selected && <CheckCircle2 size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />}
                          </button>
                        );
                      })
                    }
                  </div>
                )}
              </div>
            </div>

            {/* ── § 8: Internal Only ── */}
            <SectionHeader icon={Lock} label="Internal Only — Not Sent to Client" />

            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                Internal Notes / Remarks
                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "#B45309", letterSpacing: "0.05em" }}>INTERNAL</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 4 }}>Never shared with client</span>
              </label>
              <textarea className="crm-input" rows={2} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Client context, objections, key talking points, pre-meeting briefing..." style={{ resize: "vertical", background: "rgba(245,158,11,0.03)", borderColor: internalNotes ? "rgba(245,158,11,0.35)" : undefined }} />
            </div>

          </div>

          {/* Info banner */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", background: "linear-gradient(135deg,rgba(16,185,129,0.06),rgba(16,185,129,0.03))", border: "1px solid rgba(16,185,129,0.22)", borderRadius: 12 }}>
            <CheckCircle2 size={14} style={{ color: "#10B981", flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55 }}>
              A <strong>branded Ccentrik email with an iCalendar invite</strong> is sent automatically. The event appears in the client's Google Calendar, Outlook, or Apple Calendar — no redirect or manual steps needed. Cancellations are also removed from all calendars automatically.
            </span>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ height: 42, padding: "0 20px", borderRadius: 12 }}>Cancel</button>
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileHover={!isSubmitting ? { scale: 1.02 } : {}}
              whileTap={!isSubmitting ? { scale: 0.98 } : {}}
              className="btn-primary"
              style={{ height: 42, padding: "0 24px", borderRadius: 12, fontSize: 13.5, opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
            >
              {isSubmitting ? (
                <><RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> Scheduling…</>
              ) : meeting ? (
                <><CheckCircle2 size={14} /> Save Changes</>
              ) : (
                <><Calendar size={14} /> Schedule Meeting</>
              )}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Post-Meeting Modal ───────────────────────────────────────────────────────

function PostMeetingModal({ meeting, onClose, onSave }) {
  const [outcome, setOutcome] = useState(meeting?.outcome || "");
  const [notes, setNotes] = useState(meeting?.outcome_notes || "");
  const [nextFollowUp, setNextFollowUp] = useState(meeting?.next_follow_up || "");
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState(`Follow up: ${meeting?.customer_name || ""}`);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!outcome) { toast.error("Select an outcome"); return; }
    setSaving(true);
    try {
      await onSave({ outcome, outcome_notes: notes, next_follow_up: nextFollowUp || null, status: "completed" }, createTask ? taskTitle : null);
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ type: "spring", damping: 22, stiffness: 280 }} style={{ maxWidth: 480 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Post-Meeting Wrap-up</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{meeting?.title} · {meeting?.customer_name}</p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Outcome */}
          <div>
            <label className="crm-label" style={{ marginBottom: 10 }}>How did it go? <span style={{ color: "#EF4444" }}>*</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {OUTCOMES.map((o) => {
                const Icon = o.icon;
                const active = outcome === o.key;
                return (
                  <button key={o.key} type="button" onClick={() => setOutcome(o.key)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${active ? o.color : "var(--border)"}`, background: active ? o.bg : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: active ? 700 : 500, color: active ? o.color : "var(--text-2)", transition: "all 0.15s" }}>
                    <Icon size={15} /> {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="crm-label">Outcome Notes</label>
            <textarea className="crm-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed, decisions made, objections raised..." style={{ resize: "vertical" }} />
          </div>

          {/* Follow-up */}
          <div>
            <label className="crm-label">Next Follow-up Date</label>
            <input className="crm-input" type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
          </div>

          {/* Create task */}
          <div style={{ padding: "12px 14px", background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--border)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>Create follow-up task</span>
            </label>
            {createTask && (
              <input className="crm-input" style={{ marginTop: 10, fontSize: 13 }} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title..." />
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Mark as Complete"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Meetings Page ───────────────────────────────────────────────────────

export default function Meetings() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const canDelete = ["owner", "sales_head", "sales_manager"].includes(profile?.role);

  const [showForm, setShowForm] = useState(false);
  const [editMeeting, setEditMeeting] = useState(null);
  const [postMeeting, setPostMeeting] = useState(null);
  const [followUpMeeting, setFollowUpMeeting] = useState(null);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPurpose, setFilterPurpose] = useState("");
  const [filterDate, setFilterDate] = useState("all");
  const { hiddenSet, isVisible, toggleColumn, resetColumns, templates, saveTemplate, applyTemplate, deleteTemplate } = useTablePreferences("meetings", MTG_COLUMNS, profile?.id);

  const { data: meetingsData, isLoading } = useQuery({
    queryKey: ["meetings", filterStatus],
    queryFn: () => meetingsService.getAll({ status: filterStatus }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: teamData } = useQuery({ queryKey: ["team-all"], queryFn: () => teamService.getAll() });

  // Use backend service methods so Firebase JWT is passed and service-role key bypasses Supabase RLS
  const { data: leadsResp } = useQuery({
    queryKey: ["leads-dropdown-full", profile?.id],
    queryFn: () => leadsService.getAll({ limit: 500 }),
    enabled: !!profile?.id,
    staleTime: 60000,
  });

  const { data: pipelineResp } = useQuery({
    queryKey: ["pipeline-dropdown", profile?.id],
    queryFn: () => leadsService.getPipelineEntries(),
    enabled: !!profile?.id,
    staleTime: 60000,
  });

  const { data: dealsResp } = useQuery({
    queryKey: ["deals-dropdown-full", profile?.id],
    queryFn: () => dealsService.getAll(),
    enabled: !!profile?.id,
    staleTime: 60000,
  });

  const leadsData    = leadsResp?.data    || leadsResp    || [];
  const pipelineData = pipelineResp?.data || pipelineResp || [];
  const dealsData    = dealsResp?.data    || dealsResp    || [];

  const allMeetings = useMemo(() => meetingsData?.data || [], [meetingsData]);

  // Build a stable MEET-XXX code map.
  // Priority: use the persisted meeting_code stored in DB (set by meetingsService.create).
  // Fallback: derive from creation-order position for older meetings created before the
  // meeting_code column existed — these get a consistent display code without DB writes.
  const codeMap = useMemo(() => {
    const sorted = [...allMeetings].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    // Walk through in creation order; track the highest seen DB sequence so the
    // fallback positional codes never collide with DB-stored ones.
    let positionCounter = 0;
    const dbCodes = new Set(allMeetings.map((m) => m.meeting_code).filter(Boolean));
    const map = {};
    sorted.forEach((m) => {
      if (m.meeting_code) {
        map[m.id] = m.meeting_code;
      } else {
        // Find next position number that doesn't clash with any DB-stored code
        positionCounter++;
        let candidate = getMeetingCode(positionCounter);
        while (dbCodes.has(candidate)) {
          positionCounter++;
          candidate = getMeetingCode(positionCounter);
        }
        map[m.id] = candidate;
      }
    });
    return map;
  }, [allMeetings]);

  const meetings = useMemo(() => {
    let list = allMeetings;
    if (filterPurpose) list = list.filter((m) => m.meeting_purpose === filterPurpose);
    if (filterDate === "today") list = list.filter((m) => m.start_time && isToday(new Date(m.start_time)));
    if (filterDate === "week")  list = list.filter((m) => m.start_time && new Date(m.start_time) <= addDays(new Date(), 7));
    // Client-side search: meeting code, title, company name, linked lead code
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => {
        const meetCode = (codeMap[m.id] || "").toLowerCase();
        const title    = (m.title || "").toLowerCase();
        const company  = (m.company_name || "").toLowerCase();
        const leadCode = (m.linked_lead?.lead_code || "").toLowerCase();
        return meetCode.includes(q) || title.includes(q) || company.includes(q) || leadCode.includes(q);
      });
    }
    return list;
  }, [allMeetings, filterPurpose, filterDate, search, codeMap]);

  // Stats
  const totalCount     = allMeetings.length;
  const todayCount     = allMeetings.filter((m) => m.start_time && isToday(new Date(m.start_time))).length;
  const upcomingCount  = allMeetings.filter((m) => m.status === "scheduled" && m.start_time && !isPast(new Date(m.start_time))).length;
  const completedCount = allMeetings.filter((m) => m.status === "completed").length;

  // Send branded email + iCalendar MIME invite (triggers Gmail RSVP + auto calendar sync)
  const sendMeetingInvite = async (data, isUpdate = false) => {
    const primaryEmail  = data.customer_email;
    const extraEmails   = data._extra_emails || [];
    const allRecipients = [...new Set([primaryEmail, ...extraEmails].filter(Boolean))];
    if (!allRecipients.length) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      const payload = {
        title:          data.title,
        startTime:      data.start_time,
        endTime:        data.end_time,
        meetingType:    data.meeting_type,
        meetingLink:    data.meeting_link  || null,
        location:       data.location      || null,
        description:    data.agenda        || null,
        hostName:       profile?.full_name || "Ccentrik Team",
        meetingPurpose: data.meeting_purpose || null,
        companyName:    data.company_name   || null,
        meetingId:      data._meeting_id    || null,
        sequence:       data._sequence      || 0,
        // Named attendees list for iCal ATTENDEE fields
        allAttendees: allRecipients
          .filter((e) => e !== primaryEmail)
          .map((e) => ({ name: e, email: e })),
      };

      // Single API call — backend handles all recipients in one shot
      const r = await fetch(`${API}/api/meetings/invite`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          ...payload,
          customerName:  data.customer_name || "there",
          customerEmail: allRecipients,      // backend accepts array
        }),
      });
      const result = await r.json();
      if (result.emailSent) toast.success(`iCal invite${isUpdate ? " updated" : " sent"} — event will appear in Google Calendar`);
      else toast(`Email delivery failed — check SMTP settings`, { icon: "⚠️", duration: 6000 });
    } catch {
      toast("Could not reach email server", { icon: "⚠️" });
    }
  };

  // Send iCalendar METHOD:CANCEL — removes event from attendee calendars automatically
  const sendCancellationInvite = async (meeting) => {
    const primaryEmail  = meeting.customer_email;
    const extraEmails   = meeting._extra_emails || [];
    const allRecipients = [...new Set([primaryEmail, ...extraEmails].filter(Boolean))];
    if (!allRecipients.length) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API}/api/meetings/cancel-invite`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          customerName:  meeting.customer_name || "there",
          customerEmail: allRecipients,
          title:         meeting.title,
          startTime:     meeting.start_time,
          endTime:       meeting.end_time,
          hostName:      profile?.full_name || "Ccentrik Team",
          meetingId:     meeting.id,
          sequence:      2,
        }),
      });
    } catch {
      // cancellation email failure is non-fatal
    }
  };

  // Strip frontend-only meta fields before sending to DB.
  // meeting_code is generated by the service on create — never overwrite on update.
  const stripMeta = (data) => {
    const { _extra_emails, _contact_method, _all_day, _lead_code, meeting_code, ...clean } = data;
    return clean;
  };

  const logMeetingActivity = (data, meetingId, type = "scheduled") => {
    const actType = data.mode === "offline" ? "meeting_person" : "meeting_virtual";
    const labels  = { scheduled: "Scheduled", updated: "Updated", cancelled: "Cancelled", rescheduled: "Rescheduled", completed: "Completed", deleted: "Deleted" };
    const row = {
      type:        actType,
      title:       `Meeting ${labels[type] || type}: ${data.title}`,
      description: `${data.customer_name || data.company_name || ""}${data.agenda ? "\n\nAgenda: " + data.agenda : ""}`,
      created_by:  profile?.id,
      status:      type === "cancelled" || type === "deleted" ? "cancelled" : "done",
      meeting_id:  meetingId || null,
      lead_id:     data.lead_id  || null,
      deal_id:     data.deal_id  || null,
      metadata:    data.start_time ? { scheduled_at: data.start_time } : null,
    };
    if (row.lead_id) { row.related_type = "lead"; row.related_id = row.lead_id; }
    else if (row.deal_id) { row.related_type = "deal"; row.related_id = row.deal_id; }
    supabase.from("activities").insert(row).then(() => {}).catch(() => {});
  };

  const logMeetingHistory = (data, type) => {
    const detail = `${data.title}${data.start_time ? " — " + new Date(data.start_time).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : ""}`;
    if (data.lead_id) changeHistoryService.logMeetingEvent({ entityType: "lead",  entityId: data.lead_id, meetingTitle: data.title, eventType: type, details: detail, userId: profile?.id }).catch(() => {});
    if (data.deal_id) changeHistoryService.logMeetingEvent({ entityType: "deal",  entityId: data.deal_id, meetingTitle: data.title, eventType: type, details: detail, userId: profile?.id }).catch(() => {});
  };

  const createMutation = useMutation({
    mutationFn: async ({ data, attendeeIds }) => {
      const meeting = await meetingsService.create({ ...stripMeta(data), created_by: profile?.id }, attendeeIds);
      // Pass meeting.id so backend generates a stable UID: meetingId@ccentrik.com
      await sendMeetingInvite({ ...data, _meeting_id: meeting.id, _sequence: 0 }, false);
      logMeetingActivity(data, meeting.id, "scheduled");
      logMeetingHistory(data, "scheduled");
      return { meeting, data };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Meeting scheduled — iCal invite sent, event will appear in attendee's calendar automatically");
      setShowForm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, attendeeIds, prevStatus }) => {
      const meeting = await meetingsService.update(id, stripMeta(data), attendeeIds);
      const isCancelled   = data.status === "cancelled" && prevStatus !== "cancelled";
      const isReschedule  = data.status === "rescheduled" && prevStatus !== "rescheduled";
      if (isCancelled) {
        // METHOD:CANCEL removes the event from all attendee Google Calendars automatically
        await sendCancellationInvite({ ...data, id });
      } else if (isReschedule || data._extra_emails?.length) {
        // METHOD:REQUEST with higher SEQUENCE updates the existing calendar event
        await sendMeetingInvite({ ...data, _meeting_id: id, _sequence: 1 }, true);
      }
      const evtType = isCancelled ? "cancelled" : isReschedule ? "rescheduled" : "updated";
      logMeetingActivity(data, id, evtType);
      logMeetingHistory(data, evtType);
      return meeting;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      qc.invalidateQueries({ queryKey: ["my-pending-activities"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Meeting updated");
      setEditMeeting(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { data: meeting } = await supabase.from("meetings").select("*").eq("id", id).maybeSingle();
      await meetingsService.delete(id);
      if (meeting) {
        logMeetingActivity(meeting, id, "deleted");
        logMeetingHistory(meeting, "deleted");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      qc.invalidateQueries({ queryKey: ["my-pending-activities"] });
      qc.invalidateQueries({ queryKey: ["my-completed-activities"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Meeting removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const postMeetingMutation = useMutation({
    mutationFn: async ({ id, updates, taskTitle }) => {
      const { data: meeting } = await supabase.from("meetings").select("*").eq("id", id).maybeSingle();
      await meetingsService.update(id, updates);
      if (taskTitle) {
        await supabase.from("tasks").insert({ title: taskTitle, assigned_to: profile?.id, created_by: profile?.id, status: "todo", priority: "medium" });
      }
      if (meeting) {
        logMeetingActivity({ ...meeting, ...updates }, id, "completed");
        logMeetingHistory({ ...meeting, ...updates }, "completed");
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); toast.success("Meeting marked complete!"); setPostMeeting(null); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (data, attendeeIds) => {
    if (editMeeting) await updateMutation.mutateAsync({ id: editMeeting.id, data, attendeeIds, prevStatus: editMeeting.status });
    else await createMutation.mutateAsync({ data, attendeeIds });
  };

  const teamMembers = teamData?.data || teamData || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* ── Header ── */}
      <div style={{ padding: "16px 24px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarCheck size={20} style={{ color: "var(--accent)" }} />
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)" }}>Meetings</h1>
            </div>
            <p style={{ margin: "2px 0 0 28px", fontSize: 12.5, color: "var(--text-muted)" }}>Schedule, track, and follow up on all customer meetings</p>
          </div>
          <button className="btn-primary" onClick={() => setShowForm(true)} style={{ height: 36 }}>
            <Plus size={14} /> Schedule Meeting
          </button>
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Meetings", value: totalCount,     color: "#6B7280", Icon: CalendarCheck },
            { label: "Today",          value: todayCount,     color: "#F59E0B", Icon: Clock         },
            { label: "Upcoming",       value: upcomingCount,  color: "#3B82F6", Icon: Calendar      },
            { label: "Completed",      value: completedCount, color: "#10B981", Icon: CheckCircle2  },
          ].map((s) => (
            <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <s.Icon size={18} style={{ color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
            <input
              className="crm-input"
              style={{ paddingLeft: 32, height: 36, fontSize: 13 }}
              placeholder="Search by title or MEET-001…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="crm-input" style={{ width: "auto", height: 36, fontSize: 13 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="crm-input" style={{ width: "auto", height: 36, fontSize: 13 }} value={filterPurpose} onChange={(e) => setFilterPurpose(e.target.value)}>
            <option value="">All Types</option>
            {MEETING_PURPOSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select className="crm-input" style={{ width: "auto", height: 36, fontSize: 13 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
          </select>
          {(search || filterStatus || filterPurpose || filterDate !== "all") && (
            <button className="btn-ghost" style={{ height: 36, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }} onClick={() => { setSearch(""); setFilterStatus(""); setFilterPurpose(""); setFilterDate("all"); }}>
              <X size={13} /> Clear
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <ColumnToggle allColumns={MTG_COLUMNS} hiddenSet={hiddenSet} onToggle={toggleColumn} onReset={resetColumns} />
            <TemplateMenu
              templates={templates}
              onSave={saveTemplate}
              onApply={(tpl) => {
                applyTemplate(tpl);
                if (tpl.filters?.status  !== undefined) setFilterStatus(tpl.filters.status);
                if (tpl.filters?.purpose !== undefined) setFilterPurpose(tpl.filters.purpose);
              }}
              onDelete={deleteTemplate}
              currentFilters={{ status: filterStatus, purpose: filterPurpose }}
            />
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable cols={7} rows={7} />
        ) : !meetings.length ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarCheck size={26} style={{ color: "var(--accent)" }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>No meetings yet</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", maxWidth: 340 }}>Schedule your first meeting to start tracking client interactions.</div>
            <button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginTop: 4 }}><Plus size={14} /> Schedule Meeting</button>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    {isVisible("meeting_id") && <th style={{ whiteSpace: "nowrap" }}>MEETING ID</th>}
                    <th>MEETING</th>
                    {isVisible("client")   && <th>CLIENT</th>}
                    <th>DATE & TIME</th>
                    {isVisible("mode")     && <th>MODE</th>}
                    {isVisible("team")     && <th>TEAM</th>}
                    {isVisible("status")   && <th>STATUS</th>}
                    {isVisible("outcome")  && <th>OUTCOME</th>}
                    <th style={{ textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {meetings.map((m, i) => {
                      const duration = getDurationStr(m.start_time, m.end_time);
                      const isOverdue = m.status === "scheduled" && m.start_time && isPast(new Date(m.start_time));
                      return (
                        <motion.tr key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.02, duration: 0.16 }}>
                          {isVisible("meeting_id") && (
                            <td style={{ whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "3px 8px", borderRadius: 7, display: "inline-block", border: "1px solid rgba(99,102,241,0.2)" }}>
                                  {codeMap[m.id] || "—"}
                                </span>
                                {codeMap[m.id] && (
                                  <motion.button
                                    whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(codeMap[m.id]).catch(() => {});
                                      setCopiedId(m.id);
                                      setTimeout(() => setCopiedId(null), 1800);
                                    }}
                                    title="Copy Meeting ID"
                                    style={{ background: "none", border: "none", cursor: "pointer", color: copiedId === m.id ? "#10B981" : "var(--text-muted)", padding: 2, display: "flex", alignItems: "center", transition: "color 0.15s" }}
                                  >
                                    {copiedId === m.id
                                      ? <CheckCircle2 size={11} style={{ color: "#10B981" }} />
                                      : <Copy size={11} />
                                    }
                                  </motion.button>
                                )}
                              </div>
                            </td>
                          )}
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 3 }}>{m.title}</div>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {m.meeting_purpose && <PurposeBadge purpose={m.meeting_purpose} />}
                              {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.08)", padding: "1px 6px", borderRadius: 99 }}>Overdue</span>}
                            </div>
                          </td>
                          {isVisible("client") && (
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-2)" }}>{m.customer_name || "—"}</div>
                              {m.company_name && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.company_name}</div>}
                              {m.customer_email && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.customer_email}</div>}
                            </td>
                          )}
                          <td style={{ whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>{fmtDate(m.start_time)}</div>
                            {duration && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{duration}</div>}
                          </td>
                          {isVisible("mode") && (
                            <td>
                              {m.mode === "online" || m.meeting_type !== "in_person" ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(59,130,246,0.1)", color: "#3B82F6", display: "flex", alignItems: "center", gap: 4 }}>
                                    <Video size={9} /> Online
                                  </span>
                                  {m.meeting_link && <a href={m.meeting_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}><ExternalLink size={12} /></a>}
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: "#10B981", display: "flex", alignItems: "center", gap: 4, width: "fit-content" }}>
                                  <MapPin size={9} /> In Person
                                </span>
                              )}
                            </td>
                          )}
                          {isVisible("team")    && <td><AvatarStack attendees={m.attendees || []} /></td>}
                          {isVisible("status")  && <td><StatusBadge status={m.status} /></td>}
                          {isVisible("outcome") && <td>{m.outcome ? <OutcomeBadge outcome={m.outcome} /> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}</td>}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                              {/* Complete */}
                              {m.status === "scheduled" && (
                                <motion.button onClick={() => setPostMeeting(m)} title="Mark Complete" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.22)", cursor: "pointer", fontFamily: "inherit" }}>
                                  <CheckCircle2 size={11} /> Done
                                </motion.button>
                              )}
                              {/* Follow-up */}
                              <motion.button
                                onClick={() => setFollowUpMeeting(m)}
                                title="Schedule Follow-up Meeting"
                                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.22)", cursor: "pointer", fontFamily: "inherit" }}>
                                <GitBranch size={11} /> Follow-up
                              </motion.button>
                              {/* Edit */}
                              <motion.button onClick={() => setEditMeeting(m)} className="btn-ghost" style={{ padding: "4px 6px" }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                <Pencil size={13} strokeWidth={1.75} />
                              </motion.button>
                              {/* Delete */}
                              {canDelete && (
                                <motion.button onClick={() => { if (window.confirm("Delete this meeting?")) deleteMutation.mutate(m.id); }} className="btn-ghost" style={{ padding: "4px 6px", color: "var(--red)" }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                  <Trash2 size={13} strokeWidth={1.75} />
                                </motion.button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {(showForm || editMeeting) && (
          <MeetingFormModal
            key="form"
            meeting={editMeeting}
            onClose={() => { setShowForm(false); setEditMeeting(null); }}
            onSave={handleSave}
            teamMembers={teamMembers}
            leads={leadsData || []}
            deals={dealsData || []}
            pipeline={pipelineData || []}
            allMeetings={allMeetings}
            codeMap={codeMap}
          />
        )}
        {followUpMeeting && (
          <MeetingFormModal
            key="followup"
            meeting={null}
            onClose={() => setFollowUpMeeting(null)}
            onSave={async (data, attendeeIds) => {
              await createMutation.mutateAsync({ data, attendeeIds });
              setFollowUpMeeting(null);
            }}
            teamMembers={teamMembers}
            leads={leadsData || []}
            deals={dealsData || []}
            pipeline={pipelineData || []}
            allMeetings={allMeetings}
            codeMap={codeMap}
            reuseFrom={followUpMeeting}
          />
        )}
        {postMeeting && (
          <PostMeetingModal
            key="post"
            meeting={postMeeting}
            onClose={() => setPostMeeting(null)}
            onSave={(updates, taskTitle) => postMeetingMutation.mutateAsync({ id: postMeeting.id, updates, taskTitle })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
