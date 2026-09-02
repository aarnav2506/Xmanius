const MAX_TEXT_BYTES = 50000;
const UPSTREAM_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
};

export default async function handler(request, response) {
  const applyCorsHeaders = () => {
    const origin = String(request.headers?.origin || "");
    const allowed = !origin || origin === "null" || ["http://localhost", "https://localhost", "capacitor://localhost"].includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
    if (allowed) response.setHeader("Access-Control-Allow-Origin", origin || "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Vary", "Origin");
  };
  applyCorsHeaders();

  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ error: "Only POST requests are supported." });

  let body = request.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body || "{}"); } catch { return response.status(400).json({ error: "Invalid JSON body." }); }
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const voiceName = typeof body.voice === "string" ? body.voice : "Aoede"; 

  if (!text) return response.status(400).json({ error: "Text data is required." });
  if (text.length > MAX_TEXT_BYTES) return response.status(413).json({ error: "Text data exceeds maximum size limit." });

  const apiKey = process.env.XMANIUS_GEMINI_API_KEY || process.env.XMANIUS_GEMINI_API_KEY_1 || process.env.XMANIUS_GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: "Server AI credentials not configured." });

  const modelCandidate = "gemini-2.5-flash"; 

  try {
    const url = `https://generativelanguage.googleapis.com/v1alpha/models/${encodeURIComponent(modelCandidate)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `Read the following text out loud in a natural voice. Text: ${text}` }]
          }
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName
              }
            }
          }
        }
      })
    }, UPSTREAM_TIMEOUT_MS);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      
      let audioBase64 = null;
      if (data.candidates?.[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
          if (part.inlineData && (part.inlineData.mimeType.includes('audio'))) {
            audioBase64 = part.inlineData.data;
            break;
          }
        }
      }
      
      if (audioBase64) {
         return response.status(200).json({ audio: audioBase64, mimeType: "audio/wav" });
      }
      
      return response.status(502).json({ error: "No audio generated." });
    }
    
  } catch (err) {
    console.error(err);
  }

  return response.status(502).json({ error: "Could not synthesize audio right now." });
}
