import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { Mail, ArrowLeft, Send, CheckCircle, XCircle, X } from "lucide-react";

// Ye bhi fix kar agar "../assets/" hai
import blueLogo from "../../assets/Logo-blue.png";

function Toast({ type, message, onClose }) {
  return (
    <div className={`toast toast-${type}`}>
      <span className="toast-icon">
        {type === "success" ? <CheckCircle size={16} /> : <XCircle size={16} />}
      </span>
      <span className="toast-msg">{message}</span>
      <button className="toast-close" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}

export default function ForgotPassword() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  const fullEmail = `${username.trim().toLowerCase()}@ccentrik.com`;
  const isValidEmail = username.trim().length > 0;

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleResetRequest = async (e) => {
    e.preventDefault();
    if (!isValidEmail) return;

    setLoading(true);
    try {
      await sendPasswordResetEmail(getAuth(), fullEmail);
      showToast("success", `Reset link sent to ${fullEmail}`);
    } catch {
      showToast("error", "No account found with this email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rr">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .rr {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          font-family: 'Inter', sans-serif;
        }
        .rr-card {
          width: 100%;
          max-width: 420px;
          background: #fff;
          padding: 42px 36px;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          box-shadow: 0 12px 30px rgba(0,0,0,0.05);
        }
        .rr-logo {
          display: flex;
          justify-content: center;
          margin-bottom: 22px;
          font-weight: bold;
          font-size: 24px;
          color: #2563eb;
        }
        .rr-logo img { height: 42px; }
        .rr-header { text-align: center; margin-bottom: 26px; }
        .rr-title { font-size: 20px; font-weight: 600; color: #0f172a; margin-bottom: 6px; }
        .rr-desc { font-size: 14px; color: #64748b; }
        .rr-label { font-size: 11px; font-weight: 500; color: #9ca3af; margin-bottom: 6px; display: block; text-transform: uppercase; }
        .rr-input-wrap { position: relative; margin-bottom: 16px; display: flex; align-items: stretch; }
        .rr-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #9ca3af; z-index: 1; }
        .rr-input { flex: 1; height: 44px; padding: 0 12px 0 38px; border-radius: 10px 0 0 10px; border: 1px solid #e5e7eb; border-right: none; font-size: 14px; outline: none; }
        .rr-input:focus { border-color: #111827; box-shadow: 0 0 0 3px rgba(17,24,39,0.08); }
        .rr-suffix { height: 44px; padding: 0 14px; display: flex; align-items: center; background: #f1f5f9; border: 1px solid #e5e7eb; border-radius: 0 10px 10px 0; font-size: 13px; font-weight: 600; color: #2563eb; white-space: nowrap; }
        .rr-btn { width: 100%; height: 44px; border-radius: 10px; background: #111827; color: #fff; border: none; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .rr-btn:hover { background: #1f2937; }
        .rr-btn:disabled { opacity: 0.5; }
        .rr-back { margin-top: 14px; background: none; border: none; color: #6b7280; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; width: 100%; justify-content: center; }
        .rr-back:hover { color: #111827; }
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 10px; font-size: 13px; z-index: 1000; }
        .toast-success { background: #111827; color: #fff; }
        .toast-error { background: #fff; color: #111827; border: 1px solid #e5e7eb; }
      `}</style>

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      <div className="rr-card">
        <div className="rr-logo">
          {/* ✅ FIXED: If blueLogo exists show img, else show Text */}
          {blueLogo ? <img src={blueLogo} alt="logo" /> : "CCENTRIK"}
        </div>

        <div className="rr-header">
          <h1 className="rr-title">Reset your password</h1>
          <p className="rr-desc">
            Enter your work email and we’ll send you a reset link.
          </p>
        </div>

        <form onSubmit={handleResetRequest}>
          <label className="rr-label">Work email</label>
          <div className="rr-input-wrap">
            <span className="rr-icon"><Mail size={16} /></span>
            <input
              type="text"
              className="rr-input"
              placeholder="your.name"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/@.*/g, ""))}
              required
            />
            <div className="rr-suffix">@ccentrik.com</div>
          </div>

          <button
            type="submit"
            className="rr-btn"
            disabled={!isValidEmail || loading}
          >
            {loading ? "Sending..." : "Send reset link"}
            {!loading && <Send size={15} />}
          </button>
        </form>

        <button className="rr-back" onClick={() => navigate("/login")}>
          <ArrowLeft size={14} />
          Back to login
        </button>
      </div>
    </div>
  );
}