import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { leadsService } from "../services/leadsService";
import {
  X, Building2, User, Phone, Mail, Briefcase, Link2, Calendar,
  Clock, Activity, Pencil, ChevronRight, Tag, Hash,
  ArrowRightLeft, Flame, Thermometer, Snowflake, Globe,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const LEAD_STATUSES = [
  { key: "pending",    label: "Pending",     color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
  { key: "connected",  label: "Connected",   color: "#3B82F6", bg: "rgba(59,130,246,0.12)"  },
  { key: "first_comm", label: "First Comm",  color: "#8B5CF6", bg: "rgba(139,92,246,0.12)"  },
  { key: "meeting_set",label: "Meeting Set", color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  { key: "won",        label: "Won",         color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  { key: "lost",       label: "Lost",        color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
];

const parseJSON = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };

const fmtDate = (d) => {
  if (!d) return null;
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return null; }
};

const fmtRelative = (d) => {
  if (!d) return null;
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return null; }
};

/* ─── Info Row ────────────────────────────────────────────────────────── */
function InfoRow({ icon: Icon, label, value, isLink }) {
  if (!value) return null;
  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "flex-start",
      padding: "9px 0", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={13} style={{ color: "var(--text-muted)" }} strokeWidth={1.7} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        <div style={{
          fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3,
        }}>
          {label}
        </div>
        {isLink ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13, color: "#3B82F6", textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500,
            }}
          >
            View Profile <ChevronRight size={11} strokeWidth={2} />
          </a>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500, lineHeight: 1.5 }}>
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Section Header ──────────────────────────────────────────────────── */
function SectionHead({ label }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 800, color: "var(--text-muted)",
      textTransform: "uppercase", letterSpacing: "0.09em",
      marginBottom: 2, marginTop: 20,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

/* ─── Activity Item ───────────────────────────────────────────────────── */
function ActivityItem({ activity, isLast }) {
  const colorMap = {
    lead: "#3B82F6", deal: "#10B981", task: "#F59E0B",
    meeting: "#8B5CF6", customer: "#14B8A6",
  };
  const color = colorMap[activity.type?.split("_")[0]] || "#6B7280";

  return (
    <div style={{ display: "flex", gap: 12, position: "relative" }}>
      {!isLast && (
        <div style={{
          position: "absolute", left: 15, top: 32, bottom: -4,
          width: 1, background: "var(--border)",
        }} />
      )}
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: `${color}14`,
        border: `1.5px solid ${color}28`,
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", zIndex: 1,
      }}>
        <Activity size={13} style={{ color }} strokeWidth={1.8} />
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 18 }}>
        <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55, fontWeight: 500 }}>
          {activity.description}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          {activity.user?.full_name && (
            <span style={{
              fontSize: 11, color: "var(--text-muted)", fontWeight: 700,
              padding: "1px 7px", borderRadius: 99,
              background: "var(--surface-2)", border: "1px solid var(--border)",
            }}>
              {activity.user.full_name}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.55 }}>
            {fmtRelative(activity.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton ────────────────────────────────────────────────────────── */
function ActivitySkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", gap: 12 }}>
          <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 13, width: "80%", borderRadius: 6, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 11, width: "45%", borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const TEMP_MAP = {
  hot:  { icon: Flame,       color: "#EF4444", label: "Hot" },
  warm: { icon: Thermometer, color: "#F59E0B", label: "Warm" },
  cold: { icon: Snowflake,   color: "#3B82F6", label: "Cold" },
};

/* ─── Main Panel ──────────────────────────────────────────────────────── */
export default function LeadDetailPanel({ lead, onClose, onEdit, onConvert }) {
  const { isSalesHead } = useAuth();
  const [activeTab, setActiveTab] = useState("details");

  const extra = parseJSON(lead?.other_notes);
  const statusInfo = LEAD_STATUSES.find((s) => s.key === lead?.stage) || LEAD_STATUSES[0];

  const { data: activities, isLoading: actLoading } = useQuery({
    queryKey: ["lead-activities", lead?.id],
    queryFn: () => leadsService.getActivities(lead.id),
    enabled: !!lead?.id && activeTab === "activity",
    staleTime: 30000,
  });

  if (!lead) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="panel-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9990,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      />

      <motion.aside
        key="panel"
        initial={{ x: "100%", opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 260, mass: 1 }}
        style={{
          position: "fixed", right: 0, top: 0, bottom: 0, zIndex: 9991,
          width: 520, maxWidth: "100vw",
          background: "var(--bg)",
          borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          boxShadow: "-24px 0 64px rgba(0,0,0,0.18)",
        }}
      >
        {/* ── Panel Header ── */}
        <div style={{
          padding: "20px 24px 0",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}>
          {/* Top row: title + actions */}
          <div style={{
            display: "flex", alignItems: "flex-start",
            justifyContent: "space-between", marginBottom: 16,
          }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <div style={{
                fontSize: 19, fontWeight: 800, color: "var(--text)",
                letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 8,
              }}>
                {lead.company_name || "Unnamed Lead"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {/* Status badge */}
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 11px", borderRadius: 99,
                  background: statusInfo.bg,
                  border: `1px solid ${statusInfo.color}30`,
                  fontSize: 12, fontWeight: 700, color: statusInfo.color,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: statusInfo.color,
                    boxShadow: `0 0 6px ${statusInfo.color}70`,
                    display: "inline-block",
                  }} />
                  {statusInfo.label}
                </span>

                {/* Temperature badge */}
                {lead.temperature && TEMP_MAP[lead.temperature] && (() => {
                  const t = TEMP_MAP[lead.temperature];
                  const TIcon = t.icon;
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 99, background: `${t.color}12`, border: `1px solid ${t.color}28`, fontSize: 12, fontWeight: 700, color: t.color }}>
                      <TIcon size={11} strokeWidth={2} />{t.label}
                    </span>
                  );
                })()}

                {/* Source badge */}
                {lead.source && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                    <Globe size={10} strokeWidth={2} />{lead.source}
                  </span>
                )}

                {/* Assigned */}
                {lead.assigned_profile && (
                  <span style={{
                    fontSize: 12, color: "var(--text-muted)",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <User size={11} strokeWidth={1.8} />
                    {lead.assigned_profile.full_name}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {isSalesHead && onConvert && lead.stage !== "won" && (
                <motion.button
                  onClick={(e) => { e.stopPropagation(); onConvert(lead); }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 15px", borderRadius: 10,
                    background: "rgba(16,185,129,0.1)",
                    border: "1px solid rgba(16,185,129,0.28)",
                    color: "#10B981", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(16,185,129,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(16,185,129,0.1)"; }}
                >
                  <ArrowRightLeft size={13} strokeWidth={1.8} />
                  Convert
                </motion.button>
              )}
              {isSalesHead && (
                <motion.button
                  onClick={(e) => { e.stopPropagation(); onEdit(lead); }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 15px", borderRadius: 10,
                    background: "rgba(37,99,235,0.1)",
                    border: "1px solid rgba(37,99,235,0.22)",
                    color: "#3B82F6", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(37,99,235,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(37,99,235,0.1)"; }}
                >
                  <Pencil size={13} strokeWidth={1.8} />
                  Edit
                </motion.button>
              )}
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.92 }}
                style={{
                  width: 36, height: 36,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "var(--text-muted)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <X size={15} />
              </motion.button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{
            display: "flex", gap: 0,
            borderBottom: "none",
          }}>
            {[
              { key: "details", label: "Details", icon: Hash },
              { key: "activity", label: "Activity", icon: Activity },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 16px", fontSize: 13.5, fontWeight: 600,
                  background: "transparent", border: "none",
                  borderBottom: activeTab === tab.key
                    ? "2px solid #3B82F6"
                    : "2px solid transparent",
                  color: activeTab === tab.key ? "#3B82F6" : "var(--text-muted)",
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s",
                  marginBottom: -1,
                }}
              >
                <tab.icon size={13} strokeWidth={1.9} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Panel Body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 24px 32px" }}>
          <AnimatePresence mode="wait">
            {/* ── Details Tab ── */}
            {activeTab === "details" && (
              <motion.div
                key="details"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                <SectionHead label="Contact" />
                <InfoRow icon={User}      label="Full Name"    value={lead.contact_name} />
                <InfoRow icon={Briefcase} label="Designation"  value={lead.designation} />
                <InfoRow icon={Mail}      label="Email"        value={lead.email} />
                <InfoRow icon={Phone}     label="Phone"        value={lead.phone} />
                <InfoRow icon={Building2} label="Company"      value={lead.company_name} />
                {extra.linkedin_url && (
                  <InfoRow icon={Link2} label="LinkedIn" value={extra.linkedin_url} isLink />
                )}

                <SectionHead label="Timeline" />
                <InfoRow icon={Calendar} label="Connect Request"   value={fmtDate(extra.linkedin_connect_request)} />
                <InfoRow icon={Calendar} label="Connection Accept"  value={fmtDate(extra.linkedin_connection_accept)} />
                <InfoRow icon={Calendar} label="First Communication" value={fmtDate(extra.first_comm_date)} />
                <InfoRow icon={Calendar} label="Meeting / Follow-up" value={fmtDate(lead.follow_up_date)} />

                <SectionHead label="Status" />
                <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{
                    fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8,
                  }}>
                    Lead Status
                  </div>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "6px 16px", borderRadius: 99,
                    background: statusInfo.bg,
                    border: `1px solid ${statusInfo.color}30`,
                    fontSize: 13, fontWeight: 700, color: statusInfo.color,
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: statusInfo.color,
                      boxShadow: `0 0 8px ${statusInfo.color}80`,
                    }} />
                    {statusInfo.label}
                  </span>
                </div>
                {extra.meeting_status && extra.meeting_status !== "—" && (
                  <InfoRow icon={Calendar} label="Meeting Status" value={extra.meeting_status} />
                )}

                {lead.remarks && (
                  <>
                    <SectionHead label="Notes" />
                    <div style={{
                      padding: "14px 16px", borderRadius: 12, marginTop: 4,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.7,
                    }}>
                      {lead.remarks}
                    </div>
                  </>
                )}

                <SectionHead label="Record Info" />
                <InfoRow
                  icon={Clock}
                  label="Created"
                  value={lead.created_at ? `${fmtDate(lead.created_at)} · ${fmtRelative(lead.created_at)}` : null}
                />
                <InfoRow
                  icon={Clock}
                  label="Last Updated"
                  value={lead.updated_at ? `${fmtDate(lead.updated_at)} · ${fmtRelative(lead.updated_at)}` : null}
                />
                {lead.source && (
                  <InfoRow icon={Tag} label="Source" value={lead.source} />
                )}
              </motion.div>
            )}

            {/* ── Activity Tab ── */}
            {activeTab === "activity" && (
              <motion.div
                key="activity"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                style={{ paddingTop: 16 }}
              >
                {actLoading ? (
                  <ActivitySkeleton />
                ) : !activities?.length ? (
                  <div style={{
                    textAlign: "center", padding: "52px 24px",
                    color: "var(--text-muted)",
                  }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: 16,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto 16px",
                    }}>
                      <Activity size={24} style={{ opacity: 0.35 }} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2)", marginBottom: 6 }}>
                      No activity yet
                    </div>
                    <div style={{ fontSize: 12.5, opacity: 0.55, lineHeight: 1.5 }}>
                      Actions on this lead will appear here
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {activities.map((act, i) => (
                      <ActivityItem
                        key={act.id}
                        activity={act}
                        isLast={i === activities.length - 1}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
