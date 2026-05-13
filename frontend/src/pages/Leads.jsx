import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { leadsService } from "../services/leadsService";
import { teamService } from "../services/teamService";
import { supabase } from "../supabaseClient";
import LeadDetailPanel from "../components/LeadDetailPanel";
import toast from "react-hot-toast";
import {
  Plus, Search, Pencil, Trash2, X, Users, Download, Upload, Lock,
  Flame, Thermometer, Snowflake, Globe, ArrowRightLeft, Star,
  UserCheck, CheckSquare, Square, ChevronDown, TrendingUp,
  ArrowUpDown, Brain, Trophy, CalendarClock, UserPlus, Filter,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const parseJSON = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };
const toJSON    = (obj) => JSON.stringify(obj);
const fmt = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};

// ─── Lead Scoring (0-100) ────────────────────────────────────────────────────
function leadScore(lead) {
  let score = 0;
  // Temperature (max 35)
  if (lead.temperature === "hot")  score += 35;
  else if (lead.temperature === "warm") score += 20;
  else if (lead.temperature === "cold") score += 8;

  // Stage (max 30)
  const stageMap = { won: 30, meeting_set: 25, first_comm: 18, connected: 12, pending: 5, lost: 0 };
  score += stageMap[lead.stage] ?? 5;

  // Source (max 20)
  const sourceMap = { Referral: 20, LinkedIn: 15, Event: 12, Website: 10, Facebook: 7, Instagram: 7, "Cold Call": 5, Other: 3 };
  score += sourceMap[lead.source] ?? 0;

  // Recency (max 15)
  const days = lead.created_at
    ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
    : 999;
  if (days < 7)       score += 15;
  else if (days < 30) score += 10;
  else if (days < 90) score += 5;

  return Math.min(100, score);
}

function scoreColor(s) {
  if (s >= 70) return { color: "#10B981", bg: "#D1FAE5" };
  if (s >= 40) return { color: "#F59E0B", bg: "#FEF3C7" };
  return             { color: "#EF4444", bg: "#FEE2E2" };
}

// ─── Countries (dial code + phone length) ────────────────────────────────────
const COUNTRIES = [
  { code: "IN", name: "India",          dial: "+91",  len: [10, 10] },
  { code: "US", name: "United States",  dial: "+1",   len: [10, 10] },
  { code: "GB", name: "United Kingdom", dial: "+44",  len: [10, 10] },
  { code: "AE", name: "UAE",            dial: "+971", len: [9,  9]  },
  { code: "SG", name: "Singapore",      dial: "+65",  len: [8,  8]  },
  { code: "AU", name: "Australia",      dial: "+61",  len: [9,  9]  },
  { code: "CA", name: "Canada",         dial: "+1",   len: [10, 10] },
  { code: "DE", name: "Germany",        dial: "+49",  len: [10, 12] },
  { code: "FR", name: "France",         dial: "+33",  len: [9,  9]  },
  { code: "JP", name: "Japan",          dial: "+81",  len: [10, 11] },
  { code: "CN", name: "China",          dial: "+86",  len: [11, 11] },
  { code: "BR", name: "Brazil",         dial: "+55",  len: [10, 11] },
  { code: "ZA", name: "South Africa",   dial: "+27",  len: [9,  9]  },
  { code: "NG", name: "Nigeria",        dial: "+234", len: [10, 10] },
  { code: "PK", name: "Pakistan",       dial: "+92",  len: [10, 10] },
  { code: "BD", name: "Bangladesh",     dial: "+880", len: [10, 10] },
  { code: "NL", name: "Netherlands",    dial: "+31",  len: [9,  9]  },
  { code: "SA", name: "Saudi Arabia",   dial: "+966", len: [9,  9]  },
  { code: "MY", name: "Malaysia",       dial: "+60",  len: [9, 10]  },
  { code: "ID", name: "Indonesia",      dial: "+62",  len: [9, 12]  },
  { code: "PH", name: "Philippines",    dial: "+63",  len: [10, 10] },
  { code: "TH", name: "Thailand",       dial: "+66",  len: [9,  9]  },
  { code: "KR", name: "South Korea",    dial: "+82",  len: [9, 10]  },
  { code: "IT", name: "Italy",          dial: "+39",  len: [9, 10]  },
  { code: "ES", name: "Spain",          dial: "+34",  len: [9,  9]  },
  { code: "MX", name: "Mexico",         dial: "+52",  len: [10, 10] },
  { code: "NZ", name: "New Zealand",    dial: "+64",  len: [8,  9]  },
  { code: "SE", name: "Sweden",         dial: "+46",  len: [9,  9]  },
  { code: "NO", name: "Norway",         dial: "+47",  len: [8,  8]  },
  { code: "CH", name: "Switzerland",    dial: "+41",  len: [9,  9]  },
];

// ─── Constants ────────────────────────────────────────────────────────────────
const LEAD_SOURCES = ["Website", "Facebook", "Instagram", "LinkedIn", "Referral", "Cold Call", "Event", "Other"];

const TEMPERATURES = [
  { key: "hot",  label: "Hot",  icon: Flame,       color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  { key: "warm", label: "Warm", icon: Thermometer,  color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  { key: "cold", label: "Cold", icon: Snowflake,    color: "#3B82F6", bg: "rgba(59,130,246,0.1)"  },
];

const LEAD_STATUSES = [
  { key: "pending",     label: "Pending",     color: "#6B7280", bg: "#F3F4F6" },
  { key: "connected",   label: "Connected",   color: "#3B82F6", bg: "#DBEAFE" },
  { key: "first_comm",  label: "First Comm",  color: "#8B5CF6", bg: "#EDE9FE" },
  { key: "meeting_set", label: "Meeting Set", color: "#F59E0B", bg: "#FEF3C7" },
  { key: "won",         label: "Won",         color: "#10B981", bg: "#D1FAE5" },
  { key: "lost",        label: "Lost",        color: "#EF4444", bg: "#FEE2E2" },
];

const MEETING_STATUSES = ["—", "Scheduled", "Completed", "Cancelled", "Rescheduled"];

// ─── Notification helper ──────────────────────────────────────────────────────
async function notifyManagers(editorId, editorName, leadName, leadId) {
  try {
    const { data: managers } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["owner", "sales_head"])
      .neq("id", editorId);
    if (!managers?.length) return;
    await supabase.from("notifications").insert(
      managers.map((m) => ({
        user_id:     m.id,
        title:       "Lead Updated",
        message:     `${editorName} edited lead "${leadName}"`,
        type:        "lead_update",
        entity_id:   leadId,
        entity_type: "lead",
        read:        false,
      }))
    );
  } catch { /* non-critical */ }
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────
const LEADS_CSV_HEADERS = [
  "Company", "Contact Name", "Designation", "Email", "Phone", "Country",
  "Source", "Temperature", "LinkedIn URL",
  "Connect Request", "Connection Accept", "First Comm Date",
  "Meeting Date", "Lead Status", "Meeting Status", "Remarks",
];

function csvEsc(v) { return `"${(v || "").toString().replace(/"/g, '""')}"`; }

function exportLeadsCSV(rows) {
  const lines = [LEADS_CSV_HEADERS.map(csvEsc).join(",")];
  rows.forEach((l) => {
    const x = parseJSON(l.other_notes);
    lines.push([
      l.company_name, l.contact_name, l.designation,
      x.email, x.phone, x.country,
      l.source || x.source, l.temperature,
      x.linkedin_url,
      x.linkedin_connect_request, x.linkedin_connection_accept,
      x.first_comm_date, l.follow_up_date, l.stage,
      x.meeting_status, l.remarks,
    ].map(csvEsc).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "leads.csv" });
  a.click(); URL.revokeObjectURL(a.href);
}

function parseCSVText(text) {
  const parseLine = (line) => {
    const res = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (line[i] === ',' && !inQ) { res.push(cur.trim()); cur = ""; }
      else cur += line[i];
    }
    res.push(cur.trim()); return res;
  };
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((l) => {
    const v = parseLine(l);
    return Object.fromEntries(headers.map((h, i) => [h, v[i] || ""]));
  });
}

function csvLeadToPayload(row, userId) {
  return {
    company_name: row["Company"],
    contact_name: row["Contact Name"],
    designation:  row["Designation"],
    stage:        row["Lead Status"] || "pending",
    source:       row["Source"] || "",
    temperature:  row["Temperature"] || "",
    remarks:      row["Remarks"],
    follow_up_date: row["Meeting Date"] || null,
    other_notes: JSON.stringify({
      email:                     row["Email"],
      phone:                     row["Phone"],
      country:                   row["Country"],
      linkedin_url:              row["LinkedIn URL"],
      linkedin_connect_request:  row["Connect Request"],
      linkedin_connection_accept:row["Connection Accept"],
      first_comm_date:           row["First Comm Date"],
      meeting_status:            row["Meeting Status"],
    }),
    created_by: userId,
  };
}

// ─── Lead Modal ───────────────────────────────────────────────────────────────
function LeadModal({ lead, onClose, onSave, teamMembers }) {
  const extra = parseJSON(lead?.other_notes);
  const [selectedTemp, setSelectedTemp] = useState(lead?.temperature || extra.temperature || "");
  const [selectedCountry, setSelectedCountry] = useState(extra.country || "IN");
  const country = COUNTRIES.find((c) => c.code === selectedCountry) || COUNTRIES[0];

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      company_name:      lead?.company_name || "",
      contact_name:      lead?.contact_name || "",
      designation:       lead?.designation  || "",
      email:             extra.email || "",
      phone:             extra.phone || "",
      source:            lead?.source || extra.source || "",
      custom_source:     extra.custom_source || "",
      connect_request:   extra.linkedin_connect_request || "",
      connection_accept: extra.linkedin_connection_accept || "",
      first_comm_date:   extra.first_comm_date || "",
      remarks:           lead?.remarks || "",
      stage:             lead?.stage || "pending",
      meeting_status:    extra.meeting_status || "—",
      follow_up_date:    lead?.follow_up_date ? lead.follow_up_date.slice(0, 10) : "",
      assigned_to:       lead?.assigned_to || "",
      linkedin_url:      extra.linkedin_url || "",
    },
  });

  const watchSource = watch("source");

  const handleSave = async (formData) => {
    await onSave({
      company_name:  formData.company_name,
      contact_name:  formData.contact_name,
      designation:   formData.designation,
      source:        formData.source === "Other" ? (formData.custom_source || "Other") : formData.source,
      temperature:   selectedTemp,
      remarks:       formData.remarks,
      stage:         formData.stage,
      follow_up_date:formData.follow_up_date || null,
      assigned_to:   formData.assigned_to || null,
      other_notes: toJSON({
        email:                      formData.email,
        phone:                      formData.phone ? `${country.dial} ${formData.phone}` : "",
        country:                    selectedCountry,
        linkedin_url:               formData.linkedin_url,
        linkedin_connect_request:   formData.connect_request,
        linkedin_connection_accept: formData.connection_accept,
        first_comm_date:            formData.first_comm_date,
        meeting_status:             formData.meeting_status,
        custom_source:              formData.source === "Other" ? formData.custom_source : "",
      }),
    });
  };

  const SectionDivider = ({ label }) => (
    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, margin: "4px 0 2px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 640, maxHeight: "92vh", overflowY: "auto" }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{lead ? "Edit Lead" : "Add Lead"}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(handleSave)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* ── Basic Info ── */}
            <SectionDivider label="Basic Info" />
            <div>
              <label className="crm-label">Company Name *</label>
              <input className="crm-input" {...register("company_name", { required: "Required" })} placeholder="Acme Corp" />
              {errors.company_name && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.company_name.message}</span>}
            </div>
            <div>
              <label className="crm-label">Contact Name *</label>
              <input className="crm-input" {...register("contact_name", { required: "Required" })} placeholder="John Doe" />
              {errors.contact_name && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.contact_name.message}</span>}
            </div>
            <div>
              <label className="crm-label">Designation</label>
              <input className="crm-input" {...register("designation")} placeholder="CTO" />
            </div>
            <div>
              <label className="crm-label">Email</label>
              <input
                className="crm-input"
                type="email"
                {...register("email", {
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email" },
                })}
                placeholder="contact@company.com"
              />
              {errors.email && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.email.message}</span>}
            </div>

            {/* ── Phone + Country ── */}
            <SectionDivider label="Phone & Location" />
            <div>
              <label className="crm-label">Country</label>
              <select
                className="crm-input"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name} ({c.dial})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="crm-label">Phone Number</label>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ padding: "9px 12px", background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: "var(--r-sm)", fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                  {country.dial}
                </div>
                <input
                  className="crm-input"
                  style={{ flex: 1 }}
                  {...register("phone", {
                    validate: (v) => {
                      if (!v) return true;
                      const digits = v.replace(/\D/g, "");
                      const [min, max] = country.len;
                      if (digits.length < min || digits.length > max)
                        return `Must be ${min === max ? min : `${min}–${max}`} digits for ${country.name}`;
                      return true;
                    },
                  })}
                  placeholder={`${country.len[0]} digit number`}
                />
              </div>
              {errors.phone && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.phone.message}</span>}
            </div>

            {/* ── Lead Classification ── */}
            <SectionDivider label="Lead Classification" />
            <div>
              <label className="crm-label">Lead Source</label>
              <select className="crm-input" {...register("source")}>
                <option value="">Select source</option>
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {watchSource === "Other" && (
              <div>
                <label className="crm-label">Custom Source</label>
                <input className="crm-input" {...register("custom_source")} placeholder="Describe the source..." />
              </div>
            )}

            {/* Temperature pill selector */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label" style={{ marginBottom: 8 }}>Lead Temperature</label>
              <div style={{ display: "flex", gap: 8 }}>
                {TEMPERATURES.map((t) => {
                  const active = selectedTemp === t.key;
                  const TIcon = t.icon;
                  return (
                    <motion.button
                      key={t.key}
                      type="button"
                      onClick={() => setSelectedTemp(active ? "" : t.key)}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "8px 16px", borderRadius: 20, border: `1.5px solid ${active ? t.color : "var(--border)"}`,
                        background: active ? t.bg : "transparent",
                        color: active ? t.color : "var(--text-muted)",
                        cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: active ? 700 : 500,
                        transition: "all 0.15s",
                      }}
                    >
                      <TIcon size={13} strokeWidth={2} /> {t.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* ── Stage + Follow-up ── */}
            <SectionDivider label="Status & Timeline" />
            <div>
              <label className="crm-label">Lead Status</label>
              <select className="crm-input" {...register("stage")}>
                {LEAD_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Meeting Status</label>
              <select className="crm-input" {...register("meeting_status")}>
                {MEETING_STATUSES.map((ms) => <option key={ms} value={ms}>{ms}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Connect Request Date</label>
              <input className="crm-input" type="date" {...register("connect_request")} />
            </div>
            <div>
              <label className="crm-label">Connection Accept Date</label>
              <input className="crm-input" type="date" {...register("connection_accept")} />
            </div>
            <div>
              <label className="crm-label">First Communication Date</label>
              <input className="crm-input" type="date" {...register("first_comm_date")} />
            </div>
            <div>
              <label className="crm-label">Meeting / Follow-up Date</label>
              <input className="crm-input" type="date" {...register("follow_up_date")} />
            </div>

            {/* ── Remarks ── */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Remarks</label>
              <textarea className="crm-input" {...register("remarks")} rows={3} placeholder="Notes, next steps..." style={{ resize: "vertical" }} />
            </div>

            {/* ── Bottom fields (LinkedIn + Assigned To) ── */}
            <SectionDivider label="Assignment & Social" />
            <div>
              <label className="crm-label">LinkedIn URL</label>
              <input className="crm-input" {...register("linkedin_url")} placeholder="https://linkedin.com/in/..." />
            </div>
            {teamMembers?.length > 0 && (
              <div>
                <label className="crm-label">Assigned To</label>
                <select className="crm-input" {...register("assigned_to")}>
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : lead ? "Save Changes" : "Add Lead"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Convert to Deal mini modal ───────────────────────────────────────────────
function ConvertDealModal({ lead, onClose }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: {
      title:        `Deal — ${lead.company_name}`,
      company_name: lead.company_name,
      contact_name: lead.contact_name,
      value:        "",
      stage:        "prospecting",
    },
  });

  const DEAL_STAGES = [
    { key: "prospecting",  label: "Prospecting"  },
    { key: "qualification",label: "Qualification" },
    { key: "proposal",     label: "Proposal"      },
    { key: "negotiation",  label: "Negotiation"   },
  ];

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      await supabase.from("deals").insert({
        title:        data.title,
        company_name: data.company_name,
        contact_name: data.contact_name,
        value:        Number(data.value) || 0,
        stage:        data.stage,
        assigned_to:  lead.assigned_to || profile?.id,
        created_by:   profile?.id,
        remarks:      lead.remarks || "",
      });
      await supabase.from("leads").update({ stage: "won" }).eq("id", lead.id);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success(`Lead converted to deal! Lead marked as Won.`);
      onClose();
    } catch (e) {
      toast.error("Conversion failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 480 }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Convert to Deal</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>Lead will be marked as Won</p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", background: "var(--accent-light)", borderRadius: 8, border: "1px solid rgba(37,99,235,0.15)", fontSize: 12.5, color: "var(--accent)", fontWeight: 500 }}>
            Converting: <strong>{lead.company_name}</strong> — {lead.contact_name}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Deal Title</label>
              <input className="crm-input" {...register("title", { required: true })} />
            </div>
            <div>
              <label className="crm-label">Deal Value (₹)</label>
              <input className="crm-input" type="number" {...register("value")} placeholder="500000" />
            </div>
            <div>
              <label className="crm-label">Initial Stage</label>
              <select className="crm-input" {...register("stage")}>
                {DEAL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Converting..." : "Convert to Deal"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ stage }) {
  const s = LEAD_STATUSES.find((x) => x.key === stage) || LEAD_STATUSES[0];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 20,
      fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

function TempBadge({ temp }) {
  if (!temp) return null;
  const t = TEMPERATURES.find((x) => x.key === temp);
  if (!t) return null;
  const TIcon = t.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: t.bg, color: t.color }}>
      <TIcon size={10} strokeWidth={2} /> {t.label}
    </span>
  );
}

function ScoreBadge({ lead }) {
  const s = leadScore(lead);
  const { color, bg } = scoreColor(s);
  return (
    <span title={`Lead score: ${s}/100`} style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700,
      background: bg, color,
    }}>
      <Star size={9} strokeWidth={2.5} fill={color} />
      {s}
    </span>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────
function BulkActionBar({ count, teamMembers, onAssign, onStageChange, onDelete, onClear }) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [stageOpen,  setStageOpen]  = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "8px 16px", background: "rgba(37,99,235,0.08)",
        border: "1px solid rgba(37,99,235,0.2)", borderRadius: 10, marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
        {count} selected
      </span>
      <div style={{ flex: 1 }} />

      {/* Assign to */}
      <div style={{ position: "relative" }}>
        <button
          className="btn-secondary"
          style={{ gap: 5, height: 32, padding: "0 12px", fontSize: 12 }}
          onClick={() => { setAssignOpen((v) => !v); setStageOpen(false); }}
        >
          <UserCheck size={12} /> Assign to <ChevronDown size={11} />
        </button>
        <AnimatePresence>
          {assignOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, boxShadow: "var(--shadow-lg)",
                padding: "4px 0", minWidth: 160,
              }}
            >
              {teamMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onAssign(m.id, m.full_name); setAssignOpen(false); }}
                  style={{
                    display: "block", width: "100%", padding: "8px 14px",
                    border: "none", background: "transparent", cursor: "pointer",
                    textAlign: "left", fontSize: 13, color: "var(--text-2)",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  {m.full_name}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Change stage */}
      <div style={{ position: "relative" }}>
        <button
          className="btn-secondary"
          style={{ gap: 5, height: 32, padding: "0 12px", fontSize: 12 }}
          onClick={() => { setStageOpen((v) => !v); setAssignOpen(false); }}
        >
          <CheckSquare size={12} /> Set Stage <ChevronDown size={11} />
        </button>
        <AnimatePresence>
          {stageOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, boxShadow: "var(--shadow-lg)",
                padding: "4px 0", minWidth: 150,
              }}
            >
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => { onStageChange(s.key, s.label); setStageOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    width: "100%", padding: "8px 14px",
                    border: "none", background: "transparent", cursor: "pointer",
                    textAlign: "left", fontSize: 13, color: s.color,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  {s.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Delete */}
      <button
        className="btn-secondary"
        style={{ gap: 5, height: 32, padding: "0 12px", fontSize: 12, color: "#EF4444", borderColor: "#EF444440" }}
        onClick={onDelete}
      >
        <Trash2 size={12} /> Delete
      </button>

      {/* Clear */}
      <button
        className="btn-ghost"
        style={{ height: 32, padding: "0 10px", fontSize: 12, color: "var(--text-muted)" }}
        onClick={onClear}
      >
        <X size={12} />
      </button>
    </motion.div>
  );
}

// ─── Enrichment dots ─────────────────────────────────────────────────────────
function EnrichmentDots({ email, phone, linkedin }) {
  const dots = [
    { ok: !!email,   label: "Email",    color: "#3B82F6" },
    { ok: !!phone,   label: "Phone",    color: "#10B981" },
    { ok: !!linkedin,label: "LinkedIn", color: "#0A66C2" },
  ];
  return (
    <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
      {dots.map((d) => (
        <span
          key={d.label}
          title={d.ok ? `${d.label} available` : `No ${d.label}`}
          style={{
            width: 6, height: 6, borderRadius: "50%",
            background: d.ok ? d.color : "var(--border)",
            opacity: d.ok ? 1 : 0.5,
          }}
        />
      ))}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function LeadsStatsBar({ leads }) {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const monthAgo = now - 30 * 86400000;
  const hot = leads.filter((l) => l.temperature === "hot").length;
  const newThis = leads.filter((l) => l.created_at && new Date(l.created_at).getTime() > weekAgo).length;
  const won = leads.filter((l) => l.stage === "won" && l.updated_at && new Date(l.updated_at).getTime() > monthAgo).length;
  const avg = leads.length ? Math.round(leads.reduce((a, l) => a + leadScore(l), 0) / leads.length) : 0;
  const items = [
    { v: leads.length, l: "total",          c: "var(--accent)" },
    { v: hot,          l: "hot",            c: "#EF4444" },
    { v: newThis,      l: "new this week",  c: "#8B5CF6" },
    { v: won,          l: "won this month", c: "#10B981" },
    { v: avg,          l: "avg score",      c: "#F59E0B" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "7px 24px", borderBottom: "1px solid var(--border)", overflowX: "auto", gap: 0 }}>
      {items.map((s, i) => (
        <div key={s.l} style={{ display: "flex", alignItems: "baseline", gap: 5, padding: "2px 18px", flexShrink: 0, ...(i > 0 ? { borderLeft: "1px solid var(--border)" } : {}) }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: s.c, letterSpacing: "-0.03em" }}>{s.v}</span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{s.l}</span>
        </div>
      ))}
    </div>
  );
}

// ─── AI Insight Banner ────────────────────────────────────────────────────────
function AIInsightBanner({ leads }) {
  const hot = leads.filter((l) => l.temperature === "hot" && l.stage !== "won" && l.stage !== "lost");
  if (!hot.length) return null;
  const top = hot.reduce((a, b) => leadScore(a) >= leadScore(b) ? a : b, hot[0]);
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="cmd-ai-banner"
      style={{ margin: "12px 24px 0", borderRadius: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}
    >
      <Brain size={14} style={{ flexShrink: 0 }} />
      <span>
        <strong>AI Insight:</strong> {hot.length} hot lead{hot.length > 1 ? "s" : ""} need attention.
        Highest priority: <strong>{top.company_name}</strong> — Score {leadScore(top)}/100.
      </span>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Leads() {
  const { profile, isSalesHead } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm]         = useState(false);
  const [editLead, setEditLead]         = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [convertLead, setConvertLead]   = useState(null);
  const [search, setSearch]             = useState("");
  const [filterStage, setFilterStage]   = useState("");
  const [filterTemp, setFilterTemp]     = useState("");
  const [sortBy, setSortBy]             = useState("created_desc");
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const fileRef = useRef();

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["leads", search, filterStage, filterTemp],
    queryFn: () => leadsService.getAll({ search, stage: filterStage, temperature: filterTemp }),
  });

  const { data: teamData } = useQuery({
    queryKey: ["team-all"],
    queryFn: () => teamService.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: leadsService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Lead added"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => leadsService.update(id, data),
    onSuccess: async (updated) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead updated");
      setEditLead(null);
      setSelectedLead(null);
      // Notify managers
      if (profile) {
        await notifyManagers(profile.id, profile.full_name, updated.company_name, updated.id);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: leadsService.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Lead deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (data) => {
    if (editLead && !isSalesHead) { toast.error("You don't have permission to edit leads"); return; }
    const payload = { ...data, created_by: profile?.id };
    if (editLead) await updateMutation.mutateAsync({ id: editLead.id, ...payload });
    else await createMutation.mutateAsync(payload);
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (!isSalesHead) { toast.error("Only Sales Head or above can delete leads"); return; }
    if (window.confirm("Delete this lead?")) deleteMutation.mutate(id);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const rows = parseCSVText(text).filter((r) => r["Company"] || r["Contact Name"]);
    if (rows.length === 0) { toast.error("No valid rows found"); e.target.value = ""; return; }

    const { data: existing } = await supabase.from("leads").select("company_name, contact_name");
    const existingSet = new Set(
      (existing || []).map((l) => `${(l.company_name||"").trim().toLowerCase()}::${(l.contact_name||"").trim().toLowerCase()}`)
    );

    let ok = 0, dupes = 0, fail = 0;
    const dupeNames = [];
    for (const row of rows) {
      const key = `${(row["Company"]||"").trim().toLowerCase()}::${(row["Contact Name"]||"").trim().toLowerCase()}`;
      if (existingSet.has(key)) { dupes++; dupeNames.push(row["Company"] || row["Contact Name"]); continue; }
      try { await createMutation.mutateAsync(csvLeadToPayload(row, profile?.id)); ok++; }
      catch { fail++; }
    }
    if (dupes > 0 && ok > 0) {
      const preview = dupeNames.slice(0, 3).join(", ") + (dupeNames.length > 3 ? ` +${dupeNames.length - 3} more` : "");
      toast(`Imported ${ok}. Skipped ${dupes} duplicate${dupes > 1 ? "s" : ""}: ${preview}`, { icon: "⚠️", duration: 5000 });
    } else if (ok > 0) {
      toast.success(`Imported ${ok} lead${ok > 1 ? "s" : ""}${fail ? `, ${fail} failed` : ""}`);
    } else {
      toast.error(dupes > 0 ? "All rows already exist" : "Import failed");
    }
    e.target.value = "";
  };

  const rawLeads = leadsData?.data || [];
  const teamMembers = teamData?.data || [];

  const leads = useMemo(() => {
    const arr = [...rawLeads];
    switch (sortBy) {
      case "score_desc":    return arr.sort((a, b) => leadScore(b) - leadScore(a));
      case "score_asc":     return arr.sort((a, b) => leadScore(a) - leadScore(b));
      case "created_desc":  return arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      case "created_asc":   return arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      case "company_asc":   return arr.sort((a, b) => (a.company_name || "").localeCompare(b.company_name || ""));
      default: return arr;
    }
  }, [rawLeads, sortBy]);

  // ── Bulk helpers ──────────────────────────────────────────────────────────
  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  const toggleAll   = () => setSelectedIds(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  const toggleOne   = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleBulkAssign = async (userId, userName) => {
    if (!window.confirm(`Assign ${selectedIds.size} lead(s) to ${userName}?`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").update({ assigned_to: userId }).in("id", ids);
    if (error) { toast.error("Bulk assign failed"); return; }
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(`Assigned ${ids.length} leads to ${userName}`);
    setSelectedIds(new Set());
  };

  const handleBulkStage = async (stage, label) => {
    if (!window.confirm(`Change ${selectedIds.size} lead(s) to "${label}"?`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").update({ stage }).in("id", ids);
    if (error) { toast.error("Bulk update failed"); return; }
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(`${ids.length} leads → ${label}`);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} lead(s)? This cannot be undone.`)) return;
    const ids = [...selectedIds];
    const { error } = await supabase.from("leads").delete().in("id", ids);
    if (error) { toast.error("Bulk delete failed"); return; }
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(`Deleted ${ids.length} leads`);
    setSelectedIds(new Set());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Page Header ── */}
      <div className="page-header-ent" style={{ padding: "16px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <UserPlus size={20} style={{ color: "var(--accent)" }} />
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)" }}>Lead Intelligence</h1>
              <span className="live-indicator" style={{ fontSize: 10.5 }}>LIVE</span>
            </div>
            <p style={{ margin: "2px 0 0 28px", fontSize: 12.5, color: "var(--text-muted)" }}>
              Smart lead scoring · Temperature tracking · AI-powered enrichment
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleImport} />
            <button className="btn-secondary" onClick={() => fileRef.current?.click()} style={{ gap: 6, height: 36 }}><Upload size={13} /> Import</button>
            <button className="btn-secondary" onClick={() => exportLeadsCSV(leads)} disabled={!leads.length} style={{ gap: 6, height: 36 }}><Download size={13} /> Export</button>
            <button className="btn-primary" onClick={() => setShowForm(true)} style={{ height: 36 }}><Plus size={14} /> Add Lead</button>
          </div>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      {leads.length > 0 && <LeadsStatsBar leads={leads} />}

      {/* ── Toolbar ── */}
      <div style={{ padding: "12px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: leads.length > 0 ? 8 : 0 }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 280 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="crm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads, company, contact..." style={{ paddingLeft: 32, height: 36 }} />
        </div>

        <select className="crm-input" value={filterStage} onChange={(e) => setFilterStage(e.target.value)} style={{ width: "auto", height: 36 }}>
          <option value="">All Stages</option>
          {LEAD_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        {/* Temperature chips */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Filter size={12} style={{ color: "var(--text-muted)" }} />
          {[{ key: "", label: "All", color: "var(--text-2)", bg: "var(--surface-2)" }, ...TEMPERATURES.map((t) => ({ key: t.key, label: t.label, color: t.color, bg: t.bg }))].map((t) => (
            <motion.button
              key={t.key}
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setFilterTemp(t.key)}
              style={{
                padding: "4px 12px", borderRadius: 20, border: `1.5px solid ${filterTemp === t.key ? t.color : "var(--border)"}`,
                background: filterTemp === t.key ? t.bg : "transparent",
                color: filterTemp === t.key ? t.color : "var(--text-muted)",
                fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </motion.button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Sort */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ArrowUpDown size={12} style={{ color: "var(--text-muted)" }} />
          <select className="crm-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ width: "auto", height: 34, fontSize: 12 }}>
            <option value="created_desc">Newest First</option>
            <option value="created_asc">Oldest First</option>
            <option value="score_desc">Score: High → Low</option>
            <option value="score_asc">Score: Low → High</option>
            <option value="company_asc">Company A–Z</option>
          </select>
        </div>

        <span style={{ fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{leads.length} leads</span>
      </div>

      {/* ── Role hint ── */}
      {!isSalesHead && (
        <div style={{ padding: "7px 24px", background: "rgba(245,158,11,0.06)", borderBottom: "1px solid rgba(245,158,11,0.15)", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--amber)" }}>
          <Lock size={12} /> View only — editing requires Sales Head or above
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
        {/* Bulk action bar */}
        <AnimatePresence>
          {selectedIds.size > 0 && isSalesHead && (
            <BulkActionBar
              count={selectedIds.size}
              teamMembers={teamMembers}
              onAssign={handleBulkAssign}
              onStageChange={handleBulkStage}
              onDelete={handleBulkDelete}
              onClear={() => setSelectedIds(new Set())}
            />
          )}
        </AnimatePresence>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite", margin: "0 auto 12px" }} />
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading leads...</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <Users size={40} />
            <h3>No leads yet</h3>
            <p>Add your first lead or import a CSV to get started</p>
            <button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginTop: 16 }}><Plus size={14} /> Add Lead</button>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    {isSalesHead && (
                      <th style={{ width: 36, padding: "10px 8px" }}>
                        <button
                          onClick={toggleAll}
                          style={{ background: "none", border: "none", cursor: "pointer", color: allSelected ? "var(--accent)" : "var(--text-muted)", display: "flex", padding: 0 }}
                        >
                          {allSelected ? <CheckSquare size={14} strokeWidth={2} /> : <Square size={14} strokeWidth={1.75} />}
                        </button>
                      </th>
                    )}
                    <th>COMPANY</th>
                    <th>CONTACT</th>
                    <th>SCORE</th>
                    <th>SOURCE</th>
                    <th>TEMP</th>
                    <th>STATUS</th>
                    <th>MEETING DATE</th>
                    <th>ASSIGNED</th>
                    {isSalesHead && <th style={{ textAlign: "right" }}>ACTIONS</th>}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => {
                    const extra      = parseJSON(l.other_notes);
                    const isSelected = selectedIds.has(l.id);
                    const isNew      = l.created_at && (Date.now() - new Date(l.created_at).getTime()) < 7 * 86400000;
                    const score      = leadScore(l);
                    const scoreClass = score >= 70 ? "high" : score >= 40 ? "med" : "low";
                    return (
                      <motion.tr
                        key={l.id}
                        onClick={() => setSelectedLead(l)}
                        style={{ cursor: "pointer", background: isSelected ? "rgba(37,99,235,0.04)" : undefined }}
                        whileHover={{ backgroundColor: isSelected ? "rgba(37,99,235,0.07)" : "var(--surface-2)" }}
                      >
                        {isSalesHead && (
                          <td style={{ width: 36, padding: "10px 8px" }} onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => toggleOne(l.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: isSelected ? "var(--accent)" : "var(--text-muted)", display: "flex", padding: 0 }}
                            >
                              {isSelected ? <CheckSquare size={14} strokeWidth={2} /> : <Square size={14} strokeWidth={1.75} />}
                            </button>
                          </td>
                        )}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{l.company_name}</div>
                            {isNew && (
                              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "rgba(139,92,246,0.15)", color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "0.05em" }}>NEW</span>
                            )}
                          </div>
                          <EnrichmentDots email={extra.email} phone={extra.phone} linkedin={extra.linkedin_url} />
                        </td>
                        <td>
                          <div style={{ fontSize: 13, color: "var(--text-2)" }}>{l.contact_name || "—"}</div>
                          {l.designation && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l.designation}</div>}
                        </td>
                        <td>
                          <span className={`lead-score ${scoreClass}`}>
                            <Star size={9} strokeWidth={2.5} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                            {score}
                          </span>
                        </td>
                        <td>
                          {l.source ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                              <Globe size={9} strokeWidth={2} /> {l.source}
                            </span>
                          ) : "—"}
                        </td>
                        <td>
                          {l.temperature ? (
                            <span className={`temp-badge ${l.temperature}`}>
                              {l.temperature === "hot" ? "🔥" : l.temperature === "warm" ? "🌡" : "❄️"} {l.temperature.charAt(0).toUpperCase() + l.temperature.slice(1)}
                            </span>
                          ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                        </td>
                        <td><StatusBadge stage={l.stage} /></td>
                        <td style={{ fontSize: 12, color: "var(--text-2)" }}>
                          {l.follow_up_date ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <CalendarClock size={11} style={{ color: "var(--text-muted)" }} />
                              {fmt(l.follow_up_date)}
                            </div>
                          ) : "—"}
                        </td>
                        <td>
                          {l.assigned_profile ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 24, height: 24, borderRadius: 7, background: "linear-gradient(135deg,#2563EB,#4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                                {l.assigned_profile.full_name?.charAt(0)}
                              </div>
                              <span style={{ fontSize: 12, color: "var(--text-2)" }}>{l.assigned_profile.full_name?.split(" ")[0]}</span>
                            </div>
                          ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                        </td>
                        {isSalesHead && (
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }}>
                              <motion.button
                                className="btn-ghost"
                                title="Convert to Deal"
                                style={{ padding: "4px 7px", color: "var(--green)" }}
                                onClick={(e) => { e.stopPropagation(); setConvertLead(l); }}
                                whileHover={{ scale: 1.12 }}
                                whileTap={{ scale: 0.88 }}
                              >
                                <ArrowRightLeft size={13} strokeWidth={1.8} />
                              </motion.button>
                              <motion.button
                                className="btn-ghost"
                                style={{ padding: "4px 7px" }}
                                onClick={(e) => { e.stopPropagation(); setEditLead(l); }}
                                whileHover={{ scale: 1.12, color: "var(--accent)" }}
                                whileTap={{ scale: 0.88 }}
                              >
                                <Pencil size={13} strokeWidth={1.75} />
                              </motion.button>
                              <motion.button
                                className="btn-ghost"
                                style={{ padding: "4px 7px", color: "var(--red)" }}
                                onClick={(e) => handleDelete(e, l.id)}
                                whileHover={{ scale: 1.12 }}
                                whileTap={{ scale: 0.88 }}
                              >
                                <Trash2 size={13} strokeWidth={1.75} />
                              </motion.button>
                            </div>
                          </td>
                        )}
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {selectedLead && (
          <LeadDetailPanel
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onEdit={(lead) => { setSelectedLead(null); setEditLead(lead); }}
            onConvert={(lead) => { setSelectedLead(null); setConvertLead(lead); }}
          />
        )}
        {(showForm || editLead) && (
          <LeadModal
            key={editLead?.id || "new"}
            lead={editLead}
            onClose={() => { setShowForm(false); setEditLead(null); }}
            onSave={handleSave}
            teamMembers={teamMembers}
          />
        )}
        {convertLead && (
          <ConvertDealModal lead={convertLead} onClose={() => setConvertLead(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
