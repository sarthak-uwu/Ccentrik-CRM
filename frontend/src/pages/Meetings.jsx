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
import { format, isToday, isTomorrow, isPast, formatDistanceToNow, startOfDay, endOfDay, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, startOfWeek, endOfWeek, addMonths, subMonths } from "date-fns";
import {
  Plus, X, Pencil, Trash2, Calendar, Clock, MapPin, ExternalLink,
  Users, CheckCircle2, Video, Phone, Building2, Search, Filter,
  CalendarCheck, ChevronDown, FileText, Target, Lock, Globe,
  Link2, AlertCircle, RefreshCw, Trophy, ArrowRight, Briefcase,
  Mail, MessageCircle, UserCheck, Globe2, AtSign, Hash, RotateCcw,
  GitBranch, Copy, ChevronUp, Flag, Download, LayoutList, LayoutGrid, CalendarDays, User,
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

// ─── Priority ─────────────────────────────────────────────────────────────────

const PRIORITY_META = {
  high:   { label: "High",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  medium: { label: "Medium", color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  low:    { label: "Low",    color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
};

function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority];
  if (!m) return null;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: m.bg, color: m.color, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
      <Flag size={8} /> {m.label}
    </span>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ meetings, codeMap, onSelectMeeting }) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const meetingsByDate = useMemo(() => {
    const map = {};
    meetings.forEach((m) => {
      if (!m.start_time) return;
      const key = format(new Date(m.start_time), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    return map;
  }, [meetings]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd   = endOfMonth(currentMonth);
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd     = endOfWeek(monthEnd,   { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button className="btn-ghost" style={{ padding: "5px 10px", display: "flex", alignItems: "center", gap: 4 }}
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
          <ChevronUp size={14} style={{ transform: "rotate(-90deg)" }} /> Prev
        </button>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <button className="btn-ghost" style={{ padding: "5px 10px", display: "flex", alignItems: "center", gap: 4 }}
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
          Next <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", padding: "4px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {days.map((day) => {
          const key        = format(day, "yyyy-MM-dd");
          const dayMtgs    = meetingsByDate[key] || [];
          const inMonth    = isSameMonth(day, currentMonth);
          const isTodayDay = isToday(day);
          return (
            <div key={key}
              style={{ minHeight: 84, padding: "6px 7px", borderRadius: 10, border: `1.5px solid ${isTodayDay ? "var(--accent)" : "var(--border)"}`, background: isTodayDay ? "rgba(99,102,241,0.04)" : "var(--surface)", opacity: inMonth ? 1 : 0.3 }}
            >
              <div style={{ fontSize: 12, fontWeight: isTodayDay ? 800 : 500, color: isTodayDay ? "var(--accent)" : "var(--text-2)", marginBottom: 4, textAlign: "right" }}>
                {format(day, "d")}
              </div>
              {dayMtgs.slice(0, 3).map((m) => {
                const sm = STATUS_META[m.status] || STATUS_META.scheduled;
                return (
                  <div key={m.id} onClick={() => onSelectMeeting(m)} title={m.title}
                    style={{ fontSize: 10, fontWeight: 600, padding: "2px 5px", borderRadius: 5, marginBottom: 2, background: sm.bg, color: sm.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
                  >
                    {m.start_time ? format(new Date(m.start_time), "HH:mm") : ""} {m.title}
                  </div>
                );
              })}
              {dayMtgs.length > 3 && (
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>+{dayMtgs.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ meetings, codeMap, onSelect, onEdit, onComplete, onDelete, onFollowUp, canDelete }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
      {meetings.map((m) => {
        const sm = STATUS_META[m.status] || STATUS_META.scheduled;
        const isOverdue = m.status === "scheduled" && m.start_time && isPast(new Date(m.start_time));
        return (
          <div key={m.id} onClick={() => onSelect(m)}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${sm.color}`, borderRadius: 12, padding: 16, cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <StatusBadge status={m.status} />
                  {m.meeting_purpose && <PurposeBadge purpose={m.meeting_purpose} />}
                  {m.priority && m.priority !== "medium" && <PriorityBadge priority={m.priority} />}
                  {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.08)", padding: "2px 6px", borderRadius: 99 }}>Overdue</span>}
                </div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "2px 7px", borderRadius: 6, fontFamily: "monospace", flexShrink: 0 }}>
                {codeMap[m.id] || "—"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10, paddingLeft: 2 }}>
              {m.customer_name && (
                <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}>
                  <User size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  {m.customer_name}{m.company_name ? ` · ${m.company_name}` : ""}
                </div>
              )}
              {m.start_time && (
                <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}>
                  <Calendar size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  {format(new Date(m.start_time), "EEE, MMM d · HH:mm")}{m.end_time ? ` – ${format(new Date(m.end_time), "HH:mm")}` : ""}
                </div>
              )}
              {(m.meeting_link || m.location) && (
                <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}>
                  {(m.mode === "online" || m.meeting_type !== "in_person")
                    ? <Video size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    : <MapPin size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                  {(m.mode === "online" || m.meeting_type !== "in_person") ? "Online Meeting" : (m.location || "In Person")}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
              {m.status === "scheduled" && (
                <motion.button onClick={(e) => { e.stopPropagation(); onComplete(m); }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 7, background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.2)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={10} /> Done
                </motion.button>
              )}
              <motion.button onClick={(e) => { e.stopPropagation(); onFollowUp(m); }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 7, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                <GitBranch size={10} /> Follow-up
              </motion.button>
              <motion.button onClick={(e) => { e.stopPropagation(); onEdit(m); }} className="btn-ghost" style={{ padding: "4px 6px" }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Pencil size={12} strokeWidth={1.75} />
              </motion.button>
              {canDelete && (
                <motion.button onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete this meeting?")) onDelete(m.id); }} className="btn-ghost" style={{ padding: "4px 6px", color: "var(--red)" }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Trash2 size={12} strokeWidth={1.75} />
                </motion.button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Google Maps Places Autocomplete (mounts only when API key is present) ───
function GoogleMapsAutocomplete({ inputId, apiKey, onPlaceSelected }) {
  useEffect(() => {
    if (!apiKey || !inputId) return;
    let autocomplete;
    const init = () => {
      const el = document.getElementById(inputId);
      if (!el || !window.google?.maps?.places) return;
      autocomplete = new window.google.maps.places.Autocomplete(el, { types: ["geocode", "establishment"] });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place?.geometry?.location) {
          onPlaceSelected({
            formattedAddress: place.formatted_address || el.value,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            placeId: place.place_id || null,
          });
        }
      });
    };
    if (window.google?.maps?.places) { init(); return; }
    const scriptId = "gm-places-script";
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id  = scriptId;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      s.async = true;
      s.onload = init;
      document.head.appendChild(s);
    } else {
      document.getElementById(scriptId).addEventListener("load", init);
    }
    return () => { if (autocomplete) window.google?.maps?.event?.clearInstanceListeners(autocomplete); };
  }, [inputId, apiKey, onPlaceSelected]);
  return null; // renders nothing — side-effect only
}

// ─── Meeting Form Modal ───────────────────────────────────────────────────────

function MeetingFormModal({ meeting, onClose, onSave, teamMembers = [], leads = [], deals = [], pipeline = [], allMeetings = [], codeMap = {}, reuseFrom = null }) {
  const [mode,           setMode]          = useState(meeting?.mode || "online");
  const [platform,       setPlatform]      = useState(meeting?.meeting_type || "google_meet");
  const [locationLat,    setLocationLat]   = useState(meeting?.location_lat  || null);
  const [locationLng,    setLocationLng]   = useState(meeting?.location_lng  || null);
  const [locationPlaceId, setLocationPlaceId] = useState(meeting?.location_place_id || null);
  const [oauthStatus,    setOauthStatus]   = useState({ google_meet: null, microsoft_teams: null });
  const [oauthLoading,   setOauthLoading]  = useState(false);
  const [purpose,        setPurpose]       = useState(meeting?.meeting_purpose || "");
  const [purposeOther,   setPurposeOther]  = useState("");
  const [attendeeIds,    setAttendeeIds]   = useState(() =>
    meeting?.attendees ? meeting.attendees.map((a) => (a.user || a).id).filter(Boolean) : []
  );
  const [autoJitsi,      setAutoJitsi]     = useState(false);
  const [allDay,         setAllDay]        = useState(false);
  const [externalEmails, setExternalEmails]= useState("");
  const [internalNotes,  setInternalNotes] = useState(meeting?.internal_notes || "");
  const [priority,       setPriority]      = useState(meeting?.priority || "medium");
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
      meeting_link:   meeting?.meeting_link   || ((meeting?.mode || "online") !== "offline" && (meeting?.meeting_type || "google_meet") === "jitsi" ? generateJitsiRoom(Date.now().toString(36)) : ""),
      location:       meeting?.location       || "",
      agenda:         meeting?.agenda         || "",
      status:         meeting?.status         || "scheduled",
    },
  });

  const watchLink = watch("meeting_link");
  const todayStr  = new Date().toISOString().split("T")[0];

  // Auto-generate Jitsi link when mode switches to online and no link is set (Jitsi platform only)
  useEffect(() => {
    if (mode === "online" && !watchLink && platform === "jitsi") {
      setValue("meeting_link", generateJitsiRoom(Date.now().toString(36)));
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch which OAuth providers (Google Meet / Microsoft Teams) the current user has connected
  useEffect(() => {
    const fetchOauthStatus = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const r = await fetch(`${API}/api/oauth/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const data = await r.json();
          setOauthStatus(data);
        }
      } catch { /* non-fatal: OAuth status is best-effort */ }
    };
    fetchOauthStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setPlatform(src.meeting_type && src.meeting_type !== "in_person" ? src.meeting_type : "google_meet");
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

  // ── OAuth connect helpers ─────────────────────────────────────────────────
  const handleConnectGoogle = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { toast.error("Please log in first"); return; }
      const r = await fetch(`${API}/api/oauth/google/authorize`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (data.url) { window.location.href = data.url; }
      else toast.error(data.error || "Failed to start Google authorization");
    } catch { toast.error("Could not connect to Google"); }
  };

  const handleDisconnectGoogle = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      await fetch(`${API}/api/oauth/google/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setOauthStatus((s) => ({ ...s, google_meet: null }));
      toast.success("Google account disconnected");
    } catch { toast.error("Failed to disconnect Google account"); }
  };

  const handleConnectMicrosoft = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { toast.error("Please log in first"); return; }
      const r = await fetch(`${API}/api/oauth/microsoft/authorize`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (data.url) { window.location.href = data.url; }
      else toast.error(data.error || "Failed to start Microsoft authorization");
    } catch { toast.error("Could not connect to Microsoft"); }
  };

  const handleDisconnectMicrosoft = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      await fetch(`${API}/api/oauth/microsoft/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setOauthStatus((s) => ({ ...s, microsoft_teams: null }));
      toast.success("Microsoft account disconnected");
    } catch { toast.error("Failed to disconnect Microsoft account"); }
  };

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

    // Auto-generate meeting link via OAuth if user has connected provider
    // and no manual link was entered.
    let finalMeetingLink = mode === "online" ? (data.meeting_link || null) : null;
    if (
      mode === "online" &&
      !finalMeetingLink &&
      (platform === "google_meet" || platform === "teams")
    ) {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          setOauthLoading(true);
          if (platform === "google_meet" && oauthStatus.google_meet?.connected) {
            const r = await fetch(`${API}/api/oauth/google/create-event`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                title:           data.title,
                startTime:       startISO,
                endTime:         endISO,
                description:     data.agenda || "",
                attendeeEmails:  extras,
                requestId:       `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              }),
            });
            const result = await r.json();
            if (result.meetLink) {
              finalMeetingLink = result.meetLink;
              toast.success("Google Meet link generated automatically");
            }
          } else if (platform === "teams" && oauthStatus.microsoft_teams?.connected) {
            const r = await fetch(`${API}/api/oauth/microsoft/create-meeting`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ title: data.title, startTime: startISO, endTime: endISO }),
            });
            const result = await r.json();
            if (result.joinWebUrl) {
              finalMeetingLink = result.joinWebUrl;
              toast.success("Microsoft Teams link generated automatically");
            }
          }
        }
      } catch (linkErr) {
        console.warn("Auto-generate meeting link failed:", linkErr);
        // Non-fatal — continue with null link
      } finally {
        setOauthLoading(false);
      }
    }

    await onSave({
      title:           data.title,
      customer_name:   data.customer_name  || "",
      customer_email:  data.customer_email || "",
      company_name:    data.company_name   || null,
      customer_phone:  data.customer_phone || null,
      start_time:      startISO,
      end_time:        endISO,
      timezone:        data.timezone,
      meeting_type:     mode === "online" ? platform : "in_person",
      meeting_platform: mode === "online" ? platform : null,
      mode,
      meeting_purpose:  finalPurpose,
      meeting_link:     finalMeetingLink,
      location:         mode === "offline" ? (data.location || null) : null,
      location_lat:     mode === "offline" ? locationLat : null,
      location_lng:     mode === "offline" ? locationLng : null,
      location_place_id: mode === "offline" ? (locationPlaceId || null) : null,
      location_maps_url: mode === "offline" && locationLat && locationLng
        ? `https://maps.google.com/?q=${locationLat},${locationLng}`
        : mode === "offline" && data.location
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.location)}`
        : null,
      agenda:          data.agenda || null,
      internal_notes:  internalNotes || null,
      lead_id:         !isDealLink ? (crmEntity?.id || meeting?.lead_id || null) : null,
      deal_id:         isDealLink  ? crmEntity?.id : null,
      status:          data.status,
      priority:        priority || "medium",
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

  // UI-only computed values
  const endTimeLabel = (() => {
    if (!meetingSlot || allDay) return null;
    const [h, m] = meetingSlot.split(":").map(Number);
    const totalMins = h * 60 + m + duration;
    const endH = Math.floor(totalMins / 60) % 24;
    const endM = totalMins % 60;
    const ampm = endH >= 12 ? "PM" : "AM";
    const dispH = endH % 12 || 12;
    return `${dispH}:${String(endM).padStart(2, "0")} ${ampm}`;
  })();

  const durationLabel = (() => {
    const h = Math.floor(duration / 60);
    const m = duration % 60;
    return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ");
  })();

  // Conflict detection: meetings that overlap the selected date+time window
  const conflictMeetings = useMemo(() => {
    if (!meetingDate || !meetingSlot || allDay) return [];
    const startMs = new Date(`${meetingDate}T${meetingSlot}:00`).getTime();
    const endMs   = startMs + duration * 60000;
    return allMeetings.filter((mtg) => {
      if (meeting && mtg.id === meeting.id) return false;
      if (!mtg.start_time) return false;
      const ms = new Date(mtg.start_time).getTime();
      const me = mtg.end_time ? new Date(mtg.end_time).getTime() : ms + 3600000;
      return ms < endMs && me > startMs;
    });
  }, [meetingDate, meetingSlot, duration, allDay, allMeetings, meeting]);

  const externalEmailsList = externalEmails
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const watchedTitle    = watch("title");
  const watchedCompany  = watch("company_name");
  const watchedEmail    = watch("customer_email");
  const watchedLocation = watch("location");
  const watchedLink     = watch("meeting_link");

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 24, stiffness: 300 }}
        style={{ maxWidth: 720, width: "96vw", maxHeight: "94vh", overflowY: "auto" }}
      >
        {/* ── Header ── */}
        <div style={{ background: "var(--surface)", padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarCheck size={18} style={{ color: "#2563EB" }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.025em" }}>
                  {reuseFrom ? "Schedule Follow-up" : meeting ? "Edit Meeting" : "Schedule Meeting"}
                </h2>
                {selectedParent && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1", display: "flex", alignItems: "center", gap: 4 }}>
                    <GitBranch size={9} /> Follow-up of {codeMap[selectedParent.id] || "MEET-?"}
                  </span>
                )}
              </div>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                {reuseFrom
                  ? `Pre-filled from ${codeMap[reuseFrom.id] || "previous meeting"}`
                  : meeting
                  ? "Update details — a revised iCal invite will be sent"
                  : "Fill details to schedule and send a calendar invite"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!meeting && !reuseFrom && allMeetings.length > 0 && (
              <button type="button" onClick={() => setShowReuse((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${showReuse ? "#6366F1" : "var(--border)"}`, background: showReuse ? "rgba(99,102,241,0.08)" : "var(--surface-2)", cursor: "pointer", fontSize: 12, fontWeight: 600, color: showReuse ? "#6366F1" : "var(--text-muted)", fontFamily: "inherit" }}>
                <RotateCcw size={12} /> Reuse Previous
              </button>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={15} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 0 }}>

          {/* ── Reuse Previous Meeting Panel ── */}
          {showReuse && !reuseFrom && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.05),rgba(139,92,246,0.04))", border: "1.5px solid rgba(99,102,241,0.25)", borderRadius: 12, padding: 16, overflow: "hidden", marginBottom: 20 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <RotateCcw size={13} style={{ color: "#6366F1" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Reuse a Previous Meeting</span>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>— auto-fill from a past meeting</span>
              </div>
              <div ref={reuseDropRef} style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none", zIndex: 1 }} />
                <input
                  value={reuseSearch}
                  onChange={(e) => { setReuseSearch(e.target.value); setReuseDropOpen(true); }}
                  onFocus={() => setReuseDropOpen(true)}
                  placeholder="Search by MEET-001, company, title…"
                  style={{ width: "100%", boxSizing: "border-box", height: 40, paddingLeft: 36, paddingRight: 14, borderRadius: 9, border: "1px solid rgba(99,102,241,0.3)", background: "var(--surface)", fontSize: 13, color: "var(--text)", fontFamily: "inherit", outline: "none" }}
                />
                {reuseDropOpen && reuseMeetings.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid rgba(99,102,241,0.2)", borderRadius: 11, boxShadow: "0 12px 36px rgba(0,0,0,0.14)", zIndex: 9999, maxHeight: 260, overflowY: "auto" }}>
                    {reuseMeetings.map((src) => {
                      const code = codeMap[src.id] || "MEET-?";
                      const sm = STATUS_META[src.status] || STATUS_META.scheduled;
                      return (
                        <button key={src.id} type="button" onMouseDown={(e) => { e.preventDefault(); applyReuseMeeting(src); }}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.05)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#6366F1", fontFamily: "monospace", minWidth: 72 }}>{code}</span>
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src.title}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src.company_name}</div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: sm.bg, color: sm.color }}>{sm.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {selectedParent && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.18)" }}>
                  <CheckCircle2 size={12} style={{ color: "#6366F1", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#6366F1" }}>Pre-filled from {codeMap[selectedParent.id] || "MEET-?"}: {selectedParent.title}</span>
                  <button type="button" onClick={() => setSelectedParent(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontFamily: "inherit" }}>
                    <X size={10} /> Clear
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ── CRM QUICK LINK ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Target size={12} style={{ color: "#6366F1" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>CRM Quick Link</span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: "var(--surface-3)", color: "var(--text-muted)" }}>Optional</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: lookupStatus === "found" ? "#10B981" : "var(--text-muted)", pointerEvents: "none", zIndex: 1 }} />
              <input
                value={leadCodeInput}
                onChange={(e) => handleLeadCodeChange(e.target.value)}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Search Lead ID / Company / Contact / Deal…"
                style={{ width: "100%", boxSizing: "border-box", height: 44, paddingLeft: 40, paddingRight: crmEntity ? 76 : 14, borderRadius: 12, border: `1.5px solid ${lookupStatus === "found" ? "rgba(16,185,129,0.4)" : "var(--border)"}`, background: lookupStatus === "found" ? "rgba(16,185,129,0.03)" : "var(--surface-2)", fontSize: 13.5, fontWeight: 500, color: "var(--text)", fontFamily: "inherit", outline: "none", boxShadow: lookupStatus === "found" ? "0 0 0 3px rgba(16,185,129,0.12)" : "none", transition: "all 0.15s" }}
              />
              {lookupStatus === "found" && (
                <>
                  <CheckCircle2 size={14} style={{ position: "absolute", right: 56, top: "50%", transform: "translateY(-50%)", color: "#10B981", pointerEvents: "none" }} />
                  <button type="button" onClick={clearSelection}
                    style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.18)", borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", padding: "3px 7px", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 700, gap: 2, fontFamily: "inherit" }}>
                    <X size={10} /> Clear
                  </button>
                </>
              )}
              {dropdownOpen && filteredSources.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid rgba(11,95,255,0.15)", borderRadius: 12, boxShadow: "0 16px 48px rgba(11,95,255,0.12),0 4px 12px rgba(0,0,0,0.08)", zIndex: 999, maxHeight: 240, overflowY: "auto" }}>
                  <div style={{ padding: "7px 12px 4px", fontSize: 10, fontWeight: 700, color: "#0B5FFF", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid rgba(11,95,255,0.08)" }}>
                    {filteredSources.length} record{filteredSources.length !== 1 ? "s" : ""} found
                  </div>
                  {filteredSources.map((entity) => {
                    const srcConfig = {
                      lead:     { dot: "#6366F1", label: "LEAD",     bg: "linear-gradient(135deg,#6366F1,#8B5CF6)" },
                      pipeline: { dot: "#8B5CF6", label: "PIPELINE", bg: "linear-gradient(135deg,#8B5CF6,#A78BFA)" },
                      deal:     { dot: "#10B981", label: "DEAL",     bg: "linear-gradient(135deg,#10B981,#34D399)" },
                    };
                    const sc = srcConfig[entity._src] || srcConfig.lead;
                    return (
                      <button key={entity.id} type="button"
                        onMouseDown={(e) => { e.preventDefault(); selectEntity(entity); }}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,95,255,0.04)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 80 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
                          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: "#0B5FFF" }}>{entity.lead_code || (entity._src === "deal" ? "DEAL" : "—")}</span>
                        </div>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entity.company_name || entity.title || "—"}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[entity.contact_name, entity.email].filter(Boolean).join(" · ")}</div>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: sc.bg, color: "#fff", flexShrink: 0 }}>{sc.label}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
              {dropdownOpen && leadCodeInput.trim() && filteredSources.length === 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 11, padding: "12px 14px", fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", zIndex: 999 }}>
                  No match for &ldquo;<strong style={{ color: "var(--text)" }}>{leadCodeInput}</strong>&rdquo;
                </div>
              )}
            </div>
            {crmEntity && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 9, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <CheckCircle2 size={13} style={{ color: "#10B981", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#059669" }}>Linked to {crmEntity._src === "deal" ? "Deal" : "Lead"}: {crmEntity.lead_code ? `${crmEntity.lead_code} — ` : ""}{crmEntity.company_name || crmEntity.title}</span>
                <span style={{ fontSize: 10.5, color: "#10B981", marginLeft: 4 }}>Auto-filled ✓</span>
              </div>
            )}
            {noPocError && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", borderRadius: 9, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <AlertCircle size={13} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: "#DC2626", lineHeight: 1.5 }}>No Contact Person or Email found for this lead. Update the lead in the Leads module first.</span>
              </div>
            )}
          </div>

          {/* ── SECTION 1 — MEETING TYPE ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>1</div>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>Meeting Type</span>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>— How will this meeting take place?</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { key: "online",  label: "Virtual Meeting",   Icon: Video,  desc: "Google Meet, Teams, Zoom" },
                { key: "offline", label: "In-Person Meeting", Icon: MapPin, desc: "Physical location / venue" },
              ].map(({ key, label, Icon, desc }) => {
                const isActive = mode === key;
                return (
                  <button key={key} type="button" onClick={() => setMode(key)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, border: `2px solid ${isActive ? "var(--accent)" : "var(--border)"}`, background: isActive ? "rgba(37,99,235,0.05)" : "var(--surface-2)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: isActive ? "rgba(37,99,235,0.12)" : "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={16} style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: isActive ? "var(--accent)" : "var(--text)", lineHeight: 1.3 }}>{label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div>
                    </div>
                    {isActive && <CheckCircle2 size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>

            {/* Platform selection — virtual only */}
            {mode === "online" && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Platform</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
                  {[
                    { key: "google_meet", label: "Google Meet", emoji: "📹", color: "#EA4335" },
                    { key: "teams",       label: "MS Teams",    emoji: "🟦", color: "#6264A7" },
                    { key: "zoom",        label: "Zoom",        emoji: "🎥", color: "#2D8CFF" },
                    { key: "custom",      label: "Custom Link", emoji: "🔗", color: "#6366F1" },
                  ].map(({ key, label, emoji, color }) => {
                    const isActive = platform === key;
                    return (
                      <button key={key} type="button" onClick={() => setPlatform(key)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "10px 8px", borderRadius: 10, border: `1.5px solid ${isActive ? color : "var(--border)"}`, background: isActive ? `${color}15` : "var(--surface-2)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                        <span style={{ fontSize: 20 }}>{emoji}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? color : "var(--text-muted)" }}>{label}</span>
                      </button>
                    );
                  })}
                </div>
                <div>
                  <label className="crm-label">
                    Meeting Link
                    <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                      {(platform === "google_meet" && oauthStatus.google_meet?.connected) ||
                       (platform === "teams" && oauthStatus.microsoft_teams?.connected)
                        ? "Auto-generated on save · override below if needed"
                        : "Enter manually or connect your account for auto-generation"}
                    </span>
                  </label>

                  {/* Google Meet: OAuth connect / status banner */}
                  {platform === "google_meet" && (
                    <div style={{ marginBottom: 8 }}>
                      {oauthStatus.google_meet?.connected ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                          <CheckCircle2 size={14} style={{ color: "#10B981", flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#10B981", flex: 1 }}>
                            Google connected{oauthStatus.google_meet.email ? ` · ${oauthStatus.google_meet.email}` : ""} — Meet link auto-generates on save
                          </span>
                          <button type="button" onClick={handleDisconnectGoogle}
                            style={{ fontSize: 11, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}>
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                          <Video size={14} style={{ color: "#EA4335", flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>Connect your Google account to auto-generate Meet links</span>
                          <button type="button" onClick={handleConnectGoogle}
                            style={{ fontSize: 12, fontWeight: 600, color: "#EA4335", background: "rgba(234,67,53,0.08)", border: "1px solid rgba(234,67,53,0.2)", borderRadius: 6, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                            Connect Google
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MS Teams: OAuth connect / status banner */}
                  {platform === "teams" && (
                    <div style={{ marginBottom: 8 }}>
                      {oauthStatus.microsoft_teams?.connected ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                          <CheckCircle2 size={14} style={{ color: "#10B981", flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#10B981", flex: 1 }}>
                            Microsoft connected{oauthStatus.microsoft_teams.email ? ` · ${oauthStatus.microsoft_teams.email}` : ""} — Teams link auto-generates on save
                          </span>
                          <button type="button" onClick={handleDisconnectMicrosoft}
                            style={{ fontSize: 11, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}>
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                          <MessageCircle size={14} style={{ color: "#6264A7", flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>Connect your Microsoft 365 account to auto-generate Teams links</span>
                          <button type="button" onClick={handleConnectMicrosoft}
                            style={{ fontSize: 12, fontWeight: 600, color: "#6264A7", background: "rgba(98,100,167,0.08)", border: "1px solid rgba(98,100,167,0.2)", borderRadius: 6, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                            Connect Microsoft
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <input className="crm-input" {...register("meeting_link")}
                    placeholder={platform === "google_meet" ? "https://meet.google.com/abc-defg-hij" : platform === "teams" ? "https://teams.microsoft.com/l/meetup-join/..." : platform === "zoom" ? "https://zoom.us/j/123456789" : "https://..."}
                  />
                  {watchedLink && (
                    <a href={watchedLink} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5, fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
                      <ExternalLink size={11} /> Preview link
                    </a>
                  )}
                  {oauthLoading && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
                      <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Generating meeting link…
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Location — in-person only */}
            {mode === "offline" && (
              <div>
                <label className="crm-label">Location / Venue *</label>
                {import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
                  <GoogleMapsAutocomplete
                    inputId="meeting-location-input"
                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                    onPlaceSelected={(place) => {
                      setValue("location", place.formattedAddress);
                      setLocationLat(place.lat);
                      setLocationLng(place.lng);
                      setLocationPlaceId(place.placeId || null);
                    }}
                  />
                )}
                <input id="meeting-location-input" className="crm-input"
                  {...register("location")}
                  placeholder="Search address or enter venue name…"
                  onChange={(e) => {
                    // Clear pinned coordinates when user manually edits the text
                    if (!e.target.value) {
                      setLocationLat(null);
                      setLocationLng(null);
                      setLocationPlaceId(null);
                    }
                  }}
                />
                {locationLat && locationLng && (
                  <>
                    {/* Static map preview */}
                    {import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
                      <div style={{ marginTop: 10, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
                        <img
                          src={`https://maps.googleapis.com/maps/api/staticmap?center=${locationLat},${locationLng}&zoom=15&size=640x180&scale=2&markers=color:red%7C${locationLat},${locationLng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`}
                          alt="Location preview"
                          style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                        />
                      </div>
                    )}
                    <a
                      href={`https://maps.google.com/?q=${locationLat},${locationLng}${locationPlaceId ? `&query_place_id=${locationPlaceId}` : ""}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 12, fontWeight: 600, color: "#10B981", textDecoration: "none", padding: "5px 10px", borderRadius: 6, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                      <MapPin size={11} /> View on Google Maps ↗
                    </a>
                  </>
                )}
                {!locationLat && !locationLng && !import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
                    Add VITE_GOOGLE_MAPS_API_KEY to enable location autocomplete and map preview
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── SECTION 2 — CLIENT DETAILS ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>2</div>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>Client Details</span>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>— Customer and company information</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="crm-label">Company Name *</label>
                <input className="crm-input" {...register("company_name", { required: "Company name is required" })} placeholder="Acme Corporation" />
                {errors.company_name && <div style={{ fontSize: 11.5, color: "#EF4444", marginTop: 4 }}>{errors.company_name.message}</div>}
              </div>
              <div>
                <label className="crm-label">Contact Person</label>
                <input className="crm-input" {...register("customer_name")} placeholder="John Doe" />
              </div>
              <div>
                <label className="crm-label">Email <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 400 }}>(calendar invite)</span></label>
                <input className="crm-input" type="email" {...register("customer_email")} placeholder="john@company.com" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="crm-label">Phone</label>
                <input className="crm-input" {...register("customer_phone")} placeholder="+91 98765 43210" />
              </div>
            </div>
          </div>

          {/* ── SECTION 3 — MEETING DETAILS ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>3</div>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>Meeting Details</span>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>— Title, purpose and agenda</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="crm-label">Meeting Title *</label>
                <input className="crm-input"
                  {...register("title", { required: "Title is required" })}
                  placeholder={crmEntity ? `Meeting — ${crmEntity.company_name || crmEntity.title || ""}` : "e.g. Product Demo — Acme Corp"}
                />
                {errors.title && <div style={{ fontSize: 11.5, color: "#EF4444", marginTop: 4 }}>{errors.title.message}</div>}
              </div>
              <div>
                <label className="crm-label">Priority</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {Object.entries(PRIORITY_META).map(([key, { label, color, bg }]) => (
                    <button key={key} type="button" onClick={() => setPriority(key)}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 9, border: `1.5px solid ${priority === key ? color : "var(--border)"}`, background: priority === key ? bg : "var(--surface-2)", color: priority === key ? color : "var(--text-muted)", fontSize: 12, fontWeight: priority === key ? 700 : 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "all 0.12s" }}>
                      <Flag size={11} /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="crm-label">Meeting Purpose</label>
                <select className="crm-input" value={purpose} onChange={(e) => { setPurpose(e.target.value); setPurposeOther(""); }} style={{ appearance: "auto" }}>
                  <option value="">— Select purpose —</option>
                  {MEETING_PURPOSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                {purpose && purpose !== "others" && (() => {
                  const mp = MEETING_PURPOSES.find((p) => p.key === purpose);
                  return mp ? <span style={{ display: "inline-flex", alignItems: "center", marginTop: 6, fontSize: 11.5, fontWeight: 700, padding: "2px 10px", borderRadius: 99, background: mp.bg, color: mp.color }}>{mp.label}</span> : null;
                })()}
                {purpose === "others" && (
                  <input className="crm-input" value={purposeOther} onChange={(e) => setPurposeOther(e.target.value)} placeholder="Please specify the meeting purpose…" style={{ marginTop: 8 }} />
                )}
              </div>
              <div>
                <label className="crm-label">
                  Agenda *
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>Included verbatim in calendar invite</span>
                </label>
                <textarea className="crm-input" rows={3}
                  {...register("agenda", { required: "Agenda is required" })}
                  placeholder={"1. Introduction\n2. Product walkthrough\n3. Pricing discussion\n4. Q&A"}
                  style={{ resize: "vertical" }}
                />
                {errors.agenda && <div style={{ fontSize: 11.5, color: "#EF4444", marginTop: 4 }}>{errors.agenda.message}</div>}
              </div>
            </div>
          </div>

          {/* ── SECTION 4 — DATE & TIME ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>4</div>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>Date & Time</span>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>— Schedule the meeting slot</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
                <div onClick={() => setAllDay((v) => !v)}
                  style={{ width: 40, height: 22, borderRadius: 99, background: allDay ? "var(--accent)" : "var(--border)", transition: "background 0.15s", position: "relative", cursor: "pointer", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 3, left: allDay ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>All Day Event</span>
              </label>

              <div>
                <label className="crm-label">Meeting Date *</label>
                <input className="crm-input" type="date" value={meetingDate} min={todayStr} onChange={(e) => setMeetingDate(e.target.value)} />
              </div>

              {!allDay && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="crm-label">Start Time *</label>
                    <select className="crm-input" value={meetingSlot} onChange={(e) => setMeetingSlot(e.target.value)} style={{ appearance: "auto" }}>
                      <option value="">— Pick a time —</option>
                      {TIME_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="crm-label">Duration</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                      {DURATIONS.map(({ value, label }) => (
                        <button key={value} type="button" onClick={() => setDuration(value)}
                          style={{ padding: "7px 4px", borderRadius: 8, border: `1.5px solid ${duration === value ? "var(--accent)" : "var(--border)"}`, background: duration === value ? "rgba(37,99,235,0.08)" : "var(--surface-2)", color: duration === value ? "var(--accent)" : "var(--text-muted)", fontSize: 11.5, fontWeight: duration === value ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!allDay && meetingSlot && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.15)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock size={12} style={{ color: "var(--accent)" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Start: <strong style={{ color: "var(--text)" }}>{TIME_SLOTS.find((s) => s.value === meetingSlot)?.label}</strong></span>
                  </div>
                  {endTimeLabel && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Clock size={12} style={{ color: "#10B981" }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>End: <strong style={{ color: "var(--text)" }}>{endTimeLabel}</strong></span>
                    </div>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(37,99,235,0.1)", color: "var(--accent)" }}>{durationLabel}</span>
                </div>
              )}

              {conflictMeetings.length > 0 && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <AlertCircle size={14} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", marginBottom: 3 }}>
                      Scheduling Conflict ({conflictMeetings.length})
                    </div>
                    {conflictMeetings.slice(0, 2).map((mt) => (
                      <div key={mt.id} style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                        {codeMap[mt.id] || "MEET-?"}: {mt.title} ({fmtDate(mt.start_time)})
                      </div>
                    ))}
                    {conflictMeetings.length > 2 && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>+{conflictMeetings.length - 2} more conflicts</div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="crm-label">Timezone</label>
                  <select className="crm-input" {...register("timezone")} style={{ appearance: "auto" }}>
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label className="crm-label">Status</label>
                  <select className="crm-input" {...register("status")} style={{ appearance: "auto" }}>
                    {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION 5 — ATTENDEES ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>5</div>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>Attendees</span>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>— Internal team and external participants</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="crm-label">
                  External Participants
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>Each gets a calendar invite</span>
                </label>
                <textarea className="crm-input" rows={2}
                  value={externalEmails}
                  onChange={(e) => setExternalEmails(e.target.value)}
                  placeholder="client@company.com, partner@firm.com, vendor@co.com…"
                  style={{ resize: "vertical" }}
                />
                {externalEmailsList.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {externalEmailsList.map((email, i) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", fontSize: 11.5, fontWeight: 600, color: "var(--accent)" }}>
                        <AtSign size={10} /> {email}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="crm-label">Internal Participants</label>
                {attendeeIds.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {attendeeIds.map((id) => {
                      const tm = teamMembers.find((m) => m.id === id);
                      return tm ? (
                        <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 8px", borderRadius: 99, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", fontSize: 12, fontWeight: 600, color: "#6366F1" }}>
                          <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#6366F1", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                            {tm.full_name.charAt(0).toUpperCase()}
                          </span>
                          {tm.full_name}
                          <button type="button" onClick={() => toggleAttendee(id)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366F1", display: "flex", alignItems: "center", opacity: 0.6, lineHeight: 1 }}>
                            <X size={11} />
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                <div ref={teamDropRef} style={{ position: "relative" }}>
                  <Search size={12} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none", zIndex: 1 }} />
                  <input
                    value={teamSearch}
                    onChange={(e) => { setTeamSearch(e.target.value); setTeamDropOpen(true); }}
                    onFocus={() => setTeamDropOpen(true)}
                    placeholder={attendeeIds.length ? "Add more team members…" : "Search team members to add…"}
                    style={{ width: "100%", boxSizing: "border-box", height: 38, paddingLeft: 30, paddingRight: 14, borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 12.5, color: "var(--text)", fontFamily: "inherit", outline: "none" }}
                  />
                  {teamDropOpen && teamMembers.filter((tm) => !teamSearch || tm.full_name.toLowerCase().includes(teamSearch.toLowerCase())).length > 0 && (
                    <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.12)", zIndex: 999, maxHeight: 200, overflowY: "auto" }}>
                      {teamMembers
                        .filter((tm) => !teamSearch || tm.full_name.toLowerCase().includes(teamSearch.toLowerCase()))
                        .map((tm) => {
                          const selected = attendeeIds.includes(tm.id);
                          return (
                            <button key={tm.id} type="button"
                              onMouseDown={(e) => { e.preventDefault(); toggleAttendee(tm.id); setTeamSearch(""); setTeamDropOpen(false); }}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: selected ? "rgba(99,102,241,0.05)" : "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                              onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "rgba(0,0,0,0.03)"; }}
                              onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "none"; }}>
                              <div style={{ width: 28, height: 28, borderRadius: "50%", background: selected ? "#6366F1" : "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: selected ? "#fff" : "var(--text-muted)", flexShrink: 0 }}>
                                {tm.full_name.charAt(0).toUpperCase()}
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
            </div>
          </div>

          {/* ── SECTION 6 — CALENDAR SETTINGS ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>6</div>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>Calendar Settings</span>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>— Invite and notification preferences</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Send Calendar Invite",    desc: "iCal invite emailed to all attendees",  Icon: CalendarCheck },
                { label: "Block Calendar Slot",     desc: "Event added to attendee calendars",     Icon: Calendar      },
                { label: "Notify All Participants", desc: "Branded Ccentrik invite email sent",    Icon: Mail          },
              ].map(({ label, desc, Icon }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.18)" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} style={{ color: "#10B981" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{label}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{desc}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
                    <CheckCircle2 size={11} style={{ color: "#10B981" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#059669" }}>Always On</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── SECTION 7 — INTERNAL NOTES ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>7</div>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>Internal Notes</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: "rgba(245,158,11,0.1)", color: "#B45309", marginLeft: 4 }}>INTERNAL</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <textarea className="crm-input" rows={2}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Client context, objections, key talking points, pre-meeting briefing…"
              style={{ resize: "vertical", background: internalNotes ? "rgba(245,158,11,0.02)" : undefined, borderColor: internalNotes ? "rgba(245,158,11,0.3)" : undefined }}
            />
            <div style={{ marginTop: 5, fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
              <Lock size={10} style={{ color: "var(--text-muted)" }} />
              Never shared with client or included in calendar invites
            </div>
          </div>

          {/* ── SECTION 8 — REVIEW ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>8</div>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>Review Before Scheduling</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Meeting Title", value: watchedTitle || "—" },
                { label: "Company",       value: watchedCompany || "—" },
                { label: "Date",          value: meetingDate ? new Date(meetingDate + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—" },
                { label: "Time",          value: allDay ? "All Day" : meetingSlot ? `${TIME_SLOTS.find((s) => s.value === meetingSlot)?.label || ""}${endTimeLabel ? ` → ${endTimeLabel}` : ""}` : "—" },
                { label: "Duration",      value: allDay ? "All Day" : durationLabel },
                { label: "Type",          value: mode === "online" ? `Virtual — ${({ google_meet: "Google Meet", teams: "MS Teams", zoom: "Zoom", custom: "Custom" })[platform] || platform}` : "In-Person Meeting" },
                { label: mode === "online" ? "Meeting Link" : "Location", value: mode === "online" ? (watchedLink || "Auto-generated") : (watchedLocation || "—") },
                { label: "Attendees",     value: `${[watchedEmail, ...externalEmailsList].filter(Boolean).length + attendeeIds.length} participant(s)` },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: "10px 12px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", wordBreak: "break-word" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ height: 44, padding: "0 22px", borderRadius: 12 }}>Cancel</button>
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileHover={!isSubmitting ? { scale: 1.02 } : {}}
              whileTap={!isSubmitting ? { scale: 0.97 } : {}}
              className="btn-primary"
              style={{ height: 44, padding: "0 28px", borderRadius: 12, fontSize: 14, fontWeight: 700, opacity: isSubmitting ? 0.65 : 1, cursor: isSubmitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}
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

// ─── Meeting Detail Panel ─────────────────────────────────────────────────────

function MeetingDetailPanel({ meeting, codeMap, canDelete, onClose, onEdit, onComplete, onDelete, onFollowUp }) {
  if (!meeting) return null;

  const sm        = STATUS_META[meeting.status] || STATUS_META.scheduled;
  const isOverdue = meeting.status === "scheduled" && meeting.start_time && isPast(new Date(meeting.start_time));
  const isOnline  = meeting.mode === "online" || meeting.meeting_type !== "in_person";
  const fmtDT     = (d) => { try { return format(new Date(d), "EEE, MMM d, yyyy"); } catch { return "—"; } };
  const fmtTime   = (d) => { try { return format(new Date(d), "h:mm a"); } catch { return null; } };
  const platformLabel = { google_meet: "Google Meet", teams: "MS Teams", zoom: "Zoom", custom: "Custom Link" };

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
      style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 420, maxWidth: "95vw", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "-6px 0 32px rgba(0,0,0,0.12)", zIndex: 40, display: "flex", flexDirection: "column" }}
    >
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "2px 7px", borderRadius: 6, border: "1px solid rgba(99,102,241,0.18)" }}>
                {codeMap[meeting.id] || "—"}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: sm.bg, color: sm.color }}>{sm.label}</span>
              {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.08)", padding: "2px 6px", borderRadius: 99 }}>Overdue</span>}
              {meeting.priority && <PriorityBadge priority={meeting.priority} />}
            </div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)", lineHeight: 1.3 }}>{meeting.title}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4, flexShrink: 0 }}><X size={18} /></button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

        {/* Date & Time */}
        <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Date</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{fmtDT(meeting.start_time)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Time (IST)</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              {fmtTime(meeting.start_time) || "—"}{meeting.end_time ? ` – ${fmtTime(meeting.end_time)}` : ""}
            </div>
          </div>
        </div>

        {/* Mode + Link/Location */}
        <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: isOnline && meeting.meeting_link ? 8 : 0 }}>
            {isOnline
              ? <><Video size={13} style={{ color: "#3B82F6" }} /><span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Online Meeting</span><span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>— {platformLabel[meeting.meeting_type] || meeting.meeting_type || ""}</span></>
              : <><MapPin size={13} style={{ color: "#10B981" }} /><span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>In-Person</span></>
            }
          </div>
          {isOnline && meeting.meeting_link && (
            <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--accent)", textDecoration: "none", background: "rgba(99,102,241,0.06)", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.15)", wordBreak: "break-all" }}>
              <ExternalLink size={11} style={{ flexShrink: 0 }} /> {meeting.meeting_link}
            </a>
          )}
          {!isOnline && meeting.location && (
            <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
              <MapPin size={11} style={{ color: "var(--text-muted)" }} /> {meeting.location}
            </div>
          )}
        </div>

        {/* Client */}
        {(meeting.customer_name || meeting.customer_email || meeting.company_name) && (
          <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Client</div>
            {meeting.customer_name && <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>{meeting.customer_name}</div>}
            {meeting.company_name && <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}><Building2 size={11} style={{ color: "var(--text-muted)" }} />{meeting.company_name}</div>}
            {meeting.customer_email && <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}><Mail size={11} style={{ color: "var(--text-muted)" }} />{meeting.customer_email}</div>}
          </div>
        )}

        {/* Purpose + Outcome */}
        {(meeting.meeting_purpose || meeting.outcome) && (
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            {meeting.meeting_purpose && (
              <div style={{ flex: 1, minWidth: 120, background: "var(--surface-2)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Purpose</div>
                <PurposeBadge purpose={meeting.meeting_purpose} />
              </div>
            )}
            {meeting.outcome && (
              <div style={{ flex: 1, minWidth: 120, background: "var(--surface-2)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Outcome</div>
                <OutcomeBadge outcome={meeting.outcome} />
                {meeting.outcome_notes && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.4 }}>{meeting.outcome_notes}</div>}
              </div>
            )}
          </div>
        )}

        {/* Team Attendees */}
        {meeting.attendees?.length > 0 && (
          <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Team Attendees</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {meeting.attendees.map((a, i) => {
                const u = a.user || a;
                return (
                  <div key={u?.id || i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {u?.avatar_url
                      ? <img src={u.avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
                      : <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>{(u?.full_name?.[0] || "?").toUpperCase()}</div>
                    }
                    <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 600 }}>{u?.full_name || "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Agenda */}
        {meeting.agenda && (
          <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Agenda</div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{meeting.agenda}</div>
          </div>
        )}

        {/* Internal Notes */}
        {meeting.internal_notes && (
          <div style={{ background: "rgba(245,158,11,0.04)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid rgba(245,158,11,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <Lock size={11} style={{ color: "#B45309" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.06em" }}>Internal Notes</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{meeting.internal_notes}</div>
          </div>
        )}

        {/* CRM Links */}
        {(meeting.lead_id || meeting.deal_id) && (
          <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "13px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>CRM Links</div>
            {meeting.linked_lead && (
              <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}>
                <Link2 size={11} style={{ color: "var(--text-muted)" }} />
                Lead: <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#6366F1" }}>{meeting.linked_lead.lead_code}</span>
              </div>
            )}
          </div>
        )}

        {/* Next Follow-up */}
        {meeting.next_follow_up && (
          <div style={{ background: "rgba(59,130,246,0.04)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, border: "1px solid rgba(59,130,246,0.15)", display: "flex", alignItems: "center", gap: 6 }}>
            <Calendar size={13} style={{ color: "#3B82F6" }} />
            <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Follow-up: {format(new Date(meeting.next_follow_up), "MMM d, yyyy")}</span>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {meeting.status === "scheduled" && (
          <button onClick={() => { onComplete(meeting); onClose(); }}
            style={{ flex: 1, minWidth: 80, height: 36, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8, background: "#10B981", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            <CheckCircle2 size={13} /> Done
          </button>
        )}
        <button onClick={() => { onFollowUp(meeting); onClose(); }}
          style={{ flex: 1, minWidth: 80, height: 36, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)", cursor: "pointer", fontFamily: "inherit" }}>
          <GitBranch size={13} /> Follow-up
        </button>
        <button onClick={() => { onEdit(meeting); onClose(); }} className="btn-secondary"
          style={{ height: 36, padding: "0 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
          <Pencil size={13} /> Edit
        </button>
        {canDelete && (
          <button onClick={() => { if (window.confirm("Delete this meeting?")) { onDelete(meeting.id); onClose(); } }}
            style={{ height: 36, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer", fontFamily: "inherit" }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </motion.div>
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

  // Handle OAuth redirect callbacks (oauth_success / oauth_error query params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("oauth_success");
    const error   = params.get("oauth_error");
    const reason  = params.get("reason");
    if (success) {
      const label = success === "google" ? "Google" : "Microsoft";
      toast.success(`${label} account connected! Your meeting links will now be auto-generated.`);
      // Remove query params without a page reload
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      const label = error === "google" ? "Google" : "Microsoft";
      toast.error(`Failed to connect ${label} account${reason ? ` (${reason})` : ""}. Please try again.`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showForm, setShowForm] = useState(false);
  const [editMeeting, setEditMeeting] = useState(null);
  const [postMeeting, setPostMeeting] = useState(null);
  const [followUpMeeting, setFollowUpMeeting] = useState(null);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [viewMode, setViewMode] = useState("table"); // table | list | calendar
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
  const overdueCount   = allMeetings.filter((m) => m.status === "scheduled" && m.start_time && isPast(new Date(m.start_time))).length;

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
      if (!result.emailSent) {
        const errMsg = result.emailError || "check SMTP settings";
        toast(`Email delivery failed — ${errMsg}`, { icon: "⚠️", duration: 10000 });
      }
      return result.emailSent ?? false;
    } catch {
      toast("Could not reach email server", { icon: "⚠️" });
      return false;
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
    const { _extra_emails, _contact_method, _all_day, _lead_code, _meeting_id, _sequence, meeting_code, ...clean } = data;
    return clean;
  };

  const exportCSV = useCallback(() => {
    const headers = ["Meeting ID","Title","Client","Company","Email","Date","Start Time","End Time","Mode","Status","Purpose","Priority","Outcome","Lead","Created At"];
    const rows = meetings.map((m) => [
      codeMap[m.id] || "",
      m.title || "",
      m.customer_name || "",
      m.company_name || "",
      m.customer_email || "",
      m.start_time ? format(new Date(m.start_time), "yyyy-MM-dd") : "",
      m.start_time ? format(new Date(m.start_time), "HH:mm") : "",
      m.end_time   ? format(new Date(m.end_time),   "HH:mm") : "",
      m.mode === "online" ? "Online" : "In-Person",
      m.status || "",
      m.meeting_purpose || "",
      m.priority || "medium",
      m.outcome || "",
      m.linked_lead?.lead_code || "",
      m.created_at ? format(new Date(m.created_at), "yyyy-MM-dd") : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `meetings-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${meetings.length} meeting${meetings.length !== 1 ? "s" : ""}`);
  }, [meetings, codeMap]);

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
      const emailSent = await sendMeetingInvite({ ...data, _meeting_id: meeting.id, _sequence: 0 }, false);
      logMeetingActivity(data, meeting.id, "scheduled");
      logMeetingHistory(data, "scheduled");
      return { meeting, data, emailSent };
    },
    onSuccess: ({ emailSent }) => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      if (emailSent) {
        toast.success("Meeting scheduled — iCal invite sent, event will appear in attendee's calendar automatically");
      } else {
        toast.success("Meeting scheduled successfully");
      }
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total",     value: totalCount,     color: "#6B7280", Icon: CalendarCheck },
            { label: "Today",     value: todayCount,     color: "#F59E0B", Icon: Clock         },
            { label: "Upcoming",  value: upcomingCount,  color: "#3B82F6", Icon: Calendar      },
            { label: "Completed", value: completedCount, color: "#10B981", Icon: CheckCircle2  },
            { label: "Overdue",   value: overdueCount,   color: "#EF4444", Icon: AlertCircle   },
          ].map((s) => (
            <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <s.Icon size={17} style={{ color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
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
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {/* View mode toggle */}
            <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", padding: 3, borderRadius: 9, border: "1px solid var(--border)" }}>
              {[
                { key: "table",    Icon: LayoutGrid,   title: "Table View"    },
                { key: "list",     Icon: LayoutList,   title: "List View"     },
                { key: "calendar", Icon: CalendarDays, title: "Calendar View" },
              ].map(({ key, Icon, title }) => (
                <button key={key} title={title} onClick={() => setViewMode(key)}
                  style={{ padding: "5px 8px", borderRadius: 7, background: viewMode === key ? "var(--accent)" : "transparent", border: "none", cursor: "pointer", color: viewMode === key ? "#fff" : "var(--text-muted)", display: "flex", alignItems: "center", transition: "all 0.12s" }}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
            {/* Export CSV */}
            <button onClick={exportCSV} className="btn-ghost" title="Export CSV" style={{ height: 36, padding: "0 10px", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
              <Download size={13} /> Export
            </button>
            {viewMode === "table" && <ColumnToggle allColumns={MTG_COLUMNS} hiddenSet={hiddenSet} onToggle={toggleColumn} onReset={resetColumns} />}
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
        ) : viewMode === "calendar" ? (
          <CalendarView meetings={meetings} codeMap={codeMap} onSelectMeeting={setSelectedMeeting} />
        ) : viewMode === "list" ? (
          <ListView
            meetings={meetings}
            codeMap={codeMap}
            onSelect={setSelectedMeeting}
            onEdit={setEditMeeting}
            onComplete={setPostMeeting}
            onDelete={(id) => deleteMutation.mutate(id)}
            onFollowUp={setFollowUpMeeting}
            canDelete={canDelete}
          />
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
                      const dur = getDurationStr(m.start_time, m.end_time);
                      const isOverdue = m.status === "scheduled" && m.start_time && isPast(new Date(m.start_time));
                      return (
                        <motion.tr key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.02, duration: 0.16 }}
                          onClick={() => setSelectedMeeting(m)}
                          style={{ cursor: "pointer" }}
                        >
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
                                    {copiedId === m.id ? <CheckCircle2 size={11} style={{ color: "#10B981" }} /> : <Copy size={11} />}
                                  </motion.button>
                                )}
                              </div>
                            </td>
                          )}
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 3 }}>{m.title}</div>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {m.meeting_purpose && <PurposeBadge purpose={m.meeting_purpose} />}
                              {m.priority && m.priority !== "medium" && <PriorityBadge priority={m.priority} />}
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
                            {dur && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{dur}</div>}
                          </td>
                          {isVisible("mode") && (
                            <td>
                              {m.mode === "online" || m.meeting_type !== "in_person" ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(59,130,246,0.1)", color: "#3B82F6", display: "flex", alignItems: "center", gap: 4 }}>
                                    <Video size={9} /> Online
                                  </span>
                                  {m.meeting_link && <a href={m.meeting_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }} onClick={(e) => e.stopPropagation()}><ExternalLink size={12} /></a>}
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
                            <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                              {m.status === "scheduled" && (
                                <motion.button onClick={() => setPostMeeting(m)} title="Mark Complete" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.22)", cursor: "pointer", fontFamily: "inherit" }}>
                                  <CheckCircle2 size={11} /> Done
                                </motion.button>
                              )}
                              <motion.button onClick={() => setFollowUpMeeting(m)} title="Schedule Follow-up Meeting" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: "rgba(99,102,241,0.1)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.22)", cursor: "pointer", fontFamily: "inherit" }}>
                                <GitBranch size={11} /> Follow-up
                              </motion.button>
                              <motion.button onClick={() => setEditMeeting(m)} className="btn-ghost" style={{ padding: "4px 6px" }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                <Pencil size={13} strokeWidth={1.75} />
                              </motion.button>
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

      {/* ── Meeting Detail Panel ── */}
      <AnimatePresence>
        {selectedMeeting && (
          <>
            <motion.div key="detail-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 39 }}
              onClick={() => setSelectedMeeting(null)}
            />
            <MeetingDetailPanel
              key="detail-panel"
              meeting={selectedMeeting}
              codeMap={codeMap}
              canDelete={canDelete}
              onClose={() => setSelectedMeeting(null)}
              onEdit={(m) => { setEditMeeting(m); setSelectedMeeting(null); }}
              onComplete={(m) => { setPostMeeting(m); setSelectedMeeting(null); }}
              onDelete={(id) => { deleteMutation.mutate(id); setSelectedMeeting(null); }}
              onFollowUp={(m) => { setFollowUpMeeting(m); setSelectedMeeting(null); }}
            />
          </>
        )}
      </AnimatePresence>

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
