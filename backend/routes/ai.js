const express = require("express");
const router  = express.Router();
const Groq    = require("groq-sdk");
const { supabase }    = require("../config/db");
const { authenticate } = require("../middleware/auth");

const GROQ_MODEL = "llama-3.3-70b-versatile";

const conversationHistory = {};

async function getCRMContext(profile) {
  const { role, id: profileId } = profile;
  const isManager = ["owner", "sales_head", "sales_manager"].includes(role);

  const leadsQ = supabase
    .from("leads")
    .select("id, contact_name, company_name, stage, temperature, priority, follow_up_date, remarks, assigned_to, ai_score")
    .order("created_at", { ascending: false })
    .limit(50);

  const dealsQ = supabase
    .from("deals")
    .select("id, title, stage, value, close_date, assigned_to")
    .order("created_at", { ascending: false })
    .limit(20);

  const tasksQ = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date")
    .eq("status", "todo")
    .limit(20);

  if (!isManager) {
    leadsQ.eq("assigned_to", profileId);
    dealsQ.eq("assigned_to", profileId);
  }

  const [leads, deals, tasks] = await Promise.all([leadsQ, dealsQ, tasksQ]);

  const leadsData = leads.data || [];
  const dealsData = deals.data || [];
  const tasksData = tasks.data || [];

  const stageCounts = leadsData.reduce((acc, l) => { acc[l.stage] = (acc[l.stage] || 0) + 1; return acc; }, {});
  const tempCounts  = leadsData.reduce((acc, l) => { acc[l.temperature] = (acc[l.temperature] || 0) + 1; return acc; }, {});
  const hotLeads    = leadsData.filter((l) => l.temperature === "hot");
  const followUps   = leadsData.filter((l) => l.follow_up_date && new Date(l.follow_up_date) <= new Date(Date.now() + 86400000 * 2));

  return `
CRM SNAPSHOT (${new Date().toLocaleDateString("en-IN")}) — User: ${profile.full_name} [${role}]
Total leads: ${leadsData.length} | Stages: ${JSON.stringify(stageCounts)} | Temp: ${JSON.stringify(tempCounts)}

HOT LEADS (${hotLeads.length}):
${hotLeads.map((l) => `- ${l.contact_name}${l.company_name ? ` @ ${l.company_name}` : ""}: ${l.remarks || "no remarks"} [score:${l.ai_score}]`).join("\n") || "None"}

UPCOMING FOLLOW-UPS (next 48h):
${followUps.map((l) => `- ${l.contact_name} on ${new Date(l.follow_up_date).toLocaleDateString("en-IN")}`).join("\n") || "None"}

OPEN DEALS (${dealsData.filter((d) => !["won","lost"].includes(d.stage)).length}):
${dealsData.filter((d) => !["won","lost"].includes(d.stage)).map((d) => `- ${d.title} | ${d.stage} | ₹${Number(d.value || 0).toLocaleString("en-IN")}`).join("\n") || "None"}

PENDING TASKS (${tasksData.length}):
${tasksData.map((t) => `- ${t.title} | ${t.priority} priority | due: ${t.due_date ? new Date(t.due_date).toLocaleDateString("en-IN") : "no date"}`).join("\n") || "None"}
`.trim();
}

async function executeAction(action, profile) {
  const { type, payload } = action;

  if (type === "create_lead") {
    const { budget, source, ...rest } = payload;
    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true });
    const lead_code = `LEAD-${String((count || 0) + 1).padStart(5, "0")}`;
    const ai_score = (() => {
      let s = 40;
      if (budget > 100000) s += 30; else if (budget > 50000) s += 20; else if (budget > 10000) s += 10;
      if (source === "referral") s += 25; else if (source === "website") s += 10;
      return Math.min(s, 100);
    })();
    const { data, error } = await supabase.from("leads")
      .insert({ ...rest, budget: Number(budget) || 0, source, ai_score, lead_code, assigned_to: rest.assigned_to || profile.id, created_by: profile.id })
      .select().single();
    return error ? { error: error.message } : { created: "lead", data };
  }

  if (type === "create_activity") {
    const { data, error } = await supabase.from("activities")
      .insert({ ...payload, created_by: profile.id })
      .select().single();
    return error ? { error: error.message } : { created: "activity", data };
  }

  if (type === "update_lead_status") {
    const { lead_id, stage, temperature } = payload;
    const updates = {};
    if (stage)       updates.stage       = stage;
    if (temperature) updates.temperature = temperature;
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("leads").update(updates).eq("id", lead_id).select().single();
    return error ? { error: error.message } : { updated: "lead", data };
  }

  return { error: `Unknown action type: ${type}` };
}

function buildSystemPrompt(profile, crmContext) {
  return `You are ARIA — the AI Executive Assistant embedded in Ccentrik CRM, an enterprise sales platform used by the Indian sales team.

IDENTITY:
- Full name: ARIA (AI Revenue Intelligence Assistant)
- Powered by Llama 3.3-70B via Groq
- You are a highly trained executive assistant and sales strategist, not a chatbot
- Personality: Professional, warm, intelligent, direct, action-oriented — like a trusted senior business partner

USER CONTEXT:
- Name: ${profile.full_name}
- Role: ${profile.role}
- Date: ${new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

HOW TO COMMUNICATE:
- Address user by first name naturally — not every message, but enough to feel personal
- Be concise and direct. Sales professionals are busy.
- Use bullet points for lists. **Bold** company names and key numbers.
- Always close with a clear recommended next action
- Indian number format: ₹, Lakh, Crore
- If user writes in Hindi or Hinglish, respond in the same language naturally

WHEN PROPOSING CRM ACTIONS:
If the user explicitly asks to CREATE a lead, LOG an activity, or UPDATE a lead status — include a JSON action block at the end of your response:
\`\`\`action
{"type":"create_lead","payload":{"contact_name":"...","company_name":"...","stage":"new","temperature":"warm","priority":"medium","source":"manual","budget":0}}
\`\`\`
or
\`\`\`action
{"type":"create_activity","payload":{"type":"call","note":"...","lead_id":"<uuid or omit>"}}
\`\`\`
or
\`\`\`action
{"type":"update_lead_status","payload":{"lead_id":"<uuid>","stage":"...","temperature":"..."}}
\`\`\`

CRITICAL RULES:
- NEVER make up CRM data. Only reference the snapshot below.
- If you don't have data for something, say so honestly.
- Be proactive: if you spot a risk or opportunity in the data, mention it.
- Sound like you genuinely care about the user's success.

LIVE CRM DATA:
${crmContext}`;
}

// POST /api/ai/chat
router.post("/chat", authenticate, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your-groq-api-key-here") {
    return res.status(503).json({ error: "Groq API key not configured. Add GROQ_API_KEY to backend environment." });
  }

  const userId = req.profile.id;
  if (!conversationHistory[userId]) conversationHistory[userId] = [];

  try {
    const crmContext  = await getCRMContext(req.profile);
    const systemPrompt = buildSystemPrompt(req.profile, crmContext);

    conversationHistory[userId].push({ role: "user", content: message });
    if (conversationHistory[userId].length > 12) {
      conversationHistory[userId] = conversationHistory[userId].slice(-12);
    }

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory[userId],
      ],
      temperature: 0.6,
      max_tokens: 1024,
    });

    let reply = completion.choices[0]?.message?.content || "";
    let actionResult = null;

    const actionMatch = reply.match(/```action\s*([\s\S]*?)```/);
    if (actionMatch) {
      try {
        const action = JSON.parse(actionMatch[1].trim());
        actionResult = await executeAction(action, req.profile);
        reply = reply.replace(/```action[\s\S]*?```/, "").trim();
      } catch { /* malformed action block — ignore */ }
    }

    conversationHistory[userId].push({ role: "assistant", content: reply });

    res.json({ reply, model: GROQ_MODEL, action: actionResult });
  } catch (err) {
    console.error("Groq AI error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
