import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAuth, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { Lock, KeyRound, Eye, EyeOff, CheckCircle, XCircle, X } from "lucide-react";

// ✅ FIXED: Path correct kiya gaya hai (../../) aur fallback variable banaya hai
import blueLogo from "../../assets/Logo-blue.png";

function Toast({ type, message, onClose }) {
  return (
    <div className={`rp-toast rp-toast-${type}`}>
      <span className="rp-toast-icon">
        {type === "success" ? <CheckCircle size={16} /> : <XCircle size={16} />}
      </span>
      <span className="rp-toast-msg">{message}</span>
      <button className="rp-toast-close" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}

function StrengthBar({ password }) {
  const strength = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#ef4444", "#f59e0b", "#eab308", "#22c55e"];

  if (!password) return null;

  return (
    <div className="rp-strength">
      <div className="rp-strength-bars">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rp-strength-bar"
            style={{ background: i <= strength ? colors[strength] : "#e5e7eb" }}
          />
        ))}
      </div>
      <span className="rp-strength-label" style={{ color: colors[strength] }}>
        {labels[strength]}
      </span>
    </div>
  );
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [accountEmail, setAccountEmail] = useState("");
  const oobCode = searchParams.get("oobCode");

  const passwordsMatch = confirmPassword && password === confirmPassword;

  useEffect(() => {
    if (!oobCode) return;
    verifyPasswordResetCode(getAuth(), oobCode)
      .then((email) => setAccountEmail(email))
      .catch(() => setAccountEmail(""));
  }, [oobCode]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!passwordsMatch) return showToast("error", "Passwords do not match.");
    if (password.length < 8) return showToast("error", "Minimum 8 characters required.");

    setLoading(true);
    try {
      await confirmPasswordReset(getAuth(), oobCode, password);
      showToast("success", "Password updated!");
      setTimeout(() => navigate("/login"), 2000);
    } catch {
      showToast("error", "Link expired or invalid.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rp">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .rp {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          font-family: 'Inter', sans-serif;
        }

        .rp-card {
          width: 100%;
          max-width: 400px;
          background: #fff;
          padding: 36px;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          box-shadow: 0 10px 25px rgba(0,0,0,0.05);
          text-align: center;
        }

        .rp-logo {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
          font-weight: 800;
          font-size: 24px;
          color: #2563eb;
        }

        .rp-logo img { height: 40px; }

        .rp-divider {
          height: 1px;
          background: #e5e7eb;
          margin-bottom: 20px;
        }

        .rp-title {
          font-size: 22px;
          font-weight: 600;
          margin-bottom: 6px;
          color: #111827;
        }

        .rp-desc {
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 6px;
        }

        .rp-email {
          font-size: 13px;
          color: #111827;
          font-weight: 500;
          margin-bottom: 20px;
        }

        .rp-field { margin-bottom: 16px; text-align: left; }

        .rp-label {
          font-size: 11px;
          color: #9ca3af;
          margin-bottom: 6px;
          display: block;
          text-transform: uppercase;
        }

        .rp-input-wrap { position: relative; }

        .rp-input-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
        }

        .rp-input {
          width: 100%;
          height: 44px;
          padding: 0 40px;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          font-size: 14px;
        }

        .rp-input:focus {
          border-color: #111827;
          box-shadow: 0 0 0 3px rgba(17,24,39,0.08);
        }

        .rp-eye {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
        }

        .rp-strength {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
        }

        .rp-strength-bars { display: flex; gap: 4px; flex: 1; }

        .rp-strength-bar {
          height: 3px;
          flex: 1;
          border-radius: 2px;
        }

        .rp-strength-label { font-size: 11px; }

        .rp-btn {
          width: 100%;
          height: 44px;
          border-radius: 10px;
          background: #111827;
          color: #fff;
          border: none;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 6px;
        }

        .rp-btn:hover { background: #1f2937; }
        .rp-btn:disabled { opacity: 0.5; }

        .rp-toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          padding: 12px 14px;
          border-radius: 10px;
          display: flex;
          gap: 8px;
          font-size: 13px;
          z-index: 999;
        }

        .rp-toast-success { background: #111827; color: #fff; }
        .rp-toast-error { background: #fff; border: 1px solid #e5e7eb; }
      `}</style>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="rp-card">
        <div className="rp-logo">
          {/* ✅ FIXED: Check if logo exists, else show Text */}
          {blueLogo ? <img src={blueLogo} alt="Ccentrik Logo" /> : "CCENTRIK"}
        </div>

        <div className="rp-divider" />

        <p className="rp-title">Reset password</p>
        <p className="rp-desc">Choose a strong new password for your account.</p>

        {accountEmail && <div className="rp-email">{accountEmail}</div>}

        <form onSubmit={handleReset}>
          <div className="rp-field">
            <label className="rp-label">New password</label>
            <div className="rp-input-wrap">
              <span className="rp-input-icon"><Lock size={15} /></span>
              <input
                type={showPass ? "text" : "password"}
                className="rp-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="rp-eye" onClick={() => setShowPass(!showPass)}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <StrengthBar password={password} />
          </div>

          <div className="rp-field">
            <label className="rp-label">Confirm password</label>
            <div className="rp-input-wrap">
              <span className="rp-input-icon"><Lock size={15} /></span>
              <input
                type={showConfirm ? "text" : "password"}
                className="rp-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button type="button" className="rp-eye" onClick={() => setShowConfirm(!showConfirm)}>
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button type="submit" className="rp-btn" disabled={loading || !passwordsMatch}>
            {loading ? "Updating..." : "Update password"}
            {!loading && <KeyRound size={14} />}
          </button>
        </form>
      </div>
    </div>
  );
}
