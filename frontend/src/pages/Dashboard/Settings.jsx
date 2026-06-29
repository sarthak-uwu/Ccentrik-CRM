import { useState, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { 
  User, Lock, Bell, Users, Camera, Mail, 
  Trash2, UserPlus, ShieldCheck, Check, Send
} from "lucide-react";

const T = {
  bg: "#F9FAFB",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#111827",
  muted: "#6B7280",
  accent: "#2563EB", // Brand Blue
  red: "#EF4444",
  green: "#10B981"
};

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState("team"); // Team tab focused as per requirement
  const [profileImg, setProfileImg] = useState(user?.photoURL || null);
  const fileInputRef = useRef(null);

  // Team State
  const [team, setTeam] = useState([
    { id: 1, name: "Sarthak Tyagi", email: "sarthak@ccentrik.com", role: "Super Admin", status: "Active" },
  ]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteData, setInviteData] = useState({ name: "", email: "", role: "Employee" });

  const handleInvite = () => {
    if(!inviteData.email) return alert("Please enter email");
    // Mocking the email registration message
    console.log(`Sending registration email to ${inviteData.email}: "You have been registered on Ccentrik CRM app"`);
    
    setTeam([...team, { ...inviteData, id: Date.now(), status: "Invited" }]);
    setShowInvite(false);
    alert(`Invitation sent to ${inviteData.email}`);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) setProfileImg(URL.createObjectURL(file));
  };

  return (
    <div style={s.pageWrapper}>
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: T.text }}>Settings</h1>
        <p style={{ color: T.muted }}>Manage your workspace, team and security</p>
      </header>

      {/* TABS BAR */}
      <div style={s.tabContainer}>
        {[
          { id: "profile", label: "Profile", icon: User },
          { id: "password", label: "Password", icon: Lock },
          { id: "notifications", label: "Notifications", icon: Bell },
          { id: "team", label: "Team Management", icon: Users },
        ].map(t => (
          <button 
            key={t.id} 
            onClick={() => setTab(t.id)}
            style={{ ...s.tabBtn, color: tab === t.id ? T.accent : T.muted, borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent' }}
          >
            <t.icon size={18} /> {t.label}
          </button>
        ))}
      </div>

      <div style={s.contentArea}>
        {/* --- PROFILE TAB --- */}
        {tab === "profile" && (
          <div style={s.card}>
            <h3 style={s.cardTitle}>Public Profile</h3>
            <div style={s.avatarSection}>
              <div style={s.avatarWrapper}>
                {profileImg ? <img src={profileImg} style={s.avatarImg} alt="Profile" /> : <User size={40} color={T.muted} />}
                <button style={s.cameraBtn} onClick={() => fileInputRef.current.click()}><Camera size={14} /></button>
                <input type="file" ref={fileInputRef} hidden onChange={handleImageChange} accept="image/*" />
              </div>
              <div>
                <p style={{ fontWeight: '600', marginBottom: '4px' }}>Profile Picture</p>
                <p style={{ fontSize: '13px', color: T.muted }}>JPG, GIF or PNG. Max size of 2MB</p>
              </div>
            </div>
            <div style={s.inputGrid}>
              <div style={s.inputGroup}><label style={s.label}>Full Name</label><input style={s.input} defaultValue={user?.displayName} /></div>
              <div style={s.inputGroup}><label style={s.label}>Email ID</label><input style={s.input} value={user?.email} disabled /></div>
            </div>
            <button style={s.primaryBtn}>Save Changes</button>
          </div>
        )}

        {/* --- PASSWORD & NOTIFICATIONS (Placeholder) --- */}
        {(tab === "password" || tab === "notifications") && (
          <div style={{ ...s.card, textAlign: 'center', padding: '60px' }}>
            <div style={{ background: '#F3F4F6', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              {tab === "password" ? <Lock color={T.muted} /> : <Bell color={T.muted} />}
            </div>
            <h3 style={{ fontWeight: '700' }}>{tab.charAt(0).toUpperCase() + tab.slice(1)} Settings</h3>
            <p style={{ color: T.muted }}>This section is currently under maintenance.</p>
          </div>
        )}

        {/* --- TEAM TAB --- */}
        {tab === "team" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Team Members</h3>
                <p style={{ fontSize: '13px', color: T.muted }}>Manage roles and permissions</p>
              </div>
              <button style={s.primaryBtn} onClick={() => setShowInvite(true)}><UserPlus size={18} /> Invite Member</button>
            </div>

            {showInvite && (
              <div style={s.inviteBox}>
                <h4 style={{ marginBottom: '16px', fontWeight: '700' }}>Invite New Member</h4>
                <div style={s.inviteGrid}>
                  <input placeholder="Full Name" style={s.input} onChange={e => setInviteData({...inviteData, name: e.target.value})} />
                  <input placeholder="Email Address" style={s.input} onChange={e => setInviteData({...inviteData, email: e.target.value})} />
                  <select style={s.input} onChange={e => setInviteData({...inviteData, role: e.target.value})}>
                    <option>Employee</option>
                    <option>Sales Manager</option>
                    <option>Sales Head</option>
                    <option value="owner">Super Admin</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                  <button style={s.primaryBtn} onClick={handleInvite}>Send Invitation</button>
                  <button style={s.ghostBtn} onClick={() => setShowInvite(false)}>Cancel</button>
                </div>
              </div>
            )}

            <div style={s.tableCard}>
              <table style={s.table}>
                <thead style={s.thead}>
                  <tr>
                    <th style={s.th}>Member</th>
                    <th style={s.th}>Role</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map(m => (
                    <tr key={m.id} style={s.tr}>
                      <td style={s.td}>
                        <div style={{ fontWeight: '600' }}>{m.name}</div>
                        <div style={{ fontSize: '12px', color: T.muted }}>{m.email}</div>
                      </td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: '#EFF6FF', color: T.accent }}>{m.role}</span>
                      </td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.status === 'Active' ? T.green : '#9CA3AF' }} />
                          {m.status}
                        </div>
                      </td>
                      <td style={s.td}>
                        <button style={s.iconBtn}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  pageWrapper: { padding: '40px', background: T.bg, minHeight: '100vh', fontFamily: "'Inter', sans-serif" },
  tabContainer: { display: 'flex', gap: '24px', borderBottom: `1px solid ${T.border}`, marginBottom: '32px' },
  tabBtn: { background: 'none', border: 'none', padding: '12px 4px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s' },
  contentArea: { maxWidth: '900px' },
  card: { background: T.surface, padding: '24px', borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  cardTitle: { fontSize: '16px', fontWeight: '700', marginBottom: '20px' },
  avatarSection: { display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px' },
  avatarWrapper: { position: 'relative', width: '80px', height: '80px', borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.border}` },
  avatarImg: { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' },
  cameraBtn: { position: 'absolute', bottom: '0', right: '0', background: T.accent, color: '#fff', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  inputGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: '600', color: T.text },
  input: { padding: '10px 14px', borderRadius: '8px', border: `1px solid ${T.border}`, fontSize: '14px', outline: 'none', transition: 'border 0.2s' },
  primaryBtn: { background: T.accent, color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
  ghostBtn: { background: '#F3F4F6', color: T.text, border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' },
  inviteBox: { background: '#fff', padding: '20px', borderRadius: '12px', border: `2px dashed ${T.accent}40`, marginBottom: '24px' },
  inviteGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
  tableCard: { background: T.surface, borderRadius: '12px', border: `1px solid ${T.border}`, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  thead: { background: '#F9FAFB', borderBottom: `1px solid ${T.border}` },
  th: { padding: '14px 20px', fontSize: '12px', fontWeight: '600', color: T.muted, textTransform: 'uppercase' },
  tr: { borderBottom: `1px solid ${T.border}` },
  td: { padding: '16px 20px', fontSize: '14px' },
  badge: { padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' },
  iconBtn: { background: 'none', border: 'none', color: T.muted, cursor: 'pointer', padding: '4px' }
};