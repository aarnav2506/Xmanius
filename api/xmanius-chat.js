export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  let body = request.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body || "{}"); } catch { return response.status(400).json({ error: "Invalid JSON request body" }); }
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const thinkMode = body.thinkMode === true;
  if (!message) return response.status(400).json({ error: "Message is required" });
  const apiKey = process.env.XMANIUS_GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: "Xmanius AI is not configured yet." });
  try {
    const model = process.env.XMANIUS_GEMINI_MODEL || "gemini-3.6-flash";
    const formatInstruction = "Format answers cleanly in Markdown: use a short opening paragraph, bold section titles or numbered headings when useful, bullet points for grouped facts, and blank lines between sections. Bold only important terms or necessary points. Do not make every sentence a heading.";
    const instruction = thinkMode ? `You are Xmanius in Think mode, a general-purpose AI assistant. Analyze carefully, check assumptions and edge cases, and prioritize accuracy. Do not reveal private chain-of-thought; provide only the concise answer and a brief explanation when useful. Do not discuss Arnav or any personal blog or portfolio. ${formatInstruction}` : `You are Xmanius, a general-purpose AI assistant. Answer safe everyday questions quickly and clearly. Do not discuss Arnav or any personal blog or portfolio. ${formatInstruction}`;
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: instruction }] }, contents: [{ role: "user", parts: [{ text: message }] }], generationConfig: { temperature: thinkMode ? 0.35 : 0.55, maxOutputTokens: thinkMode ? 1536 : 768 } }) });
    const data = await upstream.json();
    if (!upstream.ok) return response.status(upstream.status).json({ error: data.error?.message || "The AI service is unavailable." });
    const reply = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    return response.status(200).json({ reply: reply || "I could not produce an answer for that." });
  } catch { return response.status(502).json({ error: "The AI service is unavailable." }); }
}
