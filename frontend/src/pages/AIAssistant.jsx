import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Send, RefreshCw, Trash2, Zap, Users, Clock, TrendingUp,
  Flame, AlertTriangle, Target, ChevronRight, Sparkles,
  XCircle, BarChart3, Mic, MicOff, Volume2, VolumeX,
  IndianRupee, BriefcaseBusiness, ArrowRight, Lightbulb, Activity,
  Calendar, FileText, Check, X, Loader2, CheckCircle2,
} from "lucide-react";
import { streamGrokResponse } from "../services/grokService";
import { useCurrency } from "../context/CurrencyContext";

// ── Language config ───────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en-IN", label: "EN", name: "English",  flag: "🇮🇳" },
  { code: "hi-IN", label: "HI", name: "Hindi",    flag: "🇮🇳" },
  { code: "hi-IN", label: "HN", name: "Hinglish", flag: "🇮🇳" },
  { code: "pa-IN", label: "PA", name: "Punjabi",  flag: "🇮🇳" },
  { code: "es-ES", label: "ES", name: "Spanish",  flag: "🇪🇸" },
  { code: "ar-SA", label: "AR", name: "Arabic",   flag: "🇸🇦" },
];

// ── Quick prompts ─────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { icon: Zap,         label: "Hot Leads",          prompt: "Show me all hot leads and what action I should take for each." },
  { icon: Clock,       label: "Today's Follow-ups", prompt: "What are my follow-ups due today or tomorrow? List them with contact details." },
  { icon: TrendingUp,  label: "Pipeline Summary",   prompt: "Give me a full pipeline summary — leads by stage, open deals, and top priorities." },
  { icon: Users,       label: "Team Performance",   prompt: "How is the team performing? Who has the most leads and highest conversion?" },
  { icon: Target,      label: "Deals at Risk",      prompt: "Which deals haven't been updated in over 7 days? What should I do?" },
  { icon: BarChart3,   label: "Monthly Forecast",   prompt: "Based on current pipeline, what's our revenue forecast for this month?" },
  { icon: Calendar,    label: "Schedule Meeting",   prompt: "Help me plan my week. Who should I prioritize meeting and what's the best approach?" },
  { icon: FileText,    label: "Weekly Report",      prompt: "Generate a concise weekly performance summary I can share with my team." },
];

const HINGLISH_PROMPTS = [
  { flag: "🇮🇳", text: "Pipeline summary batao",       prompt: "Pipeline ka full summary do — leads, deals aur priorities." },
  { flag: "🇮🇳", text: "Hot leads kaun se hain?",      prompt: "Aaj ke hot leads kaun kaun se hain aur kya action lena chahiye?" },
  { flag: "🇮🇳", text: "Revenue kitna increase hua?",  prompt: "Is month revenue kitna increase hua hai? Ek summary do." },
  { flag: "🇮🇳", text: "Follow-ups aaj ke kya hain?", prompt: "Aaj ke follow-ups list karo with contact details." },
  { flag: "🇮🇳", text: "Stale deals kaun se hain?",    prompt: "Kaunse deals zyada dino se update nahi hue? Kya karna chahiye?" },
];

// ── Thinking status messages ──────────────────────────────────────────────────
const THINKING_STATUSES = [
  "Reviewing CRM data...",
  "Analyzing opportunities...",
  "Checking lead activity...",
  "Preparing recommendations...",
  "Generating action plan...",
  "Cross-referencing pipeline...",
  "Identifying key insights...",
  "Ready for approval...",
];

// ── Dynamic greeting ──────────────────────────────────────────────────────────
function getDynamicGreeting(profile, insights) {
  const hour = new Date().getHours();
  const name = profile?.full_name?.split(" ")[0] || "there";
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const { hotLeads = [], overdueTasks = [], followupsDue = [], staleDeals = [] } = insights || {};

  const lines = [`${greeting}, ${name}. 👋`];
  const alerts = [];
  if (hotLeads.length > 0)    alerts.push(`**${hotLeads.length} hot lead${hotLeads.length > 1 ? "s" : ""}** ready for action`);
  if (followupsDue.length > 0) alerts.push(`**${followupsDue.length} follow-up${followupsDue.length > 1 ? "s" : ""}** due in the next 3 days`);
  if (staleDeals.length > 0)  alerts.push(`**${staleDeals.length} deal${staleDeals.length > 1 ? "s" : ""}** showing inactivity risk`);
  if (overdueTasks.length > 0) alerts.push(`**${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}** pending`);

  if (alerts.length > 0) {
    lines.push("Here's what needs your attention:");
    alerts.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  } else {
    lines.push("Your pipeline looks healthy — no urgent items right now. Great work!");
  }
  lines.push("What would you like to work on today?");
  return lines.join("\n");
}

// ── Fetch insights ────────────────────────────────────────────────────────────
async function fetchInsights() {
  const now     = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const in3days  = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const ago7days = new Date(now.getTime() - 7 * 86400000).toISOString();

  const [leadsRes, dealsRes, tasksRes] = await Promise.all([
    supabase.from("leads").select("id, company_name, contact_name, temperature, stage, follow_up_date, created_at"),
    supabase.from("deals").select("id, company_name, title, stage, value, updated_at, close_date"),
    supabase.from("tasks").select("id, title, status, due_date, assigned_to"),
  ]);

  const leads = leadsRes.data || [];
  const deals = dealsRes.data || [];
  const tasks = tasksRes.data || [];

  const hotLeads      = leads.filter((l) => l.temperature === "hot" && l.stage !== "won" && l.stage !== "lost");
  const followupsDue  = leads.filter((l) => { if (!l.follow_up_date) return false; const d = l.follow_up_date.slice(0, 10); return d >= todayStr && d <= in3days; });
  const staleDeals    = deals.filter((d) => !["won","lost"].includes(d.stage) && d.updated_at && d.updated_at < ago7days);
  const overdueTasks  = tasks.filter((t) => !["done","cancelled"].includes(t.status) && t.due_date && t.due_date < todayStr);
  const activeDeals   = deals.filter((d) => !["won","lost"].includes(d.stage));
  const pipelineValue = activeDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const wonRevenue    = deals.filter((d) => d.stage === "won").reduce((s, d) => s + (Number(d.value) || 0), 0);

  return { hotLeads, followupsDue, staleDeals, overdueTasks, activeDeals, pipelineValue, wonRevenue, leads, deals, tasks };
}

// ── Parse <action> blocks from AI response ────────────────────────────────────
function parseAction(text) {
  const match = text.match(/<action>([\s\S]*?)<\/action>/);
  if (!match) return { cleanText: text, action: null };
  try {
    const action = JSON.parse(match[1].trim());
    const cleanText = text.replace(/<action>[\s\S]*?<\/action>/g, "").trim();
    return { cleanText, action };
  } catch {
    return { cleanText: text, action: null };
  }
}

// ── Voice Bars ────────────────────────────────────────────────────────────────
function VoiceBars({ active, heights = [20, 32, 28, 36, 24, 30, 22] }) {
  return (
    <div className={`voice-bars${active ? "" : " idle"}`} style={{ height: 36 }}>
      {heights.map((h, i) => <div key={i} className={`voice-bar bar-${i + 1}`} style={{ height: h }} />)}
    </div>
  );
}

// ── AI Orb ────────────────────────────────────────────────────────────────────
function AIOrb({ state }) {
  const isListening = state === "listening";
  const isSpeaking  = state === "speaking";
  const isThinking  = state === "thinking";
  return (
    <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
      {(isSpeaking || isListening) && (
        <>
          <div className="speak-ring" style={{ inset: -8,  borderColor: isListening ? "rgba(239,68,68,0.5)"  : "rgba(99,102,241,0.5)" }} />
          <div className="speak-ring" style={{ inset: -16, borderColor: isListening ? "rgba(239,68,68,0.3)"  : "rgba(99,102,241,0.3)", animationDelay: "0.5s" }} />
        </>
      )}
      <motion.div
        style={{
          width: 72, height: 72, borderRadius: "50%",
          background: isListening ? "linear-gradient(135deg,#EF4444,#F97316)"
            : isSpeaking  ? "linear-gradient(135deg,#6366F1,#8B5CF6)"
            : isThinking  ? "linear-gradient(135deg,#4F46E5,#7C3AED)"
            : "linear-gradient(135deg,#1E293B,#334155)",
          border: "2px solid rgba(99,102,241,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: isListening ? "0 0 32px rgba(239,68,68,0.5),0 0 64px rgba(239,68,68,0.2)"
            : isSpeaking ? "0 0 32px rgba(99,102,241,0.5),0 0 64px rgba(99,102,241,0.2)"
            : isThinking  ? "0 0 24px rgba(124,58,237,0.5),0 0 48px rgba(124,58,237,0.2)"
            : "0 0 16px rgba(99,102,241,0.2)",
          transition: "background 0.4s, box-shadow 0.4s",
        }}
        animate={isSpeaking || isThinking ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={{ repeat: Infinity, duration: isThinking ? 1.2 : 0.8 }}
      >
        {isThinking ? (
          <div style={{ display: "flex", gap: 3 }}>
            {[0,1,2].map((i) => <div key={i} className="ai-thinking-dot" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        ) : (
          <Brain size={28} style={{ color: "#fff", opacity: 0.9 }} strokeWidth={1.5} />
        )}
      </motion.div>
    </div>
  );
}

// ── Action Approval Modal ─────────────────────────────────────────────────────
function ActionApprovalModal({ action, onApprove, onDismiss, loading }) {
  if (!action) return null;
  const TYPES = {
    create_task:     { icon: CheckCircle2, label: "Create Task",     color: "#10B981" },
    create_lead:     { icon: Users,        label: "Add Lead",         color: "#3B82F6" },
    create_activity: { icon: Activity,     label: "Log Activity",     color: "#8B5CF6" },
  };
  const meta = TYPES[action.type] || { icon: Sparkles, label: "Execute Action", color: "#6366F1" };
  const Icon = meta.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.97 }}
        style={{
          background: "var(--surface)", border: `1.5px solid ${meta.color}35`,
          borderRadius: 14, overflow: "hidden",
          boxShadow: `0 0 0 1px ${meta.color}18, 0 6px 24px rgba(0,0,0,0.14)`,
        }}
      >
        <div style={{ padding: "11px 16px", background: `${meta.color}0C`, borderBottom: `1px solid ${meta.color}22`, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `${meta.color}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={13} style={{ color: meta.color }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Proposed Action · {meta.label}</div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Review and approve before executing</div>
          </div>
        </div>
        <div style={{ padding: "10px 16px" }}>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>{action.description}</div>
          {action.data && (
            <div style={{ marginTop: 8, background: "var(--surface-2)", borderRadius: 8, padding: "8px 12px" }}>
              {Object.entries(action.data).map(([k, v]) => v ? (
                <div key={k} style={{ display: "flex", gap: 8, marginBottom: 2, fontSize: 11.5 }}>
                  <span style={{ color: "var(--text-muted)", textTransform: "capitalize", minWidth: 90 }}>{k.replace(/_/g, " ")}:</span>
                  <span style={{ color: "var(--text)", fontWeight: 500 }}>{String(v)}</span>
                </div>
              ) : null)}
            </div>
          )}
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onDismiss} className="btn-secondary" style={{ fontSize: 12, height: 32, padding: "0 12px", display: "flex", alignItems: "center", gap: 5 }} disabled={loading}>
            <X size={11} /> Cancel
          </button>
          <button onClick={onApprove}
            style={{ fontSize: 12, height: 32, padding: "0 14px", display: "flex", alignItems: "center", gap: 5, background: meta.color, color: "#fff", border: "none", borderRadius: "var(--r-sm)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            disabled={loading}>
            {loading ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={11} />}
            {loading ? "Executing..." : "Approve & Execute"}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Insight Card ──────────────────────────────────────────────────────────────
function InsightCard({ icon: Icon, title, value, sub, color, onClick }) {
  return (
    <motion.div whileHover={{ scale: 1.02, y: -1 }} onClick={onClick}
      className="card-metric neon-hover" style={{ padding: "12px 14px", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={15} style={{ color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
          <div style={{ fontSize: 19, fontWeight: 900, color: "var(--text)", lineHeight: 1.2, marginTop: 2, letterSpacing: "-0.04em" }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
    </motion.div>
  );
}

function AlertRow({ icon: Icon, color, text, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border)", cursor: onClick ? "pointer" : "default" }}>
      <Icon size={12} style={{ color, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate-1" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{text}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</div>}
      </div>
      {onClick && <ChevronRight size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
    </div>
  );
}

// ── Smart Insights Panel ──────────────────────────────────────────────────────
function SmartInsightsPanel({ onAskAI, fmtVal }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ai-insights"],
    queryFn: fetchInsights,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  if (isLoading) return (
    <div style={{ padding: 16 }}>
      {[1,2,3,4].map((i) => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 12, marginBottom: 10 }} />)}
    </div>
  );

  const { hotLeads = [], followupsDue = [], staleDeals = [], overdueTasks = [], activeDeals = [], pipelineValue = 0, wonRevenue = 0 } = data || {};
  const urgentCount = staleDeals.length + overdueTasks.length;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "14px 16px" }} className="custom-scroll">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Sparkles size={13} style={{ color: "#A78BFA" }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>Live Intelligence</span>
        </div>
        <button onClick={() => refetch()} className="btn-ghost" style={{ padding: 4 }}><RefreshCw size={11} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <InsightCard icon={BriefcaseBusiness} title="Active Deals" value={activeDeals.length} sub={fmtVal(pipelineValue)} color="#3B82F6" />
        <InsightCard icon={IndianRupee}       title="Won Revenue"  value={fmtVal(wonRevenue)} sub="this period"           color="#10B981" />
        <InsightCard icon={Flame}             title="Hot Leads"    value={hotLeads.length}    sub="need action"           color="#EF4444"
          onClick={hotLeads.length > 0 ? () => onAskAI("List all hot leads with status and recommended next action.") : null} />
        <InsightCard icon={AlertTriangle}     title="Alerts"       value={urgentCount}        sub="require attention"     color="#F59E0B"
          onClick={urgentCount > 0 ? () => onAskAI("What are the most urgent items in my CRM that need immediate attention?") : null} />
      </div>

      {followupsDue.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={9} /> Follow-ups <span className="badge badge-amber" style={{ fontSize: 9, padding: "1px 6px" }}>{followupsDue.length}</span>
          </div>
          {followupsDue.slice(0, 4).map((l) => (
            <AlertRow key={l.id} icon={Clock} color="#F59E0B"
              text={l.company_name || l.contact_name || "Lead"}
              sub={l.follow_up_date ? format(new Date(l.follow_up_date), "MMM d") : ""}
              onClick={() => onAskAI(`Tell me about ${l.company_name || l.contact_name} and what follow-up I should do.`)} />
          ))}
          {followupsDue.length > 4 && (
            <button onClick={() => onAskAI("List all my follow-ups due this week.")} style={{ fontSize: 11.5, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "4px 0", display: "flex", alignItems: "center", gap: 4 }}>
              +{followupsDue.length - 4} more <ChevronRight size={10} />
            </button>
          )}
        </div>
      )}

      {staleDeals.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={9} /> Stale Deals <span className="badge badge-red" style={{ fontSize: 9, padding: "1px 6px" }}>{staleDeals.length}</span>
          </div>
          {staleDeals.slice(0, 4).map((d) => {
            const days = Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000);
            return (
              <AlertRow key={d.id} icon={XCircle} color="#EF4444"
                text={d.company_name || d.title || "Deal"}
                sub={`${d.stage} · ${days}d stale`}
                onClick={() => onAskAI(`The deal "${d.company_name || d.title}" has been stale for ${days} days. What should I do?`)} />
            );
          })}
        </div>
      )}

      {overdueTasks.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Target size={9} /> Overdue Tasks <span className="badge badge-red" style={{ fontSize: 9, padding: "1px 6px" }}>{overdueTasks.length}</span>
          </div>
          {overdueTasks.slice(0, 3).map((t) => (
            <AlertRow key={t.id} icon={XCircle} color="#FB7185"
              text={t.title}
              sub={t.due_date ? `Due ${format(new Date(t.due_date), "MMM d")}` : "Overdue"} />
          ))}
        </div>
      )}

      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Lightbulb size={9} /> Ask AI
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {QUICK_PROMPTS.slice(0, 6).map((p) => (
            <button key={p.label} onClick={() => onAskAI(p.prompt)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)", fontSize: 12, fontWeight: 500, cursor: "pointer", textAlign: "left", width: "100%", transition: "all 0.14s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)"; }}>
              <p.icon size={11} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span className="truncate-1">{p.label}</span>
              <ArrowRight size={9} style={{ color: "var(--text-muted)", marginLeft: "auto", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AIAssistant() {
  const { profile } = useAuth();
  const { formatCompact, symbol } = useCurrency();
  const qc = useQueryClient();
  const fmtVal = (v) => { const n = Number(v); return n ? formatCompact(n) : `${symbol}0`; };

  // Fetch CRM data for dynamic greeting
  const { data: initialInsights } = useQuery({
    queryKey: ["ai-initial-greeting"],
    queryFn: fetchInsights,
    staleTime: 300000,
  });

  const [messages, setMessages] = useState([{
    id: "welcome",
    role: "assistant",
    content: "Initializing ARIA...",
    ts: new Date(),
  }]);

  // Set dynamic greeting once data + profile are ready
  const greetingSetRef = useRef(false);
  useEffect(() => {
    if (initialInsights && profile && !greetingSetRef.current) {
      greetingSetRef.current = true;
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: getDynamicGreeting(profile, initialInsights),
        ts: new Date(),
      }]);
    }
  }, [initialInsights, profile]);

  const [input, setInput]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [aiState, setAiState]             = useState("idle");
  const [thinkingStatus, setThinkingStatus] = useState(THINKING_STATUSES[0]);
  const [pendingAction, setPendingAction] = useState(null);
  const [isVoiceOn, setIsVoiceOn]         = useState(false);
  const [isMuted, setIsMuted]             = useState(false);
  const [selectedLang, setSelectedLang]   = useState(LANGUAGES[0]);
  const [recognition, setRecognition]     = useState(null);
  const bottomRef        = useRef(null);
  const inputRef         = useRef(null);
  const synthRef         = useRef(window.speechSynthesis);
  const thinkingTimer    = useRef(null);

  // Rotate thinking status messages while AI is thinking
  useEffect(() => {
    if (aiState === "thinking") {
      let idx = 0;
      thinkingTimer.current = setInterval(() => {
        idx = (idx + 1) % THINKING_STATUSES.length;
        setThinkingStatus(THINKING_STATUSES[idx]);
      }, 1800);
    } else {
      clearInterval(thinkingTimer.current);
    }
    return () => clearInterval(thinkingTimer.current);
  }, [aiState]);

  // Web Speech API init
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.continuous = false; rec.interimResults = true; rec.lang = selectedLang.code;
      rec.onresult = (e) => {
        const t = Array.from(e.results).map((r) => r[0].transcript).join("");
        setInput(t);
        if (e.results[e.results.length - 1].isFinal) { setAiState("idle"); sendMessage(t); }
      };
      rec.onend   = () => { if (aiState === "listening") setAiState("idle"); };
      rec.onerror = () => { setAiState("idle"); setIsVoiceOn(false); };
      setRecognition(rec);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLang.code]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, pendingAction]);

  const speakText = useCallback((text) => {
    if (isMuted || !synthRef.current) return;
    synthRef.current.cancel();
    const utter = new SpeechSynthesisUtterance(text.replace(/[*_`#<>]/g, "").slice(0, 500));
    utter.lang = selectedLang.code; utter.rate = 0.95; utter.pitch = 1.05;
    const voices = synthRef.current.getVoices();
    const preferred = voices.find((v) => v.lang.startsWith(selectedLang.code.split("-")[0]));
    if (preferred) utter.voice = preferred;
    utter.onstart = () => setAiState("speaking");
    utter.onend   = () => setAiState("idle");
    synthRef.current.speak(utter);
  }, [isMuted, selectedLang.code]);

  const startVoice = () => {
    if (!recognition) { alert("Voice recognition not supported. Please use Chrome."); return; }
    synthRef.current?.cancel();
    setAiState("listening"); setIsVoiceOn(true);
    recognition.lang = selectedLang.code; recognition.start();
  };
  const stopVoice = () => { recognition?.stop(); setAiState("idle"); setIsVoiceOn(false); };

  // Execute approved CRM action
  const executeAction = async (action) => {
    setActionLoading(true);
    try {
      if (action.type === "create_task") {
        const { error } = await supabase.from("tasks").insert({
          title:      action.data.title || "AI-generated task",
          priority:   action.data.priority || "medium",
          due_date:   action.data.due_date || null,
          status:     "todo",
          assigned_to: profile?.id,
          created_by:  profile?.id,
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["sidebar-task-count"] });
      } else if (action.type === "create_lead") {
        const { error } = await supabase.from("leads").insert({
          company_name: action.data.company_name || "New Lead",
          contact_name: action.data.contact_name || null,
          source:       action.data.source || "other",
          stage:        "new",
          temperature:  "warm",
          assigned_to:  profile?.id,
          is_locked:    false,
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["leads"] });
        qc.invalidateQueries({ queryKey: ["pipeline"] });
      } else if (action.type === "create_activity") {
        const { error } = await supabase.from("activities").insert({
          type:       action.data.type || "call",
          title:      action.data.title || "Activity",
          status:     "done",
          created_by: profile?.id,
          user_id:    profile?.id,
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["activities"] });
      }
      setMessages((prev) => [...prev, {
        id: Date.now() + "sys",
        role: "assistant",
        content: `✅ Done! ${action.description || "Action executed successfully."}`,
        ts: new Date(),
      }]);
      qc.invalidateQueries({ queryKey: ["ai-insights"] });
      qc.invalidateQueries({ queryKey: ["ai-initial-greeting"] });
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: Date.now() + "err",
        role: "assistant",
        content: `❌ Couldn't complete that action: ${err.message}`,
        ts: new Date(),
      }]);
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  };

  const sendMessage = async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput("");
    setPendingAction(null);

    const userMsg = { id: Date.now() + "u", role: "user", content, ts: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setAiState("thinking");
    setThinkingStatus(THINKING_STATUSES[0]);

    // Build CRM context
    const [leadsRes, dealsRes, tasksRes] = await Promise.all([
      supabase.from("leads").select("company_name, contact_name, temperature, stage, follow_up_date, source").order("created_at", { ascending: false }).limit(30),
      supabase.from("deals").select("company_name, title, stage, value, updated_at, close_date").limit(30),
      supabase.from("tasks").select("title, status, due_date, priority").limit(20),
    ]);

    const now = new Date().toISOString().slice(0, 10);
    const crmContext = `Today: ${now} | User: ${profile?.full_name || "Sales Rep"} (${profile?.role || "employee"})
LEADS (${(leadsRes.data||[]).length}): ${JSON.stringify((leadsRes.data||[]).slice(0, 20))}
DEALS (${(dealsRes.data||[]).length}): ${JSON.stringify((dealsRes.data||[]).slice(0, 20))}
TASKS (${(tasksRes.data||[]).length}): ${JSON.stringify((tasksRes.data||[]).slice(0, 15))}`;

    const history = messages
      .filter((m) => !["welcome", "welcome-new"].includes(m.id) && !m.id.endsWith("sys") && !m.id.endsWith("err"))
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: "user", content });

    const streamId = Date.now() + "a";
    setMessages((prev) => [...prev, { id: streamId, role: "assistant", content: "", ts: new Date(), streaming: true }]);

    try {
      await streamGrokResponse({
        messages: history,
        context: crmContext,
        language: selectedLang.name,
        userName: profile?.full_name,
        userRole: profile?.role,
        onToken: (_, fullText) => {
          const { cleanText } = parseAction(fullText);
          setMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, content: cleanText } : m));
        },
        onDone: (fullText) => {
          const { cleanText, action } = parseAction(fullText);
          setMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, content: cleanText, streaming: false } : m));
          if (action) setPendingAction(action);
          speakText(cleanText);
        },
        onError: (err) => {
          const message = err?.message || "Unknown xAI error";
          const isKeyMissing = message === "XAI_KEY_MISSING";
          const isBillingIssue = /credits|licenses|permission to execute|billing/i.test(message);

          const fallback = isKeyMissing
            ? "**AI key not configured.** Add `VITE_XAI_API_KEY=xai-...` to your `.env` file and restart.\n\nGet your key at **console.x.ai**"
            : isBillingIssue
              ? "**xAI billing is not active for this team.** Add credits or a license in **console.x.ai**, then retry.\n\nIf the key was recently created, wait a few minutes and try again."
              : `**Error:** ${message}`;

          setMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, content: fallback, streaming: false } : m));
        },
      });
    } finally {
      setLoading(false);
      setAiState("idle");
    }
  };

  const clearChat = () => {
    setPendingAction(null);
    greetingSetRef.current = false;
    setMessages([{
      id: "welcome-new",
      role: "assistant",
      content: getDynamicGreeting(profile, initialInsights),
      ts: new Date(),
    }]);
  };

  const statusText = aiState === "listening" ? "🎤 Listening..."
    : aiState === "thinking" ? thinkingStatus
    : aiState === "speaking" ? "🔊 Speaking..."
    : "Multilingual · Hindi · Hinglish · English · and more";

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>

      {/* ── Left: Chat ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, borderRight: "1px solid var(--border)" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <AIOrb state={aiState} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em" }}>ARIA</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>AI Executive Assistant</span>
              <span className="badge badge-purple" style={{ fontSize: 9.5 }}>BETA</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#10B981", fontWeight: 600 }}>
                <span className="live-indicator" /> Grok 4.3
              </span>
            </div>
            <motion.div
              key={statusText}
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 1 }}
              style={{ fontSize: 11.5, color: aiState === "thinking" ? "#A78BFA" : "var(--text-muted)", marginTop: 1 }}>
              {statusText}
            </motion.div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", gap: 3 }}>
              {LANGUAGES.slice(0, 3).map((lang) => (
                <button key={lang.label} className={`lang-chip${selectedLang.label === lang.label ? " active" : ""}`}
                  style={{ padding: "3px 8px", fontSize: 10.5, fontWeight: 700 }}
                  onClick={() => setSelectedLang(lang)} title={lang.name}>
                  {lang.flag} {lang.label}
                </button>
              ))}
            </div>
            <motion.button className="icon-btn" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.88 }}
              onClick={() => { setIsMuted((v) => !v); if (!isMuted) synthRef.current?.cancel(); }}
              title={isMuted ? "Unmute" : "Mute"} style={{ color: isMuted ? "var(--red)" : undefined }}>
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </motion.button>
            <motion.button className="icon-btn" onClick={clearChat} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.88 }} title="Clear chat">
              <Trash2 size={15} strokeWidth={1.75} />
            </motion.button>
          </div>
        </div>

        {/* Quick prompt chips */}
        <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, overflowX: "auto", flexShrink: 0, background: "var(--surface-2)" }} className="custom-scroll">
          {HINGLISH_PROMPTS.map((p) => (
            <button key={p.text} className="hinglish-chip" onClick={() => sendMessage(p.prompt)}>
              <span className="hinglish-flag">{p.flag}</span> {p.text}
            </button>
          ))}
          {QUICK_PROMPTS.map((p) => (
            <button key={p.label} className="hinglish-chip" onClick={() => sendMessage(p.prompt)} style={{ background: "var(--surface-2)" }}>
              <p.icon size={11} style={{ color: "var(--accent)" }} /> {p.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 14 }} className="custom-scroll">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div key={msg.id}
                initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 24, stiffness: 300 }}
                style={{ display: "flex", gap: 10, alignItems: "flex-end", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: msg.role === "assistant" ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "linear-gradient(135deg,#2563EB,#4F46E5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {msg.role === "assistant"
                    ? <Brain size={14} style={{ color: "#fff" }} />
                    : <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{profile?.full_name?.[0] || "U"}</span>}
                </div>
                <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 2, alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "assistant" ? (
                    <div className="ai-message-bubble">
                      {(msg.content || " ").split("\n").map((line, i, arr) => (
                        <span key={i}>
                          {line.split(/(\*\*.*?\*\*)/g).map((part, j) =>
                            part.startsWith("**") && part.endsWith("**")
                              ? <strong key={j} style={{ color: "var(--text)", fontWeight: 700 }}>{part.slice(2,-2)}</strong>
                              : <span key={j}>{part}</span>
                          )}
                          {i < arr.length - 1 && <br />}
                        </span>
                      ))}
                      {msg.streaming && (
                        <span style={{ display: "inline-block", width: 8, height: 14, background: "var(--accent)", borderRadius: 2, marginLeft: 2, animation: "typing-dot 0.8s steps(1) infinite", verticalAlign: "middle" }} />
                      )}
                    </div>
                  ) : (
                    <div className="user-message-bubble">{msg.content}</div>
                  )}
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", padding: "0 4px" }}>
                    {format(new Date(msg.ts), "h:mm a")}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          {loading && !messages.some((m) => m.streaming && m.content) && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Brain size={14} style={{ color: "#fff" }} />
              </div>
              <div className="typing-indicator">
                <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
              </div>
            </motion.div>
          )}

          {/* Action approval */}
          {pendingAction && (
            <div style={{ paddingLeft: 38 }}>
              <ActionApprovalModal
                action={pendingAction}
                onApprove={() => executeAction(pendingAction)}
                onDismiss={() => setPendingAction(null)}
                loading={actionLoading}
              />
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
          {isVoiceOn && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, gap: 14 }}>
              <VoiceBars active={aiState === "listening"} />
              <span style={{ fontSize: 12, color: aiState === "listening" ? "#EF4444" : "var(--text-muted)", fontWeight: 600 }}>
                {aiState === "listening" ? "Listening... speak now" : "Tap mic to speak"}
              </span>
              <VoiceBars active={aiState === "listening"} heights={[24, 18, 36, 28, 22, 32, 20]} />
            </motion.div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <motion.button className={`mic-btn${isVoiceOn && aiState === "listening" ? " listening" : ""}`}
              style={{ width: 42, height: 42, flexShrink: 0 }}
              onClick={isVoiceOn && aiState === "listening" ? stopVoice : startVoice}
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }}>
              {isVoiceOn && aiState === "listening" ? <MicOff size={18} /> : <Mic size={18} />}
            </motion.button>
            <div style={{ flex: 1, position: "relative" }}>
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask anything... 'Show hot leads', 'Create a follow-up task', 'Draft email for Acme Corp'"
                className="crm-input" style={{ resize: "none", height: 42, maxHeight: 120, lineHeight: 1.5, paddingRight: 14, paddingTop: 11 }} rows={1}
              />
            </div>
            <motion.button className="btn-primary" style={{ height: 42, padding: "0 16px", gap: 6, flexShrink: 0 }}
              onClick={() => sendMessage()} disabled={!input.trim() || loading}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.92 }}>
              <Send size={14} />
            </motion.button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <Activity size={10} style={{ color: "var(--text-muted)" }} />
            <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
              Powered by <strong style={{ color: "var(--accent)" }}>Grok 4.3</strong> (xAI) · Enter to send · Shift+Enter for new line · Actions require approval
            </span>
          </div>
        </div>
      </div>

      {/* ── Right: Live Intelligence ── */}
      <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--surface-2)", borderLeft: "1px solid var(--border)" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.12))", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={13} style={{ color: "#A78BFA" }} />
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>Live Intelligence</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Real-time CRM insights</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <SmartInsightsPanel onAskAI={sendMessage} fmtVal={fmtVal} />
        </div>
      </div>
    </div>
  );
}
