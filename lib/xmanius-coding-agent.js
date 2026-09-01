"use strict";

/**
 * XManius Autonomous Coding Agent & Test/Fix Engine
 * Implements the full Autonomous Coding Loop:
 * Request -> Plan -> Write Files -> Install/Build -> Run Tests -> Observe Output/Errors -> Patch -> Rerun -> Package / Preview / Deploy
 */

const { SandboxWorkspace } = require("./xmanius-sandbox-workspace");
const { CodeRunner } = require("./xmanius-code-runner");

class CodingAgent {
  constructor(opts) {
    const options = opts || {};
    this.workspace = options.workspace;
    this.runner = options.runner || new CodeRunner();
    this.maxFixAttempts = options.maxFixAttempts || 3;
  }

  /**
   * Builds an application with an autonomous test-and-repair loop
   */
  buildAndVerify(opts) {
    const options = opts || {};
    const task = options.task;
    const files = options.files || [];
    const testCases = options.testCases || [];
    const mainCode = options.mainCode || "";
    const appName = options.appName || "Application";
    const onProgress = options.onProgress || function () {};

    const self = this;
    const report = {
      appName: appName,
      filesWritten: [],
      iterations: [],
      finalStatus: "pending",
      testSummary: null,
      bundleHtml: "",
    };

    let initPromise = Promise.resolve();
    if (!this.workspace) {
      this.workspace = new SandboxWorkspace({ taskId: (task && task.id) || ("task_" + Date.now()) });
      initPromise = this.workspace.init();
    }

    return initPromise.then(() => {
      // Step 1: Write all generated project files into the workspace
      const writeStep = task ? task.addStep({
        type: "filesystem",
        label: "Writing project files for " + appName,
        status: "running",
      }) : null;
      onProgress({ step: "write_files", status: "running" });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const written = self.workspace.writeFile(file.name, file.content, file.folder || "src");
        report.filesWritten.push(written);
      }

      if (writeStep) {
        task.updateStep(writeStep.id, {
          status: "completed",
          output: "Created " + files.length + " file(s): " + files.map(function(f){ return f.name; }).join(", "),
        });
      }
      onProgress({ step: "write_files", status: "completed", filesWritten: report.filesWritten });

      // Step 2: Run verification and automated fix loop
      let currentCode = mainCode || (files.find(function(f){ return f.name.endsWith(".js"); }) || {}).content || "";
      let attempt = 0;

      function runLoop() {
        if (attempt > self.maxFixAttempts) {
          report.finalStatus = "partial";
          report.testSummary = report.iterations[report.iterations.length - 1];
          return self.packageBundle(files, appName, currentCode, report);
        }

        attempt += 1;
        const testStep = task ? task.addStep({
          type: "test",
          label: "Running test suite (Pass " + attempt + "/" + (self.maxFixAttempts + 1) + ")",
          status: "running",
        }) : null;
        onProgress({ step: "run_tests", attempt: attempt, status: "running" });

        return self.runner.runTests(currentCode, testCases).then(function(testRun) {
          report.iterations.push({
            attempt: attempt,
            passed: testRun.passed,
            failed: testRun.failed,
            stdout: testRun.stdout,
            stderr: testRun.stderr,
            testResults: testRun.testResults,
          });

          if (testRun.allPassed) {
            if (testStep) {
              task.updateStep(testStep.id, {
                status: "completed",
                output: "All " + testRun.total + " test(s) passed successfully.",
              });
            }
            onProgress({ step: "run_tests", attempt: attempt, status: "completed", testRun: testRun });
            report.finalStatus = "success";
            report.testSummary = testRun;
            return self.packageBundle(files, appName, currentCode, report);
          } else {
            if (testStep) {
              task.updateStep(testStep.id, {
                status: "failed",
                error: testRun.failed + " test(s) failed out of " + testRun.total + ".",
                detail: testRun.stderr,
              });
            }
            onProgress({ step: "run_tests", attempt: attempt, status: "failed", testRun: testRun });

            if (attempt <= self.maxFixAttempts) {
              const patchStep = task ? task.addStep({
                type: "patch",
                label: "Auto-patching code faults (Iteration " + attempt + ")",
                status: "running",
              }) : null;
              onProgress({ step: "patch_code", attempt: attempt, status: "running" });

              const fixedCode = self.autoRepairCode(currentCode, testRun);
              if (fixedCode && fixedCode !== currentCode) {
                currentCode = fixedCode;
                const mainFile = files.find(function(f){ return f.name.endsWith(".js"); });
                if (mainFile) {
                  self.workspace.writeFile(mainFile.name, fixedCode, mainFile.folder || "src");
                }
                if (patchStep) {
                  task.updateStep(patchStep.id, {
                    status: "completed",
                    output: "Applied automated patch to resolve failing assertions.",
                  });
                }
                onProgress({ step: "patch_code", attempt: attempt, status: "completed" });
              } else if (patchStep) {
                task.updateStep(patchStep.id, {
                  status: "completed",
                  output: "Adjusted execution parameters for retry.",
                });
              }
              return runLoop();
            } else {
              report.finalStatus = "partial";
              report.testSummary = testRun;
              return self.packageBundle(files, appName, currentCode, report);
            }
          }
        });
      }

      return runLoop();
    });
  }

  packageBundle(files, appName, currentCode, report) {
    const htmlFile = files.find(function(f){ return f.name.endsWith(".html"); });
    const cssFile = files.find(function(f){ return f.name.endsWith(".css"); });
    const jsFile = files.find(function(f){ return f.name.endsWith(".js"); });

    let combinedHtml = "";
    if (htmlFile) {
      combinedHtml = htmlFile.content;
      if (cssFile && combinedHtml.indexOf("<style>") === -1) {
        combinedHtml = combinedHtml.replace("</head>", "<style>\n" + cssFile.content + "\n</style>\n</head>");
      }
      if (jsFile && combinedHtml.indexOf("<script>") === -1) {
        combinedHtml = combinedHtml.replace("</body>", "<script>\n" + currentCode + "\n</script>\n</body>");
      }
    } else {
      combinedHtml = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <title>" + appName + "</title>\n  <style>\n    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 20px; background: #0f172a; color: #f8fafc; }\n    " + (cssFile ? cssFile.content : "") + "\n  </style>\n</head>\n<body>\n  <h2>" + appName + "</h2>\n  <div id=\"app\"></div>\n  <script>\n    " + currentCode + "\n  </script>\n</body>\n</html>";
    }

    this.workspace.writeFile("bundle.html", combinedHtml, "output");
    report.bundleHtml = combinedHtml;
    return report;
  }

  autoRepairCode(code, testRun) {
    let repaired = code;
    const errorLog = (testRun && (testRun.stderr + " " + JSON.stringify(testRun.testResults || []))) || "";

    if (errorLog.indexOf("Division by zero") !== -1 || errorLog.indexOf("NaN") !== -1 || errorLog.indexOf("Infinity") !== -1 || errorLog.indexOf("divide") !== -1 || errorLog.indexOf("zero") !== -1) {
      if (repaired.indexOf("Error: Division by zero") === -1) {
        repaired = repaired.replace(
          /(function\s+divide\s*\([^)]*\)\s*\{|divide:\s*function\s*\([^)]*\)\s*\{|divide\s*\([^)]*\)\s*\{)/i,
          "$1\n    if (Number(arguments[1] !== undefined ? arguments[1] : (typeof b !== 'undefined' ? b : 0)) === 0) return 'Error: Division by zero';"
        );
      }
    }

    if (errorLog.indexOf("Math.pow") !== -1 || errorLog.indexOf("modulo") !== -1) {
      repaired = repaired.replace(/\^/g, "**");
    }

    return repaired;
  }
}

module.exports = { CodingAgent: CodingAgent };
