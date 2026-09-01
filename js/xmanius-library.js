"use strict";

/**
 * XManius 500MB Media Library & Custom Profile Picture Controller
 * Manages:
 * - 500MB User Media Storage Vault (Images, MP3, MP4, PDFs, Docs)
 * - Media library modal & categorizer
 * - Instant attach-to-chat capability
 * - Custom profile picture upload & avatar sync
 */

(() => {
  const MAX_STORAGE_BYTES = 500 * 1024 * 1024; // 500 MB quota per user
  const DB_NAME = "xmanius-media-vault-v1";
  const STORE_NAME = "media_files";

  let dbInstance = null;

  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn("IndexedDB not supported");
        return resolve(null);
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("type", "category", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = () => {
        dbInstance = req.result;
        resolve(dbInstance);
      };
      req.onerror = () => {
        console.error("Failed to open media vault DB", req.error);
        resolve(null);
      };
    });
  }

  // ─── Media Storage Operations ─────────────────────────────────────────────
  async function getAllFiles() {
    const db = await openDB();
    if (!db) return [];
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async function getUsedStorageBytes() {
    const files = await getAllFiles();
    return files.reduce((acc, f) => acc + (f.size || 0), 0);
  }

  async function saveMediaFile(file, customName) {
    const currentUsed = await getUsedStorageBytes();
    if (currentUsed + file.size > MAX_STORAGE_BYTES) {
      alert("Storage limit exceeded! You have a 500MB media quota. Please delete some files to free space.");
      return null;
    }

    const mime = file.type || "application/octet-stream";
    let category = "docs";
    if (mime.startsWith("image/")) category = "images";
    else if (mime.startsWith("audio/")) category = "audio";
    else if (mime.startsWith("video/")) category = "video";

    const id = "media_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const dataUrl = await readFileAsDataURL(file);

    const record = {
      id: id,
      name: customName || file.name || "Untitled",
      type: mime,
      category: category,
      size: file.size,
      dataUrl: dataUrl,
      createdAt: new Date().toISOString(),
    };

    const db = await openDB();
    if (!db) return null;

    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });

    updateLibraryBadge();
    return record;
  }

  async function deleteMediaFile(id) {
    const db = await openDB();
    if (!db) return;

    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });

    updateLibraryBadge();
    renderLibraryGrid();
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb < 0.1) return (bytes / 1024).toFixed(1) + " KB";
    return mb.toFixed(1) + " MB";
  }

  // ─── UI Library Modal ─────────────────────────────────────────────────────
  let activeFilter = "all";

  function createLibraryModal() {
    if (document.getElementById("xmanius-library-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "xmanius-library-modal";
    overlay.className = "xmanius-library-overlay";
    overlay.innerHTML = `
      <div class="xmanius-library-modal" role="dialog" aria-modal="true" aria-label="Media Library">
        <header class="library-header">
          <div class="library-header-top">
            <div class="library-title-group">
              <div class="library-title-icon">📁</div>
              <div>
                <h3>Media Vault & Library</h3>
                <small style="color:#64748b;">500 MB Personal Cloud Storage for Photos, Audio, Video & Docs</small>
              </div>
            </div>
            <button type="button" class="library-close-btn" id="library-close-btn" aria-label="Close">✕</button>
          </div>

          <div class="library-storage-container">
            <div class="library-storage-label">
              <span>Storage Used: <strong id="lib-storage-used">0 MB</strong> / 500 MB</span>
              <span id="lib-storage-percent" style="font-weight:700;">0%</span>
            </div>
            <div class="library-storage-track">
              <div class="library-storage-fill" id="lib-storage-fill"></div>
            </div>
          </div>
        </header>

        <div class="library-toolbar">
          <div class="library-filters">
            <button type="button" class="library-filter-btn is-active" data-lib-filter="all">All Files</button>
            <button type="button" class="library-filter-btn" data-lib-filter="images">Photos / Images</button>
            <button type="button" class="library-filter-btn" data-lib-filter="audio">Audio (MP3)</button>
            <button type="button" class="library-filter-btn" data-lib-filter="video">Video (MP4)</button>
            <button type="button" class="library-filter-btn" data-lib-filter="docs">Documents</button>
          </div>

          <div class="library-actions">
            <label class="library-upload-btn" style="display:inline-flex;align-items:center;cursor:pointer;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span>Upload to Library</span>
              <input type="file" id="lib-file-input" multiple style="display:none;" accept="image/*,audio/*,video/*,application/pdf,text/*">
            </label>
          </div>
        </div>

        <div class="library-body">
          <div class="library-grid" id="library-grid"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("#library-close-btn").addEventListener("click", closeLibrary);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeLibrary();
    });

    overlay.querySelectorAll("[data-lib-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        overlay.querySelectorAll("[data-lib-filter]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        activeFilter = btn.dataset.libFilter;
        renderLibraryGrid();
      });
    });

    const fileInput = overlay.querySelector("#lib-file-input");
    fileInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        await saveMediaFile(file);
      }
      fileInput.value = "";
      renderLibraryGrid();
    });
  }

  async function openLibrary() {
    createLibraryModal();
    const overlay = document.getElementById("xmanius-library-modal");
    if (overlay) overlay.classList.add("is-active");
    await renderLibraryGrid();
  }

  function closeLibrary() {
    const overlay = document.getElementById("xmanius-library-modal");
    if (overlay) overlay.classList.remove("is-active");
  }

  async function renderLibraryGrid() {
    const grid = document.getElementById("library-grid");
    if (!grid) return;

    const files = await getAllFiles();
    const usedBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
    const percent = Math.min(100, Math.round((usedBytes / MAX_STORAGE_BYTES) * 100));

    const usedEl = document.getElementById("lib-storage-used");
    const percentEl = document.getElementById("lib-storage-percent");
    const fillEl = document.getElementById("lib-storage-fill");

    if (usedEl) usedEl.textContent = formatBytes(usedBytes);
    if (percentEl) percentEl.textContent = percent + "%";
    if (fillEl) fillEl.style.width = percent + "%";

    const filtered = activeFilter === "all" ? files : files.filter((f) => f.category === activeFilter);

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="library-empty" style="grid-column: 1 / -1;">
          <div class="library-empty-icon">📂</div>
          <strong style="color:#f1f5f9;font-size:15px;">Your Media Library is Empty</strong>
          <p style="font-size:12.5px;color:#64748b;margin:6px 0 16px 0;">Upload photos, MP3 audio, MP4 videos, or PDFs to store up to 500MB.</p>
          <label class="library-upload-btn" style="cursor:pointer;">
            <span>+ Upload First File</span>
            <input type="file" id="lib-empty-upload" multiple style="display:none;">
          </label>
        </div>
      `;
      document.getElementById("lib-empty-upload")?.addEventListener("change", async (e) => {
        for (const file of Array.from(e.target.files || [])) {
          await saveMediaFile(file);
        }
        renderLibraryGrid();
      });
      return;
    }

    grid.innerHTML = "";
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach((item) => {
      const card = document.createElement("div");
      card.className = "library-card";

      let previewContent = "";
      if (item.category === "images") {
        previewContent = `<img src="${item.dataUrl}" alt="${item.name}" loading="lazy">`;
      } else if (item.category === "video") {
        previewContent = `<video src="${item.dataUrl}" controls preload="metadata"></video>`;
      } else if (item.category === "audio") {
        previewContent = `
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:90%;">
            <div class="library-file-icon">🎵</div>
            <audio src="${item.dataUrl}" controls style="width:100%;height:28px;"></audio>
          </div>`;
      } else {
        previewContent = `<div class="library-file-icon">📄</div>`;
      }

      card.innerHTML = `
        <div class="library-preview-thumb">
          ${previewContent}
        </div>
        <div class="library-card-info">
          <span class="library-file-name" title="${item.name}">${item.name}</span>
          <div class="library-file-meta">
            <span>${formatBytes(item.size)}</span>
            <span>${new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="library-card-actions">
          <button type="button" class="library-btn-action action-attach" data-attach-id="${item.id}" title="Attach to Chat">
            📎 Attach
          </button>
          <a href="${item.dataUrl}" download="${item.name}" class="library-btn-action" style="text-decoration:none;" title="Download">
            ⬇ Save
          </a>
          <button type="button" class="library-btn-action action-delete" data-del-id="${item.id}" title="Delete">
            🗑
          </button>
        </div>
      `;

      card.querySelector("[data-del-id]").addEventListener("click", () => {
        if (confirm(`Delete "${item.name}" from your 500MB media library?`)) {
          deleteMediaFile(item.id);
        }
      });

      card.querySelector("[data-attach-id]").addEventListener("click", () => {
        attachFileToComposer(item);
        closeLibrary();
      });

      grid.appendChild(card);
    });
  }

  async function updateLibraryBadge() {
    const badge = document.querySelector("[data-library-count]");
    if (!badge) return;
    const files = await getAllFiles();
    badge.textContent = String(files.length);
  }

  function attachFileToComposer(item) {
    if (window.XmaniusAttachExternalFile) {
      window.XmaniusAttachExternalFile({
        id: item.id,
        name: item.name,
        mimeType: item.type,
        data: item.dataUrl,
        size: item.size,
      });
    }
  }

  // ─── Custom Profile Picture Upload ────────────────────────────────────────
  function setupProfilePicUpload() {
    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.accept = "image/*";
    uploadInput.style.display = "none";
    uploadInput.id = "custom-avatar-file-input";
    document.body.appendChild(uploadInput);

    uploadInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 8 * 1024 * 1024) {
        alert("Image must be smaller than 8MB.");
        return;
      }

      const dataUrl = await readFileAsDataURL(file);
      localStorage.setItem("xmanius-custom-avatar", dataUrl);

      // Also update in Supabase if user is logged in
      if (window.XmaniusAuth && window.XmaniusAuth.getClient()) {
        const client = window.XmaniusAuth.getClient();
        try {
          await client.auth.updateUser({
            data: { avatar_url: dataUrl }
          });
        } catch (err) {
          console.warn("Supabase avatar update note:", err);
        }
      }

      if (window.XmaniusAuth) window.XmaniusAuth.updateUI();
      alert("Profile picture updated successfully!");
    });

    window.triggerAvatarUpload = () => {
      uploadInput.click();
    };
  }

  window.XmaniusLibrary = {
    open: openLibrary,
    close: closeLibrary,
    saveMediaFile: saveMediaFile,
    getAllFiles: getAllFiles,
    getUsedStorageBytes: getUsedStorageBytes,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setupProfilePicUpload();
      updateLibraryBadge();
    });
  } else {
    setupProfilePicUpload();
    updateLibraryBadge();
  }
})();
