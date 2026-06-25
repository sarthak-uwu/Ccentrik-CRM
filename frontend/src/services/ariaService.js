const API_URL = import.meta.env.VITE_API_URL || "https://backend-gamma-nine-32.vercel.app";

const TOOL_STATUS = {
  get_leads:            "Querying leads...",
  get_deals:            "Analyzing deals...",
  get_tasks:            "Checking tasks...",
  get_activities:       "Reviewing activities...",
  get_pipeline_summary: "Computing pipeline...",
};

export async function streamARIA({ message, pageContext, getToken, onStatus, onToken, onDone, onError, signal }) {
  try {
    const token = await getToken();

    const res = await fetch(`${API_URL}/api/ai/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ message, pageContext: pageContext || null }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Server error ${res.status}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";
    let fullText  = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") { onDone?.(fullText); return; }

        try {
          const parsed = JSON.parse(raw);
          if (parsed.type === "tool") {
            onStatus?.(TOOL_STATUS[parsed.name] || "Analyzing...");
          } else if (parsed.type === "token") {
            fullText += parsed.content;
            onToken?.(parsed.content, fullText);
          } else if (parsed.type === "error") {
            throw new Error(parsed.message);
          }
        } catch (e) {
          if (e.message && !e.message.includes("JSON") && !e.message.includes("Unexpected")) throw e;
        }
      }
    }

    onDone?.(fullText);
  } catch (err) {
    if (err.name === "AbortError") return; // User stopped generation — ignore silently
    onError?.(err);
  }
}

export async function clearARIAHistory(getToken) {
  try {
    const token = await getToken();
    await fetch(`${API_URL}/api/ai/clear-history`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
  } catch { /* non-critical */ }
}
