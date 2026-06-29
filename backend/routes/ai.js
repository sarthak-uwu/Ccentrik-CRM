const express = require("express");
const router  = express.Router();
const Groq    = require("groq-sdk");
const { supabase }     = require("../config/db");
const { authenticate } = require("../middleware/auth");

// ── Document RAG: search uploaded project docs ────────────────────────────────
async function searchDocuments(query) {
  try {
    const { count } = await supabase
      .from("ai_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready");
    if (!count || count === 0) return null;

    const { data, error } = await supabase.rpc("search_document_chunks", {
      query_text:  query,
      match_count: 5,
    });
    if (error || !data?.length) return null;

    return data
      .map((c) => `[Source: ${c.document_name}]\n${c.content}`)
      .join("\n\n---\n\n");
  } catch {
    return null;
  }
}

const GROQ_MODEL      = "llama-3.1-8b-instant";
const MAX_ITERATIONS  = 6;

// Per-user conversation history (in-memory; resets on cold start)
const conversationHistory = {};

// ── Release Notes (version history) ──────────────────────────────────────────
const RELEASE_NOTES = [
  {
    version: "2.4.0",
    date: "June 2026",
    highlights: [
      "CCENTRIK AI upgraded with 11 modes: CRM Assistant, Sales Copilot, Meeting Assistant, Email Assistant, Analytics, Lead Qualification, Workflow, Release Notes, AI Recommendations, Content Generator, CRM Help",
      "New Prompt Library — save and reuse your favorite prompts",
      "AI Insights panel in right sidebar with live pipeline stats",
      "Voice AI: continuous listening, Hindi/Hinglish support, auto-submit on 3.5s silence",
      "Global CRM Search across leads, prospects, deals, meetings, contacts in one query",
      "AI Recommendations engine — best next actions, lead priority, risk alerts",
      "File AI: PDF, DOCX, XLSX, CSV upload and Q&A",
      "Image AI: visiting card scan, OCR, contact extraction",
      "New write actions: create prospect, schedule meeting, update lead stage, convert lead",
    ],
  },
  {
    version: "2.3.0",
    date: "May 2026",
    highlights: [
      "In-CRM email composer — send Gmail emails directly from leads, deals, and contacts",
      "Gmail activity sync — all sent/received emails appear in activity log",
      "Role-based Daily Sales Report (DSR) emails — automated daily dispatch",
      "Comprehensive inactivity alerts for managers",
      "AI document indexing — upload PDFs and ask questions from them",
    ],
  },
  {
    version: "2.2.0",
    date: "April 2026",
    highlights: [
      "CCENTRIK AI rebuilt from scratch with full agentic UI and streaming responses",
      "Pipeline module with Kanban view and drag-and-drop stage updates",
      "Deal detail panel with activity timeline",
      "Lead-to-deal conversion flow",
      "Security audit log with role-based visibility",
    ],
  },
  {
    version: "2.1.0",
    date: "March 2026",
    highlights: [
      "Voice AI assistant with Text-to-Speech and Speech-to-Text",
      "Meeting scheduler with Google Calendar-style UI",
      "Targets and KPI tracking module",
      "Analytics dashboard with revenue trends and employee performance",
      "Dark mode support across all modules",
    ],
  },
];

// ── Tool definitions ──────────────────────────────────────────────────────────
const CRM_TOOLS = [
  // ── READ tools ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_leads",
      description: "Query live leads from the CRM. Use whenever the user asks about leads, hot leads, follow-ups, pipeline contacts, or specific companies.",
      parameters: {
        type: "object",
        properties: {
          temperature:   { type: "string", enum: ["hot", "warm", "cold"], description: "Filter by temperature" },
          stage:         { type: "string", description: "Filter by stage: new, contacted, qualified, proposal, negotiation, won, lost" },
          follow_up_due: { type: "boolean", description: "Only leads with follow-up due in next 3 days" },
          search:        { type: "string", description: "Search by contact name or company name" },
          limit:         { type: "number", description: "Max results (default 20, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_prospects",
      description: "Query prospects (companies/contacts being prospected before becoming leads). Use for prospecting pipeline, new prospects, or outreach questions.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status: new, contacted, qualified, converted, lost" },
          search: { type: "string", description: "Search by name or company" },
          limit:  { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deals",
      description: "Query live deals. Use for pipeline value, stale deals, open deals, won revenue, or deal-specific questions.",
      parameters: {
        type: "object",
        properties: {
          stage:      { type: "string", description: "Filter by stage: prospecting, qualification, proposal, negotiation, won, lost" },
          stale_days: { type: "number", description: "Only deals not updated in N days" },
          search:     { type: "string", description: "Search by title or company name" },
          limit:      { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tasks",
      description: "Get pending or overdue tasks.",
      parameters: {
        type: "object",
        properties: {
          overdue_only: { type: "boolean", description: "Only tasks past their due date" },
          priority:     { type: "string", enum: ["high", "medium", "low"], description: "Filter by priority" },
          limit:        { type: "number", description: "Max results (default 15)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_activities",
      description: "Get recent sales activities — calls, emails, meetings, demos, notes.",
      parameters: {
        type: "object",
        properties: {
          type:  { type: "string", description: "Filter by type: call, email, meeting, demo, note" },
          limit: { type: "number", description: "Max results (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_meetings",
      description: "Query scheduled meetings — upcoming, past, or by status. Use for meeting prep, today's meetings, or meeting history.",
      parameters: {
        type: "object",
        properties: {
          status:   { type: "string", description: "Filter by status: scheduled, completed, cancelled" },
          upcoming: { type: "boolean", description: "Only future meetings" },
          today:    { type: "boolean", description: "Only today's meetings" },
          limit:    { type: "number", description: "Max results (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description: "Full pipeline stats: stage counts, temperature breakdown, total pipeline value, won revenue, stale deal count, avg AI score. Use for summary or forecast questions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics_summary",
      description: "Comprehensive analytics: revenue trends, conversion rates, employee performance, lead sources, monthly breakdown. Use for analytics questions, reports, or KPIs.",
      parameters: {
        type: "object",
        properties: {
          period_months: { type: "number", description: "Number of months to include (default 6, max 12)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_crm",
      description: "Global search across ALL CRM modules simultaneously: leads, prospects, deals, meetings, and activities. Use when the user searches for a company, person, or topic without specifying a module.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term (company name, contact name, keyword)" },
          limit: { type: "number", description: "Max results per module (default 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_recommendations",
      description: "Generate AI recommendations: top priority leads to call today, deals at risk, employees with low activity, best follow-up targets, pipeline health score. Use for 'what should I do today?' or 'best next action' questions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_release_notes",
      description: "Return CCENTRIK CRM version history, release notes, new features, and bug fixes. Use when user asks 'what's new', 'latest updates', 'version history', or 'upcoming features'.",
      parameters: {
        type: "object",
        properties: {
          version: { type: "string", description: "Specific version number (optional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_performance",
      description: "Team member performance summary: leads assigned, deals won, activities logged, conversion rates. Use for employee performance or team reports.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max team members to return (default 10)" },
        },
      },
    },
  },
];

// ── Tool executors ────────────────────────────────────────────────────────────
async function executeTool(name, args, profile) {
  const isManager = ["owner", "sales_head", "sales_manager"].includes(profile.role);
  const uid = profile.id;

  // ── get_leads ──────────────────────────────────────────────────────────────
  if (name === "get_leads") {
    let q = supabase
      .from("leads")
      .select("id, contact_name, company_name, stage, temperature, priority, follow_up_date, remarks, ai_score, source, phone, email")
      .order("created_at", { ascending: false })
      .limit(Math.min(args.limit || 20, 50));

    if (!isManager) q = q.eq("assigned_to", uid);
    if (args.temperature) q = q.eq("temperature", args.temperature);
    if (args.stage)       q = q.eq("stage", args.stage);
    if (args.search)      q = q.or(`contact_name.ilike.%${args.search}%,company_name.ilike.%${args.search}%`);
    if (args.follow_up_due) {
      const today = new Date().toISOString().slice(0, 10);
      const in3   = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      q = q.gte("follow_up_date", today).lte("follow_up_date", in3);
    }
    const { data, error } = await q;
    return error ? { error: error.message } : { leads: data || [], count: (data || []).length };
  }

  // ── get_prospects ──────────────────────────────────────────────────────────
  if (name === "get_prospects") {
    let q = supabase
      .from("prospects")
      .select("id, contact_name, company_name, status, source, phone, email, created_at, remarks")
      .order("created_at", { ascending: false })
      .limit(args.limit || 20);

    if (!isManager) q = q.eq("assigned_to", uid);
    if (args.status) q = q.eq("status", args.status);
    if (args.search) q = q.or(`contact_name.ilike.%${args.search}%,company_name.ilike.%${args.search}%`);
    const { data, error } = await q;
    return error ? { error: error.message } : { prospects: data || [], count: (data || []).length };
  }

  // ── get_deals ──────────────────────────────────────────────────────────────
  if (name === "get_deals") {
    let q = supabase
      .from("deals")
      .select("id, title, company_name, stage, value, close_date, updated_at, assigned_to")
      .order("updated_at", { ascending: false })
      .limit(args.limit || 20);

    if (!isManager) q = q.eq("assigned_to", uid);
    if (args.stage)  q = q.eq("stage", args.stage);
    if (args.search) q = q.or(`title.ilike.%${args.search}%,company_name.ilike.%${args.search}%`);
    if (args.stale_days) {
      const cutoff = new Date(Date.now() - args.stale_days * 86400000).toISOString();
      q = q.lt("updated_at", cutoff).not("stage", "in", '("won","lost")');
    }
    const { data, error } = await q;
    return error ? { error: error.message } : { deals: data || [], count: (data || []).length };
  }

  // ── get_tasks ──────────────────────────────────────────────────────────────
  if (name === "get_tasks") {
    let q = supabase
      .from("tasks")
      .select("id, title, status, priority, due_date")
      .not("status", "in", '("done","cancelled")')
      .order("due_date", { ascending: true })
      .limit(args.limit || 15);

    if (args.priority)    q = q.eq("priority", args.priority);
    if (args.overdue_only) q = q.lt("due_date", new Date().toISOString().slice(0, 10));
    const { data, error } = await q;
    return error ? { error: error.message } : { tasks: data || [], count: (data || []).length };
  }

  // ── get_activities ──────────────────────────────────────────────────────────
  if (name === "get_activities") {
    let q = supabase
      .from("activities")
      .select("id, type, title, note, created_at")
      .order("created_at", { ascending: false })
      .limit(args.limit || 10);

    if (args.type) q = q.eq("type", args.type);
    const { data, error } = await q;
    return error ? { error: error.message } : { activities: data || [], count: (data || []).length };
  }

  // ── get_meetings ────────────────────────────────────────────────────────────
  if (name === "get_meetings") {
    let q = supabase
      .from("meetings")
      .select("id, title, company_name, contact_name, scheduled_at, status, location, notes")
      .order("scheduled_at", { ascending: true })
      .limit(args.limit || 10);

    if (!isManager) q = q.eq("created_by", uid);
    if (args.status) q = q.eq("status", args.status);
    if (args.upcoming) q = q.gte("scheduled_at", new Date().toISOString());
    if (args.today) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end   = new Date(); end.setHours(23, 59, 59, 999);
      q = q.gte("scheduled_at", start.toISOString()).lte("scheduled_at", end.toISOString());
    }
    const { data, error } = await q;
    return error ? { error: error.message } : { meetings: data || [], count: (data || []).length };
  }

  // ── get_pipeline_summary ────────────────────────────────────────────────────
  if (name === "get_pipeline_summary") {
    const [lr, dr] = await Promise.all([
      supabase.from("leads").select("stage, temperature, ai_score"),
      supabase.from("deals").select("stage, value, updated_at"),
    ]);
    const leads = lr.data || [];
    const deals = dr.data || [];
    const open  = deals.filter((d) => !["won", "lost"].includes(d.stage));
    const won   = deals.filter((d) => d.stage === "won");
    const stale = open.filter((d) => d.updated_at < new Date(Date.now() - 7 * 86400000).toISOString());
    return {
      totalLeads:    leads.length,
      stageCounts:   leads.reduce((a, l) => { a[l.stage] = (a[l.stage] || 0) + 1; return a; }, {}),
      tempCounts:    leads.reduce((a, l) => { a[l.temperature] = (a[l.temperature] || 0) + 1; return a; }, {}),
      avgAiScore:    leads.length ? Math.round(leads.reduce((s, l) => s + (l.ai_score || 0), 0) / leads.length) : 0,
      openDeals:     open.length,
      pipelineValue: open.reduce((s, d) => s + (Number(d.value) || 0), 0),
      wonRevenue:    won.reduce((s, d) => s + (Number(d.value) || 0), 0),
      staleDeals:    stale.length,
    };
  }

  // ── get_analytics_summary ───────────────────────────────────────────────────
  if (name === "get_analytics_summary") {
    const months = Math.min(args.period_months || 6, 12);
    const since  = new Date(Date.now() - months * 30 * 86400000).toISOString();
    const [lr, dr, ar, pr] = await Promise.all([
      supabase.from("leads").select("stage, temperature, source, ai_score, created_at, assigned_to"),
      supabase.from("deals").select("stage, value, created_at, assigned_to"),
      supabase.from("activities").select("type, created_by, created_at").gte("created_at", since),
      supabase.from("profiles").select("id, full_name, role").eq("status", "active"),
    ]);
    const leads = lr.data || [];
    const deals = dr.data || [];
    const acts  = ar.data || [];
    const profs = pr.data || [];

    const won  = deals.filter(d => d.stage === "won");
    const open = deals.filter(d => !["won","lost"].includes(d.stage));

    const bySource = leads.reduce((a,l) => { if(l.source) a[l.source]=(a[l.source]||0)+1; return a; }, {});
    const topSource = Object.entries(bySource).sort((a,b)=>b[1]-a[1])[0];

    const salesTeam = profs.filter(p => ["employee","sales_manager","inside_sales"].includes(p.role));
    const teamPerf = salesTeam.map(p => {
      const myLeads = leads.filter(l=>l.assigned_to===p.id);
      const myWon   = deals.filter(d=>d.assigned_to===p.id&&d.stage==="won");
      const myActs  = acts.filter(a=>a.created_by===p.id);
      return { name:p.full_name, leads:myLeads.length, won:myWon.length, revenue:myWon.reduce((s,d)=>s+(Number(d.value)||0),0), activities:myActs.length };
    }).sort((a,b)=>b.revenue-a.revenue);

    return {
      period: `Last ${months} months`,
      totalLeads: leads.length,
      hotLeads: leads.filter(l=>l.temperature==="hot").length,
      warmLeads: leads.filter(l=>l.temperature==="warm").length,
      coldLeads: leads.filter(l=>l.temperature==="cold").length,
      totalDeals: deals.length,
      openDeals: open.length,
      wonDeals: won.length,
      lostDeals: deals.filter(d=>d.stage==="lost").length,
      wonRevenue: won.reduce((s,d)=>s+(Number(d.value)||0),0),
      pipelineValue: open.reduce((s,d)=>s+(Number(d.value)||0),0),
      conversionRate: leads.length>0?((won.length/leads.length)*100).toFixed(1)+"%" : "0%",
      avgAiScore: leads.length?Math.round(leads.reduce((s,l)=>s+(l.ai_score||0),0)/leads.length):0,
      topLeadSource: topSource?`${topSource[0]} (${topSource[1]} leads)`:"N/A",
      leadsBySource: bySource,
      topPerformers: teamPerf.slice(0,5),
      totalActivities: acts.length,
      activityBreakdown: acts.reduce((a,x)=>{a[x.type]=(a[x.type]||0)+1;return a;},{}),
    };
  }

  // ── search_crm ──────────────────────────────────────────────────────────────
  if (name === "search_crm") {
    const q    = args.query || "";
    const lim  = args.limit || 5;
    const like = `%${q}%`;

    const [lr, pr, dr, mr] = await Promise.all([
      supabase.from("leads").select("id,contact_name,company_name,stage,temperature").or(`contact_name.ilike.${like},company_name.ilike.${like}`).limit(lim),
      supabase.from("prospects").select("id,contact_name,company_name,status").or(`contact_name.ilike.${like},company_name.ilike.${like}`).limit(lim),
      supabase.from("deals").select("id,title,company_name,stage,value").or(`title.ilike.${like},company_name.ilike.${like}`).limit(lim),
      supabase.from("meetings").select("id,title,company_name,contact_name,scheduled_at,status").or(`title.ilike.${like},company_name.ilike.${like},contact_name.ilike.${like}`).limit(lim),
    ]);

    const results = {
      query: q,
      leads:     lr.data || [],
      prospects: pr.data || [],
      deals:     dr.data || [],
      meetings:  mr.data || [],
      totalFound: (lr.data?.length||0)+(pr.data?.length||0)+(dr.data?.length||0)+(mr.data?.length||0),
    };
    return results;
  }

  // ── get_ai_recommendations ──────────────────────────────────────────────────
  if (name === "get_ai_recommendations") {
    const today = new Date().toISOString().slice(0,10);
    const [hotR, overdueR, staleR, meetR] = await Promise.all([
      supabase.from("leads").select("id,contact_name,company_name,temperature,stage,follow_up_date,ai_score").eq("temperature","hot").order("ai_score",{ascending:false}).limit(5),
      supabase.from("leads").select("id,contact_name,company_name,follow_up_date,stage").lt("follow_up_date",today).not("stage","in",'("won","lost","converted","pipeline")').limit(5),
      supabase.from("deals").select("id,title,company_name,stage,value,updated_at").not("stage","in",'("won","lost")').lt("updated_at",new Date(Date.now()-7*86400000).toISOString()).limit(5),
      supabase.from("meetings").select("id,title,company_name,scheduled_at").eq("status","scheduled").gte("scheduled_at",new Date().toISOString()).order("scheduled_at",{ascending:true}).limit(3),
    ]);
    return {
      priorityLeads:    hotR.data || [],
      overdueFollowUps: overdueR.data || [],
      staleDeals:       staleR.data || [],
      upcomingMeetings: meetR.data || [],
      recommendations: [
        hotR.data?.length   ? `Call ${hotR.data.length} hot lead(s) today — highest conversion probability` : null,
        overdueR.data?.length ? `${overdueR.data.length} follow-up(s) are overdue — action needed immediately` : null,
        staleR.data?.length ? `${staleR.data.length} deal(s) haven't been updated in 7+ days — re-engage now` : null,
        meetR.data?.length  ? `${meetR.data.length} meeting(s) coming up — prepare talking points` : null,
      ].filter(Boolean),
    };
  }

  // ── get_release_notes ───────────────────────────────────────────────────────
  if (name === "get_release_notes") {
    if (args.version) {
      const note = RELEASE_NOTES.find(n => n.version === args.version);
      return note || { error: `Version ${args.version} not found` };
    }
    return { releaseNotes: RELEASE_NOTES, latestVersion: RELEASE_NOTES[0].version };
  }

  // ── get_team_performance ────────────────────────────────────────────────────
  if (name === "get_team_performance") {
    const [pr, lr, dr, ar] = await Promise.all([
      supabase.from("profiles").select("id,full_name,role,avatar_url").eq("status","active").in("role",["employee","sales_manager","inside_sales"]),
      supabase.from("leads").select("assigned_to,stage,ai_score"),
      supabase.from("deals").select("assigned_to,stage,value"),
      supabase.from("activities").select("created_by,type").gte("created_at",new Date(Date.now()-30*86400000).toISOString()),
    ]);
    const profs = (pr.data||[]).slice(0, args.limit||10);
    const perf  = profs.map(p => {
      const myL   = (lr.data||[]).filter(l=>l.assigned_to===p.id);
      const myWon = (dr.data||[]).filter(d=>d.assigned_to===p.id&&d.stage==="won");
      const myA   = (ar.data||[]).filter(a=>a.created_by===p.id);
      return {
        name:       p.full_name,
        role:       p.role,
        leads:      myL.length,
        won:        myWon.length,
        revenue:    myWon.reduce((s,d)=>s+(Number(d.value)||0),0),
        activities: myA.length,
        avgScore:   myL.length?Math.round(myL.reduce((s,l)=>s+(l.ai_score||0),0)/myL.length):0,
        conversion: myL.length>0?((myWon.length/myL.length)*100).toFixed(1)+"%":"0%",
      };
    }).sort((a,b)=>b.revenue-a.revenue);
    return { team: perf, count: perf.length };
  }

  return { error: `Unknown tool: ${name}` };
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(profile, pageContext, docContext) {
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const roleLabel = profile.role === "owner" ? "Super Admin" : (profile.role || "").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());

  const isAIModule = pageContext?.module === "Ccentrik AI";
  const pageSection = pageContext && !isAIModule
    ? `
━━━ CURRENT PAGE CONTEXT ━━━
• Module: ${pageContext.module}
• Page: ${pageContext.page || ""}
• Path: ${pageContext.path || ""}

The user has the **${pageContext.module}** page open right now. When they say "here", "this page", "current records", or similar — they mean ${pageContext.module}. Prioritize ${pageContext.module}-related tools and responses.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  const aiModeSection = isAIModule
    ? `
━━━ CCENTRIK AI MODE ━━━
Mode: ${pageContext.mode || "CRM Assistant"}
${pageContext.modeHint || "Help the user with their CRM."}
Response Language: Always respond in ${pageContext.language || "English"}.
━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  return `You are CCENTRIK AI — the intelligent enterprise AI agent inside CCENTRIK CRM, built for the Indian sales market.

USER: ${profile.full_name} | Role: ${roleLabel} | ${date}
${pageSection}${aiModeSection}

YOU ARE A LIVE AGENT with real-time access to ALL CRM data. ALWAYS call the appropriate tool(s) before answering data questions — never guess or make up numbers.

AVAILABLE TOOLS:
• get_leads — leads with temperature, stage, follow-up filters
• get_prospects — prospects pipeline
• get_deals — deals with stage, staleness filters
• get_tasks — pending/overdue tasks
• get_activities — sales activities (calls, emails, demos)
• get_meetings — scheduled meetings
• get_pipeline_summary — full pipeline stats and KPIs
• get_analytics_summary — comprehensive analytics & trends
• search_crm — global search across ALL modules at once
• get_ai_recommendations — smart next-action recommendations
• get_release_notes — version history and what's new
• get_team_performance — team member performance metrics

AGENT BEHAVIOR:
- Chain multiple tools when needed (e.g., get_pipeline_summary + get_ai_recommendations for a morning briefing)
- After gathering data, synthesize insights and give sharp, actionable recommendations
- Address user by first name occasionally (not every message)
- Use **bold** for company names and key numbers. Bullet points for lists.
- Indian number format: ₹, Lakh, Crore (₹1,00,000 = ₹1 Lakh; ₹1,00,00,000 = ₹1 Crore)
- Always end with one clear recommended next action
- If user writes in Hindi or Hinglish, respond in that language
- Respect role permissions: employees see only their own data, managers see team data
- Role "owner" is referred to as "Super Admin" in user-facing text

CONTENT GENERATION (Email, Proposals, Scripts, Posts):
- Write compelling, professional content tailored to the Indian B2B market
- Support tones: Professional, Friendly, Formal, Casual, Persuasive
- For cold emails: hook → pain point → solution → CTA (under 150 words)
- For proposals: executive summary → problem → solution → pricing → next steps
- For WhatsApp: short, casual, include emoji sparingly

CRM RECORD SUMMARIES:
When summarizing a lead, deal, or meeting — always include:
1. Current status and stage
2. Timeline of recent activity
3. Risks or blockers
4. Recommended next action
5. Opportunity score (if available)

MEETING PREPARATION:
When asked to prepare for a meeting, use get_meetings + get_leads to gather:
- Company/contact background
- Previous interactions
- Open deals or opportunities
- Suggested talking points
- Risk areas to address

PROPOSING WRITE ACTIONS (require user approval before executing):
Include at the END of response when the user asks to CREATE, UPDATE, ASSIGN, or SCHEDULE something:

Valid lead sources: website, linkedin, referral, cold_call, email_campaign, event, partner, social_media, ads, walk_in, other

<action>
{"type":"create_lead","description":"Add new lead for [Company]","data":{"company_name":"...","contact_name":"...","phone":"...","email":"...","source":"other","temperature":"warm"}}
</action>
<action>
{"type":"create_prospect","description":"Add new prospect [Company]","data":{"company_name":"...","contact_name":"...","phone":"...","email":"...","source":"other"}}
</action>
<action>
{"type":"create_activity","description":"Log a call with [Contact]","data":{"type":"call","title":"...","note":"...","lead_id":"..."}}
</action>
<action>
{"type":"create_task","description":"Create task: [Title]","data":{"title":"...","priority":"medium","due_date":"YYYY-MM-DD"}}
</action>
<action>
{"type":"assign_lead","description":"Assign lead [Lead ID] to [Name]","data":{"lead_id":"...","assignee_name":"..."}}
</action>
<action>
{"type":"schedule_meeting","description":"Schedule meeting with [Company]","data":{"title":"...","company_name":"...","contact_name":"...","scheduled_at":"YYYY-MM-DDTHH:MM:SS","notes":"..."}}
</action>
<action>
{"type":"update_lead_stage","description":"Move lead [Name] to [Stage]","data":{"lead_id":"...","stage":"...","note":"..."}}
</action>
<action>
{"type":"convert_lead","description":"Convert lead [Name] to deal","data":{"lead_id":"...","deal_value":"...","deal_stage":"proposal"}}
</action>

Always confirm with the user by including the action block — never execute writes silently.${docContext ? `

━━━ PROJECT DOCUMENT KNOWLEDGE BASE ━━━
The following content is extracted from uploaded project documents. Use this as PRIMARY source of truth for project-specific questions.

${docContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ""}`;
}

// POST /api/ai/chat
router.post("/chat", authenticate, async (req, res) => {
  const { message, pageContext } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Groq API key not configured." });

  const userId = req.profile.id;
  if (!conversationHistory[userId]) conversationHistory[userId] = [];

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (typeof res.flush === "function") res.flush();
  };

  try {
    const groq = new Groq({ apiKey });

    const docContext = await searchDocuments(message);

    const messages = [
      { role: "system", content: buildSystemPrompt(req.profile, pageContext || null, docContext) },
      ...conversationHistory[userId].slice(-10),
      { role: "user", content: message },
    ];

    // ── Agent loop ─────────────────────────────────────────────────────────────
    let finalContent = "";
    let toolsUsed    = [];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await groq.chat.completions.create({
        model:       GROQ_MODEL,
        messages,
        tools:       CRM_TOOLS,
        tool_choice: "auto",
        temperature: 0.35,
        max_tokens:  2048,
      });

      const choice = response.choices[0];

      if (choice.finish_reason === "tool_calls") {
        const toolCalls = choice.message.tool_calls;
        messages.push(choice.message);

        for (const tc of toolCalls) {
          const toolName = tc.function.name;
          if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);
          send({ type: "tool", name: toolName });
        }

        const results = await Promise.all(
          toolCalls.map(async (tc) => {
            const args   = JSON.parse(tc.function.arguments || "{}") || {};
            const result = await executeTool(tc.function.name, args, req.profile);
            return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) };
          })
        );

        messages.push(...results);
        continue;
      }

      finalContent = choice.message.content || "";
      break;
    }

    if (!finalContent) finalContent = "I couldn't complete the analysis. Please try again.";

    // Stream final answer word by word for smooth UX
    const chunks = finalContent.match(/\S+\s*/g) || [finalContent];
    for (const chunk of chunks) {
      send({ type: "token", content: chunk });
    }

    // Persist conversation (keep last 20 exchanges)
    conversationHistory[userId].push({ role: "user",      content: message });
    conversationHistory[userId].push({ role: "assistant", content: finalContent });
    if (conversationHistory[userId].length > 20) {
      conversationHistory[userId] = conversationHistory[userId].slice(-20);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("CCENTRIK AI agent error:", err.message);
    const userMsg = /rate.limit|429|quota/i.test(err.message)
      ? "Rate limit reached. Please wait a moment and try again."
      : err.message;
    send({ type: "error", message: userMsg });
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// POST /api/ai/clear-history
router.post("/clear-history", authenticate, (req, res) => {
  const userId = req.profile.id;
  if (conversationHistory[userId]) {
    conversationHistory[userId] = [];
  }
  res.json({ success: true });
});

module.exports = router;
