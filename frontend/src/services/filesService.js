import { supabase } from "../supabaseClient";

const BUCKET = "crm-files";

export const filesService = {
  async upload(file, folder = "general") {
    const ext = file.name.split(".").pop();
    const name = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage.from(BUCKET).upload(name, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(name);
    return { path: name, url: urlData.publicUrl, name: file.name, size: file.size, type: file.type };
  },

  async getForRecord({ leadId, dealId, customerId, taskId } = {}) {
    let query = supabase.from("files").select(`*, uploaded_by:profiles!files_uploaded_by_fkey(full_name)`).order("created_at", { ascending: false });
    if (leadId) query = query.eq("lead_id", leadId);
    else if (dealId) query = query.eq("deal_id", dealId);
    else if (customerId) query = query.eq("customer_id", customerId);
    else if (taskId) query = query.eq("task_id", taskId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async save(payload) {
    const { data, error } = await supabase.from("files").insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id, path) {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    const { error } = await supabase.from("files").delete().eq("id", id);
    if (error) throw error;
  },
};
