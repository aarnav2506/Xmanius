export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
  if (!message) return response.status(400).json({ error: "Message is required" });
  const apiKey = process.env.XMANIUS_GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: "Xmanius AI is not configured yet." });
  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: "You are Xmanius, a general-purpose AI assistant. Answer useful, safe everyday questions. Do not discuss or infer any private person, personal blog, portfolio, or Arnav-specific information unless the user provides it in the current message. Be concise and clear." }] }, contents: [{ role: "user", parts: [{ text: message }] }] }) });
    const data = await upstream.json();
    if (!upstream.ok) return response.status(upstream.status).json({ error: data.error?.message || "The AI service is unavailable." });
    const reply = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    return response.status(200).json({ reply: reply || "I could not produce an answer for that." });
  } catch { return response.status(502).json({ error: "The AI service is unavailable." }); }
}
