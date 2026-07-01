import { createPortal } from "react-dom";
import { AlertTriangle, AlertCircle } from "lucide-react";

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtStage = (s) =>
  (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function getMemberName(id, members) {
  if (!id || !members?.length) return "—";
  const m = members.find((m) => m.id === id || m.user_id === id);
  return m?.full_name || "—";
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

/**
 * DuplicateCheckModal
 *
 * Props:
 *   type          "exact" | "partial"
 *   duplicates    [{ record, score, reasons }]  — sorted by score desc
 *   entityType    "lead" | "pipeline" | "deal"
 *   teamMembers   array of profile objects
 *   onCancel      fn — close modal, keep form open
 *   onProceed     fn — Create Anyway (exact, admin only) or Create New Record (partial)
 *   onViewExisting fn(record) — navigate to existing record
 *   canProceed    bool — true for owner/sales_head roles (controls "Create Anyway" visibility)
 */
export function DuplicateCheckModal({
  type,
  duplicates,
  entityType = "lead",
  teamMembers = [],
  onCancel,
  onProceed,
  onViewExisting,
  canProceed = false,
}) {
  if (!duplicates?.length) return null;

  const isExact = type === "exact";
  const top = duplicates[0];
  const rec = top.record;
  const stageField = entityType === "pipeline" ? "pipeline_stage" : "stage";

  const ENTITY_LABEL = { lead: "Lead", pipeline: "Prospect", deal: "Deal" };
  const entity = ENTITY_LABEL[entityType] || "Record";

  const accentColor = isExact ? "#EF4444" : "#F59E0B";
  const accentBg = isExact ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)";
  const accentBorder = isExact ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)";

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: "var(--bg-card, #1e1e2e)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          width: "100%", maxWidth: 520,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            {isExact
              ? <AlertTriangle size={20} color={accentColor} />
              : <AlertCircle size={20} color={accentColor} />}
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
              {isExact ? "Duplicate Prospect Detected" : "Similar Company Found"}
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {isExact
              ? `A ${entity.toLowerCase()} with matching details already exists in the system.`
              : `A similar company was found in the existing ${entity.toLowerCase()} records.`}
          </p>
        </div>

        {/* Existing record details */}
        <div style={{ padding: "16px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase" }}>
            Existing {entity}
          </div>
          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8, padding: "12px 14px",
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: "10px 20px",
            }}
          >
            <InfoRow label="Company" value={rec.company_name || rec.title} />
            <InfoRow label="Contact" value={rec.contact_name} />
            <InfoRow label="Stage" value={fmtStage(rec[stageField] || rec.stage)} />
            <InfoRow label="Created" value={fmtDate(rec.created_at)} />
            <InfoRow label="Assigned To" value={getMemberName(rec.assigned_to, teamMembers)} />
            <InfoRow label="Last Updated" value={fmtDate(rec.updated_at)} />
          </div>

          {/* Match reason badges */}
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {top.reasons.map((r) => (
              <span
                key={r}
                style={{
                  fontSize: 11, fontWeight: 600,
                  padding: "3px 8px", borderRadius: 99,
                  background: accentBg, color: accentColor,
                  border: `1px solid ${accentBorder}`,
                }}
              >
                {r}
              </span>
            ))}
          </div>

          {duplicates.length > 1 && (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
              +{duplicates.length - 1} more similar {entity.toLowerCase()}{duplicates.length > 2 ? "s" : ""} found
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 24px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap",
          }}
        >
          <button onClick={onCancel} className="btn-secondary" style={{ fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={() => onViewExisting(top.record)}
            className="btn-secondary"
            style={{ fontSize: 13, color: "#6366F1", borderColor: "rgba(99,102,241,0.4)" }}
          >
            View Existing {entity}
          </button>
          {isExact
            ? canProceed && (
                <button
                  onClick={onProceed}
                  className="btn-primary"
                  style={{ fontSize: 13, background: "#EF4444", borderColor: "#EF4444" }}
                >
                  Create Anyway
                </button>
              )
            : (
              <button onClick={onProceed} className="btn-primary" style={{ fontSize: 13 }}>
                Create New Record
              </button>
            )}
        </div>
      </div>
    </div>,
    document.body
  );
}
