"use strict";

/**
 * XManius Cortex Runtime - Automated Test Suite
 * Compatible with Node 6+ through Node 22+.
 * Validates all agent runtime primitives and the Definition of Done.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { TASK_STATES, CortexTask } = require("../lib/xmanius-cortex-task-engine");
const { SandboxWorkspace } = require("../lib/xmanius-sandbox-workspace");
const { CodeRunner } = require("../lib/xmanius-code-runner");
const { CodingAgent } = require("../lib/xmanius-coding-agent");
const { ArtifactRegistry, ARTIFACT_TYPES } = require("../lib/xmanius-artifact-service");
const { PDFWorker } = require("../lib/xmanius-pdf-worker");
const { EvidenceLedger } = require("../lib/xmanius-evidence-ledger");
const { ApprovalGateway } = require("../lib/xmanius-approval-gateway");
const { sanitizeSecretString } = require("../lib/xmanius-model-provider");

function runAllTests() {
  console.log("=================================================");
  console.log("🚀 Starting XManius Cortex Runtime Test Suite");
  console.log("=================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function test(name, fn) {
    totalTests += 1;
    try {
      fn();
      passedTests += 1;
      console.log("✓ [PASS] " + name);
    } catch (err) {
      console.error("✗ [FAIL] " + name + ": " + err.message);
      throw err;
    }
  }

  function asyncTest(name, fn) {
    totalTests += 1;
    return Promise.resolve()
      .then(fn)
      .then(function () {
        passedTests += 1;
        console.log("✓ [PASS] " + name);
      })
      .catch(function (err) {
        console.error("✗ [FAIL] " + name + ": " + err.message);
        throw err;
      });
  }

  // --- 1. Task Engine & State Machine Tests ---
  test("Task Engine: State Machine transitions and event emissions", function () {
    const task = new CortexTask({ objective: "Test Task" });
    assert.strictEqual(task.state, TASK_STATES.QUEUED);

    const events = [];
    task.subscribe(function (e) { events.push(e); });

    task.transitionTo(TASK_STATES.PLANNING, "Starting plan");
    assert.strictEqual(task.state, TASK_STATES.PLANNING);

    const step = task.addStep({ label: "Design Architecture", type: "plan" });
    assert.strictEqual(task.steps.length, 1);
    assert.strictEqual(step.status, "running");

    task.updateStep(step.id, { status: "completed", output: "Architecture ready" });
    assert.strictEqual(task.steps[0].status, "completed");

    task.transitionTo(TASK_STATES.EXECUTING, "Executing");
    assert.strictEqual(task.state, TASK_STATES.EXECUTING);

    task.complete("Task finished successfully");
    assert.strictEqual(task.state, TASK_STATES.COMPLETED);
    assert.strictEqual(task.isTerminal, true);
    assert(events.length >= 4, "Events should be emitted on transitions");
  });

  test("Task Engine: Invalid state transition throws error", function () {
    const task = new CortexTask({ objective: "Terminal Test" });
    task.transitionTo(TASK_STATES.PLANNING);
    task.complete("Done");
    assert.throws(function () {
      task.transitionTo(TASK_STATES.EXECUTING);
    }, /Invalid state transition/);
  });

  // --- 2. Sandboxed Workspace & Security Confinement Tests ---
  test("Sandbox Workspace: Directory creation and safe file I/O", function () {
    const workspace = new SandboxWorkspace({ taskId: "test_" + Date.now() });
    workspace.init();

    const writeResult = workspace.writeFile("app.js", "console.log('hello');", "src");
    assert(fs.existsSync(writeResult.absolutePath));

    const content = workspace.readFile("app.js", "src");
    assert.strictEqual(content, "console.log('hello');");

    const files = workspace.listFiles("src");
    assert(files.some(function (f) { return f.name === "app.js"; }));

    workspace.cleanup();
  });

  test("Sandbox Workspace: Security path traversal rejection", function () {
    const workspace = new SandboxWorkspace({ taskId: "test_security" });
    assert.throws(function () {
      workspace.resolveSafePath("../../../outside.txt", "src");
    }, /Security Violation/);
  });

  // --- 3. Code Runner Tests ---
  return asyncTest("Code Runner: JavaScript VM execution with stdout capture", function () {
    const runner = new CodeRunner();
    return runner.runJavaScript("console.log('Calculation:', 10 * 5);")
      .then(function (result) {
        assert.strictEqual(result.success, true);
        assert(result.stdout.indexOf("Calculation: 50") !== -1);
      });
  })
  .then(function () {
    return asyncTest("Code Runner: Execution timeout protection", function () {
      const runner = new CodeRunner({ timeoutMs: 300 });
      return runner.runJavaScript("while(true) {}", { timeoutMs: 300 })
        .then(function (result) {
          assert.strictEqual(result.success, false);
          assert(result.stderr.indexOf("timed out") !== -1 || (result.error && result.error.indexOf("timed out") !== -1));
        });
    });
  })
  .then(function () {
    return asyncTest("Code Runner: Test harness evaluation", function () {
      const runner = new CodeRunner();
      const code = "function multiply(a, b) { return a * b; }";
      const testCases = [
        { name: "multiply(3, 4) === 12", code: "assertEquals(multiply(3, 4), 12);" },
        { name: "multiply(5, 5) === 25", code: "assertEquals(multiply(5, 5), 25);" },
      ];
      return runner.runTests(code, testCases)
        .then(function (testRun) {
          assert.strictEqual(testRun.allPassed, true);
          assert.strictEqual(testRun.passed, 2);
          assert.strictEqual(testRun.failed, 0);
        });
    });
  })
  .then(function () {
    // --- 4. Autonomous Coding Loop & Self-Healing Verifier ---
    return asyncTest("Autonomous Coding Agent: Self-healing repair loop and app bundle", function () {
      const task = new CortexTask({ objective: "Build and test math module" });
      const codingAgent = new CodingAgent();

      const buggyCode = "var Calculator = { add: function(a, b) { return a + b; }, divide: function(a, b) { return a / b; } };";

      const files = [
        { name: "calc.js", content: buggyCode, folder: "src" },
        { name: "index.html", content: "<div id='app'>Calculator</div>", folder: "src" }
      ];

      const testCases = [
        { name: "Addition test", code: "assertEquals(Calculator.add(10, 5), 15);" },
        { name: "Zero division guard test", code: "assertEquals(Calculator.divide(10, 0), 'Error: Division by zero');" }
      ];

      return codingAgent.buildAndVerify({
        task: task,
        files: files,
        testCases: testCases,
        mainCode: buggyCode,
        appName: "MathApp",
      }).then(function (report) {
        assert.strictEqual(report.finalStatus, "success");
        assert(report.bundleHtml.indexOf("Calculator") !== -1);
        assert(report.testSummary.passed >= 2);
      });
    });
  })
  .then(function () {
    // --- 5. Artifact Service & Registry Tests ---
    test("Artifact Registry: Register deliverables with checksums", function () {
      const registry = new ArtifactRegistry();
      const artifact = registry.createArtifact({
        taskId: "task_123",
        title: "Sample App",
        type: ARTIFACT_TYPES.HTML,
        content: "<h1>Interactive App</h1>",
        filename: "app.html",
      });

      assert.strictEqual(artifact.taskId, "task_123");
      assert.strictEqual(artifact.type, "html");
      assert.strictEqual(artifact.filename, "app.html");
      assert(artifact.checksum.length > 0);
      assert(artifact.previewUrl.indexOf(artifact.id) !== -1);

      const retrieved = registry.getArtifact(artifact.id);
      assert.strictEqual(retrieved.rawContent, "<h1>Interactive App</h1>");
    });

    // --- 6. PDF Worker & Printable Report Generation ---
    test("PDF Worker: Generate compliant PDF 1.4 binary and printable HTML", function () {
      const worker = new PDFWorker();
      const pdfBuffer = worker.generatePdfBuffer({
        title: "Cortex Build Report",
        subtitle: "Autonomous Execution",
        sections: [{ heading: "Summary", content: "<p>All passed</p>", rawText: "All passed" }],
      });

      assert(Buffer.isBuffer(pdfBuffer));
      assert(pdfBuffer.toString("utf8").indexOf("%PDF-1.4") === 0);
      assert(pdfBuffer.toString("utf8").indexOf("%%EOF") !== -1);

      const htmlReport = worker.generatePrintableHtml({
        title: "Cortex Report",
        sections: [{ heading: "Summary", content: "<p>Success</p>" }],
        testSummary: { passed: true, passedCount: 5, totalCount: 5 },
      });

      assert(htmlReport.indexOf("Cortex Verified") !== -1);
      assert(htmlReport.indexOf("All Tests Passed") !== -1);
    });

    // --- 7. Evidence Ledger & Source Mapping ---
    test("Evidence Ledger: Normalization, freshness, and claim grounding", function () {
      const ledger = new EvidenceLedger({ taskId: "task_res_1" });
      ledger.addSource({
        url: "https://mit.edu/research/ai",
        title: "MIT Artificial Intelligence Laboratory",
        snippet: "Autonomous agent execution reduces developer overhead by running test loops.",
      });

      const claims = ledger.mapClaims([
        "Autonomous agents execute test loops to reduce overhead.",
        "Quantum computers run on liquid helium at 0 Kelvin."
      ]);

      assert.strictEqual(claims[0].status, "partially_supported");
      assert.strictEqual(claims[0].sourceIds.length, 1);
      assert.strictEqual(claims[1].status, "unverified");

      const summary = ledger.toSidebarSummary();
      assert.strictEqual(summary.totalSources, 1);
      assert.strictEqual(summary.sources[0].domain, "mit.edu");
    });

    // --- 8. Approval Gateway & Permission Tiers ---
    test("Approval Gateway: High impact actions require authorization", function () {
      const gateway = new ApprovalGateway();
      assert.strictEqual(gateway.isApprovalRequired("read_file"), false);
      assert.strictEqual(gateway.isApprovalRequired("delete_file"), true);

      const req = gateway.createApprovalRequest({
        taskId: "task_456",
        action: "delete_file",
        summary: "Delete project workspace",
      });

      assert.strictEqual(req.status, "pending");

      assert.throws(function () {
        gateway.assertAuthorized("delete_file", null);
      }, /requires explicit user confirmation/);

      const approved = gateway.resolveApproval(req.id, "approved");
      assert.strictEqual(approved.status, "approved");
      assert.strictEqual(gateway.assertAuthorized("delete_file", approved), true);
    });

    // --- 9. Model Provider Privacy & Secret Redaction ---
    test("Model Provider: Secret redaction prevents API key leakage", function () {
      const secretKey = "AIzaSySecretApiKey123456";
      const log = "Calling upstream with key " + secretKey + " on model gemini-3.5-flash-lite";
      const redacted = sanitizeSecretString(log, [secretKey]);
      assert(redacted.indexOf(secretKey) === -1);
      assert(redacted.indexOf("[REDACTED_API_KEY]") !== -1);
    });

    console.log("\n=================================================");
    console.log("✅ All " + passedTests + "/" + totalTests + " Cortex Runtime Tests Passed Successfully!");
    console.log("=================================================\n");
  });
}

if (require.main === module) {
  Promise.resolve(runAllTests()).catch(function (err) {
    console.error("Test Suite Failed:", err);
    process.exit(1);
  });
}

module.exports = { runAllTests: runAllTests };
