const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function callAiJson<T>(system: string, user: string): Promise<T> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const openaiKey = process.env["OPENAI_API_KEY"];
  const geminiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];

  let url = "";
  let headers: Record<string, string> = { "Content-Type": "application/json" };
  let body: any = {};
  let isNativeGemini = false;

  if (lovableKey) {
    url = "https://ai.gateway.lovable.dev/v1/chat/completions";
    headers["Lovable-API-Key"] = lovableKey;
    headers["X-Lovable-AIG-SDK"] = "fetch";
    body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    };
  } else if (openaiKey) {
    url = "https://api.openai.com/v1/chat/completions";
    headers["Authorization"] = `Bearer ${openaiKey}`;
    body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    };
  } else if (geminiKey) {
    isNativeGemini = true;
    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;
    body = {
      contents: [
        {
          role: "user",
          parts: [{ text: `System Instructions:\n${system}\n\nUser Input:\n${user}` }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };
  } else {
    throw new Error("AI is not configured. Please set LOVABLE_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in your local .env file.");
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("AI rate limit reached. Please try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please add credits to continue.");
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${await res.text()}`);

  const data = await res.json() as any;
  let raw = "";
  if (isNativeGemini) {
    raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } else {
    raw = data.choices?.[0]?.message?.content ?? "";
  }

  let cleaned = raw.trim();

  // Find the start of the JSON object or array
  const startObj = cleaned.indexOf("{");
  const startArr = cleaned.indexOf("[");
  let start = -1;
  let openChar = "";
  let endChar = "";

  if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
    start = startObj;
    openChar = "{";
    endChar = "}";
  } else if (startArr !== -1) {
    start = startArr;
    openChar = "[";
    endChar = "]";
  }

  if (start !== -1) {
    let count = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < cleaned.length; i++) {
      const char = cleaned[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === openChar) {
          count++;
        } else if (char === endChar) {
          count--;
          if (count === 0) {
            cleaned = cleaned.substring(start, i + 1);
            break;
          }
        }
      }
    }
  }

  // Remove trailing commas (common LLM generation issue)
  cleaned = cleaned.replace(/,(\s*[\]}])/g, "$1");

  console.log("RAW AI RESPONSE:", raw);
  console.log("CLEANED AI RESPONSE:", cleaned);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.error("JSON PARSING ERROR:", err);
    throw new Error("AI returned an unreadable response. Please try again.");
  }
}
