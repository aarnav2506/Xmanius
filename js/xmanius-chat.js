(() => {
  "use strict";
  const app = document.querySelector(".chat-app");
  const form = document.querySelector("[data-chat-form]");
  const input = document.querySelector("[data-chat-input]");
  const list = document.querySelector("[data-message-list]");
  const empty = document.querySelector("[data-empty-state]");
  const recent = document.querySelector("[data-recent-list]");
  const accountButton = document.querySelector("[data-account-button]");
  const accountName = document.querySelector("[data-account-name]");
  const accountStatus = document.querySelector("[data-account-status]");
  const modelToggle = document.querySelector("[data-model-toggle]");
  const modelPicker = document.querySelector("[data-model-picker]");
  const modelName = document.querySelector(".model-name");
  const thinkToggle = document.querySelector("[data-think-toggle]");
  const webSearchToggle = document.querySelector("[data-web-search]");
  const usageIndicator = document.querySelector("[data-usage-indicator]");
  const usageLabel = document.querySelector("[data-usage-label]");
  const usageNotice = document.querySelector("[data-usage-notice]");
  const dictationBar = document.querySelector("[data-dictation-bar]");
  const dictationCancel = document.querySelector("[data-dictation-cancel]");
  const dictationStop = document.querySelector("[data-dictation-stop]");
  const dictationSend = document.querySelector("[data-dictation-send]");
  const sendButton = document.querySelector(".send-button");
  let recognition = null;
  let listening = false;
  let audioContext = null;
  let audioAnalyser = null;
  let audioSource = null;
  let audioStream = null;
  let audioFrame = 0;
  let activeRequestController = null;
  let generalAssistant = null;
  let thinkMode = false;
  let webSearch = false;
  let selectedModel = "xmanius-1";
  let thinkingSeconds = 1;
  const usageKey = "xmanius-usage-v1";
  const usageLimit = 50;
  const usageWindow = 5 * 60 * 60 * 1000;
  const readUsage = () => { try { const value = JSON.parse(localStorage.getItem(usageKey) || "null"); if (!value || Date.now() - value.startedAt >= usageWindow) return { count: 0, startedAt: Date.now() }; return value; } catch { return { count: 0, startedAt: Date.now() }; } };
  const updateUsage = (increment = false) => { const usage = readUsage(); if (increment) usage.count += 1; localStorage.setItem(usageKey, JSON.stringify(usage)); const percent = Math.min(100, Math.round(usage.count / usageLimit * 100)); usageIndicator?.style.setProperty("--usage", `${percent}%`); if (usageLabel) usageLabel.textContent = `${percent}%`; usageIndicator?.setAttribute("title", `${Math.max(0, usageLimit - usage.count)} requests left. Resets every 5 hours.`); if (usageNotice) { usageNotice.textContent = usage.count >= usageLimit ? "Your 5-hour Xmanius limit is over. It will refresh automatically." : ""; usageNotice.classList.toggle("is-visible", usage.count >= usageLimit); } return usage.count < usageLimit; };
  const chatsKey = "xmanius-chats-v1";
  let currentChatId = crypto.randomUUID?.() || String(Date.now());
  const readChats = () => { try { return JSON.parse(localStorage.getItem(chatsKey) || "[]"); } catch { return []; } };
  const saveChats = (chats) => localStorage.setItem(chatsKey, JSON.stringify(chats.slice(0, 50)));
  const saveCurrentChat = () => { const messages = [...list.querySelectorAll(".message")].map((item) => ({ type: item.classList.contains("user") ? "user" : "assistant", text: item.dataset.rawText || item.querySelector(".message-body")?.textContent || item.textContent.replace(/CopyRead aloud/g, "").trim() })).filter((item) => item.text); if (!messages.length) return; const chats = readChats(); const existing = chats.find((chat) => chat.id === currentChatId); const chat = { id: currentChatId, title: messages.find((item) => item.type === "user")?.text.slice(0, 42) || "New chat", messages, updatedAt: Date.now() }; if (existing) Object.assign(existing, chat); else chats.unshift(chat); saveChats(chats); renderRecents(); };
  const renderRecents = () => { if (!recent) return; recent.replaceChildren(); readChats().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt).forEach((chat) => { const row = document.createElement("div"); row.className = `conversation-row${chat.pinned ? " is-pinned" : ""}`; row.dataset.chatId = chat.id; const button = document.createElement("button"); button.className = "conversation"; button.type = "button"; button.dataset.chatId = chat.id; button.textContent = chat.title; const more = document.createElement("button"); more.className = "conversation-more"; more.type = "button"; more.dataset.chatMenu = chat.id; more.setAttribute("aria-label", `Options for ${chat.title}`); more.title = "Chat options"; more.textContent = "•••"; const menu = document.createElement("div"); menu.className = "conversation-menu"; menu.innerHTML = `<button type="button" data-chat-action="pin">${chat.pinned ? "Unpin" : "Pin"} chat</button><button type="button" data-chat-action="share">Share</button><button type="button" data-chat-action="delete">Delete</button>`; row.append(button, more, menu); recent.append(row); }); };
  const loadChat = (chatId) => { const chat = readChats().find((item) => item.id === chatId); if (!chat) return; list.replaceChildren(); empty.hidden = true; currentChatId = chat.id; chat.messages.forEach((message) => addMessage(message.text, message.type, { animate: false, persist: false })); };
  const localAnswer = (question) => {
    const q = question.toLowerCase();
    if (/^(hi|hello|hey)\b/.test(q)) return "Hello. I am Xmanius, ready to help.";
    if (/what can you do|help me/.test(q)) return "I can explain ideas, help with coding, plan tasks, summarize information, brainstorm, and answer everyday safe questions.";
    if (/productivity|focus/.test(q)) return "Choose one outcome, work in a short focused block, and remove the next distraction before you begin.";
    const math = question.match(/^\s*(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)\s*[?!.,]*\s*$/);
    if (math) { const a = Number(math[1]), b = Number(math[3]); return `The answer is ${math[2] === "+" ? a + b : math[2] === "-" ? a - b : math[2] === "*" ? a * b : b ? a / b : "undefined"}.`; }
    return null;
  };
  const speak = (text) => { if (!("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = navigator.language || "en-US"; utterance.rate = .88; utterance.pitch = .82; window.speechSynthesis.speak(utterance); };
  const escapeHtml = (value) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const normalizeResponseText = (value) => String(value || "").replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  const cleanMath = (value) => normalizeResponseText(value).replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)").replace(/\\left|\\right/g, "").replace(/\\cdot|\\times/g, "×").replace(/\\pm/g, "±").replace(/\\,|\\;/g, " ").replace(/\$\$?([^$]+)\$\$?/g, "$1").replace(/\\([a-zA-Z]+)/g, "$1").replace(/\$/g, "");
  const renderMathMarkup = (value) => {
    let markup = escapeHtml(normalizeResponseText(value).replace(/^\$\$|^\$|\$\$$|\$$/g, "").replace(/^\\\[|\\\]$/g, "").replace(/^\\\(|\\\)$/g, "").replace(/\\left|\\right/g, ""));
    for (let pass = 0; pass < 3; pass += 1) markup = markup.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="math-fraction"><span>$1</span><span>$2</span></span>').replace(/\\sqrt\{([^{}]+)\}/g, '<span class="math-sqrt">√<span>$1</span></span>').replace(/\\boxed\{([^{}]+)\}/g, '<span class="math-answer-box">$1</span>').replace(/\\text\{([^{}]+)\}/g, "$1");
    return markup.replace(/\\leq?|&lt;=/g, "≤").replace(/\\geq?|&gt;=/g, "≥").replace(/\\neq/g, "≠").replace(/\\in\b/g, "∈").replace(/\\notin\b/g, "∉").replace(/\\times|\\cdot/g, "×").replace(/\\pm/g, "±").replace(/\\dots?|\\ldots/g, "…").replace(/\\to/g, "→").replace(/\\pi/g, "π").replace(/\\alpha/g, "α").replace(/\\beta/g, "β").replace(/\\theta/g, "θ").replace(/\\([{}])/g, "$1").replace(/\^\{([^{}]+)\}/g, "<sup>$1</sup>").replace(/\^([A-Za-z0-9]+)/g, "<sup>$1</sup>").replace(/_\{([^{}]+)\}/g, "<sub>$1</sub>").replace(/_([A-Za-z0-9]+)/g, "<sub>$1</sub>");
  };
  const inlineMarkdown = (value) => {
    const mathPattern = /(\$\$[^$]+\$\$|\$[^$]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
    let output = "";
    let cursor = 0;
    for (const match of String(value).matchAll(mathPattern)) {
      output += escapeHtml(cleanMath(value.slice(cursor, match.index))).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*\*/g, "").replace(/`(.+?)`/g, "<code>$1</code>");
      output += `<span class="math-inline">${renderMathMarkup(match[0])}</span>`;
      cursor = match.index + match[0].length;
    }
    output += escapeHtml(cleanMath(String(value).slice(cursor))).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*\*/g, "").replace(/`(.+?)`/g, "<code>$1</code>");
    return output.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  };
  const highlightCode = (value) => escapeHtml(value).replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span class="syntax-comment">$1</span>').replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span class="syntax-string">$1</span>').replace(/\b(const|let|var|function|return|if|else|for|while|new|class|async|await|import|from|true|false|null|undefined)\b/g, '<span class="syntax-keyword">$1</span>').replace(/(&lt;\/?)([A-Za-z][\w-]*)/g, '$1<span class="syntax-tag">$2</span>');
  const youtubeSourcesFromText = (value) => [...value.matchAll(/https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)[A-Za-z0-9_-]{6,}|youtu\.be\/[A-Za-z0-9_-]{6,})[^\s)<>]*/gi)].map((match) => ({ title: "YouTube video", url: match[0].replace(/[.,]$/, ""), snippet: "Open or watch this video preview", displayLink: "youtube.com" }));
  const tableCells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  const isTableDivider = (line) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
  const renderTable = (header, rows) => `<div class="table-scroll"><table><thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${header.map((_, index) => `<td>${inlineMarkdown(row[index] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const renderMarkdown = (element, text) => {
    text = normalizeResponseText(text);
    const lines = text.split(/\r?\n/);
    const output = [];
    let bullets = [];
    let numbered = [];
    let index = 0;
    let highlightNextMath = false;
    const flushBullets = () => { if (!bullets.length) return; output.push(`<ul>${bullets.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`); bullets = []; };
    const flushNumbered = () => { if (!numbered.length) return; output.push(`<ol>${numbered.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ol>`); numbered = []; };
    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();
      if (!trimmed) { flushBullets(); flushNumbered(); index += 1; continue; }
      const fence = trimmed.match(/^```\s*([\w+#.-]*)\s*$/);
      if (fence) {
        flushBullets();
        const language = fence[1] || "code";
        const codeLines = [];
        index += 1;
        while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) { codeLines.push(lines[index]); index += 1; }
        if (index < lines.length) index += 1;
        output.push(`<section class="code-block" data-code-block data-language="${escapeHtml(language)}"><header><span>${escapeHtml(language)}</span><div><button type="button" data-code-action="copy">Copy</button><button type="button" data-code-action="download">Download</button><button type="button" data-code-action="run">Run</button></div></header><pre><code>${highlightCode(codeLines.join("\n"))}</code></pre></section>`);
        continue;
      }
      if (index + 1 < lines.length && trimmed.includes("|") && isTableDivider(lines[index + 1])) {
        flushBullets(); flushNumbered();
        const header = tableCells(trimmed);
        const rows = [];
        index += 2;
        while (index < lines.length && lines[index].trim().includes("|") && lines[index].trim()) { rows.push(tableCells(lines[index])); index += 1; }
        output.push(renderTable(header, rows));
        continue;
      }
      const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bullet) { bullets.push(bullet[1]); index += 1; continue; }
      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (ordered) { flushBullets(); numbered.push(ordered[1]); index += 1; continue; }
      flushBullets(); flushNumbered();
      if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) { output.push("<hr>"); index += 1; continue; }
      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) { output.push(`<h3>${inlineMarkdown(heading[2])}</h3>`); highlightNextMath = /final answer/i.test(heading[2]); index += 1; continue; }
      if (/^\s*(\$\$|\\\[)/.test(trimmed)) {
        const close = trimmed.startsWith("$$") ? "$$" : "\\]";
        const openingLength = trimmed.startsWith("$$") ? 2 : 2;
        const sameLineEnd = trimmed.indexOf(close, openingLength);
        let math = trimmed.slice(openingLength, sameLineEnd >= 0 ? sameLineEnd : undefined);
        index += 1;
        while (sameLineEnd < 0 && index < lines.length && !lines[index].includes(close)) { math += `\n${lines[index]}`; index += 1; }
        if (sameLineEnd < 0 && index < lines.length) math += `\n${lines[index].slice(0, lines[index].indexOf(close))}`;
        if (sameLineEnd < 0 && index < lines.length) index += 1;
        const important = /\\boxed|final answer/i.test(math) || highlightNextMath;
        output.push(`<div class="math-block${important ? " math-highlight" : ""}" data-math="true">${renderMathMarkup(math)}</div>`);
        highlightNextMath = false;
        continue;
      }
      const mathWords = /\b(?:the|given|set|substitute|since|this|test|step|solution|final|answer|positive|integer|into|inequality|yields|valid|number|possible|must|there|need|is|are|for|from|and|only|check|we)\b/i;
      if (/^(?=.*(?:=|\\leq?|\\geq?|\\in\b|\\frac|\^|≤|≥|∈)).{2,90}$/.test(trimmed) && !mathWords.test(trimmed) && !/[.!?]$/.test(trimmed)) {
        output.push(`<div class="math-block${highlightNextMath ? " math-highlight" : ""}" data-math="true">${renderMathMarkup(trimmed)}</div>`);
        highlightNextMath = false;
        index += 1;
        continue;
      }
      highlightNextMath = /final answer\s*:?$/i.test(trimmed);
      output.push(`<p>${inlineMarkdown(trimmed)}</p>`);
      index += 1;
    }
    flushBullets(); flushNumbered();
    element.innerHTML = output.join("");
  };
  const animateAssistantText = (body, text, cursor) => {
    if (!body || !cursor || !text) return;
    if (/```/.test(text)) {
      body.replaceChildren();
      renderMarkdown(body, text);
      cursor.remove();
      return;
    }
    if (text.length > 6000) {
      body.replaceChildren();
      renderMarkdown(body, text);
      cursor.remove();
      return;
    }
    const total = text.length;
    const duration = Math.min(20000, Math.max(1800, total * 22));
    const interval = 18;
    const chunk = Math.max(1, Math.ceil(total / (duration / interval)));
    let position = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      body.replaceChildren();
      renderMarkdown(body, text);
      cursor.remove();
    };
    const tick = () => {
      if (finished) return;
      position = Math.min(total, position + chunk);
      body.replaceChildren();
      renderMarkdown(body, text.slice(0, position));
      const target = body.querySelector("p:last-of-type, li:last-of-type, h3:last-of-type, td:last-of-type, th:last-of-type") || body;
      target.append(cursor);
      document.querySelector(".chat-content").scrollTop = document.querySelector(".chat-content").scrollHeight;
      if (position < total) window.setTimeout(tick, 18);
      else window.setTimeout(finish, 0);
    };
    body.replaceChildren();
    body.append(cursor);
    tick();
    window.setTimeout(finish, duration + 1000);
  };
  const safeThinkingSummary = (question) => {
    const q = String(question || "").toLowerCase();
    if (/^(hi|hello|hey)\b/.test(q)) return "This is a simple greeting, so I’ll respond warmly and invite the conversation to continue.";
    if (/code|javascript|html|css|python|error|bug|not working/.test(q)) return "I identified the requested technical outcome, checked the relevant constraints, and organized the response as a practical implementation or correction.";
    if (/solve|equation|math|integral|inequality|calculate|factor/.test(q)) return "I identified the mathematical information, checked the assumptions and operations, and arranged the solution in a clear sequence.";
    if (/search|find|latest|current|source|youtube|video/.test(q)) return "I identified the information being requested, checked the relevant sources, and organized the useful results and links.";
    return "I identified the main request, considered relevant conversation context, checked important assumptions, and organized the answer clearly.";
  };
  const addMessage = (text, type, { animate = false, persist = true, sources = [], searchError = "", reasoningSummary = "" } = {}) => {
    text = normalizeResponseText(text);
    empty.hidden = true;
    const displaySources = [...new Map([...sources, ...youtubeSourcesFromText(text)].filter((source) => source?.url).map((source) => [source.url, source])).values()];
    const item = document.createElement("article");
    item.className = `message ${type}${type === "assistant" && text.length >= 650 ? " long-response" : ""}`;
    item.dataset.rawText = text;
    const body = document.createElement("div");
    body.className = "message-body";
    if (type === "assistant") renderMarkdown(body, text); else body.textContent = text;
    const responseCursor = type === "assistant" && animate ? document.createElement("span") : null;
    if (responseCursor) { responseCursor.className = "xmanius-typing-cursor"; responseCursor.setAttribute("aria-hidden", "true"); body.append(responseCursor); }
    let thoughtSummary = null;
    if (type === "assistant" && thinkMode) {
      thoughtSummary = document.createElement("details");
      thoughtSummary.className = "thinking-summary";
      thoughtSummary.open = true;
      const summary = document.createElement("summary");
      summary.innerHTML = `<span class="thought-glyph">✥</span> Thought for ${thinkingSeconds} second${thinkingSeconds === 1 ? "" : "s"}`;
      const explanation = document.createElement("p");
      explanation.textContent = reasoningSummary || "I interpreted the request, checked the relevant context, and organized the answer. Private chain-of-thought is not displayed.";
      thoughtSummary.append(summary, explanation);
      item.append(thoughtSummary);
    }
    item.append(body);
    if (type === "assistant") {
      body.querySelectorAll("[data-code-block]").forEach((block) => {
        const code = block.querySelector("code")?.textContent || "";
        const language = block.dataset.language || "code";
        block.querySelector('[data-code-action="copy"]')?.addEventListener("click", async (event) => { try { await navigator.clipboard.writeText(code); event.currentTarget.textContent = "Copied"; window.setTimeout(() => { event.currentTarget.textContent = "Copy"; }, 1300); } catch { event.currentTarget.textContent = "Copy failed"; } });
        block.querySelector('[data-code-action="download"]')?.addEventListener("click", () => { const extension = language === "html" ? "html" : language === "javascript" || language === "js" ? "js" : language === "css" ? "css" : "txt"; const blob = new Blob([code], { type: "text/plain;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `xmanius-code.${extension}`; link.click(); URL.revokeObjectURL(link.href); });
        block.querySelector('[data-code-action="run"]')?.addEventListener("click", () => { if (!/^html?$/i.test(language)) { window.alert("Run is available for HTML code blocks."); return; } const preview = window.open("about:blank", "_blank"); if (!preview) return; preview.document.open(); preview.document.write(code); preview.document.close(); });
      });
      if (searchError) { const notice = document.createElement("p"); notice.className = "search-error"; notice.textContent = searchError; item.append(notice); }
      if (displaySources.length) {
        const sourcePanel = document.createElement("section");
        sourcePanel.className = "source-panel";
        sourcePanel.innerHTML = `<div class="source-heading"><span class="source-earth">◎</span><strong>Sources searched</strong><span>${displaySources.length}</span></div>`;
        const sourceGrid = document.createElement("div");
        sourceGrid.className = "source-grid";
        displaySources.slice(0, 8).forEach((source) => {
          if (!source?.url) return;
          const youtubeMatch = source.url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
          const card = document.createElement(youtubeMatch ? "article" : "a");
          card.className = "source-card";
          if (!youtubeMatch) { card.href = source.url; card.target = "_blank"; card.rel = "noopener noreferrer"; }
          if (youtubeMatch) { const frame = document.createElement("iframe"); frame.src = `https://www.youtube-nocookie.com/embed/${youtubeMatch[1]}?rel=0`; frame.title = source.title || "YouTube video preview"; frame.loading = "lazy"; frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"; frame.referrerPolicy = "strict-origin-when-cross-origin"; frame.setAttribute("allowfullscreen", "true"); card.append(frame); }
          const details = document.createElement("span");
          details.className = "source-card-details";
          const title = document.createElement("strong");
          title.textContent = source.title || source.url;
          const domain = document.createElement("small");
          domain.textContent = source.displayLink || (() => { try { return new URL(source.url).hostname; } catch { return source.url; } })();
          const snippet = document.createElement("span");
          snippet.className = "source-snippet";
          snippet.textContent = source.snippet || "Open source";
          details.append(title, domain, snippet);
          if (source.thumbnail) { const image = document.createElement("img"); image.src = source.thumbnail; image.alt = ""; image.loading = "lazy"; image.referrerPolicy = "no-referrer"; card.append(image); }
          card.append(details);
          if (youtubeMatch) { const link = document.createElement("a"); link.className = "source-open-link"; link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open on YouTube ↗"; card.append(link); }
          sourceGrid.append(card);
        });
        sourcePanel.append(sourceGrid);
        item.append(sourcePanel);
      }
      const actions = document.createElement("div");
      actions.className = "message-actions";
      actions.innerHTML = '<button type="button" data-copy-message aria-label="Copy response" title="Copy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></button><button type="button" data-read-message aria-label="Read response aloud" title="Read aloud"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"></path></svg></button>';
      actions.querySelector("[data-copy-message]").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(text); actions.querySelector("[data-copy-message]").textContent = "✓"; } catch { /* Clipboard may be unavailable on file:// pages. */ }
      });
      const shareButton = document.createElement("button");
      shareButton.type = "button";
      shareButton.dataset.shareMessage = "true";
      shareButton.setAttribute("aria-label", "Share response");
      shareButton.title = "Share";
      shareButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"></path><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"></path></svg>';
      actions.append(shareButton);
      actions.querySelector("[data-read-message]").addEventListener("click", () => speak(text));
      shareButton.addEventListener("click", async () => { if (navigator.share) await navigator.share({ title: "Xmanius response", text }).catch(() => {}); else await navigator.clipboard?.writeText(text); });
      item.append(actions);
    }
    list.append(item);
    if (persist) saveCurrentChat();
    if (animate && type === "assistant") animateAssistantText(body, text, responseCursor);
    document.querySelector(".chat-content").scrollTop = document.querySelector(".chat-content").scrollHeight;
  };
  const setSendingState = (active) => { sendButton?.classList.toggle("is-stop", active); if (sendButton) { sendButton.setAttribute("aria-label", active ? "Stop response" : "Send message"); sendButton.title = active ? "Stop response" : "Send message"; sendButton.innerHTML = active ? '<span class="send-stop-icon" aria-hidden="true"></span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>'; } };
  const hasCodeInHistory = () => [...list.querySelectorAll(".message.assistant")].some((item) => item.querySelector("[data-code-block]") || /```|<\/?(?:html|script|style|div|button|function|const|let)\b/i.test(item.dataset.rawText || ""));
  const needsCodeRethink = (question) => hasCodeInHistory() && /\b(?:error|bug|fault|broken|failed|failure|not\s+working|doesn['’]?t\s+work|does\s+not\s+work|fix\s+this|wrong)\b/i.test(question);
  const conversationHistory = () => [...list.querySelectorAll(".message")].slice(-12).map((item) => ({ role: item.classList.contains("user") ? "user" : "model", text: item.dataset.rawText || item.querySelector(".message-body")?.textContent?.trim() || "" })).filter((item) => item.text);
  const ask = async (question) => { const q = question.trim(); if (!q || activeRequestController) return; if (!updateUsage()) return; const history = conversationHistory(); const rethink = needsCodeRethink(q); addMessage(q, "user"); input.value = ""; updateUsage(true); const local = localAnswer(q); if (local && !thinkMode && !webSearch && selectedModel === "xmanius-1") { addMessage(local, "assistant", { animate: true }); return; } const thinking = document.createElement("article"); thinking.className = "message assistant thinking ai-message--thinking"; thinking.setAttribute("role", "status"); thinking.innerHTML = `<span>${thinkMode ? "Thinking carefully" : webSearch ? "Searching multiple sources" : rethink ? "Checking the previous code" : "Thinking"}</span><i></i><i></i><i></i>`; list.append(thinking); document.querySelector(".chat-content").scrollTop = document.querySelector(".chat-content").scrollHeight; activeRequestController = new AbortController(); const startedAt = performance.now(); const timeout = window.setTimeout(() => activeRequestController?.abort(), 120000); setSendingState(true); try { const response = await fetch("/api/xmanius-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q, model: selectedModel, thinkMode, webSearch, history, rethink }), signal: activeRequestController.signal }); const data = await response.json().catch(() => ({})); thinkingSeconds = Math.max(1, Math.round((performance.now() - startedAt) / 1000)); thinking.remove(); addMessage(response.ok ? data.reply : (data.userMessage || data.error || `The AI request failed (${response.status}).`), "assistant", { animate: true, sources: response.ok ? data.sources : [], searchError: response.ok ? data.searchError : "", reasoningSummary: response.ok ? safeThinkingSummary(q) : "" }); } catch (error) { thinking.remove(); if (error.name === "AbortError") addMessage("The response was stopped by you.", "assistant", { animate: true }); else addMessage(`The AI service could not be reached. ${error?.message || "Please check the deployment and API configuration."}`, "assistant", { animate: true }); } finally { window.clearTimeout(timeout); activeRequestController = null; setSendingState(false); } };
  let voiceSessionId = 0;
  let voiceNoticeTimer = 0;
  const showVoiceNotice = (message, duration = 4500) => { if (!usageNotice) { console.warn(`[Xmanius voice] ${message}`); return; } window.clearTimeout(voiceNoticeTimer); usageNotice.textContent = message; usageNotice.classList.add("is-visible"); voiceNoticeTimer = window.setTimeout(() => { if (usageNotice.textContent === message) { usageNotice.textContent = ""; usageNotice.classList.remove("is-visible"); } }, duration); };
  const stopAudioMeter = () => { if (audioFrame) { window.cancelAnimationFrame(audioFrame); audioFrame = 0; } try { audioSource?.disconnect(); } catch {} audioSource = null; audioAnalyser = null; audioStream?.getTracks().forEach((track) => { try { track.stop(); } catch {} }); audioStream = null; const context = audioContext; audioContext = null; if (context && context.state !== "closed") void context.close().catch(() => {}); };
  const setDictation = (active) => { form.classList.toggle("is-listening", active); dictationBar?.setAttribute("aria-hidden", String(!active)); dictationBar?.style.setProperty("display", active ? "flex" : "none", "important"); if (active) { const waveform = document.querySelector(".dictation-waveform"); if (waveform && waveform.children.length < 80) { waveform.replaceChildren(); for (let index = 0; index < 96; index += 1) waveform.append(document.createElement("i")); } return; } input.placeholder = "Ask anything"; document.querySelector("[data-chat-mic]")?.classList.remove("active"); stopAudioMeter(); };
  const finishVoiceSession = ({ clearText = false, focus = true, abort = false } = {}) => { voiceSessionId += 1; const oldRecognition = recognition; recognition = null; listening = false; if (abort) { try { oldRecognition?.abort(); } catch {} } if (clearText) input.value = ""; setDictation(false); input.placeholder = "Ask anything"; if (focus) input.focus(); };
  const startAudioMeter = async () => { if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone metering is unavailable in this browser."); const AudioContextClass = window.AudioContext || window.webkitAudioContext; if (!AudioContextClass) throw new Error("Audio visualization is unavailable in this browser."); const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); if (!form.classList.contains("is-listening")) { stream.getTracks().forEach((track) => track.stop()); return; } audioStream = stream; audioContext = new AudioContextClass(); await audioContext.resume().catch(() => {}); audioAnalyser = audioContext.createAnalyser(); audioAnalyser.fftSize = 256; audioAnalyser.smoothingTimeConstant = .78; audioAnalyser.minDecibels = -90; audioAnalyser.maxDecibels = -10; audioSource = audioContext.createMediaStreamSource(audioStream); audioSource.connect(audioAnalyser); const waveform = document.querySelector(".dictation-waveform"); if (!waveform) return; if (waveform.children.length < 80) { waveform.replaceChildren(); for (let index = 0; index < 96; index += 1) waveform.append(document.createElement("i")); } const bars = [...waveform.querySelectorAll("i")]; const frequencies = new Uint8Array(audioAnalyser.frequencyBinCount); const meter = () => { if (!audioAnalyser || !form.classList.contains("is-listening")) return; audioAnalyser.getByteFrequencyData(frequencies); bars.forEach((bar, index) => { const start = Math.floor(index * frequencies.length / bars.length); const end = Math.max(start + 1, Math.floor((index + 1) * frequencies.length / bars.length)); let total = 0; for (let offset = start; offset < end; offset += 1) total += frequencies[offset] || 0; const level = total / ((end - start) * 255); bar.style.height = `${Math.max(3, 3 + level * 29)}px`; bar.style.opacity = `${Math.min(1, Math.max(.35, .35 + level))}`; }); audioFrame = window.requestAnimationFrame(meter); }; meter(); };
  const startVoice = () => { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) { finishVoiceSession({ focus: true }); showVoiceNotice("Voice input is not supported here. Try Chrome or Edge over HTTPS, or use the text box."); return; } if (recognition || form.classList.contains("is-listening")) return; const sessionId = ++voiceSessionId; const instance = new Recognition(); let finalText = ""; recognition = instance; listening = false; setDictation(true); input.placeholder = "Listening…"; document.querySelector("[data-chat-mic]")?.classList.add("active"); instance.lang = navigator.language || "en-US"; instance.interimResults = true; instance.continuous = false; instance.maxAlternatives = 1; const isCurrentSession = () => recognition === instance && voiceSessionId === sessionId; instance.onstart = () => { if (!isCurrentSession()) return; listening = true; input.placeholder = "Listening…"; void startAudioMeter().catch((error) => { if (isCurrentSession()) { stopAudioMeter(); showVoiceNotice("Voice transcription is active, but the waveform is unavailable."); console.warn("[Xmanius voice meter]", error); } }); }; instance.onresult = (event) => { if (!isCurrentSession()) return; let interimText = ""; for (let index = event.resultIndex; index < event.results.length; index += 1) { const transcript = event.results[index][0]?.transcript || ""; if (event.results[index].isFinal) finalText += transcript; else interimText += transcript; } input.value = `${finalText}${interimText}`.trim(); }; instance.onerror = (event) => { if (!isCurrentSession()) return; const messages = { "not-allowed": "Microphone permission was denied. Allow microphone access and try again.", "service-not-allowed": "The browser speech service is unavailable. Try again or use the text box.", "no-speech": "No speech was detected. Try again when you are ready.", "audio-capture": "No working microphone was found. Check your device settings.", network: "Voice recognition needs a network connection. Try again.", aborted: "Voice input was cancelled." }; const message = messages[event.error] || "Voice input stopped unexpectedly. Try again."; finishVoiceSession({ focus: true }); if (event.error !== "aborted") showVoiceNotice(message); }; instance.onend = () => { if (isCurrentSession()) finishVoiceSession({ focus: true }); }; try { instance.start(); } catch { if (isCurrentSession()) { finishVoiceSession({ focus: true }); showVoiceNotice("Voice input could not start. Please try again."); } } };
  form.addEventListener("submit", (event) => { event.preventDefault(); ask(input.value); });
  sendButton?.addEventListener("click", (event) => { if (!activeRequestController) return; event.preventDefault(); activeRequestController.abort(); });
  document.querySelector("[data-chat-mic]")?.addEventListener("click", startVoice);
  dictationCancel?.addEventListener("click", () => finishVoiceSession({ clearText: true, focus: true, abort: true }));
  dictationStop?.addEventListener("click", () => { if (!recognition) { finishVoiceSession({ focus: true }); return; } try { recognition.stop(); } catch { finishVoiceSession({ focus: true, abort: true }); } });
  dictationSend?.addEventListener("click", () => { const dictatedText = input.value.trim(); finishVoiceSession({ clearText: true, focus: false, abort: true }); if (dictatedText) void ask(dictatedText); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && (recognition || form.classList.contains("is-listening"))) finishVoiceSession({ focus: false, abort: true }); });
  window.addEventListener("pagehide", () => finishVoiceSession({ focus: false, abort: true }));
  const setModelPicker = (open) => { modelPicker?.classList.toggle("is-open", open); modelToggle?.setAttribute("aria-expanded", String(open)); };
  modelToggle?.addEventListener("click", () => setModelPicker(!modelPicker.classList.contains("is-open")));
  modelPicker?.addEventListener("click", (event) => { if (event.target.closest("[data-voice-chat]")) { setModelPicker(false); input.placeholder = "Voice chat is ready"; return; } const option = event.target.closest("[data-model]"); if (option) { selectedModel = option.dataset.model || "xmanius-1"; modelPicker.querySelectorAll("[data-model]").forEach((item) => { const active = item === option; item.classList.toggle("is-selected", active); item.setAttribute("aria-pressed", String(active)); item.querySelector("b").textContent = active ? "✓" : ""; }); if (modelName) modelName.innerHTML = `${selectedModel === "xmanius-3" ? "Xmanius 3" : selectedModel === "xmanius-2" ? "Xmanius 2" : "Xmanius 1"} <span>⌄</span>`; setModelPicker(false); } });
  document.addEventListener("click", (event) => { if (modelPicker?.classList.contains("is-open") && !event.target.closest(".chat-composer")) setModelPicker(false); });
  const reset = () => { saveCurrentChat(); currentChatId = crypto.randomUUID?.() || String(Date.now()); list.replaceChildren(); empty.hidden = false; input.value = ""; input.focus(); };
  document.querySelectorAll("[data-new-chat]").forEach((button) => button.addEventListener("click", reset));
  recent?.addEventListener("click", async (event) => { const menuButton = event.target.closest("[data-chat-menu]"); if (menuButton) { recent.querySelectorAll(".conversation-row.is-menu-open").forEach((row) => row.classList.remove("is-menu-open")); menuButton.closest(".conversation-row").classList.toggle("is-menu-open"); return; } const action = event.target.closest("[data-chat-action]"); if (action) { const row = action.closest(".conversation-row"); const chats = readChats(); const chat = chats.find((item) => item.id === row.dataset.chatId); if (!chat) return; if (action.dataset.chatAction === "pin") chat.pinned = !chat.pinned; if (action.dataset.chatAction === "delete") { saveChats(chats.filter((item) => item.id !== chat.id)); if (chat.id === currentChatId) { currentChatId = crypto.randomUUID?.() || String(Date.now()); list.replaceChildren(); empty.hidden = false; input.value = ""; } renderRecents(); return; } if (action.dataset.chatAction === "share") { const shareText = `${chat.title}\n\n${chat.messages.map((item) => `${item.type === "user" ? "You" : "Xmanius"}: ${item.text}`).join("\n\n")}`; if (navigator.share) await navigator.share({ title: chat.title, text: shareText }).catch(() => {}); else await navigator.clipboard?.writeText(shareText); } saveChats(chats); renderRecents(); return; } const button = event.target.closest("button[data-chat-id]"); if (button) { loadChat(button.dataset.chatId); recent.querySelectorAll(".is-menu-open").forEach((row) => row.classList.remove("is-menu-open")); } });
  document.addEventListener("click", (event) => { if (!event.target.closest(".conversation-row")) recent?.querySelectorAll(".is-menu-open").forEach((row) => row.classList.remove("is-menu-open")); });
  document.querySelector("[data-open-sidebar]")?.addEventListener("click", () => app.classList.add("sidebar-visible"));
  document.querySelector("[data-close-sidebar]")?.addEventListener("click", () => { if (window.matchMedia("(max-width: 720px)").matches) app.classList.remove("sidebar-visible"); else { const collapsed = app.classList.toggle("sidebar-collapsed"); const button = document.querySelector("[data-close-sidebar]"); button?.setAttribute("aria-label", collapsed ? "Open sidebar" : "Collapse sidebar"); button?.setAttribute("title", collapsed ? "Open sidebar" : "Collapse sidebar"); } });
  thinkToggle?.addEventListener("click", () => { thinkMode = !thinkMode; thinkToggle.classList.toggle("active", thinkMode); thinkToggle.setAttribute("aria-pressed", String(thinkMode)); });
  webSearchToggle?.addEventListener("click", () => { webSearch = !webSearch; webSearchToggle.classList.toggle("active", webSearch); webSearchToggle.setAttribute("aria-pressed", String(webSearch)); });
  usageIndicator?.addEventListener("click", () => { updateUsage(); usageNotice?.classList.toggle("is-visible"); });
  accountButton?.addEventListener("click", () => { const connected = localStorage.getItem("xmanius-google-connected") === "true"; if (!connected) { const proceed = window.confirm("Google account connection needs OAuth setup for this deployment. Use this browser as a local account for now?"); if (proceed) { localStorage.setItem("xmanius-google-connected", "true"); accountName.textContent = "Local user"; accountStatus.textContent = "Browser account"; } } else { accountName.textContent = "Local user"; accountStatus.textContent = "Browser account"; } });
  updateUsage();
  renderRecents();

  const createGeneralAssistant = () => {
    const panel = document.createElement("section");
    panel.className = "ai-guide xmanius-general-assistant";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `<div class="ai-guide__dialog" role="dialog" aria-modal="true" aria-label="Xmanius voice assistant">
      <button class="ai-guide__compact-close" type="button" data-general-close aria-label="Close voice assistant"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg></button>
      <div class="ai-guide__orb-stage"><canvas class="ai-guide__orb" width="600" height="600" aria-hidden="true"></canvas><span class="ai-guide__orb-state">Ready</span></div>
      <p class="ai-guide__voice-greeting">Hi, I’m Xmanius. Ask me anything.</p>
      <div class="ai-guide__messages ai-guide__subtitle" aria-live="polite"></div>
      <div class="ai-guide__voice-controls"><button class="ai-guide__voice-control" type="button" data-general-close aria-label="Close voice assistant"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg></button><button class="ai-guide__voice-control ai-guide__voice-control--mic" type="button" data-general-mic aria-label="Start live voice conversation"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg></button></div>
    </div>`;
    document.body.append(panel);
    return panel;
  };

  const openGeneralVoice = () => {
    if (!generalAssistant) generalAssistant = createGeneralAssistant();
    generalAssistant.classList.add("is-open", "is-voice-mode");
    generalAssistant.setAttribute("aria-hidden", "false");
    const canvas = generalAssistant.querySelector("canvas");
    if (!canvas.dataset.started) { canvas.dataset.started = "true"; const ctx = canvas.getContext("2d"); const draw = (time) => { if (!generalAssistant?.classList.contains("is-open")) return; const dpr = Math.min(2, devicePixelRatio || 1); const size = Math.min(canvas.clientWidth || 420, canvas.clientHeight || 420); canvas.width = size * dpr; canvas.height = size * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size); const cx = size / 2, cy = size / 2, radius = size * (.27 + Math.sin(time / 900) * .015); const glow = ctx.createRadialGradient(cx, cy, radius * .1, cx, cy, radius * 1.25); glow.addColorStop(0, "rgba(255,255,255,.98)"); glow.addColorStop(.2, "rgba(109,229,255,.92)"); glow.addColorStop(.58, "rgba(78,142,255,.72)"); glow.addColorStop(1, "rgba(125,72,201,0)"); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(160,225,255,.7)"; ctx.lineWidth = 1.2; for (let i = 0; i < 90; i++) { const a = i * 2.399 + time / 5200; const r = radius * (.72 + (i % 7) / 25); ctx.fillStyle = `rgba(210,245,255,${.35 + (i % 5) / 10})`; ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5, 1.5); } requestAnimationFrame(draw); }; requestAnimationFrame(draw); }
    const micButton = generalAssistant.querySelector("[data-general-mic]");
    if (!micButton.dataset.bound) { micButton.dataset.bound = "true"; micButton.addEventListener("click", () => startGeneralRecognition(generalAssistant)); }
    generalAssistant.querySelectorAll("[data-general-close]").forEach((button) => { if (button.dataset.bound) return; button.dataset.bound = "true"; button.addEventListener("click", () => { generalAssistant.classList.remove("is-open", "is-voice-mode"); generalAssistant.setAttribute("aria-hidden", "true"); }); });
  };

  const startGeneralRecognition = (panel) => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { panel.querySelector(".ai-guide__voice-greeting").textContent = "Voice input needs Chrome or Edge over HTTPS or localhost."; return; }
    const recognitionInstance = new Recognition(); recognitionInstance.lang = navigator.language || "en-US"; recognitionInstance.interimResults = false; recognitionInstance.continuous = false;
    const mic = panel.querySelector("[data-general-mic]"); recognitionInstance.onstart = () => { panel.dataset.voiceState = "listening"; mic.classList.add("is-active"); panel.querySelector(".ai-guide__voice-greeting").textContent = "Listening…"; }; recognitionInstance.onresult = async (event) => { const question = event.results[0][0].transcript.trim(); panel.dataset.voiceState = "thinking"; panel.querySelector(".ai-guide__voice-greeting").textContent = "Thinking…"; const response = await fetch("api/xmanius-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question }) }); const data = await response.json(); const answer = data.reply || data.error || "I could not answer that right now."; panel.querySelector(".ai-guide__voice-greeting").textContent = answer; if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(answer)); panel.dataset.voiceState = "speaking"; }; recognitionInstance.onend = () => { mic.classList.remove("is-active"); }; recognitionInstance.start();
  };
  window.__openXmaniusVoice = openGeneralVoice;
  document.addEventListener("click", (event) => { if (event.target.closest("[data-voice-chat]")) openGeneralVoice(); });
})();
