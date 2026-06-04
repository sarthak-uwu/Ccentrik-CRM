const XAI_BASE  = "https://api.x.ai/v1";
const XAI_MODEL = "grok-3-mini"; // grok-3 for max quality, grok-3-mini for speed+cost

function buildSystemPrompt(context, language) {
  return `You are an AI Sales Sidekick for Ccentrik CRM — an enterprise sales platform used by the Indian sales team.

ROLE:
- Analyze CRM data (leads, deals, tasks) and give actionable sales advice
- Be concise, direct, and practical — sales reps are busy
- Respond in ${language} when user writes in ${language}; if user mixes Hindi/English (Hinglish), respond in Hinglish too
- Use Indian number format (₹, Lakh, Crore) for currency
- When listing items, use bullet points. Bold company names and key numbers.

CURRENT CRM DATA:
${context}

PERSONALITY:
- Confident, like a senior sales manager
- Warm but efficient — no fluff
- Occasionally use simple Hindi phrases like "bilkul", "theek hai", "aage badhte hain" when in Hinglish mode
- Always end with a clear next action or recommendation

Do NOT make up data. Only reference what's in the CRM context above.`;
}

/**
 * Stream a Grok response. Calls onToken for each streamed token.
 * Returns the full reply string when done.
 */
export async function streamGrokResponse({ messages, context, language = "English", onToken, onDone, onError }) {
  const apiKey = import.meta.env.VITE_XAI_API_KEY;
  if (!apiKey || apiKey === "your_xai_api_key_here") {
    onError?.(new Error("XAI_KEY_MISSING"));
    return;
  }

  const systemPrompt = buildSystemPrompt(context, language);

  const body = JSON.stringify({
    model: XAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    stream: true,
    temperature: 0.7,
    max_tokens: 1200,
  });

  try {
    const res = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `xAI API error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") { onDone?.(fullText); return fullText; }
        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content || "";
          if (token) {
            fullText += token;
            onToken?.(token, fullText);
          }
        } catch { /* skip malformed SSE chunks */ }
      }
    }

    onDone?.(fullText);
    return fullText;
  } catch (err) {
    onError?.(err);
    throw err;
  }
}
