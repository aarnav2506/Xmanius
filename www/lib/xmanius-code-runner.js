"use strict";

/**
 * XManius Code Runner
 * Sandboxed code execution with timeout, stdout/stderr capture, memory/resource protection,
 * and exit code reporting for JavaScript, Python, and Web modules.
 */

const vm = require("vm");
const { spawn } = require("child_process");

class CodeRunner {
  constructor(opts) {
    const options = opts || {};
    this.defaultTimeoutMs = options.timeoutMs || 7000;
    this.maxLogLength = options.maxLogLength || 50000;
  }

  /**
   * Run JavaScript in an isolated Node VM sandbox
   */
  runJavaScript(code, opts) {
    const options = opts || {};
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const signal = options.signal;
    const startTime = Date.now();
    const stdout = [];
    const stderr = [];

    if (signal && signal.aborted) {
      return Promise.resolve({
        exitCode: 130,
        stdout: "",
        stderr: "Execution cancelled before start.",
        executionTimeMs: 0,
        success: false,
        returnValue: null,
      });
    }

    const appendLog = (list, args) => {
      const line = Array.from(args)
        .map((arg) => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)))
        .join(" ");
      list.push(line);
    };

    const sandbox = Object.assign({
      console: {
        log: function() { appendLog(stdout, arguments); },
        info: function() { appendLog(stdout, arguments); },
        warn: function() { appendLog(stderr, arguments); },
        error: function() { appendLog(stderr, arguments); },
      },
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      Buffer: Buffer,
      Math: Math,
      Date: Date,
      JSON: JSON,
      RegExp: RegExp,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      Map: typeof Map !== "undefined" ? Map : undefined,
      Set: typeof Set !== "undefined" ? Set : undefined,
      Promise: Promise,
    }, options.contextVariables);

    const context = vm.createContext(sandbox);

    return new Promise((resolve) => {
      try {
        const wrappedCode = "(function() {\n" + code + "\n})()";
        const script = new vm.Script(wrappedCode, {
          filename: "sandbox-execution.js",
        });

        const result = script.runInContext(context, {
          timeout: timeoutMs,
          displayErrors: true,
        });

        const executionTimeMs = Date.now() - startTime;
        resolve({
          exitCode: 0,
          stdout: stdout.join("\n").slice(0, this.maxLogLength),
          stderr: stderr.join("\n").slice(0, this.maxLogLength),
          executionTimeMs: executionTimeMs,
          success: true,
          returnValue: result !== undefined ? result : null,
        });
      } catch (err) {
        const executionTimeMs = Date.now() - startTime;
        stderr.push(err.stack || err.message || String(err));
        resolve({
          exitCode: 1,
          stdout: stdout.join("\n").slice(0, this.maxLogLength),
          stderr: stderr.join("\n").slice(0, this.maxLogLength),
          executionTimeMs: executionTimeMs,
          success: false,
          error: err.message,
        });
      }
    });
  }

  /**
   * Run code with automated assertions/tests
   */
  runTests(code, testCases, opts) {
    const options = opts || {};
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const cases = testCases || [];

    let testCasesCode = "";
    for (let i = 0; i < cases.length; i++) {
      const tc = cases[i];
      const tcName = tc.name || ("Test " + (i + 1));
      testCasesCode += "\n      try {\n        " + tc.code + "\n        __results.push({ name: " + JSON.stringify(tcName) + ", passed: true });\n        console.log('✓ Passed: ' + " + JSON.stringify(tcName) + ");\n      } catch (err) {\n        __results.push({ name: " + JSON.stringify(tcName) + ", passed: false, error: err.message });\n        console.error('✗ Failed: ' + " + JSON.stringify(tcName) + " + ' - ' + err.message);\n      }\n";
    }

    const harness = "\n      var __results = [];\n      var assert = function(condition, message) {\n        if (!condition) throw new Error(message || 'Assertion failed');\n      };\n      var assertEquals = function(actual, expected, message) {\n        var actualStr = JSON.stringify(actual);\n        var expectedStr = JSON.stringify(expected);\n        if (actualStr !== expectedStr) {\n          throw new Error((message ? message + ': ' : '') + 'Expected ' + expectedStr + ' but got ' + actualStr);\n        }\n      };\n\n      " + code + "\n\n      " + testCasesCode + "\n      \n      return __results;\n    ";

    return this.runJavaScript(harness, { timeoutMs: timeoutMs }).then((execution) => {
      const results = Array.isArray(execution.returnValue) ? execution.returnValue : [];
      const passedCount = results.filter((r) => r.passed).length;
      const failedCount = results.filter((r) => !r.passed).length;

      return Object.assign({}, execution, {
        testResults: results,
        total: cases.length,
        passed: passedCount,
        failed: failedCount,
        allPassed: cases.length > 0 && failedCount === 0,
      });
    });
  }

  /**
   * Run an external subprocess with timeout & signal cancellation
   */
  runProcess(command, args, opts) {
    const options = opts || {};
    const procArgs = args || [];
    const cwd = options.cwd || process.cwd();
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const startTime = Date.now();

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      const proc = spawn(command, procArgs, {
        cwd: cwd,
        env: Object.assign({}, process.env, options.env),
        shell: false,
      });

      const timer = setTimeout(() => {
        killed = true;
        try { proc.kill("SIGTERM"); } catch (e) {}
        stderr += "\n[Process timed out after " + timeoutMs + "ms]";
      }, timeoutMs);

      if (options.signal) {
        try {
          options.signal.addEventListener("abort", () => {
            killed = true;
            try { proc.kill("SIGKILL"); } catch (e) {}
            stderr += "\n[Process cancelled by user]";
          });
        } catch (e) {}
      }

      if (proc.stdout) {
        proc.stdout.on("data", (data) => { stdout += data.toString(); });
      }

      if (proc.stderr) {
        proc.stderr.on("data", (data) => { stderr += data.toString(); });
      }

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code !== null ? code : (killed ? 130 : 1),
          stdout: stdout.slice(0, this.maxLogLength),
          stderr: stderr.slice(0, this.maxLogLength),
          executionTimeMs: Date.now() - startTime,
          success: code === 0 && !killed,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: 127,
          stdout: "",
          stderr: "Process launch error: " + err.message,
          executionTimeMs: Date.now() - startTime,
          success: false,
        });
      });
    });
  }
}

module.exports = { CodeRunner: CodeRunner };
