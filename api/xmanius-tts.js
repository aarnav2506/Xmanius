import fs from "fs";
import path from "path";

// Auto-load local .env if present
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envData = fs.readFileSync(envPath, "utf8");
    for (const line of envData.split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = (m[2] || "").trim().replace(/^["']|["']$/g, "");
      }
    }
  }
} catch (_) {}

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
  if (!text) return response.status(400).json({ error: "Text data is required." });
  if (text.length > MAX_TEXT_BYTES) return response.status(413).json({ error: "Text data exceeds maximum size limit." });

  const rawVoiceKey = String(body.voice || "Aoede").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  const VOICE_PROFILES = {
    ukmale: { voiceName: "Charon", instruction: "You are a distinguished British male voice with a clear, refined UK accent and articulate, formal cadence." },
    ukfemale: { voiceName: "Aoede", instruction: "You are a refined British female voice with a clear, melodic, eloquent UK accent." },
    usmale: { voiceName: "Puck", instruction: "You are a friendly, natural American male voice with a clear, conversational US accent." },
    usfemale: { voiceName: "Kore", instruction: "You are a calm, professional American female voice with a warm, clear US accent." },
    charon: { voiceName: "Charon", instruction: "You are Charon: a deep, authoritative baritone male voice with resonant bass tone." },
    fenrir: { voiceName: "Fenrir", instruction: "You are Fenrir: a bold, direct, confident, energetic male voice." },
    puck: { voiceName: "Puck", instruction: "You are Puck: an upbeat, bright, expressive, youthful male voice." },
    pegasus: { voiceName: "Pegasus", instruction: "You are Pegasus: a mature, rich, steady, commanding male voice." },
    aoede: { voiceName: "Aoede", instruction: "You are Aoede: a warm, expressive, lyrical, natural storytelling female voice." },
    kore: { voiceName: "Kore", instruction: "You are Kore: a soothing, serene, calm, balanced, professional female voice." },
    zephyr: { voiceName: "Zephyr", instruction: "You are Zephyr: a soft, airy, gentle, compassionate female voice." }
  };

  const profile = VOICE_PROFILES[rawVoiceKey] || { voiceName: "Aoede", instruction: "You are a natural, expressive voice." };

  // Prioritize Key 8 for voice, but fall back gracefully across other available keys
  // so audio never fails with 502 if Key 8 is missing, restricted, or exhausted
  const apiKeys = [
    process.env.XMANIUS_GEMINI_API_KEY_8,
    process.env.XMANIUS_GEMINI_API_KEY_LIVE,
    process.env.XMANIUS_GEMINI_API_KEY_8_LIVE,
    process.env.XMANIUS_GEMINI_API_KEY_2,
    process.env.XMANIUS_GEMINI_API_KEY_1,
    process.env.XMANIUS_GEMINI_API_KEY_3,
    process.env.XMANIUS_GEMINI_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY
  ].filter(Boolean);

  if (!apiKeys.length) return response.status(503).json({ error: "Server AI credentials not configured." });

  const ttsCandidates = [
    { model: "gemini-2.5-flash-native-audio-dialog", apiVer: "v1beta" },
    { model: "gemini-3-flash-live", apiVer: "v1beta" },
    { model: "gemini-2.5-flash", apiVer: "v1beta" },
    { model: "gemini-3.5-flash-lite", apiVer: "v1beta" }
  ];

  for (const rawApiKey of apiKeys.slice(0, 4)) {
    const apiKey = String(rawApiKey || "").trim().replace(/^["']|["']$/g, "");
    if (!apiKey) continue;
    for (const item of ttsCandidates) {
      try {
        const cleanModel = String(item.model || "").trim().replace(/^models\//i, "");
        const url = `https://generativelanguage.googleapis.com/${item.apiVer}/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetchWithTimeout(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: `${profile.instruction} Speak at an energetic, crisp, natural conversational pace without any slow pauses or drawn-out words. Output ONLY the spoken audio for this text without extra words.` }]
            },
            contents: [
              {
                role: "user",
                parts: [{ text: text }]
              }
            ],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: profile.voiceName
                  }
                }
              }
            }
          })
        }, 4000);

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          let audioBase64 = null;
          if (data.candidates?.[0]?.content?.parts) {
            for (const part of data.candidates[0].content.parts) {
              if (part.inlineData && (part.inlineData.mimeType?.includes('audio') || part.inlineData.data)) {
                audioBase64 = part.inlineData.data;
                break;
              }
            }
          }
          
          if (audioBase64) {
             return response.status(200).json({ audio: audioBase64, mimeType: "audio/wav", voice: profile.voiceName });
          }
        }
      } catch (err) {
        // Try next candidate
      }
    }
  }

  return response.status(502).json({ error: "Could not synthesize audio right now." });
}
