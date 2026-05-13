import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { meetingsService } from "../services/meetingsService";
import { teamService } from "../services/teamService";
import toast from "react-hot-toast";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { Plus, X, Edit2, Trash2, Calendar, Clock, Link, MapPin, Video, CheckCircle, AlertCircle } from "lucide-react";

const STATUS_COLORS = {
  scheduled: { color: "#3B82F6", bg: "#DBEAFE" },
  completed: { color: "#10B981", bg: "#D1FAE5" },
  cancelled: { color: "#EF4444", bg: "#FEE2E2" },
  rescheduled: { color: "#F59E0B", bg: "#FEF3C7" },
};

function MeetingFormModal({ meeting, onClose, onSave, teamMembers }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: meeting
      ? { ...meeting, start_time: meeting.start_time?.slice(0, 16), end_time: meeting.end_time?.slice(0, 16) }
      : { status: "scheduled" },
  });
  const [attendees, setAttendees] = useState(meeting?.attendees?.map((a) => a.user?.id).filter(Boolean) || []);

  const toggleAttendee = (uid) => {
    setAttendees((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);
  };

  const handleFormSubmit = async (data) => {
    await onSave({ ...data, start_time: data.start_time ? new Date(data.start_time).toISOString() : null, end_time: data.end_time ? new Date(data.end_time).toISOString() : null }, attendees);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 580 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{meeting ? "Edit Meeting" : "Schedule Meeting"}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(handleFormSubmit)} style={{ padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Meeting Title *</label>
              <input className="crm-input" {...register("title", { required: "Required" })} placeholder="Q2 Sales Review" />
              {errors.title && <span style={{ color: "#EF4444", fontSize: 11.5 }}>{errors.title.message}</span>}
            </div>
            <div>
              <label className="crm-label">Start Time *</label>
              <input className="crm-input" type="datetime-local" {...register("start_time", { required: "Required" })} />
            </div>
            <div>
              <label className="crm-label">End Time</label>
              <input className="crm-input" type="datetime-local" {...register("end_time")} />
            </div>
            <div>
              <label className="crm-label">Location</label>
              <input className="crm-input" {...register("location")} placeholder="Conference Room A" />
            </div>
            <div>
              <label className="crm-label">Meeting Link</label>
              <input className="crm-input" {...register("meeting_link")} placeholder="https://meet.google.com/..." />
            </div>
            <div>
              <label className="crm-label">Status</label>
              <select className="crm-input" {...register("status")}>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="rescheduled">Rescheduled</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Description</label>
              <textarea className="crm-input" {...register("description")} rows={2} placeholder="Meeting agenda..." style={{ resize: "vertical" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Notes</label>
              <textarea className="crm-input" {...register("notes")} rows={2} placeholder="Notes, action items..." style={{ resize: "vertical" }} />
            </div>
            {teamMembers?.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="crm-label">Attendees</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  {teamMembers.map((m) => (
                    <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "5px 10px", borderRadius: 20, border: `1px solid ${attendees.includes(m.id) ? "#1B76D3" : "#E2E8F0"}`, background: attendees.includes(m.id) ? "#EBF4FF" : "transparent", fontSize: 12.5, color: attendees.includes(m.id) ? "#1B76D3" : "#475569", transition: "all 0.15s" }}>
                      <input type="checkbox" style={{ display: "none" }} checked={attendees.includes(m.id)} onChange={() => toggleAttendee(m.id)} />
                      {m.full_name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : meeting ? "Save Changes" : "Schedule"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MeetingCard({ meeting, onEdit, onDelete }) {
  const ss = STATUS_COLORS[meeting.status] || STATUS_COLORS.scheduled;
  const overdue = meeting.status === "scheduled" && isPast(new Date(meeting.start_time));
  const start = new Date(meeting.start_time);

  return (
    <div
      className="card"
      style={{ padding: 16, display: "flex", gap: 14, cursor: "pointer", transition: "box-shadow 0.15s" }}
    >
      <div style={{ width: 48, flexShrink: 0, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase" }}>
          {format(start, "MMM")}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", lineHeight: 1 }}>{format(start, "d")}</div>
        <div style={{ fontSize: 10, color: "#94A3B8" }}>{format(start, "EEE")}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{meeting.title}</div>
          <span style={{ background: ss.bg, color: ss.color, fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
            {meeting.status}
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 3 }}>
            <Clock size={11} /> {format(start, "h:mm a")}
            {meeting.end_time && ` – ${format(new Date(meeting.end_time), "h:mm a")}`}
          </span>
          {meeting.location && (
            <span style={{ fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 3 }}>
              <MapPin size={11} /> {meeting.location}
            </span>
          )}
          {meeting.meeting_link && (
            <a href={meeting.meeting_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 12, color: "#1B76D3", display: "flex", alignItems: "center", gap: 3 }}>
              <Video size={11} /> Join
            </a>
          )}
        </div>
        {meeting.description && (
          <div style={{ fontSize: 12, color: "#94A3B8" }} className="truncate-2">{meeting.description}</div>
        )}
        {meeting.attendees?.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {meeting.attendees.slice(0, 4).map((a, i) => (
              <div key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: "#EBF4FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#1B76D3", border: "2px solid white" }}>
                {a.user?.full_name?.[0]}
              </div>
            ))}
            {meeting.attendees.length > 4 && <span style={{ fontSize: 11, color: "#94A3B8" }}>+{meeting.attendees.length - 4}</span>}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        <motion.button className="btn-ghost" style={{ padding: "4px 8px" }} onClick={(e) => { e.stopPropagation(); onEdit(meeting); }} whileHover={{ scale: 1.15, color: "#3B82F6" }} whileTap={{ scale: 0.85 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}><Edit2 size={13} /></motion.button>
        <motion.button className="btn-ghost" style={{ padding: "4px 8px", color: "#EF4444" }} onClick={(e) => { e.stopPropagation(); onDelete(meeting.id); }} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}><Trash2 size={13} /></motion.button>
      </div>
    </div>
  );
}

export default function Meetings() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editMeeting, setEditMeeting] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");

  const { data: meetingsData, isLoading } = useQuery({
    queryKey: ["meetings", filterStatus],
    queryFn: () => meetingsService.getAll({ status: filterStatus }),
  });
  const { data: teamData } = useQuery({ queryKey: ["team-all"], queryFn: () => teamService.getAll() });

  const createMutation = useMutation({
    mutationFn: ({ data, attendees }) => meetingsService.create({ ...data, created_by: profile?.id }, attendees),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); toast.success("Meeting scheduled"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => meetingsService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); toast.success("Updated"); setEditMeeting(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: meetingsService.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); toast.success("Meeting deleted"); },
  });

  const handleSave = async (data, attendees) => {
    if (editMeeting) await updateMutation.mutateAsync({ id: editMeeting.id, data });
    else await createMutation.mutateAsync({ data, attendees });
  };

  const meetings = meetingsData?.data || [];
  const upcoming = meetings.filter((m) => m.status === "scheduled" && !isPast(new Date(m.start_time)));
  const past = meetings.filter((m) => m.status === "completed" || (m.status === "scheduled" && isPast(new Date(m.start_time))));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 12, background: "#fff", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 16 }}>
          {[{ label: "Upcoming", value: upcoming.length, color: "#3B82F6" }, { label: "Completed", value: meetings.filter((m) => m.status === "completed").length, color: "#10B981" }].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
              <span style={{ fontSize: 12.5, color: "#64748B" }}>{s.label}:</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{s.value}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <select className="crm-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: "auto", fontSize: 13, height: 36 }}>
          <option value="">All Meetings</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Schedule Meeting</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div>
        ) : meetings.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>
            <Calendar size={36} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>No meetings scheduled</div>
            <button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginTop: 16 }}><Plus size={14} /> Schedule Meeting</button>
          </div>
        ) : (
          <div>
            {upcoming.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: "#64748B", letterSpacing: "0.05em", marginBottom: 12, textTransform: "uppercase" }}>Upcoming ({upcoming.length})</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {upcoming.map((m) => (
                    <MeetingCard key={m.id} meeting={m} onEdit={setEditMeeting} onDelete={(id) => { if (confirm("Delete meeting?")) deleteMutation.mutate(id); }} />
                  ))}
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.05em", marginBottom: 12, textTransform: "uppercase" }}>Past Meetings ({past.length})</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {past.map((m) => (
                    <MeetingCard key={m.id} meeting={m} onEdit={setEditMeeting} onDelete={(id) => { if (confirm("Delete meeting?")) deleteMutation.mutate(id); }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {(showForm || editMeeting) && (
        <MeetingFormModal meeting={editMeeting} onClose={() => { setShowForm(false); setEditMeeting(null); }} onSave={handleSave} teamMembers={teamData?.data || []} />
      )}
    </div>
  );
}
