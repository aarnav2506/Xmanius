const MAX_AUDIO_BYTES = 50000000;
const UPSTREAM_TIMEOUT_MS = 15000;

const requestIdFor = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const fetchWithTimeout = async (url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
};

export default async function handler(request, response) {
  const requestId = requestIdFor();
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

  const audioData = typeof body.audio === "string" ? body.audio.replace(/^data:[^,]+,/, "").replace(/\s/g, "") : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "audio/webm";
  const translate = body.translate === true;
  const targetLanguage = typeof body.targetLanguage === "string" ? body.targetLanguage : "English";

  if (!audioData) return response.status(400).json({ error: "Audio data is required." });
  if (audioData.length > MAX_AUDIO_BYTES) return response.status(413).json({ error: "Audio data exceeds maximum size limit." });

  const apiKey = process.env.XMANIUS_GEMINI_API_KEY || process.env.XMANIUS_GEMINI_API_KEY_1 || process.env.XMANIUS_GEMINI_API_KEY_2;
  if (!apiKey) return response.status(503).json({ error: "Server AI credentials not configured." });

  const fallbackModels = ["gemini-3.5-transcribe", "gemini-3.1-flash", "gemini-3.5-flash-lite"];

  const prompt = translate
    ? `Listen to this live audio recording carefully. Translate all spoken words accurately into clean, natural ${targetLanguage} text. Return only the translated text.`
    : `Listen to this live audio recording carefully. Transcribe all spoken words accurately into clean text. Return only the exact transcription.`;

  let transcriptText = "";
  let success = false;

  for (const modelCandidate of fallbackModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelCandidate)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You are a professional audio transcriber and live translator. Provide accurate output." }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType: mimeType.split(";")[0], data: audioData } }
              ]
            }
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
        })
      }, UPSTREAM_TIMEOUT_MS);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        transcriptText = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
        if (transcriptText) {
          success = true;
          break;
        }
      }
    } catch (_) {
      continue;
    }
  }

  if (!success || !transcriptText) {
    return response.status(502).json({ error: "Could not transcribe audio right now.", requestId });
  }

  return response.status(200).json({ text: transcriptText, translated: translate, requestId });
}
