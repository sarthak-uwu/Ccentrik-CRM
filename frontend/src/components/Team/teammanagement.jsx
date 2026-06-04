import React, { useState, useMemo } from "react";

const ROLES = ["Admin", "Manager", "Sales Rep", "Support"];

export default function TeamManagement() {
  const [members, setMembers] = useState([
    { id: 1, name: "Admin User", email: "admin@ccentrik.com", role: "Admin", status: "Active", joined: "01 May 2024" }
  ]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "Sales Rep" });
  const [error, setError] = useState("");

  // Filter Logic
  const filteredMembers = useMemo(() => {
    return members.filter(m => 
      m.name.toLowerCase().includes(search.toLowerCase()) || 
      m.email.toLowerCase().includes(search.toLowerCase())
    );
  }, [members, search]);

  const handleAddMember = (e) => {
    e.preventDefault();
    setError("");

    // Email Fix: Only @ccentrik.com allowed
    if (!form.email.endsWith("@ccentrik.com")) {
      setError("Sirf @ccentrik.com ke employees hi add ho sakte hain.");
      return;
    }

    setIsSending(true);

    // Simulating Mail Sending
    setTimeout(() => {
      const newMember = {
        id: Date.now(),
        ...form,
        status: "Invited",
        joined: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      };
      setMembers([...members, newMember]);
      setIsSending(false);
      setShowModal(false);
      setForm({ name: "", email: "", role: "Sales Rep" });
      alert(`Invitation mail sent to ${form.email}`);
    }, 1500);
  };

  return (
    <div style={{ padding: "40px", backgroundColor: "#f4f7fe", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .card { background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .btn-primary { background: #4318FF; color: white; transition: all 0.3s; }
        .btn-primary:hover { background: #3311CC; transform: translateY(-2px); }
        .input-field { border: 1px solid #cbd5e0; padding: 12px; borderRadius: 10px; width: 100%; outline: none; transition: 0.2s; }
        .input-field:focus { border-color: #4318FF; box-shadow: 0 0 0 3px rgba(67, 24, 255, 0.1); }
        .badge { padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; }
      `}</style>

      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#1B2559", margin: 0 }}>Team Workspace</h1>
          <p style={{ color: "#A3AED0", marginTop: "4px", fontSize: "14px" }}>Invite and manage your @ccentrik.com team members</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)} style={{ padding: "12px 24px", borderRadius: "12px", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "14px" }}>
          + Invite Employee
        </button>
      </div>

      {/* Search & List */}
      <div className="card" style={{ padding: "24px" }}>
        <div style={{ marginBottom: "20px" }}>
          <input 
            type="text" 
            placeholder="🔍 Search by name or email..." 
            className="input-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#A3AED0", fontSize: "13px" }}>
              <th style={{ padding: "12px" }}>EMPLOYEE</th>
              <th style={{ padding: "12px" }}>ROLE</th>
              <th style={{ padding: "12px" }}>STATUS</th>
              <th style={{ padding: "12px" }}>JOINED</th>
              <th style={{ padding: "12px", textAlign: "right" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map(member => (
              <tr key={member.id} style={{ background: "#fff", transition: "0.2s" }}>
                <td style={{ padding: "16px", borderTop: "1px solid #f1f4f9" }}>
                  <div style={{ fontWeight: "600", color: "#1B2559" }}>{member.name}</div>
                  <div style={{ fontSize: "12px", color: "#A3AED0" }}>{member.email}</div>
                </td>
                <td style={{ padding: "16px", borderTop: "1px solid #f1f4f9" }}>
                  <span style={{ color: "#1B2559", fontSize: "14px", fontWeight: "500" }}>{member.role}</span>
                </td>
                <td style={{ padding: "16px", borderTop: "1px solid #f1f4f9" }}>
                  <span className="badge" style={{ 
                    backgroundColor: member.status === "Active" ? "#E2F9EF" : "#FFF4E5", 
                    color: member.status === "Active" ? "#00B660" : "#FF9900" 
                  }}>
                    {member.status}
                  </span>
                </td>
                <td style={{ padding: "16px", borderTop: "1px solid #f1f4f9", color: "#718096", fontSize: "14px" }}>{member.joined}</td>
                <td style={{ padding: "16px", borderTop: "1px solid #f1f4f9", textAlign: "right" }}>
                  <button style={{ background: "none", border: "none", color: "#E31A1A", cursor: "pointer", fontWeight: "600", fontSize: "13px" }} onClick={() => setMembers(members.filter(m => m.id !== member.id))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredMembers.length === 0 && <div style={{ textAlign: "center", padding: "40px", color: "#A3AED0" }}>No matching employees found.</div>}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="card" style={{ padding: "32px", width: "440px", position: "relative" }}>
            <h2 style={{ marginBottom: "8px", color: "#1B2559" }}>Invite Team Member</h2>
            <p style={{ color: "#A3AED0", fontSize: "14px", marginBottom: "24px" }}>Send an automatic setup link to their work email.</p>
            
            <form onSubmit={handleAddMember}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#1B2559", marginBottom: "8px" }}>NAME</label>
                <input required placeholder="Full Name" className="input-field" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#1B2559", marginBottom: "8px" }}>WORK EMAIL</label>
                <input required type="email" placeholder="username@ccentrik.com" className="input-field" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} />
                {error && <p style={{ color: "#E31A1A", fontSize: "12px", marginTop: "6px" }}>{error}</p>}
              </div>
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#1B2559", marginBottom: "8px" }}>ASSIGN ROLE</label>
                <select className="input-field" value={form.role} onChange={(e) => setForm({...form, role: e.target.value})}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid #E0E5F2", background: "white", cursor: "pointer", fontWeight: "600" }}>Cancel</button>
                <button type="submit" disabled={isSending} className="btn-primary" style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer", fontWeight: "600" }}>
                  {isSending ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}