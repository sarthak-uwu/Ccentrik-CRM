import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { DndContext, closestCenter, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import { useAuth } from "../context/AuthContext";
import { dealsService } from "../services/dealsService";
import toast from "react-hot-toast";
import {
  Plus, Search, Pencil, Trash2, X, TrendingUp, Download, Upload,
  LayoutList, Columns, MoreVertical, CheckCircle2, XCircle, Calendar,
  Clock, IndianRupee, AlertTriangle,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const parseJSON = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };
const toJSON    = (obj) => JSON.stringify(obj);

function fmtVal(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!n) return null;
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function dealHealth(deal) {
  const ts = deal.updated_at || deal.created_at;
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days < 3)  return { color: "#10B981", label: "Active",  days };
  if (days < 7)  return { color: "#F59E0B", label: "At Risk", days };
  return           { color: "#EF4444", label: "Stale",   days };
}

function closingSoon(deal) {
  if (!deal.close_date || ["won","lost"].includes(deal.stage)) return null;
  const days = Math.ceil((new Date(deal.close_date) - Date.now()) / 86400000);
  if (days < 0)  return { label: `${Math.abs(days)}d overdue`, color: "#EF4444", bg: "#FEE2E2" };
  if (days <= 3) return { label: `${days}d left`,              color: "#EF4444", bg: "#FEE2E2" };
  if (days <= 7) return { label: `${days}d left`,              color: "#F59E0B", bg: "#FEF3C7" };
  return null;
}

// ─── Stage config ─────────────────────────────────────────────────────────────
const FUNNEL_STATUSES = [
  { key: "active",      label: "Active",        color: "#3B82F6", bg: "#DBEAFE",  dark: "rgba(59,130,246,0.12)",  probability: 10  },
  { key: "proposal",    label: "Proposal Sent", color: "#F59E0B", bg: "#FEF3C7",  dark: "rgba(245,158,11,0.12)",  probability: 30  },
  { key: "demo",        label: "Demo Done",     color: "#8B5CF6", bg: "#EDE9FE",  dark: "rgba(139,92,246,0.12)",  probability: 50  },
  { key: "negotiation", label: "Negotiation",   color: "#EA580C", bg: "#FFEDD5",  dark: "rgba(234,88,12,0.12)",   probability: 70  },
  { key: "won",         label: "Won",           color: "#10B981", bg: "#D1FAE5",  dark: "rgba(16,185,129,0.12)",  probability: 100 },
  { key: "lost",        label: "Lost",          color: "#EF4444", bg: "#FEE2E2",  dark: "rgba(239,68,68,0.12)",   probability: 0   },
  { key: "on_hold",     label: "On Hold",       color: "#6B7280", bg: "#F3F4F6",  dark: "rgba(107,114,128,0.12)", probability: 20  },
];

// ─── CSV helpers ──────────────────────────────────────────────────────────────
const CSV_HEADERS = ["Status","Company Name","Headquarters","Contact Name","Designation","Contact No","Value","Close Date","Remarks"];
function csvEsc(v) { return `"${(v||"").toString().replace(/"/g,'""')}"`; }
function exportCSV(rows) {
  const lines = [CSV_HEADERS.map(csvEsc).join(",")];
  rows.forEach((d) => {
    const x = parseJSON(d.notes);
    lines.push([d.stage, d.company_name||d.title, x.headquarters, d.contact_name, x.designation, x.contact, d.value||"", d.close_date||"", x.remarks].map(csvEsc).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "deals.csv" });
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
  return lines.slice(1).map((l) => { const v = parseLine(l); return Object.fromEntries(headers.map((h,i) => [h, v[i]||""])); });
}
function csvToPayload(row, userId) {
  return {
    title: row["Company Name"], company_name: row["Company Name"], contact_name: row["Contact Name"],
    stage: row["Status"] || "active",
    value: row["Value"] ? Number(row["Value"]) : null,
    close_date: row["Close Date"] || null,
    notes: JSON.stringify({ headquarters: row["Headquarters"], designation: row["Designation"], contact: row["Contact No"], remarks: row["Remarks"] }),
    created_by: userId,
  };
}

// ─── Pipeline Stats Bar ───────────────────────────────────────────────────────
function PipelineStatsBar({ deals }) {
  const active = deals.filter((d) => !["won","lost"].includes(d.stage));
  const wonDeals = deals.filter((d) => d.stage === "won");
  const now = new Date();
  const wonMTD = wonDeals
    .filter((d) => { const dt = new Date(d.closed_at || d.updated_at); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear(); })
    .reduce((s, d) => s + (Number(d.value) || 0), 0);
  const totalPipeline = active.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const weightedForecast = active.reduce((s, d) => {
    const prob = FUNNEL_STATUSES.find((x) => x.key === d.stage)?.probability || 0;
    return s + (Number(d.value) || 0) * prob / 100;
  }, 0);
  const avgDeal = active.length ? totalPipeline / active.length : 0;
  const atRisk = active.filter((d) => dealHealth(d).label !== "Active").length;

  const items = [
    { v: fmtVal(totalPipeline) || "—", l: "pipeline",        c: "var(--accent)" },
    { v: fmtVal(weightedForecast) || "—", l: "wtd forecast", c: "#8B5CF6" },
    { v: fmtVal(wonMTD) || "—",     l: "won this month",     c: "#10B981" },
    { v: fmtVal(avgDeal) || "—",    l: "avg deal size",      c: "#3B82F6" },
    { v: atRisk,                    l: "at risk",             c: atRisk > 0 ? "#EF4444" : "var(--text-muted)" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "7px 20px", borderBottom: "1px solid var(--border)", overflowX: "auto", gap: 0, flexShrink: 0 }}>
      {items.map((s, i) => (
        <div key={s.l} style={{ display: "flex", alignItems: "baseline", gap: 5, padding: "2px 18px", flexShrink: 0, ...(i > 0 ? { borderLeft: "1px solid var(--border)" } : {}) }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: s.c, letterSpacing: "-0.03em" }}>{s.v}</span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{s.l}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ stage }) {
  const s = FUNNEL_STATUSES.find((x) => x.key === stage);
  if (!s) return <span style={{ color: "var(--text-muted)" }}>{stage || "—"}</span>;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99,
      fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />
      {s.label}
    </span>
  );
}

// ─── Lost Reason Modal ────────────────────────────────────────────────────────
const LOST_REASONS = ["Price too high","Chose competitor","No budget","No decision made","Wrong timing","Requirements not met","Other"];

function LostReasonModal({ deal, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 420 }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Mark as Lost</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{deal.company_name || deal.title}</p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="crm-label">Lost Reason</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {LOST_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  style={{
                    padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: reason === r ? "#FEE2E2" : "var(--surface-2)",
                    color: reason === r ? "#EF4444" : "var(--text-2)",
                    border: `1.5px solid ${reason === r ? "#EF444460" : "var(--border)"}`,
                    transition: "all 0.14s",
                  }}
                >{r}</button>
              ))}
            </div>
          </div>
          {reason === "Other" && (
            <div>
              <label className="crm-label">Specify reason</label>
              <input className="crm-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Enter reason..." />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              style={{ background: "#EF4444", borderColor: "#EF4444" }}
              disabled={!reason}
              onClick={() => onConfirm(reason === "Other" ? (custom || "Other") : reason)}
            >Mark Lost</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Deal Modal ───────────────────────────────────────────────────────────────
function DealModal({ deal, onClose, onSave }) {
  const extra = parseJSON(deal?.notes);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      stage:        deal?.stage || "active",
      company_name: deal?.company_name || deal?.title || "",
      headquarters: extra.headquarters || "",
      contact_name: deal?.contact_name || "",
      designation:  extra.designation || "",
      contact:      extra.contact || "",
      value:        deal?.value || "",
      close_date:   deal?.close_date || "",
      remarks:      extra.remarks || "",
    },
  });
  const selectedStage = watch("stage");

  const handleSave = async (fd) => {
    await onSave({
      title:        fd.company_name,
      company_name: fd.company_name,
      contact_name: fd.contact_name,
      stage:        fd.stage,
      value:        fd.value ? Number(fd.value) : null,
      close_date:   fd.close_date || null,
      notes: toJSON({ headquarters: fd.headquarters, designation: fd.designation, contact: fd.contact, remarks: fd.remarks }),
    });
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 560 }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{deal?.id ? "Edit Deal" : "Add Deal"}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(handleSave)} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Stage picker */}
          <div>
            <label className="crm-label">Stage *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {FUNNEL_STATUSES.map((s) => (
                <label key={s.key} style={{ cursor: "pointer" }}>
                  <input type="radio" value={s.key} {...register("stage")} style={{ display: "none" }} />
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", borderRadius: 99,
                    fontSize: 12, fontWeight: 600,
                    background: selectedStage === s.key ? s.bg : "var(--surface-2)",
                    color: selectedStage === s.key ? s.color : "var(--text-muted)",
                    border: `1.5px solid ${selectedStage === s.key ? s.color + "60" : "var(--border)"}`,
                    cursor: "pointer", transition: "all 0.14s",
                  }}>
                    {selectedStage === s.key && <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />}
                    {s.label}
                    {selectedStage === s.key && s.probability > 0 && (
                      <span style={{ fontSize: 10, opacity: 0.75 }}>{s.probability}%</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="crm-label">Company Name *</label>
              <input className="crm-input" {...register("company_name", { required: "Required" })} placeholder="Acme Corp" />
              {errors.company_name && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.company_name.message}</span>}
            </div>
            <div>
              <label className="crm-label">Headquarters</label>
              <input className="crm-input" {...register("headquarters")} placeholder="Mumbai, India" />
            </div>
            <div>
              <label className="crm-label">Contact Name</label>
              <input className="crm-input" {...register("contact_name")} placeholder="John Doe" />
            </div>
            <div>
              <label className="crm-label">Designation</label>
              <input className="crm-input" {...register("designation")} placeholder="CTO" />
            </div>
            <div>
              <label className="crm-label">Contact No.</label>
              <input className="crm-input" {...register("contact")} placeholder="+91 98765 43210" />
            </div>
            <div>
              <label className="crm-label">Deal Value (₹)</label>
              <div style={{ position: "relative" }}>
                <IndianRupee size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input className="crm-input" type="number" min="0" {...register("value")} placeholder="500000" style={{ paddingLeft: 28 }} />
              </div>
            </div>
            <div>
              <label className="crm-label">Expected Close Date</label>
              <input className="crm-input" type="date" {...register("close_date")} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Remarks</label>
              <textarea className="crm-input" {...register("remarks")} rows={3} placeholder="Deal notes..." style={{ resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : deal?.id ? "Save Changes" : "Add Deal"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Quick Action Menu ────────────────────────────────────────────────────────
function QuickMenu({ deal, onEdit, onMarkWon, onMarkLost, onDelete, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items = [
    { label: "Edit",      icon: Pencil,       action: () => { onEdit(deal); onClose(); }, color: "var(--text-2)" },
    { label: "Mark Won",  icon: CheckCircle2, action: () => { onMarkWon(deal); onClose(); }, color: "#10B981", disabled: deal.stage === "won" },
    { label: "Mark Lost", icon: XCircle,      action: () => { onMarkLost(deal); onClose(); }, color: "#EF4444", disabled: deal.stage === "lost" },
    { label: "Delete",    icon: Trash2,       action: () => { onDelete(deal.id); onClose(); }, color: "#EF4444", danger: true },
  ];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -4 }}
      transition={{ duration: 0.12 }}
      style={{
        position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 10, boxShadow: "var(--shadow-lg)",
        padding: "4px 0", minWidth: 150,
      }}
    >
      {items.map(({ label, icon: Icon, action, color, danger, disabled }) => (
        <button
          key={label}
          onClick={(e) => { e.stopPropagation(); if (!disabled) action(); }}
          disabled={disabled}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", padding: "8px 14px", border: "none",
            background: "transparent", cursor: disabled ? "not-allowed" : "pointer",
            color: disabled ? "var(--text-muted)" : color,
            fontSize: 13, fontWeight: 500, textAlign: "left",
            opacity: disabled ? 0.5 : 1,
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = danger ? "#FEE2E240" : "var(--surface-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <Icon size={13} strokeWidth={1.8} />
          {label}
        </button>
      ))}
    </motion.div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function DealCard({ deal, onEdit, onMarkWon, onMarkLost, onDelete, isDragging = false }) {
  const extra  = parseJSON(deal.notes);
  const s      = FUNNEL_STATUSES.find((x) => x.key === deal.stage) || FUNNEL_STATUSES[0];
  const health = dealHealth(deal);
  const val    = fmtVal(deal.value);
  const [menuOpen, setMenuOpen] = useState(false);

  const isTerminal = ["won", "lost"].includes(deal.stage);
  const staleDays  = Math.floor((Date.now() - new Date(deal.updated_at || deal.created_at).getTime()) / 86400000);
  const isPremium  = Number(deal.value) >= 500000;
  const heatClass  = !isTerminal ? (staleDays >= 7 ? "deal-critical" : staleDays >= 3 ? "deal-at-risk" : "") : "";
  const premClass  = isPremium && !isTerminal ? "deal-premium" : "";
  const heatClasses = [heatClass, premClass].filter(Boolean).join(" ");

  return (
    <div
      className={`kanban-card${heatClasses ? ` ${heatClasses}` : ""}`}
      style={{
        opacity: isDragging ? 0.35 : 1,
        borderLeft: `3px solid ${s.color}`,
        cursor: isDragging ? "grabbing" : "grab",
        position: "relative",
      }}
    >
      {/* Top row: company + menu */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4, marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", flex: 1, lineHeight: 1.35 }}>
          {deal.company_name || deal.title || "—"}
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="icon-action-btn"
            title="Actions"
            style={{ opacity: 0.6 }}
          >
            <MoreVertical size={12} strokeWidth={2} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <QuickMenu
                deal={deal}
                onEdit={onEdit}
                onMarkWon={onMarkWon}
                onMarkLost={onMarkLost}
                onDelete={onDelete}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Contact */}
      {deal.contact_name && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
          {deal.contact_name}{extra.designation ? ` · ${extra.designation}` : ""}
        </div>
      )}

      {/* Value + close date row */}
      {(val || deal.close_date) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          {val && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 11.5, fontWeight: 700, color: "#10B981",
              background: "#D1FAE5", padding: "2px 8px", borderRadius: 6,
            }}>
              {val}
            </span>
          )}
          {deal.close_date && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 11, color: "var(--text-muted)",
            }}>
              <Calendar size={10} strokeWidth={1.8} />
              {new Date(deal.close_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      )}

      {/* Close-date urgency badge */}
      {(() => { const cs = closingSoon(deal); return cs ? (
        <div style={{ marginBottom: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: cs.color, background: cs.bg, padding: "2px 8px", borderRadius: 5 }}>
            <Calendar size={9} strokeWidth={2} /> {cs.label}
          </span>
        </div>
      ) : null; })()}

      {/* Probability bar */}
      {s.probability > 0 && s.probability < 100 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Win probability</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{s.probability}%</span>
          </div>
          <div style={{ height: 3, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${s.probability}%`, background: s.color, borderRadius: 99, transition: "width 0.5s" }} />
          </div>
        </div>
      )}

      {/* Remarks */}
      {extra.remarks && (
        <div style={{
          fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: "100%", marginBottom: 8, opacity: 0.7,
        }} title={extra.remarks}>{extra.remarks}</div>
      )}

      {/* Footer: health indicator + HQ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        {extra.headquarters && (
          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>📍 {extra.headquarters}</span>
        )}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto",
          fontSize: 10.5, fontWeight: 600, color: health.color,
        }}>
          <Clock size={9} strokeWidth={2} />
          {health.days === 0 ? "Today" : `${health.days}d`}
          {health.label === "Stale" && <AlertTriangle size={9} strokeWidth={2} />}
        </span>
      </div>
    </div>
  );
}

// ─── Draggable + Droppable ────────────────────────────────────────────────────
function DraggableDeal({ deal, onEdit, onMarkWon, onMarkLost, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id, data: { deal },
  });
  const style = transform ? { transform: `translate(${transform.x}px,${transform.y}px)`, zIndex: isDragging ? 999 : "auto" } : {};
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <DealCard deal={deal} onEdit={onEdit} onMarkWon={onMarkWon} onMarkLost={onMarkLost} onDelete={onDelete} isDragging={isDragging} />
    </div>
  );
}

function KanbanColumn({ status, deals, onEdit, onMarkWon, onMarkLost, onDelete, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.key });
  const totalVal    = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const weightedVal = status.probability > 0 && status.probability < 100
    ? deals.reduce((s, d) => s + (Number(d.value) || 0) * status.probability / 100, 0)
    : 0;

  return (
    <div
      ref={setNodeRef}
      style={{
        width: 248, minWidth: 248, flexShrink: 0,
        border: isOver ? `1.5px solid ${status.color}` : "1.5px solid var(--border)",
        borderRadius: 14,
        display: "flex", flexDirection: "column",
        transition: "border-color 0.15s, background 0.15s",
        background: isOver ? status.dark : "var(--surface-2)",
        maxHeight: "calc(100vh - 160px)",
      }}
    >
      {/* Column header */}
      <div style={{
        padding: "12px 14px 10px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: status.color,
              boxShadow: `0 0 8px ${status.color}80`,
            }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{status.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
              background: status.bg, color: status.color,
            }}>{deals.length}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 1 }}>{status.probability}%</span>
          </div>
          {totalVal > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", paddingLeft: 14 }}>
              {fmtVal(totalVal)}
              {weightedVal > 0 && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · ~{fmtVal(weightedVal)}</span>}
            </span>
          )}
        </div>
        <button
          onClick={() => onAdd(status.key)}
          className="icon-action-btn"
          title="Add deal"
          style={{ color: status.color, opacity: 0.7 }}
        >
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* Cards */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "8px 8px 10px",
        display: "flex", flexDirection: "column", gap: 6,
        minHeight: 80,
      }}>
        {deals.map((d) => (
          <DraggableDeal key={d.id} deal={d} onEdit={onEdit} onMarkWon={onMarkWon} onMarkLost={onMarkLost} onDelete={onDelete} />
        ))}
        {deals.length === 0 && (
          <div style={{
            border: "2px dashed var(--border)", borderRadius: 10,
            padding: "20px 12px", textAlign: "center",
            color: "var(--text-muted)", fontSize: 12,
          }}>
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Deals() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [view, setView]             = useState("kanban");
  const [showForm, setShowForm]     = useState(false);
  const [editDeal, setEditDeal]     = useState(null);
  const [defaultStage, setDefaultStage] = useState("active");
  const [search, setSearch]         = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [activeId, setActiveId]     = useState(null);
  const [activeDeal, setActiveDeal] = useState(null);
  const [lostDeal, setLostDeal]     = useState(null);
  const fileRef = useRef();

  const { data: dealsData, isLoading } = useQuery({
    queryKey: ["deals", search, filterStage],
    queryFn: () => dealsService.getAll({ search, stage: filterStage }),
  });

  const createMutation = useMutation({
    mutationFn: dealsService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deals"] }); toast.success("Deal added"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => dealsService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deals"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); toast.success("Updated"); setEditDeal(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: dealsService.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deals"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (data) => {
    const payload = { ...data, created_by: profile?.id };
    if (editDeal) await updateMutation.mutateAsync({ id: editDeal.id, ...payload });
    else await createMutation.mutateAsync({ ...payload, stage: data.stage || defaultStage });
  };

  const handleMarkWon = (deal) => {
    updateMutation.mutate({ id: deal.id, stage: "won", closed_at: new Date().toISOString() });
    toast.success("Deal marked as Won");
  };

  const handleMarkLost = (deal) => {
    setLostDeal(deal);
  };

  const confirmLost = (reason) => {
    const extra = parseJSON(lostDeal.notes);
    updateMutation.mutate({
      id: lostDeal.id,
      stage: "lost",
      closed_at: new Date().toISOString(),
      notes: toJSON({ ...extra, lost_reason: reason }),
    });
    toast.success("Deal marked as Lost");
    setLostDeal(null);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const rows = parseCSVText(await file.text());
    let ok = 0, fail = 0;
    for (const row of rows) {
      if (!row["Company Name"]) continue;
      try { await createMutation.mutateAsync(csvToPayload(row, profile?.id)); ok++; }
      catch { fail++; }
    }
    toast.success(`Imported ${ok} deals${fail ? `, ${fail} failed` : ""}`);
    e.target.value = "";
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null); setActiveDeal(null);
    if (!over) return;
    const newStage = over.id;
    const deal = deals.find((d) => d.id === active.id);
    if (deal && deal.stage !== newStage && FUNNEL_STATUSES.find((s) => s.key === newStage)) {
      if (newStage === "lost") { setLostDeal(deal); return; }
      const extra = parseJSON(deal.notes);
      const update = { id: active.id, stage: newStage };
      if (newStage === "won") update.closed_at = new Date().toISOString();
      updateMutation.mutate(update);
      toast.success(`Moved to ${FUNNEL_STATUSES.find(s=>s.key===newStage)?.label}`);
    }
  };

  const openAddForStage = (stageKey) => {
    setDefaultStage(stageKey);
    setEditDeal(null);
    setShowForm(true);
  };

  const deals = dealsData?.data || [];
  const totalPipelineValue = deals
    .filter((d) => !["won", "lost"].includes(d.stage))
    .reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Toolbar ── */}
      <div style={{
        padding: "12px 20px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 10,
        background: "var(--surface)", flexWrap: "wrap",
      }}>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 260 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="crm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search deals..." style={{ paddingLeft: 30, height: 36 }} />
        </div>
        {view === "list" && (
          <select className="crm-input" value={filterStage} onChange={(e) => setFilterStage(e.target.value)} style={{ width: "auto", height: 36 }}>
            <option value="">All Stages</option>
            {FUNNEL_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{dealsData?.count || 0} deals</span>
          {totalPipelineValue > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981" }}>Pipeline: {fmtVal(totalPipelineValue)}</span>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 2, gap: 1 }}>
          {[{ v: "list", icon: LayoutList }, { v: "kanban", icon: Columns }].map(({ v, icon: Icon }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: view === v ? "var(--surface)" : "transparent",
                border: view === v ? "1px solid var(--border)" : "1px solid transparent",
                borderRadius: 6, padding: "5px 8px", cursor: "pointer",
                color: view === v ? "var(--text)" : "var(--text-muted)",
                boxShadow: view === v ? "var(--shadow-xs)" : "none",
                transition: "all 0.14s",
              }}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleImport} />
        <button className="btn-secondary" onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px" }}>
          <Upload size={13} /> Import
        </button>
        <button className="btn-secondary" onClick={() => exportCSV(deals)} disabled={!deals.length} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px" }}>
          <Download size={13} /> Export
        </button>
        <button className="btn-primary" onClick={() => { setDefaultStage("active"); setEditDeal(null); setShowForm(true); }} style={{ height: 36 }}>
          <Plus size={14} /> Add Deal
        </button>
      </div>

      {/* ── Pipeline Stats ── */}
      {deals.length > 0 && <PipelineStatsBar deals={deals} />}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ display: "flex", gap: 12, padding: 20 }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton" style={{ width: 248, height: 400, borderRadius: 14 }} />
            ))}
          </div>
        ) : deals.length === 0 && !search ? (
          <div className="empty-state">
            <TrendingUp size={40} />
            <h3>No deals in the funnel</h3>
            <p>Add your first deal to start tracking progress</p>
            <button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginTop: 16 }}>
              <Plus size={14} /> Add Deal
            </button>
          </div>
        ) : view === "kanban" ? (
          /* ── KANBAN ── */
          <DndContext
            collisionDetection={closestCenter}
            onDragStart={({ active }) => { setActiveId(active.id); setActiveDeal(active.data.current?.deal); }}
            onDragEnd={handleDragEnd}
          >
            <div style={{ display: "flex", gap: 12, padding: "16px 20px", overflowX: "auto", height: "100%", alignItems: "flex-start" }}>
              {FUNNEL_STATUSES.map((status) => (
                <KanbanColumn
                  key={status.key}
                  status={status}
                  deals={deals.filter((d) => d.stage === status.key)}
                  onEdit={setEditDeal}
                  onMarkWon={handleMarkWon}
                  onMarkLost={handleMarkLost}
                  onDelete={(id) => { if (window.confirm("Delete this deal?")) deleteMutation.mutate(id); }}
                  onAdd={openAddForStage}
                />
              ))}
            </div>
            <DragOverlay>
              {activeDeal && (
                <div style={{ transform: "rotate(2deg)", opacity: 0.92, width: 248 }}>
                  <DealCard deal={activeDeal} onEdit={() => {}} onMarkWon={() => {}} onMarkLost={() => {}} onDelete={() => {}} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          /* ── TABLE ── */
          <div style={{ padding: "16px 20px", overflowY: "auto", height: "100%" }}>
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>STATUS</th><th>COMPANY</th><th>HQ</th>
                      <th>CONTACT</th><th>DESIGNATION</th><th>PHONE</th>
                      <th>VALUE</th><th>CLOSE DATE</th><th>HEALTH</th>
                      <th style={{ textAlign: "right" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals.length === 0 ? (
                      <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No deals found</td></tr>
                    ) : deals.map((d) => {
                      const extra  = parseJSON(d.notes);
                      const health = dealHealth(d);
                      return (
                        <tr key={d.id}>
                          <td><StatusBadge stage={d.stage} /></td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{d.company_name || d.title || "—"}</div>
                            {extra.lost_reason && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 2 }}>Lost: {extra.lost_reason}</div>}
                          </td>
                          <td style={{ fontSize: 12.5, color: "var(--text-2)" }}>{extra.headquarters || "—"}</td>
                          <td style={{ fontSize: 13, color: "var(--text-2)" }}>{d.contact_name || "—"}</td>
                          <td style={{ fontSize: 12.5, color: "var(--text-2)" }}>{extra.designation || "—"}</td>
                          <td style={{ fontSize: 12.5, color: "var(--text-2)" }}>{extra.contact || "—"}</td>
                          <td>
                            {d.value
                              ? <span style={{ fontSize: 12.5, fontWeight: 700, color: "#10B981" }}>{fmtVal(d.value)}</span>
                              : <span style={{ color: "var(--text-muted)" }}>—</span>}
                          </td>
                          <td style={{ fontSize: 12, color: "var(--text-2)" }}>
                            {d.close_date
                              ? new Date(d.close_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })
                              : <span style={{ color: "var(--text-muted)" }}>—</span>}
                          </td>
                          <td>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: health.color }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: health.color }} />
                              {health.label}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                              <motion.button className="btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setEditDeal(d)} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><Pencil size={13} strokeWidth={1.75} /></motion.button>
                              {d.stage !== "won"  && <motion.button className="btn-ghost" style={{ padding: "4px 8px", color: "#10B981" }} onClick={() => handleMarkWon(d)}  whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><CheckCircle2 size={13} strokeWidth={1.75} /></motion.button>}
                              {d.stage !== "lost" && <motion.button className="btn-ghost" style={{ padding: "4px 8px", color: "#EF4444" }} onClick={() => handleMarkLost(d)} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><XCircle size={13} strokeWidth={1.75} /></motion.button>}
                              <motion.button className="btn-ghost" style={{ padding: "4px 8px", color: "var(--red)" }} onClick={() => { if (window.confirm("Delete?")) deleteMutation.mutate(d.id); }} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><Trash2 size={13} strokeWidth={1.75} /></motion.button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {(showForm || editDeal) && (
          <DealModal
            deal={editDeal ? editDeal : { stage: defaultStage }}
            onClose={() => { setShowForm(false); setEditDeal(null); }}
            onSave={handleSave}
          />
        )}
        {lostDeal && (
          <LostReasonModal
            deal={lostDeal}
            onClose={() => setLostDeal(null)}
            onConfirm={confirmLost}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
