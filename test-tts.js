const https = require('https');

const apiKey = process.env.GEMINI_API_KEY || "YOUR_API_KEY_HERE";
// We will just read it from the .env if we can, or just mock it. Wait, I can read Xmanius's .env!
require('fs').readFile('.env', 'utf8', (err, data) => {
  let key = apiKey;
  if (!err) {
    const match = data.match(/XMANIUS_GEMINI_API_KEY=([^\r\n]+)/);
    if (match) key = match[1];
  }
  
  if (key === "YOUR_API_KEY_HERE") {
    console.log("No API key found to test.");
    return;
  }

  const payload = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: "Hello world" }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Aoede" }
        }
      }
    }
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: '/v1alpha/models/gemini-2.5-flash:generateContent?key=' + key,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  };

  const req = https.request(options, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => console.log("Status:", res.statusCode, "Body:", raw.substring(0, 500)));
  });
  req.write(payload);
  req.end();
});
