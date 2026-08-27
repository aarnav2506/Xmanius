(() => {
  "use strict";
  const app = document.querySelector(".chat-app");
  const form = document.querySelector("[data-chat-form]");
  const input = document.querySelector("[data-chat-input]");
  const list = document.querySelector("[data-message-list]");
  const chatContent = document.querySelector(".chat-content");
  const empty = document.querySelector("[data-empty-state]");
  const recent = document.querySelector("[data-recent-list]");
  const accountButton = document.querySelector("[data-account-button]");
  const accountName = document.querySelector("[data-account-name]");
  const accountStatus = document.querySelector("[data-account-status]");
  const modelToggle = document.querySelector("[data-model-toggle]");
  const modelPicker = document.querySelector("[data-model-picker]");
  const modelName = document.querySelector(".model-name");
  const headerModelToggle = document.querySelector("[data-model-menu]");
  const thinkToggle = document.querySelector("[data-think-toggle]");
  const webSearchToggle = document.querySelector("[data-web-search]");
  const usageIndicator = document.querySelector("[data-usage-indicator]");
  const usageLabel = document.querySelector("[data-usage-label]");
  const usageReset = document.querySelector("[data-usage-reset]");
  const usageNotice = document.querySelector("[data-usage-notice]");
  const dictationBar = document.querySelector("[data-dictation-bar]");
  const dictationCancel = document.querySelector("[data-dictation-cancel]");
  const dictationStop = document.querySelector("[data-dictation-stop]");
  const dictationSend = document.querySelector("[data-dictation-send]");
  const sendButton = document.querySelector(".send-button");
  const attachments = document.querySelector("[data-attachments]");
  const fileInput = document.querySelector("[data-file-input]");
  const cameraInput = document.querySelector("[data-camera-input]");
  const attachFilesButton = document.querySelector("[data-attach-files]");
  const attachCameraButton = document.querySelector("[data-attach-camera]");
  let recognition = null;
  let listening = false;
  let audioContext = null;
  let audioAnalyser = null;
  let audioSource = null;
  let audioStream = null;
  let audioFrame = 0;
  let activeRequestController = null;
  let activeRequestStopReason = "";
  let generalAssistant = null;
  let thinkMode = false;
  let webSearch = false;
  let selectedModel = "xmanius-1";
  let followChatBottom = true;
  const isChatNearBottom = (threshold = 120) => !chatContent || chatContent.scrollHeight - chatContent.scrollTop - chatContent.clientHeight <= threshold;
  const scrollChatToBottom = ({ force = false, behavior = "auto" } = {}) => {
    if (!chatContent || (!force && !followChatBottom)) return;
    followChatBottom = true;
    if (typeof chatContent.scrollTo === "function") chatContent.scrollTo({ top: chatContent.scrollHeight, behavior });
    else chatContent.scrollTop = chatContent.scrollHeight;
  };
  chatContent?.addEventListener("scroll", () => { followChatBottom = isChatNearBottom(); }, { passive: true });
  window.XmaniusScrollController = Object.freeze({ scrollToBottom: scrollChatToBottom, isFollowing: () => followChatBottom });
  let pendingAttachments = [];
  const maxAttachments = 10;
  const maxImageBytes = 10_000_000;
  const maxFileBytes = 200_000_000;
  const usageKey = "xmanius-usage-v1";
  const usageLimit = 35;
  const usageWindow = 5 * 60 * 60 * 1000;
  const readUsage = () => { try { const value = JSON.parse(localStorage.getItem(usageKey) || "null"); if (!value || Date.now() - value.startedAt >= usageWindow) return { count: 0, startedAt: Date.now() }; return value; } catch { return { count: 0, startedAt: Date.now() }; } };
  const formatResetTime = (timestamp) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  const updateUsage = (increment = false) => { const usage = readUsage(); if (increment) usage.count += 1; localStorage.setItem(usageKey, JSON.stringify(usage)); const percent = Math.min(100, Math.round(usage.count / usageLimit * 100)); const resetAt = usage.startedAt + usageWindow; const resetText = formatResetTime(resetAt); usageIndicator?.style.setProperty("--usage", `${percent}%`); if (usageLabel) usageLabel.textContent = `${percent}%`; if (usageReset) usageReset.textContent = `Reset ${resetText}`; usageIndicator?.setAttribute("title", `${Math.max(0, usageLimit - usage.count)} requests left. Resets at ${resetText}.`); usageIndicator?.setAttribute("aria-label", `${percent}% used. ${Math.max(0, usageLimit - usage.count)} requests left. Resets at ${resetText}.`); if (usageNotice && usage.count >= usageLimit) { usageNotice.textContent = `Your 5-hour Xmanius limit is over. It will refresh at ${resetText}.`; usageNotice.classList.add("is-visible"); } return usage.count < usageLimit; };
  let attachmentNoticeTimer = 0;
  const showAttachmentNotice = (message, duration = 4200) => { if (!usageNotice) return; window.clearTimeout(attachmentNoticeTimer); usageNotice.textContent = message; usageNotice.classList.add("is-visible"); attachmentNoticeTimer = window.setTimeout(() => { if (usageNotice.textContent === message) { usageNotice.textContent = ""; usageNotice.classList.remove("is-visible"); } }, duration); };
  const chatsKey = "xmanius-chats-v1";
  let currentChatId = crypto.randomUUID?.() || String(Date.now());
  const readChats = () => { try { return JSON.parse(localStorage.getItem(chatsKey) || "[]"); } catch { return []; } };
  const saveChats = (chats) => localStorage.setItem(chatsKey, JSON.stringify(chats.slice(0, 50)));
  const attachmentDb = (() => {
    let databasePromise;
    const open = () => {
      if (!window.indexedDB) return Promise.resolve(null);
      if (!databasePromise) databasePromise = new Promise((resolve) => {
        const request = indexedDB.open("xmanius-private-files-v1", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("attachments", { keyPath: "id" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
      return databasePromise;
    };
    const put = async (payload) => {
      const database = await open();
      if (!database) return;
      await new Promise((resolve) => { const transaction = database.transaction("attachments", "readwrite"); transaction.objectStore("attachments").put(payload); transaction.oncomplete = resolve; transaction.onerror = resolve; });
    };
    const get = async (id) => {
      const database = await open();
      if (!database) return null;
      return new Promise((resolve) => { const request = database.transaction("attachments", "readonly").objectStore("attachments").get(id); request.onsuccess = () => resolve(request.result || null); request.onerror = () => resolve(null); });
    };
    const removeMany = async (ids) => { const database = await open(); if (!database || !ids.length) return; await new Promise((resolve) => { const transaction = database.transaction("attachments", "readwrite"); const store = transaction.objectStore("attachments"); ids.forEach((id) => store.delete(id)); transaction.oncomplete = resolve; transaction.onerror = resolve; }); };
    return { put, get, removeMany };
  })();
  const attachmentReference = (attachment) => ({ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, text: attachment.text || "" });
  const persistAttachmentPayloads = async (items) => { await Promise.all(items.map(async (attachment) => { attachment.id ||= "xmanius-file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9); await attachmentDb.put({ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, data: attachment.data || "", text: attachment.text || "", savedAt: Date.now() }); })); };
  const defaultSettings = { appearance: "system", contrast: "system", language: "auto", baseTone: "default", warm: "default", enthusiastic: "default", headers: "default", emoji: "default", fastAnswers: true, memoryEnabled: true, customInstructions: "" };
  let appSettings = (() => { try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem("xmanius-settings-v1") || "{}") }; } catch { return { ...defaultSettings }; } })();
  const saveSettings = () => localStorage.setItem("xmanius-settings-v1", JSON.stringify(appSettings));
  const applySettings = () => {
    document.body.classList.remove("xmanius-theme-light", "xmanius-theme-dark", "xmanius-contrast-medium", "xmanius-contrast-increased");
    const isLight = appSettings.appearance === "light" || (appSettings.appearance === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.body.classList.add(isLight ? "xmanius-theme-light" : "xmanius-theme-dark");
    if (appSettings.contrast === "medium") document.body.classList.add("xmanius-contrast-medium");
    if (appSettings.contrast === "increased") document.body.classList.add("xmanius-contrast-increased");
    document.documentElement.lang = appSettings.language === "auto" ? (navigator.language || "en") : appSettings.language;
  };
  const saveCurrentChat = () => {
    const messages = [...list.querySelectorAll(".message")].map((item) => {
      let attachmentsForMessage = [];
      try { attachmentsForMessage = JSON.parse(item.dataset.attachmentRefs || "[]"); } catch {}
      let sourcesForMessage = [];
      try { sourcesForMessage = JSON.parse(item.dataset.sources || "[]"); } catch {}
      return { type: item.classList.contains("user") ? "user" : "assistant", text: item.dataset.rawText || item.querySelector(".message-body")?.textContent || item.textContent.replace(/CopyRead aloud/g, "").trim(), reasoningSummary: item.dataset.reasoningSummary || "", reasoningSeconds: Number(item.dataset.reasoningSeconds || 0), sources: sourcesForMessage, attachments: attachmentsForMessage };
    }).filter((item) => item.text);
    if (!messages.length) return;
    const chats = readChats();
    const existing = chats.find((chat) => chat.id === currentChatId);
    const chat = { id: currentChatId, title: messages.find((item) => item.type === "user")?.text.slice(0, 42) || "New chat", messages, updatedAt: Date.now() };
    if (existing) Object.assign(existing, chat); else chats.unshift(chat);
    saveChats(chats);
    renderRecents();
  };
  let openChatMenu = null;
  let openChatMenuRow = null;
  const closeChatMenu = () => {
    const menu = openChatMenu;
    const row = openChatMenuRow;
    if (menu && row && menu.classList.contains("conversation-menu-portal")) {
      row.append(menu);
      menu.classList.remove("conversation-menu-portal", "is-visible");
      menu.removeAttribute("style");
      delete menu.dataset.portalChatMenu;
    } else {
      menu?.classList.remove("is-visible");
    }
    row?.classList.remove("is-menu-open");
    openChatMenu = null;
    openChatMenuRow = null;
  };
  const positionChatMenu = (menu, button) => {
    if (!menu || !button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 138;
    const menuHeight = menu.offsetHeight || 150;
    const gap = 6;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const below = rect.bottom + gap;
    const top = below + menuHeight <= window.innerHeight - 8
      ? below
      : Math.max(8, rect.top - menuHeight - gap);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  };
  const openChatMenuFor = (row, button) => {
    closeChatMenu();
    const menu = row?.querySelector(".conversation-menu");
    if (!menu) return;
    openChatMenu = menu;
    openChatMenuRow = row;
    row.classList.add("is-menu-open");
    menu.dataset.portalChatMenu = "true";
    menu.classList.add("conversation-menu-portal");
    document.body.append(menu);
    positionChatMenu(menu, button);
    menu.classList.add("is-visible");
  };
  const renderRecents = () => { closeChatMenu(); if (!recent) return; recent.replaceChildren(); readChats().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt).forEach((chat) => { const row = document.createElement("div"); row.className = `conversation-row${chat.pinned ? " is-pinned" : ""}`; row.dataset.chatId = chat.id; const button = document.createElement("button"); button.className = "conversation"; button.type = "button"; button.dataset.chatId = chat.id; button.textContent = chat.title; const more = document.createElement("button"); more.className = "conversation-more"; more.type = "button"; more.dataset.chatMenu = chat.id; more.setAttribute("aria-label", `Options for ${chat.title}`); more.title = "Chat options"; more.textContent = "•••"; const menu = document.createElement("div"); menu.className = "conversation-menu"; menu.innerHTML = `<button type="button" data-chat-action="pin">${chat.pinned ? "Unpin" : "Pin"} chat</button><button type="button" data-chat-action="share">Share</button><button type="button" data-chat-action="delete">Delete</button>`; row.append(button, more, menu); recent.append(row); }); };
  const loadChat = async (chatId) => {
    const chat = readChats().find((item) => item.id === chatId);
    if (!chat) return;
    list.replaceChildren();
    empty.hidden = true;
    currentChatId = chat.id;
    for (const message of chat.messages) {
      const refs = Array.isArray(message.attachments) ? message.attachments : [];
      addMessage(message.text, message.type, { animate: false, persist: false, attachmentNames: refs.map((attachment) => attachment.name), reasoningSummary: message.reasoningSummary || "", reasoningSeconds: message.reasoningSeconds || 0, sources: Array.isArray(message.sources) ? message.sources : [] });
      const item = list.lastElementChild;
      if (!item || !refs.length) continue;
      item.dataset.attachmentRefs = JSON.stringify(refs);
      const restored = [];
      for (const reference of refs) { const saved = await attachmentDb.get(reference.id); if (saved) restored.push(saved); }
      if (restored.length) renderMessageAttachmentPreviews(item, restored);
    }
    scrollChatToBottom({ force: true });
  };
  const localAnswer = (question) => {
    const q = question.toLowerCase();
    if (/^(hi|hello|hey)\b/.test(q)) return "Hello. I am Xmanius, ready to help.";
    if (/what can you do|help me/.test(q)) return "I can explain ideas, help with coding, plan tasks, summarize information, brainstorm, and answer everyday safe questions.";
    if (/productivity|focus/.test(q)) return "Choose one outcome, work in a short focused block, and remove the next distraction before you begin.";
    const math = question.match(/^\s*(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)\s*[?!.,]*\s*$/);
    if (math) { const a = Number(math[1]), b = Number(math[3]); return `The answer is ${math[2] === "+" ? a + b : math[2] === "-" ? a - b : math[2] === "*" ? a * b : b ? a / b : "undefined"}.`; }
    return null;
  };
  const speak = (text) => { if (!("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = appSettings.language === "auto" ? (navigator.language || "en-US") : appSettings.language; utterance.rate = .88; utterance.pitch = .82; window.speechSynthesis.speak(utterance); };
  const escapeHtml = (value) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const stripAnswerSummaryTags = (value) => { let summary = ""; const text = normalizeResponseText(value).replace(/\[\[ANSWER_SUMMARY\]\]([\s\S]*?)\[\[\/ANSWER_SUMMARY\]\]/gi, (_, content) => { if (!summary) summary = content.trim(); return ""; }).replace(/\[\[\/?ANSWER_SUMMARY\]\]/gi, ""); return { text: text.trim(), summary }; };
  const decodeHtmlEntities = (value) => {
    let decoded = String(value || "");
    const decodePass = (source) => source.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (full, entity) => {
      const normalized = entity.toLowerCase();
      const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (named[normalized]) return named[normalized];
      const codePoint = normalized.startsWith("#x") ? Number.parseInt(normalized.slice(2), 16) : Number.parseInt(normalized.slice(1), 10);
      try { return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full; } catch (_) { return full; }
    });
    // A few providers double-escape entities (for example &amp;gt;). Two
    // bounded passes clean those artifacts without repeatedly transforming
    // normal user text.
    decoded = decodePass(decodePass(decoded));
    return decoded;
  };
  const normalizeResponseText = (value) => decodeHtmlEntities(String(value || "").replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t"));
  const normalizeLatex = (value) => normalizeResponseText(value)
    .replace(/\\ext\b/g, "\\text")
    // Some model responses lose the backslash in \text{...}; restore it
    // before tokenising so chemical labels and units render as math text.
    .replace(/(^|[^\\A-Za-z])ext(?=\s*\{)/g, "$1\\text");
  const normalizeCombinatoricsNotation = (value) => {
    let source = normalizeResponseText(value);
    const atom = "(?:[A-Za-z]|\\d+(?:\\.\\d+)?)";
    // Convert common plain-text/model variants into the same internal math
    // commands. This covers C(n,r), P(n,r), nCr, nPr, and superscript forms.
    source = source
      .replace(/\\(?:mathrm|mathbf|text)\s*\{\s*([CcPp])\s*\}\s*\(\s*([^(),]+?)\s*,\s*([^()]+?)\s*\)/g, (_, operator, upper, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper.trim()}}{${lower.trim()}}` : `\\perm{${upper.trim()}}{${lower.trim()}}`)
      .replace(/(?<![A-Za-z])([CcPp])\s*\(\s*([^(),]+?)\s*,\s*([^()]+?)\s*\)/g, (_, operator, upper, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper.trim()}}{${lower.trim()}}` : `\\perm{${upper.trim()}}{${lower.trim()}}`)
      .replace(new RegExp(`(?:\\{\\s*\\})?\\s*\\^\\s*\\{?(${atom})\\}?\\s*([CcPp])\\s*_\\s*\\{?(${atom})\\}?`, "g"), (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(new RegExp(`(?<![A-Za-z])\\\\(?:mathrm|mathbf|text)\\s*\\{\\s*([CcPp])\\s*\\}\\s*_\\s*\\{?(${atom})\\}?\\s*\\^\\s*\\{?(${atom})\\}?`, "g"), (_, operator, lower, upper) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(new RegExp(`(?<![A-Za-z])([CcPp])\\s*_\\s*\\{?(${atom})\\}?\\s*\\^\\s*\\{?(${atom})\\}?`, "g"), (_, operator, lower, upper) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(new RegExp(`(?<![A-Za-z])(${atom})\\s*([CcPp])\\s*_\\s*\\{?(${atom})\\}?`, "g"), (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(new RegExp(`(?<![A-Za-z])(${atom})\\s*([CcPp])\\s*(${atom})(?![A-Za-z])`, "g"), (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`);
    // Give factorials a dedicated math node so n!, (n + 1)!, and repeated
    // factorials stay readable inside prose as well as display equations.
    return source
      .replace(/\bQdiamondsuit\b/g, "Q♦")
      .replace(/\bQheartsuit\b/g, "Q♥")
      .replace(/\bQspadesuit\b/g, "Q♠")
      .replace(/\bQclubsuit\b/g, "Q♣")
      .replace(/\bdiamondsuit\b/g, "♦")
      .replace(/\bheartsuit\b/g, "♥")
      .replace(/\bspadesuit\b/g, "♠")
      .replace(/\bclubsuit\b/g, "♣")
      .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?|[A-Za-z]|\([^()\n]+\))(!+)/g, (_, term, marks) => `\\factorial{${term}}${marks.length > 1 ? marks.slice(1) : ""}`);
  };
  const normalizeExtendedMathNotation = (value) => {
    let source = normalizeCombinatoricsNotation(normalizeLatex(value));
    const superscripts = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-", "⁽": "(", "⁾": ")" };
    const unit = "(?:mm|cm|dm|km|m|µm|um|nm|in|ft|yd|kg|mg|g|L|mL)";
    source = source
      .replace(/\b(?:square\s+)(centimeters?|centimetres?)\b/gi, "cm^{2}")
      .replace(/\b(?:square\s+)(millimeters?|millimetres?)\b/gi, "mm^{2}")
      .replace(/\b(?:square\s+)(meters?|metres?)\b/gi, "m^{2}")
      .replace(/\b(?:square\s+)(kilometers?|kilometres?)\b/gi, "km^{2}")
      .replace(/\b(?:centimeters?|centimetres?)\s+square(?:d)?\b/gi, "cm^{2}")
      .replace(/\b(?:millimeters?|millimetres?)\s+square(?:d)?\b/gi, "mm^{2}")
      .replace(/\b(?:meters?|metres?)\s+square(?:d)?\b/gi, "m^{2}")
      .replace(/\b(?:kilometers?|kilometres?)\s+square(?:d)?\b/gi, "km^{2}")
      .replace(new RegExp(`\\b(${unit})\\s+square(?:d)?\\b`, "gi"), "$1^{2}")
      .replace(new RegExp(`\\b(${unit})\\s+squared\\b`, "gi"), "$1^{2}")
      .replace(/\b(centimeters?|centimetres?)\s+squared\b/gi, "cm^{2}")
      .replace(/\b(millimeters?|millimetres?)\s+squared\b/gi, "mm^{2}")
      .replace(/\b(meters?|metres?)\s+squared\b/gi, "m^{2}")
      .replace(/\b(kilometers?|kilometres?)\s+squared\b/gi, "km^{2}")
      .replace(new RegExp(`\\b(${unit})([2-9])\\b`, "gi"), "$1^{$2}")
      .replace(new RegExp(`\\b(${unit})\\s*²`, "gi"), "$1^{2}")
      .replace(new RegExp(`\\b(${unit})\\s*³`, "gi"), "$1^{3}")
      .replace(/([A-Za-z0-9)])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+)/g, (_, base, power) => `${base}^{${[...power].map((character) => superscripts[character] || character).join("")}}`)
      .replace(/\bsqrt\s*\(([^()\n]+)\)/gi, "\\sqrt{$1}")
      .replace(/\bexp\s*\(([^()\n]+)\)/gi, "\\exp{$1}")
      .replace(/\b(?:determinant|det)\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/gi, "\\det{$1}")
      .replace(/\b(?:arcsin|asin)\s*(?=\(?\s*[A-Za-z0-9{])/gi, "\\sin^{-1}")
      .replace(/\b(?:arccos|acos)\s*(?=\(?\s*[A-Za-z0-9{])/gi, "\\cos^{-1}")
      .replace(/\b(?:arctan|atan)\s*(?=\(?\s*[A-Za-z0-9{])/gi, "\\tan^{-1}")
      .replace(/\b(sin|cos|tan)\s+inverse\b/gi, "\\$1^{-1}")
      .replace(/\b(?:determinant|det)\s+(?=[A-Za-z0-9{])/gi, "\\det ")
      .replace(/(?<![A-Za-z0-9])(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)(?![A-Za-z0-9])/g, "\\frac{$1}{$2}");
    return source;
  };
  const mathCommandMap = Object.freeze({
    longrightarrow: "→", rightarrow: "→", to: "→", longleftrightarrow: "↔", leftrightarrow: "↔",
    Delta: "Δ", delta: "δ", alpha: "α", beta: "β", gamma: "γ", theta: "θ", lambda: "λ", mu: "μ", sigma: "σ", omega: "ω", phi: "φ", psi: "ψ",
    pi: "π", infty: "∞", partial: "∂", nabla: "∇", sum: "Σ", prod: "Π", int: "∫", approx: "≈", cong: "≅", circ: "°",
    exp: "exp", ln: "ln", log: "log", sin: "sin", cos: "cos", tan: "tan", cot: "cot", sec: "sec", csc: "csc", sinh: "sinh", cosh: "cosh", tanh: "tanh", det: "det", determinant: "det", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", pm: "±", times: "×", cdot: "×",
    div: "÷", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩", emptyset: "∅", degree: "°",
    diamondsuit: "♦", heartsuit: "♥", spadesuit: "♠", clubsuit: "♣", qquad: "  ", quad: " ",
    dots: "…", ldots: "…", cdots: "⋯"
  });
  const mathWrapperCommands = new Set(["text", "textbf", "textrm", "mathrm", "mathbf", "mathit", "mathbb", "mathsf", "operatorname", "boldsymbol", "overline", "underline", "vec"]);
  const combinationCommandNames = new Set(["comb", "choose", "combination"]);
  const permutationCommandNames = new Set(["perm", "permutation"]);
  const mathArgumentCommands = new Set(["frac", "dfrac", "tfrac", "binom", "sqrt", "boxed", "fbox", "factorial", "det", "determinant", ...combinationCommandNames, ...permutationCommandNames, ...mathWrapperCommands]);
  const skipMathWhitespace = (source, start) => { let cursor = start; while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1; return cursor; };
  const readBalancedMathGroup = (source, start, opener = "{", closer = "}") => {
    const cursor = skipMathWhitespace(source, start);
    if (source[cursor] !== opener) return null;
    let depth = 1;
    let position = cursor + 1;
    while (position < source.length) {
      if (source[position] === "\\") { position += 2; continue; }
      if (source[position] === opener) depth += 1;
      if (source[position] === closer) { depth -= 1; if (!depth) return { value: source.slice(cursor + 1, position), next: position + 1 }; }
      position += 1;
    }
    return null;
  };
  const readMathArgument = (source, start) => {
    const cursor = skipMathWhitespace(source, start);
    const grouped = readBalancedMathGroup(source, cursor);
    if (grouped) return grouped;
    const optional = readBalancedMathGroup(source, cursor, "[", "]");
    if (optional) return optional;
    if (source[cursor] === "\\") {
      const command = source.slice(cursor + 1).match(/^[A-Za-z]+/);
      if (command) return { value: source.slice(cursor, cursor + 1 + command[0].length), next: cursor + 1 + command[0].length };
    }
    if (cursor >= source.length) return null;
    return { value: source[cursor], next: cursor + 1 };
  };
  const matrixCommandNames = new Set(["matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix", "array"]);
  const normalizeBareMatrixCommands = (value) => {
    const source = String(value || "");
    // Recover the common provider output `pmatrix ... pmatrix` without
    // changing already escaped commands or ordinary prose that mentions
    // the word "matrix" only once.
    const tokenPattern = /(^|[^\\A-Za-z{])((?:p|b|B|v|V)?matrix)\b/g;
    const counts = {};
    let match;
    while ((match = tokenPattern.exec(source))) counts[match[2]] = (counts[match[2]] || 0) + 1;
    if (!Object.values(counts).some((count) => count > 1)) return source;
    return source.replace(tokenPattern, (full, prefix, kind) => counts[kind] > 1 ? `${prefix}\\${kind}` : full);
  };
  const matrixBracketClass = (kind) => ({ matrix: "round", pmatrix: "round", smallmatrix: "round", array: "round", bmatrix: "square", Bmatrix: "curly", vmatrix: "single", Vmatrix: "double" }[kind] || "round");
  const readBareMatrixBody = (source, start, kind) => {
    const close = source.slice(start).match(new RegExp(`\\\\?${kind}\\b`));
    if (!close || typeof close.index !== "number") return null;
    const closeStart = start + close.index;
    return { value: source.slice(start, closeStart), next: closeStart + close[0].length };
  };
  const readMatrixEnvironment = (source, start, kind) => {
    const rest = source.slice(start);
    const escapedKind = kind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const end = rest.match(new RegExp(`\\\\end\\s*\\{${escapedKind}\\}`));
    if (!end || typeof end.index !== "number") return null;
    return { value: rest.slice(0, end.index), next: start + end.index + end[0].length };
  };
  const renderMatrixMarkup = (body, kind = "pmatrix") => {
    const rows = normalizeResponseText(body)
      .replace(/\r\n/g, "\n")
      // Valid TeX row breaks are `\\`; malformed output often uses a single
      // slash followed by whitespace, which is also safe to recover.
      .replace(/\\\\/g, "\n")
      .replace(/(?:^|\s)\\(?=\s|$)/g, "\n")
      .replace(/^\s*\{[^{}\n]+\}\s*(?=\S)/, "")
      .split(/\n+/)
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row) => row.split(/\s*&\s*/).map((cell) => cell.trim()));
    if (!rows.length) return "";
    const columns = Math.max(1, ...rows.map((row) => row.length));
    const bracket = matrixBracketClass(kind);
    const cells = rows.map((row) => {
      const padded = [...row, ...Array(Math.max(0, columns - row.length)).fill("")];
      return `<span class="math-matrix-row">${padded.map((cell) => `<span class="math-matrix-cell">${renderMathExpression(cell)}</span>`).join("")}</span>`;
    }).join("");
    return `<span class="math-matrix math-matrix-${bracket}" role="group" aria-label="Matrix"><span class="math-matrix-grid" style="--matrix-cols:${columns}">${cells}</span></span>`;
  };
  const stripMathDelimiters = (value) => {
    let result = normalizeLatex(value).trim();
    if ((result.startsWith("$$") && result.endsWith("$$")) || (result.startsWith("$") && result.endsWith("$"))) result = result.slice(result.startsWith("$$") ? 2 : 1, result.endsWith("$$") ? -2 : -1);
    if (result.startsWith("\\[") && result.endsWith("\\]")) result = result.slice(2, -2);
    if (result.startsWith("\\(") && result.endsWith("\\)")) result = result.slice(2, -2);
    // Markdown emphasis occasionally leaks into a math line. Remove only
    // paired emphasis markers; a single * remains available as multiplication.
    return result.replace(/\*\*|__/g, "");
  };
  const renderMathExpression = (value) => {
    const source = normalizeBareMatrixCommands(normalizeExtendedMathNotation(stripMathDelimiters(value)));
    let output = "";
    let cursor = 0;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === "\n") { output += "<br>"; cursor += 1; continue; }
      if (character === "^" || character === "_") {
        const argument = readMathArgument(source, cursor + 1);
        if (argument) { output += `<${character === "^" ? "sup" : "sub"}>${renderMathExpression(argument.value)}</${character === "^" ? "sup" : "sub"}>`; cursor = argument.next; continue; }
      }
      if (character === "{") {
        const group = readBalancedMathGroup(source, cursor);
        if (group) { output += renderMathExpression(group.value); cursor = group.next; continue; }
      }
      if (character === "\\") {
        const commandMatch = source.slice(cursor + 1).match(/^[A-Za-z]+/);
        if (!commandMatch) { output += escapeHtml(source[cursor + 1] || ""); cursor += Math.min(2, source.length - cursor); continue; }
        const command = commandMatch[0];
        cursor += command.length + 1;
        if (command === "begin") {
          const environment = readBalancedMathGroup(source, cursor);
          const kind = environment?.value.trim();
          if (environment && matrixCommandNames.has(kind)) {
            const matrix = readMatrixEnvironment(source, environment.next, kind);
            if (matrix) { output += renderMatrixMarkup(matrix.value, kind); cursor = matrix.next; continue; }
          }
        }
        if (matrixCommandNames.has(command)) {
          const matrix = readBareMatrixBody(source, cursor, command);
          if (matrix) { output += renderMatrixMarkup(matrix.value, command); cursor = matrix.next; continue; }
        }
        if (command === "left" || command === "right" || command === "big" || command === "Big" || command === "bigg" || command === "Bigg") continue;
        if (command === "frac" || command === "dfrac" || command === "tfrac") {
          const numerator = readMathArgument(source, cursor);
          const denominator = numerator && readMathArgument(source, numerator.next);
          if (numerator && denominator) { output += `<span class="math-fraction"><span>${renderMathExpression(numerator.value)}</span><span>${renderMathExpression(denominator.value)}</span></span>`; cursor = denominator.next; continue; }
        }
        if (command === "binom" || combinationCommandNames.has(command)) {
          const upper = readMathArgument(source, cursor);
          const lower = upper && readMathArgument(source, upper.next);
          if (upper && lower) { output += `<span class="math-binomial"><span>${renderMathExpression(upper.value)}</span><span>${renderMathExpression(lower.value)}</span></span>`; cursor = lower.next; continue; }
        }
        if (command === "det" || command === "determinant") {
          const argument = readMathArgument(source, cursor);
          if (argument) { output += `<span class="math-function math-determinant"><span class="math-function-name">det</span><span class="math-function-argument">(${renderMathExpression(argument.value)})</span></span>`; cursor = argument.next; continue; }
        }
        if (permutationCommandNames.has(command)) {
          const upper = readMathArgument(source, cursor);
          const lower = upper && readMathArgument(source, upper.next);
          if (upper && lower) { output += `<span class="math-permutation"><sup>${renderMathExpression(upper.value)}</sup><span>P</span><sub>${renderMathExpression(lower.value)}</sub></span>`; cursor = lower.next; continue; }
        }
        if (command === "factorial") {
          const argument = readMathArgument(source, cursor);
          if (argument) { output += `<span class="math-factorial">${renderMathExpression(argument.value)}!</span>`; cursor = argument.next; continue; }
        }
        if (command === "sqrt") {
          let degree = null;
          const optional = readBalancedMathGroup(source, cursor, "[", "]");
          if (optional) { degree = optional.value; cursor = optional.next; }
          const radicand = readMathArgument(source, cursor);
          if (radicand) { output += `<span class="math-sqrt">${degree ? `<sup class="math-root-index">${renderMathExpression(degree)}</sup>` : ""}√<span>${renderMathExpression(radicand.value)}</span></span>`; cursor = radicand.next; continue; }
        }
        if (command === "exp") {
          const argument = readMathArgument(source, cursor);
          if (argument) { output += `<span class="math-function">exp<span class="math-function-argument">(${renderMathExpression(argument.value)})</span></span>`; cursor = argument.next; continue; }
        }
        if (command === "boxed" || command === "fbox") {
          const argument = readMathArgument(source, cursor);
          if (argument) { output += `<span class="math-answer-box">${renderMathExpression(argument.value)}</span>`; cursor = argument.next; continue; }
        }
        if (mathWrapperCommands.has(command)) {
          const argument = readMathArgument(source, cursor);
          if (argument) { const wrapperClass = command === "overline" ? " math-overline" : command === "underline" ? " math-underline" : ""; output += `<span class="${wrapperClass.trim() || "math-text"}">${renderMathExpression(argument.value)}</span>`; cursor = argument.next; continue; }
        }
        const symbol = mathCommandMap[command] || mathCommandMap[command.toLowerCase()];
        if (symbol) { output += escapeHtml(symbol); continue; }
        const fallback = readMathArgument(source, cursor);
        if (fallback && fallback.next > cursor) { output += renderMathExpression(fallback.value); cursor = fallback.next; } else output += escapeHtml(command);
        continue;
      }
      if (character === "$") { cursor += 1; continue; }
      output += escapeHtml(character);
      cursor += 1;
    }
    return output;
  };
  const renderMathMarkup = (value) => renderMathExpression(value);
  const isSafeHttpUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) { return false; }
  };
  const isImageUrl = (value) => {
    if (!isSafeHttpUrl(value)) return false;
    try { return /\.(?:png|jpe?g|webp|gif|avif|svg)(?:$|[?#])/i.test(new URL(value).pathname); } catch (_) { return false; }
  };
  const cleanEmbeddedLabel = (value) => String(value || "Image").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || "Image";
  const normalizeEmbeddedMarkup = (value) => normalizeResponseText(value)
    .replace(/<img\b[^>]*?\bsrc\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi, (tag, url) => {
      const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || "Image preview";
      return `![${cleanEmbeddedLabel(alt)}](${url})`;
    })
    .replace(/<a\b[^>]*?\bhref\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, label) => `[${cleanEmbeddedLabel(label)}](${url})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\b(?:target|rel)\s*=\s*(?:["'][^"']*["']|[^\s>]+)/gi, "");
  const formatMarkdownText = (value) => {
    const tokens = [];
    const tokenFor = (html) => { const token = `\uE000${tokens.length}\uE001`; tokens.push(html); return token; };
    let source = normalizeEmbeddedMarkup(value)
      .replace(/\$\$?/g, "")
      .replace(/(^|\n)\s*#{1,6}\s+/g, "$1")
      .replace(/\\([{}])/g, "$1");
    // Models sometimes emit a Markdown blockquote marker for ordinary
    // prompt labels or prose. The app does not render blockquotes, so the
    // marker should never leak into the visible answer as a stray `>`.
    source = source.replace(/(^|\n)[ \t]*>[ \t]+(?=[^<>])/g, "$1");
    // Keep common video specifications readable and consistent while leaving
    // fenced code untouched (code is rendered by highlightCode separately).
    source = source.replace(/\b(\d+(?:[.,]\d+)?)\s*(?:fps|frames?\s+per\s+second)\b/gi, "$1 FPS");
    const imageCard = (url, label) => {
      if (!isSafeHttpUrl(url)) return escapeHtml(label || url);
      const safeUrl = escapeHtml(url);
      const safeLabel = escapeHtml(cleanEmbeddedLabel(label));
      return `<a class="inline-image-preview-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="Open image: ${safeLabel}"><img class="inline-image-preview" src="${safeUrl}" alt="${safeLabel}" loading="lazy" referrerpolicy="no-referrer"><span class="inline-image-caption">${safeLabel}</span></a>`;
    };
    const sourceLink = (url, label = url) => {
      if (!isSafeHttpUrl(url)) return escapeHtml(label);
      return `<a class="inline-source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cleanEmbeddedLabel(label))}</a>`;
    };
    source = source.replace(/!\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+)(?:\s+["'][^)]*["'])?\s*\)/gi, (_, label, url) => tokenFor(imageCard(url, label || "Image preview")));
    source = source.replace(/\[([^\]]+)\]\(\s*(https?:\/\/[^\s)]+)\s*\)/gi, (_, label, url) => tokenFor(isImageUrl(url) ? imageCard(url, label) : sourceLink(url, label)));
    source = source.replace(/https?:\/\/[^\s<>"')]+/gi, (url, offset, whole) => {
      const trailing = url.match(/[.,;:!?]+$/)?.[0] || "";
      const cleanUrl = trailing ? url.slice(0, -trailing.length) : url;
      if (!isSafeHttpUrl(cleanUrl) || (offset > 0 && /["'=]/.test(whole[offset - 1]))) return url;
      return tokenFor(isImageUrl(cleanUrl) ? imageCard(cleanUrl, "Image preview") : sourceLink(cleanUrl, cleanUrl)) + trailing;
    });
    let output = escapeHtml(source)
      .replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>")
      .replace(/__(.+?)__/gs, "<strong>$1</strong>")
      .replace(/~~(.+?)~~/gs, "<del>$1</del>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>");
    tokens.forEach((html, index) => { output = output.split(`\uE000${index}\uE001`).join(html); });
    return output;
  };
  const findPlainMathToken = (source, start) => {
    const previous = source[start - 1];
    if (previous && /[A-Za-z0-9_]/.test(previous)) return null;
    const remainder = source.slice(start);
    const patterns = [
      /^(?:[A-Za-zπ])\s*[\^_]\s*(?:\{[^{}\n]+\}|[A-Za-z0-9+\-]+)/,
      /^(?:mm|cm|dm|km|m|µm|um|nm|in|ft|yd|kg|mg|g|L|mL)\s*[\^_]\s*(?:\{[^{}\n]+\}|[0-9+\-]+)/i,
      /^(?:e|π)\s*\^\s*(?:\{[^{}\n]+\}|\([^()\n]+\)|[A-Za-z0-9+\-]+)/i,
      /^(?:determinant|det)\s*(?:\([^()\n]+\)|[A-Za-z][A-Za-z0-9]*)/i,
      /^(?:sin|cos|tan|cot|sec|csc|sinh|cosh|tanh)\s*(?:\^\s*(?:\{[^{}\n]+\}|-?\d+))?\s*(?:\([^()\n]+\)|[A-Za-z][A-Za-z0-9]*)/i,
      /^(?:sqrt|exp)\s*\([^()\n]+\)/i,
      /^(?:-?\d+(?:\.\d+)?)\s*\/\s*(?:-?\d+(?:\.\d+)?)(?![A-Za-z0-9])/i
    ];
    for (const pattern of patterns) {
      const match = remainder.match(pattern);
      if (match) return { end: start + match[0].length };
    }
    return null;
  };
  const findRawMathToken = (source, start) => {
    const plainToken = findPlainMathToken(source, start);
    if (plainToken) return plainToken;
    if (source[start] !== "\\") return null;
    const commandMatch = source.slice(start + 1).match(/^[A-Za-z]+/);
    if (!commandMatch) return null;
    const command = commandMatch[0];
    let cursor = start + 1 + command.length;
    if (command === "begin") {
      const environment = readBalancedMathGroup(source, cursor);
      const kind = environment?.value.trim();
      if (environment && matrixCommandNames.has(kind)) {
        const matrix = readMatrixEnvironment(source, environment.next, kind);
        if (matrix) return { end: matrix.next };
      }
    }
    if (matrixCommandNames.has(command)) {
      const matrix = readBareMatrixBody(source, cursor, command);
      if (matrix) return { end: matrix.next };
    }
    if (mathArgumentCommands.has(command)) {
      const count = command === "frac" || command === "dfrac" || command === "tfrac" || command === "binom" || combinationCommandNames.has(command) || permutationCommandNames.has(command) ? 2 : 1;
      for (let index = 0; index < count; index += 1) { const argument = readMathArgument(source, cursor); if (!argument) return null; cursor = argument.next; }
      return { end: cursor };
    }
    if (command === "exp") {
      const argument = readMathArgument(source, cursor);
      if (argument) return { end: argument.next };
    }
    if (mathCommandMap[command] || mathCommandMap[command.toLowerCase()]) {
      if (source[cursor] === "^" || source[cursor] === "_") { const argument = readMathArgument(source, cursor + 1); if (argument) cursor = argument.next; }
      return { end: cursor };
    }
    return null;
  };
  const renderTextWithMath = (value) => {
    const source = normalizeBareMatrixCommands(normalizeExtendedMathNotation(value));
    let output = "";
    let cursor = 0;
    let textStart = 0;
    while (cursor < source.length) {
      const token = findRawMathToken(source, cursor);
      if (!token) { cursor += 1; continue; }
      output += formatMarkdownText(source.slice(textStart, cursor));
      output += `<span class="math-inline">${renderMathMarkup(source.slice(cursor, token.end))}</span>`;
      cursor = token.end;
      textStart = cursor;
    }
    output += formatMarkdownText(source.slice(textStart));
    return output;
  };
  const inlineMarkdown = (value) => {
    const mathPattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
    let output = "";
    let cursor = 0;
    for (const match of String(value).matchAll(mathPattern)) {
      output += renderTextWithMath(value.slice(cursor, match.index));
      output += `<span class="math-inline">${renderMathMarkup(match[0])}</span>`;
      cursor = match.index + match[0].length;
    }
    output += renderTextWithMath(String(value).slice(cursor));
    return output;
  };
  const highlightCode = (value) => escapeHtml(value).replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span class="syntax-comment">$1</span>').replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span class="syntax-string">$1</span>').replace(/\b(const|let|var|function|return|if|else|for|while|new|class|async|await|import|from|true|false|null|undefined)\b/g, '<span class="syntax-keyword">$1</span>').replace(/(&lt;\/?)([A-Za-z][\w-]*)/g, '$1<span class="syntax-tag">$2</span>');
  const youtubeSourcesFromText = (value) => [...value.matchAll(/https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)[A-Za-z0-9_-]{6,}|youtu\.be\/[A-Za-z0-9_-]{6,})[^\s)<>]*/gi)].map((match) => ({ title: "YouTube video", url: match[0].replace(/[.,]$/, ""), snippet: "Open or watch this video preview", displayLink: "youtube.com" }));
  const readAsDataUrl = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("The selected file could not be read.")); reader.readAsDataURL(file); });
  const imageAsUpload = (file) => new Promise(async (resolve, reject) => { try { const source = await readAsDataUrl(file); const image = new Image(); image.onload = () => { const maxDimension = 1600; const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale)); canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale)); const context = canvas.getContext("2d", { alpha: false }); context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); resolve({ mimeType: "image/jpeg", data: canvas.toDataURL("image/jpeg", .82).replace(/^data:[^,]+,/, "") }); }; image.onerror = () => reject(new Error(`Could not decode ${file.name}.`)); image.src = source; } catch (error) { reject(error); } });
  const prepareAttachment = async (file) => { const mimeType = file?.type || "application/octet-stream"; const limit = mimeType.startsWith("image/") ? maxImageBytes : maxFileBytes; if (!file || file.size > limit) throw new Error(`${file?.name || "That file"} is too large. Images can be up to 10 MB and other files up to 200 MB.`); if (mimeType.startsWith("image/")) { const image = await imageAsUpload(file); return { name: file.name, mimeType: image.mimeType, data: image.data }; } if (mimeType === "application/pdf" || mimeType === "text/plain" || mimeType === "text/markdown" || mimeType === "text/csv" || mimeType === "application/json" || /\.(?:txt|md|csv|json|js|html|css|py)$/i.test(file.name)) { if (/\.(?:js|html|css|py)$/i.test(file.name) && file.type === "application/octet-stream") return { name: file.name, mimeType: "text/plain", text: (await file.text()).slice(0, 20000) }; if (mimeType.startsWith("text/") || mimeType === "application/json") return { name: file.name, mimeType: "text/plain", text: (await file.text()).slice(0, 20000) }; return { name: file.name, mimeType, data: (await readAsDataUrl(file)).replace(/^data:[^,]+,/, "") }; } throw new Error(`${file.name} is not a supported image, PDF, or text file.`); };
  const attachmentToRequest = (attachment) => ({ name: attachment.name, mimeType: attachment.mimeType, data: attachment.data, text: attachment.text });
  const createAttachmentCard = (attachment, { removable = false, index = 0 } = {}) => {
    const card = document.createElement("figure");
    card.className = "attachment-preview-card";
    card.dataset.attachmentName = attachment?.name || "Attachment";
    card.title = attachment?.name || "Attachment";
    if (removable) card.classList.add("is-pending");
    if (attachment?.data && /^image\//i.test(attachment.mimeType || "")) {
      const image = document.createElement("img");
      image.src = "data:" + attachment.mimeType + ";base64," + attachment.data;
      image.alt = "Preview of " + attachment.name;
      card.append(image);
    } else {
      const filePreview = document.createElement("div");
      filePreview.className = "attachment-file-preview";
      filePreview.textContent = (attachment?.name?.split(".").pop() || "FILE").slice(0, 6).toUpperCase();
      card.append(filePreview);
    }
    const caption = document.createElement("figcaption");
    const name = document.createElement("strong");
    name.textContent = attachment?.name || "Attachment";
    name.title = name.textContent;
    const meta = document.createElement("small");
    meta.textContent = `${(attachment?.name?.split(".").pop() || "file").toUpperCase()}${attachment?.id ? " • " + attachment.id : ""}`;
    caption.append(name, meta);
    card.append(caption);
    if (removable) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "attachment-remove";
      remove.dataset.removeAttachment = String(index);
      remove.setAttribute("aria-label", `Remove ${attachment?.name || "file"}`);
      remove.title = "Remove file";
      remove.textContent = "×";
      card.append(remove);
    }
    return card;
  };
  const renderPendingAttachments = () => {
    if (!attachments) return;
    attachments.replaceChildren();
    attachments.classList.toggle("is-visible", pendingAttachments.length > 0);
    if (!pendingAttachments.length) return;
    const strip = document.createElement("div");
    strip.className = "attachment-preview-strip";
    strip.dataset.imagePreviewStrip = "true";
    pendingAttachments.forEach((attachment, index) => strip.append(createAttachmentCard(attachment, { removable: true, index })));
    attachments.append(strip);
  };
  const addSelectedFiles = async (selected) => { if (!selected.length) return; if (pendingAttachments.length + selected.length > maxAttachments) { showAttachmentNotice(`You can attach up to ${maxAttachments} files per message.`); return; } for (const file of selected) { try { pendingAttachments.push(await prepareAttachment(file)); } catch (error) { showAttachmentNotice(error.message || "That file could not be added."); } } renderPendingAttachments(); input?.focus(); };
  const handleAttachmentSelection = async (event) => { const selected = [...(event.target.files || [])]; event.target.value = ""; await addSelectedFiles(selected); };
  const renderMessageAttachmentPreviews = (message, items) => { const container = message?.querySelector(".message-attachments"); if (!container || !items?.length) return; container.replaceChildren(); items.forEach((attachment) => { attachment.id ||= "xmanius-image-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7); const card = createAttachmentCard(attachment); card.classList.add("message-image-preview"); container.append(card); }); };
  let cameraStream = null;
  let cameraDialog = null;
  const stopCamera = () => { cameraStream?.getTracks().forEach((track) => { try { track.stop(); } catch {} }); cameraStream = null; if (cameraDialog) { const video = cameraDialog.querySelector("video"); if (video) video.srcObject = null; cameraDialog.classList.remove("is-open"); cameraDialog.setAttribute("aria-hidden", "true"); } };
  const openCamera = async () => { if (!navigator.mediaDevices?.getUserMedia) { showAttachmentNotice("Live camera capture is unavailable here. Use a camera-enabled browser or Android app."); return; } if (!cameraDialog) { cameraDialog = document.createElement("section"); cameraDialog.className = "camera-dialog"; cameraDialog.setAttribute("aria-hidden", "true"); cameraDialog.innerHTML = `<div class="camera-dialog-panel" role="dialog" aria-modal="true" aria-label="Capture a photo"><div class="camera-dialog-header"><strong>Use camera</strong><button type="button" data-camera-close aria-label="Close camera">×</button></div><video autoplay playsinline muted></video><p data-camera-status>Allow camera access to take a photo.</p><div class="camera-dialog-actions"><button type="button" data-camera-cancel>Cancel</button><button type="button" data-camera-capture>Capture photo</button></div></div>`; document.body.append(cameraDialog); cameraDialog.querySelectorAll("[data-camera-close],[data-camera-cancel]").forEach((button) => button.addEventListener("click", stopCamera)); cameraDialog.querySelector("[data-camera-capture]").addEventListener("click", async () => { const video = cameraDialog.querySelector("video"); if (!video?.videoWidth) return; if (pendingAttachments.length >= maxAttachments) { showAttachmentNotice(`You can attach up to ${maxAttachments} files per message.`); return; } const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext("2d").drawImage(video, 0, 0); const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .88)); if (!blob) return; try { pendingAttachments.push(await prepareAttachment(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }))); renderPendingAttachments(); stopCamera(); input?.focus(); } catch (error) { showAttachmentNotice(error.message || "The photo could not be added."); } }); } cameraDialog.classList.add("is-open"); cameraDialog.setAttribute("aria-hidden", "false"); const video = cameraDialog.querySelector("video"); try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }); video.srcObject = cameraStream; await video.play(); cameraDialog.querySelector("[data-camera-status]").textContent = "Ready. Position the image and capture it."; } catch { stopCamera(); showAttachmentNotice("Camera permission was denied or the camera is unavailable. Allow camera access and try again."); } };
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
      // Flatten accidental blockquote syntax into normal prose. Do this at
      // line level so fenced code keeps its original `>` characters.
      const displayLine = line.replace(/^[ \t]*>[ \t]+(?=[^<>])/g, "");
      const trimmed = displayLine.trim();
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
      const normalizedMathLine = normalizeExtendedMathNotation(trimmed);
      const hasMatrix = /(?:\\begin\s*\{(?:matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|array)\}|\\(?:matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|array)\b|(?<!\\)\b(?:pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|array)\b)/.test(normalizedMathLine);
      const hasScalarMath = /^(?=.*(?:=|\\leq?|\\geq?|\\in\b|\\frac|\\binom|\\(?:comb|choose|perm|permutation|factorial)\b|\\sqrt|\\boxed|\\exp|\\log|\\ln|\\Delta|\\pi|\\longrightarrow|\^|!|≤|≥|∈|(?<![A-Za-z])(?:\\d+|[A-Za-z])\\s*[CPcp]\\s*(?:\\d+|[A-Za-z])|(?<![A-Za-z])[CPcp]\s*\([^)]*,[^)]*\))).{2,900}$/.test(trimmed);
      if ((hasMatrix || hasScalarMath) && (hasMatrix || (!mathWords.test(trimmed) && !/[.!?]$/.test(trimmed)))) {
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
  const renderMarkdownToHtml = (text) => {
    const holder = document.createElement("div");
    renderMarkdown(holder, text);
    return holder.innerHTML;
  };
  // Publish the renderer as soon as it exists so the enhancement/edit path
  // cannot fall back to the old raw-TeX renderer if a later optional feature
  // fails to initialise.
  window.XmaniusCoreRenderer = Object.freeze({ renderMarkdownToHtml });
  const animateAssistantText = (body, text, cursor) => {
    if (!body || !cursor || !text) return;
    const total = text.length;
    const duration = Math.min(50000, Math.max(1800, total * 16));
    const interval = 18;
    const chunk = Math.max(1, Math.ceil(total / Math.max(1, Math.floor(duration / interval))));
    let position = 0;
    let finished = false;
    let timer = 0;
    const scrollToEnd = () => {
      scrollChatToBottom();
    };
    const renderPartial = (value) => {
      try {
        body.replaceChildren();
        renderMarkdown(body, value);
        const targets = [...body.querySelectorAll("p, li, h3, td, th, .math-block, .code-block, pre, code")];
        const target = targets[targets.length - 1] || body;
        target.append(cursor);
      } catch {
        // An incomplete Markdown/math token must never stop the animation.
        body.replaceChildren();
        body.textContent = value;
        body.append(cursor);
      }
      scrollToEnd();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer) window.clearTimeout(timer);
      body.replaceChildren();
      try {
        renderMarkdown(body, text);
      } catch {
        body.textContent = text;
      }
      if (cursor.isConnected) cursor.remove();
      scrollToEnd();
    };
    const tick = () => {
      if (finished) return;
      position = Math.min(total, position + chunk);
      renderPartial(text.slice(0, position));
      if (position < total) timer = window.setTimeout(tick, interval);
      else finish();
    };
    body.replaceChildren();
    body.append(cursor);
    tick();
  };
  const openImageGallery = (items, initialIndex = 0) => {
    const images = items.filter((item) => item?.imageUrl || item?.thumbnail);
    if (!images.length) return;
    let index = Math.max(0, Math.min(initialIndex, images.length - 1));
    const overlay = document.createElement("section");
    overlay.className = "image-gallery-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Image gallery");
    const close = document.createElement("button");
    close.type = "button"; close.className = "gallery-close"; close.setAttribute("aria-label", "Close gallery"); close.textContent = "×";
    const counter = document.createElement("div"); counter.className = "gallery-counter";
    const stage = document.createElement("figure"); stage.className = "gallery-stage";
    const image = document.createElement("img"); image.className = "gallery-image"; image.decoding = "async";
    const caption = document.createElement("figcaption"); caption.className = "gallery-attribution";
    const previous = document.createElement("button"); previous.type = "button"; previous.className = "gallery-nav gallery-prev"; previous.setAttribute("aria-label", "Previous image"); previous.textContent = "‹";
    const next = document.createElement("button"); next.type = "button"; next.className = "gallery-nav gallery-next"; next.setAttribute("aria-label", "Next image"); next.textContent = "›";
    const update = () => {
      const source = images[index];
      image.src = source.imageUrl || source.thumbnail;
      image.alt = source.title || "Searched image";
      counter.textContent = `${index + 1} / ${images.length}`;
      caption.replaceChildren();
      const link = document.createElement("a"); link.href = source.url || source.imageUrl || source.thumbnail; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = source.displayLink || (() => { try { return new URL(source.url || source.imageUrl).hostname; } catch { return "Source"; } })();
      const title = document.createElement("span"); title.textContent = source.title || "";
      caption.append(link, title);
      previous.disabled = images.length < 2; next.disabled = images.length < 2;
    };
    const dismiss = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (event) => { if (event.key === "Escape") dismiss(); if (event.key === "ArrowLeft") { index = (index - 1 + images.length) % images.length; update(); } if (event.key === "ArrowRight") { index = (index + 1) % images.length; update(); } };
    close.addEventListener("click", dismiss); previous.addEventListener("click", () => { index = (index - 1 + images.length) % images.length; update(); }); next.addEventListener("click", () => { index = (index + 1) % images.length; update(); }); overlay.addEventListener("click", (event) => { if (event.target === overlay) dismiss(); }); document.addEventListener("keydown", onKey);
    stage.append(image, caption); overlay.append(close, counter, previous, stage, next); document.body.append(overlay); update(); close.focus();
  };
  const addMessage = (text, type, { animate = false, persist = true, sources = [], searchError = "", attachmentNames = [], reasoningSummary = "", reasoningSeconds = 0, thinkMode = false } = {}) => {
    const answerEnvelope = stripAnswerSummaryTags(text);
    text = answerEnvelope.text;
    reasoningSummary = reasoningSummary || answerEnvelope.summary;
    empty.hidden = true;
    const displaySources = [...new Map([...sources, ...youtubeSourcesFromText(text)].filter((source) => source?.url).map((source) => [source.url, source])).values()];
    const item = document.createElement("article");
    item.className = `message ${type}${type === "assistant" && text.length >= 650 ? " long-response" : ""}`;
    item.dataset.rawText = text;
    if (displaySources.length) item.dataset.sources = JSON.stringify(displaySources);
    if (reasoningSummary) item.dataset.reasoningSummary = reasoningSummary;
    if (reasoningSeconds) item.dataset.reasoningSeconds = String(reasoningSeconds);
    const body = document.createElement("div");
    body.className = "message-body";
    if (type === "assistant") renderMarkdown(body, text); else body.textContent = text;
    const responseCursor = type === "assistant" && animate ? document.createElement("span") : null;
    if (responseCursor) { responseCursor.className = "xmanius-typing-cursor"; responseCursor.setAttribute("aria-hidden", "true"); body.append(responseCursor); }
    item.append(body);
    if (type === "user" && attachmentNames.length) {
      const attached = document.createElement("div");
      attached.className = "message-attachments";
      attachmentNames.forEach((name) => { const chip = document.createElement("span"); chip.className = "message-attachment"; chip.textContent = name; attached.append(chip); });
      item.append(attached);
    }
    if (type === "assistant" && (thinkMode || reasoningSeconds)) {
      const summary = document.createElement("details");
      summary.className = "thinking-summary";
      const summaryLabel = document.createElement("summary");
      summaryLabel.innerHTML = `<span class="thought-glyph" aria-hidden="true">✦</span><span>Thought for ${Math.max(1, reasoningSeconds || 1)} seconds</span><span class="thought-chevron dropdown-chevron" aria-hidden="true"></span>`;
      const summaryText = document.createElement("p");
      summaryText.textContent = reasoningSummary || "I identified the main request and checked the relevant context, assumptions, and constraints. I then selected a suitable method and verified the result before presenting the answer.";
      summary.append(summaryLabel, summaryText);
      item.prepend(summary);
    }
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
        const imageSources = displaySources.filter((source) => source.kind === "image" || source.imageUrl);
        const regularSources = displaySources.filter((source) => !imageSources.includes(source));
        const heading = document.createElement("div"); heading.className = "source-heading"; heading.innerHTML = `<span class="source-earth">◎</span><strong>${imageSources.length ? "Images searched" : "Sources searched"}</strong><span>${imageSources.length || displaySources.length}</span>`; sourcePanel.append(heading);
        if (imageSources.length) {
          const imageGrid = document.createElement("div"); imageGrid.className = "image-results-grid";
          imageSources.slice(0, 3).forEach((source, index) => {
            const card = document.createElement("button"); card.type = "button"; card.className = "source-image-card"; card.setAttribute("aria-label", `Open image ${index + 1} of ${imageSources.length}`);
            const image = document.createElement("img"); image.src = source.thumbnail || source.imageUrl; image.alt = source.title || "Searched image"; image.loading = "lazy"; image.referrerPolicy = "no-referrer"; card.append(image);
            if (index === 2 && imageSources.length > 3) { const badge = document.createElement("span"); badge.className = "image-count-badge"; badge.textContent = `▧ ${imageSources.length}`; card.append(badge); }
            card.addEventListener("click", () => openImageGallery(imageSources, index)); imageGrid.append(card);
          });
          sourcePanel.append(imageGrid);
        }
        const sourceGrid = document.createElement("div");
        sourceGrid.className = "source-grid";
        regularSources.slice(0, 8).forEach((source) => {
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
        if (regularSources.length) sourcePanel.append(sourceGrid);
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
    scrollChatToBottom();
  };
  const setSendingState = (active) => { sendButton?.classList.toggle("is-stop", active); if (sendButton) { sendButton.setAttribute("aria-label", active ? "Stop response" : "Send message"); sendButton.title = active ? "Stop response" : "Send message"; sendButton.innerHTML = active ? '<span class="send-stop-icon" aria-hidden="true"></span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"></path></svg>'; } };
  const hasCodeInHistory = () => [...list.querySelectorAll(".message.assistant")].some((item) => item.querySelector("[data-code-block]") || /```|<\/?(?:html|script|style|div|button|function|const|let)\b/i.test(item.dataset.rawText || ""));
  const needsCodeRethink = (question) => hasCodeInHistory() && /\b(?:error|bug|fault|broken|failed|failure|not\s+working|doesn['’]?t\s+work|does\s+not\s+work|fix\s+this|wrong)\b/i.test(question);
  const conversationHistory = () => [...list.querySelectorAll(".message")].slice(-12).map((item) => ({ role: item.classList.contains("user") ? "user" : "model", text: item.dataset.rawText || item.querySelector(".message-body")?.textContent?.trim() || "" })).filter((item) => item.text);
  const ask = async (question, suppliedAttachments = pendingAttachments) => {
    const q = String(question || "").trim();
    const requestAttachments = [...suppliedAttachments];
    if ((!q && !requestAttachments.length) || activeRequestController) return;
    if (!updateUsage()) return;
    const requestMessage = q || "Please analyze the attached file(s) and provide the relevant answer.";
    const history = conversationHistory();
    const rethink = needsCodeRethink(q);
    addMessage(q || "Please analyze the attached file(s).", "user", { attachmentNames: requestAttachments.map((attachment) => attachment.name) });
    renderMessageAttachmentPreviews(list.lastElementChild, requestAttachments);
    await persistAttachmentPayloads(requestAttachments);
    const sentMessage = list.lastElementChild;
    if (sentMessage && requestAttachments.length) sentMessage.dataset.attachmentRefs = JSON.stringify(requestAttachments.map(attachmentReference));
    saveCurrentChat();
    input.value = "";
    pendingAttachments = [];
    renderPendingAttachments();
    updateUsage(true);
    const local = requestAttachments.length ? null : localAnswer(q);
    if (local && appSettings.fastAnswers && !thinkMode && !webSearch && selectedModel === "xmanius-1") { addMessage(local, "assistant", { animate: true }); return; }
    const thinking = document.createElement("article");
    thinking.className = "message assistant thinking ai-message--thinking";
    thinking.setAttribute("role", "status");
    thinking.innerHTML = `<span>${requestAttachments.length ? "Reviewing the attachment" : thinkMode ? "Thinking carefully" : webSearch ? "Searching multiple sources" : rethink ? "Checking the previous code" : "Thinking"}</span><i></i><i></i><i></i>`;
    list.append(thinking);
    scrollChatToBottom({ force: true });
    activeRequestController = new AbortController();
    const reasoningStartedAt = performance.now();
    // Keep the client alive for long answers. Manual stopping remains
    // immediate, but generation is never mislabeled as user-cancelled just
    // because a fixed 30-second timer fired.
    activeRequestStopReason = "";
    const timeout = window.setTimeout(() => {
      if (activeRequestController) {
        activeRequestStopReason = "timeout";
        activeRequestController.abort();
      }
    }, thinkMode ? 300000 : 180000);
    setSendingState(true);
    try {
      const response = await fetch("/api/xmanius-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: requestMessage, model: selectedModel, thinkMode, webSearch, history, rethink, attachments: requestAttachments.map(attachmentToRequest), preferences: { ...appSettings, customInstructions: String(appSettings.customInstructions || "").slice(0, 500) } }), signal: activeRequestController.signal });
      const data = await response.json().catch(() => ({}));
      thinking.remove();
    // Failover is intentionally silent: the public model label remains Xmanius 1.
      addMessage(response.ok ? data.reply : (data.userMessage || data.error || `The AI request failed (${response.status}).`), "assistant", { animate: true, sources: response.ok ? data.sources : [], searchError: response.ok ? data.searchError : "", reasoningSummary: response.ok && thinkMode ? data.reasoningSummary : "", reasoningSeconds: thinkMode ? Math.max(1, Math.round((performance.now() - reasoningStartedAt) / 1000)) : 0, thinkMode });
    } catch (error) {
      thinking.remove();
      if (error.name === "AbortError") {
        const message = activeRequestStopReason === "timeout" ? "The response took too long to finish. Please try again with a shorter request." : "The response was stopped by you.";
        addMessage(message, "assistant", { animate: true, reasoningSeconds: thinkMode ? Math.max(1, Math.round((performance.now() - reasoningStartedAt) / 1000)) : 0, thinkMode });
      }
      else {
        const localFileHint = window.location.protocol === "file:" ? " Open the deployed site (or a local server) instead of opening the HTML file directly." : " Check that the deployed /api/xmanius-chat endpoint is available.";
        const networkMessage = error?.message && error.message !== "Failed to fetch" ? error.message : `The AI service could not be reached.${localFileHint} Your API key stays server-side and was not exposed.`;
        addMessage(networkMessage, "assistant", { animate: true, reasoningSeconds: thinkMode ? Math.max(1, Math.round((performance.now() - reasoningStartedAt) / 1000)) : 0, thinkMode });
      }
    } finally {
      window.clearTimeout(timeout);
      activeRequestController = null;
      activeRequestStopReason = "";
      setSendingState(false);
    }
  };
  let voiceSessionId = 0;
  let voiceNoticeTimer = 0;
  let voiceRestartTimer = 0;
  let voiceStopRequested = false;
  const showVoiceNotice = (message, duration = 4500) => { if (!usageNotice) { console.warn(`[Xmanius voice] ${message}`); return; } window.clearTimeout(voiceNoticeTimer); usageNotice.textContent = message; usageNotice.classList.add("is-visible"); voiceNoticeTimer = window.setTimeout(() => { if (usageNotice.textContent === message) { usageNotice.textContent = ""; usageNotice.classList.remove("is-visible"); } }, duration); };
  const stopAudioMeter = () => { if (audioFrame) { window.cancelAnimationFrame(audioFrame); audioFrame = 0; } try { audioSource?.disconnect(); } catch {} audioSource = null; audioAnalyser = null; audioStream?.getTracks().forEach((track) => { try { track.stop(); } catch {} }); audioStream = null; const context = audioContext; audioContext = null; if (context && context.state !== "closed") void context.close().catch(() => {}); };
  const setDictation = (active) => { form.classList.toggle("is-listening", active); dictationBar?.setAttribute("aria-hidden", String(!active)); dictationBar?.style.setProperty("display", active ? "flex" : "none", "important"); if (active) { const waveform = document.querySelector(".dictation-waveform"); if (waveform && waveform.children.length < 80) { waveform.replaceChildren(); for (let index = 0; index < 96; index += 1) waveform.append(document.createElement("i")); } return; } input.placeholder = "Ask anything"; document.querySelector("[data-chat-mic]")?.classList.remove("active"); stopAudioMeter(); };
  const finishVoiceSession = ({ clearText = false, focus = true, abort = false } = {}) => { voiceStopRequested = true; window.clearTimeout(voiceRestartTimer); voiceRestartTimer = 0; voiceSessionId += 1; const oldRecognition = recognition; recognition = null; listening = false; if (abort) { try { oldRecognition?.abort(); } catch {} } if (clearText) input.value = ""; setDictation(false); input.placeholder = "Ask anything"; if (focus) input.focus(); };
  const startAudioMeter = async () => { if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone metering is unavailable in this browser."); const AudioContextClass = window.AudioContext || window.webkitAudioContext; if (!AudioContextClass) throw new Error("Audio visualization is unavailable in this browser."); const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); if (!form.classList.contains("is-listening")) { stream.getTracks().forEach((track) => track.stop()); return; } audioStream = stream; audioContext = new AudioContextClass(); await audioContext.resume().catch(() => {}); audioAnalyser = audioContext.createAnalyser(); audioAnalyser.fftSize = 256; audioAnalyser.smoothingTimeConstant = .78; audioAnalyser.minDecibels = -90; audioAnalyser.maxDecibels = -10; audioSource = audioContext.createMediaStreamSource(audioStream); audioSource.connect(audioAnalyser); const waveform = document.querySelector(".dictation-waveform"); if (!waveform) return; if (waveform.children.length < 80) { waveform.replaceChildren(); for (let index = 0; index < 96; index += 1) waveform.append(document.createElement("i")); } const bars = [...waveform.querySelectorAll("i")]; const frequencies = new Uint8Array(audioAnalyser.frequencyBinCount); const meter = () => { if (!audioAnalyser || !form.classList.contains("is-listening")) return; audioAnalyser.getByteFrequencyData(frequencies); bars.forEach((bar, index) => { const start = Math.floor(index * frequencies.length / bars.length); const end = Math.max(start + 1, Math.floor((index + 1) * frequencies.length / bars.length)); let total = 0; for (let offset = start; offset < end; offset += 1) total += frequencies[offset] || 0; const level = total / ((end - start) * 255); bar.style.height = `${Math.max(3, 3 + level * 29)}px`; bar.style.opacity = `${Math.min(1, Math.max(.35, .35 + level))}`; }); audioFrame = window.requestAnimationFrame(meter); }; meter(); };
  const startVoice = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      finishVoiceSession({ focus: true });
      showVoiceNotice("Voice input is not supported here. Try Chrome or Edge over HTTPS, or use the text box.");
      return;
    }
    if (recognition || form.classList.contains("is-listening")) return;

    voiceStopRequested = false;
    const sessionId = ++voiceSessionId;
    const instance = new Recognition();
    let finalText = "";
    recognition = instance;
    listening = false;
    setDictation(true);
    input.placeholder = "Listening…";
    document.querySelector("[data-chat-mic]")?.classList.add("active");
    instance.lang = appSettings.language === "auto" ? (navigator.language || "en-US") : appSettings.language;
    instance.interimResults = true;
    instance.continuous = true;
    instance.maxAlternatives = 3;
    const isCurrentSession = () => recognition === instance && voiceSessionId === sessionId;
    const restart = () => {
      voiceRestartTimer = 0;
      if (!isCurrentSession() || voiceStopRequested) return;
      try {
        instance.start();
      } catch (error) {
        if (error?.name === "InvalidStateError") {
          voiceRestartTimer = window.setTimeout(restart, 180);
          return;
        }
        finishVoiceSession({ focus: true });
        showVoiceNotice("Voice input stopped unexpectedly. Try again.");
      }
    };
    instance.onstart = () => {
      if (!isCurrentSession()) return;
      listening = true;
      input.placeholder = "Listening…";
      void startAudioMeter().catch((error) => {
        if (isCurrentSession()) {
          stopAudioMeter();
          showVoiceNotice("Voice transcription is active, but the waveform is unavailable.");
          console.warn("[Xmanius voice meter]", error);
        }
      });
    };
    instance.onresult = (event) => {
      if (!isCurrentSession()) return;
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const alternatives = [...event.results[index]].filter((alternative) => alternative?.transcript).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        const transcript = alternatives[0]?.transcript || "";
        if (event.results[index].isFinal) finalText = `${finalText.trim()} ${transcript.trim()}`.trim();
        else interimText += transcript;
      }
      input.value = `${finalText}${finalText && interimText ? " " : ""}${interimText}`.trim();
    };
    instance.onerror = (event) => {
      if (!isCurrentSession()) return;
      const messages = {
        "not-allowed": "Microphone permission was denied. Allow microphone access and try again.",
        "service-not-allowed": "The browser speech service is unavailable. Try again or use the text box.",
        "audio-capture": "No working microphone was found. Check your device settings."
      };
      if (event.error === "no-speech" || event.error === "network" || event.error === "aborted") return;
      finishVoiceSession({ focus: true });
      showVoiceNotice(messages[event.error] || "Voice input stopped unexpectedly. Try again.");
    };
    instance.onend = () => {
      if (!isCurrentSession()) return;
      listening = false;
      if (voiceStopRequested) {
        finishVoiceSession({ focus: true });
        return;
      }
      window.clearTimeout(voiceRestartTimer);
      voiceRestartTimer = window.setTimeout(restart, 100);
    };
    try {
      instance.start();
    } catch {
      if (isCurrentSession()) {
        finishVoiceSession({ focus: true });
        showVoiceNotice("Voice input could not start. Please try again.");
      }
    }
  };
  attachFilesButton?.addEventListener("click", () => { setModelPicker(false); fileInput?.click(); });
  attachCameraButton?.addEventListener("click", () => { setModelPicker(false); void openCamera(); });
  fileInput?.addEventListener("change", handleAttachmentSelection);
  cameraInput?.addEventListener("change", handleAttachmentSelection);
  attachments?.addEventListener("click", (event) => { const remove = event.target.closest("[data-remove-attachment]"); if (!remove) return; pendingAttachments.splice(Number(remove.dataset.removeAttachment), 1); renderPendingAttachments(); });
  document.addEventListener("keydown", (event) => { if (!event.ctrlKey || event.altKey || event.metaKey) return; const key = event.key.toLowerCase(); if (key === "k") { event.preventDefault(); fileInput?.click(); } if (key === "t") { event.preventDefault(); void openCamera(); } });
  document.addEventListener("paste", (event) => { const pastedFiles = [...(event.clipboardData?.items || [])].map((item) => item.kind === "file" ? item.getAsFile() : null).filter(Boolean); if (pastedFiles.length) { event.preventDefault(); void addSelectedFiles(pastedFiles); } });
  form.addEventListener("submit", (event) => { event.preventDefault(); ask(input.value); });
  sendButton?.addEventListener("click", (event) => { if (!activeRequestController) return; event.preventDefault(); activeRequestStopReason = "user"; activeRequestController.abort(); });
  document.querySelector("[data-chat-mic]")?.addEventListener("click", startVoice);
  dictationSend?.setAttribute("aria-label", "Review dictated message");
  dictationSend?.setAttribute("title", "Review dictated message");
  dictationCancel?.addEventListener("click", () => finishVoiceSession({ clearText: true, focus: true, abort: true }));
  dictationStop?.addEventListener("click", () => { voiceStopRequested = true; if (!recognition) { finishVoiceSession({ focus: true }); return; } try { recognition.stop(); } catch { finishVoiceSession({ focus: true, abort: true }); } });
  dictationSend?.addEventListener("click", () => { const dictatedText = input.value.trim(); finishVoiceSession({ clearText: false, focus: true, abort: true }); if (dictatedText) input.value = dictatedText; });
  document.addEventListener("visibilitychange", () => { if (document.hidden && (recognition || form.classList.contains("is-listening"))) finishVoiceSession({ focus: false, abort: true }); });
  window.addEventListener("pagehide", () => finishVoiceSession({ focus: false, abort: true }));
  const setModelPicker = (open) => { modelPicker?.classList.toggle("is-open", open); modelToggle?.setAttribute("aria-expanded", String(open)); headerModelToggle?.setAttribute("aria-expanded", String(open)); };
  modelToggle?.addEventListener("click", () => setModelPicker(!modelPicker.classList.contains("is-open")));
  headerModelToggle?.addEventListener("click", () => setModelPicker(!modelPicker.classList.contains("is-open")));
  const setSelectedModel = (model) => { selectedModel = ["xmanius-1", "xmanius-2", "xmanius-3"].includes(model) ? model : "xmanius-1"; modelPicker?.querySelectorAll("[data-model]").forEach((item) => { const active = item.dataset.model === selectedModel; item.classList.toggle("is-selected", active); item.setAttribute("aria-pressed", String(active)); const check = item.querySelector("b"); if (check) check.textContent = active ? "✓" : ""; }); if (modelName) modelName.innerHTML = `${selectedModel === "xmanius-3" ? "Xmanius 3" : selectedModel === "xmanius-2" ? "Xmanius 2" : "Xmanius 1"} <span class="dropdown-chevron" aria-hidden="true"></span>`; };
  modelPicker?.addEventListener("click", (event) => { if (event.target.closest("[data-voice-chat]")) { setModelPicker(false); input.placeholder = "Voice chat is ready"; return; } const option = event.target.closest("[data-model]"); if (option) { setSelectedModel(option.dataset.model); setModelPicker(false); } });
  document.addEventListener("click", (event) => { if (modelPicker?.classList.contains("is-open") && !event.target.closest(".chat-composer, [data-model-menu]")) setModelPicker(false); });
  const reset = () => { saveCurrentChat(); currentChatId = crypto.randomUUID?.() || String(Date.now()); list.replaceChildren(); empty.hidden = false; input.value = ""; input.focus(); };
  document.querySelectorAll("[data-new-chat]").forEach((button) => button.addEventListener("click", reset));
  const handleChatAction = async (action, chatId) => {
    const chats = readChats();
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) { closeChatMenu(); return; }
    if (action.dataset.chatAction === "pin") chat.pinned = !chat.pinned;
    if (action.dataset.chatAction === "delete") {
      saveChats(chats.filter((item) => item.id !== chat.id));
      if (chat.id === currentChatId) {
        currentChatId = crypto.randomUUID?.() || String(Date.now());
        list.replaceChildren();
        empty.hidden = false;
        input.value = "";
      }
      closeChatMenu();
      renderRecents();
      return;
    }
    if (action.dataset.chatAction === "share") {
      const shareText = `${chat.title}\n\n${chat.messages.map((item) => `${item.type === "user" ? "You" : "Xmanius"}: ${item.text}`).join("\n\n")}`;
      if (navigator.share) await navigator.share({ title: chat.title, text: shareText }).catch(() => {});
      else await navigator.clipboard?.writeText(shareText);
    }
    saveChats(chats);
    closeChatMenu();
    renderRecents();
  };
  recent?.addEventListener("click", (event) => {
    const menuButton = event.target.closest("[data-chat-menu]");
    if (menuButton) {
      const row = menuButton.closest(".conversation-row");
      if (openChatMenuRow === row) closeChatMenu();
      else openChatMenuFor(row, menuButton);
      return;
    }
    const action = event.target.closest("[data-chat-action]");
    if (action) {
      const row = action.closest(".conversation-row");
      handleChatAction(action, row?.dataset.chatId || openChatMenuRow?.dataset.chatId);
      return;
    }
    const button = event.target.closest("button[data-chat-id]");
    if (button) {
      closeChatMenu();
      loadChat(button.dataset.chatId);
    }
  });
  recent?.addEventListener("scroll", closeChatMenu, { passive: true });
  window.addEventListener("resize", () => { if (openChatMenu && openChatMenuRow) positionChatMenu(openChatMenu, openChatMenuRow.querySelector("[data-chat-menu]")); });
  document.addEventListener("click", (event) => {
    if (event.target.closest(".conversation-menu-portal")) return;
    if (!event.target.closest(".conversation-row")) closeChatMenu();
  });
  document.addEventListener("click", (event) => {
    const action = event.target.closest(".conversation-menu-portal [data-chat-action]");
    if (!action) return;
    event.preventDefault();
    handleChatAction(action, openChatMenuRow?.dataset.chatId);
  });
  document.querySelector("[data-open-sidebar]")?.addEventListener("click", () => app.classList.add("sidebar-visible"));
  document.querySelector("[data-close-sidebar]")?.addEventListener("click", () => { if (window.matchMedia("(max-width: 720px)").matches) app.classList.remove("sidebar-visible"); else { const collapsed = app.classList.toggle("sidebar-collapsed"); const button = document.querySelector("[data-close-sidebar]"); button?.setAttribute("aria-label", collapsed ? "Open sidebar" : "Collapse sidebar"); button?.setAttribute("title", collapsed ? "Open sidebar" : "Collapse sidebar"); } });
  thinkToggle?.addEventListener("click", () => { thinkMode = !thinkMode; thinkToggle.classList.toggle("active", thinkMode); thinkToggle.setAttribute("aria-pressed", String(thinkMode)); });
  webSearchToggle?.addEventListener("click", () => { webSearch = !webSearch; webSearchToggle.classList.toggle("active", webSearch); webSearchToggle.setAttribute("aria-pressed", String(webSearch)); });
  usageIndicator?.addEventListener("click", () => { const usage = readUsage(); const resetText = formatResetTime(usage.startedAt + usageWindow); updateUsage(); if (usageNotice && usage.count < usageLimit) { usageNotice.textContent = `${Math.max(0, usageLimit - usage.count)} requests left. Your limit resets at ${resetText}.`; usageNotice.classList.add("is-visible"); } else usageNotice?.classList.toggle("is-visible"); });
  const settingsKey = "xmanius-settings-v1";
  const settingLabels = {
    appearance: { system: "System", dark: "Dark", light: "Light" },
    contrast: { system: "System", medium: "Medium", increased: "Increased" },
    language: { auto: "Auto-detect", "en-US": "English (US)", hi: "हिन्दी", es: "español", de: "Deutsch", fr: "français", ar: "العربية", bn: "বাংলা" },
    baseTone: { default: "Default", professional: "Professional", friendly: "Friendly", candid: "Candid", quirky: "Quirky", efficient: "Efficient", cynical: "Cynical" },
    warm: { less: "Less", default: "Default", more: "More" },
    enthusiastic: { less: "Less", default: "Default", more: "More" },
    headers: { more: "More", default: "Default", less: "Less" },
    emoji: { more: "More", default: "Default", less: "Less" }
  };
  const settingChoices = {
    appearance: [["system", "System"], ["dark", "Dark"], ["light", "Light"]],
    contrast: [["system", "System"], ["medium", "Medium"], ["increased", "Increased"]],
    language: [["auto", "Auto-detect"], ["en-US", "English (US)"], ["hi", "हिन्दी"], ["es", "español"], ["de", "Deutsch"], ["fr", "français"], ["ar", "العربية"], ["bn", "বাংলা"]],
    baseTone: [["default", "Default"], ["professional", "Professional"], ["friendly", "Friendly"], ["candid", "Candid"], ["quirky", "Quirky"], ["efficient", "Efficient"], ["cynical", "Cynical"]],
    warm: [["less", "Less"], ["default", "Default"], ["more", "More"]],
    enthusiastic: [["less", "Less"], ["default", "Default"], ["more", "More"]],
    headers: [["more", "More"], ["default", "Default"], ["less", "Less"]],
    emoji: [["more", "More"], ["default", "Default"], ["less", "Less"]]
  };
  let profileMenu = null;
  let settingsBackdrop = null;
  let settingsSection = "general";
  let settingsChoiceMenu = null;
  let settingsChoiceButton = null;
  const memoryClearedKey = "xmanius-memory-cleared-at";
  const buildMemorySummary = () => {
    const clearedAt = Number(localStorage.getItem(memoryClearedKey) || 0);
    const chats = readChats().filter((chat) => Number(chat.updatedAt || 0) > clearedAt);
    const titles = chats.slice(0, 5).map((chat) => chat.title).filter(Boolean);
    if (!chats.length) return "No local chat memory has been created yet.";
    return "I keep this overview only in this browser. You have " + chats.length + " saved chat" + (chats.length === 1 ? "" : "s") + ". Recent topics include: " + (titles.join(", ") || "your recent conversations") + ".";
  };
  const closeProfileMenu = () => { profileMenu?.remove(); profileMenu = null; };
  const closeSettingsChoiceMenu = () => { settingsChoiceMenu?.remove(); settingsChoiceMenu = null; settingsChoiceButton = null; };
  const positionSettingsChoiceMenu = () => {
    if (!settingsChoiceMenu || !settingsChoiceButton?.isConnected) return;
    const buttonRect = settingsChoiceButton.getBoundingClientRect();
    const menuRect = settingsChoiceMenu.getBoundingClientRect();
    const padding = 10;
    let left = buttonRect.right - menuRect.width;
    if (left < padding) left = buttonRect.left;
    left = Math.max(padding, Math.min(left, window.innerWidth - menuRect.width - padding));
    let top = buttonRect.bottom + 7;
    if (top + menuRect.height > window.innerHeight - padding && buttonRect.top - menuRect.height - 7 >= padding) top = buttonRect.top - menuRect.height - 7;
    settingsChoiceMenu.style.left = `${Math.round(left)}px`;
    settingsChoiceMenu.style.top = `${Math.round(Math.max(padding, top))}px`;
  };
  const closeSettings = () => { closeSettingsChoiceMenu(); settingsBackdrop?.remove(); settingsBackdrop = null; };
  const settingValue = (key) => settingLabels[key]?.[appSettings[key]] || appSettings[key] || "Default";
  const createSettingRow = (key, label, description = "") => '<div class="settings-row"><div><strong>' + label + '</strong>' + (description ? '<small>' + description + '</small>' : '') + '</div><button type="button" class="settings-value" data-setting-choice="' + key + '">' + settingValue(key) + '<span class="dropdown-chevron" aria-hidden="true"></span></button></div>';
  const renderSettingsSection = () => {
    if (!settingsBackdrop) return;
    closeSettingsChoiceMenu();
    const content = settingsBackdrop.querySelector("[data-settings-content]");
    const title = settingsBackdrop.querySelector("[data-settings-title]");
    if (!content || !title) return;
    title.textContent = settingsSection === "general" ? "General" : settingsSection === "personalization" ? "Personalization" : "Memory";
    if (settingsSection === "general") {
      content.innerHTML = '<div class="settings-intro"><strong>Make Xmanius work the way you prefer.</strong><small>These preferences are saved locally on this device.</small></div>' +
        createSettingRow("appearance", "Appearance", "Choose the interface theme.") +
        createSettingRow("contrast", "Contrast", "Adjust the contrast of the interface.") +
        createSettingRow("language", "Language", "Used for the interface and voice recognition.") +
        '<div class="settings-row settings-toggle-row"><div><strong>Higher intelligence</strong><small>Use Think mode for questions that need deeper analysis.</small></div><button type="button" class="settings-switch ' + (thinkMode ? "is-on" : "") + '" data-settings-think aria-pressed="' + String(thinkMode) + '"><span></span></button></div>' +
        '<div class="settings-row settings-toggle-row"><div><strong>Enable dictation</strong><small>Allow microphone input in the chat composer.</small></div><button type="button" class="settings-switch is-on" aria-label="Dictation is available"><span></span></button></div>';
    } else if (settingsSection === "personalization") {
      content.innerHTML = '<div class="settings-intro"><strong>Choose how Xmanius responds.</strong><small>These choices guide tone and formatting without exposing private application details.</small></div>' +
        createSettingRow("baseTone", "Base style and tone", "The overall style of the answer.") +
        createSettingRow("warm", "Warm", "Friendlier and more personable.") +
        createSettingRow("enthusiastic", "Enthusiastic", "How energetic the response sounds.") +
        createSettingRow("headers", "Headers & Lists", "How strongly answers use readable structure.") +
        createSettingRow("emoji", "Emoji", "How often emojis may be used.") +
        '<div class="settings-row settings-toggle-row"><div><strong>Fast answers</strong><small>Use quick local answers when the question is simple.</small></div><button type="button" class="settings-switch ' + (appSettings.fastAnswers ? "is-on" : "") + '" data-settings-fast aria-pressed="' + String(appSettings.fastAnswers) + '"><span></span></button></div>' +
        '<label class="settings-custom"><strong>Custom instructions</strong><textarea data-custom-instructions maxlength="500" placeholder="Additional behavior, style, and tone preferences">' + String(appSettings.customInstructions || "").replace(/</g, "&lt;") + '</textarea></label>';
    } else {
      content.innerHTML = '<div class="settings-memory-card"><div><strong>Enable memory</strong><small>Keep a local overview of your saved chats to make this device easier to use.</small></div><button type="button" class="settings-switch ' + (appSettings.memoryEnabled ? "is-on" : "") + '" data-settings-memory aria-pressed="' + String(appSettings.memoryEnabled) + '"><span></span></button></div>' +
        '<div class="settings-memory-card"><div><strong>Memory summary</strong><small data-memory-summary>' + buildMemorySummary().replace(/</g, "&lt;") + '</small></div><button type="button" class="settings-secondary" data-clear-memory>Clear</button></div>' +
        '<p class="settings-note">Memory is local to this browser. It is not sent as a separate profile or uploaded as an account database.</p>';
    }
  };
  const openSettings = (section = "general") => {
    closeProfileMenu();
    settingsSection = section;
    if (!settingsBackdrop) {
      settingsBackdrop = document.createElement("div");
      settingsBackdrop.className = "settings-backdrop";
      settingsBackdrop.innerHTML = '<section class="settings-shell" role="dialog" aria-modal="true" aria-label="Xmanius settings"><aside class="settings-nav"><button type="button" class="settings-close" data-settings-close aria-label="Close settings">×</button><input class="settings-search" data-settings-search type="search" placeholder="Search settings" aria-label="Search settings"><button type="button" class="settings-nav-item is-active" data-settings-section="general">⚙ <span>General</span></button><button type="button" class="settings-nav-item" data-settings-section="personalization">◉ <span>Personalization</span></button><button type="button" class="settings-nav-item" data-settings-section="memory">◌ <span>Memory</span></button><div class="settings-nav-spacer"></div><button type="button" class="settings-nav-item" data-profile-action="connect">◌ <span>Connect Google</span></button></aside><section class="settings-main"><header><h2 data-settings-title>General</h2></header><div data-settings-content></div></section></section>';
      document.body.append(settingsBackdrop);
      settingsBackdrop.addEventListener("click", (event) => {
        if (event.target === settingsBackdrop || event.target.closest("[data-settings-close]")) { closeSettings(); return; }
        const section = event.target.closest("[data-settings-section]");
        if (section) { settingsSection = section.dataset.settingsSection; settingsBackdrop.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item === section)); renderSettingsSection(); return; }
        const choiceButton = event.target.closest("[data-setting-choice]");
        if (choiceButton) {
          if (settingsChoiceMenu?.dataset.settingKey === choiceButton.dataset.settingChoice) { closeSettingsChoiceMenu(); return; }
          closeSettingsChoiceMenu();
          const menu = document.createElement("div");
          menu.className = "settings-choice-menu settings-choice-menu-portal";
          menu.dataset.settingKey = choiceButton.dataset.settingChoice;
          settingChoices[choiceButton.dataset.settingChoice].forEach(([value, label]) => { const option = document.createElement("button"); option.type = "button"; option.dataset.settingOption = value; option.dataset.settingKey = choiceButton.dataset.settingChoice; option.innerHTML = '<span>' + label + '</span>' + (appSettings[choiceButton.dataset.settingChoice] === value ? '<b>✓</b>' : ''); menu.append(option); });
          menu.addEventListener("click", (menuEvent) => {
            const option = menuEvent.target.closest("[data-setting-option]");
            if (!option) return;
            appSettings[option.dataset.settingKey] = option.dataset.settingOption;
            saveSettings();
            applySettings();
            renderSettingsSection();
          });
          settingsChoiceMenu = menu;
          settingsChoiceButton = choiceButton;
          document.body.append(menu);
          positionSettingsChoiceMenu();
          return;
        }
        const option = event.target.closest("[data-setting-option]");
        if (option) { appSettings[option.dataset.settingKey] = option.dataset.settingOption; saveSettings(); applySettings(); renderSettingsSection(); return; }
        const fast = event.target.closest("[data-settings-fast]");
        if (fast) { appSettings.fastAnswers = !appSettings.fastAnswers; saveSettings(); renderSettingsSection(); return; }
        const memory = event.target.closest("[data-settings-memory]");
        if (memory) { appSettings.memoryEnabled = !appSettings.memoryEnabled; saveSettings(); renderSettingsSection(); return; }
        const think = event.target.closest("[data-settings-think]");
        if (think) { thinkMode = !thinkMode; thinkToggle?.classList.toggle("active", thinkMode); thinkToggle?.setAttribute("aria-pressed", String(thinkMode)); renderSettingsSection(); return; }
        const clear = event.target.closest("[data-clear-memory]");
        if (clear) { localStorage.setItem(memoryClearedKey, String(Date.now())); renderSettingsSection(); return; }
        const connect = event.target.closest('[data-profile-action="connect"]');
        if (connect) { window.alert("Google sign-in is not configured for this deployment yet. Your chats and files remain local to this browser."); return; }
      });
      settingsBackdrop.addEventListener("input", (event) => {
        if (event.target.matches("[data-custom-instructions]")) { appSettings.customInstructions = event.target.value.slice(0, 500); saveSettings(); }
        if (event.target.matches("[data-settings-search]")) {
          const query = event.target.value.trim().toLowerCase();
          settingsBackdrop.querySelectorAll("[data-settings-section]").forEach((item) => { item.hidden = query && !item.textContent.toLowerCase().includes(query); });
        }
      });
    }
    settingsBackdrop.classList.add("is-open");
    settingsBackdrop.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item.dataset.settingsSection === settingsSection));
    renderSettingsSection();
  };
  const createProfileMenu = () => {
    const menu = document.createElement("div");
    menu.className = "profile-menu";
    menu.innerHTML = '<strong>Guest user</strong><small>Local browser account</small><button type="button" data-profile-action="settings">⚙ <span>Settings</span></button><button type="button" data-profile-action="memory">◌ <span>Memory</span></button><button type="button" data-profile-action="connect">◉ <span>Connect Google</span></button>';
    menu.addEventListener("click", (event) => { const action = event.target.closest("[data-profile-action]")?.dataset.profileAction; if (!action) return; if (action === "settings") openSettings("general"); if (action === "memory") openSettings("memory"); if (action === "connect") window.alert("Google sign-in is not configured for this deployment yet. Your chats and files remain local to this browser."); });
    return menu;
  };
  accountButton?.addEventListener("click", (event) => { event.stopPropagation(); if (profileMenu) { closeProfileMenu(); return; } profileMenu = createProfileMenu(); accountButton.parentElement.append(profileMenu); });
  document.addEventListener("click", (event) => { if (profileMenu && !event.target.closest("[data-account-button], .profile-menu")) closeProfileMenu(); });
  document.addEventListener("click", (event) => { if (settingsChoiceMenu && !event.target.closest("[data-setting-choice], .settings-choice-menu-portal")) closeSettingsChoiceMenu(); });
  window.addEventListener("resize", positionSettingsChoiceMenu);
  applySettings();
  const colorScheme = window.matchMedia("(prefers-color-scheme: light)");
  colorScheme.addEventListener?.("change", () => { if (appSettings.appearance === "system") applySettings(); });
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
    const mic = panel.querySelector("[data-general-mic]"); recognitionInstance.onstart = () => { panel.dataset.voiceState = "listening"; mic.classList.add("is-active"); panel.querySelector(".ai-guide__voice-greeting").textContent = "Listening…"; }; recognitionInstance.onresult = async (event) => { const question = event.results[0][0].transcript.trim(); panel.dataset.voiceState = "thinking"; panel.querySelector(".ai-guide__voice-greeting").textContent = "Thinking…"; const response = await fetch("/api/xmanius-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question }) }); const data = await response.json(); const answer = data.reply || data.error || "I could not answer that right now."; panel.querySelector(".ai-guide__voice-greeting").textContent = answer; if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(answer)); panel.dataset.voiceState = "speaking"; }; recognitionInstance.onend = () => { mic.classList.remove("is-active"); }; recognitionInstance.start();
  };
  window.__openXmaniusVoice = openGeneralVoice;
  document.addEventListener("click", (event) => { if (event.target.closest("[data-voice-chat]")) openGeneralVoice(); });
})();
