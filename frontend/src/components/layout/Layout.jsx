import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import WelcomePopup from "../WelcomePopup";
import CommandPalette from "../CommandPalette";
import SystemPulse from "../SystemPulse";

export default function Layout({ children }) {
  const [collapsed, setCollapsed]       = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [cmdOpen, setCmdOpen]           = useState(false);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 40,
          }}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <Header onMobileMenu={() => setMobileOpen(true)} onCommandPalette={() => setCmdOpen(true)} />
        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "var(--bg)", paddingBottom: 28 }}>
          {children}
        </main>
      </div>

      <WelcomePopup />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <SystemPulse />

      {/* Enterprise footer */}
      <div className="enterprise-footer" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30 }}>
        <div className="footer-dot live" />
        <span>API</span>
        <div className="footer-dot live" style={{ marginLeft: 12 }} />
        <span>Sync</span>
        <span style={{ marginLeft: "auto", opacity: 0.5 }}>Ccentrik CRM · v2.0</span>
      </div>
    </div>
  );
}
