export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  let body = request.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body || "{}"); } catch { return response.status(400).json({ error: "Invalid JSON request body" }); }
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const thinkMode = body.thinkMode === true;
  const webSearch = body.webSearch === true;
  const selectedModel = body.model === "xmanius-2" ? "xmanius-2" : "xmanius-1";
  const history = Array.isArray(body.history) ? body.history : [];
  if (!message) return response.status(400).json({ error: "Message is required" });
  const apiKey = selectedModel === "xmanius-2" ? process.env.XMANIUS_GEMINI_API_KEY_2 : process.env.XMANIUS_GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: `${selectedModel === "xmanius-2" ? "Xmanius 2 (Gemini)" : "Xmanius 1 (Gemini)"} is not configured yet.` });
  try {
    const model = process.env.XMANIUS_GEMINI_MODEL || "gemini-3.6-flash";
    let searchContext = "";
    if (webSearch && process.env.XMANIUS_GOOGLE_SEARCH_API_KEY && process.env.XMANIUS_GOOGLE_SEARCH_CX) {
      const searchUrl = new URL("https://www.googleapis.com/customsearch/v1");
      searchUrl.searchParams.set("key", process.env.XMANIUS_GOOGLE_SEARCH_API_KEY);
      searchUrl.searchParams.set("cx", process.env.XMANIUS_GOOGLE_SEARCH_CX);
      searchUrl.searchParams.set("q", message);
      searchUrl.searchParams.set("num", "5");
      const searchResponse = await fetch(searchUrl);
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        searchContext = (searchData.items || []).map((item, index) => `[${index + 1}] ${item.title}\n${item.snippet || ""}\nURL: ${item.link}`).join("\n\n");
      }
    }
    const formatInstruction = "Format answers cleanly in Markdown: start with a short opening paragraph when useful, use bold section titles or numbered headings, bullet points for grouped facts, and blank lines between sections. Use readable Markdown tables only when a comparison is genuinely clearer. Bold only important terms or necessary points. Never output raw LaTeX delimiters such as $$ or \\(; write equations in plain readable text or simple Markdown.";
    const contextInstruction = "Use the conversation history only when it is relevant to the current question. If the topic clearly changes, answer the new topic independently.";
    const instruction = thinkMode ? `You are Xmanius in Think mode, a general-purpose AI assistant. Analyze carefully, check assumptions and edge cases, and prioritize accuracy. Do not reveal private chain-of-thought; provide only the answer and a brief rationale when useful. Do not discuss Arnav or any personal blog or portfolio. ${contextInstruction} ${formatInstruction}` : `You are Xmanius, a general-purpose AI assistant. Answer safe everyday questions quickly and clearly. Do not discuss Arnav or any personal blog or portfolio. ${contextInstruction} ${formatInstruction}`;
    const safeHistory = history.filter((item) => item && (item.role === "user" || item.role === "model") && typeof item.text === "string").slice(-12).map((item) => ({ role: item.role, parts: [{ text: item.text.slice(0, 3000) }] }));
    const contents = [...safeHistory, { role: "user", parts: [{ text: searchContext ? `${message}\n\nWeb search results (use as sources, verify conflicts, and cite links in the answer):\n${searchContext}` : message }] }];
    let upstream;
    const geminiModel = selectedModel === "xmanius-2" ? (process.env.XMANIUS_GEMINI_MODEL_2 || "gemini-3.6-flash") : model;
    upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: instruction }] }, contents, generationConfig: { temperature: thinkMode ? 0.35 : 0.55, maxOutputTokens: thinkMode ? 2048 : 1024 } }) });
    const data = await upstream.json();
    if (!upstream.ok) return response.status(upstream.status).json({ error: data.error?.message || "The AI service is unavailable." });
    const reply = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    return response.status(200).json({ reply: reply || "I could not produce an answer for that.", model: selectedModel, webSearchUsed: Boolean(searchContext) });
  } catch { return response.status(502).json({ error: "The AI service is unavailable." }); }
}
