import { createContext, useContext, useState, useEffect, useCallback } from "react";
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

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

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
        // Update online_at
        await supabase
          .from("profiles")
          .update({ online_at: new Date().toISOString() })
          .eq("firebase_uid", firebaseUser.uid);
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

  const logout = async () => {
    if (user) {
      await supabase
        .from("profiles")
        .update({ online_at: null })
        .eq("firebase_uid", user.uid);
    }
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
