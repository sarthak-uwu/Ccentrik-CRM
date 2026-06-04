import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { auth, googleProvider } from "../firebase";
import { supabase } from "../supabaseClient";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import toast from "react-hot-toast";

const INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes

const AuthContext = createContext(null);

// Parse userAgent into detailed browser/OS/device fields
function parseUA() {
  const ua = navigator.userAgent;

  // Browser name + major version
  let browser = "Other", browser_version = null;
  if (/Edg\/[\d]/.test(ua)) {
    browser = "Edge";
    browser_version = (ua.match(/Edg\/([\d]+)/) || [])[1] || null;
  } else if (/OPR\/[\d]/.test(ua)) {
    browser = "Opera";
    browser_version = (ua.match(/OPR\/([\d]+)/) || [])[1] || null;
  } else if (/Firefox\/[\d]/.test(ua)) {
    browser = "Firefox";
    browser_version = (ua.match(/Firefox\/([\d]+)/) || [])[1] || null;
  } else if (/Chrome\/[\d]/.test(ua)) {
    browser = "Chrome";
    browser_version = (ua.match(/Chrome\/([\d]+)/) || [])[1] || null;
  } else if (/Version\/[\d]/.test(ua) && /Safari/.test(ua)) {
    browser = "Safari";
    browser_version = (ua.match(/Version\/([\d]+)/) || [])[1] || null;
  }

  // OS with version
  const os =
    /Windows NT 10\.0/.test(ua) ? "Windows 10/11" :
    /Windows NT 6\.3/.test(ua)  ? "Windows 8.1"   :
    /Windows NT 6\.1/.test(ua)  ? "Windows 7"     :
    /Windows/.test(ua)          ? "Windows"        :
    /Android ([\d.]+)/.test(ua) ? `Android ${(ua.match(/Android ([\d.]+)/) || [])[1] || ""}`.trim() :
    /iPhone/.test(ua)           ? `iOS ${((ua.match(/OS ([\d_]+)/) || [])[1] || "").replace(/_/g, ".")}`.trim() :
    /iPad/.test(ua)             ? `iPadOS ${((ua.match(/OS ([\d_]+)/) || [])[1] || "").replace(/_/g, ".")}`.trim() :
    /Mac OS X ([\d_.]+)/.test(ua) ? `macOS ${((ua.match(/Mac OS X ([\d_.]+)/) || [])[1] || "").replace(/_/g, ".")}`.trim() :
    /Linux/.test(ua)            ? "Linux" : "Other";

  // Device type
  const device_type = /Mobile|iPhone/.test(ua) && !/iPad/.test(ua) ? "Mobile"
    : /iPad|Tablet/.test(ua) ? "Tablet"
    : "Desktop";

  // Device model (best-effort from UA)
  let device_model = null;
  if (/iPhone/.test(ua))      device_model = "iPhone";
  else if (/iPad/.test(ua))   device_model = "iPad";
  else if (/Android/.test(ua)) {
    const m = ua.match(/\(Linux;[^;]*;?\s*([^)]+)\)/);
    if (m) device_model = m[1].trim().split(";")[0].trim().slice(0, 60) || null;
  }

  return { browser, browser_version, os, device_type, device_model, user_agent: ua.slice(0, 400) };
}

// Detect network type via navigator.connection API (supported in Chrome/Android)
function getNetworkType() {
  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return null;
    const t = conn.effectiveType || conn.type;
    const map = { "4g": "4G / LTE", "3g": "3G", "2g": "2G", "slow-2g": "Slow 2G", wifi: "WiFi", ethernet: "Ethernet", cellular: "Cellular" };
    return map[t] || t || null;
  } catch { return null; }
}

// Persistent device fingerprint stored in localStorage
function getOrCreateDeviceId() {
  const KEY = "ccentrik_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

// Fetch IP + approximate location (non-blocking, fails silently)
async function fetchGeoInfo() {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 4000);
    const res  = await fetch("https://ipapi.co/json/", { signal: ctrl.signal });
    clearTimeout(tid);
    const d = await res.json();
    return { ip_address: d.ip || null, city: d.city || null, country: d.country_name || null };
  } catch {
    return {};
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const loginLogId = useRef(null);
  const inactivityTimer = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const logoutRef = useRef(null);

  const fetchOrCreateProfile = useCallback(async (firebaseUser) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("firebase_uid", firebaseUser.uid)
        .single();

      if (error && error.code === "PGRST116") {
        // Profile doesn't exist — create it
        const displayName =
          firebaseUser.displayName ||
          firebaseUser.email?.split("@")[0] ||
          "User";
        const { data: newProfile, error: insertErr } = await supabase
          .from("profiles")
          .insert({
            firebase_uid: firebaseUser.uid,
            email: firebaseUser.email?.toLowerCase(),
            full_name: displayName,
            avatar_url: firebaseUser.photoURL || null,
            role: "employee",
            status: "active",
          })
          .select()
          .single();
        if (!insertErr) return newProfile;
      } else if (!error && data) {
        // Block deleted accounts — covers Google OAuth, email/password, and any cached session
        if (data.status === "deleted") {
          await signOut(auth);
          toast.error("Your account has been removed from this organization. Please contact your administrator.", { duration: 6000 });
          return null;
        }
        // Block suspended accounts immediately
        if (data.status === "inactive") {
          await signOut(auth);
          toast.error("Your account has been deactivated. Contact your admin.");
          return null;
        }
        // Update online_at
        await supabase
          .from("profiles")
          .update({ online_at: new Date().toISOString() })
          .eq("firebase_uid", firebaseUser.uid);
        // Log this login session — deduplicate + detect meaningful context changes
        try {
          const devId = getOrCreateDeviceId();
          const ua    = parseUA();

          // Fetch existing open session from this device (with context fields for comparison)
          const { data: existing } = await supabase
            .from("login_logs")
            .select("id, browser, os, ip_address")
            .eq("user_id", data.id)
            .eq("device_id", devId)
            .is("logged_out_at", null)
            .order("logged_in_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const loginMethod = firebaseUser.providerData?.[0]?.providerId === "google.com" ? "Google"
            : firebaseUser.providerData?.[0]?.providerId === "password" ? "Password" : "Other";
          const networkType = getNetworkType();

          if (existing?.id) {
            const browserChanged = ua.browser !== existing.browser || ua.os !== existing.os;
            const geo = await fetchGeoInfo();
            const ipChanged = !!(geo.ip_address && existing.ip_address && geo.ip_address !== existing.ip_address);

            if (browserChanged || ipChanged) {
              // Meaningful context change — close old session and start a fresh one
              await supabase
                .from("login_logs")
                .update({ logged_out_at: new Date().toISOString(), session_status: "logged_out" })
                .eq("id", existing.id);
              const { data: logRow } = await supabase
                .from("login_logs")
                .insert({ user_id: data.id, ...ua, ...geo, device_id: devId, login_method: loginMethod, network_type: networkType, session_status: "active" })
                .select("id")
                .single();
              if (logRow?.id) loginLogId.current = logRow.id;
            } else {
              // No meaningful change — reuse existing session row
              loginLogId.current = existing.id;
            }
          } else {
            // No open session for this device — create new entry
            const geo = await fetchGeoInfo();
            const { data: logRow } = await supabase
              .from("login_logs")
              .insert({ user_id: data.id, ...ua, ...geo, device_id: devId, login_method: loginMethod, network_type: networkType, session_status: "active" })
              .select("id")
              .single();
            if (logRow?.id) loginLogId.current = logRow.id;
          }
        } catch { /* non-critical */ }
        return data;
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
    return null;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email?.toLowerCase() || "";
        if (email.endsWith("@ccentrik.com")) {
          const prof = await fetchOrCreateProfile(firebaseUser);
          setUser(firebaseUser);
          setProfile(prof);
        } else {
          await signOut(auth);
          setUser(null);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [fetchOrCreateProfile]);

  // Keep logoutRef always pointing to the latest logout function so the inactivity
  // timer callback never calls a stale closure captured at effect-run time.
  useEffect(() => {
    logoutRef.current = logout;
  });

  // Inactivity auto-logout after INACTIVITY_MS of real user inactivity.
  // Uses a ref (lastActivityRef) instead of sessionStorage to avoid stale-closure
  // bugs — the ref value is always current regardless of which render the closure was created in.
  useEffect(() => {
    if (!user) return;

    // Reset activity clock on login / user change
    lastActivityRef.current = Date.now();

    const scheduleLogout = () => {
      clearTimeout(inactivityTimer.current);
      const remaining = INACTIVITY_MS - (Date.now() - lastActivityRef.current);
      // Never schedule sooner than 1 second to avoid rapid-fire micro-timeouts
      inactivityTimer.current = setTimeout(() => {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= INACTIVITY_MS) {
          toast("Logged out due to inactivity.", { icon: "🔒" });
          logoutRef.current?.("timeout");
        } else {
          scheduleLogout();
        }
      }, Math.max(remaining, 1000));
    };

    const onActivity = () => {
      lastActivityRef.current = Date.now();
      scheduleLogout();
    };

    // When user returns to the tab, recalculate remaining time from lastActivityRef.
    // When the tab is hidden we do nothing — the existing timer keeps running.
    const onVisibility = () => {
      if (!document.hidden) scheduleLogout();
    };

    const EVENTS = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);

    scheduleLogout();

    return () => {
      clearTimeout(inactivityTimer.current);
      EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const login = async (email, password) => {
    const lowerEmail = email.toLowerCase();
    if (!lowerEmail.endsWith("@ccentrik.com")) {
      throw new Error("Only @ccentrik.com domains are allowed.");
    }
    return signInWithEmailAndPassword(auth, lowerEmail, password);
  };

  const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const email = result.user.email?.toLowerCase() || "";
    if (!email.endsWith("@ccentrik.com")) {
      await signOut(auth);
      throw new Error("Access restricted to @ccentrik.com users.");
    }
    return result;
  };

  const logout = async (status = "logged_out") => {
    if (user) {
      await supabase
        .from("profiles")
        .update({ online_at: null })
        .eq("firebase_uid", user.uid);
    }
    // Stamp logout time on the active session row
    if (loginLogId.current) {
      try {
        await supabase
          .from("login_logs")
          .update({ logged_out_at: new Date().toISOString(), session_status: status })
          .eq("id", loginLogId.current);
      } catch { /* non-critical */ }
      loginLogId.current = null;
    }
    sessionStorage.removeItem("dealsView");
    return signOut(auth);
  };

  const forgotPassword = (email) => sendPasswordResetEmail(auth, email);

  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("firebase_uid", user.uid)
      .single();
    if (data) setProfile(data);
    return data;
  };

  // Permission helpers
  const isOwner = profile?.role === "owner";
  const isSalesHead = ["owner", "sales_head"].includes(profile?.role);
  const isManager = ["owner", "sales_head", "sales_manager"].includes(profile?.role);
  const isInsideSales = profile?.role === "inside_sales";
  const isFieldUser = ["employee", "inside_sales"].includes(profile?.role);
  const hasRole = (roles) => roles.includes(profile?.role);

  const value = {
    user,
    profile,
    loading,
    login,
    loginWithGoogle,
    logout,
    forgotPassword,
    refreshProfile,
    isOwner,
    isSalesHead,
    isManager,
    isInsideSales,
    isFieldUser,
    hasRole,
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="w-12 h-12 rounded-full border-[3px] border-indigo-100 border-t-indigo-600 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center font-black text-indigo-600 text-sm">
              C
            </div>
          </div>
          <p className="text-slate-400 text-xs font-semibold tracking-widest uppercase animate-pulse">
            Loading Workspace
          </p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
