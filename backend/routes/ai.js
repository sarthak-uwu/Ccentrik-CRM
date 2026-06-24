const express = require("express");
const router  = express.Router();
const Groq    = require("groq-sdk");
const { supabase }     = require("../config/db");
const { authenticate } = require("../middleware/auth");

const GROQ_MODEL      = "llama-3.3-70b-versatile";
const MAX_ITERATIONS  = 6;

// Per-user conversation history (in-memory; resets on cold start)
const conversationHistory = {};

// ── Tool definitions ──────────────────────────────────────────────────────────
const CRM_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_leads",
      description: "Query live leads from the CRM. Use whenever the user asks about leads, hot leads, follow-ups, pipeline contacts, or specific companies.",
      parameters: {
        type: "object",
        properties: {
          temperature: { type: "string", enum: ["hot", "warm", "cold"], description: "Filter by temperature" },
          stage:       { type: "string", description: "Filter by stage: new, contacted, qualified, proposal, negotiation, won, lost" },
          follow_up_due: { type: "boolean", description: "Only leads with follow-up due in next 3 days" },
          limit:       { type: "number", description: "Max results (default 20, max 50)" },
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
          stage:      { type: "string", description: "Filter by stage" },
          stale_days: { type: "number", description: "Only deals not updated in N days" },
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
          limit:        { type: "number", description: "Max results (default 15)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_activities",
      description: "Get recent sales activities — calls, emails, meetings, demos.",
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
      name: "get_pipeline_summary",
      description: "Full pipeline stats: stage counts, temperature breakdown, total pipeline value, won revenue, stale deal count, avg AI score. Use for summary or forecast questions.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ── Tool executors ────────────────────────────────────────────────────────────
async function executeTool(name, args, profile) {
  const isManager = ["owner", "sales_head", "sales_manager"].includes(profile.role);
  const uid = profile.id;

  if (name === "get_leads") {
    let q = supabase
      .from("leads")
      .select("id, contact_name, company_name, stage, temperature, priority, follow_up_date, remarks, ai_score, source")
      .order("created_at", { ascending: false })
      .limit(Math.min(args.limit || 20, 50));

    if (!isManager) q = q.eq("assigned_to", uid);
    if (args.temperature) q = q.eq("temperature", args.temperature);
    if (args.stage)       q = q.eq("stage", args.stage);
    if (args.follow_up_due) {
      const today = new Date().toISOString().slice(0, 10);
      const in3   = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      q = q.gte("follow_up_date", today).lte("follow_up_date", in3);
    }
    const { data, error } = await q;
    return error ? { error: error.message } : { leads: data || [], count: (data || []).length };
  }

  if (name === "get_deals") {
    let q = supabase
      .from("deals")
      .select("id, title, company_name, stage, value, close_date, updated_at")
      .order("updated_at", { ascending: false })
      .limit(args.limit || 20);

    if (!isManager) q = q.eq("assigned_to", uid);
    if (args.stage) q = q.eq("stage", args.stage);
    if (args.stale_days) {
      const cutoff = new Date(Date.now() - args.stale_days * 86400000).toISOString();
      q = q.lt("updated_at", cutoff).not("stage", "in", '("won","lost")');
    }
    const { data, error } = await q;
    return error ? { error: error.message } : { deals: data || [], count: (data || []).length };
  }

  if (name === "get_tasks") {
    let q = supabase
      .from("tasks")
      .select("id, title, status, priority, due_date")
      .not("status", "in", '("done","cancelled")')
      .order("due_date", { ascending: true })
      .limit(args.limit || 15);

    if (args.overdue_only) q = q.lt("due_date", new Date().toISOString().slice(0, 10));
    const { data, error } = await q;
    return error ? { error: error.message } : { tasks: data || [], count: (data || []).length };
  }

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

  return { error: `Unknown tool: ${name}` };
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(profile, pageContext) {
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const pageSection = pageContext
    ? `
━━━ CURRENT PAGE CONTEXT ━━━
• Module: ${pageContext.module}
• Page: ${pageContext.page}
• Path: ${pageContext.path}

The user has the **${pageContext.module}** page open right now. When they say "here", "this page", "current records", or similar — they mean ${pageContext.module}. Prioritize ${pageContext.module}-related tools and responses. Be specific and actionable for this module.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : "";

  return `You are ARIA (AI Revenue Intelligence Assistant) — the AI agent inside Ccentrik CRM, built for the Indian sales market.

USER: ${profile.full_name} | Role: ${profile.role} | ${date}
${pageSection}

YOU ARE A LIVE AGENT. You have real-time tools to query the CRM database. ALWAYS call tools to get fresh data before answering any question — never guess or make up numbers.

AGENT BEHAVIOR:
- Read the user's full instruction carefully before responding
- Chain multiple tool calls if needed (e.g., get_pipeline_summary + get_leads for a full overview)
- After gathering data, synthesize insights and give sharp, actionable recommendations
- Address user by first name occasionally (not every message)
- Use **bold** for company names and key numbers. Bullet points for lists.
- Indian number format: ₹, Lakh, Crore
- Always end with one clear recommended next action
- If user writes in Hindi or Hinglish, respond in the same language
- Follow the user's instructions step by step — do not skip steps or hallucinate
- Respect role permissions: employees see only their own data, managers see team data

PROPOSING WRITE ACTIONS (require user approval before executing):
If user asks to CREATE a lead, ASSIGN a lead, LOG an activity, or CREATE a task — include at the END of response:
<action>
{"type":"create_lead","description":"Add new lead for [Company]","data":{"company_name":"...","contact_name":"...","phone":"...","email":"...","source":"manual","temperature":"warm"}}
</action>
or
<action>
{"type":"create_activity","description":"Log a call with [Contact]","data":{"type":"call","title":"...","note":"...","lead_id":"..."}}
</action>
or
<action>
{"type":"create_task","description":"Create task: [Title]","data":{"title":"...","priority":"medium","due_date":"YYYY-MM-DD"}}
</action>
or
<action>
{"type":"assign_lead","description":"Assign lead [Lead ID] to [Name]","data":{"lead_id":"...","assignee_name":"..."}}
</action>

Always confirm with the user by including the action block — never execute writes silently.`;
}

// POST /api/ai/chat
router.post("/chat", authenticate, async (req, res) => {
  const { message, pageContext } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your-groq-api-key-here") {
    return res.status(503).json({ error: "Groq API key not configured." });
  }

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

    const messages = [
      { role: "system", content: buildSystemPrompt(req.profile, pageContext || null) },
      ...conversationHistory[userId].slice(-12),
      { role: "user", content: message },
    ];

    // ── Agent loop ─────────────────────────────────────────────────────────────
    let finalContent = "";

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages,
        tools: CRM_TOOLS,
        tool_choice: "auto",
        temperature: 0.35,
        max_tokens: 2048,
      });

      const choice = response.choices[0];

      if (choice.finish_reason === "tool_calls") {
        const toolCalls = choice.message.tool_calls;
        messages.push(choice.message);

        for (const tc of toolCalls) {
          send({ type: "tool", name: tc.function.name });
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

    // Stream final answer word by word for a smooth UX
    const chunks = finalContent.match(/\S+\s*/g) || [finalContent];
    for (const chunk of chunks) {
      send({ type: "token", content: chunk });
    }

    // Persist conversation
    conversationHistory[userId].push({ role: "user", content: message });
    conversationHistory[userId].push({ role: "assistant", content: finalContent });
    if (conversationHistory[userId].length > 20) {
      conversationHistory[userId] = conversationHistory[userId].slice(-20);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("ARIA agent error:", err.message);
    const userMsg = /rate.limit|429|quota/i.test(err.message)
      ? "Rate limit reached. Please wait a moment and try again."
      : err.message;
    send({ type: "error", message: userMsg });
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

module.exports = router;
