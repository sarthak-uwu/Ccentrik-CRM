const express = require("express");
const router = express.Router();
const axios = require("axios");
const { supabase } = require("../config/db");

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// Fetch a compact CRM snapshot for the AI context
async function getCRMContext() {
  const [leads, deals, tasks] = await Promise.all([
    supabase.from("leads").select("id, contact_name, company_name, stage, temperature, priority, follow_up_date, remarks, assigned_to").order("created_at", { ascending: false }).limit(50),
    supabase.from("deals").select("id, title, stage, value, expected_close_date").order("created_at", { ascending: false }).limit(20),
    supabase.from("tasks").select("id, title, status, priority, due_date").eq("status", "todo").limit(20),
  ]);

  const leadSummary = (leads.data || []).map((l) =>
    `${l.contact_name}${l.company_name ? ` (${l.company_name})` : ""} — ${l.stage} / ${l.temperature} / priority:${l.priority}`
  ).join("\n");

  const stageCounts = (leads.data || []).reduce((acc, l) => { acc[l.stage] = (acc[l.stage] || 0) + 1; return acc; }, {});
  const tempCounts = (leads.data || []).reduce((acc, l) => { acc[l.temperature] = (acc[l.temperature] || 0) + 1; return acc; }, {});
  const hotLeads = (leads.data || []).filter((l) => l.temperature === "hot");
  const followUps = (leads.data || []).filter((l) => l.follow_up_date && new Date(l.follow_up_date) <= new Date(Date.now() + 86400000 * 2));

  return `
CRM SNAPSHOT (${new Date().toLocaleDateString()}):
Total leads loaded: ${leads.data?.length || 0}
Stages: ${JSON.stringify(stageCounts)}
Temperature: ${JSON.stringify(tempCounts)}

HOT LEADS (${hotLeads.length}):
${hotLeads.map((l) => `- ${l.contact_name}${l.company_name ? ` @ ${l.company_name}` : ""}: ${l.remarks || "no remarks"}`).join("\n") || "None"}

UPCOMING FOLLOW-UPS (next 48h):
${followUps.map((l) => `- ${l.contact_name} on ${new Date(l.follow_up_date).toLocaleDateString()}`).join("\n") || "None"}

OPEN DEALS (${deals.data?.length || 0}):
${(deals.data || []).map((d) => `- ${d.title} | ${d.stage} | ₹${Number(d.value || 0).toLocaleString()}`).join("\n") || "None"}

PENDING TASKS (${tasks.data?.length || 0}):
${(tasks.data || []).map((t) => `- ${t.title} | ${t.priority} priority | due: ${t.due_date ? new Date(t.due_date).toLocaleDateString() : "no date"}`).join("\n") || "None"}
`.trim();
}

// POST /api/ai/chat
router.post("/chat", async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your-groq-api-key-here") {
    return res.status(503).json({ error: "Groq API key not configured. Add GROQ_API_KEY to backend/.env" });
  }

  try {
    const crmContext = await getCRMContext();

    const systemPrompt = `You are an intelligent AI assistant for Ccentrik CRM — a sales CRM used by CCENTRIK Infotech Pvt Ltd.
You have access to live CRM data and help the sales team with:
- Summarizing leads, deals, and activities
- Answering questions about the team's pipeline
- Suggesting follow-up actions for hot/warm leads
- Helping draft emails or call scripts
- Providing sales coaching and best practices

Be concise, professional, and actionable. Use bullet points for lists. Format numbers with ₹ for Indian currency.

LIVE CRM DATA:
${crmContext}`;

    const response = await axios.post(
      GROQ_URL,
      {
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.slice(-10),
          { role: "user", content: message },
        ],
        max_tokens: 1024,
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply, model: MODEL });
  } catch (err) {
    console.error("Groq AI error:", err?.response?.data || err.message);
    const msg = err?.response?.data?.error?.message || err.message;
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
