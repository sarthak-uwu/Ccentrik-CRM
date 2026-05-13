import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import {
  Plus, Search, Pencil, Trash2, X, Phone, Mail, FileText, Bell,
  Video, RefreshCw, Download, Upload, LayoutList, AlignLeft,
  Activity, CalendarDays, TrendingUp, Zap, Clock,
} from "lucide-react";

// ─── Activity type definitions ────────────────────────────────────────────────
const ACT_DEFS = {
  call:     { label: "Call",      icon: Phone,      color: "#3B82F6", bg: "#DBEAFE", db_types: ["Cold Call","Follow-up","Demo","Introductory","Verification","Other"] },
  meeting:  { label: "Meeting",   icon: Video,      color: "#8B5CF6", bg: "#EDE9FE", db_types: ["Meeting"] },
  followup: { label: "Follow-up", icon: RefreshCw,  color: "#F59E0B", bg: "#FEF3C7", db_types: ["Follow-up Task"] },
  note:     { label: "Note",      icon: FileText,   color: "#10B981", bg: "#D1FAE5", db_types: ["Note"] },
  email:    { label: "Email",     icon: Mail,       color: "#EC4899", bg: "#FCE7F3", db_types: ["Email"] },
  reminder: { label: "Reminder",  icon: Bell,       color: "#EF4444", bg: "#FEE2E2", db_types: ["Reminder"] },
};

const ALL_DB_TYPES = Object.values(ACT_DEFS).flatMap((d) => d.db_types);
const CALL_SUB_TYPES = ["Cold Call", "Follow-up", "Demo", "Introductory", "Verification", "Other"];
const CALL_RESPONSES = ["Interested","Not Interested","Call Back","No Response","Busy","Wrong Number","Meeting Scheduled"];
const PRIORITIES = ["Low","Medium","High"];

function getCategoryByDbType(type) {
  for (const [cat, def] of Object.entries(ACT_DEFS)) {
    if (def.db_types.includes(type)) return cat;
  }
  return "call";
}

function getDefByDbType(type) {
  const cat = getCategoryByDbType(type);
  return ACT_DEFS[cat];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseJSON = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };
const toJSON = (obj) => JSON.stringify(obj);
const fmt = (d) => { if (!d) return "—"; try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
const fmtTime = (d) => { if (!d) return ""; try { return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

// ─── Supabase service ─────────────────────────────────────────────────────────
const actService = {
  async getAll() {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async create(payload) {
    const { data, error } = await supabase.from("activities").insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, payload) {
    const { data, error } = await supabase.from("activities").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async delete(id) {
    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) throw error;
  },
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────
function csvEsc(v) { return `"${(v || "").toString().replace(/"/g, '""')}"`; }
function exportCallsCSV(rows) {
  const hdrs = ["Date","Call Type","Company","Contact No","Name","Email","Designation","Response","Remarks"];
  const lines = [hdrs.map(csvEsc).join(",")];
  rows.filter((a) => ACT_DEFS.call.db_types.includes(a.type)).forEach((a) => {
    const d = parseJSON(a.description);
    lines.push([a.created_at?.slice(0,10),a.type,a.title,d.contact_no,d.name,d.email,d.designation,d.response,d.remarks].map(csvEsc).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const el = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "calling_log.csv" });
  el.click(); URL.revokeObjectURL(el.href);
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
  return lines.slice(1).map((l) => { const v = parseLine(l); return Object.fromEntries(headers.map((h, i) => [h, v[i] || ""])); });
}
function csvRowToPayload(row, userId) {
  return {
    title: row["Company"],
    type: row["Call Type"] || "Cold Call",
    created_at: row["Date"] ? new Date(row["Date"]).toISOString() : new Date().toISOString(),
    description: toJSON({ contact_no: row["Contact No"], name: row["Name"], email: row["Email"], designation: row["Designation"], response: row["Response"], remarks: row["Remarks"] }),
    user_id: userId,
  };
}

// ─── Type Badge ───────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const def = getDefByDbType(type);
  const Icon = def.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: def.bg, color: def.color }}>
      <Icon size={10} strokeWidth={2.2} />
      {type}
    </span>
  );
}

// ─── Call Form ────────────────────────────────────────────────────────────────
function CallForm({ activity, onClose, onSave }) {
  const desc = parseJSON(activity?.description);
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date: activity?.created_at?.slice(0, 10) || today,
      call_type: activity?.type || "Cold Call",
      company: activity?.title || "",
      contact_no: desc.contact_no || "",
      name: desc.name || "",
      email: desc.email || "",
      designation: desc.designation || "",
      response: desc.response || "",
      remarks: desc.remarks || "",
    },
  });
  const submit = async (fd) => {
    await onSave({
      title: fd.company, type: fd.call_type,
      description: toJSON({ contact_no: fd.contact_no, name: fd.name, email: fd.email, designation: fd.designation, response: fd.response, remarks: fd.remarks }),
      created_at: new Date(fd.date).toISOString(),
    });
  };
  return (
    <form onSubmit={handleSubmit(submit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><label className="crm-label">Date *</label><input className="crm-input" type="date" {...register("date", { required: true })} />{errors.date && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
        <div><label className="crm-label">Call Type *</label><select className="crm-input" {...register("call_type")}>{CALL_SUB_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className="crm-label">Company *</label><input className="crm-input" {...register("company", { required: true })} placeholder="Acme Corp" />{errors.company && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
        <div><label className="crm-label">Contact No. *</label><input className="crm-input" {...register("contact_no", { required: true })} placeholder="+91 98765 43210" />{errors.contact_no && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
        <div><label className="crm-label">Contact Name *</label><input className="crm-input" {...register("name", { required: true })} placeholder="John Doe" />{errors.name && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
        <div><label className="crm-label">Email</label><input className="crm-input" type="email" {...register("email")} placeholder="contact@company.com" /></div>
        <div><label className="crm-label">Designation</label><input className="crm-input" {...register("designation")} placeholder="CTO" /></div>
        <div><label className="crm-label">Response</label><select className="crm-input" {...register("response")}><option value="">Select response</option>{CALL_RESPONSES.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Remarks</label><textarea className="crm-input" {...register("remarks")} rows={3} placeholder="Notes from call..." style={{ resize: "vertical" }} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : activity ? "Save Changes" : "Log Call"}</button>
      </div>
    </form>
  );
}

// ─── Meeting Form ─────────────────────────────────────────────────────────────
function MeetingForm({ activity, onClose, onSave }) {
  const desc = parseJSON(activity?.description);
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date: activity?.created_at?.slice(0, 10) || today,
      time: desc.time || "",
      title: activity?.title || "",
      attendees: desc.attendees || "",
      location: desc.location || "",
      agenda: desc.agenda || "",
      outcome: desc.outcome || "",
    },
  });
  const submit = async (fd) => {
    await onSave({
      title: fd.title, type: "Meeting",
      description: toJSON({ time: fd.time, attendees: fd.attendees, location: fd.location, agenda: fd.agenda, outcome: fd.outcome }),
      created_at: new Date(fd.date).toISOString(),
    });
  };
  return (
    <form onSubmit={handleSubmit(submit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><label className="crm-label">Date *</label><input className="crm-input" type="date" {...register("date", { required: true })} />{errors.date && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
        <div><label className="crm-label">Time</label><input className="crm-input" type="time" {...register("time")} /></div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Meeting Title *</label><input className="crm-input" {...register("title", { required: true })} placeholder="Q2 Demo with Acme Corp" />{errors.title && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
        <div><label className="crm-label">Attendees</label><input className="crm-input" {...register("attendees")} placeholder="John, Priya, Rahul" /></div>
        <div><label className="crm-label">Location / Link</label><input className="crm-input" {...register("location")} placeholder="Zoom / Office - Room 3" /></div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Agenda</label><textarea className="crm-input" {...register("agenda")} rows={2} placeholder="Topics to discuss..." style={{ resize: "vertical" }} /></div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Outcome / Notes</label><textarea className="crm-input" {...register("outcome")} rows={3} placeholder="What was discussed, decisions made..." style={{ resize: "vertical" }} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : activity ? "Save Changes" : "Log Meeting"}</button>
      </div>
    </form>
  );
}

// ─── Follow-up Form ───────────────────────────────────────────────────────────
function FollowUpForm({ activity, onClose, onSave }) {
  const desc = parseJSON(activity?.description);
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date: activity?.created_at?.slice(0, 10) || today,
      title: activity?.title || "",
      related_to: desc.related_to || "",
      due_date: desc.due_date || "",
      priority: desc.priority || "Medium",
      notes: desc.notes || "",
    },
  });
  const submit = async (fd) => {
    await onSave({
      title: fd.title, type: "Follow-up Task",
      description: toJSON({ related_to: fd.related_to, due_date: fd.due_date, priority: fd.priority, notes: fd.notes }),
      created_at: new Date(fd.date).toISOString(),
    });
  };
  return (
    <form onSubmit={handleSubmit(submit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><label className="crm-label">Date *</label><input className="crm-input" type="date" {...register("date", { required: true })} /></div>
        <div><label className="crm-label">Due Date</label><input className="crm-input" type="date" {...register("due_date")} /></div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Title *</label><input className="crm-input" {...register("title", { required: true })} placeholder="Follow-up with Acme Corp" />{errors.title && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
        <div><label className="crm-label">Related To</label><input className="crm-input" {...register("related_to")} placeholder="Lead / Deal / Company name" /></div>
        <div><label className="crm-label">Priority</label><select className="crm-input" {...register("priority")}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Notes</label><textarea className="crm-input" {...register("notes")} rows={3} placeholder="Details about the follow-up..." style={{ resize: "vertical" }} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : activity ? "Save Changes" : "Add Follow-up"}</button>
      </div>
    </form>
  );
}

// ─── Note Form ────────────────────────────────────────────────────────────────
function NoteForm({ activity, onClose, onSave }) {
  const desc = parseJSON(activity?.description);
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date: activity?.created_at?.slice(0, 10) || today,
      title: activity?.title || "",
      related_to: desc.related_to || "",
      content: desc.content || "",
    },
  });
  const submit = async (fd) => {
    await onSave({
      title: fd.title, type: "Note",
      description: toJSON({ related_to: fd.related_to, content: fd.content }),
      created_at: new Date(fd.date).toISOString(),
    });
  };
  return (
    <form onSubmit={handleSubmit(submit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><label className="crm-label">Date *</label><input className="crm-input" type="date" {...register("date", { required: true })} /></div>
        <div><label className="crm-label">Related To</label><input className="crm-input" {...register("related_to")} placeholder="Lead / Deal / Company" /></div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Title *</label><input className="crm-input" {...register("title", { required: true })} placeholder="Note title" />{errors.title && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Content *</label><textarea className="crm-input" {...register("content", { required: true })} rows={5} placeholder="Your note..." style={{ resize: "vertical" }} />{errors.content && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : activity ? "Save Changes" : "Add Note"}</button>
      </div>
    </form>
  );
}

// ─── Email Form ───────────────────────────────────────────────────────────────
function EmailForm({ activity, onClose, onSave }) {
  const desc = parseJSON(activity?.description);
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date: activity?.created_at?.slice(0, 10) || today,
      subject: activity?.title || "",
      to: desc.to || "",
      from: desc.from || "",
      status: desc.status || "Sent",
      body: desc.body || "",
    },
  });
  const submit = async (fd) => {
    await onSave({
      title: fd.subject, type: "Email",
      description: toJSON({ to: fd.to, from: fd.from, status: fd.status, body: fd.body }),
      created_at: new Date(fd.date).toISOString(),
    });
  };
  return (
    <form onSubmit={handleSubmit(submit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><label className="crm-label">Date *</label><input className="crm-input" type="date" {...register("date", { required: true })} /></div>
        <div><label className="crm-label">Status</label><select className="crm-input" {...register("status")}>{["Sent","Draft","Bounced","Replied"].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="crm-label">To</label><input className="crm-input" type="email" {...register("to")} placeholder="client@company.com" /></div>
        <div><label className="crm-label">From</label><input className="crm-input" type="email" {...register("from")} placeholder="you@company.com" /></div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Subject *</label><input className="crm-input" {...register("subject", { required: true })} placeholder="Re: Product Demo" />{errors.subject && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Email Body</label><textarea className="crm-input" {...register("body")} rows={5} placeholder="Email content..." style={{ resize: "vertical" }} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : activity ? "Save Changes" : "Log Email"}</button>
      </div>
    </form>
  );
}

// ─── Reminder Form ────────────────────────────────────────────────────────────
function ReminderForm({ activity, onClose, onSave }) {
  const desc = parseJSON(activity?.description);
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date: activity?.created_at?.slice(0, 10) || today,
      time: desc.time || "",
      title: activity?.title || "",
      priority: desc.priority || "Medium",
      notes: desc.notes || "",
    },
  });
  const submit = async (fd) => {
    await onSave({
      title: fd.title, type: "Reminder",
      description: toJSON({ time: fd.time, priority: fd.priority, notes: fd.notes }),
      created_at: new Date(fd.date).toISOString(),
    });
  };
  return (
    <form onSubmit={handleSubmit(submit)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><label className="crm-label">Date *</label><input className="crm-input" type="date" {...register("date", { required: true })} /></div>
        <div><label className="crm-label">Time</label><input className="crm-input" type="time" {...register("time")} /></div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Reminder Title *</label><input className="crm-input" {...register("title", { required: true })} placeholder="Call back John at Acme" />{errors.title && <span style={{ color: "var(--red)", fontSize: 11 }}>Required</span>}</div>
        <div><label className="crm-label">Priority</label><select className="crm-input" {...register("priority")}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div style={{ gridColumn: "1/-1" }}><label className="crm-label">Notes</label><textarea className="crm-input" {...register("notes")} rows={3} placeholder="Additional details..." style={{ resize: "vertical" }} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : activity ? "Save Changes" : "Set Reminder"}</button>
      </div>
    </form>
  );
}

// ─── Activity Modal (dispatcher) ──────────────────────────────────────────────
function ActivityModal({ category, activity, onClose, onSave }) {
  const def = ACT_DEFS[category];
  const Icon = def.icon;
  const formMap = { call: CallForm, meeting: MeetingForm, followup: FollowUpForm, note: NoteForm, email: EmailForm, reminder: ReminderForm };
  const Form = formMap[category];
  const labels = { call: ["Log Call", "Edit Call"], meeting: ["Log Meeting", "Edit Meeting"], followup: ["Add Follow-up", "Edit Follow-up"], note: ["Add Note", "Edit Note"], email: ["Log Email", "Edit Email"], reminder: ["Set Reminder", "Edit Reminder"] };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: def.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={15} style={{ color: def.color }} strokeWidth={2} />
            </div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{activity ? labels[category][1] : labels[category][0]}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <Form activity={activity} onClose={onClose} onSave={onSave} />
      </div>
    </div>
  );
}

// ─── Timeline Item ────────────────────────────────────────────────────────────
function TimelineItem({ activity, isLast, onEdit, onDelete, canManage }) {
  const def = getDefByDbType(activity.type);
  const Icon = def.icon;
  const desc = parseJSON(activity.description);

  const getSubtitle = () => {
    if (ACT_DEFS.call.db_types.includes(activity.type)) return [desc.name, desc.designation, desc.response].filter(Boolean).join(" · ");
    if (activity.type === "Meeting") return [desc.attendees && `Attendees: ${desc.attendees}`, desc.location].filter(Boolean).join(" · ");
    if (activity.type === "Follow-up Task") return [desc.related_to && `Re: ${desc.related_to}`, desc.priority && `${desc.priority} priority`, desc.due_date && `Due: ${fmt(desc.due_date)}`].filter(Boolean).join(" · ");
    if (activity.type === "Note") return desc.related_to ? `Re: ${desc.related_to}` : desc.content?.slice(0, 60);
    if (activity.type === "Email") return [desc.to && `To: ${desc.to}`, desc.status].filter(Boolean).join(" · ");
    if (activity.type === "Reminder") return [desc.time, desc.priority && `${desc.priority} priority`].filter(Boolean).join(" · ");
    return "";
  };

  return (
    <div style={{ display: "flex", gap: 14, position: "relative" }}>
      {!isLast && <div style={{ position: "absolute", left: 17, top: 38, bottom: -4, width: 1.5, background: "var(--border)" }} />}
      <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: def.bg, border: `2px solid ${def.color}30`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <Icon size={14} style={{ color: def.color }} strokeWidth={2} />
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>{activity.title || "Untitled"}</span>
              <TypeBadge type={activity.type} />
            </div>
            {getSubtitle() && <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 4, lineHeight: 1.5 }}>{getSubtitle()}</div>}
            {activity.type === "Note" && desc.content && (
              <div style={{ fontSize: 13, color: "var(--text-2)", padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)", marginTop: 4, lineHeight: 1.6 }}>{desc.content}</div>
            )}
            {activity.type === "Meeting" && desc.agenda && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2 }}>Agenda: {desc.agenda}</div>
            )}
            {activity.type === "Meeting" && desc.outcome && (
              <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>Outcome: {desc.outcome}</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmt(activity.created_at)}{fmtTime(activity.created_at) ? ` · ${fmtTime(activity.created_at)}` : ""}</span>
            {canManage && (
              <>
                <button onClick={() => onEdit(activity)} className="btn-ghost" style={{ padding: "3px 6px" }}><Pencil size={12} /></button>
                <button onClick={() => onDelete(activity.id)} className="btn-ghost" style={{ padding: "3px 6px", color: "var(--red)" }}><Trash2 size={12} /></button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────
function TableRow({ activity, onEdit, onDelete, canManage }) {
  const desc = parseJSON(activity.description);
  const getCellValue = () => {
    if (ACT_DEFS.call.db_types.includes(activity.type)) return `${desc.contact_no || "—"} · ${desc.name || "—"}`;
    if (activity.type === "Meeting") return desc.attendees || desc.location || "—";
    if (activity.type === "Follow-up Task") return [desc.related_to, desc.priority && `${desc.priority} priority`].filter(Boolean).join(" · ") || "—";
    if (activity.type === "Note") return desc.content?.slice(0, 60) || "—";
    if (activity.type === "Email") return desc.to ? `To: ${desc.to}` : "—";
    if (activity.type === "Reminder") return [desc.time, desc.priority].filter(Boolean).join(" · ") || "—";
    return "—";
  };
  const getExtra = () => {
    if (ACT_DEFS.call.db_types.includes(activity.type) && desc.response) {
      const colors = { "Interested": "#10B981", "Not Interested": "#EF4444", "Call Back": "#F59E0B", "No Response": "#6B7280", "Busy": "#8B5CF6", "Meeting Scheduled": "#3B82F6" };
      const c = colors[desc.response] || "#6B7280";
      return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: `${c}15`, color: c, fontWeight: 600 }}>{desc.response}</span>;
    }
    if (activity.type === "Email" && desc.status) {
      const ec = { Sent: "#10B981", Draft: "#6B7280", Bounced: "#EF4444", Replied: "#3B82F6" };
      const c = ec[desc.status] || "#6B7280";
      return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: `${c}15`, color: c, fontWeight: 600 }}>{desc.status}</span>;
    }
    if (activity.type === "Follow-up Task" && desc.due_date) return <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Due: {fmt(desc.due_date)}</span>;
    return null;
  };

  return (
    <tr>
      <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{fmt(activity.created_at)}</td>
      <td><TypeBadge type={activity.type} /></td>
      <td style={{ fontWeight: 600, color: "var(--text)" }}>{activity.title}</td>
      <td style={{ fontSize: 12.5, color: "var(--text-2)", maxWidth: 220 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getCellValue()}</div></td>
      <td>{getExtra()}</td>
      <td style={{ textAlign: "right" }}>
        {canManage && (
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
            <button onClick={() => onEdit(activity)} className="btn-ghost" style={{ padding: "4px 8px" }}><Pencil size={13} /></button>
            <button onClick={() => { if (window.confirm("Delete this activity?")) onDelete(activity.id); }} className="btn-ghost" style={{ padding: "4px 8px", color: "var(--red)" }}><Trash2 size={13} /></button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Activities Stats Bar ─────────────────────────────────────────────────────
function ActivitiesStatsBar({ rawActivities }) {
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 86400000;
  const todayCount = rawActivities.filter((a) => a.created_at && new Date(a.created_at) >= todayStart).length;
  const callsWeek = rawActivities.filter((a) => ACT_DEFS.call.db_types.includes(a.type) && a.created_at && new Date(a.created_at).getTime() > weekAgo).length;
  const meetings = rawActivities.filter((a) => a.type === "Meeting").length;
  const pending = rawActivities.filter((a) => a.type === "Follow-up Task").length;
  const items = [
    { v: rawActivities.length, l: "total logged",    c: "var(--accent)" },
    { v: todayCount,           l: "today",           c: "#8B5CF6" },
    { v: callsWeek,            l: "calls this week", c: "#3B82F6" },
    { v: meetings,             l: "meetings",        c: "#10B981" },
    { v: pending,              l: "follow-ups",      c: "#F59E0B" },
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

// ─── Date group header ────────────────────────────────────────────────────────
function DateGroupHeader({ dateStr }) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = d.toDateString() === new Date(now - 86400000).toDateString();
  const label = isToday ? "Today" : isYesterday ? "Yesterday" : d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 14px", paddingLeft: 50 }}>
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
        padding: "3px 10px", borderRadius: 99,
        background: isToday ? "rgba(37,99,235,0.12)" : "var(--surface-2)",
        color: isToday ? "var(--accent)" : "var(--text-muted)",
        border: isToday ? "1px solid rgba(37,99,235,0.2)" : "1px solid var(--border)",
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TAB_KEYS = ["all", "call", "meeting", "followup", "note", "email", "reminder"];

export default function Activities() {
  const { profile, isSalesHead } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("all");
  const [viewMode, setViewMode] = useState("table");
  const [showForm, setShowForm] = useState(false);
  const [formCat, setFormCat] = useState("call");
  const [editAct, setEditAct] = useState(null);
  const [editCat, setEditCat] = useState("call");
  const [search, setSearch] = useState("");
  const fileRef = useRef();

  const { data: rawActivities = [], isLoading } = useQuery({
    queryKey: ["activities-unified"],
    queryFn: actService.getAll,
  });

  const createMut = useMutation({
    mutationFn: (payload) => actService.create({ ...payload, user_id: profile?.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["activities-unified"] }); toast.success("Activity logged"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => actService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["activities-unified"] }); toast.success("Updated"); setEditAct(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: actService.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["activities-unified"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (data) => {
    if (editAct) await updateMut.mutateAsync({ id: editAct.id, ...data });
    else await createMut.mutateAsync(data);
  };

  const handleEdit = (activity) => {
    const cat = getCategoryByDbType(activity.type);
    setEditCat(cat);
    setEditAct(activity);
  };

  const openNew = (cat) => {
    setFormCat(cat === "all" ? "call" : cat);
    setShowForm(true);
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const rows = parseCSVText(text);
    let ok = 0, fail = 0;
    for (const row of rows) {
      if (!row["Company"]) continue;
      try { await createMut.mutateAsync(csvRowToPayload(row, profile?.id)); ok++; }
      catch { fail++; }
    }
    toast.success(`Imported ${ok} calls${fail ? `, ${fail} failed` : ""}`);
    e.target.value = "";
  };

  // Filter activities
  let activities = rawActivities;
  if (tab !== "all") {
    const dbTypes = ACT_DEFS[tab]?.db_types || [];
    activities = activities.filter((a) => dbTypes.includes(a.type));
  }
  if (search) {
    const q = search.toLowerCase();
    activities = activities.filter((a) => {
      const d = parseJSON(a.description);
      return (
        a.title?.toLowerCase().includes(q) ||
        a.type?.toLowerCase().includes(q) ||
        d.name?.toLowerCase().includes(q) ||
        d.contact_no?.includes(q) ||
        d.to?.toLowerCase().includes(q) ||
        d.related_to?.toLowerCase().includes(q) ||
        d.content?.toLowerCase().includes(q)
      );
    });
  }

  // Stats summary
  const stats = Object.entries(ACT_DEFS).map(([key, def]) => ({
    key, ...def,
    count: rawActivities.filter((a) => def.db_types.includes(a.type)).length,
  }));

  // Group activities by date for timeline view
  const groupedTimeline = useMemo(() => {
    if (viewMode !== "timeline") return {};
    const groups = {};
    activities.forEach((a) => {
      const dateKey = a.created_at ? new Date(a.created_at).toDateString() : "Unknown";
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(a);
    });
    return groups;
  }, [activities, viewMode]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Enterprise Header ── */}
      <div className="page-header-ent" style={{ padding: "16px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Activity size={20} style={{ color: "var(--accent)" }} />
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)" }}>Activity Timeline</h1>
              <span className="live-indicator" style={{ fontSize: 10.5 }}>LIVE</span>
            </div>
            <p style={{ margin: "2px 0 0 28px", fontSize: 12.5, color: "var(--text-muted)" }}>
              Calls · Meetings · Emails · Notes · Follow-ups · Reminders
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleImportCSV} />
            <button className="btn-secondary" onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 5, height: 36 }}><Upload size={13} /> Import CSV</button>
            <button className="btn-secondary" onClick={() => exportCallsCSV(rawActivities)} style={{ display: "flex", alignItems: "center", gap: 5, height: 36 }} disabled={rawActivities.length === 0}><Download size={13} /> Export CSV</button>
            {tab === "all" ? (
              <button className="btn-primary" onClick={() => openNew("call")} style={{ display: "flex", alignItems: "center", gap: 5, height: 36 }}>
                <Plus size={13} /> Log Activity
              </button>
            ) : (
              <button className="btn-primary" onClick={() => openNew(tab)} style={{ display: "flex", alignItems: "center", gap: 5, height: 36 }}>
                <Plus size={13} /> {({ call: "Log Call", meeting: "Log Meeting", followup: "Add Follow-up", note: "Add Note", email: "Log Email", reminder: "Set Reminder" })[tab]}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      {rawActivities.length > 0 && <ActivitiesStatsBar rawActivities={rawActivities} />}

      {/* ── Category Tabs ── */}
      <div style={{ padding: "12px 24px 0", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, overflowX: "auto" }}>
        {[{ key: "all", label: "All", icon: Activity, color: "var(--accent)", count: rawActivities.length }, ...stats].map((s) => {
          const Icon = s.icon;
          const isActive = tab === s.key;
          return (
            <motion.button
              key={s.key}
              onClick={() => setTab(s.key)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "7px 14px",
                borderRadius: "10px 10px 0 0", border: `1.5px solid ${isActive ? s.color : "var(--border)"}`,
                borderBottom: isActive ? `2px solid ${s.color}` : "1.5px solid var(--border)",
                background: isActive ? `${s.color}12` : "transparent",
                cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              <Icon size={12} style={{ color: isActive ? s.color : "var(--text-muted)" }} strokeWidth={2} />
              <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? s.color : "var(--text-2)" }}>{s.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: isActive ? s.color : "var(--surface-2)", color: isActive ? "#fff" : "var(--text-muted)" }}>{s.count}</span>
            </motion.button>
          );
        })}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ padding: "10px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 260 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="crm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activities..." style={{ paddingLeft: 32, height: 34 }} />
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {[["timeline", AlignLeft, "Timeline"], ["table", LayoutList, "Table"]].map(([v, Ic, label]) => (
            <button key={v} onClick={() => setViewMode(v)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: viewMode === v ? "var(--accent)" : "transparent", color: viewMode === v ? "#fff" : "var(--text-muted)", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, transition: "all 0.15s" }}>
              <Ic size={12} strokeWidth={2} />{label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{activities.length} {tab === "all" ? "activities" : ACT_DEFS[tab]?.label.toLowerCase() + "s"}</span>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: viewMode === "timeline" ? "8px 32px 24px" : 24 }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite", margin: "0 auto 12px" }} />
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading activities...</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="empty-state-ai">
            {(() => { const Ic = tab === "all" ? Activity : ACT_DEFS[tab]?.icon; return <Ic size={40} />; })()}
            <h3>No {tab === "all" ? "activities" : ACT_DEFS[tab]?.label.toLowerCase() + "s"} yet</h3>
            <p>Start logging your {tab === "all" ? "sales activities" : ACT_DEFS[tab]?.label.toLowerCase() + "s"} to build a complete history</p>
            <button className="btn-primary" onClick={() => openNew(tab)} style={{ marginTop: 16 }}><Plus size={14} /> Log Activity</button>
          </div>
        ) : viewMode === "timeline" ? (
          /* ── Timeline view with date groups ── */
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            {Object.entries(groupedTimeline).map(([dateStr, group]) => (
              <div key={dateStr}>
                <DateGroupHeader dateStr={dateStr} />
                <AnimatePresence>
                  {group.map((a, i) => (
                    <motion.div key={a.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                      <TimelineItem activity={a} isLast={i === group.length - 1} onEdit={handleEdit} onDelete={deleteMut.mutate} canManage={isSalesHead || a.user_id === profile?.id} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ))}
          </div>
        ) : (
          /* ── Table view ── */
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>TYPE</th>
                    <th>TITLE / SUBJECT</th>
                    <th>DETAILS</th>
                    <th>STATUS / EXTRA</th>
                    <th style={{ textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a) => (
                    <TableRow key={a.id} activity={a} onEdit={handleEdit} onDelete={deleteMut.mutate} canManage={isSalesHead || a.user_id === profile?.id} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showForm && (
        <ActivityModal category={formCat} activity={null} onClose={() => setShowForm(false)} onSave={handleSave} />
      )}
      {editAct && (
        <ActivityModal category={editCat} activity={editAct} onClose={() => setEditAct(null)} onSave={handleSave} />
      )}
    </div>
  );
}
