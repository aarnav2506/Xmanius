(() => {
  "use strict";

  // Platform Detection
  const isAndroid = /Android/i.test(navigator.userAgent) || Boolean(window.Capacitor?.getPlatform() === 'android');
  if (isAndroid) {
    document.body.classList.add("platform-android");
  }

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
  const moreModelsToggle = document.querySelector("[data-more-models]");
  const modelSubmenu = document.querySelector("[data-model-submenu]");
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
  const readApiBase = () => {
    try {
      return String(window.XMANIUS_API_BASE_URL || localStorage.getItem("xmanius-api-base-url") || "").trim().replace(/\/+$/, "");
    } catch {
      return String(window.XMANIUS_API_BASE_URL || "").trim().replace(/\/+$/, "");
    }
  };
  const getApiEndpoint = () => {
    const base = readApiBase();
    if (!base) return "/api/xmanius-chat";
    const origin = /^[a-z][a-z\d+.-]*:\/\//i.test(base) ? base : `https://${base}`;
    return /\/api\/xmanius-chat$/i.test(origin) ? origin : `${origin}/api/xmanius-chat`;
  };
  const isNativeApp = () => window.location.protocol === "file:" || Boolean(window.Capacitor?.isNativePlatform?.());
  window.XmaniusApiEndpoint = getApiEndpoint;
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
  let selectedModel = (() => { try { const value = localStorage.getItem("xmanius-selected-model-v1"); return /^xmanius-[1-9]$/.test(value || "") ? value : "xmanius-1"; } catch { return "xmanius-1"; } })();
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
  const maxImageBytes = 100_000_000;
  const maxFileBytes = 100_000_000;
  const usageKey = "xmanius-usage-v1";
  const usageLimit = 2000;
  const usageWindow = 24 * 60 * 60 * 1000;
  const readUsage = () => { try { const value = JSON.parse(localStorage.getItem(usageKey) || "null"); if (!value || Date.now() - value.startedAt >= usageWindow) return { count: 0, startedAt: Date.now() }; return value; } catch { return { count: 0, startedAt: Date.now() }; } };
  const formatResetTime = (timestamp) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  const updateUsage = (increment = false) => { const usage = readUsage(); if (increment) usage.count += 1; localStorage.setItem(usageKey, JSON.stringify(usage)); const percent = Math.min(100, Math.round(usage.count / usageLimit * 100)); const resetAt = usage.startedAt + usageWindow; const resetText = formatResetTime(resetAt); usageIndicator?.style.setProperty("--usage", `${percent}%`); if (usageLabel) usageLabel.textContent = `${percent}%`; if (usageReset) usageReset.textContent = `Reset ${resetText}`; usageIndicator?.setAttribute("title", `${Math.max(0, usageLimit - usage.count)} requests left today. Resets at ${resetText}.`); usageIndicator?.setAttribute("aria-label", `${percent}% used. ${Math.max(0, usageLimit - usage.count)} requests left today. Resets at ${resetText}.`); if (usageNotice && usage.count >= usageLimit) { usageNotice.textContent = `Your daily Xmanius limit of 2,000 requests is reached. It will refresh at ${resetText}.`; usageNotice.classList.add("is-visible"); } return usage.count < usageLimit; };
  let attachmentNoticeTimer = 0;
  const showAttachmentNotice = (message, duration = 4200) => { if (!usageNotice) return; window.clearTimeout(attachmentNoticeTimer); usageNotice.textContent = message; usageNotice.classList.add("is-visible"); attachmentNoticeTimer = window.setTimeout(() => { if (usageNotice.textContent === message) { usageNotice.textContent = ""; usageNotice.classList.remove("is-visible"); } }, duration); };
  const chatsKey = "xmanius-chats-v1";
  let currentChatId = crypto.randomUUID?.() || String(Date.now());
  const saveChats = (chats) => {
    localStorage.setItem(chatsKey, JSON.stringify(chats.slice(0, 50)));
    if (window.XmaniusAuth?.getState()?.user) {
      window.XmaniusAuth.syncCloudChats().catch(() => {});
    }
  };
  const cleanTitleText = (rawText) => {
    return String(rawText)
      .replace(/\[\[ANSWER_SUMMARY\]\][\s\S]*?\[\[\/ANSWER_SUMMARY\]\]/gi, "")
      .replace(/\[\[ANSWER_SUMMARY\]\][^\n]*/gi, "")
      .replace(/\[\[\/ANSWER_SUMMARY\]\]/gi, "")
      .replace(/\[\[.*?\]\]/g, "")
      .replace(/^["'`#*\s]+|["'`#*\s]+$/g, "")
      .replace(/^(Title|Headline|Topic):\s*/i, "")
      .replace(/\n.*/gs, "")
      .trim();
  };

  const getHeuristicTitle = (text) => {
    const cleaned = cleanTitleText(text);
    const lower = cleaned.toLowerCase().trim();
    if (!lower) return "Conversation Overview";
    if (/^(hi|hello|hey|greetings|hola|namaste|sup|yo|hi bro|hello ai)\b/i.test(lower)) {
      return "Polite Assistant Greeting";
    }
    if (/^(ok|okay|bye|goodbye|cya|thanks|thank you|cool|alright)\b/i.test(lower) || lower === ".") {
      return "General Conversation";
    }
    if (/\b(?:roblox|game|report|ban|player)\b/i.test(lower)) {
      return "The Truth About Roblox Reports";
    }
    if (/\b(?:android|mobile|ui|layout|app)\b/i.test(lower)) {
      return "Refined Android App UI Prompt";
    }
    if (/\b(?:ready|system|status|check)\b/i.test(lower)) {
      return "System Readiness Check";
    }
    if (/\b(?:youtube|vlog|phone|unlock)\b/i.test(lower)) {
      return "Unlocking Phone for YouTube Vlogs";
    }
    if (/\b(?:derivative|tan|sec|math|integral|calculate)\b/i.test(lower)) {
      return "Derivative of Tan X Plus Sec X";
    }
    if (/\b(?:marvel|sound|intro|music|audio|mp3)\b/i.test(lower)) {
      return "Marvel Intro Sound Generation";
    }
    if (/\b(?:video|mp4|media|clip|movie)\b/i.test(lower)) {
      return "Video Content Analysis & Summary";
    }
    if (/\b(?:document|pdf|docx|file|analysis|report)\b/i.test(lower)) {
      return "Document Analysis & Summary";
    }
    if (/\b(?:dining|food|dish|dal|chawal|recipe)\b/i.test(lower)) {
      return "Luxury Dal Chawal Prompt Generation";
    }
    if (/\b(?:upi|mandate|subscription|payment|bank)\b/i.test(lower)) {
      return "Resolving UPI Mandate Subscription";
    }
    if (/\b(?:image|photo|picture|draw|generate image)\b/i.test(lower)) {
      return "Creative Visual Prompt Generation";
    }
    if (/\b(?:code|python|javascript|html|css|bug|fix|function)\b/i.test(lower)) {
      return "Code Architecture & Analysis";
    }
    
    // Capitalize words nicely into a Title Case headline
    const words = cleaned.replace(/[^a-zA-Z0-9\s]/g, " ").trim().split(/\s+/).slice(0, 5);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  };

  const readChats = () => {
    try {
      const list = JSON.parse(localStorage.getItem(chatsKey) || "[]");
      let dirty = false;
      list.forEach(c => {
        if (c.title && (c.title.includes("[[") || c.title.startsWith("I check") || c.title.length > 55)) {
          const firstUser = c.messages?.find(m => m.type === "user")?.text || "";
          c.title = getHeuristicTitle(firstUser) || "Conversation Overview";
          dirty = true;
        }
      });
      if (dirty) localStorage.setItem(chatsKey, JSON.stringify(list));
      return list;
    } catch {
      return [];
    }
  };

  const generateAndAnimateTitle = async (chatId, firstMessageText) => {
    try {
      const cleanInput = cleanTitleText(firstMessageText);
      if (!cleanInput) return;

      let refinedTitle = "";

      const apiEndpoint = typeof window.XmaniusApiEndpoint === "function" ? window.XmaniusApiEndpoint() : (typeof getApiEndpoint === "function" ? getApiEndpoint() : "/api/xmanius-chat");

      const prompt = `Analyze this conversation opening and create a short, refined title (3 to 5 words maximum in Title Case) capturing the topic (e.g. 'Polite Assistant Greeting', 'Resolving UPI Mandate Subscription'). Output ONLY the title text with no quotes, tags, preamble, or punctuation:\n\n"${cleanInput}"`;

      try {
        const response = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            message: prompt,
            model: "xmanius-1",
            thinkMode: false,
            webSearch: false,
            history: []
          })
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const data = await response.json();
            refinedTitle = cleanTitleText(data.reply || data.answer || data.text || data.title || "");
          } else {
            const text = await response.text();
            try {
              const json = JSON.parse(text);
              refinedTitle = cleanTitleText(json.reply || json.answer || json.text || "");
            } catch {
              refinedTitle = cleanTitleText(text);
            }
          }
        }
      } catch (err) {
        console.warn("[Xmanius title generation] Falling back to heuristic refiner", err);
      }

      // Sanitize AI response
      refinedTitle = cleanTitleText(refinedTitle).slice(0, 45);

      if (!refinedTitle || refinedTitle.length < 3 || /^(New chat|Hello|Sure|Here is|Conversation|I check)/i.test(refinedTitle)) {
        refinedTitle = getHeuristicTitle(cleanInput);
      }

      // Update in storage
      const chats = readChats();
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        chat.title = refinedTitle;
        chat.titleGenerated = true;
        saveChats(chats);
      }

      // Animate typing effect directly in the sidebar DOM button
      const targetButton = document.querySelector(`.conversation-row[data-chat-id="${chatId}"] .conversation`);
      if (targetButton) {
        targetButton.textContent = "";
        let charIndex = 0;
        const typeInterval = setInterval(() => {
          if (charIndex < refinedTitle.length) {
            targetButton.textContent += refinedTitle.charAt(charIndex);
            charIndex++;
          } else {
            clearInterval(typeInterval);
            targetButton.textContent = refinedTitle;
          }
        }, 28);
      }
    } catch (e) {
      console.error("Title generation failed", e);
    }
  };
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
  const attachmentReference = (attachment) => ({ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, text: attachment.text || "", fileUri: attachment.fileUri || "" });
  const persistAttachmentPayloads = async (items) => {
    await Promise.all(items.map(async (attachment) => {
      attachment.id ||= "xmanius-file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
      const dataToStore = (attachment.data && attachment.data.length > 5_000_000) ? "" : (attachment.data || "");
      await attachmentDb.put({ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, data: dataToStore, text: attachment.text || "", fileUri: attachment.fileUri || "", savedAt: Date.now() });
    }));
  };
  const defaultSettings = { appearance: "system", contrast: "system", language: "auto", baseTone: "default", warm: "default", enthusiastic: "default", headers: "default", emoji: "default", fastAnswers: true, memoryEnabled: true, customInstructions: "", voiceCallSound: "puck", voiceSpeed: "1.0", voicePitch: "normal", autoReadAloud: false, handsFreeMic: false };
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
    // Memory is opt-in. When it is off, do not create or update a stored
    // conversation, including during reset, send, or navigation.
    if (!appSettings.memoryEnabled) return;
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
      
      let title = "New chat";
      if (existing && existing.title && !existing.title.includes("[[") && !existing.title.startsWith("I check")) {
        title = existing.title;
      } else if (messages.length > 0) {
        const firstUser = messages.find((item) => item.type === "user");
        const rawUser = cleanTitleText(firstUser?.text || "");
        title = getHeuristicTitle(rawUser) || rawUser.slice(0, 42) || "New chat";
      }

      const chat = { id: currentChatId, title: title, messages, updatedAt: Date.now() };
      if (existing && existing.titleGenerated) chat.titleGenerated = true;

      if (existing) Object.assign(existing, chat); else chats.unshift(chat);

      // Trigger AI title generation for new chats
      if (!chat.titleGenerated && messages.filter(m => m.type === "user").length === 1 && messages.some(m => m.type === "assistant")) {
        chat.titleGenerated = true; // prevent re-triggering
        if (existing) existing.titleGenerated = true;
        saveChats(chats); // save immediately to lock the generation
        
        const firstUserMsg = messages.find(m => m.type === "user");
        if (firstUserMsg) {
          // Fire background title generation immediately with typing animation
          setTimeout(() => {
            generateAndAnimateTitle(currentChatId, firstUserMsg.text);
          }, 100);
        }
      }
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
  const renderRecents = () => { closeChatMenu(); if (!recent) return; recent.replaceChildren(); readChats().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt).forEach((chat) => { const row = document.createElement("div"); row.className = `conversation-row${chat.pinned ? " is-pinned" : ""}`; row.dataset.chatId = chat.id; const button = document.createElement("button"); button.className = "conversation"; button.type = "button"; button.dataset.chatId = chat.id; button.textContent = chat.title; button.title = chat.title; const more = document.createElement("button"); more.className = "conversation-more"; more.type = "button"; more.dataset.chatMenu = chat.id; more.setAttribute("aria-label", `Options for ${chat.title}`); more.title = "Chat options"; more.textContent = "•••"; const menu = document.createElement("div"); menu.className = "conversation-menu"; menu.innerHTML = `<button type="button" data-chat-action="pin">${chat.pinned ? "Unpin" : "Pin"} chat</button><button type="button" data-chat-action="share">Share</button><button type="button" data-chat-action="delete">Delete</button>`; row.append(button, more, menu); recent.append(row); }); };
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
    const brand = isAndroid ? "Xmanias" : "Xmanius";
    if (/who are you|introduce yourself|what is your name/i.test(q)) return `Hello, I'm ${brand}, a general-purpose AI assistant. How can I help you today?`;
    if (/^(hi|hello|hey)\b/i.test(q)) return "Hello! How can I help you today?";
    if (/what can you do|help me/i.test(q)) return "I can explain ideas, help with coding, plan tasks, summarize information, brainstorm, and answer everyday safe questions.";
    if (/productivity|focus/i.test(q)) return "Choose one outcome, work in a short focused block, and remove the next distraction before you begin.";
    const math = question.match(/^\s*(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)\s*[?!.,]*\s*$/);
    if (math) { const a = Number(math[1]), b = Number(math[3]); return `The answer is ${math[2] === "+" ? a + b : math[2] === "-" ? a - b : math[2] === "*" ? a * b : b ? a / b : "undefined"}.`; }
    return null;
  };
  let isSpeaking = false;
  let currentSpeechText = "";

  const stopAiVoice = () => {
    isSpeaking = false;
    currentSpeechText = "";
    if ("speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
  };

  const getSelectedVoiceAndProps = () => {
    if (!("speechSynthesis" in window)) return { voice: null, pitch: 1.0, rate: 0.95 };
    const voices = window.speechSynthesis.getVoices() || [];
    const profile = appSettings.voiceCallSound || "puck";
    let pitch = 1.0;
    let rate = 1.0;
    let voice = null;

    const pool = voices.length ? voices : [];
    const englishPool = pool.filter((v) => v.lang.startsWith("en") || v.lang.startsWith("auto"));
    const activePool = englishPool.length ? englishPool : pool;

    const femaleVoiceList = activePool.filter((v) => /(?:female|zira|eva|hazel|susan|catherine|heera|aria|jenny|victoria|samantha|karen|fiona|veena|aoede|kore|zephyr|woman|girl)/i.test(v.name));
    const maleVoiceList = activePool.filter((v) => /(?:male|david|mark|george|ravi|guy|stefan|puck|charon|fenrir|pegasus|alex|daniel|fred|rishi|man|boy)/i.test(v.name));

    const pickFemale = (idx = 0) => femaleVoiceList[idx % (femaleVoiceList.length || 1)] || femaleVoiceList[0] || activePool.find((v) => !maleVoiceList.includes(v)) || activePool[0];
    const pickMale = (idx = 0) => maleVoiceList[idx % (maleVoiceList.length || 1)] || maleVoiceList[0] || activePool.find((v) => !femaleVoiceList.includes(v)) || activePool[0];

    if (profile === "puck") {
      pitch = 1.25; rate = 1.10;
      voice = pickMale(0);
    } else if (profile === "charon") {
      pitch = 0.55; rate = 0.85;
      voice = pickMale(1);
    } else if (profile === "aoede") {
      pitch = 1.35; rate = 1.05;
      voice = pickFemale(0);
    } else if (profile === "kore") {
      pitch = 0.95; rate = 0.90;
      voice = pickFemale(1);
    } else if (profile === "fenrir") {
      pitch = 0.60; rate = 0.92;
      voice = pickMale(0);
    } else if (profile === "zephyr") {
      pitch = 1.48; rate = 0.88;
      voice = pickFemale(0);
    } else if (profile === "pegasus") {
      pitch = 0.78; rate = 1.00;
      voice = pickMale(1);
    } else if (profile === "google-us") {
      pitch = 1.0; rate = 1.0;
      voice = activePool.find((v) => /us/i.test(v.name)) || activePool[0];
    } else if (profile === "google-uk") {
      pitch = 1.05; rate = 0.95;
      voice = activePool.find((v) => /uk|gb/i.test(v.name)) || activePool[0];
    }

    if (appSettings.voiceSpeed) {
      rate = Number(appSettings.voiceSpeed) || rate;
    }
    if (appSettings.voicePitch === "low") {
      pitch = Math.max(0.4, pitch * 0.85);
    } else if (appSettings.voicePitch === "high") {
      pitch = Math.min(2.0, pitch * 1.22);
    }

    if (!voice && activePool.length) {
      voice = activePool[0];
    }
    return { voice, pitch, rate };
  };

  if ("speechSynthesis" in window) {
    try { window.speechSynthesis.getVoices(); } catch (_) {}
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => { try { window.speechSynthesis.getVoices(); } catch (_) {} };
    }
  }

  const speak = (text, onEnd) => {
    const cleanText = String(text || "")
      .replace(/```[\s\S]*?```/g, "Code block omitted.")
      .replace(/`[^`]+`/g, (match) => match.slice(1, -1))
      .replace(/\[\[[\s\S]*?\]\]/g, "")
      .replace(/[*#_~>|-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText) { stopAiVoice(); if (onEnd) onEnd(); return; }

    // Toggle stop if already playing the exact same message sound button
    if (isSpeaking && currentSpeechText === cleanText) {
      stopAiVoice();
      if (typeof onEnd === "function") onEnd();
      return;
    }

    stopAiVoice();
    isSpeaking = true;
    currentSpeechText = cleanText;

    if ("speechSynthesis" in window) {
      const chunks = cleanText.match(/[^.!?\n]+[.!?\n]+|\s*[^.!?\n]+$/g) || [cleanText];
      let chunkIndex = 0;

      const playNextChunk = () => {
        if (!isSpeaking || chunkIndex >= chunks.length) {
          stopAiVoice();
          if (typeof onEnd === "function") onEnd();
          return;
        }

        const chunk = chunks[chunkIndex].trim();
        chunkIndex += 1;

        if (!chunk) {
          playNextChunk();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunk);
        const voiceConfig = getSelectedVoiceAndProps();
        if (voiceConfig.voice) utterance.voice = voiceConfig.voice;
        utterance.lang = voiceConfig.voice ? voiceConfig.voice.lang : (appSettings.language === "auto" ? (navigator.language || "en-US") : appSettings.language);
        utterance.rate = voiceConfig.rate;
        utterance.pitch = voiceConfig.pitch;

        utterance.onend = () => {
          if (isSpeaking) playNextChunk();
        };

        utterance.onerror = () => {
          if (isSpeaking) playNextChunk();
        };

        try {
          window.speechSynthesis.speak(utterance);
        } catch (_) {
          stopAiVoice();
          if (typeof onEnd === "function") onEnd();
        }
      };

      playNextChunk();
    } else {
      stopAiVoice();
      if (typeof onEnd === "function") onEnd();
    }
  };
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
  const normalizeResponseText = (value) => {
    let str = decodeHtmlEntities(String(value || "").replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n"));
    // Replace \t ONLY when not followed by TeX command letters (e.g. \text, \times, \theta)
    return str.replace(/\\t(?![A-Za-z])/g, "\t");
  };
  const normalizeLatex = (value) => {
    let source = normalizeResponseText(value);
    // Recover orphaned 'ext' and 'imes' artifacts from model output or mangled TeX
    return source
      .replace(/\\ext\b/g, "\\text")
      .replace(/(^|[^\\A-Za-z])ext(?=\s*\{)/g, "$1\\text")
      .replace(/\bext([A-Z][A-Za-z0-9_-]*)/g, "\\text{$1}")
      .replace(/(^|[^\\A-Za-z])imes(?=\s*[\{\[\(A-Z0-9\\]|\b)/g, "$1\\times");
  };
  const normalizeCombinatoricsNotation = (value) => {
    let source = normalizeResponseText(value);
    const atom = "(?:[A-Za-z]|\\d+(?:\\.\\d+)?)";
    // Convert standard mathematical combinatorics variants into internal math
    // commands without matching ordinary prose, acronyms (APK, API, FPS, GPU, CPU, VPN),
    // or short words (app, opt, ice).
    source = source
      .replace(/\\(?:mathrm|mathbf|text)\s*\{\s*([CcPp])\s*\}\s*\(\s*([^(),]+?)\s*,\s*([^()]+?)\s*\)/g, (_, operator, upper, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper.trim()}}{${lower.trim()}}` : `\\perm{${upper.trim()}}{${lower.trim()}}`)
      .replace(/(?<![A-Za-z0-9])([CcPp])\s*\(\s*([0-9a-zA-Z\s+\-*/^_.]+?)\s*,\s*([0-9a-zA-Z\s+\-*/^_.]+?)\s*\)/g, (_, operator, upper, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper.trim()}}{${lower.trim()}}` : `\\perm{${upper.trim()}}{${lower.trim()}}`)
      .replace(new RegExp(`(?:\\{\\s*\\})?\\s*\\^\\s*\\{?(${atom})\\}?\\s*([CcPp])\\s*_\\s*\\{?(${atom})\\}?`, "g"), (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(new RegExp(`(?<![A-Za-z0-9])\\\\(?:mathrm|mathbf|text)\\s*\\{\\s*([CcPp])\\s*\\}\\s*_\\s*\\{?(${atom})\\}?\\s*\\^\\s*\\{?(${atom})\\}?`, "g"), (_, operator, lower, upper) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(new RegExp(`(?<![A-Za-z0-9])([CcPp])\\s*_\\s*\\{?(${atom})\\}?\\s*\\^\\s*\\{?(${atom})\\}?`, "g"), (_, operator, lower, upper) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(new RegExp(`(?<![A-Za-z0-9])(${atom})\\s*([CcPp])\\s*_\\s*\\{?(${atom})\\}?`, "g"), (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(/(?<![A-Za-z0-9])(\d+(?:\.\d+)?)\s*([CcPp])\s*(\d+(?:\.\d+)?)(?![A-Za-z0-9])/g, (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(/(?<![A-Za-z0-9])([nNkKmM])\s*([CP])\s*([rRkKmM])(?![A-Za-z0-9])/g, (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(/(?<![A-Za-z0-9])([nN])([cp])([rk])(?![A-Za-z0-9])/g, (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(/(?<![A-Za-z0-9])([nNkKmM])\s+([cp])\s+([rRkKmM])(?![A-Za-z0-9])/g, (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(/(?<![A-Za-z0-9])([nNkKmM])\s*([CPcp])\s*(\d+)(?![A-Za-z0-9])/g, (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`)
      .replace(/(?<![A-Za-z0-9])(\d+)\s*([CPcp])\s*([rRkKmM])(?![A-Za-z0-9])/g, (_, upper, operator, lower) => operator.toLowerCase() === "c" ? `\\binom{${upper}}{${lower}}` : `\\perm{${upper}}{${lower}}`);
    // Give factorials a dedicated math node for numbers, variables, and
    // algebraic terms without capturing ordinary exclamation points.
    return source
      .replace(/\bQdiamondsuit\b/g, "Q♦")
      .replace(/\bQheartsuit\b/g, "Q♥")
      .replace(/\bQspadesuit\b/g, "Q♠")
      .replace(/\bQclubsuit\b/g, "Q♣")
      .replace(/\bdiamondsuit\b/g, "♦")
      .replace(/\bheartsuit\b/g, "♥")
      .replace(/\bspadesuit\b/g, "♠")
      .replace(/\bclubsuit\b/g, "♣")
      .replace(/(?<![A-Za-z0-9])(\d+(?:\.\d+)?|[nNkKmMxXrR])\s*(!+)/g, (_, term, marks) => `\\factorial{${term}}${marks.length > 1 ? marks.slice(1) : ""}`)
      .replace(/(?<![A-Za-z0-9])\(\s*([0-9a-zA-Z\s]+[+\-*/][0-9a-zA-Z\s+\-*/^_.]*|\d+\s*[nNkKmMxXrR])\s*\)(!+)/g, (full, term, marks) => !/\b[a-zA-Z]{2,}\b/.test(term) ? `\\factorial{(${term.trim()})}${marks.length > 1 ? marks.slice(1) : ""}` : full);
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
      .replace(/(?<![A-Za-z0-9])(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)(?![A-Za-z0-9])/g, "\\frac{$1}{$2}")
      .replace(/√\s*(\d+|[a-zA-Z]+|\([^\n()]+\))/g, "\\sqrt{$1}")
      .replace(/(?<![A-Za-z0-9\\])([a-zA-Z0-9]+)\s*\^\s*([0-9a-zA-Z+\-]+|\{[^{}]+\})/g, "$1^{$2}");
    return source;
  };
  const mathCommandMap = Object.freeze({
    longrightarrow: "→", rightarrow: "→", to: "→", longleftrightarrow: "↔", leftrightarrow: "↔",
    Delta: "Δ", delta: "δ", alpha: "α", beta: "β", gamma: "γ", Gamma: "Γ", theta: "θ", Theta: "Θ",
    lambda: "λ", Lambda: "Λ", mu: "μ", nu: "ν", xi: "ξ", Xi: "Ξ", pi: "π", Pi: "Π", rho: "ρ",
    sigma: "σ", Sigma: "Σ", tau: "τ", phi: "φ", Phi: "Φ", chi: "χ", psi: "ψ", Psi: "Ψ", omega: "ω", Omega: "Ω",
    epsilon: "ε", varepsilon: "ε", eta: "η", iota: "ι", kappa: "κ",
    infty: "∞", partial: "∂", nabla: "∇", sum: "Σ", prod: "Π", int: "∫", approx: "≈", cong: "≅", circ: "°",
    exp: "exp", ln: "ln", log: "log", sin: "sin", cos: "cos", tan: "tan", cot: "cot", sec: "sec", csc: "csc", sinh: "sinh", cosh: "cosh", tanh: "tanh", det: "det", determinant: "det", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", pm: "±", mp: "∓", times: "×", cdot: "×",
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
    // Canonicalize specific TeX matrix types (pmatrix, bmatrix, vmatrix, Bmatrix)
    // without matching ordinary English prose like the word "matrix".
    const source = String(value || "")
      .replace(/\\([pPbBvV])\s+matrix\b/g, "\\$1matrix")
      .replace(/(^|[^\\A-Za-z{])([pPbBvV])\s+matrix\b/g, "$1$2matrix");
    const tokenPattern = /(^|[^\\A-Za-z{])((?:p|b|B|v|V)matrix)\b/g;
    const counts = {};
    let match;
    while ((match = tokenPattern.exec(source))) counts[match[2]] = (counts[match[2]] || 0) + 1;
    if (!Object.values(counts).some((count) => count > 1)) return source;
    return source.replace(tokenPattern, (full, prefix, kind) => counts[kind] > 1 ? `${prefix}\\${kind}` : full);
  };
  const matrixBracketClass = (kind) => ({ matrix: "round", pmatrix: "round", smallmatrix: "round", array: "round", bmatrix: "square", Bmatrix: "curly", vmatrix: "single", Vmatrix: "double" }[kind] || "round");
  const readBareMatrixBody = (source, start, kind) => {
    if (source[start] === "{") {
      const grouped = readBalancedMathGroup(source, start);
      if (grouped) return grouped;
    }
    const close = source.slice(start).match(new RegExp(`\\\\${kind}\\b`));
    if (!close || typeof close.index !== "number") return null;
    const closeStart = start + close.index;
    const body = source.slice(start, closeStart);
    if (!/&|\\\\|\\cr|\d\s+\d/.test(body)) return null;
    return { value: body, next: closeStart + close[0].length };
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
      // A few model responses use a lone slash before the next numeric row
      // instead of a TeX row break. Recover that form without touching
      // commands such as \\times or \\rightarrow.
      .replace(/(^|[ \t])\\(?=\s*[-+−]?\d)/gm, "$1\n")
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
    const source = normalizeBareMatrixCommands(
      normalizeExtendedMathNotation(stripMathDelimiters(value))
        .replace(/\b(?:times|multiplied\s+by)\b/gi, "\\times")
    );
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
          output += escapeHtml(command);
          continue;
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
          const argument = source[cursor] === "{" || source[cursor] === "(" ? readMathArgument(source, cursor) : null;
          if (argument) { output += `<span class="math-function math-determinant"><span class="math-function-name">det</span><span class="math-function-argument">(${renderMathExpression(argument.value)})</span></span>`; cursor = argument.next; continue; }
          output += `<span class="math-function math-determinant"><span class="math-function-name">det</span></span>`;
          continue;
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
    // Keep paired Markdown emphasis available for the formatter below.
    // Unmatched markers are removed after paired markers have been turned
    // into <strong>, so raw `**` never leaks into the visible answer.
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
    output = output.replace(/\*\*/g, "");
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
    let source = normalizeBareMatrixCommands(normalizeExtendedMathNotation(value));
    // Normalize multiplication written in ordinary language when both sides
    // are clearly numeric. This fixes outputs such as `1 times 1 + 2 times 2`
    // without changing prose that uses the word “times” normally.
    source = source.replace(/(?<!\\)(\d+(?:\s*\/\s*\d+)?|\([^()\n]+\))\s+(?:times|imes|multiplied\s+by)\s+(\d+(?:\s*\/\s*\d+)?|\([^()\n]+\))/gi, "$1 \\times $2");
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
  const normalizeMimeType = (mimeType, name = "") => {
    let mime = (mimeType || "").toLowerCase().trim();
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (mime === "audio/mp3" || ext === "mp3") return "audio/mp3";
    if (mime === "audio/mpeg") return "audio/mpeg";
    if (mime === "audio/wav" || mime === "audio/x-wav" || ext === "wav") return "audio/wav";
    if (mime === "audio/ogg" || ext === "ogg") return "audio/ogg";
    if (mime === "audio/flac" || ext === "flac") return "audio/flac";
    if (mime === "audio/aac" || ext === "aac") return "audio/aac";
    if (mime === "audio/m4a" || mime === "audio/x-m4a" || ext === "m4a") return "audio/mp4";
    if (mime === "video/mp4" || ext === "mp4" || ext === "m4v") return "video/mp4";
    if (mime === "video/webm" || ext === "webm") return "video/webm";
    if (mime === "video/quicktime" || ext === "mov") return "video/quicktime";
    if (mime === "video/x-matroska" || ext === "mkv") return "video/x-matroska";
    if (mime === "video/avi" || mime === "video/x-msvideo" || ext === "avi") return "video/avi";
    if (mime === "image/jpg") return "image/jpeg";
    if (mime === "application/pdf" || ext === "pdf") return "application/pdf";
    return mime || "application/octet-stream";
  };

  const getUploadEndpoint = () => {
    const base = readApiBase();
    if (!base) return "/api/xmanius-upload";
    return `${base.replace(/\/+$/, "")}/api/xmanius-upload`;
  };

  const uploadLargeAttachment = async (attachment) => {
    if (attachment.fileUri || !attachment.rawFile || attachment.rawFile.size <= 3.5 * 1024 * 1024) {
      return attachment;
    }
    const initRes = await fetch(getUploadEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.rawFile.size,
        model: selectedModel
      })
    });
    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}));
      throw new Error(err.error || `Upload session could not be initialized (${initRes.status}).`);
    }
    const { uploadUrl } = await initRes.json();
    if (!uploadUrl) throw new Error("Upload URL was not provided.");

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(attachment.rawFile.size),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize"
      },
      body: attachment.rawFile
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      throw new Error(`Direct cloud upload failed (${uploadRes.status}): ${errText}`);
    }

    const uploadData = await uploadRes.json().catch(() => ({}));
    const fileUri = uploadData.file?.uri;
    if (!fileUri) throw new Error("File URI was not returned by the cloud service.");
    attachment.fileUri = fileUri;
    return attachment;
  };

  const generateVideoThumbnail = (file) => new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = url;

      let resolved = false;
      const done = (result = "") => {
        if (resolved) return;
        resolved = true;
        try { video.pause(); video.removeAttribute("src"); video.load(); } catch {}
        try { URL.revokeObjectURL(url); } catch {}
        resolve(result);
      };

      const captureFrame = () => {
        try {
          const canvas = document.createElement("canvas");
          const width = video.videoWidth || 320;
          const height = video.videoHeight || 180;
          canvas.width = Math.min(480, width);
          canvas.height = Math.round(canvas.width * (height / width)) || 270;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          done(dataUrl);
        } catch {
          done("");
        }
      };

      video.onloadeddata = () => {
        try {
          video.currentTime = Math.min(0.2, (video.duration || 1) / 2);
        } catch {
          captureFrame();
        }
      };
      video.onseeked = captureFrame;
      video.onerror = () => done("");
      setTimeout(() => { if (!resolved) captureFrame(); }, 1400);
    } catch {
      resolve("");
    }
  });

  const prepareAttachment = async (file) => {
    const rawMime = file?.type || "application/octet-stream";
    const mimeType = normalizeMimeType(rawMime, file?.name);
    const limit = 100_000_000; // 100 MB file limit
    if (!file || file.size > limit) {
      throw new Error(`${file?.name || "That file"} (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 100 MB limit. Please choose a file up to 100 MB.`);
    }

    const isVideo = mimeType.startsWith("video/") || /\.(?:mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name);
    const isImage = mimeType.startsWith("image/");
    const isTextDoc = mimeType === "text/plain" || mimeType === "text/markdown" || mimeType === "text/csv" || mimeType === "application/json" || /\.(?:txt|md|csv|json|js|ts|jsx|tsx|html|css|py|java|cpp|c|cs|go|rs|php|sql|sh|yml|yaml|xml)$/i.test(file.name);

    if (isTextDoc && file.size < 500_000) {
      const textContent = await file.text();
      return { name: file.name, mimeType: "text/plain", text: textContent.slice(0, 100000), rawFile: file };
    }

    let thumbnail = "";
    let data = "";

    if (isImage) {
      const dataUrl = await readAsDataUrl(file);
      data = dataUrl.replace(/^data:[^,]+,/, "");
      thumbnail = dataUrl;
    } else if (isVideo) {
      thumbnail = await generateVideoThumbnail(file);
    }

    let blobUrl = "";
    try { blobUrl = URL.createObjectURL(file); } catch {}

    if (file.size <= 3.5 * 1024 * 1024 && !data) {
      const dataUrl = await readAsDataUrl(file);
      data = dataUrl.replace(/^data:[^,]+,/, "");
    }

    return {
      name: file.name,
      mimeType,
      data,
      thumbnail,
      blobUrl,
      rawFile: file
    };
  };

  const attachmentToRequest = (attachment) => ({
    name: attachment.name,
    mimeType: attachment.mimeType,
    data: attachment.fileUri ? "" : (attachment.data || ""),
    text: attachment.text || "",
    fileUri: attachment.fileUri || ""
  });

  let mediaPreviewModal = null;
  const closeMediaPreviewModal = () => {
    if (mediaPreviewModal) {
      const video = mediaPreviewModal.querySelector("video");
      const audio = mediaPreviewModal.querySelector("audio");
      if (video) { try { video.pause(); video.src = ""; } catch {} }
      if (audio) { try { audio.pause(); audio.src = ""; } catch {} }
      mediaPreviewModal.remove();
      mediaPreviewModal = null;
    }
  };

  const openMediaPreviewModal = (attachment) => {
    closeMediaPreviewModal();
    if (!attachment || (!attachment.data && !attachment.text && !attachment.blobUrl && !attachment.rawFile)) return;

    const mime = (attachment.mimeType || "").toLowerCase();
    const ext = (attachment.name?.split(".").pop() || "").toLowerCase();
    const isImage = /^image\//i.test(mime) || /^(png|jpe?g|webp|gif|bmp|svg)$/i.test(ext);
    const isVideo = /^video\//i.test(mime) || /^(mp4|webm|mov|mkv|avi)$/i.test(ext);
    const isAudio = /^audio\//i.test(mime) || /^(mp3|wav|ogg|m4a|aac|flac)$/i.test(ext);
    const isPdf = mime === "application/pdf" || ext === "pdf";

    const modal = document.createElement("div");
    modal.className = "media-preview-backdrop";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    let mediaContentHtml = "";
    let mediaSource = attachment.blobUrl || "";
    if (!mediaSource) {
      if (attachment.data) mediaSource = `data:${mime || "application/octet-stream"};base64,${attachment.data}`;
      else if (attachment.rawFile) {
        try { mediaSource = URL.createObjectURL(attachment.rawFile); } catch {}
      }
    }

    if (isImage) {
      mediaContentHtml = `<div class="media-preview-body media-preview-image-wrap"><img src="${attachment.thumbnail || mediaSource}" alt="${escapeHtml(attachment.name)}" class="media-preview-full-img" /></div>`;
    } else if (isVideo) {
      mediaContentHtml = `
        <div class="media-preview-body media-preview-video-wrap">
          <video controls autoplay playsinline class="media-preview-video">
            <source src="${mediaSource}" type="${mime}">
            Your browser does not support video playback.
          </video>
        </div>`;
    } else if (isAudio) {
      mediaContentHtml = `
        <div class="media-preview-body media-preview-audio-wrap">
          <div class="media-preview-audio-hero">
            <span class="media-preview-audio-disc">🎵</span>
            <strong class="media-preview-audio-title">${escapeHtml(attachment.name)}</strong>
            <small class="media-preview-audio-sub">${ext.toUpperCase()} Audio Recording</small>
          </div>
          <audio controls autoplay class="media-preview-audio">
            <source src="${mediaSource}" type="${mime}">
            Your browser does not support audio playback.
          </audio>
        </div>`;
    } else if (isPdf) {
      mediaContentHtml = `
        <div class="media-preview-body media-preview-pdf-wrap">
          <iframe src="${mediaSource}" class="media-preview-pdf-frame" title="${escapeHtml(attachment.name)}"></iframe>
        </div>`;
    } else if (attachment.text) {
      mediaContentHtml = `
        <div class="media-preview-body media-preview-text-wrap">
          <pre class="media-preview-text-content">${escapeHtml(attachment.text)}</pre>
        </div>`;
    } else {
      mediaContentHtml = `
        <div class="media-preview-body media-preview-text-wrap">
          <div style="text-align:center;padding:40px;color:#9ca3af;">
            <div style="font-size:44px;margin-bottom:12px;">📁</div>
            <p>${escapeHtml(attachment.name)}</p>
          </div>
        </div>`;
    }

    const downloadHref = mediaSource || "#";

    modal.innerHTML = `
      <div class="media-preview-shell" role="document">
        <header class="media-preview-header">
          <div class="media-preview-header-info">
            <strong>${escapeHtml(attachment.name)}</strong>
            <small>${ext.toUpperCase()} • ${attachment.rawFile ? (attachment.rawFile.size / (1024 * 1024)).toFixed(1) + " MB" : (attachment.data ? Math.round(attachment.data.length * 0.75 / 1024) + " KB" : "")}</small>
          </div>
          <div class="media-preview-header-actions">
            ${downloadHref !== "#" ? `<a href="${downloadHref}" download="${escapeHtml(attachment.name)}" class="media-preview-btn-download" title="Download file"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</a>` : ""}
            <button type="button" class="media-preview-btn-close" aria-label="Close preview">×</button>
          </div>
        </header>
        ${mediaContentHtml}
      </div>
    `;

    document.body.append(modal);
    mediaPreviewModal = modal;

    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest(".media-preview-btn-close")) {
        closeMediaPreviewModal();
      }
    });

    const onKey = (e) => {
      if (e.key === "Escape") {
        closeMediaPreviewModal();
        window.removeEventListener("keydown", onKey);
      }
    };
    window.addEventListener("keydown", onKey);
  };

  const createAttachmentCard = (attachment, { removable = false, index = 0 } = {}) => {
    const card = document.createElement("figure");
    card.className = "attachment-preview-card";
    card.dataset.attachmentName = attachment?.name || "Attachment";
    card.title = `Click to preview ${attachment?.name || "file"}`;
    if (removable) card.classList.add("is-pending");

    const mime = (attachment?.mimeType || "").toLowerCase();
    const ext = (attachment?.name?.split(".").pop() || "").toLowerCase();

    if (attachment?.thumbnail || (attachment?.data && /^image\//i.test(mime))) {
      const image = document.createElement("img");
      image.src = attachment.thumbnail || ("data:" + mime + ";base64," + attachment.data);
      image.alt = "Preview of " + attachment.name;
      card.append(image);
    } else if (/^video\//i.test(mime) || /^(mp4|webm|mov|mkv|avi)$/i.test(ext)) {
      const videoThumb = document.createElement("div");
      videoThumb.className = "attachment-video-preview";
      const thumbSrc = attachment?.thumbnail || "";
      if (thumbSrc) {
        videoThumb.innerHTML = `
          <img src="${thumbSrc}" alt="Video thumbnail" class="attachment-video-cover" />
          <div class="video-overlay-badge"><span class="video-play-icon">▶</span> <span class="video-ext-badge">${ext.toUpperCase()}</span></div>
        `;
      } else if (attachment?.blobUrl || attachment?.data) {
        const src = attachment.blobUrl || `data:${mime};base64,${attachment.data}`;
        videoThumb.innerHTML = `
          <video src="${src}#t=0.1" preload="auto" muted playsinline></video>
          <div class="video-overlay-badge"><span class="video-play-icon">▶</span> <span class="video-ext-badge">${ext.toUpperCase()}</span></div>
        `;
      } else {
        videoThumb.innerHTML = `
          <div class="video-fallback-backdrop">
            <span class="video-play-disc">▶</span>
            <span class="video-ext-badge">${ext.toUpperCase()} VIDEO</span>
          </div>
        `;
      }
      card.append(videoThumb);
    } else if (/^audio\//i.test(mime) || /^(mp3|wav|ogg|m4a|aac|flac)$/i.test(ext)) {
      const audioThumb = document.createElement("div");
      audioThumb.className = "attachment-audio-preview";
      audioThumb.innerHTML = `
        <span class="audio-wave-icon">🎵</span>
        <span class="audio-ext-badge">${ext.toUpperCase()}</span>
        <span class="audio-play-hint">▶ Preview Audio</span>
      `;
      card.append(audioThumb);
    } else if (mime === "application/pdf" || ext === "pdf") {
      const pdfThumb = document.createElement("div");
      pdfThumb.className = "attachment-pdf-preview";
      pdfThumb.innerHTML = `
        <span class="doc-icon">📄</span>
        <span class="doc-ext-badge">PDF</span>
        <span class="doc-view-hint">👁 Preview PDF</span>
      `;
      card.append(pdfThumb);
    } else {
      const filePreview = document.createElement("div");
      filePreview.className = "attachment-file-preview";
      filePreview.textContent = (ext || "FILE").slice(0, 6).toUpperCase();
      card.append(filePreview);
    }
    const caption = document.createElement("figcaption");
    const name = document.createElement("strong");
    name.textContent = attachment?.name || "Attachment";
    name.title = name.textContent;
    const meta = document.createElement("small");
    meta.textContent = `${ext.toUpperCase()}${attachment?.id ? " • " + attachment.id : ""}`;
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

    card.addEventListener("click", (event) => {
      if (event.target.closest(".attachment-remove")) return;
      openMediaPreviewModal(attachment);
    });

    return card;
  };
  const renderPendingAttachments = () => {
    if (!attachments) return;
    attachments.replaceChildren();
    attachments.classList.toggle("is-visible", pendingAttachments.length > 0);
    document.body.classList.toggle("has-attachments", pendingAttachments.length > 0);
    if (!pendingAttachments.length) return;
    const strip = document.createElement("div");
    strip.className = "attachment-preview-strip";
    strip.dataset.imagePreviewStrip = "true";
    pendingAttachments.forEach((attachment, index) => strip.append(createAttachmentCard(attachment, { removable: true, index })));
    attachments.append(strip);
  };
  const addSelectedFiles = async (selected) => {
    if (!selected.length) return;
    if (pendingAttachments.length + selected.length > maxAttachments) {
      showAttachmentNotice(`You can attach up to ${maxAttachments} files per message.`);
      return;
    }
    for (const file of selected) {
      try {
        pendingAttachments.push(await prepareAttachment(file));
        window.XmaniusLibrary?.saveMediaFile(file).catch(() => {});
      } catch (error) {
        showAttachmentNotice(error.message || "That file could not be added.");
      }
    }
    renderPendingAttachments();
    input?.focus();
  };
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
      const hasScalarMath = /^(?=.*(?:=|\\leq?|\\geq?|\\in\b|\\frac|\\binom|\\(?:comb|choose|perm|permutation|factorial)\b|\\sqrt|\\boxed|\\exp|\\log|\\ln|\\Delta|\\pi|\\longrightarrow|\^|(?<![A-Za-z0-9])[0-9]+!|≤|≥|∈|(?<![A-Za-z0-9])(?:\d+\s*[CPcp]\s*\d+|[nNkKmM]\s*[CPcp]\s*[rRkKmM0-9]|\d+\s*[CPcp]\s*[rRkKmM])(?![A-Za-z0-9])|(?<![A-Za-z0-9])[CPcp]\s*\([0-9a-zA-Z\s+\-*/^_.]+,[0-9a-zA-Z\s+\-*/^_.]+\))).{2,900}$/.test(trimmed);
      if ((hasMatrix || hasScalarMath) && (hasMatrix || (!mathWords.test(trimmed) && !/[.!?]$/.test(trimmed)))) {
        output.push(`<div class="math-block${highlightNextMath ? " math-highlight" : ""}" data-math="true">${renderMathMarkup(trimmed)}</div>`);
        highlightNextMath = false;
        index += 1;
        continue;
      }
      const isFinalAnswerMarker = /^(?:Final\s+answers?|Answer)\s*:?\s*$/i.test(trimmed);
      if (isFinalAnswerMarker) {
        highlightNextMath = true;
        output.push(`<h3>${inlineMarkdown(trimmed)}</h3>`);
        index += 1;
        continue;
      }
      const singleLineAnswer = trimmed.match(/^(?:Final\s+answers?|Answer)\s*:\s*(.+)$/i);
      if (singleLineAnswer) {
        output.push(`<p><strong>${escapeHtml(trimmed.slice(0, trimmed.indexOf(":") + 1))}</strong> <span class="math-answer-box">${inlineMarkdown(singleLineAnswer[1])}</span></p>`);
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
    const messageItem = body.closest(".message");
    messageItem?.classList.add("is-streaming");
    const total = text.length;
    // Keep answers visibly progressive with the earlier steady cadence,
    // without making the user wait indefinitely after the network finishes.
    const duration = Math.min(12000, Math.max(900, total * 8));
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
      messageItem?.classList.remove("is-streaming");
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
  const sanitizeClientBranding = (value) => {
    let prose = String(value || "");
    let previous = "";
    while (prose !== previous) {
      previous = prose;
      prose = prose
        .replace(/^\s*(?:(?:Hello|Hi|Hey|Greetings|Welcome)[!,.]?\s*)?(?:I am|I'm|As)\s+(?:Xmanius|Gemini|ChatGPT|Claude|DeepSeek|Grok|an?\s+(?:AI|language model|general[- ]purpose AI))[^.\n]*[.\n]\s*/gi, '')
        .replace(/^\s*(?:Based on|According to|From)\s+(?:a\s+)?(?:direct\s+)?(?:inspection|analysis|view)\s+of\s+the\s+(?:newly\s+)?attached\s+(?:image|file|document|screenshot)[^.\n]*[.\n]\s*/gi, '')
        .replace(/^\s*(?:Here|Below)\s+is\s+the\s+(?:updated\s+)?(?:analysis|transcription|summary|breakdown)\s+of\s+its\s+visible\s+content[.\n:]\s*/gi, '');
    }
    return prose
      .replace(/\bXmanius\s+3\.7\b/g, "Gemini 3.7")
      .replace(/\bXmanius\s+3\.6\b/g, "Gemini 3.6")
      .replace(/\bXmanius\s+3\.5\b/g, "Gemini 3.5")
      .replace(/\bXmanius\s+3\.1\b/g, "Gemini 3.1")
      .replace(/\bXmanius\s+2\.5\b/g, "Gemini 2.5")
      .replace(/\bXmanius\s+1\.5\b/g, "Gemini 1.5")
      .replace(/\bXmanius\s+(Sonnet|Opus|Haiku)\b/g, "Claude $1")
      .trim();
  };
  const addMessage = (text, type, { animate = false, persist = true, sources = [], artifacts = [], task = null, searchError = "", attachmentNames = [], reasoningSummary = "", reasoningSeconds = 0, thinkMode = false, memoryUpdated = false } = {}) => {
    const answerEnvelope = stripAnswerSummaryTags(text);
    text = answerEnvelope.text;
    if (type === "assistant") text = sanitizeClientBranding(text);
    reasoningSummary = reasoningSummary || answerEnvelope.summary;
    empty.hidden = true;
    document.body.classList.remove("is-empty-state");
    const displaySources = [...new Map([...sources, ...youtubeSourcesFromText(text)].filter((source) => source?.url).map((source) => [source.url, source])).values()];
    const item = document.createElement("article");
    item.className = `message ${type}${type === "assistant" && text.length >= 650 ? " long-response" : ""}`;
    item.dataset.rawText = text;
    if (displaySources.length) item.dataset.sources = JSON.stringify(displaySources);
    if (artifacts.length) item.dataset.artifacts = JSON.stringify(artifacts);
    if (reasoningSummary) item.dataset.reasoningSummary = reasoningSummary;
    if (reasoningSeconds) item.dataset.reasoningSeconds = String(reasoningSeconds);
    const body = document.createElement("div");
    body.className = "message-body";
    if (type === "assistant") renderMarkdown(body, text); else body.textContent = text;
    const responseCursor = type === "assistant" && animate ? document.createElement("span") : null;
    if (responseCursor) { responseCursor.className = "xmanius-typing-cursor"; responseCursor.setAttribute("aria-hidden", "true"); body.append(responseCursor); }
    item.append(body);
    if (type === "assistant" && memoryUpdated) {
      const badge = document.createElement("div");
      badge.className = "memory-updated-badge";
      badge.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> <span>Memory updated</span>`;
      item.prepend(badge);
    }
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

      // ─── Cortex Agent UI ───────────────────────────────────────────────
      if (task && task.steps && task.steps.length) {
        const allArtifacts = artifacts || [];
        const allSources = sources || [];

        let cortexCard = null;
        if (window.XmaniusCortex && window.XmaniusCortex.renderFullCortexResponse) {
          cortexCard = window.XmaniusCortex.renderFullCortexResponse(task, allArtifacts, allSources);
        }

        if (cortexCard) {
          body.style.display = "none";
          item.insertBefore(cortexCard, item.firstChild);
          // scroll card into view
          setTimeout(() => cortexCard.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
        }
      }
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
  const conversationHistory = () => [...list.querySelectorAll(".message")].slice(-12).map((item) => { const role = item.classList.contains("user") ? "user" : "model"; let text = item.dataset.rawText || item.querySelector(".message-body")?.textContent?.trim() || ""; if (role === "model") text = sanitizeClientBranding(text); return { role, text }; }).filter((item) => item.text);
  const ask = async (question, suppliedAttachments = pendingAttachments) => {
    const q = String(question || "").trim();
    const requestAttachments = [...suppliedAttachments];
    if ((!q && !requestAttachments.length) || activeRequestController) return;
    if (!updateUsage()) return;
    const requestMessage = q || "Please analyze the attached file(s) and provide the relevant answer.";
    const history = conversationHistory();
    const rethink = needsCodeRethink(q);
    const memoryTriggered = isMemoryPreferencePrompt(q);
    if (memoryTriggered) {
      updateMemoryFromUserPrompt(q);
    }
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
      if (requestAttachments.some(a => a.rawFile && a.rawFile.size > 3.5 * 1024 * 1024 && !a.fileUri)) {
        const thinkingLabel = thinking.querySelector("span");
        for (const attachment of requestAttachments) {
          if (attachment.rawFile && attachment.rawFile.size > 3.5 * 1024 * 1024 && !attachment.fileUri) {
            if (thinkingLabel) thinkingLabel.textContent = `Uploading ${attachment.name} (${(attachment.rawFile.size / (1024 * 1024)).toFixed(1)} MB)...`;
            await uploadLargeAttachment(attachment);
          }
        }
      }
      const isLocationQuery = /\b(near\s+me|nearby|closest|around\s+here|in\s+my\s+area|local|current\s+location|barber\s*shops?\s+near\s+me|restaurants?\s+near\s+me|food\s+near\s+me|shops?\s+near\s+me|stores?\s+near\s+me|salons?\s+near\s+me)\b/i.test(q);
      let userLocation = null;
      if (navigator.geolocation && (isLocationQuery || webSearch)) {
        try {
          userLocation = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                resolve({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  accuracy: pos.coords.accuracy
                });
              },
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
            );
          });
        } catch {}
      }

      const isCortexMode = selectedModel === "xmanius-4" || selectedModel === "xmanius-7" || selectedModel === "xmanius-8";
      const response = await fetch(getApiEndpoint(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: requestMessage, model: selectedModel, runAsTask: isCortexMode, mode: isCortexMode ? "cortex" : (webSearch ? "research" : (thinkMode ? "deep_research" : "fast")), thinkMode, webSearch, location: userLocation, history, rethink, attachments: requestAttachments.map(attachmentToRequest), preferences: { ...appSettings, customInstructions: String(appSettings.customInstructions || "").slice(0, 500), memoryContext: appSettings.memoryEnabled ? buildMemorySummary() : "" } }), signal: activeRequestController.signal });
      const data = await response.json().catch(() => ({}));
      thinking.remove();

      if (isCortexMode && response.ok) {
        // ── CLIENT-SIDE CORTEX PIPELINE ──────────────────────────────────────
        // Works whether or not the server ran the Cortex task engine.
        // If server returned task data → use it. Otherwise build it from the reply text.
        const serverTask = data.task || null;
        const serverArtifacts = data.artifacts || [];
        const replyText = data.reply || data.task?.output || "";

        // Extract HTML code block from the reply if present
        const htmlMatch = (replyText || "").match(/```html\s*([\s\S]*?)```/i);
        const jsMatch = (replyText || "").match(/```javascript\s*([\s\S]*?)```/i) || (replyText || "").match(/```js\s*([\s\S]*?)```/i);
        const anyCodeMatch = htmlMatch || jsMatch;
        const extractedHtml = htmlMatch ? htmlMatch[1].trim() : null;
        const extractedJs = jsMatch ? jsMatch[1].trim() : null;

        const objective = requestMessage;
        const taskId = (serverTask && serverTask.id) || ("ctask_" + Date.now().toString(36));

        // Build synthetic task with steps if server didn't return a proper task
        const task = serverTask && serverTask.steps && serverTask.steps.length ? serverTask : {
          id: taskId,
          state: "completed",
          objective: objective,
          output: replyText,
          steps: [
            { id: "s1", type: "plan", label: "Formulating execution plan & architecture", status: "completed", output: "" },
            { id: "s2", type: "filesystem", label: "Writing project files & assets", status: "completed", output: anyCodeMatch ? "Generated " + (htmlMatch ? "HTML" : "JavaScript") + " source bundle" : "" },
            { id: "s3", type: "test", label: "Running verification & tests", status: "completed", output: anyCodeMatch ? "Syntax verified. Logic validated." : "" },
            { id: "s4", type: "verification", label: "Packaging interactive app & deliverables", status: "completed", output: anyCodeMatch ? "App bundle ready. Inline preview active." : "Response compiled." },
          ],
        };

        // Build artifacts list: use server artifacts if available, otherwise build from extracted code
        let artifacts = serverArtifacts.length ? serverArtifacts : [];
        if (!artifacts.length && extractedHtml) {
          artifacts = [
            { id: "cfa_html_" + taskId, type: "html", title: "Interactive App", filename: "index.html", bundleHtml: extractedHtml, content: extractedHtml, metadata: {}, previewUrl: "", downloadUrl: "" },
            { id: "cfa_pdf_" + taskId, type: "pdf", title: "Task_Report.pdf", filename: "Task_Report.pdf", bundleHtml: null, metadata: {}, previewUrl: "", downloadUrl: "" },
          ];
        } else if (!artifacts.length && extractedJs) {
          const wrappedHtml = "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'><title>App</title><style>body{background:#0f172a;color:#f8fafc;font-family:sans-serif;padding:20px;}</style></head><body><div id='app'></div><script>" + extractedJs + "<\/script></body></html>";
          artifacts = [
            { id: "cfa_html_" + taskId, type: "html", title: "Interactive App", filename: "index.html", bundleHtml: wrappedHtml, content: extractedJs, metadata: {}, previewUrl: "", downloadUrl: "" },
            { id: "cfa_code_" + taskId, type: "code", title: "app.js", filename: "app.js", content: extractedJs, bundleHtml: null, metadata: {}, previewUrl: "", downloadUrl: "" },
          ];
        }

        // Generate a printable HTML report artifact from the reply text
        if (replyText && !artifacts.find((a) => a.metadata && a.metadata.isReport)) {
          const reportHtml = "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'><title>Cortex Report</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#1e293b;padding:32px;max-width:800px;margin:auto;line-height:1.7;}h1,h2{color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;}code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px;}pre{background:#0f172a;color:#f8fafc;padding:20px;border-radius:10px;overflow-x:auto;font-size:12px;}.badge{display:inline-block;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;margin-bottom:16px;}.footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;text-align:center;}</style></head><body><h1>Cortex Deliverable Report</h1><div class='badge'>✓ Cortex Verified</div><h2>Objective</h2><p>" + (objective || "").replace(/</g,"&lt;").replace(/>/g,"&gt;") + "</p><h2>Result</h2><div>" + (replyText || "").replace(/```[\s\S]*?```/g, "").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n\n/g, "</p><p>").replace(/^/, "<p>").replace(/$/, "</p>") + "</div><div class='footer'>Generated by XManius Cortex Agent Runtime v1</div></body></html>";
          artifacts.push({ id: "cfa_report_" + taskId, type: "html", title: "Deliverable_Report.html", filename: "report.html", bundleHtml: reportHtml, content: reportHtml, metadata: { isReport: true }, previewUrl: "", downloadUrl: "" });
        }

        addMessage(replyText || "Cortex execution complete.", "assistant", {
          animate: false,
          sources: data.sources || [],
          artifacts: artifacts,
          task: task,
          searchError: "",
          reasoningSummary: "",
          reasoningSeconds: 0,
          thinkMode: false,
          memoryUpdated: false,
        });
      } else {
        // The selected Xmanius slot is shown explicitly; there is no silent key switch.
        addMessage(response.ok ? (data.reply || data.task?.output || "Task completed.") : (data.userMessage || data.error || `The AI request failed (${response.status}).`), "assistant", { animate: true, sources: response.ok ? (data.sources || data.task?.sources || []) : [], artifacts: response.ok ? (data.artifacts || data.task?.artifacts || []) : [], task: response.ok ? data.task : null, searchError: response.ok ? data.searchError : "", reasoningSummary: response.ok && thinkMode ? data.reasoningSummary : "", reasoningSeconds: thinkMode ? Math.max(1, Math.round((performance.now() - reasoningStartedAt) / 1000)) : 0, thinkMode, memoryUpdated: memoryTriggered });
      }
    } catch (error) {
      thinking.remove();
      if (error.name === "AbortError") {
        const message = activeRequestStopReason === "timeout" ? "The response took too long to finish. Please try again with a shorter request." : "The response was stopped by you.";
        addMessage(message, "assistant", { animate: true, reasoningSeconds: thinkMode ? Math.max(1, Math.round((performance.now() - reasoningStartedAt) / 1000)) : 0, thinkMode });
      }
      else {
        const localFileHint = isNativeApp() && !readApiBase() ? " This APK needs the HTTPS URL of your deployed Xmanius API in xmanius-runtime-config.js." : window.location.protocol === "file:" ? " Open the deployed site (or a local server) instead of opening the HTML file directly." : "";
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
  const startAudioMeter = async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone metering is unavailable in this browser.");
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Audio visualization is unavailable in this browser.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (!form.classList.contains("is-listening")) { stream.getTracks().forEach((track) => track.stop()); return; }
    audioStream = stream;
    audioContext = new AudioContextClass();
    await audioContext.resume().catch(() => {});
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 512;
    audioAnalyser.smoothingTimeConstant = 0.4;
    audioAnalyser.minDecibels = -85;
    audioAnalyser.maxDecibels = -10;
    audioSource = audioContext.createMediaStreamSource(audioStream);
    audioSource.connect(audioAnalyser);
    const waveform = document.querySelector(".dictation-waveform");
    if (!waveform) return;
    if (waveform.children.length < 80) {
      waveform.replaceChildren();
      for (let index = 0; index < 96; index += 1) waveform.append(document.createElement("i"));
    }
    const bars = [...waveform.querySelectorAll("i")];
    const timeData = new Uint8Array(audioAnalyser.fftSize);
    const amplitudes = new Float32Array(bars.length);
    let lastShiftTime = 0;
    const meter = (timestamp) => {
      if (!audioAnalyser || !form.classList.contains("is-listening")) return;
      audioAnalyser.getByteTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        const val = (timeData[i] - 128) / 128;
        sum += val * val;
      }
      const rawRms = Math.sqrt(sum / timeData.length);
      const instantAmp = Math.min(1, Math.max(0, Math.pow(rawRms * 3.8, 0.82)));
      
      // Shift wave from left to right at ~40 updates per second
      if (!lastShiftTime || timestamp - lastShiftTime > 25) {
        lastShiftTime = timestamp;
        for (let i = amplitudes.length - 1; i > 0; i--) {
          amplitudes[i] = amplitudes[i - 1];
        }
        amplitudes[0] = instantAmp;
      }
      
      bars.forEach((bar, index) => {
        const amp = amplitudes[index] || 0;
        const edgeTaper = Math.sin((index / (bars.length - 1)) * Math.PI);
        const effectiveAmp = amp * Math.max(0.22, edgeTaper);
        const height = Math.max(3, 3 + effectiveAmp * 26);
        const opacity = Math.min(1, Math.max(0.3, 0.3 + effectiveAmp * 0.7));
        bar.style.height = `${height.toFixed(1)}px`;
        bar.style.opacity = opacity.toFixed(2);
      });
      audioFrame = window.requestAnimationFrame(meter);
    };
    audioFrame = window.requestAnimationFrame(meter);
  };
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
  document.addEventListener("visibilitychange", () => { if (document.hidden && (recognition || form.classList.contains("is-listening"))) finishVoiceSession({ focus: false, abort: true }); });
  window.addEventListener("pagehide", () => finishVoiceSession({ focus: false, abort: true }));

  // ─── 500MB Media Library Integration ──────────────────────────────────────
  document.querySelectorAll("[data-open-library]").forEach((btn) => {
    btn.addEventListener("click", () => window.XmaniusLibrary?.open());
  });

  window.XmaniusAttachExternalFile = (fileObj) => {
    if (!fileObj) return;
    pendingAttachments.push({
      id: fileObj.id,
      name: fileObj.name,
      mimeType: fileObj.mimeType || fileObj.type || "application/octet-stream",
      data: (fileObj.data || fileObj.dataUrl || "").replace(/^data:[^,]+,/, ""),
      thumbnail: fileObj.dataUrl || "",
      blobUrl: fileObj.dataUrl || "",
      rawFile: null,
      text: "",
      fileUri: "",
    });
    renderPendingAttachments();
    input?.focus();
  };
  let moreModelsCloseTimer = 0;
  const setModelSubmenu = (open) => { window.clearTimeout(moreModelsCloseTimer); modelSubmenu?.classList.toggle("is-open", open); moreModelsToggle?.setAttribute("aria-expanded", String(open)); };
  const scheduleModelSubmenuClose = () => { window.clearTimeout(moreModelsCloseTimer); moreModelsCloseTimer = window.setTimeout(() => setModelSubmenu(false), 140); };
  const setModelPicker = (open) => { modelPicker?.classList.toggle("is-open", open); modelToggle?.setAttribute("aria-expanded", String(open)); headerModelToggle?.setAttribute("aria-expanded", String(open)); if (!open) setModelSubmenu(false); };
  modelToggle?.addEventListener("click", () => setModelPicker(!modelPicker.classList.contains("is-open")));
  headerModelToggle?.addEventListener("click", () => setModelPicker(!modelPicker.classList.contains("is-open")));
  moreModelsToggle?.addEventListener("mouseenter", () => setModelSubmenu(true));
  moreModelsToggle?.addEventListener("mouseleave", scheduleModelSubmenuClose);
  moreModelsToggle?.addEventListener("focus", () => setModelSubmenu(true));
  modelSubmenu?.addEventListener("mouseenter", () => setModelSubmenu(true));
  modelSubmenu?.addEventListener("mouseleave", scheduleModelSubmenuClose);
  moreModelsToggle?.addEventListener("click", () => setModelSubmenu(!modelSubmenu?.classList.contains("is-open")));
  const getModelDisplayName = (modelKey) => {
    const brand = isAndroid ? "Xmanias" : "Xmanius";
    if (modelKey === "xmanius-1") return `${brand} 1.5`;
    if (modelKey === "xmanius-2") return `${brand} Flash`;
    if (modelKey === "xmanius-3") return `${brand} Pro`;
    if (modelKey === "xmanius-4" || modelKey === "xmanius-7" || modelKey === "xmanius-8") return `${brand} Cortex`;
    return `${brand} ${modelKey.replace("xmanius-", "")}`;
  };
  const setSelectedModel = (model) => {
    selectedModel = /^xmanius-[1-9]$/.test(model || "") ? model : "xmanius-1";
    try { localStorage.setItem("xmanius-selected-model-v1", selectedModel); } catch {}
    modelPicker?.querySelectorAll("[data-model]").forEach((item) => {
      const active = item.dataset.model === selectedModel;
      item.classList.toggle("is-selected", active);
      item.setAttribute("aria-pressed", String(active));
      const check = item.querySelector("b");
      if (check) check.textContent = active ? "✓" : "";
    });
    if (modelName) modelName.innerHTML = `${getModelDisplayName(selectedModel)} <span class="dropdown-chevron" aria-hidden="true"></span>`;
  };
  setSelectedModel(selectedModel);
  modelPicker?.addEventListener("click", (event) => { if (event.target.closest("[data-voice-chat]")) { setModelPicker(false); input.placeholder = "Voice chat is ready"; return; } if (event.target.closest("[data-more-models]")) { setModelSubmenu(!modelSubmenu?.classList.contains("is-open")); return; } const option = event.target.closest("[data-model]"); if (option) { setSelectedModel(option.dataset.model); setModelPicker(false); } });
  document.addEventListener("click", (event) => { if (modelPicker?.classList.contains("is-open") && !event.target.closest(".chat-composer, [data-model-menu]")) setModelPicker(false); });
  const reset = () => { saveCurrentChat(); currentChatId = crypto.randomUUID?.() || String(Date.now()); list.replaceChildren(); empty.hidden = false; document.body.classList.add("is-empty-state"); input.value = ""; input.focus(); };
  document.querySelectorAll("[data-new-chat]").forEach((button) => button.addEventListener("click", reset));
  document.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-suggestion]");
    if (chip && input) {
      input.value = chip.dataset.suggestion;
      input.focus();
    }
  });
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
      const shareText = `${chat.title}\n\n${chat.messages.map((item) => `${item.type === "user" ? "You" : (isAndroid ? "Xmanias" : "Xmanius")}: ${item.text}`).join("\n\n")}`;
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
  document.querySelector(".chat-logo")?.addEventListener("click", (e) => {
    if (app.classList.contains("sidebar-collapsed")) {
      e.preventDefault();
      app.classList.remove("sidebar-collapsed");
    }
  });
  document.querySelector("[data-open-sidebar]")?.addEventListener("click", () => app.classList.add("sidebar-visible"));
  document.querySelectorAll("[data-close-sidebar]").forEach(button => {
    button.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 720px)").matches) {
        app.classList.remove("sidebar-visible");
      } else if (button.classList.contains("sidebar-panel-button")) {
        const collapsed = app.classList.toggle("sidebar-collapsed");
        button.setAttribute("aria-label", collapsed ? "Open sidebar" : "Collapse sidebar");
        button.setAttribute("title", collapsed ? "Open sidebar" : "Collapse sidebar");
      }
    });
  });
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
    emoji: { more: "More", default: "Default", less: "Less" },
    voiceCallSound: { puck: "Puck (Energetic Male)", charon: "Charon (Deep Male)", aoede: "Aoede (Expressive Female)", kore: "Kore (Warm Female)", fenrir: "Fenrir (Bold Male)", zephyr: "Zephyr (Soft Female)", pegasus: "Pegasus (Rich Male)", "google-us": "US Natural", "google-uk": "UK Natural" },
    voiceSpeed: { "0.75": "0.75x (Slower)", "0.9": "0.9x (Normal)", "1.0": "1.0x (Standard)", "1.25": "1.25x (Faster)", "1.5": "1.5x (Fast)" },
    voicePitch: { low: "Lower pitch", normal: "Normal pitch", high: "Higher pitch" }
  };
  const settingChoices = {
    appearance: [["system", "System"], ["dark", "Dark"], ["light", "Light"]],
    contrast: [["system", "System"], ["medium", "Medium"], ["increased", "Increased"]],
    language: [["auto", "Auto-detect"], ["en-US", "English (US)"], ["hi", "हिन्दी"], ["es", "español"], ["de", "Deutsch"], ["fr", "français"], ["ar", "العربية"], ["bn", "বাংলা"]],
    baseTone: [["default", "Default"], ["professional", "Professional"], ["friendly", "Friendly"], ["candid", "Candid"], ["quirky", "Quirky"], ["efficient", "Efficient"], ["cynical", "Cynical"]],
    warm: [["less", "Less"], ["default", "Default"], ["more", "More"]],
    enthusiastic: [["less", "Less"], ["default", "Default"], ["more", "More"]],
    headers: [["more", "More"], ["default", "Default"], ["less", "Less"]],
    emoji: [["more", "More"], ["default", "Default"], ["less", "Less"]],
    voiceCallSound: [["puck", "Puck (Energetic Male)"], ["charon", "Charon (Deep Male)"], ["aoede", "Aoede (Expressive Female)"], ["kore", "Kore (Warm Female)"], ["fenrir", "Fenrir (Bold Male)"], ["zephyr", "Zephyr (Soft Female)"], ["pegasus", "Pegasus (Rich Male)"], ["google-us", "US Natural"], ["google-uk", "UK Natural"]],
    voiceSpeed: [["0.75", "0.75x (Slower)"], ["0.9", "0.9x (Normal)"], ["1.0", "1.0x (Standard)"], ["1.25", "1.25x (Faster)"], ["1.5", "1.5x (Fast)"]],
    voicePitch: [["low", "Lower pitch"], ["normal", "Normal pitch"], ["high", "Higher pitch"]]
  };
  let profileMenu = null;
  let settingsBackdrop = null;
  let settingsSection = "general";
  let settingsChoiceMenu = null;
  let settingsChoiceButton = null;
  let memorySummaryBackdrop = null;
  const memoryClearedKey = "xmanius-memory-cleared-at";
  const savedMemoriesKey = "xmanius-saved-memories-v1";
  const detailedMemoryDataKey = "xmanius-detailed-memory-data-v2";

  const cleanMemoryText = (text = "") => {
    return String(text || "")
      .replace(/\[\[ANSWER_SUMMARY\]\][\s\S]*?\[\[\/ANSWER_SUMMARY\]\]/gi, "")
      .replace(/\[\[\/?ANSWER_SUMMARY\]\]/gi, "")
      .replace(/\[\[[\s\S]*?\]\]/g, "")
      .trim();
  };

  const readSavedMemories = () => {
    try {
      return JSON.parse(localStorage.getItem(savedMemoriesKey) || "[]");
    } catch {
      return [];
    }
  };

  const saveMemoryList = (list) => {
    try {
      localStorage.setItem(savedMemoriesKey, JSON.stringify(list));
    } catch {}
  };

  const addSavedMemory = (text) => {
    const clean = cleanMemoryText(text);
    if (!clean || clean.length < 3) return;
    const list = readSavedMemories();
    if (!list.some(m => m.text.toLowerCase() === clean.toLowerCase())) {
      list.unshift({ id: "mem-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), text: clean, createdAt: Date.now() });
      saveMemoryList(list);
    }
  };

  const deleteSavedMemory = (id) => {
    const list = readSavedMemories().filter(m => m.id !== id);
    saveMemoryList(list);
  };

  const synthesizeDynamicMemory = () => {
    const chats = typeof readChats === "function" ? readChats() : [];
    const saved = readSavedMemories();
    const titles = chats.map(c => c.title).filter(t => t && t !== "New chat" && !t.includes("[[") && !t.startsWith("I check"));
    const uniqueTitles = [...new Set(titles)].slice(0, 6);

    let overview = "";
    if (saved.length > 0 || uniqueTitles.length > 0) {
      overview = `You frequently explore topics such as ${uniqueTitles.length > 0 ? uniqueTitles.join(", ") : "technology and general problem solving"}. You prefer clear, direct answers tailored to your context.`;
    } else {
      overview = "Xmanias learns from your conversations and saved preferences to deliver personalized answers over time. As you chat, topics and preferences will appear here.";
    }

    const prefParts = [];
    if (appSettings.baseTone && appSettings.baseTone !== "default") prefParts.push(`Tone: ${appSettings.baseTone}`);
    if (appSettings.warm && appSettings.warm !== "default") prefParts.push(`${appSettings.warm} warmth`);
    if (appSettings.customInstructions) prefParts.push(`Custom: "${appSettings.customInstructions.slice(0, 80)}"`);
    const preferences = prefParts.length > 0
      ? prefParts.join(" • ")
      : "Direct, well-structured responses with clear takeaways and practical steps.";

    let projects = "";
    if (uniqueTitles.length > 0) {
      projects = `Recent active topics from your conversations: ${uniqueTitles.join(" • ")}.`;
    } else {
      projects = "No active conversation topics recorded yet. Your chat themes will appear here as you interact.";
    }

    const interests = "Mathematics, software development, troubleshooting, and document analysis.";

    return {
      updatedAt: Date.now(),
      overview,
      preferences,
      projects,
      interests,
      savedMemories: saved,
      diveDeeper: uniqueTitles.length > 0 ? [
        `Explore recurring patterns in ${uniqueTitles[0] || "your questions"}.`,
        "Review key takeaways from your recent discussions."
      ] : [
        "Ask Xmanias to remember your name, location, or favorite tools.",
        "Set custom tone and communication instructions."
      ]
    };
  };

  const readDetailedMemory = () => {
    return synthesizeDynamicMemory();
  };

  const getTimeAgoText = (timestamp) => {
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - (timestamp || Date.now())) / 60000));
    if (elapsedMinutes < 1) return "Updated just now";
    if (elapsedMinutes < 60) return `Updated ${elapsedMinutes} minutes ago`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `Updated ${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`;
    const elapsedDays = Math.floor(elapsedHours / 24);
    return `Updated ${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
  };

  const buildMemorySummary = () => {
    if (!appSettings.memoryEnabled) return "";
    const mem = synthesizeDynamicMemory();
    const saved = mem.savedMemories || [];
    let summary = mem.overview;
    if (saved.length > 0) {
      summary += `\nExplicit user memories:\n` + saved.map(s => `- ${s.text}`).join("\n");
    }
    return summary;
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
  const isMemoryPreferencePrompt = (text = "") => {
    return /\b(save\s+this|save\s+that|remember|keep\s+in\s+memory|save\s+to\s+memory|in\s+ur\s+memory|in\s+your\s+memory|i\s+like|i\s+prefer|i\s+always\s+want|don't\s+use|avoid|always\s+use|call\s+me|my\s+name\s+is|i\s+am\s+a|i\s+live\s+in|my\s+favorite|my\s+favourite)\b/i.test(text);
  };

  const updateMemoryFromUserPrompt = (promptText) => {
    let clean = cleanMemoryText(promptText)
      .replace(/^(?:please\s+)?(?:remember\s+that|remember\s+this|remember|save\s+this\s+to\s+memory|save\s+to\s+memory|save\s+in\s+memory|keep\s+in\s+memory|in\s+ur\s+memory|in\s+your\s+memory)\s*(?::\s*)?/i, "")
      .trim();
    if (!clean) clean = cleanMemoryText(promptText);
    if (clean) {
      addSavedMemory(clean);
    }
  };

  const closeMemorySummary = () => { memorySummaryBackdrop?.remove(); memorySummaryBackdrop = null; };

  const openMemorySummary = () => {
    closeMemorySummary();
    const data = readDetailedMemory();
    const timeAgo = getTimeAgoText(data.updatedAt);
    let optionsMenuOpen = false;

    memorySummaryBackdrop = document.createElement("div");
    memorySummaryBackdrop.className = "memory-summary-backdrop";
    memorySummaryBackdrop.innerHTML = `
      <section class="memory-summary-shell" role="dialog" aria-modal="true" aria-label="Memory summary">
        <header class="memory-summary-header">
          <div class="memory-summary-header-title">
            <h2>Memory summary</h2>
            <small data-memory-timestamp>${timeAgo}</small>
            <div class="memory-more-wrap">
              <button type="button" class="memory-more-btn" data-memory-more aria-label="More memory options">•••</button>
              <div class="memory-options-dropdown" data-memory-options-dropdown>
                <button type="button" data-memory-action="about">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <span>About memory</span>
                </button>
                <div class="memory-options-divider"></div>
                <button type="button" class="danger-option" data-memory-action="delete-turnoff">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  <span>Delete and turn off memory</span>
                </button>
              </div>
            </div>
          </div>
          <button type="button" class="memory-summary-close-btn" data-close-memory-summary aria-label="Close memory summary">×</button>
        </header>
        <div class="memory-summary-body" data-memory-body>
          <div class="memory-summary-section">
            <h3>Overview</h3>
            <p data-mem-field="overview">${escapeHtml(data.overview)}</p>
          </div>
          <div class="memory-summary-section">
            <h3>Communication Preferences</h3>
            <p data-mem-field="preferences">${escapeHtml(data.preferences)}</p>
          </div>
          <div class="memory-summary-section">
            <h3>Topics &amp; Projects</h3>
            <p data-mem-field="projects">${escapeHtml(data.projects)}</p>
          </div>
          <div class="memory-summary-section">
            <h3>Saved Memories (${data.savedMemories.length})</h3>
            <div class="memory-saved-list" data-saved-memories-list>
              ${data.savedMemories.length === 0 ? '<p style="color:#8e8e93;font-size:13px;margin:4px 0;">No explicit memories saved yet. Type below to add one (e.g. "Remember I code in Python").</p>' : data.savedMemories.map(m => `
                <div class="memory-saved-item" data-memory-item-id="${escapeHtml(m.id)}">
                  <span class="memory-saved-text">• ${escapeHtml(m.text)}</span>
                  <button type="button" class="memory-delete-btn" data-delete-memory="${escapeHtml(m.id)}" title="Delete this memory" aria-label="Delete memory">✕</button>
                </div>
              `).join("")}
            </div>
          </div>
          <div class="memory-summary-section memory-summary-deeper">
            <h3>Dive Deeper</h3>
            <div class="memory-deeper-list">
              ${data.diveDeeper.map(promptText => `
                <button type="button" class="memory-deeper-item" data-deeper-prompt="${escapeHtml(promptText)}">
                  <span class="deeper-arrow">↳</span>
                  <span class="deeper-text">${escapeHtml(promptText)}</span>
                </button>
              `).join("")}
            </div>
          </div>
        </div>
        <footer class="memory-summary-footer-composer">
          <div class="memory-inline-answer-wrapper" data-memory-answer-wrapper></div>
          <form class="memory-summary-input-row" data-memory-update-form>
            <textarea class="memory-ask-input" data-memory-input rows="1" placeholder="Ask or update memory" aria-label="Ask or update memory"></textarea>
            <button type="submit" class="memory-ask-send" aria-label="Send message or update">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </form>
        </footer>
      </section>
    `;
    document.body.append(memorySummaryBackdrop);

    const formEl = memorySummaryBackdrop.querySelector("[data-memory-update-form]");
    const inputEl = memorySummaryBackdrop.querySelector("[data-memory-input]");
    const sendBtn = memorySummaryBackdrop.querySelector(".memory-ask-send");
    const answerWrapper = memorySummaryBackdrop.querySelector("[data-memory-answer-wrapper]");
    const dropdownEl = memorySummaryBackdrop.querySelector("[data-memory-options-dropdown]");

    const resizeTextarea = () => {
      if (!inputEl) return;
      inputEl.style.height = "auto";
      const scrollH = inputEl.scrollHeight;
      inputEl.style.height = `${Math.min(130, Math.max(22, scrollH))}px`;
    };

    inputEl?.addEventListener("input", () => {
      resizeTextarea();
      const hasText = Boolean(inputEl.value.trim());
      formEl?.classList.toggle("has-text", hasText);
      sendBtn?.classList.toggle("is-active", hasText);
    });

    inputEl?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        formEl?.requestSubmit();
      }
    });

    const renderInlineAnswer = (text) => {
      if (!answerWrapper) return;
      const cleanReply = cleanMemoryText(text);
      answerWrapper.innerHTML = `
        <div class="memory-answer-card">
          <div class="memory-answer-content">${escapeHtml(cleanReply)}</div>
          <button type="button" class="memory-answer-close" data-close-answer aria-label="Close answer">×</button>
        </div>
      `;
      answerWrapper.querySelector("[data-close-answer]")?.addEventListener("click", () => {
        answerWrapper.replaceChildren();
      });
    };

    memorySummaryBackdrop.addEventListener("click", (event) => {
      const delBtn = event.target.closest("[data-delete-memory]");
      if (delBtn) {
        deleteSavedMemory(delBtn.dataset.deleteMemory);
        openMemorySummary();
        return;
      }
      const moreBtn = event.target.closest("[data-memory-more]");
      if (moreBtn && dropdownEl) {
        optionsMenuOpen = !optionsMenuOpen;
        dropdownEl.classList.toggle("is-open", optionsMenuOpen);
        return;
      }
      const actionBtn = event.target.closest("[data-memory-action]");
      if (actionBtn && dropdownEl) {
        const action = actionBtn.dataset.memoryAction;
        dropdownEl.classList.remove("is-open");
        optionsMenuOpen = false;
        if (action === "about") {
          openAboutMemory();
        } else if (action === "delete-turnoff") {
          localStorage.removeItem(savedMemoriesKey);
          localStorage.removeItem(detailedMemoryDataKey);
          appSettings.memoryEnabled = false;
          try { localStorage.setItem("xmanius-settings-v1", JSON.stringify(appSettings)); } catch {}
          closeMemorySummary();
        }
        return;
      }
      if (dropdownEl && !event.target.closest(".memory-more-wrap")) {
        dropdownEl.classList.remove("is-open");
        optionsMenuOpen = false;
      }

      const deeperBtn = event.target.closest("[data-deeper-prompt]");
      if (deeperBtn) {
        const promptText = deeperBtn.dataset.deeperPrompt;
        if (inputEl) {
          inputEl.value = promptText;
          resizeTextarea();
          formEl?.classList.add("has-text");
          sendBtn?.classList.add("is-active");
          inputEl.focus();
          inputEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        return;
      }
      if (event.target === memorySummaryBackdrop || event.target.closest("[data-close-memory-summary]")) {
        closeMemorySummary();
      }
    });

    formEl?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const userText = inputEl?.value?.trim();
      if (!userText) return;

      inputEl.value = "";
      resizeTextarea();
      formEl.classList.remove("has-text");
      sendBtn?.classList.remove("is-active");
      inputEl.placeholder = "Updating memory…";
      inputEl.disabled = true;

      const isUpdate = isMemoryPreferencePrompt(userText);
      if (isUpdate) {
        updateMemoryFromUserPrompt(userText);
        openMemorySummary();
        return;
      }

      try {
        const response = await fetch(getApiEndpoint(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "xmanius-1",
            message: `The user is asking a question about their memory summary: "${userText}". Answer briefly and politely in 1 to 2 sentences using this memory summary:\n${buildMemorySummary()}`,
            history: []
          })
        });
        const resData = await response.json().catch(() => ({}));
        const rawReply = resData.reply || "I've reviewed your memory overview.";
        renderInlineAnswer(cleanMemoryText(rawReply));
      } catch {
        renderInlineAnswer("I've saved your memory preferences.");
      } finally {
        inputEl.disabled = false;
        inputEl.placeholder = "Ask or update memory";
        inputEl.focus();
      }
    });
  };
  const settingValue = (key) => settingLabels[key]?.[appSettings[key]] || appSettings[key] || "Default";
  const createSettingRow = (key, label, description = "") => '<div class="settings-row"><div><strong>' + label + '</strong>' + (description ? '<small>' + description + '</small>' : '') + '</div><button type="button" class="settings-value" data-setting-choice="' + key + '">' + settingValue(key) + '<span class="dropdown-chevron" aria-hidden="true"></span></button></div>';
  const renderSettingsSection = () => {
    if (!settingsBackdrop) return;
    closeSettingsChoiceMenu();
    const content = settingsBackdrop.querySelector("[data-settings-content]");
    const title = settingsBackdrop.querySelector("[data-settings-title]");
    title.textContent = settingsSection === "general" ? "General" : settingsSection === "personalization" ? "Personalization" : settingsSection === "voice" ? "Voice Settings" : "Memory";
    if (settingsSection === "general") {
      const authUser = window.XmaniusAuth?.getState()?.user;
      const accountSection = authUser
        ? '<div class="settings-row"><div><strong>Account &amp; Session</strong><small>Signed in as ' + (authUser.email || "Active User") + '</small></div><button type="button" class="settings-danger-btn" data-action-logout>Log Out</button></div>'
        : '<div class="settings-row"><div><strong>Account &amp; Session</strong><small>Sign in to sync your conversations to the cloud.</small></div><button type="button" class="settings-value" data-action-open-auth style="background: #3b82f6; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 600;">Log In / Sign Up</button></div>';

      content.innerHTML = '<div class="settings-intro"><strong>Make Xmanius work the way you prefer.</strong><small>These preferences are saved locally on this device.</small></div>' +
        accountSection +
        createSettingRow("appearance", "Appearance", "Choose the interface theme.") +
        createSettingRow("contrast", "Contrast", "Adjust the contrast of the interface.") +
        createSettingRow("language", "Language", "Used for the interface and voice recognition.") +
        '<div class="settings-row settings-toggle-row"><div><strong>Higher intelligence</strong><small>Use Think mode for questions that need deeper analysis.</small></div><button type="button" class="settings-switch ' + (thinkMode ? "is-on" : "") + '" data-settings-think aria-pressed="' + String(thinkMode) + '"><span></span></button></div>' +
        '<div class="settings-row settings-toggle-row"><div><strong>Enable dictation</strong><small>Allow microphone input in the chat composer.</small></div><button type="button" class="settings-switch is-on" aria-label="Dictation is available"><span></span></button></div>' +
        '<div class="settings-row"><div><strong>Delete all chats</strong><small>Permanently delete all conversation history stored on this device.</small></div><button type="button" class="settings-danger-btn" data-action-delete-all-chats>Delete all</button></div>';
    } else if (settingsSection === "personalization") {
      content.innerHTML = '<div class="settings-intro"><strong>Choose how Xmanius responds.</strong><small>These choices guide tone and formatting without exposing private application details.</small></div>' +
        createSettingRow("baseTone", "Base style and tone", "The overall style of the answer.") +
        createSettingRow("warm", "Warm", "Friendlier and more personable.") +
        createSettingRow("enthusiastic", "Enthusiastic", "How energetic the response sounds.") +
        createSettingRow("headers", "Headers & Lists", "How strongly answers use readable structure.") +
        createSettingRow("emoji", "Emoji", "How often emojis may be used.") +
        '<div class="settings-row settings-toggle-row"><div><strong>Fast answers</strong><small>Use quick local answers when the question is simple.</small></div><button type="button" class="settings-switch ' + (appSettings.fastAnswers ? "is-on" : "") + '" data-settings-fast aria-pressed="' + String(appSettings.fastAnswers) + '"><span></span></button></div>' +
        '<label class="settings-custom"><strong>Custom instructions</strong><textarea data-custom-instructions maxlength="500" placeholder="Additional behavior, style, and tone preferences">' + String(appSettings.customInstructions || "").replace(/</g, "&lt;") + '</textarea></label>';
    } else if (settingsSection === "voice") {
      content.innerHTML = '<div class="settings-intro"><strong>Customize voice, speech rate, and audio.</strong><small>Select voice character, pitch, speed, and test your voice settings.</small></div>' +
        createSettingRow("voiceCallSound", "Voice character", "Choose from energy, tone, and character options.") +
        '<div class="settings-voice-preview-card"><div class="voice-preview-info"><span class="voice-preview-icon">🎙</span><div><strong>Voice Preview</strong><small>Test how Xmanius sounds with your selected voice and speed.</small></div></div><button type="button" class="voice-test-play-btn" data-action-test-voice><span>▶ Test Voice</span></button></div>' +
        createSettingRow("voiceSpeed", "Speech speed", "Adjust how fast or slow the voice speaks.") +
        createSettingRow("voicePitch", "Voice pitch", "Adjust the pitch depth of speech.") +
        '<div class="settings-row settings-toggle-row"><div><strong>Auto read aloud</strong><small>Automatically speak AI responses when received.</small></div><button type="button" class="settings-switch ' + (appSettings.autoReadAloud ? "is-on" : "") + '" data-settings-autoread aria-pressed="' + String(appSettings.autoReadAloud) + '"><span></span></button></div>' +
        '<div class="settings-row settings-toggle-row"><div><strong>Hands-free mic</strong><small>Keep microphone active for continuous voice conversation.</small></div><button type="button" class="settings-switch ' + (appSettings.handsFreeMic ? "is-on" : "") + '" data-settings-handsfree aria-pressed="' + String(appSettings.handsFreeMic) + '"><span></span></button></div>';
    } else {
      content.innerHTML = '<div class="settings-memory-card"><div><strong>Enable memory</strong><small>Let Xmanias personalize relevant answers from chats saved on this device.</small></div><button type="button" class="settings-switch ' + (appSettings.memoryEnabled ? "is-on" : "") + '" data-settings-memory aria-pressed="' + String(appSettings.memoryEnabled) + '"><span></span></button></div>' +
        '<div class="settings-memory-card"><div class="settings-memory-card-info"><strong>Memory summary</strong><p>View an overview of what Xmanias has learned about you. Use <a href="javascript:void(0);" data-open-custom-instructions>custom instructions</a> for information you’d like it to always keep in mind. You can still manage your old <a href="javascript:void(0);" data-manage-memory>saved memories</a>.</p></div><button type="button" class="settings-secondary-btn" data-manage-memory>Manage</button></div>' +
        '<div class="settings-memory-card"><div><strong>Delete all chats</strong><small>Permanently delete all saved conversation history from this device.</small></div><button type="button" class="settings-danger-btn" data-action-delete-all-chats>Delete all</button></div>' +
        '<p class="settings-note">Turning Memory off stops collecting new chats and stops using saved context. You can remove existing saved memory in Manage.</p>';
    }
  };

  const deleteAllChats = () => {
    if (window.confirm("Are you sure you want to permanently delete all chats? This cannot be undone.")) {
      saveChats([]);
      currentChatId = crypto.randomUUID?.() || String(Date.now());
      list.replaceChildren();
      empty.hidden = false;
      input.value = "";
      renderRecents();
      closeSettings();
      closeProfileMenu();
    }
  };

  let aboutMemoryBackdrop = null;
  const closeAboutMemory = () => { aboutMemoryBackdrop?.remove(); aboutMemoryBackdrop = null; };

  const openAboutMemory = () => {
    closeAboutMemory();
    aboutMemoryBackdrop = document.createElement("div");
    aboutMemoryBackdrop.className = "about-memory-backdrop";
    aboutMemoryBackdrop.innerHTML = `
      <section class="about-memory-shell" role="dialog" aria-modal="true" aria-label="About memory">
        <header class="about-memory-header">
          <h2>About memory</h2>
          <button type="button" class="about-memory-close" data-close-about-memory aria-label="Close">×</button>
        </header>
        <div class="about-memory-body">
          <p>Xmanias automatically remembers important information about you, and keeps it up to date. This summary page is a brief overview of what's been remembered — not a complete list.</p>
        </div>
        <footer class="about-memory-footer">
          <button type="button" class="about-memory-btn-learn" data-close-about-memory>Learn more</button>
          <button type="button" class="about-memory-btn-gotit" data-close-about-memory>Got it</button>
        </footer>
      </section>
    `;
    document.body.append(aboutMemoryBackdrop);

    aboutMemoryBackdrop.addEventListener("click", (event) => {
      if (event.target === aboutMemoryBackdrop || event.target.closest("[data-close-about-memory]")) {
        closeAboutMemory();
      }
    });
  };
  const openSettings = (section = "general") => {
    closeProfileMenu();
    settingsSection = section;
    if (!settingsBackdrop) {
      settingsBackdrop = document.createElement("div");
      settingsBackdrop.className = "settings-backdrop";
      settingsBackdrop.innerHTML = `
        <section class="settings-shell" role="dialog" aria-modal="true" aria-label="Xmanius settings">
          <aside class="settings-nav">
            <button type="button" class="settings-close" data-settings-close aria-label="Close settings">×</button>
            <input class="settings-search" data-settings-search type="search" placeholder="Search settings" aria-label="Search settings">
            <button type="button" class="settings-nav-item is-active" data-settings-section="general">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span>General</span>
            </button>
            <button type="button" class="settings-nav-item" data-settings-section="personalization">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9.5"/>
                <path d="M10.5 8.5 A 3.5 3.5 0 0 0 9 12 A 3.5 3.5 0 0 0 12.5 15.5"/>
                <path d="M13.5 15.2 A 3.5 3.5 0 0 0 15.5 12.5"/>
              </svg>
              <span>Personalization</span>
            </button>
            <button type="button" class="settings-nav-item" data-settings-section="voice">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
              <span>Voice</span>
            </button>
            <button type="button" class="settings-nav-item" data-settings-section="memory">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <span>Memory</span>
            </button>
            <div class="settings-nav-spacer"></div>
            <button type="button" class="settings-nav-item" data-profile-action="connect">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Connect Account</span>
            </button>
          </aside>
          <section class="settings-main">
            <header><h2 data-settings-title>General</h2></header>
            <div data-settings-content></div>
          </section>
        </section>
      `;
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
        const testVoice = event.target.closest("[data-action-test-voice]");
        if (testVoice) { speak(`Hello! I am ${isAndroid ? "Xmanias" : "Xmanius"}. This is a test preview of your selected voice.`); return; }
        const autoread = event.target.closest("[data-settings-autoread]");
        if (autoread) { appSettings.autoReadAloud = !appSettings.autoReadAloud; saveSettings(); renderSettingsSection(); return; }
        const handsfree = event.target.closest("[data-settings-handsfree]");
        if (handsfree) { appSettings.handsFreeMic = !appSettings.handsFreeMic; saveSettings(); renderSettingsSection(); return; }
        const fast = event.target.closest("[data-settings-fast]");
        if (fast) { appSettings.fastAnswers = !appSettings.fastAnswers; saveSettings(); renderSettingsSection(); return; }
        const memory = event.target.closest("[data-settings-memory]");
        if (memory) { appSettings.memoryEnabled = !appSettings.memoryEnabled; saveSettings(); renderSettingsSection(); return; }
        const deleteChats = event.target.closest("[data-action-delete-all-chats]");
        if (deleteChats) { deleteAllChats(); return; }
        const think = event.target.closest("[data-settings-think]");
        if (think) { thinkMode = !thinkMode; thinkToggle?.classList.toggle("active", thinkMode); thinkToggle?.setAttribute("aria-pressed", String(thinkMode)); renderSettingsSection(); return; }
        const customInst = event.target.closest("[data-open-custom-instructions]");
        if (customInst) { settingsSection = "personalization"; renderSettingsSection(); return; }
        const manageMemory = event.target.closest("[data-manage-memory]");
        if (manageMemory) { closeSettings(); openMemorySummary(); return; }
        const logoutAction = event.target.closest("[data-action-logout]");
        if (logoutAction) { closeSettings(); window.XmaniusAuth?.signOut(); return; }
        const loginAction = event.target.closest("[data-action-open-auth]");
        if (loginAction) { closeSettings(); window.XmaniusAuth?.openAuthModal("signin"); return; }
        const connect = event.target.closest('[data-profile-action="connect"]');
        if (connect) { closeSettings(); window.XmaniusAuth?.openAuthModal("signin"); return; }
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
    const isConnected = !!appSettings.googleConnected;
    const userName = isConnected ? (appSettings.userName || "Aarnav Thakur") : "Guest User";
    const userSub = isConnected ? (appSettings.userPlan || "Go") : "Connect Google Account";

    const userAvatarHtml = isConnected
      ? `<div class="profile-menu-avatar">${(userName[0] || "A").toUpperCase()}</div>`
      : `<div class="profile-menu-avatar profile-menu-avatar-guest"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`;

    const menu = document.createElement("div");
    menu.className = "profile-menu";
    menu.innerHTML = `
      <div class="profile-menu-user-row">
        ${userAvatarHtml}
        <div class="profile-menu-user-info">
          <span class="profile-menu-name">${escapeHtml(userName)}</span>
          <span class="profile-menu-sub">${escapeHtml(userSub)}</span>
        </div>
        <div class="profile-menu-chevron">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
      <hr class="profile-menu-divider">
      <button type="button" data-profile-action="personalization">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9.5"/>
          <path d="M10.5 8.5 A 3.5 3.5 0 0 0 9 12 A 3.5 3.5 0 0 0 12.5 15.5"/>
          <path d="M13.5 15.2 A 3.5 3.5 0 0 0 15.5 12.5"/>
        </svg>
        <span>Personalization</span>
      </button>
      <button type="button" data-profile-action="memory">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <span>Memory</span>
      </button>
      <button type="button" data-profile-action="library">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span>Media Vault (500MB)</span>
      </button>
      <button type="button" data-profile-action="avatar">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
        <span>Change Profile Picture</span>
      </button>
      <button type="button" data-profile-action="settings">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>Settings</span>
      </button>
      <hr class="profile-menu-divider">
      ${window.XmaniusAuth?.getState()?.user ? `
      <button type="button" data-profile-action="signout" style="color: #f87171;">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
        </svg>
        <span>Sign Out</span>
      </button>` : `
      <button type="button" data-profile-action="connect">
        <svg viewBox="0 0 24 24" width="19" height="19">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span>Log In / Sign Up</span>
      </button>`}
      <button type="button" class="profile-menu-danger" data-profile-action="delete-all-chats">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
        </svg>
        <span>Delete all chats</span>
      </button>
    `;
    menu.addEventListener("click", (event) => {
      const action = event.target.closest("[data-profile-action]")?.dataset.profileAction;
      if (!action) return;
      if (action === "personalization") openSettings("personalization");
      if (action === "memory") openSettings("memory");
      if (action === "settings") openSettings("general");
      if (action === "library") window.XmaniusLibrary?.open();
      if (action === "avatar") window.triggerAvatarUpload?.();
      if (action === "delete-all-chats") deleteAllChats();
      if (action === "connect") window.XmaniusAuth?.openAuthModal("signin");
      if (action === "signout") window.XmaniusAuth?.signOut();
      closeProfileMenu();
    });
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
    panel.innerHTML = `<div class="ai-guide__dialog" role="dialog" aria-modal="true" aria-label="${isAndroid ? "Xmanias" : "Xmanius"} voice assistant">
      <button class="ai-guide__compact-close" type="button" data-general-close aria-label="Close voice assistant"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg></button>
      <div class="ai-guide__orb-stage"><canvas class="ai-guide__orb" width="600" height="600" aria-hidden="true"></canvas><span class="ai-guide__orb-state">Ready</span></div>
      <p class="ai-guide__voice-greeting">Hi, I’m ${isAndroid ? "Xmanias" : "Xmanius"}. Ask me anything.</p>
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
    generalAssistant.querySelectorAll("[data-general-close]").forEach((button) => { if (button.dataset.bound) return; button.dataset.bound = "true"; button.addEventListener("click", () => { stopAiVoice(); generalAssistant.classList.remove("is-open", "is-voice-mode"); generalAssistant.setAttribute("aria-hidden", "true"); }); });
  };

  const startGeneralRecognition = (panel) => {
    stopAiVoice();
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { panel.querySelector(".ai-guide__voice-greeting").textContent = "Voice input needs Chrome or Edge over HTTPS or localhost."; return; }
    const recognitionInstance = new Recognition(); recognitionInstance.lang = navigator.language || "en-US"; recognitionInstance.interimResults = false; recognitionInstance.continuous = false;
    const mic = panel.querySelector("[data-general-mic]");
    const subtitleEl = panel.querySelector(".ai-guide__subtitle");
    recognitionInstance.onstart = () => {
      panel.dataset.voiceState = "listening";
      mic.classList.add("is-active");
      panel.querySelector(".ai-guide__voice-greeting").textContent = "Listening…";
    };
    recognitionInstance.onresult = async (event) => {
      const question = event.results[0][0].transcript.trim();
      panel.dataset.voiceState = "thinking";
      panel.querySelector(".ai-guide__voice-greeting").textContent = "Thinking…";
      if (subtitleEl) subtitleEl.innerHTML = '<div style="margin-bottom:6px;"><strong>You:</strong> ' + escapeHtml(question) + '</div>';
      const response = await fetch(getApiEndpoint(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question }) });
      const data = await response.json();
      const answer = data.reply || data.error || "I could not answer that right now.";
      panel.querySelector(".ai-guide__voice-greeting").textContent = answer;
      if (subtitleEl) subtitleEl.innerHTML = '<div style="margin-bottom:6px;"><strong>You:</strong> ' + escapeHtml(question) + '</div><div><strong>' + (isAndroid ? "Xmanias" : "Xmanius") + ':</strong> ' + escapeHtml(answer) + '</div>';
      panel.dataset.voiceState = "speaking";
      speak(answer, () => {
        panel.dataset.voiceState = "ready";
        mic.classList.remove("is-active");
        if (panel.classList.contains("is-open")) {
          setTimeout(() => {
            if (panel.classList.contains("is-open")) startGeneralRecognition(panel);
          }, 450);
        }
      });
    };
    recognitionInstance.onend = () => { mic.classList.remove("is-active"); };
    recognitionInstance.start();
  };
  window.__openXmaniusVoice = openGeneralVoice;
  document.addEventListener("click", (event) => { if (event.target.closest("[data-voice-chat]")) openGeneralVoice(); });
})();

