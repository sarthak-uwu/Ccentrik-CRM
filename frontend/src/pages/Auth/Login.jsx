import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAuth,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import blueLogo from "../../assets/Logo-blue.png";
import whiteLogo from "../../assets/logo-white.png";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const auth = getAuth();

  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    const trimmed = username.trim();
    if (!trimmed) { setError("Please enter your username."); return; }
    const fullEmail = `${trimmed}@ccentrik.com`;
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, fullEmail, password);
      navigate("/dashboard", { replace: true });
    } catch {
      setError("Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user.email?.toLowerCase().endsWith("@ccentrik.com")) {
        navigate("/dashboard", { replace: true });
      } else {
        await auth.signOut();
        setError("Only @ccentrik.com accounts are allowed.");
      }
    } catch {
      setError("Google sign-in failed. Please try again.");
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }

        .lp-root {
          display: flex;
          height: 100vh;
          width: 100%;
          overflow: hidden;
        }

        .lp-left {
          flex: 1.1;
          background: #000000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 48px;
          gap: 0;
          text-align: center;
        }

        .lp-left-logo {
          width: 240px;
          max-width: 70%;
          height: auto;
          object-fit: contain;
          margin-bottom: 40px;
        }

        .lp-left-headline {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 40px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.15;
          letter-spacing: -0.03em;
          margin-bottom: 6px;
        }

        .lp-left-headline-blue {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 40px;
          font-weight: 800;
          color: #1B76D3;
          line-height: 1.15;
          letter-spacing: -0.03em;
          margin-bottom: 24px;
        }

        .lp-left-tagline {
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          color: rgba(255,255,255,0.45);
          line-height: 1.65;
          max-width: 340px;
        }

        .lp-email-row {
          display: flex;
          align-items: center;
          border: 1.5px solid #D1D5DB;
          border-radius: 9px;
          background: #fff;
          overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .lp-email-row:focus-within {
          border-color: #1B76D3;
          box-shadow: 0 0 0 3px rgba(27,118,211,0.1);
        }
        .lp-email-input {
          flex: 1;
          padding: 12px 0 12px 14px;
          border: none;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: #0F172A;
          background: transparent;
          outline: none;
          min-width: 0;
        }
        .lp-email-input::placeholder { color: #A0AEC0; }
        .lp-email-suffix {
          padding: 12px 14px 12px 4px;
          font-size: 13.5px;
          color: #94A3B8;
          font-weight: 500;
          white-space: nowrap;
          pointer-events: none;
          user-select: none;
        }

        .lp-right {
          flex: 1;
          background: #F5F7FA;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
        }

        .lp-card {
          width: 100%;
          max-width: 420px;
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #E8ECF2;
          box-shadow: 0 4px 40px rgba(0,0,0,0.07);
          padding: 40px 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .lp-card-logo {
          height: 44px;
          width: auto;
          margin-bottom: 24px;
        }

        .lp-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 24px;
          font-weight: 700;
          color: #0D1B2E;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
          text-align: center;
        }

        .lp-subtitle {
          font-size: 13.5px;
          color: #64748B;
          margin-bottom: 28px;
          text-align: center;
        }

        .lp-form { width: 100%; }

        .lp-error {
          background: #FEF2F2;
          color: #B91C1C;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 18px;
          border: 1px solid #FECACA;
          text-align: center;
          width: 100%;
        }

        .lp-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: #374151;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .lp-field { margin-bottom: 18px; }

        .lp-input {
          width: 100%;
          padding: 12px 14px;
          border: 1.5px solid #D1D5DB;
          border-radius: 9px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: #0F172A;
          background: #fff;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .lp-input:focus {
          border-color: #1B76D3;
          box-shadow: 0 0 0 3px rgba(27,118,211,0.1);
        }
        .lp-input::placeholder { color: #A0AEC0; }

        .lp-pass-wrap { position: relative; }
        .lp-pass-wrap .lp-input { padding-right: 44px; }

        .lp-eye {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #9CA3AF;
          display: flex;
          padding: 4px;
        }

        .lp-forgot-row {
          display: flex;
          justify-content: flex-end;
          margin-top: 6px;
        }
        .lp-forgot {
          font-size: 12.5px;
          color: #1B76D3;
          font-weight: 600;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
          font-family: 'Inter', sans-serif;
        }

        .lp-submit {
          width: 100%;
          padding: 13px;
          background: #0D1B2E;
          color: #fff;
          border: none;
          border-radius: 9px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14.5px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          margin-top: 16px;
          transition: background 0.2s, transform 0.1s;
        }
        .lp-submit:hover:not(:disabled) { background: #1a2f4a; transform: translateY(-1px); }
        .lp-submit:disabled { opacity: 0.55; cursor: not-allowed; }

        .lp-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 22px 0;
          width: 100%;
        }
        .lp-divider-line { flex: 1; height: 1px; background: #E5E7EB; }
        .lp-divider-text { font-size: 12px; color: #9CA3AF; font-weight: 500; }

        .lp-google {
          width: 100%;
          padding: 11px;
          border: 1.5px solid #D1D5DB;
          border-radius: 9px;
          background: #fff;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14px;
          color: #374151;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: background 0.15s, border-color 0.15s;
        }
        .lp-google:hover { background: #F9FAFB; border-color: #C7D0DC; }

        .lp-footer {
          text-align: center;
          margin-top: 24px;
          font-size: 12px;
          color: #94A3B8;
        }
        .lp-footer span { color: #1B76D3; font-weight: 500; }

        @media(max-width: 860px) {
          .lp-root { flex-direction: column; height: auto; min-height: 100vh; overflow-y: auto; }
          .lp-left { flex: none; min-height: 260px; padding: 40px 24px; }
          .lp-left-logo { width: 160px; margin-bottom: 28px; }
          .lp-left-headline, .lp-left-headline-blue { font-size: 28px; }
          .lp-right { padding: 24px 16px; }
          .lp-card { padding: 32px 24px; }
        }
      `}</style>

      <div className="lp-root">
        {/* Left — black panel */}
        <div className="lp-left">
          <img src={whiteLogo} alt="Ccentrik" className="lp-left-logo" />
          <div className="lp-left-headline">Internal CRM for</div>
          <div className="lp-left-headline-blue">Smarter Sales.</div>
          <p className="lp-left-tagline">Manage leads, deals, and customer relationships with precision.</p>
        </div>

        {/* Right — form panel */}
        <div className="lp-right">
          <div className="lp-card">
            <img src={blueLogo} alt="Ccentrik" className="lp-card-logo" />
            <div className="lp-title">Welcome back</div>
            <div className="lp-subtitle">Log in to Ccentrik CRM Workspace</div>

            {error && <div className="lp-error">{error}</div>}

            <form onSubmit={handleLogin} className="lp-form">
              <div className="lp-field">
                <label className="lp-label">Username</label>
                <div className="lp-email-row">
                  <input
                    className="lp-email-input"
                    type="text"
                    placeholder="yourname"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoFocus
                    autoComplete="username"
                  />
                  <span className="lp-email-suffix">@ccentrik.com</span>
                </div>
              </div>

              <div className="lp-field">
                <label className="lp-label">Password</label>
                <div className="lp-pass-wrap">
                  <input
                    className="lp-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button type="button" className="lp-eye" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="lp-forgot-row">
                  <button type="button" className="lp-forgot" onClick={() => navigate("/forgot-password")}>
                    Forgot password?
                  </button>
                </div>
              </div>

              <button className="lp-submit" type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
                {!loading && <ArrowRight size={16} />}
              </button>
            </form>

            <div className="lp-divider">
              <div className="lp-divider-line" />
              <span className="lp-divider-text">or</span>
              <div className="lp-divider-line" />
            </div>

            <button className="lp-google" onClick={handleGoogleLogin} type="button">
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <g fill="none" fillRule="evenodd">
                  <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </g>
              </svg>
              Sign in with Google
            </button>

            <div className="lp-footer">
              For internal use by the <span>Ccentrik</span> team.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
