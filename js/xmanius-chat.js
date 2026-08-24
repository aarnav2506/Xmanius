(() => {
  "use strict";
  const app = document.querySelector(".chat-app");
  const form = document.querySelector("[data-chat-form]");
  const input = document.querySelector("[data-chat-input]");
  const list = document.querySelector("[data-message-list]");
  const empty = document.querySelector("[data-empty-state]");
  const recent = document.querySelector("[data-recent-list]");
  const modelToggle = document.querySelector("[data-model-toggle]");
  const modelPicker = document.querySelector("[data-model-picker]");
  let recognition = null;
  let listening = false;
  let generalAssistant = null;
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
  const addMessage = (text, type) => {
    empty.hidden = true;
    const item = document.createElement("article");
    item.className = `message ${type}`;
    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = text;
    item.append(body);
    if (type === "assistant") {
      const actions = document.createElement("div");
      actions.className = "message-actions";
      actions.innerHTML = '<button type="button" data-copy-message aria-label="Copy response" title="Copy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></button><button type="button" data-read-message aria-label="Read response aloud" title="Read aloud"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"></path></svg></button>';
      actions.querySelector("[data-copy-message]").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(text); actions.querySelector("[data-copy-message]").textContent = "✓"; } catch { /* Clipboard may be unavailable on file:// pages. */ }
      });
      actions.querySelector("[data-read-message]").addEventListener("click", () => speak(text));
      item.append(actions);
    }
    list.append(item);
    document.querySelector(".chat-content").scrollTop = document.querySelector(".chat-content").scrollHeight;
  };
  const ask = async (question) => { const q = question.trim(); if (!q) return; addMessage(q, "user"); input.value = ""; const local = localAnswer(q); if (local) { addMessage(local, "assistant"); return; } const thinking = document.createElement("article"); thinking.className = "message assistant thinking"; thinking.textContent = "Thinking…"; list.append(thinking); try { const response = await fetch("api/xmanius-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q }) }); const data = await response.json(); thinking.remove(); addMessage(response.ok ? data.reply : "The online AI service is unavailable right now. Please try again shortly.", "assistant"); } catch { thinking.remove(); addMessage("The online AI service is unavailable right now. Please try again shortly.", "assistant"); } };
  const startVoice = () => { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) { input.placeholder = "Voice needs Chrome or Edge over HTTPS or localhost"; return; } if (listening) { recognition.abort(); return; } recognition = new Recognition(); recognition.lang = navigator.language || "en-US"; recognition.interimResults = true; recognition.continuous = false; let finalText = ""; recognition.onstart = () => { listening = true; input.placeholder = "Listening…"; document.querySelector("[data-chat-mic]").classList.add("active"); }; recognition.onresult = (event) => { let interim = ""; for (let i = event.resultIndex; i < event.results.length; i++) event.results[i].isFinal ? finalText += event.results[i][0].transcript : interim += event.results[i][0].transcript; input.value = `${finalText}${interim}`.trim(); }; recognition.onerror = () => { input.placeholder = "Ask anything"; }; recognition.onend = () => { listening = false; document.querySelector("[data-chat-mic]").classList.remove("active"); input.placeholder = "Ask anything"; if (finalText.trim()) ask(finalText); }; recognition.start(); };
  form.addEventListener("submit", (event) => { event.preventDefault(); ask(input.value); });
  document.querySelector("[data-chat-mic]").addEventListener("click", startVoice);
  const setModelPicker = (open) => { modelPicker?.classList.toggle("is-open", open); modelToggle?.setAttribute("aria-expanded", String(open)); };
  modelToggle?.addEventListener("click", () => setModelPicker(!modelPicker.classList.contains("is-open")));
  modelPicker?.addEventListener("click", (event) => { if (event.target.closest("[data-voice-chat]")) { setModelPicker(false); input.placeholder = "Voice chat is ready"; return; } if (event.target.closest("[data-model]")) setModelPicker(false); });
  document.addEventListener("click", (event) => { if (modelPicker?.classList.contains("is-open") && !event.target.closest(".chat-composer")) setModelPicker(false); });
  const reset = () => { list.replaceChildren(); empty.hidden = false; input.value = ""; input.focus(); };
  document.querySelectorAll("[data-new-chat]").forEach((button) => button.addEventListener("click", reset));
  recent?.addEventListener("click", (event) => { if (event.target.matches("button")) { reset(); input.value = event.target.textContent.trim(); input.focus(); } });
  document.querySelector("[data-open-sidebar]")?.addEventListener("click", () => app.classList.add("sidebar-visible"));
  document.querySelector("[data-close-sidebar]")?.addEventListener("click", () => app.classList.remove("sidebar-visible"));

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
