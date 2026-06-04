const express = require("express");
const router = express.Router();
const { supabase } = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { sendSensitiveFieldAlert } = require("../config/mail");

const CAN_EDIT   = ["owner", "sales_head", "sales_manager"];
const CAN_DELETE = ["owner", "sales_head"];

const calcAiScore = (budget, source) => {
  let score = 40;
  if (budget > 100000) score += 30;
  else if (budget > 50000) score += 20;
  else if (budget > 10000) score += 10;
  if (source === "referral") score += 25;
  else if (source === "website") score += 10;
  return Math.min(score, 100);
};

async function nextLeadCode() {
  const { data } = await supabase.from("leads").select("lead_code").not("lead_code", "is", null);
  let max = 0;
  (data || []).forEach((r) => {
    const n = parseInt((r.lead_code || "").replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return `LEAD-${String(max + 1).padStart(3, "0")}`;
}

// GET /api/leads
router.get("/", authenticate, async (req, res) => {
  const { stage, temperature, source, assigned_to, search, limit = 100, offset = 0 } = req.query;
  const { role, id: profileId } = req.profile;

  const applyLeadFilters = (q) => {
    if (role !== "owner" && role !== "sales_head") q = q.eq("assigned_to", profileId);
    if (stage) {
      q = q.eq("stage", stage);
    } else {
      q = q.neq("stage", "converted").neq("stage", "pipeline");
    }
    if (temperature) q = q.eq("temperature", temperature);
    if (source)      q = q.eq("source", source);
    if (assigned_to && (role === "owner" || role === "sales_head")) q = q.eq("assigned_to", assigned_to);
    if (search)      q = q.or(`contact_name.ilike.%${search}%,company_name.ilike.%${search}%`);
    return q.order("created_at", { ascending: false }).range(Number(offset), Number(offset) + Number(limit) - 1);
  };

  // Try enriched select with FK joins first; fall back to plain if FK names differ
  let { data, error, count } = await applyLeadFilters(
    supabase.from("leads").select(
      "*, assigned_profile:profiles!assigned_to(id,full_name,avatar_url,email), created_by_profile:profiles!created_by(id,full_name)",
      { count: "exact" }
    )
  );

  if (error) {
    const plain = await applyLeadFilters(
      supabase.from("leads").select("*", { count: "exact" })
    );
    if (plain.error) return res.status(400).json({ error: plain.error.message });
    data  = plain.data || [];
    count = plain.count;

    const assignedIds = [...new Set(data.filter((l) => l.assigned_to).map((l) => l.assigned_to))];
    if (assignedIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,full_name,avatar_url,email").in("id", assignedIds);
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      data = data.map((l) => ({ ...l, assigned_profile: l.assigned_to ? (profileMap[l.assigned_to] || null) : null }));
    }
  }

  res.json({ data: data || [], count: count || 0 });
});

// POST /api/leads
router.post("/", authenticate, async (req, res) => {
  const { budget, source, assigned_to, ...rest } = req.body;
  const { role, id: profileId } = req.profile;

  // Validate required fields
  if (!rest.company_name?.trim()) {
    return res.status(400).json({ error: "Company name is required" });
  }
  let notes = {};
  try { notes = rest.other_notes ? JSON.parse(rest.other_notes) : {}; } catch { /* ignore */ }
  if (!notes.email?.trim() && !notes.phone?.trim()) {
    return res.status(400).json({ error: "At least one contact detail (Email or Phone) is required" });
  }

  const ai_score = calcAiScore(Number(budget) || 0, source);
  const lead_code = await nextLeadCode();

  // Field users (employee/inside_sales) always assigned to themselves
  const finalAssignedTo = ["employee", "inside_sales"].includes(role) ? profileId : (assigned_to || profileId);

  const { data, error } = await supabase
    .from("leads")
    .insert({ ...rest, contact_name: rest.contact_name ?? "", budget: Number(budget) || 0, source, ai_score, lead_code, assigned_to: finalAssignedTo, created_by: profileId })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  // Auto-log "Lead created" activity
  supabase.from("activities").insert({
    type: "note",
    title: `Lead created: ${data.contact_name || data.company_name || lead_code}`,
    description: `Lead created: ${data.contact_name || data.company_name || lead_code}`,
    lead_id: data.id,
    created_by: profileId,
    status: "done",
  }).then(() => {}).catch(() => {});

  res.status(201).json(data);
});

// POST /api/leads/bulk
router.post("/bulk", authenticate, authorize(...CAN_EDIT), async (req, res) => {
  const leads = req.body;
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "Body must be a non-empty array of leads" });
  }
  const { data: codeData } = await supabase.from("leads").select("lead_code").not("lead_code", "is", null);
  let maxCode = 0;
  (codeData || []).forEach((r) => {
    const n = parseInt((r.lead_code || "").replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > maxCode) maxCode = n;
  });
  const enriched = leads.map((l, i) => ({
    ...l,
    ai_score: calcAiScore(Number(l.budget) || 0, l.source),
    lead_code: `LEAD-${String(maxCode + i + 1).padStart(3, "0")}`,
    created_by: req.profile.id,
    assigned_to: l.assigned_to || req.profile.id,
  }));
  const { data, error } = await supabase.from("leads").insert(enriched).select();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ inserted: data.length, data });
});

// GET /api/leads/:id
router.get("/:id", authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .select("*, assigned_profile:profiles!leads_assigned_to_fkey(id,full_name,avatar_url)")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: "Lead not found" });
  res.json(data);
});

const TRACKED_FIELDS = ["stage", "temperature", "priority", "assigned_to", "follow_up_date"];

// Only allow known fields through to Supabase — prevents mass-assignment attacks
const ALLOWED_UPDATE_FIELDS = [
  "contact_name", "company_name", "designation", "email", "phone",
  "stage", "temperature", "priority", "source", "remarks",
  "follow_up_date", "assigned_to", "pipeline_stage", "other_notes",
  "budget", "lead_code",
];
function pickAllowed(body) {
  return Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED_UPDATE_FIELDS.includes(k))
  );
}

async function logLeadChanges(leadId, oldLead, newBody, profileId) {
  const changes = TRACKED_FIELDS.filter(
    (f) => newBody[f] !== undefined && String(oldLead[f] ?? "") !== String(newBody[f])
  );
  for (const field of changes) {
    await supabase.from("activities").insert({
      type: "note",
      title: `${field} updated: ${oldLead[field] ?? "—"} → ${newBody[field]}`,
      description: `${field}: ${oldLead[field] ?? "—"} → ${newBody[field]}`,
      lead_id: leadId,
      created_by: profileId,
      status: "done",
    });
  }
}

// PUT /api/leads/:id — owner & sales_head only
router.put("/:id", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  const safeBody = pickAllowed(req.body);
  const { data: oldLead } = await supabase
    .from("leads")
    .select(TRACKED_FIELDS.join(","))
    .eq("id", req.params.id)
    .single();

  const { data, error } = await supabase
    .from("leads")
    .update({ ...safeBody, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  if (oldLead) logLeadChanges(req.params.id, oldLead, safeBody, req.profile.id).catch(() => {});

  res.json(data);
});

// PATCH /api/leads/:id — owner & sales_head only
router.patch("/:id", authenticate, authorize("owner", "sales_head"), async (req, res) => {
  const safeBody = pickAllowed(req.body);
  const { data: oldLead } = await supabase
    .from("leads")
    .select(TRACKED_FIELDS.join(","))
    .eq("id", req.params.id)
    .single();

  const { data, error } = await supabase
    .from("leads")
    .update({ ...safeBody, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  if (oldLead) logLeadChanges(req.params.id, oldLead, safeBody, req.profile.id).catch(() => {});

  res.json(data);
});

// DELETE /api/leads/:id
router.delete("/:id", authenticate, authorize(...CAN_DELETE), async (req, res) => {
  // Fetch lead summary before deletion for audit trail
  const { data: lead } = await supabase
    .from("leads").select("contact_name,company_name,lead_code").eq("id", req.params.id).single();

  const { error } = await supabase.from("leads").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  // Cascade delete associated notifications so they don't linger as ghost records
  supabase.from("notifications").delete().eq("entity_id", req.params.id).eq("entity_type", "lead").then(() => {}).catch(() => {});

  // Log deletion to activities for audit trail
  if (lead) {
    supabase.from("activities").insert({
      type: "note",
      title: `Lead deleted: ${lead.company_name || lead.contact_name || lead.lead_code}`,
      description: `Lead deleted: ${lead.company_name || lead.contact_name || lead.lead_code}`,
      created_by: req.profile.id,
      status: "done",
    }).then(() => {}).catch(() => {});
  }

  res.json({ success: true, deleted: lead || null });
});

// POST /api/leads/sensitive-edit-alert
router.post("/sensitive-edit-alert", authenticate, async (req, res) => {
  const { leadId, leadName, companyName, editorName, editorRole, editedFields } = req.body;
  if (!editedFields?.length) return res.json({ success: true, sent: 0 });

  const { data: managers, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("role", ["owner", "sales_head"])
    .not("email", "is", null);

  if (error) return res.status(400).json({ error: error.message });
  if (!managers?.length) return res.json({ success: true, sent: 0 });

  const results = await Promise.allSettled(
    managers.map((m) =>
      sendSensitiveFieldAlert({
        to: m.email,
        toName: m.full_name,
        editorName,
        editorRole,
        leadName,
        companyName,
        editedFields,
      })
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  res.json({ success: true, sent });
});

// POST /api/leads/:id/convert-to-lead — convert pipeline record to active lead
// Validates contact info before allowing conversion (applies to all roles)
router.post("/:id/convert-to-lead", authenticate, async (req, res) => {
  try {
    const { data: lead, error: fetchErr } = await supabase
      .from("leads")
      .select("id, stage, company_name, contact_name, email, phone, other_notes")
      .eq("id", req.params.id)
      .single();

    if (fetchErr || !lead) return res.status(404).json({ error: "Record not found" });
    if (lead.stage !== "pipeline") return res.status(400).json({ error: "Only pipeline records can be converted to leads" });

    // Parse contact details from other_notes JSON field
    let notes = {};
    try { notes = lead.other_notes ? JSON.parse(lead.other_notes) : {}; } catch { /* ignore */ }

    // Check direct fields on the lead row
    const hasEmail = !!(lead.email?.trim() || notes.email?.trim());

    // Phone: direct field, notes.phone, notes.whatsapp, plus any person in people_contacts with a phone
    let hasPhone = !!(lead.phone?.trim() || notes.phone?.trim() || notes.whatsapp?.trim());
    if (!hasPhone && Array.isArray(notes.people_contacts)) {
      hasPhone = notes.people_contacts.some((p) => p?.phone?.trim());
    }

    // Email fallback: any person in people_contacts with an email
    let hasEmailFull = hasEmail;
    if (!hasEmailFull && Array.isArray(notes.people_contacts)) {
      hasEmailFull = notes.people_contacts.some((p) => p?.email?.trim());
    }

    if (!hasEmailFull && !hasPhone) {
      return res.status(400).json({
        error: "Lead conversion requires at least one contact method. Please add either a Contact Number or an Email Address before converting this Pipeline record into a Lead.",
        code:  "MISSING_CONTACT",
        missing_fields: ["email", "phone"],
      });
    }

    const now = new Date().toISOString();
    let existingNotes = {};
    try { existingNotes = lead.other_notes ? JSON.parse(lead.other_notes) : {}; } catch { /* ignore */ }
    const updatedNotes = JSON.stringify({ ...existingNotes, lead_created_at: now });

    const { data, error } = await supabase
      .from("leads")
      .update({ stage: "new", updated_at: now, other_notes: updatedNotes })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Log lifecycle activity
    supabase.from("activities").insert({
      type: "note",
      title: `Converted to Lead: ${data.company_name || data.contact_name || data.lead_code}`,
      description: `Pipeline record converted to active lead by ${req.profile.full_name || "team member"}`,
      lead_id: data.id,
      created_by: req.profile.id,
      status: "done",
    }).then(() => {}).catch(() => {});

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leads/cleanup-orphans — owner only
// Finds 'converted' leads with no linked deal and resets their stage back to 'new'
router.post("/cleanup-orphans", authenticate, authorize("owner"), async (req, res) => {
  try {
    // Find all converted leads
    const { data: convertedLeads } = await supabase
      .from("leads").select("id").eq("stage", "converted");
    if (!convertedLeads?.length) return res.json({ fixed: 0, message: "No orphaned leads found" });

    // Find which ones still have a live deal
    const leadIds = convertedLeads.map((l) => l.id);
    const { data: linkedDeals } = await supabase
      .from("deals").select("lead_id").in("lead_id", leadIds);
    const linkedLeadIds = new Set((linkedDeals || []).map((d) => d.lead_id));

    // Orphans = converted leads with no deal
    const orphanIds = leadIds.filter((id) => !linkedLeadIds.has(id));
    if (!orphanIds.length) return res.json({ fixed: 0, message: "No orphaned leads found" });

    const { error } = await supabase
      .from("leads").update({ stage: "new", updated_at: new Date().toISOString() })
      .in("id", orphanIds);
    if (error) return res.status(400).json({ error: error.message });

    res.json({ fixed: orphanIds.length, message: `${orphanIds.length} orphaned lead(s) restored to active state` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
