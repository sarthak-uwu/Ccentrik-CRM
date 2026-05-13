import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useAuth } from "../context/AuthContext";
import { teamService } from "../services/teamService";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Plus, Search, X, Edit2, Users, Shield, UserCheck, UserX, Trash2 } from "lucide-react";

const ROLES = [
  { key: "owner",         label: "Super Admin",    color: "#8B5CF6", bg: "#EDE9FE", desc: "Full system access — can manage everything" },
  { key: "sales_head",    label: "Sales Head",     color: "#EF4444", bg: "#FEE2E2", desc: "View all data, manage entire team" },
  { key: "sales_manager", label: "Sales Manager",  color: "#F59E0B", bg: "#FEF3C7", desc: "Manage assigned team members & their leads" },
  { key: "employee",      label: "Employee",       color: "#1B76D3", bg: "#EBF4FF", desc: "Own leads, tasks & activities only" },
];

// Role hierarchy level — higher = more powerful
const ROLE_LEVEL = { owner: 4, sales_head: 3, sales_manager: 2, employee: 1 };

// Roles a given role can invite / assign
function getAssignableRoles(myRole) {
  if (myRole === "owner")      return ROLES;
  if (myRole === "sales_head") return ROLES.filter((r) => ["sales_manager", "employee"].includes(r.key));
  return [];
}

// Whether myRole can manage (edit/toggle) a target member
function canManageMember(myRole, targetRole, isMe) {
  if (isMe) return false;
  return ROLE_LEVEL[myRole] > ROLE_LEVEL[targetRole];
}

function RoleBadge({ role }) {
  const r = ROLES.find((x) => x.key === role);
  if (!r) return null;
  return (
    <span style={{ background: r.bg, color: r.color, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>
      {r.label}
    </span>
  );
}

function InviteModal({ onClose, onInvite, allowedRoles }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { emailUsername: "", role: allowedRoles[0]?.key || "employee" },
  });

  const buildPayload = (data) => ({
    ...data,
    email: `${data.emailUsername.trim().toLowerCase()}@ccentrik.com`,
  });

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Invite Team Member</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit((d) => onInvite(buildPayload(d)))} style={{ padding: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="crm-label">Full Name *</label>
              <input className="crm-input" {...register("full_name", { required: "Required" })} placeholder="Jane Smith" />
              {errors.full_name && <span style={{ color: "#EF4444", fontSize: 11.5 }}>{errors.full_name.message}</span>}
            </div>

            <div>
              <label className="crm-label">CRM Email (Login) *</label>
              <div style={{ display: "flex", alignItems: "stretch" }}>
                <input
                  className="crm-input"
                  type="text"
                  {...register("emailUsername", {
                    required: "Required",
                    pattern: { value: /^[a-zA-Z0-9._%+-]+$/, message: "No spaces or @ symbol" },
                  })}
                  placeholder="jane.smith"
                  style={{ borderRadius: "var(--r-sm) 0 0 var(--r-sm)", flex: 1 }}
                />
                <div style={{
                  padding: "0 13px", height: 40, display: "flex", alignItems: "center",
                  background: "var(--surface-2)", border: "1.5px solid var(--border)",
                  borderLeft: "none", borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                  fontSize: 13, fontWeight: 600, color: "var(--accent)", whiteSpace: "nowrap",
                  letterSpacing: "-0.01em",
                }}>
                  @ccentrik.com
                </div>
              </div>
              {errors.emailUsername && <span style={{ color: "#EF4444", fontSize: 11.5 }}>{errors.emailUsername.message}</span>}
            </div>

            <div>
              <label className="crm-label">Phone</label>
              <input className="crm-input" {...register("phone")} placeholder="+91 98765 43210" />
            </div>

            <div>
              <label className="crm-label">Assign Role *</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                {allowedRoles.map((r) => (
                  <label
                    key={r.key}
                    style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, border: `2px solid #E2E8F0`, background: "#FAFBFF", cursor: "pointer", transition: "all 0.15s", alignItems: "flex-start" }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = r.color}
                    onMouseLeave={(e) => { const radio = e.currentTarget.querySelector("input"); if (!radio.checked) e.currentTarget.style.borderColor = "#E2E8F0"; }}
                  >
                    <input
                      type="radio"
                      value={r.key}
                      {...register("role")}
                      style={{ marginTop: 3, accentColor: r.color }}
                      onChange={(ev) => {
                        document.querySelectorAll(".role-label").forEach((el) => {
                          el.style.borderColor = "#E2E8F0";
                          el.style.background = "#FAFBFF";
                        });
                        ev.currentTarget.closest("label").style.borderColor = r.color;
                        ev.currentTarget.closest("label").style.background = r.bg;
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.label}</div>
                      <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 1 }}>{r.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditRoleModal({ member, onClose, onSave, allowedRoles }) {
  const [role, setRole] = useState(member.role);
  const isAllowed = allowedRoles.some((r) => r.key === member.role);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Change Role</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#F8FAFC", borderRadius: 10, marginBottom: 18 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg, #1B76D3, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white", flexShrink: 0 }}>
              {member.full_name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{member.full_name}</div>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>{member.email}</div>
            </div>
          </div>

          <label className="crm-label">Select New Role</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {allowedRoles.map((r) => (
              <label
                key={r.key}
                style={{
                  display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10,
                  border: `2px solid ${role === r.key ? r.color : "#E2E8F0"}`,
                  background: role === r.key ? r.bg : "transparent",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <input type="radio" value={r.key} checked={role === r.key} onChange={() => setRole(r.key)} style={{ marginTop: 3, accentColor: r.color }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.label}</div>
                  <div style={{ fontSize: 11.5, color: "#64748B" }}>{r.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onSave(member.id, role)} disabled={role === member.role}>
              Save Role
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Team() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");

  const myRole = profile?.role;
  const assignableRoles = getAssignableRoles(myRole);
  const canInvite = assignableRoles.length > 0;

  const { data: teamData, isLoading } = useQuery({
    queryKey: ["team", search, filterRole],
    queryFn: () => teamService.getAll({ search, role: filterRole }),
  });

  const inviteMutation = useMutation({
    mutationFn: teamService.inviteMember,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Invitation sent!"); setShowInvite(false); },
    onError: (e) => {
      if (!e.response) toast.error("Could not reach server. Make sure the backend is running on port 5000.");
      else toast.error(e.response?.data?.error || e.response?.data?.message || "Invitation failed. Please try again.");
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }) => teamService.updateRole(id, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Role updated"); setEditMember(null); },
    onError: (e) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, active }) => active ? teamService.activate(id) : teamService.deactivate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Status updated"); },
  });

  const removeMutation = useMutation({
    mutationFn: (id) => teamService.removeMember(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Member removed"); setConfirmRemove(null); },
    onError: (e) => toast.error(e.message),
  });

  const members = teamData?.data || [];
  const online = members.filter((m) => m.online_at && new Date(m.online_at) > new Date(Date.now() - 5 * 60 * 1000)).length;

  // Role summary counts
  const roleCounts = ROLES.map((r) => ({ ...r, count: members.filter((m) => m.role === r.key).length }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Toolbar */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 12, background: "#fff", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
            <span style={{ fontSize: 12.5, color: "#64748B" }}>Online:</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{online}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={14} style={{ color: "#1B76D3" }} />
            <span style={{ fontSize: 12.5, color: "#64748B" }}>Total:</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{teamData?.count || 0}</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
          <input className="crm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team..." style={{ paddingLeft: 30, fontSize: 13, height: 36, width: 200 }} />
        </div>
        <select className="crm-input" value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={{ width: "auto", fontSize: 13, height: 36 }}>
          <option value="">All Roles</option>
          {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        {canInvite && (
          <button className="btn-primary" onClick={() => setShowInvite(true)}>
            <Plus size={14} /> Invite Member
          </button>
        )}
      </div>

      {/* Role Summary Strip */}
      <div style={{ padding: "10px 24px", background: "#FAFBFF", borderBottom: "1px solid #F1F5F9", display: "flex", gap: 12, overflowX: "auto" }}>
        {roleCounts.map((r) => (
          <button
            key={r.key}
            onClick={() => setFilterRole(filterRole === r.key ? "" : r.key)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 20, border: `1px solid ${filterRole === r.key ? r.color : "#E2E8F0"}`, background: filterRole === r.key ? r.bg : "#fff", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: filterRole === r.key ? r.color : "#475569" }}>{r.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: r.color, background: filterRole === r.key ? "rgba(255,255,255,0.6)" : r.bg, borderRadius: 10, padding: "1px 6px" }}>{r.count}</span>
          </button>
        ))}
      </div>

      {/* Member Cards */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading team...</div>
        ) : members.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <Users size={40} style={{ color: "#E2E8F0", margin: "0 auto 12px", display: "block" }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "#94A3B8" }}>No members found</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {members.map((member) => {
              const isOnline = member.online_at && new Date(member.online_at) > new Date(Date.now() - 5 * 60 * 1000);
              const isMe = member.id === profile?.id;
              const canManage = canManageMember(myRole, member.role, isMe);
              const roleInfo = ROLES.find((r) => r.key === member.role);

              return (
                <div key={member.id} className="card" style={{ padding: 20 }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt={member.full_name} style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg, ${roleInfo?.color || "#1B76D3"}, #8B5CF6)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: "white" }}>
                          {member.full_name?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div style={{ position: "absolute", bottom: 1, right: 1, width: 11, height: 11, borderRadius: "50%", background: isOnline ? "#10B981" : "#CBD5E1", border: "2px solid white" }} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {member.full_name}
                        {isMe && <span style={{ fontSize: 10.5, color: "#1B76D3", marginLeft: 5, fontWeight: 600 }}>you</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.email}</div>
                      {member.phone && <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 1 }}>{member.phone}</div>}
                      <div style={{ marginTop: 7 }}>
                        <RoleBadge role={member.role} />
                      </div>
                    </div>

                    {canManage && (
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        <button
                          className="btn-ghost"
                          style={{ padding: "4px 6px" }}
                          onClick={() => setEditMember(member)}
                          title="Change role"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ padding: "4px 6px", color: "#EF4444" }}
                          onClick={() => setConfirmRemove(member)}
                          title="Remove member"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Role description */}
                  <div style={{ padding: "8px 10px", background: roleInfo ? roleInfo.bg : "#F8FAFC", borderRadius: 7, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: roleInfo?.color || "#64748B", fontWeight: 500 }}>
                      <Shield size={9} style={{ display: "inline", marginRight: 4 }} />
                      {roleInfo?.desc || "—"}
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #F1F5F9", paddingTop: 10 }}>
                    <div style={{ fontSize: 11, color: "#94A3B8", display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: isOnline ? "#10B981" : "#CBD5E1" }} />
                      {isOnline ? "Online now" : member.online_at ? `Last seen ${format(new Date(member.online_at), "MMM d")}` : "Never seen"}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: member.status === "active" ? "#10B981" : "#EF4444", background: member.status === "active" ? "#D1FAE5" : "#FEE2E2", padding: "2px 8px", borderRadius: 20 }}>
                        {member.status}
                      </span>
                      {canManage && (
                        <button
                          onClick={() => statusMutation.mutate({ id: member.id, active: member.status !== "active" })}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 2, borderRadius: 4 }}
                          title={member.status === "active" ? "Deactivate" : "Activate"}
                          onMouseEnter={(e) => e.currentTarget.style.color = member.status === "active" ? "#EF4444" : "#10B981"}
                          onMouseLeave={(e) => e.currentTarget.style.color = "#94A3B8"}
                        >
                          {member.status === "active" ? <UserX size={13} /> : <UserCheck size={13} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvite={(data) => inviteMutation.mutateAsync(data)}
          allowedRoles={assignableRoles}
        />
      )}
      {editMember && (
        <EditRoleModal
          member={editMember}
          onClose={() => setEditMember(null)}
          onSave={(id, role) => roleMutation.mutateAsync({ id, role })}
          allowedRoles={getAssignableRoles(myRole)}
        />
      )}

      {confirmRemove && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmRemove(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#EF4444" }}>Remove Member</h2>
              <button onClick={() => setConfirmRemove(null)} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 14, color: "#475569", margin: "0 0 8px" }}>
                Are you sure you want to remove <strong style={{ color: "#0F172A" }}>{confirmRemove.full_name}</strong>?
              </p>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>
                This will delete their profile from the CRM. They will no longer be able to log in.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
                <button className="btn-secondary" onClick={() => setConfirmRemove(null)}>Cancel</button>
                <button
                  className="btn-primary"
                  style={{ background: "#EF4444" }}
                  onClick={() => removeMutation.mutate(confirmRemove.id)}
                  disabled={removeMutation.isPending}
                >
                  {removeMutation.isPending ? "Removing..." : "Yes, Remove"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
