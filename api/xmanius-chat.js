export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  let body = request.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body || "{}"); } catch { return response.status(400).json({ error: "Invalid JSON request body" }); }
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const thinkMode = body.thinkMode === true;
  const webSearch = body.webSearch === true;
  const rethink = body.rethink === true || /\b(rethink|re\s*consider|you(?:'re| are)\s+wrong|that\s+is\s+wrong|incorrect|not\s+correct|try\s+again)\b/i.test(message);
  const selectedModel = body.model === "xmanius-2" ? "xmanius-2" : "xmanius-1";
  const history = Array.isArray(body.history) ? body.history : [];
  if (!message) return response.status(400).json({ error: "Message is required" });
  const apiKey = selectedModel === "xmanius-2" ? process.env.XMANIUS_GEMINI_API_KEY_2 : process.env.XMANIUS_GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: `${selectedModel === "xmanius-2" ? "Xmanius 2 (Gemini)" : "Xmanius 1 (Gemini)"} is not configured yet.` });
  try {
    const model = process.env.XMANIUS_GEMINI_MODEL || "gemini-3.6-flash";
    let searchContext = "";
    let searchResults = [];
    let searchError = "";
    if (webSearch && (!process.env.XMANIUS_GOOGLE_SEARCH_API_KEY || !process.env.XMANIUS_GOOGLE_SEARCH_CX)) searchError = "Web search is not configured. Add both XMANIUS_GOOGLE_SEARCH_API_KEY and XMANIUS_GOOGLE_SEARCH_CX in Vercel.";
    if (webSearch && process.env.XMANIUS_GOOGLE_SEARCH_API_KEY && process.env.XMANIUS_GOOGLE_SEARCH_CX) {
      const searchUrl = new URL("https://www.googleapis.com/customsearch/v1");
      searchUrl.searchParams.set("key", process.env.XMANIUS_GOOGLE_SEARCH_API_KEY);
      searchUrl.searchParams.set("cx", process.env.XMANIUS_GOOGLE_SEARCH_CX);
      const wantsYouTube = /youtube|video|watch|lecture|class\s*\d+/i.test(message);
      searchUrl.searchParams.set("q", wantsYouTube ? `${message} site:youtube.com` : message);
      searchUrl.searchParams.set("num", "5");
      const searchResponse = await fetch(searchUrl);
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        searchResults = (searchData.items || []).slice(0, 8).map((item) => ({ title: item.title || item.link, url: item.link, snippet: item.snippet || "", displayLink: item.displayLink || "", thumbnail: item.pagemap?.cse_thumbnail?.[0]?.src || item.pagemap?.cse_image?.[0]?.src || "" }));
        searchContext = searchResults.map((item, index) => `[${index + 1}] ${item.title}\n${item.snippet}\nURL: ${item.url}`).join("\n\n");
        if (!searchResults.length) searchError = "Google returned no matching sources for this search.";
      } else { const errorData = await searchResponse.json().catch(() => ({})); searchError = errorData.error?.message || `Google search failed (${searchResponse.status}).`; }
    }
    const formatInstruction = "Write like a polished modern AI assistant. Start with a direct answer, then organize details with descriptive Markdown headings (##), bold only important terms, numbered steps for procedures, bullets for grouped facts, and blank lines between sections. Use symbols such as →, ✓, •, and em dashes naturally when they improve clarity. Use a Markdown table when comparing multiple search results, prices, features, dates, or options. For web research, distinguish verified facts from snippets, include useful source links in Markdown, and never claim that a flight or product is the cheapest unless the source actually verifies current pricing. For math, parse the user's wording carefully, preserve brackets such as (3x − y), write each standalone equation on its own line, center important equations with $$...$$, show substitutions in a clean sequence, and end with a clearly labeled final answer. Never output escaped dollar artifacts or unrendered commands. Do not put every sentence in a heading, do not repeat the question, and do not include a hidden thought process.";
    const contextInstruction = "Use the conversation history only when it is relevant to the current question. If the topic clearly changes, answer the new topic independently.";
    const correctionInstruction = rethink ? "The user asked you to rethink or challenged the previous answer. Re-evaluate the prior answer carefully, identify the likely mistake or ambiguity, correct it, and give the improved answer. Do not repeat the same wording and briefly state what changed." : "";
    const videoInstruction = webSearch && /youtube|video|watch|lecture/i.test(message) ? "When YouTube results are available, recommend the actual result and include its direct URL. Do not say that videos cannot be played; the interface can embed YouTube results." : "";
    const instruction = thinkMode ? `You are Xmanius in Think mode, a general-purpose AI assistant. Analyze carefully, check assumptions and edge cases, and prioritize accuracy. Do not reveal private chain-of-thought; provide only the answer and a brief rationale when useful. Do not discuss Arnav or any personal blog or portfolio. ${correctionInstruction} ${videoInstruction} ${contextInstruction} ${formatInstruction}` : `You are Xmanius, a general-purpose AI assistant. Answer safe everyday questions quickly and clearly. Do not discuss Arnav or any personal blog or portfolio. ${correctionInstruction} ${videoInstruction} ${contextInstruction} ${formatInstruction}`;
    const safeHistory = history.filter((item) => item && (item.role === "user" || item.role === "model") && typeof item.text === "string").slice(-12).map((item) => ({ role: item.role, parts: [{ text: item.text.slice(0, 3000) }] }));
    const contents = [...safeHistory, { role: "user", parts: [{ text: searchContext ? `${message}\n\nWeb search results (use as sources, verify conflicts, and cite links in the answer):\n${searchContext}` : message }] }];
    let upstream;
    const geminiModel = selectedModel === "xmanius-2" ? (process.env.XMANIUS_GEMINI_MODEL_2 || "gemini-3.6-flash") : model;
    upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: instruction }] }, contents, generationConfig: { temperature: thinkMode ? 0.35 : 0.55, maxOutputTokens: thinkMode ? 2048 : 1024 } }) });
    const data = await upstream.json();
    if (!upstream.ok) return response.status(upstream.status).json({ error: data.error?.message || "The AI service is unavailable." });
    const reply = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    const finalReply = searchError && webSearch ? `${reply || "I could not produce an answer for that."}\n\n> Web search status: ${searchError}` : (reply || "I could not produce an answer for that.");
    return response.status(200).json({ reply: finalReply, model: selectedModel, webSearchUsed: Boolean(searchContext), sources: searchResults, searchError });
  } catch { return response.status(502).json({ error: "The AI service is unavailable." }); }
}
