// Handle the dynamic personalized greeting and centered empty state logic
(function() {
  const getGreetingHeader = () => document.querySelector(".greeting-text");
  const emptyStateSection = document.querySelector("[data-empty-state]");

  // Distinct, elegant greeting templates matching Gemini
  const GREETING_TEMPLATES = [
    (name) => name ? `What's next, ${name}?` : "What's next?",
    (name) => name ? `Ready when you are, ${name}` : "Ready when you are",
    (name) => name ? `Where should we start, ${name}?` : "Where should we start?",
    (name) => name ? `How can I help you today, ${name}?` : "How can I help you today?",
    (name) => name ? `Good to see you, ${name}` : "Good to see you",
    (name) => name ? `What's on your mind, ${name}?` : "What's on your mind?",
    (name) => name ? `Let's make something great, ${name}` : "Let's make something great"
  ];

  let lastGreetingIndex = -1;

  const getUserFirstName = () => {
    try {
      const authState = window.XmaniusAuth?.getState?.();
      if (authState && (authState.isGuest || !authState.user)) {
        return "";
      }
      const profile = window.XmaniusAuth?.getUserProfile?.();
      if (profile && !profile.isGuest && profile.displayName && profile.displayName !== "Guest User" && profile.displayName !== "Guest") {
        return profile.displayName.trim().split(/\s+/)[0];
      }
      const customName = localStorage.getItem("xmanius-custom-name") || localStorage.getItem("xmanius-user-name");
      if (customName && customName.trim() && customName.trim() !== "Guest User" && customName.trim() !== "Guest") {
        return customName.trim().split(/\s+/)[0];
      }
      const accountNameEl = document.querySelector("[data-account-name], .sidebar-account b");
      if (accountNameEl && accountNameEl.textContent) {
        const text = accountNameEl.textContent.trim();
        if (text && text !== "Guest User" && text !== "Guest" && text !== "Account") {
          return text.split(/\s+/)[0];
        }
      }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
          const raw = JSON.parse(localStorage.getItem(key) || "{}");
          if (!raw?.user) continue;
          const userMeta = raw?.user?.user_metadata;
          const fullName = userMeta?.full_name || userMeta?.name;
          if (fullName && fullName !== "Guest User" && fullName !== "Guest") {
            return String(fullName).trim().split(/\s+/)[0];
          }
        }
      }
    } catch (e) {}
    return "";
  };

  const getNextGreeting = () => {
    let nextIndex;
    if (GREETING_TEMPLATES.length <= 1) {
      nextIndex = 0;
    } else {
      do {
        nextIndex = Math.floor(Math.random() * GREETING_TEMPLATES.length);
      } while (nextIndex === lastGreetingIndex);
    }
    lastGreetingIndex = nextIndex;
    const name = getUserFirstName();
    return GREETING_TEMPLATES[nextIndex](name);
  };

  const updateGreeting = () => {
    const header = getGreetingHeader();
    if (header) {
      header.textContent = getNextGreeting();
    }
  };

  window.XmaniusRandomizeGreeting = updateGreeting;

  // Global handler to trigger a clean new chat when "+ New chat" is clicked
  const handleNewChatClick = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (typeof window.XmaniusStartNewChat === "function") {
      window.XmaniusStartNewChat(e);
      return;
    }
    const list = document.querySelector("[data-message-list]");
    const empty = document.querySelector("[data-empty-state]");
    const input = document.querySelector("[data-chat-input]");
    if (list) list.replaceChildren();
    if (empty) {
      empty.hidden = false;
      empty.style.display = "";
    }
    document.body.classList.add("is-empty-state");
    if (input) {
      input.value = "";
      input.focus();
    }
    // Pick a new random greeting
    updateGreeting();

    // Close temporary chat if in temporary chat mode
    if (document.body.classList.contains("is-temporary-chat-mode")) {
      document.body.classList.remove("is-temporary-chat-mode");
      const tempExitBtn = document.getElementById("temp-chat-exit-btn");
      if (tempExitBtn) tempExitBtn.style.display = "none";
      const normalHero = document.getElementById("normal-chat-hero");
      if (normalHero) normalHero.style.display = "";
      const tempHero = document.getElementById("temporary-chat-hero");
      if (tempHero) tempHero.style.display = "none";
    }

    // Close sidebar on mobile if open
    const app = document.querySelector(".chat-app");
    if (app && app.classList.contains("sidebar-visible")) {
      app.classList.remove("sidebar-visible");
    }
  };

  // Wire all new-chat buttons
  const wireNewChatButtons = () => {
    document.querySelectorAll("[data-new-chat], .new-chat, .is-new-chat").forEach((btn) => {
      if (!btn.dataset.wiredNewChat) {
        btn.dataset.wiredNewChat = "true";
        btn.addEventListener("click", handleNewChatClick);
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateGreeting();
      wireNewChatButtons();
    });
  } else {
    updateGreeting();
    wireNewChatButtons();
  }

  // Use a MutationObserver to toggle the body class based on the empty state visibility
  if (emptyStateSection) {
    const updateBodyClass = () => {
      if (emptyStateSection.hidden || emptyStateSection.style.display === "none") {
        document.body.classList.remove("is-empty-state");
      } else {
        document.body.classList.add("is-empty-state");
      }
    };

    updateBodyClass();

    const observer = new MutationObserver(updateBodyClass);
    observer.observe(emptyStateSection, { attributes: true, attributeFilter: ["hidden", "style"] });
  }

  // Periodic check to ensure new-chat buttons are wired up
  window.setTimeout(wireNewChatButtons, 300);
  window.setTimeout(wireNewChatButtons, 1000);
})();
