"use strict";

/**
 * XManius Supabase Client, Professional Auth Modal & Cloud Sync Controller
 * Features:
 * - Google One-Click OAuth Login / Sign-Up
 * - GitHub OAuth Login / Sign-Up
 * - Email & Password Sign-In / Sign-Up
 * - Magic Link Passwordless Login
 * - Dedicated Profile Card & Log Out Dialogs
 * - Cloud Chat Persistence to PostgreSQL (table user_chats)
 */

(() => {
  const SUPABASE_URL = "https://yivuirzyfxngxpalwidk.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Cw9IwGgDlBwUDlDQMd-dvg_D0BmlbA7";

  let supabaseClient = null;

  function getClient() {
    if (!supabaseClient && window.supabase && window.supabase.createClient) {
      try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          }
        });
      } catch (err) {
        console.warn("Supabase init error:", err);
      }
    }
    return supabaseClient;
  }

  const state = {
    user: null,
    session: null,
    isLoaded: false,
    authMode: "signin", // "signin" | "signup"
  };

  // ─── Modal DOM Creation ───────────────────────────────────────────────────
  function createAuthModal() {
    if (document.getElementById("xmanius-auth-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "xmanius-auth-modal";
    overlay.className = "xmanius-auth-overlay";
    overlay.innerHTML = `
      <div class="xmanius-auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <button type="button" class="xmanius-auth-close" id="auth-modal-close" aria-label="Close">✕</button>
        
        <div class="xmanius-auth-header">
          <h2 class="xmanius-auth-title" id="auth-modal-title">Log in or sign up</h2>
          <p class="xmanius-auth-subtitle" id="auth-modal-subtitle">
            You'll get smarter responses and can save chats, upload files, and sync across devices.
          </p>
        </div>

        <div class="xmanius-auth-error" id="auth-error-msg"></div>
        <div class="xmanius-auth-success" id="auth-success-msg"></div>

        <div class="xmanius-auth-social">
          <button type="button" class="xmanius-social-btn" id="auth-google-btn">
            <svg viewBox="0 0 24 24" width="19" height="19">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          <button type="button" class="xmanius-social-btn" id="auth-github-btn">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            <span>Continue with GitHub</span>
          </button>
        </div>

        <div class="xmanius-auth-divider">
          <span>OR</span>
        </div>

        <form class="xmanius-auth-form" id="auth-email-form">
          <div class="xmanius-input-group">
            <input type="email" class="xmanius-input" id="auth-email-input" placeholder="Email address" required autocomplete="email">
          </div>
          
          <div class="xmanius-input-group" id="auth-password-group">
            <input type="password" class="xmanius-input" id="auth-password-input" placeholder="Password (min 6 characters)" autocomplete="current-password">
          </div>

          <button type="submit" class="xmanius-submit-btn" id="auth-submit-btn">
            Continue
          </button>
        </form>

        <div class="xmanius-auth-footer">
          <span id="auth-mode-label">Don't have an account?</span>
          <button type="button" class="xmanius-switch-mode-btn" id="auth-switch-mode">Sign up</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event Listeners
    overlay.querySelector("#auth-modal-close").addEventListener("click", closeAuthModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeAuthModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("is-active")) {
        closeAuthModal();
      }
    });

    // Social logins
    overlay.querySelector("#auth-google-btn").addEventListener("click", signInWithGoogle);
    overlay.querySelector("#auth-github-btn").addEventListener("click", signInWithGitHub);

    // Mode Switch (Sign in <-> Sign up)
    overlay.querySelector("#auth-switch-mode").addEventListener("click", toggleAuthMode);

    // Form submit
    overlay.querySelector("#auth-email-form").addEventListener("submit", handleEmailSubmit);
  }

  function openAuthModal(mode = "signin") {
    createAuthModal();
    state.authMode = mode;
    updateModalUI();
    clearMessages();
    const overlay = document.getElementById("xmanius-auth-modal");
    if (overlay) overlay.classList.add("is-active");
    setTimeout(() => {
      document.getElementById("auth-email-input")?.focus();
    }, 100);
  }

  function closeAuthModal() {
    const overlay = document.getElementById("xmanius-auth-modal");
    if (overlay) overlay.classList.remove("is-active");
  }

  function toggleAuthMode() {
    state.authMode = state.authMode === "signin" ? "signup" : "signin";
    updateModalUI();
    clearMessages();
  }

  function updateModalUI() {
    const title = document.getElementById("auth-modal-title");
    const modeLabel = document.getElementById("auth-mode-label");
    const switchBtn = document.getElementById("auth-switch-mode");
    const submitBtn = document.getElementById("auth-submit-btn");

    if (state.authMode === "signup") {
      if (title) title.textContent = "Create your account";
      if (modeLabel) modeLabel.textContent = "Already have an account?";
      if (switchBtn) switchBtn.textContent = "Log in";
      if (submitBtn) submitBtn.textContent = "Sign Up";
    } else {
      if (title) title.textContent = "Log in or sign up";
      if (modeLabel) modeLabel.textContent = "Don't have an account?";
      if (switchBtn) switchBtn.textContent = "Sign up";
      if (submitBtn) submitBtn.textContent = "Continue";
    }
  }

  function showMessage(type, msg) {
    const err = document.getElementById("auth-error-msg");
    const succ = document.getElementById("auth-success-msg");
    if (type === "error") {
      if (err) { err.textContent = msg; err.style.display = "block"; }
      if (succ) succ.style.display = "none";
    } else {
      if (succ) { succ.textContent = msg; succ.style.display = "block"; }
      if (err) err.style.display = "none";
    }
  }

  function clearMessages() {
    const err = document.getElementById("auth-error-msg");
    const succ = document.getElementById("auth-success-msg");
    if (err) err.style.display = "none";
    if (succ) succ.style.display = "none";
  }

  // ─── Authentication Actions ───────────────────────────────────────────────
  async function signInWithGoogle() {
    const client = getClient();
    if (!client) return;
    clearMessages();

    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        }
      }
    });

    if (error) showMessage("error", error.message);
  }

  async function signInWithGitHub() {
    const client = getClient();
    if (!client) return;
    clearMessages();

    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await client.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: redirectUrl,
      }
    });

    if (error) showMessage("error", error.message);
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    const client = getClient();
    if (!client) return;

    const email = document.getElementById("auth-email-input")?.value?.trim();
    const password = document.getElementById("auth-password-input")?.value;
    const submitBtn = document.getElementById("auth-submit-btn");

    if (!email) return;
    clearMessages();
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Please wait..."; }

    try {
      if (state.authMode === "signup") {
        if (!password || password.length < 6) {
          showMessage("error", "Please provide a password with at least 6 characters.");
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Sign Up"; }
          return;
        }

        const { data, error } = await client.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo: window.location.origin + window.location.pathname,
          }
        });

        if (error) {
          showMessage("error", error.message);
        } else if (data.session) {
          showMessage("success", "Account created successfully!");
          setTimeout(closeAuthModal, 800);
        } else {
          showMessage("success", "Confirmation email sent! Please check your inbox.");
        }
      } else {
        // Sign in
        if (password) {
          const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password,
          });

          if (error) {
            showMessage("error", error.message);
          } else {
            showMessage("success", "Logged in successfully!");
            setTimeout(closeAuthModal, 600);
          }
        } else {
          // Send Magic Link
          const { error } = await client.auth.signInWithOtp({
            email: email,
            options: {
              emailRedirectTo: window.location.origin + window.location.pathname,
            }
          });

          if (error) {
            showMessage("error", error.message);
          } else {
            showMessage("success", "Magic login link sent to your email! Click it to sign in.");
          }
        }
      }
    } catch (err) {
      showMessage("error", err.message || "An unexpected error occurred.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = state.authMode === "signup" ? "Sign Up" : "Continue";
      }
    }
  }

  async function signOut() {
    const client = getClient();
    if (!client) return;

    await client.auth.signOut();
    state.user = null;
    state.session = null;
    updateUI();
    window.location.reload();
  }

  // ─── UI & Profile Updates ─────────────────────────────────────────────────
  function updateUI() {
    const accountBtn = document.querySelector("[data-account-button]");
    const accountName = document.querySelector("[data-account-name]");
    const accountStatus = document.querySelector("[data-account-status]");
    const avatarSpan = accountBtn ? accountBtn.querySelector(".avatar") : null;

    if (!accountBtn) return;

    const customAvatar = localStorage.getItem("xmanius-custom-avatar");

    if (state.user) {
      const meta = state.user.user_metadata || {};
      const identityMeta = state.user.identities?.[0]?.identity_data || {};
      const name = meta.full_name || meta.name || identityMeta.full_name || identityMeta.name || state.user.email?.split("@")[0] || "User";
      const avatarUrl = customAvatar || meta.avatar_url || meta.picture || identityMeta.avatar_url || identityMeta.picture || "";

      if (accountName) accountName.textContent = name;
      if (accountStatus) accountStatus.textContent = state.user.email || "Active User";

      if (avatarSpan) {
        if (avatarUrl) {
          avatarSpan.innerHTML = `<img src="${avatarUrl}" alt="${name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
        } else {
          avatarSpan.innerHTML = `<span style="font-weight: bold; color: white; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: #3b82f6; border-radius: 50%; font-size: 13px;">${name.slice(0, 1).toUpperCase()}</span>`;
        }
      }
    } else {
      if (accountName) accountName.textContent = "Guest User";
      if (accountStatus) accountStatus.textContent = "Log In / Sign Up";
      if (avatarSpan) {
        if (customAvatar) {
          avatarSpan.innerHTML = `<img src="${customAvatar}" alt="Guest" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
        } else {
          avatarSpan.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>`;
        }
      }
    }
  }

  // ─── Cloud Sync ───────────────────────────────────────────────────────────
  async function syncCloudChats() {
    const client = getClient();
    if (!client || !state.user) return;

    try {
      const { data: cloudChats, error } = await client
        .from("user_chats")
        .select("chat_id, data, updated_at")
        .eq("user_id", state.user.id);

      if (!error && cloudChats) {
        const rawLocal = localStorage.getItem("xmanius-chats-v1") || "[]";
        let localChats = [];
        try { localChats = JSON.parse(rawLocal); } catch (e) { localChats = []; }

        const localMap = new Map(localChats.map(c => [c.id, c]));

        cloudChats.forEach(record => {
          if (record.data && record.data.id) {
            localMap.set(record.data.id, record.data);
          }
        });

        const merged = Array.from(localMap.values());
        localStorage.setItem("xmanius-chats-v1", JSON.stringify(merged));

        for (const chat of merged) {
          await client.from("user_chats").upsert({
            user_id: state.user.id,
            chat_id: chat.id,
            data: chat,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,chat_id" });
        }
      }
    } catch (err) {
      console.warn("Cloud sync note:", err.message);
    }
  }

  async function initAuth() {
    const client = getClient();
    if (!client) {
      setTimeout(initAuth, 200);
      return;
    }

    try {
      const { data, error } = await client.auth.getSession();
      if (!error && data && data.session) {
        state.session = data.session;
        state.user = data.session.user;
      }
    } catch (e) {
      console.warn("Auth getSession error:", e);
    }

    updateUI();

    client.auth.onAuthStateChange(async (event, session) => {
      state.session = session;
      state.user = session ? session.user : null;
      updateUI();

      if (event === "SIGNED_IN" && state.user) {
        console.log("Logged in as:", state.user.email);
        await syncCloudChats();
      }
    });

    state.isLoaded = true;
  }

  window.XmaniusAuth = {
    getClient: getClient,
    getState: () => state,
    openAuthModal: openAuthModal,
    closeAuthModal: closeAuthModal,
    signInWithGoogle: signInWithGoogle,
    signInWithGitHub: signInWithGitHub,
    signOut: signOut,
    syncCloudChats: syncCloudChats,
    updateUI: updateUI,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuth);
  } else {
    initAuth();
  }
})();
