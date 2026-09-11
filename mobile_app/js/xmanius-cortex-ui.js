(() => {
  "use strict";

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ─── Drawer ───────────────────────────────────────────────────────────────
  class Drawer {
    constructor() {
      this.el = null; this.body = null;
      this.arts = []; this.srcs = []; this.tab = "preview";
      this._mount();
    }
    _mount() {
      if (document.getElementById("xc-drawer")) {
        this.el = document.getElementById("xc-drawer");
        this.body = document.getElementById("xc-drawer-body");
        return;
      }
      const d = document.createElement("div");
      d.id = "xc-drawer";
      d.className = "cortex-drawer-overlay";
      d.innerHTML = `
        <div class="cortex-drawer-panel">
          <div class="cortex-drawer-header">
            <h3>⚡ Cortex Deliverables</h3>
            <button class="cortex-drawer-close" type="button">✕</button>
          </div>
          <div class="cortex-drawer-tabs" id="xc-tab-bar"></div>
          <div class="cortex-drawer-body" id="xc-drawer-body"></div>
        </div>`;
      document.body.appendChild(d);
      this.el = d;
      this.body = d.querySelector("#xc-drawer-body");
      d.querySelector(".cortex-drawer-close").onclick = () => this.close();
      d.onclick = (e) => { if (e.target === d) this.close(); };
    }
    open(arts, srcs, tab) {
      this.arts = arts || []; this.srcs = srcs || []; this.tab = tab || "preview";
      this._tabs(); this._render(); this.el.classList.add("is-active");
    }
    close() { this.el.classList.remove("is-active"); }
    _tabs() {
      const bar = this.el.querySelector("#xc-tab-bar"); if (!bar) return;
      const defs = [
        { id:"preview", label:"Interactive App" },
        { id:"pdf",     label:"Report / PDF" },
        { id:"code",    label:"Source Code" },
        { id:"evidence",label:`Sources (${this.srcs.length})` },
      ];
      bar.innerHTML = "";
      defs.forEach(t => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "cortex-tab-btn" + (t.id === this.tab ? " is-active" : "");
        b.textContent = t.label;
        b.onclick = () => { bar.querySelectorAll(".cortex-tab-btn").forEach(x=>x.classList.remove("is-active")); b.classList.add("is-active"); this.tab = t.id; this._render(); };
        bar.appendChild(b);
      });
    }
    _render() {
      if (!this.body) return;
      this.body.innerHTML = "";
      if (this.tab === "preview") {
        const a = this.arts.find(x => x.type === "html" && !x.metadata?.isReport);
        if (a && (a.bundleHtml || a.content)) {
          const f = document.createElement("iframe");
          f.className = "cortex-drawer-frame";
          f.sandbox = "allow-scripts allow-forms allow-modals allow-same-origin";
          f.srcdoc = a.bundleHtml || a.content;
          this.body.appendChild(f);
        } else {
          this.body.innerHTML = "<p style='color:#64748b;text-align:center;padding:60px 20px;'>No interactive app to preview.</p>";
        }
      } else if (this.tab === "pdf") {
        const rep = this.arts.find(x => x.metadata?.isReport);
        const pdf = this.arts.find(x => x.type === "pdf");
        const src = (rep && (rep.bundleHtml || rep.content)) || null;
        if (src) {
          const dl = pdf ? `<a href="${esc(pdf.downloadUrl||"")}" download="${esc(pdf.filename||"report.pdf")}" class="cortex-artifact-btn btn-pdf" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;margin-bottom:12px;">⬇ Download PDF</a>` : "";
          const wrap = document.createElement("div");
          wrap.style.cssText = "display:flex;flex-direction:column;gap:0;height:100%;";
          wrap.innerHTML = dl;
          const f = document.createElement("iframe");
          f.className = "cortex-drawer-frame"; f.style.flex = "1";
          f.srcdoc = src; wrap.appendChild(f);
          this.body.appendChild(wrap);
        } else {
          this.body.innerHTML = "<p style='color:#64748b;text-align:center;padding:60px 20px;'>No PDF report available.</p>";
        }
      } else if (this.tab === "code") {
        const a = this.arts.find(x => x.type === "code");
        if (a && a.content) {
          this.body.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span style="font-family:monospace;color:#38bdf8;">${esc(a.filename||"code")}</span></div><pre style="background:#060d1a;color:#f8fafc;padding:18px;border-radius:10px;overflow:auto;font-size:12px;line-height:1.7;border:1px solid #1e3a5f;max-height:540px;"><code>${esc(a.content)}</code></pre>`;
        } else {
          this.body.innerHTML = "<p style='color:#64748b;text-align:center;padding:60px 20px;'>No source code available.</p>";
        }
      } else {
        if (!this.srcs.length) {
          this.body.innerHTML = "<p style='color:#64748b;text-align:center;padding:60px 20px;'>No external sources attached.</p>";
          return;
        }
        this.srcs.forEach((s, i) => {
          const c = document.createElement("div"); c.className = "cortex-source-card";
          c.innerHTML = `<div style="display:flex;align-items:center;"><span class="cortex-source-badge">[S${i+1}]</span><span class="cortex-source-domain">${esc(s.domain||s.publisher||"web")}</span></div><div class="cortex-source-title"><a href="${esc(s.url)}" target="_blank" style="color:#60a5fa;text-decoration:none;">${esc(s.title||s.url)}</a></div>${s.snippet?`<div class="cortex-source-snippet">${esc(s.snippet)}</div>`:""}`;
          this.body.appendChild(c);
        });
      }
    }
  }

  // ─── Card Renderer ────────────────────────────────────────────────────────
  function renderCard(task, arts, srcs) {
    arts = arts || []; srcs = srcs || [];
    const done = task.state === "completed";
    const statusHtml = done
      ? `<span class="cortex-status-ok">completed</span>`
      : `<span class="cortex-status-run">${task.state||"running"}</span>`;

    const wrap = document.createElement("div");
    wrap.className = "cortex-card";

    // ── HEADER ──────────────────────────────────────────────────────────────
    const hdr = document.createElement("div");
    hdr.className = "cortex-card-header";
    hdr.innerHTML = `
      <div class="cortex-card-title">
        <div class="cortex-agent-icon">⚡</div>
        <div class="cortex-title-text">
          <span class="cortex-title-name">Cortex Agent</span>
          <span class="cortex-title-sub">#${esc(String(task.id||"").slice(-6))} · ${statusHtml}</span>
        </div>
      </div>
      <button type="button" class="cortex-stop-btn" data-sid="${esc(task.id||"")}"${done?" disabled":""}>
        ${done?"✓ Done":"■ STOP"}
      </button>`;
    wrap.appendChild(hdr);

    // ── ARTIFACT BUTTONS (placed early so always visible) ────────────────────
    const appArt  = arts.find(a => a.type === "html" && !a.metadata?.isReport);
    const pdfArt  = arts.find(a => a.type === "pdf");
    const codeArt = arts.find(a => a.type === "code");
    const repArt  = arts.find(a => a.metadata?.isReport);

    const hasButtons = appArt || pdfArt || codeArt || repArt;
    if (hasButtons) {
      const bar = document.createElement("div");
      bar.className = "cortex-artifacts-bar";

      if (appArt) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "cortex-artifact-btn btn-app";
        b.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg> Interactive App`;
        b.onclick = () => window.XmaniusCortexDrawer.open(arts, srcs, "preview");
        bar.appendChild(b);
      }
      if (repArt || pdfArt) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "cortex-artifact-btn btn-pdf";
        b.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Report / PDF`;
        b.onclick = () => window.XmaniusCortexDrawer.open(arts, srcs, "pdf");
        bar.appendChild(b);
      }
      if (codeArt) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "cortex-artifact-btn btn-code";
        b.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Source Code`;
        b.onclick = () => window.XmaniusCortexDrawer.open(arts, srcs, "code");
        bar.appendChild(b);
      }
      wrap.appendChild(bar);
    }

    // ── COMPACT STEPS ────────────────────────────────────────────────────────
    if (task.steps && task.steps.length) {
      const sl = document.createElement("div");
      sl.className = "cortex-steps";
      task.steps.forEach(s => {
        const row = document.createElement("div");
        row.className = "cortex-step";
        const icon = s.status === "completed" ? "✓" : s.status === "failed" ? "✗" : "";
        row.innerHTML = `
          <div class="cortex-step-dot ${s.status||"pending"}">${icon}</div>
          <div class="cortex-step-label">${esc(s.label||"")}</div>`;
        sl.appendChild(row);
      });
      wrap.appendChild(sl);
    }

    // ── INLINE APP PREVIEW ───────────────────────────────────────────────────
    if (appArt && (appArt.bundleHtml || appArt.content)) {
      const pw = document.createElement("div");
      pw.className = "cortex-preview-wrap";
      pw.innerHTML = `<div class="cortex-preview-bar"><strong>📱 Live App Preview</strong><span style="font-size:10px;">Sandboxed</span></div>`;
      const frame = document.createElement("iframe");
      frame.className = "cortex-preview-frame";
      frame.sandbox = "allow-scripts allow-forms allow-modals allow-same-origin";
      frame.srcdoc = appArt.bundleHtml || appArt.content;
      pw.appendChild(frame);
      wrap.appendChild(pw);
    }

    // bottom padding
    const pad = document.createElement("div"); pad.style.height = "12px";
    wrap.appendChild(pad);

    // wire STOP
    const sb = wrap.querySelector("[data-sid]");
    if (sb && !done) {
      sb.onclick = () => {
        fetch(`/api/xmanius-task?action=stop&taskId=${encodeURIComponent(sb.dataset.sid)}`, { method:"POST" })
          .finally(() => { sb.textContent = "STOPPED"; sb.disabled = true; });
      };
    }

    return wrap;
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  const drawer = new Drawer();
  window.XmaniusCortexDrawer = drawer;

  window.XmaniusCortex = {
    renderFullCortexResponse: renderCard,
    renderActivityCard: (task) => renderCard(task, [], []),
    renderArtifactsBar: () => null,
    setArtifactsAndSources: (a, s) => { drawer.arts = a; drawer.srcs = s; },
  };

})();
