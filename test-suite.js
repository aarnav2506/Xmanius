const fs = require('fs');
const chatHandler = require('./api/xmanius-chat.js').default;
const ttsHandler = require('./api/xmanius-tts.js').default;

// Mock environment variables from .env
try {
  const envData = fs.readFileSync('.env', 'utf8');
  envData.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });
} catch (e) {}

// Simple Express-like Response mock
class MockResponse {
  constructor(onEnd) {
    this.statusCode = 200;
    this.headers = {};
    this.onEnd = onEnd;
  }
  setHeader(k, v) { this.headers[k] = v; }
  status(code) { this.statusCode = code; return this; }
  json(data) { this.onEnd(this.statusCode, data); }
  end() { this.onEnd(this.statusCode, null); }
}

async function runTest(name, payload, handler = chatHandler) {
  return new Promise((resolve) => {
    console.log(`\n▶️ Testing: ${name}`);
    const start = Date.now();
    
    const req = {
      method: 'POST',
      body: payload
    };
    
    const res = new MockResponse((status, data) => {
      const ms = Date.now() - start;
      console.log(`   Status: ${status} | Latency: ${ms}ms`);
      if (status === 200) {
        if (data.reply) console.log(`   Reply (Snippet): ${data.reply.substring(0, 100).replace(/\n/g, ' ')}...`);
        if (data.audio) console.log(`   Audio Data: Base64 string of length ${data.audio.length}`);
        if (data.sources && data.sources.length) console.log(`   Sources attached: ${data.sources.length}`);
      } else {
        console.log(`   Error Output:`, data);
      }
      resolve({ status, data, ms });
    });

    handler(req, res).catch(err => {
      const ms = Date.now() - start;
      console.log(`   Status: 500 (Fatal Error) | Latency: ${ms}ms`);
      console.log(`   Error:`, err.message);
      resolve({ status: 500, error: err.message, ms });
    });
  });
}

async function runAllTests() {
  console.log("=== AUTO-VERIFYING XMANIUS AI TOOLS ===");

  // 1. Text Message Latency (Standard Xmanius 1.5)
  await runTest("Fast Chat Latency (Slot 1)", {
    model: "xmanius-1",
    message: "Say 'hello' in exactly two words."
  });

  // 2. Web Search Grounding
  await runTest("Web Search Grounding (Live News)", {
    model: "xmanius-1",
    message: "What is the latest news today?",
    webSearch: true
  });

  // 3. Deep Research Pro Preview
  await runTest("Deep Topic Analysis", {
    model: "xmanius-1",
    message: "Perform a deep topic analysis on quantum physics."
  });

  // 4. Map Grounding & Live GPS
  await runTest("Map Grounding (Live GPS Locations)", {
    model: "xmanius-1",
    message: "Find coffee shops near me.",
    location: { latitude: 40.7128, longitude: -74.0060, city: "New York" }
  });

  // 5. TTS Voice Generation
  await runTest("TTS Voice Audio Generation", {
    text: "Hello, this is a test of the ultra realistic voice.",
    voice: "Aoede"
  }, ttsHandler);

  console.log("\n✅ ALL TESTS COMPLETED!");
}

runAllTests();
