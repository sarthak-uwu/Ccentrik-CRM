import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "../context/AuthContext";
import { teamService } from "../services/teamService";
import { supabase } from "../supabaseClient";
import { auth } from "../firebase";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import toast from "react-hot-toast";
import { User, Lock, Bell, Shield, Camera } from "lucide-react";

const TABS = [
  { key: "profile",       label: "Profile",       icon: User   },
  { key: "password",      label: "Password",      icon: Lock   },
  { key: "notifications", label: "Notifications", icon: Bell   },
  { key: "security",      label: "Security",      icon: Shield },
];

function ProfileTab({ profile, onUpdate }) {
  const { register, handleSubmit, formState: { isSubmitting, isDirty } } = useForm({
    defaultValues: {
      full_name:  profile?.full_name  || "",
      phone:      profile?.phone      || "",
      department: profile?.department || "",
      bio:        profile?.bio        || "",
    },
  });

  const [uploading, setUploading] = useState(false);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `avatars/${profile.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("crm-files").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("crm-files").getPublicUrl(path);
      await teamService.updateProfile(profile.id, { avatar_url: urlData.publicUrl });
      onUpdate();
      toast.success("Avatar updated");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data) => {
    try {
      await teamService.updateProfile(profile?.id, data);
      onUpdate();
      toast.success("Profile updated");
    } catch {
      toast.error("Update failed");
    }
  };

  const initials = profile?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U";

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28 }}>
        <div style={{ position: "relative" }}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={initials} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #2563EB, #4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "white" }}>
              {initials}
            </div>
          )}
          <label style={{ position: "absolute", bottom: 0, right: 0, background: "var(--accent)", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid var(--surface)" }}>
            <Camera size={12} style={{ color: "white" }} />
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarUpload} disabled={uploading} />
          </label>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{profile?.full_name}</div>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>{profile?.email}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, textTransform: "capitalize" }}>
            {profile?.role?.replace("_", " ")}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="crm-label">Full Name</label>
          <input className="crm-input" {...register("full_name")} placeholder="Your full name" />
        </div>
        <div>
          <label className="crm-label">Phone</label>
          <input className="crm-input" {...register("phone")} placeholder="+1 234 567 8900" />
        </div>
        <div>
          <label className="crm-label">Department</label>
          <input className="crm-input" {...register("department")} placeholder="Sales" />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="crm-label">Bio</label>
          <textarea className="crm-input" {...register("bio")} rows={3} placeholder="A short bio about yourself..." style={{ resize: "vertical" }} />
        </div>
        <div>
          <label className="crm-label">Email</label>
          <input className="crm-input" value={profile?.email || ""} disabled style={{ background: "var(--surface-2)", color: "var(--text-muted)" }} />
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Email cannot be changed here</span>
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <button type="submit" className="btn-primary" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function PasswordTab() {
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm();
  const newPw = watch("newPassword");

  const onSubmit = async ({ currentPassword, newPassword }) => {
    try {
      const user = auth.currentUser;
      if (!user?.email) throw new Error("Not authenticated");
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      reset();
      toast.success("Password changed successfully");
    } catch (err) {
      const msg = err.code === "auth/wrong-password" ? "Current password is incorrect" : err.message;
      toast.error(msg);
    }
  };

  const strength = (pw = "") => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };

  const s = strength(newPw || "");
  const strengthColor = ["var(--red)", "var(--amber)", "var(--amber)", "var(--green)", "var(--green)"][s];
  const strengthLabel = ["Too short", "Weak", "Fair", "Good", "Strong"][s];

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label className="crm-label">Current Password</label>
          <input className="crm-input" type="password" {...register("currentPassword", { required: "Required" })} />
          {errors.currentPassword && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.currentPassword.message}</span>}
        </div>
        <div>
          <label className="crm-label">New Password</label>
          <input className="crm-input" type="password" {...register("newPassword", { required: "Required", minLength: { value: 8, message: "Min 8 characters" } })} />
          {errors.newPassword && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.newPassword.message}</span>}
          {newPw && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < s ? strengthColor : "var(--border)", transition: "background 0.2s" }} />
                ))}
              </div>
              <span style={{ fontSize: 11.5, color: strengthColor, fontWeight: 600 }}>{strengthLabel}</span>
            </div>
          )}
        </div>
        <div>
          <label className="crm-label">Confirm New Password</label>
          <input
            className="crm-input"
            type="password"
            {...register("confirmPassword", {
              required: "Required",
              validate: (v) => v === newPw || "Passwords don't match",
            })}
          />
          {errors.confirmPassword && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.confirmPassword.message}</span>}
        </div>
        <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ width: "fit-content" }}>
          {isSubmitting ? "Changing..." : "Change Password"}
        </button>
      </div>
    </form>
  );
}

function NotificationsTab({ profile, onUpdate }) {
  const prefs = profile?.data?.notification_prefs || {};
  const [settings, setSettings] = useState({
    lead_assigned:    true,
    task_due:         true,
    deal_updated:     true,
    mention:          true,
    meeting_reminder: true,
    team_update:      false,
    ...prefs,
  });
  const [saving, setSaving] = useState(false);

  const toggle = (key) => setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = async () => {
    setSaving(true);
    try {
      await teamService.updateProfile(profile?.id, { notification_prefs: settings });
      toast.success("Preferences saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const items = [
    { key: "lead_assigned",    label: "Lead Assignments",  desc: "When a lead is assigned to you"     },
    { key: "task_due",         label: "Task Reminders",    desc: "When a task is due soon"            },
    { key: "deal_updated",     label: "Deal Updates",      desc: "When a deal you own is updated"    },
    { key: "mention",          label: "Mentions",          desc: "When someone mentions you in chat" },
    { key: "meeting_reminder", label: "Meeting Reminders", desc: "Before your meetings start"        },
    { key: "team_update",      label: "Team Updates",      desc: "General team announcements"        },
  ];

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 520 }}>
        {items.map((item) => (
          <div
            key={item.key}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{item.desc}</div>
            </div>
            <button
              onClick={() => toggle(item.key)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: settings[item.key] ? "var(--accent)" : "var(--border)",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: settings[item.key] ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "white",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={save} disabled={saving} style={{ marginTop: 20 }}>
        {saving ? "Saving..." : "Save Preferences"}
      </button>
    </div>
  );
}

function SecurityTab({ profile }) {
  const sessions = [
    { device: "Windows Chrome", location: "Current Session", time: "Active now", current: true },
  ];

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "var(--text)" }}>Active Sessions</h3>
        {sessions.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{s.device}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.location} · {s.time}</div>
            </div>
            {s.current && <span style={{ fontSize: 11, background: "var(--green-light)", color: "var(--green)", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>Current</span>}
          </div>
        ))}
      </div>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "var(--text)" }}>Account Info</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "Firebase UID",    value: profile?.firebase_uid?.slice(0, 16) + "..." },
            { label: "Account Status",  value: profile?.status },
            { label: "Role",            value: profile?.role?.replace("_", " ") },
          ].map((info) => (
            <div key={info.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, background: "var(--surface-2)" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{info.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", textTransform: "capitalize" }}>{info.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: "var(--text)" }}>Settings</h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>Manage your account preferences</p>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* Tab Nav */}
        <div style={{ width: 180, flexShrink: 0 }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 12px",
                borderRadius: 8,
                background: activeTab === tab.key ? "var(--accent-light)" : "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? "var(--accent)" : "var(--text-2)",
                fontFamily: "inherit",
                textAlign: "left",
                marginBottom: 2,
                transition: "all 0.15s",
              }}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="card" style={{ flex: 1, padding: 24, minWidth: 0 }}>
          {activeTab === "profile"       && <ProfileTab       profile={profile} onUpdate={refreshProfile} />}
          {activeTab === "password"      && <PasswordTab />}
          {activeTab === "notifications" && <NotificationsTab profile={profile} onUpdate={refreshProfile} />}
          {activeTab === "security"      && <SecurityTab      profile={profile} />}
        </div>
      </div>
    </div>
  );
}
