"use strict";

/**
 * XManius PDF Generation Worker
 * Converts Markdown, HTML, and task execution summaries into standalone, styled PDF documents
 * and printable HTML reports with citations, test logs, and metadata.
 */

function pad10(num) {
  let s = String(num);
  while (s.length < 10) s = "0" + s;
  return s;
}

class PDFWorker {
  /**
   * Generates a styled HTML report template suitable for browser rendering and print-to-PDF
   */
  generatePrintableHtml(opts) {
    const options = opts || {};
    const title = options.title || "Task Report";
    const subtitle = options.subtitle || "Autonomous Execution Summary";
    const author = options.author || "XManius Cortex AI";
    const date = options.date || new Date().toISOString().slice(0, 10);
    const sections = options.sections || [];
    const sources = options.sources || [];
    const testSummary = options.testSummary || null;

    let sectionsHtml = "";
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      sectionsHtml += "\n    <section>\n      <h2>" + escapeHtml(sec.heading) + "</h2>\n      <div>" + sec.content + "</div>\n    </section>\n  ";
    }

    let testHtml = "";
    if (testSummary) {
      testHtml = "\n    <section>\n      <h2>Test & Verification Summary</h2>\n      <div class=\"test-box\">\n        <p><strong>Status:</strong> " + (testSummary.passed ? "All Tests Passed ✓" : "Tests Incomplete") + " (" + (testSummary.passedCount || 0) + "/" + (testSummary.totalCount || 0) + ")</p>\n        " + (testSummary.stdout ? ("<pre><code>" + escapeHtml(testSummary.stdout) + "</code></pre>") : "") + "\n      </div>\n    </section>\n  ";
    }

    let sourcesHtml = "";
    if (sources.length) {
      let rows = "";
      for (let j = 0; j < sources.length; j++) {
        const src = sources[j];
        rows += "\n            <tr>\n              <td><strong>[S" + (j + 1) + "]</strong></td>\n              <td>" + escapeHtml(src.title || "External Source") + "</td>\n              <td><a href=\"" + escapeHtml(src.url) + "\" target=\"_blank\">" + escapeHtml(src.url) + "</a></td>\n              <td><span class=\"badge\">" + escapeHtml(src.status || "verified") + "</span></td>\n            </tr>\n          ";
      }
      sourcesHtml = "\n    <section>\n      <h2>Evidence & Sources</h2>\n      <table>\n        <thead>\n          <tr>\n            <th>Source</th>\n            <th>Title</th>\n            <th>URL</th>\n            <th>Status</th>\n          </tr>\n        </thead>\n        <tbody>\n          " + rows + "\n        </tbody>\n      </table>\n    </section>\n  ";
    }

    return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <title>" + escapeHtml(title) + " - XManius Report</title>\n  <style>\n    @page { margin: 20mm 15mm 20mm 15mm; size: A4; }\n    body {\n      font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;\n      color: #1e293b;\n      background: #ffffff;\n      line-height: 1.6;\n      margin: 0;\n      padding: 30px;\n    }\n    .report-header {\n      border-bottom: 2px solid #3b82f6;\n      padding-bottom: 20px;\n      margin-bottom: 30px;\n      display: flex;\n      justify-content: space-between;\n      align-items: flex-start;\n    }\n    .report-title-area h1 {\n      font-size: 26px;\n      font-weight: 800;\n      color: #0f172a;\n      margin: 0 0 6px 0;\n    }\n    .report-subtitle {\n      font-size: 14px;\n      color: #64748b;\n      margin: 0;\n    }\n    .report-meta {\n      text-align: right;\n      font-size: 12px;\n      color: #64748b;\n    }\n    .badge {\n      display: inline-block;\n      padding: 3px 8px;\n      font-size: 11px;\n      font-weight: 600;\n      border-radius: 4px;\n      background: #eff6ff;\n      color: #1d4ed8;\n      border: 1px solid #bfdbfe;\n    }\n    .badge-success { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }\n    h2 {\n      font-size: 18px;\n      font-weight: 700;\n      color: #1e293b;\n      border-bottom: 1px solid #e2e8f0;\n      padding-bottom: 6px;\n      margin-top: 24px;\n      margin-bottom: 12px;\n    }\n    h3 {\n      font-size: 15px;\n      font-weight: 600;\n      color: #334155;\n      margin-top: 18px;\n      margin-bottom: 8px;\n    }\n    p, ul, ol {\n      font-size: 13px;\n      margin: 8px 0;\n    }\n    code {\n      font-family: monospace;\n      font-size: 12px;\n      background: #f1f5f9;\n      padding: 2px 6px;\n      border-radius: 4px;\n      color: #0f172a;\n    }\n    pre {\n      background: #0f172a;\n      color: #f8fafc;\n      padding: 14px;\n      border-radius: 6px;\n      overflow-x: auto;\n      font-size: 12px;\n      line-height: 1.5;\n    }\n    pre code {\n      background: transparent;\n      color: inherit;\n      padding: 0;\n    }\n    table {\n      width: 100%;\n      border-collapse: collapse;\n      margin: 16px 0;\n      font-size: 12px;\n    }\n    th, td {\n      border: 1px solid #cbd5e1;\n      padding: 8px 12px;\n      text-align: left;\n    }\n    th {\n      background: #f8fafc;\n      font-weight: 600;\n      color: #334155;\n    }\n    .test-box {\n      background: #f8fafc;\n      border: 1px solid #e2e8f0;\n      border-radius: 6px;\n      padding: 12px;\n      margin: 12px 0;\n    }\n    .footer {\n      margin-top: 40px;\n      border-top: 1px solid #e2e8f0;\n      padding-top: 12px;\n      font-size: 11px;\n      color: #94a3b8;\n      text-align: center;\n    }\n  </style>\n</head>\n<body>\n  <div class=\"report-header\">\n    <div class=\"report-title-area\">\n      <h1>" + escapeHtml(title) + "</h1>\n      <p class=\"report-subtitle\">" + escapeHtml(subtitle) + "</p>\n    </div>\n    <div class=\"report-meta\">\n      <div><strong>Platform:</strong> " + escapeHtml(author) + "</div>\n      <div><strong>Date:</strong> " + escapeHtml(date) + "</div>\n      <div style=\"margin-top: 4px;\"><span class=\"badge badge-success\">Cortex Verified</span></div>\n    </div>\n  </div>\n\n  " + sectionsHtml + "\n\n  " + testHtml + "\n\n  " + sourcesHtml + "\n\n  <div class=\"footer\">\n    Generated autonomously by XManius Cortex AI • Agent Runtime v1\n  </div>\n</body>\n</html>";
  }

  /**
   * Generates a compliant PDF 1.4 binary buffer from title, text sections, and test results
   */
  generatePdfBuffer(opts) {
    const options = opts || {};
    const title = options.title || "XManius Task Report";
    const subtitle = options.subtitle || "Autonomous Execution Deliverable";
    const sections = options.sections || [];
    const testSummary = options.testSummary || null;

    const lines = [
      "============================================================",
      "  " + title.toUpperCase(),
      "  " + subtitle,
      "  Generated by XManius Cortex AI on " + new Date().toISOString().slice(0, 10),
      "============================================================",
      "",
    ];

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      lines.push("## " + sec.heading);
      lines.push(sec.rawText || stripHtml(sec.content));
      lines.push("");
    }

    if (testSummary) {
      lines.push("## Verification & Test Results");
      lines.push("Passed: " + (testSummary.passed ? "YES (All tests passed)" : "NO"));
      if (testSummary.stdout) {
        lines.push("Output:");
        lines.push(testSummary.stdout);
      }
      lines.push("");
    }

    lines.push("------------------------------------------------------------");
    lines.push("End of Report - XManius Agent Runtime v1");

    return buildStandardPdf(lines);
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Minimal standard-compliant PDF 1.4 generator
 */
function buildStandardPdf(textLines) {
  const sanitize = function(text) { return text.replace(/[()\\]/g, "\\$&"); };
  
  let contentStream = "BT\n/F1 11 Tf\n14 TL\n50 750 Td\n";
  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];
    if (line.indexOf("==") === 0 || line.indexOf("--") === 0) {
      contentStream += "(" + sanitize(line) + ") Tj T*\n";
    } else if (line.indexOf("## ") === 0) {
      contentStream += "/F1 14 Tf\n(" + sanitize(line) + ") Tj T*\n/F1 11 Tf\n";
    } else if (line.trim() === "") {
      contentStream += "T*\n";
    } else {
      contentStream += "(" + sanitize(line) + ") Tj T*\n";
    }
  }
  contentStream += "ET\n";

  const streamLength = Buffer.byteLength(contentStream, "utf8");

  const objects = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n");
  objects.push("4 0 obj\n<< /Length " + streamLength + " >>\nstream\n" + contentStream + "endstream\nendobj\n");
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  let pdf = "%PDF-1.4\n";
  const xref = [0];
  let offset = Buffer.byteLength(pdf, "utf8");

  for (let j = 0; j < objects.length; j++) {
    const obj = objects[j];
    xref.push(offset);
    pdf += obj;
    offset = Buffer.byteLength(pdf, "utf8");
  }

  const startXref = offset;
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (let k = 1; k <= objects.length; k++) {
    pdf += pad10(xref[k]) + " 00000 n \n";
  }

  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + startXref + "\n%%EOF\n";

  return Buffer.from(pdf, "utf8");
}

module.exports = {
  PDFWorker: PDFWorker,
  buildStandardPdf: buildStandardPdf,
  escapeHtml: escapeHtml,
  stripHtml: stripHtml,
};
