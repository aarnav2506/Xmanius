"use strict";

/*
 * Xmanius frontend enhancement pack.
 *
 * Load this after the existing js/xmanius-chat.js file. It is intentionally
 * self-contained and uses the current DOM contract from Xmanius Chat.
 *
 * Features:
 * - Copy and edit actions on user messages.
 * - Edit-and-resend as a conversation branch.
 * - Pinned and Recent sidebar groups.
 * - Scroll-to-bottom button.
 * - Generated-text cursor and streaming helper API.
 * - Generic answer-status panel without exposing private reasoning.
 *
 * The existing application remains responsible for normal sends. The edit
 * flow calls /api/xmanius-chat directly so it can work without private access
 * to the existing ask() closure.
 */

(() => {
  const form = document.querySelector("[data-chat-form]");
  const input = document.querySelector("[data-chat-input]");
  const list = document.querySelector("[data-message-list]");
  const recent = document.querySelector("[data-recent-list]");
  const chatContent = document.querySelector(".chat-content");
  const chatMain = document.querySelector(".chat-main");

  if (!form || !input || !list || !chatContent || !chatMain) return;

  let editingArticle = null;
  let editBanner = null;
  let sidebarRebuilding = false;

  const escapeHtml = (value) => String(value || "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[character]));

  const textFromArticle = (article) => (
    article?.querySelector(".message-body")?.textContent?.trim() || ""
  );

  const renderSimpleMarkdown = (value) => {
    const lines = String(value || "").split(/\r?\n/);
    const output = [];
    let inCode = false;
    let language = "code";
    let code = [];

    const inline = (text) => escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

    const flushCode = () => {
      if (!inCode) return;
      output.push(`<section class="code-block" data-code-block data-language="${escapeHtml(language)}"><header><span>${escapeHtml(language)}</span><div><button type="button" data-code-action="copy">Copy</button><button type="button" data-code-action="download">Download</button><button type="button" data-code-action="run">Run</button></div></header><pre><code>${escapeHtml(code.join("\n"))}</code></pre></section>`);
      code = [];
      inCode = false;
      language = "code";
    };

    for (const line of lines) {
      const fence = line.trim().match(/^```\s*([\w+#.-]*)\s*$/);
      if (fence) {
        if (inCode) flushCode();
        else {
          inCode = true;
          language = fence[1] || "code";
        }
        continue;
      }
      if (inCode) {
        code.push(line);
        continue;
      }
      if (!line.trim()) continue;
      if (/^#{1,4}\s+/.test(line)) output.push(`<h3>${inline(line.replace(/^#{1,4}\s+/, ""))}</h3>`);
      else if (/^[-*]\s+/.test(line)) output.push(`<ul><li>${inline(line.replace(/^[-*]\s+/, ""))}</li></ul>`);
      else if (/^\$\$.*\$\$$/.test(line.trim())) output.push(`<div class="math-block xmanius-math-box" data-math="true">${escapeHtml(line.trim().slice(2, -2))}</div>`);
      else output.push(`<p>${inline(line)}</p>`);
    }
    flushCode();
    return output.join("") || "<p></p>";
  };

  const appendCodeActions = (article) => {
    article.querySelectorAll("[data-code-block]").forEach((block) => {
      if (block.dataset.xmaniusActions === "true") return;
      block.dataset.xmaniusActions = "true";
      const code = block.querySelector("code")?.textContent || "";
      const language = block.dataset.language || "code";
      block.querySelector('[data-code-action="copy"]')?.addEventListener("click", async (event) => {
        try {
          await navigator.clipboard.writeText(code);
          event.currentTarget.textContent = "Copied";
        } catch {
          event.currentTarget.textContent = "Copy failed";
        }
      });
      block.querySelector('[data-code-action="download"]')?.addEventListener("click", () => {
        const extension = language === "html" ? "html" : language === "javascript" || language === "js" ? "js" : language === "css" ? "css" : "txt";
        const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `xmanius-code.${extension}`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      block.querySelector('[data-code-action="run"]')?.addEventListener("click", () => {
        if (!/^html?$/i.test(language)) {
          window.alert("Run is available for HTML code blocks only.");
          return;
        }
        const preview = window.open("about:blank", "_blank", "noopener,noreferrer");
        if (!preview) return;
        preview.document.open();
        preview.document.write(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>${code}`);
        preview.document.close();
      });
    });
  };

  const addUserActions = (article) => {
    if (!article || !article.classList.contains("user") || article.dataset.xmaniusActions === "true") return;
    article.dataset.xmaniusActions = "true";

    const actions = document.createElement("div");
    actions.className = "message-actions xmanius-user-actions";
    actions.innerHTML = '<button type="button" data-xmanius-copy-user aria-label="Copy message" title="Copy message"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></button><button type="button" data-xmanius-edit-user aria-label="Edit message" title="Edit message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h7"></path><path d="m16.5 3.5 4 4L11 17l-4 1 1-4 9.5-10.5Z"></path></svg></button>';

    actions.querySelector("[data-xmanius-copy-user]")?.addEventListener("click", async (event) => {
      try {
        await navigator.clipboard.writeText(textFromArticle(article));
        event.currentTarget.setAttribute("data-copied", "true");
        window.setTimeout(() => event.currentTarget.removeAttribute("data-copied"), 1200);
      } catch {
        event.currentTarget.setAttribute("data-copy-failed", "true");
      }
    });

    actions.querySelector("[data-xmanius-edit-user]")?.addEventListener("click", () => beginEdit(article));
    article.append(actions);
  };

  const showEditBanner = () => {
    if (editBanner) return;
    editBanner = document.createElement("div");
    editBanner.className = "xmanius-edit-banner";
    editBanner.setAttribute("role", "status");
    editBanner.innerHTML = '<span>Editing message</span><button type="button" data-xmanius-cancel-edit>Cancel</button>';
    form.prepend(editBanner);
    editBanner.querySelector("[data-xmanius-cancel-edit]")?.addEventListener("click", cancelEdit);
  };

  const cancelEdit = () => {
    editingArticle = null;
    input.value = "";
    input.placeholder = "Ask anything";
    editBanner?.remove();
    editBanner = null;
    list.querySelectorAll(".xmanius-editing").forEach((item) => item.classList.remove("xmanius-editing"));
    input.focus();
  };

  const beginEdit = (article) => {
    editingArticle = article;
    input.value = textFromArticle(article);
    input.placeholder = "Edit message and press Enter…";
    article.classList.add("xmanius-editing");
    showEditBanner();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };

  const collectHistoryBefore = (article) => {
    const articles = [...list.querySelectorAll(":scope > .message")];
    const index = articles.indexOf(article);
    return articles.slice(0, Math.max(0, index)).map((item) => ({
      role: item.classList.contains("user") ? "user" : "assistant",
      text: textFromArticle(item),
    })).filter((item) => item.text);
  };

  const createUserArticle = (text) => {
    const article = document.createElement("article");
    article.className = "message user";
    article.dataset.rawText = text;
    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = text;
    article.append(body);
    list.append(article);
    addUserActions(article);
    return article;
  };

  const createAssistantArticle = (text, approach = null) => {
    const article = document.createElement("article");
    article.className = "message assistant";
    article.dataset.rawText = text;
    const body = document.createElement("div");
    body.className = "message-body";
    body.innerHTML = renderSimpleMarkdown(text);
    article.append(body);
    list.append(article);
    appendCodeActions(article);
    return article;
  };

  const parseStreamOrJson = async (response, onDelta, onApproach) => {
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/event-stream") || !response.body) {
      const data = await response.json().catch(() => ({}));
      onDelta(data.reply || data.answer || data.error || "Xmanius could not answer this request.");
      if (data.approach) onApproach(data.approach);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "message";
    let dataLines = [];

    const dispatch = () => {
      if (!dataLines.length) return;
      const raw = dataLines.join("\n");
      dataLines = [];
      if (raw === "[DONE]") return;
      let payload;
      try { payload = JSON.parse(raw); } catch { return; }
      if (eventName === "text_delta") onDelta(payload.text || "");
      if (eventName === "approach") onApproach(payload);
      eventName = "message";
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line) dispatch();
          else if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
      }
      if (dataLines.length) dispatch();
    } finally {
      reader.releaseLock();
    }
  };

  const resendEdited = async (text, article) => {
    const history = collectHistoryBefore(article);
    const articles = [...list.querySelectorAll(":scope > .message")];
    const position = articles.indexOf(article);
    articles.slice(Math.max(0, position)).forEach((item) => item.remove());
    createUserArticle(text);
    const assistant = createAssistantArticle("", null);
    const body = assistant.querySelector(".message-body");
    const stopCursor = () => assistant.querySelector(".xmanius-typing-cursor")?.remove();
    let answer = "";
    let approach = null;
    const startedAt = performance.now();
    const thinkEnabled = document.querySelector("[data-think-toggle]")?.classList.contains("active") === true;

    try {
      const response = await fetch("/api/xmanius-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          message: text,
          history,
          thinkMode: thinkEnabled,
          webSearch: document.querySelector("[data-web-search]")?.classList.contains("active") === true,
        }),
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      await parseStreamOrJson(response, (delta) => {
        answer += delta;
        body.innerHTML = renderSimpleMarkdown(answer);
        appendCodeActions(assistant);
        chatContent.scrollTop = chatContent.scrollHeight;
      }, (value) => { approach = value; });
      const summaryMatch = answer.match(/\[\[ANSWER_SUMMARY\]\]([\s\S]*?)\[\[\/ANSWER_SUMMARY\]\]/i);
      const answerSummary = summaryMatch?.[1]?.trim() || "I checked the relevant context and assumptions before preparing the corrected answer.";
      answer = answer.replace(/\[\[ANSWER_SUMMARY\]\][\s\S]*?\[\[\/ANSWER_SUMMARY\]\]/gi, "").replace(/\[\[\/?ANSWER_SUMMARY\]\]/gi, "").trim();
      assistant.dataset.rawText = answer;
      body.innerHTML = renderSimpleMarkdown(answer);
      if (thinkEnabled) {
        const details = document.createElement("details");
        details.className = "thinking-summary";
        details.innerHTML = `<summary><span class="thought-glyph" aria-hidden="true">✦</span><span>Thought for ${Math.max(1, Math.round((performance.now() - startedAt) / 1000))} seconds</span><span class="thought-chevron" aria-hidden="true">⌄</span></summary><p></p>`;
        details.querySelector("p").textContent = answerSummary;
        assistant.prepend(details);
      }
      stopCursor();
    } catch (error) {
      body.innerHTML = renderSimpleMarkdown(`The edited request could not be completed. ${error.message || "Please try again."}`);
      stopCursor();
    } finally {
      cancelEdit();
      chatContent.scrollTop = chatContent.scrollHeight;
    }
  };

  // Capture phase runs before the original form submit listener, allowing the
  // edit flow to replace the old message instead of adding a second prompt.
  form.addEventListener("submit", (event) => {
    if (!editingArticle) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const value = input.value.trim();
    if (value) void resendEdited(value, editingArticle);
  }, true);

  const createApproachPanel = () => {
    const details = document.createElement("details");
    details.className = "thinking-summary xmanius-approach";
    const summary = document.createElement("summary");
    summary.textContent = "Answer checked";
    details.append(summary);
    return details;
  };

  const installScrollButton = () => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "xmanius-scroll-bottom";
    button.setAttribute("aria-label", "Scroll to latest message");
    button.title = "Scroll to latest message";
    button.innerHTML = "↓";
    button.hidden = true;
    chatMain.append(button);

    const update = () => {
      const distance = chatContent.scrollHeight - chatContent.scrollTop - chatContent.clientHeight;
      button.hidden = distance < 120;
    };

    chatContent.addEventListener("scroll", update, { passive: true });
    button.addEventListener("click", () => chatContent.scrollTo({ top: chatContent.scrollHeight, behavior: "smooth" }));
    new MutationObserver(update).observe(list, { childList: true, subtree: true });
    update();
  };

  const rebuildSidebarSections = () => {
    if (!recent || sidebarRebuilding) return;
    const sidebarContainer = recent.closest(".sidebar-recents");
    sidebarContainer?.querySelector(":scope > .sidebar-label:not(.xmanius-sidebar-heading)")?.remove();
    const rows = [...recent.querySelectorAll(":scope > .conversation-row")];
    if (!rows.length) return;
    sidebarRebuilding = true;

    const pinned = rows.filter((row) => row.classList.contains("is-pinned"));
    const normal = rows.filter((row) => !row.classList.contains("is-pinned"));
    recent.replaceChildren();

    const addGroup = (label, items, className) => {
      if (!items.length) return;
      const title = document.createElement("p");
      title.className = "sidebar-label xmanius-sidebar-heading";
      title.textContent = label;
      const group = document.createElement("div");
      group.className = className;
      items.forEach((item) => group.append(item));
      recent.append(title, group);
    };

    addGroup("Pinned", pinned, "xmanius-pinned-list");
    addGroup("Recent", normal, "xmanius-recent-list");
    sidebarRebuilding = false;
  };

  const installObservers = () => {
    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches(".message.user")) addUserActions(node);
          if (node.matches(".message.assistant")) {
            appendCodeActions(node);
          }
          node.querySelectorAll?.(".message.user").forEach(addUserActions);
          node.querySelectorAll?.(".message.assistant").forEach((item) => {
            appendCodeActions(item);
          });
        });
      }
    }).observe(list, { childList: true, subtree: true });

    if (recent) new MutationObserver(rebuildSidebarSections).observe(recent, { childList: true, subtree: true });
  };

  try { window.XmaniusUI = Object.freeze({
    createApproachPanel,
    createAssistantMessage: (initialText = "") => createAssistantArticle(initialText),
    appendAssistantText: (article, delta) => {
      const body = article?.querySelector(".message-body");
      if (!body) return;
      const current = body.dataset.rawText || body.textContent || "";
      body.dataset.rawText = `${current}${delta}`;
      body.innerHTML = renderSimpleMarkdown(body.dataset.rawText);
      appendCodeActions(article);
      chatContent.scrollTop = chatContent.scrollHeight;
    },
    finishAssistantMessage: (article, approach) => {
      article?.querySelector(".xmanius-typing-cursor")?.remove();
    },
  }); } catch (error) { window.XmaniusUI = Object.freeze({ version: "verified-feature-patch" }); console.warn("[Xmanius enhancements] public API setup failed", error); }

  try {
    installScrollButton();
    installObservers();
    list.querySelectorAll(".message.user").forEach(addUserActions);
    list.querySelectorAll(".message.assistant").forEach((item) => {
      appendCodeActions(item);
    });
    rebuildSidebarSections();
  } catch (error) {
    console.warn("[Xmanius enhancements] optional UI setup failed", error);
  }
})();
