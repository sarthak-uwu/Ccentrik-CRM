'use strict';
const { supabase } = require("../config/db");

const CALL_TYPES     = new Set(["call","phone_call","outbound_call","inbound_call","follow_up_call"]);
const EMAIL_TYPES    = new Set(["email","email_sent","email_received","follow_up_email","email_contact"]);
const FOLLOWUP_TYPES = new Set(["follow_up","follow_up_call","follow_up_email","followup"]);

function emptyStats(profile) {
  return {
    profile,
    prospectsAdded:      0,
    leadsCreated:        0,
    dealsCreated:        0,
    activitiesCompleted: 0,
    activitiesPending:   0,
    activitiesOverdue:   0,
    callsMade:           0,
    emailsSent:          0,
    meetingsScheduled:   0,
    meetingsCompleted:   0,
    tasksCreated:        0,
    tasksCompleted:      0,
    followUpsCompleted:  0,
    followUpsPending:    0,
    nextFollowUps:       0,
    pipelineConverted:   0,
    leadsConverted:      0,
    dealsWon:            0,
    dealsLost:           0,
    revenue:             0,
    lastActivityAt:      null,
    activityTimeline:    [],   // [{time, type, status, description, outcome}]
  };
}

// Fetch all data for one IST day in parallel and return a structured object.
async function collectDsrData(dayStart, dayEnd, todayStr) {
  // 1. All active profiles with manager hierarchy
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, manager_id")
    .not("status", "in", '("deleted","inactive")')
    .order("full_name");

  if (profErr) throw new Error("Profiles fetch failed: " + profErr.message);

  const allProfiles = profiles || [];
  const profileMap  = {};
  allProfiles.forEach(p => { profileMap[p.id] = p; });

  const tomorrow = new Date(new Date(dayEnd).getTime() + 1).toISOString();

  // 2. Parallel data fetch — all within dayStart / dayEnd window
  const [
    { data: leadsToday        },
    { data: leadsConverted    },
    { data: dealsCreated      },
    { data: dealsWon          },
    { data: dealsLost         },
    { data: actsTimeline      },   // ALL activities created today (for timeline + call/email counts)
    { data: actsCompleted     },   // activities marked done today
    { data: actsPending       },   // activities pending due today
    { data: actsOverdue       },   // activities pending past due
    { data: actsFUPending     },   // follow-up activities still pending (any date)
    { data: actsNextFU        },   // follow-ups due tomorrow or later
    { data: meetingsToday     },
    { data: tasksCreated      },
    { data: tasksCompleted    },
  ] = await Promise.all([

    // Leads / prospects created today
    supabase.from("leads")
      .select("id, stage, created_by, assigned_to, created_at, company_name, contact_name")
      .gte("created_at", dayStart).lte("created_at", dayEnd),

    // Leads converted today
    supabase.from("leads")
      .select("id, assigned_to, updated_at")
      .eq("stage", "converted")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    // Deals created today
    supabase.from("deals")
      .select("id, stage, value, created_by, assigned_to, created_at")
      .gte("created_at", dayStart).lte("created_at", dayEnd),

    // Deals won today
    supabase.from("deals")
      .select("id, value, assigned_to, updated_at")
      .eq("stage", "won")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    // Deals lost today
    supabase.from("deals")
      .select("id, assigned_to, updated_at")
      .eq("stage", "lost")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    // Full activity timeline for today
    supabase.from("activities")
      .select("id, type, status, created_by, lead_id, deal_id, created_at, updated_at, description, outcome, notes, due_date")
      .gte("created_at", dayStart).lte("created_at", dayEnd)
      .order("created_at"),

    // Activities completed today
    supabase.from("activities")
      .select("id, type, created_by, updated_at")
      .in("status", ["done", "completed"])
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),

    // Activities pending due today
    supabase.from("activities")
      .select("id, type, created_by, due_date")
      .eq("status", "pending")
      .gte("due_date", dayStart).lte("due_date", dayEnd),

    // Activities overdue (pending, past due)
    supabase.from("activities")
      .select("id, type, created_by, due_date")
      .eq("status", "pending")
      .lt("due_date", dayStart),

    // Follow-up activities still pending (due today or earlier — needs attention)
    supabase.from("activities")
      .select("id, type, created_by, due_date")
      .in("type", [...FOLLOWUP_TYPES])
      .eq("status", "pending")
      .lte("due_date", dayEnd),

    // Follow-ups scheduled for tomorrow or later (next follow-ups)
    supabase.from("activities")
      .select("id, type, created_by, due_date")
      .in("type", [...FOLLOWUP_TYPES])
      .eq("status", "pending")
      .gt("due_date", dayEnd),

    // Today's meetings with full detail
    supabase.from("meetings")
      .select("id, title, customer_name, company_name, contact_name, start_time, end_time, status, meeting_type, meet_link, location, notes, purpose, created_by")
      .gte("start_time", dayStart).lte("start_time", dayEnd)
      .order("start_time"),

    // Tasks created today
    supabase.from("tasks")
      .select("id, title, status, created_by, assigned_to, created_at")
      .gte("created_at", dayStart).lte("created_at", dayEnd),

    // Tasks completed today
    supabase.from("tasks")
      .select("id, assigned_to, updated_at")
      .eq("status", "done")
      .gte("updated_at", dayStart).lte("updated_at", dayEnd),
  ]);

  // 3. Build per-user stats map
  const statsMap = {};
  allProfiles.forEach(p => { statsMap[p.id] = emptyStats(p); });

  const bump = (uid, field, by = 1) => { if (uid && statsMap[uid]) statsMap[uid][field] += by; };
  const trackLast = (uid, ts) => {
    if (!uid || !ts || !statsMap[uid]) return;
    if (!statsMap[uid].lastActivityAt || ts > statsMap[uid].lastActivityAt) {
      statsMap[uid].lastActivityAt = ts;
    }
  };

  // Leads / prospects
  (leadsToday || []).forEach(l => {
    const uid = l.created_by || l.assigned_to;
    if (!uid || !statsMap[uid]) return;
    const stage = (l.stage || "").toLowerCase();
    if (stage === "pipeline" || stage === "prospect" || stage === "awareness") {
      bump(uid, "prospectsAdded");
    } else {
      bump(uid, "leadsCreated");
    }
  });

  (leadsConverted || []).forEach(l => {
    bump(l.assigned_to, "leadsConverted");
  });

  // Deals
  (dealsCreated || []).forEach(d => {
    bump(d.created_by || d.assigned_to, "dealsCreated");
  });
  (dealsWon || []).forEach(d => {
    bump(d.assigned_to, "dealsWon");
    bump(d.assigned_to, "revenue", Number(d.value) || 0);
  });
  (dealsLost || []).forEach(d => {
    bump(d.assigned_to, "dealsLost");
  });

  // Activity timeline (today's created activities)
  (actsTimeline || []).forEach(a => {
    const uid = a.created_by;
    if (!uid || !statsMap[uid]) return;
    const t = (a.type || "").toLowerCase();
    if (CALL_TYPES.has(t))     bump(uid, "callsMade");
    if (EMAIL_TYPES.has(t))    bump(uid, "emailsSent");
    if (FOLLOWUP_TYPES.has(t) && (a.status === "done" || a.status === "completed")) {
      bump(uid, "followUpsCompleted");
    }
    trackLast(uid, a.created_at);
    statsMap[uid].activityTimeline.push({
      time:        a.created_at,
      type:        a.type || "activity",
      status:      a.status || "",
      description: a.description || a.notes || "",
      outcome:     a.outcome || "",
    });
  });

  // Activities completed today (status-based)
  (actsCompleted || []).forEach(a => { bump(a.created_by, "activitiesCompleted"); });

  // Activities pending today
  (actsPending || []).forEach(a => { bump(a.created_by, "activitiesPending"); });

  // Activities overdue
  (actsOverdue || []).forEach(a => { bump(a.created_by, "activitiesOverdue"); });

  // Follow-ups pending
  (actsFUPending || []).forEach(a => { bump(a.created_by, "followUpsPending"); });

  // Next follow-ups
  (actsNextFU || []).forEach(a => { bump(a.created_by, "nextFollowUps"); });

  // Meetings
  (meetingsToday || []).forEach(m => {
    const uid = m.created_by;
    bump(uid, "meetingsScheduled");
    if (m.status === "completed" || m.status === "done") bump(uid, "meetingsCompleted");
    trackLast(uid, m.start_time);
  });

  // Tasks
  (tasksCreated || []).forEach(t => {
    bump(t.created_by || t.assigned_to, "tasksCreated");
  });
  (tasksCompleted || []).forEach(t => {
    bump(t.assigned_to, "tasksCompleted");
  });

  // 4. Org-wide totals (all users combined)
  const totals = emptyStats({ full_name: "Organization", role: "org" });
  const ADDITIVE = ["prospectsAdded","leadsCreated","dealsCreated","activitiesCompleted",
    "activitiesPending","activitiesOverdue","callsMade","emailsSent","meetingsScheduled",
    "meetingsCompleted","tasksCreated","tasksCompleted","followUpsCompleted","followUpsPending",
    "nextFollowUps","pipelineConverted","leadsConverted","dealsWon","dealsLost","revenue"];
  Object.values(statsMap).forEach(s => {
    ADDITIVE.forEach(k => { totals[k] += s[k]; });
  });

  return { date: todayStr, allProfiles, profileMap, statsMap, meetings: meetingsToday || [], totals };
}

// Returns the subset of allProfiles visible to a given recipient based on role.
function getScopeProfiles(recipient, allProfiles) {
  const { id, role } = recipient;
  if (role === "owner") return allProfiles;

  if (role === "sales_head") {
    const level1Ids = new Set(allProfiles.filter(p => p.manager_id === id).map(p => p.id));
    const level2Ids = new Set(allProfiles.filter(p => level1Ids.has(p.manager_id)).map(p => p.id));
    const scopeIds  = new Set([id, ...level1Ids, ...level2Ids]);
    return allProfiles.filter(p => scopeIds.has(p.id));
  }

  if (role === "sales_manager") {
    const directIds = new Set(allProfiles.filter(p => p.manager_id === id).map(p => p.id));
    return allProfiles.filter(p => p.id === id || directIds.has(p.id));
  }

  return allProfiles.filter(p => p.id === id);
}

// Sums stats for a given array of profile IDs.
function calcScopeTotals(scopeProfiles, statsMap) {
  const scopeIds = new Set(scopeProfiles.map(p => p.id));
  const t = emptyStats({ full_name: "Scope" });
  const ADDITIVE = ["prospectsAdded","leadsCreated","dealsCreated","activitiesCompleted",
    "activitiesPending","activitiesOverdue","callsMade","emailsSent","meetingsScheduled",
    "meetingsCompleted","tasksCreated","tasksCompleted","followUpsCompleted","followUpsPending",
    "nextFollowUps","pipelineConverted","leadsConverted","dealsWon","dealsLost","revenue"];
  for (const [uid, stats] of Object.entries(statsMap)) {
    if (!scopeIds.has(uid)) continue;
    ADDITIVE.forEach(k => { t[k] += stats[k]; });
  }
  return t;
}

module.exports = { collectDsrData, getScopeProfiles, calcScopeTotals };
