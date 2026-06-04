import { supabase } from "../supabaseClient";
import { auth } from "../firebase";
import axios from "axios";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

export const teamService = {
  async getAll({ search = "", role = "" } = {}) {
    let query = supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .neq("status", "deleted")
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    if (role) query = query.eq("role", role);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  },

  async getById(id) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  },

  async getByFirebaseUid(uid) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("firebase_uid", uid)
      .single();
    if (error) throw error;
    return data;
  },

  async updateProfile(id, payload) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateRole(id, role) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async inviteMember({ email, role, full_name }) {
    const token = await auth.currentUser?.getIdToken();
    const res = await axios.post(
      `${API}/api/auth/add-member`,
      { email, role, name: full_name },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  },

  async removeMember(id) {
    const token = await auth.currentUser?.getIdToken();
    const res = await axios.delete(
      `${API}/api/users/${id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  },

  async deactivate(id) {
    const { error } = await supabase
      .from("profiles")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async activate(id) {
    const { error } = await supabase
      .from("profiles")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async getOnlineUsers() {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, online_at, role")
      .gte("online_at", fiveMinAgo);
    return data || [];
  },
};
