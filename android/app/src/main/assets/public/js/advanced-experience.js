(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const performanceMode = window.__aarnavPerformanceMode || document.documentElement.dataset.performance || "full";
  const isPhonePerformanceMode = performanceMode === "phone";
  const hasDesktopVideoBackground = document.documentElement.classList.contains("has-background-video");
  window.__aarnavAudioEnergy = 0;

  function initPortfolioGuide() {
    const toggle = document.createElement("button");
    toggle.className = "ai-guide-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Open Ask Aarnav portfolio guide");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<span class="ai-guide-toggle__orb" aria-hidden="true"></span><span>Ask Aarnav</span>';

    const panel = document.createElement("section");
    panel.className = "ai-guide";
    panel.setAttribute("aria-label", "Ask Aarnav portfolio guide");
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
      <div class="ai-guide__dialog" role="dialog" aria-modal="true" aria-label="Ask Aarnav">
        <button class="ai-guide__compact-close" type="button" data-ai-close aria-label="Close Ask Aarnav">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg>
        </button>
        <div class="ai-guide__orb-stage">
          <canvas class="ai-guide__orb" width="600" height="600" aria-hidden="true"></canvas>
          <span class="ai-guide__orb-state">Ready</span>
        </div>
        <p class="ai-guide__voice-greeting">Hi, I am Aarnav's portfolio guide. Ask me about his books, coding, sports, guitar, places, or channels.</p>
        <div class="ai-guide__messages ai-guide__subtitle" aria-live="polite"></div>
        <form class="ai-guide__form">
          <button class="ai-guide__plus" type="button" aria-label="More options" title="More options">+</button>
          <input class="ai-guide__input" type="text" maxlength="180" autocomplete="off" placeholder="Ask anything" aria-label="Question for Ask Aarnav">
          <button class="ai-guide__form-mic" type="button" data-ai-mic aria-label="Ask using voice" title="Ask using voice">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg>
          </button>
          <button class="ai-guide__voice-entry" type="submit" aria-label="Send message" title="Send message">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6M9 6v12M13 4v16M17 7v10M21 9v6"></path></svg>
          </button>
          <div class="ai-guide__dictation" aria-hidden="true">
            <span class="ai-guide__dictation-plus" aria-hidden="true">+</span>
            <span class="ai-guide__waveform" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
            <button type="button" data-ai-dictation-cancel aria-label="Cancel dictation">×</button>
            <button type="button" data-ai-dictation-confirm aria-label="Send dictated message"><span aria-hidden="true">✓</span></button>
          </div>
          <div class="ai-guide__model-picker" aria-label="Model selection">
            <span>Model</span>
            <button type="button" data-ai-model="xmanius-1" aria-pressed="true">
              <strong>Xmanius 1</strong><b aria-hidden="true">✓</b>
            </button>
            <button type="button" class="ai-guide__voice-picker" data-ai-open-voice>
              <strong>Voice chat</strong><span aria-hidden="true">↗</span>
            </button>
          </div>
          <p class="ai-guide__status">Typed questions stay local. Voice recognition is provided by your browser.</p>
        </form>
        <div class="ai-guide__voice-controls">
          <button class="ai-guide__voice-control" type="button" data-ai-close aria-label="Close voice assistant">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg>
          </button>
          <button class="ai-guide__voice-control ai-guide__voice-control--mic" type="button" data-ai-mic aria-label="Start live voice conversation">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg>
          </button>
        </div>
      </div>
    `;

    document.body.append(panel, toggle);

    const messages = panel.querySelector(".ai-guide__messages");
    const input = panel.querySelector(".ai-guide__input");
    const form = panel.querySelector(".ai-guide__form");
    const status = panel.querySelector(".ai-guide__status");
    const orb = panel.querySelector(".ai-guide__orb");
    const orbState = panel.querySelector(".ai-guide__orb-state");
    const micButton = panel.querySelector(".ai-guide__voice-controls [data-ai-mic]");
    const formMicButton = panel.querySelector(".ai-guide__form [data-ai-mic]");
    const dictationCancel = panel.querySelector("[data-ai-dictation-cancel]");
    const dictationConfirm = panel.querySelector("[data-ai-dictation-confirm]");
    const plusButton = panel.querySelector(".ai-guide__plus");
    const modelPicker = panel.querySelector(".ai-guide__model-picker");
    let speechEnabled = true;
    let recognition = null;
    let micPermissionLocked = false;
    let speechTimer = null;
    let speechKeepAlive = null;
    let assistantAudio = null;
    let restoreMusicAfterSpeech = () => {};
    let micStream = null;
    let micAccessPromise = null;
    let isListening = false;
    let liveSession = false;
    let startRecognition = null;
    let startLiveVoiceConversation = null;
    let liveResumeTimer = null;
    let isResponding = false;
    let finalTranscript = "";
    let subtitleAnimationFrame = null;
    let responseLanguage = "en-US";
    let hasConversation = false;
    let activeRequestController = null;
    let dictationMode = false;
    let activeModelLabel = localStorage.getItem("aarnav-ai-model-label") || "Xmanius 1";

    const setModelPicker = (open) => {
      modelPicker.classList.toggle("is-open", open);
      form.classList.toggle("has-model-picker", open);
      plusButton.setAttribute("aria-expanded", String(open));
    };

    modelPicker.querySelector("strong").textContent = activeModelLabel;

    const getGreeting = () => {
      const hour = new Date().getHours();
      const greetings = hour < 12
        ? ["Good morning. What would you like me to do?", "Ready when you are."]
        : hour < 17
          ? ["Greetings! What would you like me to do?", "Ready when you are."]
          : hour < 21
            ? ["Good evening. What would you like me to do?", "Greetings! What would you like to explore?"]
            : ["Good evening. I am ready when you are.", "Ready when you are."];
      return greetings[Math.floor(Math.random() * greetings.length)];
    };

    messages.textContent = "";

    const resumeLiveListening = () => {
      window.clearTimeout(liveResumeTimer);
      if (!liveSession || micPermissionLocked || !panel.classList.contains("is-open")) return;
      liveResumeTimer = window.setTimeout(() => {
        if (liveSession && !isListening && !assistantAudio && !window.speechSynthesis?.speaking) startRecognition?.();
      }, 420);
    };

    const finishResponse = () => {
      isResponding = false;
      if (isListening) {
        setOrbState("listening");
        status.textContent = "Live voice mode is listening.";
      } else {
        setOrbState("ready");
        resumeLiveListening();
      }
    };

    const setOrbState = (nextState) => {
      panel.dataset.voiceState = nextState;
      orbState.textContent = nextState === "listening" ? "Listening" : nextState === "speaking" ? "Responding" : nextState === "thinking" ? "Thinking" : "Ready";
    };

    const initOrb = () => {
      if (!orb) return;
      const context = orb.getContext("2d");
      let responseBlend = 0;
      // Phones draw a deliberately lighter orb. It stays detailed at the
      // larger mobile size without monopolising the browser's render thread.
      const particleCount = isPhonePerformanceMode ? 420 : hasDesktopVideoBackground ? 760 : 1500;
      // Target a high-refresh mobile animation; the browser will naturally
      // cap rendering at the device display's supported refresh rate.
      const phoneFrameInterval = isPhonePerformanceMode ? 1000 / 100 : hasDesktopVideoBackground ? 1000 / 50 : 0;
      let lastPhoneFrame = 0;
      const particles = Array.from({ length: particleCount }, (_, index) => {
        const y = 1 - (index / (particleCount - 1)) * 2;
        const radius = Math.sqrt(1 - y * y);
        const angle = index * 2.3999632297;
        const shell = .78 + Math.random() * .3;
        return {
          x: Math.cos(angle) * radius * shell + (Math.random() - .5) * .09,
          y: y * (.84 + Math.random() * .2) + (Math.random() - .5) * .11,
          z: Math.sin(angle) * radius * shell + (Math.random() - .5) * .09,
          offset: Math.random() * Math.PI * 2,
          drift: .25 + Math.random() * .85,
          float: .3 + Math.random() * 1.1,
          pointSize: .5 + Math.random() * .75,
        };
      });
      const render = (time) => {
        if (document.visibilityState !== "visible") {
          window.setTimeout(() => window.requestAnimationFrame(render), 240);
          return;
        }
        // The orb is invisible until Ask Aarnav opens. Keep only a low-cost
        // heartbeat while it is hidden so the desktop background video gets
        // priority for smooth, continuous playback.
        if (!panel.classList.contains("is-open")) {
          window.setTimeout(() => window.requestAnimationFrame(render), 420);
          return;
        }
        if (phoneFrameInterval && time - lastPhoneFrame < phoneFrameInterval) {
          window.requestAnimationFrame(render);
          return;
        }
        lastPhoneFrame = time;
        const size = orb.width;
        context.clearRect(0, 0, size, size);
        const state = panel.dataset.voiceState || "ready";
        // Ease each visual response in and out so colour, motion, and glow transition together.
        const responseTarget = state === "speaking" ? 1 : 0;
        responseBlend += (responseTarget - responseBlend) * .045;
        const energy = .12 + responseBlend * .52;
        const center = size / 2;
        const speaking = responseBlend > .012;
        if (speaking) {
          const glow = context.createRadialGradient(center, center, 0, center, center, size * .47);
          glow.addColorStop(0, `rgba(255, 213, 91, ${(0.05 + energy * 0.16) * responseBlend})`);
          glow.addColorStop(.52, `rgba(255, 166, 54, ${.12 * responseBlend})`);
          glow.addColorStop(1, "rgba(255, 188, 72, 0)");
          context.fillStyle = glow;
          context.fillRect(0, 0, size, size);
        }
        context.globalCompositeOperation = "lighter";
        const rotation = time * (.00009 + responseBlend * .00023);
        particles.forEach((particle) => {
          const randomX = Math.sin(time * .0017 * particle.drift + particle.offset) * (.035 + energy * .08);
          const randomY = Math.cos(time * .0021 * (1.2 - particle.drift) + particle.offset * 1.7) * (.035 + energy * .08) + Math.sin(time * .0012 * particle.float + particle.offset) * (.055 + energy * .075);
          const x = particle.x * Math.cos(rotation) - particle.z * Math.sin(rotation) + randomX;
          const z = particle.x * Math.sin(rotation) + particle.z * Math.cos(rotation);
          const y = particle.y + randomY;
          const pulse = 1 + Math.sin(time * .003 + particle.offset) * (.018 + energy * .035) + energy * .1;
          const scale = size * .31 * pulse / (2.8 + z);
          context.beginPath();
          const idleRed = z > 0 ? 228 : 74, idleGreen = z > 0 ? 244 : 163, idleBlue = 255;
          const replyRed = z > 0 ? 255 : 218, replyGreen = z > 0 ? 238 : 154, replyBlue = z > 0 ? 151 : 46;
          const red = idleRed + (replyRed - idleRed) * responseBlend;
          const green = idleGreen + (replyGreen - idleGreen) * responseBlend;
          const blue = idleBlue + (replyBlue - idleBlue) * responseBlend;
          context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${0.18 + (z + 1) * 0.15})`;
          context.arc(center + x * scale * 2.3, center + y * scale * 2.3, Math.max(.38, size * .0046 * particle.pointSize / (2.4 + z)), 0, Math.PI * 2);
          context.fill();
        });
        context.globalCompositeOperation = "source-over";
        window.requestAnimationFrame(render);
      };
      window.requestAnimationFrame(render);
    };
    initOrb();
    setOrbState("ready");

    const fallbackBooks = ["Atomic Habits", "Roald Dahl", "Sudha Murty", "Treasure Island", "Sherlock Holmes"];
    const fallbackPlaces = [
      "Havelock Island", "Neil Island", "Rameshwar Temple", "Darbhanga Maharaj Mahal", "Darjeeling", "Eco Park",
      "Marina Beach", "Belur Math", "Dakshineswar Kali Temple", "Victoria Memorial", "Rabindra Sarobar",
      "Writers' Building", "Nicco Park", "Birla Mandir", "Birla Museum", "Kapaleeshwarar Temple", "Snow Kingdom", "Hanuman Tok",
    ];

    const collectTitles = (selector, fallback) => {
      const visible = Array.from(document.querySelectorAll(selector), (heading) => heading.textContent.trim()).filter(Boolean);
      return Array.from(new Set([...fallback, ...visible]));
    };

    const normalizeText = (text) => text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();

    const detectResponseLanguage = (text) => {
      if (/[\u0980-\u09FF]/.test(text)) return "bn-IN";
      if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
      return "en-US";
    };

    const localizeAnswer = (question, englishAnswer) => {
      const language = detectResponseLanguage(question);
      if (language === "hi-IN") {
        if (/किताब|पुस्तक|बुक/.test(question)) return "Aarnav की पोर्टफोलियो में Atomic Habits, Roald Dahl, Sudha Murty, Treasure Island और Sherlock Holmes की किताबें शामिल हैं। पूरी सूची Books पेज पर है।";
        if (/कोड|प्रोग्राम|टेक|वेबसाइट/.test(question)) return "Aarnav को उपयोगी और अच्छे दिखने वाले इंटरफेस, टूल और प्रोजेक्ट बनाना पसंद है। उन्होंने यह वेबसाइट HTML, CSS, JavaScript और AI टूल्स की मदद से बनाई है।";
        if (/खेल|बैडमिंटन|फुटबॉल|बास्केटबॉल/.test(question)) return "Aarnav को फुटबॉल, बास्केटबॉल और बैडमिंटन पसंद हैं। उन्होंने अंडर-15 बैडमिंटन नेशनल्स में भी भाग लिया है।";
        if (/जगह|यात्रा|घूम|स्थान/.test(question)) return "Aarnav की यात्रा यादों में Havelock Island, Neil Island, Darjeeling, Eco Park, Marina Beach और कई मंदिर व कोलकाता की जगहें शामिल हैं।";
        if (/नाम|कौन|उम्र|कहाँ/.test(question)) return "Aarnav Thakur कोलकाता, भारत के 17 वर्षीय छात्र, कोडर, खिलाड़ी और क्रिएटर हैं।";
        return "मैं Aarnav के पोर्टफोलियो की मंजूर जानकारी के आधार पर जवाब दे सकता हूँ। आप किताबों, कोडिंग, खेल, गिटार, यात्रा या चैनलों के बारे में पूछ सकते हैं।";
      }
      if (language === "bn-IN") {
        if (/বই|কিতাব/.test(question)) return "Aarnav-এর পোর্টফোলিওতে Atomic Habits, Roald Dahl, Sudha Murty, Treasure Island এবং Sherlock Holmes-এর বই রয়েছে। সম্পূর্ণ তালিকা Books পেজে আছে।";
        if (/কোড|প্রোগ্রাম|টেক|ওয়েবসাইট/.test(question)) return "Aarnav ব্যবহারযোগ্য ও সুন্দর ইন্টারফেস, টুল এবং প্রজেক্ট তৈরি করতে ভালোবাসে। সে HTML, CSS, JavaScript এবং AI টুল ব্যবহার করে এই ওয়েবসাইটটি তৈরি করেছে।";
        if (/খেলা|ব্যাডমিন্টন|ফুটবল|বাস্কেটবল/.test(question)) return "Aarnav ফুটবল, বাস্কেটবল এবং ব্যাডমিন্টন পছন্দ করে। সে অনূর্ধ্ব-15 ব্যাডমিন্টন ন্যাশনালসেও অংশ নিয়েছে।";
        if (/ভ্রমণ|জায়গা|স্থান|ঘুর/.test(question)) return "Aarnav-এর ভ্রমণের তালিকায় Havelock Island, Neil Island, Darjeeling, Eco Park, Marina Beach এবং আরও কয়েকটি জায়গা রয়েছে।";
        if (/নাম|কে|বয়স|কোথ/.test(question)) return "Aarnav Thakur কলকাতা, ভারতের 17 বছরের ছাত্র, কোডার, খেলোয়াড় এবং ক্রিয়েটর।";
        return "আমি Aarnav-এর পোর্টফোলিওর অনুমোদিত তথ্য থেকে উত্তর দিতে পারি। বই, কোডিং, খেলা, গিটার, ভ্রমণ বা চ্যানেল সম্পর্কে প্রশ্ন করুন।";
      }
      return englishAnswer;
    };

    const assistantVoicePath = (fileName) => `./assets/audio/assistant/${encodeURIComponent(fileName)}`;

    const assistantVoiceClips = [
      {
        match: (text) => text.startsWith("Hello. You can ask me about Aarnav's coding"),
        file: "[E-girl]Hello......nels..mp3",
      },
      {
        match: (text) => text.startsWith("Coding is one of the biggest parts of Aarnav's life"),
        file: "E-girl-2026-06-23-14-32-Coding-is-one-of-the-biggest-parts-of-Aarnav's-l.mp3",
      },
      {
        match: (text) => text.startsWith("The portfolio currently features Atomic Habits"),
        file: "E-girl-2026-06-23-14-32-The-portfolio-currently-features-Atomic-Habits,.mp3",
      },
      {
        match: (text) => text.startsWith("Aarnav's travel wall includes Havelock Island"),
        file: "E-girl-2026-06-23-14-33-Aarnav's-travel-wall-includes-Havelock-Island,-N.mp3",
      },
      {
        match: (text) => text.startsWith("Aarnav created this website using his coding skills"),
        file: "E-girl-2026-06-23-14-34-Aarnav-created-this-website-using-his-coding-ski.mp3",
      },
      {
        match: (text) => text.startsWith("The music button is at the bottom-right corner"),
        file: "E-girl-2026-06-23-14-49-The-music-button-is-at-the-bottom-right-corner-o.mp3",
      },
      {
        match: (text) => text.startsWith("The Instagram button is at the bottom-right corner"),
        file: "E-girl-2026-06-23-14-50-The-Instagram-button-is-at-the-bottom-right-corn.mp3",
      },
      {
        match: (text) => text.startsWith("I can answer like a smart portfolio guide"),
        file: "E-girl-2026-06-23-14-45-I-can-answer-like-a-smart-portfolio-guide-using.mp3",
      },
      {
        match: (text) => text.startsWith("The portfolio identifies Aarnav as 17 years old"),
        file: "E-girl-2026-07-25-12-21-The-portfolio-identifies-Aarnav-as-17-years-old.mp3",
      },
      {
        match: (text) => text.startsWith("Play With Aarnav for guitar and Techno Savvy for"),
        file: "E-girl-2026-07-25-12-20-Play-With-Aarnav-for-guitar-and-Techno-Savvy-for.mp3",
      },
    ];

    const findAssistantVoiceClip = (text) => assistantVoiceClips.find((clip) => clip.match(text));

    const portfolioKnowledge = [
      {
        title: "Aarnav",
        keywords: ["aarnav", "who", "about", "describe", "introduce", "student", "kolkata", "portfolio"],
        answer: "Aarnav Thakur is a Kolkata-based student, coder, builder, athlete, guitarist, learner, and content creator. His portfolio connects his tech work, books, sports, music, travel memories, and online channels.",
      },
      {
        title: "Coding",
        keywords: ["code", "coding", "coder", "program", "developer", "build", "technology", "tech", "project", "projects", "problem", "solve"],
        answer: "Coding is one of the biggest parts of Aarnav's life. He enjoys building useful experiences, turning ideas into demos, solving problems, and learning by making real things.",
      },
      {
        title: "AI tools",
        keywords: ["ai", "chatgpt", "claude", "grok", "codex", "tools", "productivity", "learn", "effort", "time"],
        answer: "Aarnav uses AI tools including ChatGPT, Claude, Grok, and Codex to learn faster, plan ideas, and turn rough concepts into polished work.",
      },
      {
        title: "Website creation",
        keywords: ["website", "site", "portfolio", "made", "make", "created", "create", "built", "build", "designed", "design", "developed", "coded", "html", "css", "javascript", "how did", "how was", "how create", "how built"],
        answer: "Aarnav created this website using his coding skills and AI tools together. He used HTML, CSS, and JavaScript for the structure, style, animations, music controls, pages, and interactions. AI tools helped him improve ideas faster, reduce time and effort, debug issues, and polish the final experience while still keeping his own direction and creativity at the center.",
      },
      {
        title: "Sports",
        keywords: ["sport", "sports", "badminton", "football", "basketball", "nationals", "athlete"],
        answer: "Aarnav enjoys football, basketball, and badminton. His portfolio highlights participation in Badminton Nationals at the U-15 level.",
      },
      {
        title: "Music and guitar",
        keywords: ["guitar", "music", "song", "channel", "cover", "play with aarnav", "rhythm"],
        answer: "Guitar gives Aarnav a creative space for rhythm, patience, and expression. His guitar channel is Play With Aarnav, and featured covers can play inside the portfolio.",
      },
      {
        title: "YouTube",
        keywords: ["youtube", "techno savvy", "video", "creator", "content", "channel"],
        answer: "Aarnav creates content through Techno Savvy and Play With Aarnav. The portfolio contains embedded featured videos and links to both channels.",
      },
      {
        title: "Books",
        keywords: ["book", "books", "read", "reading", "novel", "atomic", "habits", "treasure", "sherlock", "roald", "sudha"],
        answer: () => `The portfolio currently features:\n- ${collectTitles(".book-card h3", fallbackBooks).join("\n- ")}\n\nOpen the Books page for Aarnav's short notes on each one.`,
      },
      {
        title: "Places",
        keywords: ["place", "places", "travel", "visited", "visit", "trip", "island", "temple", "beach", "kolkata", "chennai", "darjeeling"],
        answer: () => `Aarnav's travel wall includes:\n- ${collectTitles(".place-card h3", fallbackPlaces).join("\n- ")}\n\nOpen the Places page to explore the complete photo collection.`,
      },
      {
        title: "Online",
        keywords: ["contact", "find", "instagram", "online", "social", "profile"],
        answer: "Use the Find Me page or the Instagram button to reach Aarnav's approved public profiles.",
      },
      {
        title: "Portfolio pages",
        keywords: ["pages", "page", "sections", "section", "portfolio has", "portfolio include", "website contain", "website sections"],
        answer: "The portfolio has Home, Interests, Books, Places, and Find Me pages. Together they cover Aarnav's profile, skills, reading, travel memories, and approved public links.",
      },
      {
        title: "Creator channels",
        keywords: ["play with aarnav", "techno savvy", "creator channel", "guitar channel", "tech channel", "channel names"],
        answer: "Play With Aarnav for guitar and Techno Savvy for tech and creator content. Both channels are linked from the portfolio.",
      },
    ];

    const scoreKnowledge = (query) => {
      // Question words should not make a general question look like a portfolio topic.
      const ignoredTokens = new Set(["how", "what", "when", "where", "why", "who", "are", "you", "the", "and", "for", "with", "from", "about", "can", "did", "does", "this", "that"]);
      const queryTokens = new Set(query.split(/\s+/).filter((token) => token.length > 2 && !ignoredTokens.has(token)));
      return portfolioKnowledge
        .map((item) => {
          const score = item.keywords.reduce((total, keyword) => {
            const normalizedKeyword = normalizeText(keyword);
            if (query.includes(normalizedKeyword)) return total + normalizedKeyword.split(" ").length + 2;
            return total + normalizedKeyword.split(" ").filter((token) => !ignoredTokens.has(token) && queryTokens.has(token)).length;
          }, 0);
          return { ...item, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);
    };

    const resolveKnowledgeAnswer = (item) => typeof item.answer === "function" ? item.answer() : item.answer;

    const thinkThroughQuestion = (question, query) => {
      const matches = scoreKnowledge(query);
      if (!matches.length) return "";

      const wantsSummary = /\b(summary|summarize|tell me about|explain|overview|details|detail|everything|all about)\b/.test(query);
      const wantsSuggestion = /\b(suggest|recommend|should|best|start|first|explore)\b/.test(query);
      const topMatches = matches.slice(0, wantsSummary ? 3 : 2);
      const answer = topMatches.map(resolveKnowledgeAnswer).join(" ");

      if (wantsSuggestion) {
        return `${answer} A good place to start is the ${topMatches[0].title === "Places" ? "Places" : topMatches[0].title === "Books" ? "Books" : "Interests"} page, because it shows this topic most clearly.`;
      }

      return answer;
    };

    const getNavigationAnswer = (query) => {
      const asksForFinding = /\b(where|find|open|go|reach|navigate|navigation|menu|page|pages|button|buttons|click|tab|section)\b/.test(query);
      if (!asksForFinding) return "";

      if (/\b(music|song|audio|pause|play|playlist|queue)\b/.test(query)) {
        return "The music button is at the bottom-right corner of the website. Click it once to play or pause music, and click again while it is active to open the music queue and choose a song.";
      }
      if (/\b(instagram|insta|social|profile)\b/.test(query)) {
        return "The Instagram button is at the bottom-right corner of the website, near the music button. Click it to open Aarnav's Instagram profile.";
      }
      if (/\b(book|books|reading|novel)\b/.test(query)) {
        return "To find the Books page, use the top navigation bar and click Books. On the Home page, you can also use Open Books Page or Find More Books to see the full book collection.";
      }
      if (/\b(place|places|travel|visited|trip|island|temple|beach)\b/.test(query)) {
        return "To find the Places page, use the top navigation bar and click Places. On the Home page, the Open Places Page button also takes you to the complete places gallery.";
      }
      if (/\b(interest|interests|skill|skills|coding|sports|guitar|music)\b/.test(query)) {
        return "To find interests, click Interests in the top navigation bar. That page contains coding, sports, guitar, content creation, and learning sections.";
      }
      if (/\b(find me|contact|online)\b/.test(query)) {
        return "To find Aarnav online, click Find Me in the top navigation bar. You can also use the Instagram icon at the bottom-right of the website.";
      }
      if (/\b(home|front|main|start)\b/.test(query)) {
        return "To return to the main page, click Home in the top navigation bar. The Home page has the hero intro, quick buttons, and preview tiles.";
      }
      if (/\b(theme|dark|light|moon|mode)\b/.test(query)) {
        return "The light and dark mode switch is at the extreme top-right of the navigation bar. Click the moon or sun toggle to change the website theme.";
      }
      if (/\b(ask|assistant|aarnav|ai|chatbot|chat bot)\b/.test(query)) {
        return "The Ask Aarnav assistant button is at the bottom-left corner. Open it to ask about Aarnav's books, places, coding, sports, guitar, channels, or where things are on the site.";
      }
      if (/\b(youtube|video|cover|channel|techno savvy|play with)\b/.test(query)) {
        return "YouTube and guitar videos are inside the Interests page. Open Interests, then scroll to the music and guitar sections to play featured clips inside the portfolio.";
      }
      if (/\b(nav|navigation|menu|tab|page|pages|button|buttons|blog)\b/.test(query)) {
        return "Use the top navigation bar for Home, Interests, Books, Places, and Find Me. The theme switch is at the top-right, the music and Instagram buttons are at the bottom-right, and Ask Aarnav is at the bottom-left.";
      }

      return "";
    };

    const answerQuestion = (question) => {
      const personalRequest = /\b(aarnav|arnav|he|him|his|you)\b/.test(question.toLowerCase())
        && /\b(address|home address|phone|telephone|mobile number|email|password|private|personal|family|parents|school address|exact location|relationship|girlfriend|boyfriend|financial|bank|medical|health record|identity document)\b/.test(question.toLowerCase());
      if (personalRequest) {
        return "I can't answer private personal details. I can only analyze information that Aarnav has approved and provided on this website.";
      }

      const sensitiveRequest = /\b(hate|hateful|racist|racial slur|kill|murder|bomb|weapon|porn|sexual|explicit|abuse|harass)\b/.test(question.toLowerCase());
      if (sensitiveRequest) {
        return "I can't help create hateful, abusive, or explicit content. I can discuss the topic in a respectful, educational, and safe way.";
      }

      // Check arithmetic before punctuation is removed from the natural-language query.
      const arithmetic = question.trim().match(/^(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)[?!.,]*$/);
      if (arithmetic) {
        const left = Number(arithmetic[1]);
        const right = Number(arithmetic[3]);
        const operator = arithmetic[2];
        if (operator === "+") return `${left} + ${right} = ${left + right}.`;
        if (operator === "-") return `${left} - ${right} = ${left - right}.`;
        if (operator === "*") return `${left} x ${right} = ${left * right}.`;
        if (operator === "/") return right === 0 ? "Division by zero is undefined." : `${left} / ${right} = ${left / right}.`;
      }

      const query = normalizeText(question);
      const navigationAnswer = getNavigationAnswer(query);
      const thoughtAnswer = thinkThroughQuestion(question, query);

      // Keep everyday conversation useful even when the visitor is viewing the
      // static GitHub Pages copy, where the private Vercel API is unavailable.

      if (/\b(hello|hi|hey|namaste)\b/.test(query)) {
        if (/\b(aarnav|arnav)\b/.test(query) && /\b(how|who|what|where|is|about)\b/.test(query)) {
          return "Aarnav Thakur is a 17-year-old student and creator based in Kolkata, India. He is interested in coding, AI tools, sports, guitar, books, travel, and building digital experiences.";
        }
        return "Hello. You can ask me about Aarnav's coding, sports, books, music, travels, AI tools, or online channels.";
      }
      if (/\b(bye|goodbye|see you|see ya|take care)\b/.test(query)) {
        return "Goodbye. Thanks for visiting Aarnav's portfolio. Come back anytime.";
      }
      if (/\b(how are you|are you fine|are you okay|how do you do)\b/.test(query)) {
        return "I am doing well, thank you. What would you like to explore or ask about?";
      }
      if (/\b(who are you|your name|what are you)\b/.test(query)) {
        return "I am Ask Aarnav, Aarnav Thakur's portfolio guide. I can help with normal questions as well as information and navigation for this website.";
      }
      if (/\b(thanks|thank you|thx)\b/.test(query)) {
        return "You are welcome. What would you like to ask next?";
      }
      if (/\b(good morning|good afternoon|good evening|good night)\b/.test(query)) {
        return "Hello. I hope you are doing well. What would you like to explore?";
      }
      if (/\b(what can you do|help me|can you help)\b/.test(query)) {
        return "I can answer everyday questions, help you explore Aarnav's portfolio, and guide you to the right pages, buttons, books, places, interests, and channels.";
      }
      if (/\b(how|what)\b.*\b(website|site|portfolio)\b.*\b(create|created|made|make|built|build|design|designed|develop|developed|code|coded)\b|\b(website|site|portfolio)\b.*\b(how|made|created|built)\b/.test(query)) {
        return resolveKnowledgeAnswer(portfolioKnowledge.find((item) => item.title === "Website creation"));
      }
      if (/\b(channel|channels)\b/.test(query) && /\b(what|which|name|names|are)\b/.test(query)) {
        return resolveKnowledgeAnswer(portfolioKnowledge.find((item) => item.title === "Creator channels"));
      }
      if (navigationAnswer) {
        return navigationAnswer;
      }
      if (/\b(age|old)\b/.test(query)) {
        return "The portfolio identifies Aarnav as 17 years old.";
      }
      if (/\b(where|location|live|from|city)\b/.test(query)) {
        return "Aarnav is a student based in Kolkata, India.";
      }
      if (thoughtAnswer) {
        return thoughtAnswer;
      }
      return "I am ready to help with general questions, explanations, ideas, and Aarnav's approved portfolio information.";
    };

    const addFormattedAnswer = (container, text) => {
      const lines = text.replace(/\r/g, "").split("\n");
      let list = null;

      const addParagraph = (value) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = value;
        container.append(paragraph);
      };

      lines.forEach((rawLine) => {
        const line = rawLine.trim();
        const bullet = line.match(/^[-*]\s+(.+)/);
        const numbered = line.match(/^\d+[.)]\s+(.+)/);

        if (bullet || numbered) {
          const ordered = Boolean(numbered);
          if (!list || list.tagName !== (ordered ? "OL" : "UL")) {
            list = document.createElement(ordered ? "ol" : "ul");
            container.append(list);
          }
          const item = document.createElement("li");
          item.textContent = (bullet || numbered)[1];
          list.append(item);
          return;
        }

        list = null;
        if (!line) return;
        if (/^#{1,3}\s+/.test(line)) {
          const heading = document.createElement("strong");
          heading.className = "ai-message__heading";
          heading.textContent = line.replace(/^#{1,3}\s+/, "");
          container.append(heading);
          return;
        }
        addParagraph(line);
      });

      if (!container.childElementCount) addParagraph(text);
    };

    const addMessage = (text, fromUser = false, { animate = false } = {}) => {
      messages.classList.remove("is-user-question");
      window.cancelAnimationFrame(subtitleAnimationFrame);
      if (fromUser && !hasConversation) {
        messages.replaceChildren();
        messages.dataset.greeting = "false";
        hasConversation = true;
        panel.classList.add("has-conversation");
      }
      const message = document.createElement("article");
      message.className = `ai-message ${fromUser ? "ai-message--user" : "ai-message--assistant"}`;

      if (fromUser) message.textContent = text;
      messages.append(message);
      messages.scrollTop = messages.scrollHeight;

      if (fromUser || !animate) {
        if (!fromUser) addFormattedAnswer(message, text);
        return;
      }

      // Keep the response readable without adding several seconds after the
      // network request has already completed.
      const duration = Math.min(Math.max(text.length * 5, 260), 2400);
      const startedAt = performance.now();
      const typeReply = (now) => {
        const progress = Math.min((now - startedAt) / duration, 1);
        message.textContent = text.slice(0, Math.floor(text.length * progress));
        messages.scrollTop = messages.scrollHeight;
        if (progress < 1) {
          subtitleAnimationFrame = window.requestAnimationFrame(typeReply);
          return;
        }
        message.textContent = "";
        addFormattedAnswer(message, text);
        messages.scrollTop = messages.scrollHeight;
      };
      subtitleAnimationFrame = window.requestAnimationFrame(typeReply);
    };

    const addThinkingMessage = () => {
      const message = document.createElement("article");
      message.className = "ai-message ai-message--assistant ai-message--thinking";
      message.setAttribute("role", "status");
      message.innerHTML = "<span>Thinking</span><i></i><i></i><i></i>";
      messages.append(message);
      messages.scrollTop = messages.scrollHeight;
      return message;
    };

    addMessage(getGreeting());
    messages.dataset.greeting = "true";

    const resetTextChat = () => {
      hasConversation = false;
      panel.classList.remove("has-conversation");
      messages.replaceChildren();
      messages.dataset.greeting = "true";
      addMessage(getGreeting());
    };

    const pickVoice = (preferredLanguage = "en-US") => {
      const voices = window.speechSynthesis?.getVoices?.() || [];
      const languageRoot = preferredLanguage.split("-")[0];
      const languageVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith(languageRoot.toLowerCase()));
      if (languageRoot !== "en" && languageVoice) return languageVoice;
      const jarvisStylePattern = /(microsoft.*(david|guy|mark|ryan|george|thomas)|google.*(uk english male|us english)|english.*male|natural.*male|online.*male|neural.*male|david|guy|mark|ryan|george|thomas)/i;
      const naturalVoicePattern = /(google|microsoft|natural|online|neural|aria|jenny|guy|david|mark|ryan|george|thomas|sonia|zira)/i;
      return voices.find((voice) => voice.lang.startsWith("en") && jarvisStylePattern.test(voice.name))
        || voices.find((voice) => voice.lang.startsWith("en") && naturalVoicePattern.test(voice.name))
        || voices.find((voice) => voice.lang === "en-IN")
        || voices.find((voice) => voice.lang === "en-GB")
        || voices.find((voice) => voice.lang === "en-US")
        || voices.find((voice) => voice.lang.startsWith("en"))
        || voices[0]
        || null;
    };

    const stopSpeaking = () => {
      setOrbState("ready");
      if (speechTimer) {
        window.clearTimeout(speechTimer);
        speechTimer = null;
      }
      if (speechKeepAlive) {
        window.clearInterval(speechKeepAlive);
        speechKeepAlive = null;
      }
      if (assistantAudio) {
        assistantAudio.pause();
        assistantAudio.currentTime = 0;
        assistantAudio = null;
      }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      restoreMusicAfterSpeech();
    };

    const splitSpeechText = (text) => {
      const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
      const chunks = [];
      let current = "";
      sentences.forEach((sentence) => {
        const next = `${current} ${sentence}`.trim();
        if (next.length > 155 && current) {
          chunks.push(current);
          current = sentence.trim();
        } else {
          current = next;
        }
      });
      if (current) chunks.push(current);
      return chunks;
    };

    const speak = (text) => {
      if (!speechEnabled) return;
      stopSpeaking();
      const music = document.querySelector("#bgm");
      const originalMusicVolume = music?.volume ?? 0.26;
      restoreMusicAfterSpeech = () => {
        if (music) music.volume = originalMusicVolume;
        restoreMusicAfterSpeech = () => {};
      };
      if (music && !music.paused) music.volume = Math.min(originalMusicVolume, 0.055);

      const voiceClip = findAssistantVoiceClip(text);
      if (voiceClip) {
        setOrbState("speaking");
        assistantAudio = new Audio(assistantVoicePath(voiceClip.file));
        assistantAudio.volume = 1;
        assistantAudio.addEventListener("ended", () => {
          restoreMusicAfterSpeech();
          assistantAudio = null;
          finishResponse();
        }, { once: true });
        assistantAudio.addEventListener("error", () => {
          restoreMusicAfterSpeech();
          assistantAudio = null;
          speakWithBrowserVoice(text);
        }, { once: true });
        assistantAudio.play().catch(() => {
          restoreMusicAfterSpeech();
          assistantAudio = null;
          speakWithBrowserVoice(text);
        });
        return;
      }

      speakWithBrowserVoice(text);
    };

    const speakWithBrowserVoice = (text) => {
      if (!("speechSynthesis" in window)) {
        status.textContent = "Spoken replies are not supported in this browser.";
        return;
      }
      const chunks = splitSpeechText(text);
      setOrbState("speaking");
      let index = 0;
      const speakNextChunk = () => {
        if (!speechEnabled || index >= chunks.length) {
          stopSpeaking();
          finishResponse();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.lang = responseLanguage;
        utterance.rate = 0.82;
        utterance.pitch = 0.72;
        utterance.volume = 1;
        utterance.voice = pickVoice(responseLanguage);
        utterance.addEventListener("end", () => {
          index += 1;
          if (index < chunks.length) speechTimer = window.setTimeout(speakNextChunk, 80);
          else { stopSpeaking(); finishResponse(); }
        }, { once: true });
        utterance.addEventListener("error", () => {
          index += 1;
          if (index < chunks.length) speechTimer = window.setTimeout(speakNextChunk, 120);
          else { stopSpeaking(); finishResponse(); }
        }, { once: true });
        window.speechSynthesis.speak(utterance);
        window.speechSynthesis.resume();
      };

      speechKeepAlive = window.setInterval(() => {
        if ("speechSynthesis" in window && window.speechSynthesis.speaking) window.speechSynthesis.resume();
      }, 900);
      speechTimer = window.setTimeout(speakNextChunk, 90);
    };

    const askGeminiBackend = async (question) => {
      activeRequestController = new AbortController();
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        activeRequestController.abort();
      }, 15000);
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: question }),
          signal: activeRequestController.signal,
        });
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error("The online AI service returned an invalid response.");
        }
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || "Chatbot request failed.");
          error.status = response.status;
          throw error;
        }
        return data.reply;
      } catch (error) {
        if (timedOut) {
          const timeoutError = new Error("Gemini took too long to respond.");
          timeoutError.status = 504;
          throw timeoutError;
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const setSubmitState = (isThinking) => {
      const submit = form.querySelector(".ai-guide__voice-entry");
      submit?.classList.toggle("is-thinking", isThinking);
      submit?.setAttribute("aria-label", isThinking ? "Stop response" : "Send message");
      submit?.setAttribute("title", isThinking ? "Stop response" : "Send message");
      if (submit) submit.innerHTML = isThinking
        ? '<span class="ai-guide__stop-icon" aria-hidden="true"></span>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>';
      if (submit) submit.dataset.stopResponse = String(isThinking);
    };

    const dailyQuotaKey = "aarnav-gemini-daily-usage";
    const dailyQuotaLimit = 20;
    const getDailyQuota = () => {
      const today = new Date().toISOString().slice(0, 10);
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(dailyQuotaKey) || "null");
      } catch {
        localStorage.removeItem(dailyQuotaKey);
      }
      return saved?.date === today ? saved : { date: today, count: 0 };
    };
    const showQuotaNotice = () => {
      const notice = document.createElement("div");
      notice.className = "ai-quota-notice";
      notice.innerHTML = "<strong>Daily AI limit reached</strong><p>Ask Aarnav's free AI usage is finished for today. It will be available again tomorrow.</p><button type=\"button\">Close</button>";
      document.body.append(notice);
      notice.querySelector("button").addEventListener("click", () => notice.remove());
    };

    const ask = async (question, { useVoice = false } = {}) => {
      const cleanQuestion = question.trim();
      if (!cleanQuestion) return;
      const isVoiceMode = panel.classList.contains("is-voice-mode");
      if (!isVoiceMode) addMessage(cleanQuestion, true);
      input.value = "";
      status.textContent = "Thinking...";
      setOrbState("thinking");
      responseLanguage = detectResponseLanguage(cleanQuestion);
      const localAnswer = answerQuestion(cleanQuestion);
      const localFallback = "I am ready to help with general questions, explanations, ideas, and Aarnav's approved portfolio information.";
      let answer = localAnswer;
      setSubmitState(true);

      if (localAnswer === localFallback) {
        const thinkingMessage = addThinkingMessage();
        const quota = getDailyQuota();
        if (quota.count >= dailyQuotaLimit) {
          thinkingMessage.remove();
          showQuotaNotice();
          answer = "Today's free AI question limit has been reached. Please try again tomorrow.";
          if (!isVoiceMode) addMessage(answer, false, { animate: true });
          setOrbState("ready");
          status.textContent = "Daily AI limit reached.";
          setSubmitState(false);
          return;
        }
        try {
          answer = await askGeminiBackend(cleanQuestion);
          quota.count += 1;
          localStorage.setItem(dailyQuotaKey, JSON.stringify(quota));
        } catch (error) {
          if (error.name === "AbortError") {
            thinkingMessage.remove();
            setSubmitState(false);
            setOrbState("ready");
            status.textContent = "Response stopped.";
            return;
          }
          if (error.status === 429) {
            showQuotaNotice();
            answer = "Today's free AI question limit has been reached. Please try again tomorrow.";
          } else if (error.status === 504) {
            answer = "Gemini is taking too long to respond. Please try the question again.";
          } else {
            answer = "I can help with general questions and Aarnav's approved portfolio information. Please open the Vercel deployment for Gemini-powered answers beyond the built-in guide.";
          }
        }
        thinkingMessage.remove();
      }

      answer = localizeAnswer(cleanQuestion, answer);
      if (!isVoiceMode) addMessage(answer, false, { animate: true });
      if (useVoice) speak(answer);
      else setOrbState("ready");
      status.textContent = "Typed questions stay local. Voice recognition is provided by your browser.";
      activeRequestController = null;
      setSubmitState(false);
    };

    const setOpen = (open) => {
      panel.classList.toggle("is-open", open);
      panel.classList.remove("is-voice-mode");
      panel.setAttribute("aria-hidden", String(!open));
      toggle.setAttribute("aria-expanded", String(open));
      if (open) resetTextChat();
      if (!open && "speechSynthesis" in window) {
        liveSession = false;
        window.clearTimeout(liveResumeTimer);
        recognition?.abort();
        stopSpeaking();
      }
    };

    const openVoiceMode = () => {
      panel.classList.add("is-voice-mode");
      setOrbState("ready");
    };

    toggle.addEventListener("click", () => setOpen(!panel.classList.contains("is-open")));
    panel.querySelectorAll("[data-ai-close]").forEach((closeButton) => closeButton.addEventListener("click", () => {
      liveSession = false;
      window.clearTimeout(liveResumeTimer);
      recognition?.abort();
      setOpen(false);
    }));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      setModelPicker(false);
      ask(input.value);
    });
    plusButton.addEventListener("click", () => setModelPicker(!modelPicker.classList.contains("is-open")));
    modelPicker.addEventListener("click", (event) => {
      const model = event.target.closest("[data-ai-model]");
      if (!model) return;
      activeModelLabel = "Xmanius 1";
      localStorage.setItem("aarnav-ai-model-label", activeModelLabel);
      modelPicker.querySelector("strong").textContent = activeModelLabel;
      status.textContent = `${activeModelLabel} is selected.`;
      setModelPicker(false);
      input.focus();
    });
    modelPicker.querySelector("[data-ai-open-voice]").addEventListener("click", () => {
      setModelPicker(false);
      openVoiceMode();
      startLiveVoiceConversation?.();
    });
    panel.querySelectorAll(".ai-suggestion").forEach((button) => {
      button.addEventListener("click", () => ask(button.textContent));
    });
    panel.querySelector(".ai-guide__voice-entry").addEventListener("click", (event) => {
      if (event.currentTarget.dataset.stopResponse === "true") {
        event.preventDefault();
        activeRequestController?.abort();
        return;
      }
    });

    if ("speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    }

    const requestMicAccess = () => {
      if (micStream) return Promise.resolve(micStream);
      if (micAccessPromise) return micAccessPromise;
      if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error("Microphone access is unavailable."));
      micAccessPromise = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        micStream = stream;
        status.textContent = "Microphone ready. You can ask another question whenever you like.";
        return stream;
      }).catch((error) => {
        micAccessPromise = null;
        throw error;
      });
      return micAccessPromise;
    };

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      startRecognition = () => {
        if (!liveSession || isListening) return;
        if (!recognition) {
          recognition = new SpeechRecognition();
          recognition.lang = "en-IN";
          recognition.interimResults = true;
          recognition.continuous = true;
          recognition.maxAlternatives = 1;
          recognition.addEventListener("start", () => {
            isListening = true;
            micButton.classList.add("is-active");
            formMicButton?.classList.add("is-active");
            form.classList.add("is-listening");
            if (!isResponding) setOrbState("listening");
            status.textContent = "Live voice mode is listening.";
          });
          recognition.addEventListener("result", (event) => {
            if (isResponding) return;
            let interim = "";
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
              const text = event.results[index][0].transcript;
              if (event.results[index].isFinal) finalTranscript += text;
              else interim += text;
            }
            const visibleText = (finalTranscript || interim).trim();
            input.value = visibleText;
            if (finalTranscript.trim()) {
              const question = finalTranscript.trim();
              finalTranscript = "";
              if (panel.classList.contains("is-voice-mode")) {
                isResponding = true;
                speechEnabled = true;
                ask(question, { useVoice: true });
              } else if (dictationMode) {
                input.value = question;
                status.textContent = "Listening. Tap the check button to send.";
              } else {
                // The regular chat microphone only transcribes into its input.
                input.value = question;
                liveSession = false;
                recognition?.stop();
                status.textContent = "Voice typed into the question box. Press Enter when you are ready.";
              }
            }
          });
          recognition.addEventListener("end", () => {
            isListening = false;
            micButton.classList.remove("is-active");
            formMicButton?.classList.remove("is-active");
            form.classList.remove("is-listening");
            if (!isResponding) setOrbState("ready");
            if (!isResponding) resumeLiveListening();
          });
          recognition.addEventListener("error", (event) => {
            isListening = false;
            micButton.classList.remove("is-active");
            formMicButton?.classList.remove("is-active");
            form.classList.remove("is-listening");
            if (!isResponding) setOrbState("ready");
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
              micPermissionLocked = true;
              liveSession = false;
              status.textContent = "The browser blocked microphone access. Change the browser permission, then refresh once.";
            } else if (event.error !== "aborted" && event.error !== "no-speech") status.textContent = "Voice input paused. I will keep the live session ready.";
          });
        }
        try {
          recognition.start();
        } catch {
          isListening = false;
          micButton.classList.remove("is-active");
          formMicButton?.classList.remove("is-active");
          form.classList.remove("is-listening");
          setOrbState("ready");
          status.textContent = "Voice input is already starting. Please try again in a moment.";
        }
      };
      startLiveVoiceConversation = () => {
        if (liveSession) {
          liveSession = false;
          window.clearTimeout(liveResumeTimer);
          recognition?.abort();
          stopSpeaking();
          micButton.classList.remove("is-active");
          formMicButton?.classList.remove("is-active");
          form.classList.remove("is-listening");
          micButton.setAttribute("aria-label", "Start live voice conversation");
          status.textContent = "Live voice mode stopped.";
          return;
        }
        if (micPermissionLocked) {
          status.textContent = "Microphone access was blocked by the browser. Refresh only if you want to change that choice.";
          return;
        }
        liveSession = true;
        micButton.classList.add("is-active");
        formMicButton?.classList.add("is-active");
        micButton.setAttribute("aria-label", "Stop live voice conversation");
        // Start directly from the tap. Android Chrome handles the permission
        // prompt for SpeechRecognition more reliably than a second getUserMedia
        // request made immediately before it.
        startRecognition();
      };
      micButton.addEventListener("click", startLiveVoiceConversation);
      formMicButton?.addEventListener("click", () => {
        if (micPermissionLocked) {
          status.textContent = "Microphone access was blocked by the browser. Refresh only if you want to change that choice.";
          return;
        }
        dictationMode = true;
        liveSession = true;
        startRecognition();
      });
      dictationCancel?.addEventListener("click", () => {
        dictationMode = false;
        liveSession = false;
        finalTranscript = "";
        input.value = "";
        recognition?.abort();
        form.classList.remove("is-listening");
        status.textContent = "Dictation cancelled.";
      });
      dictationConfirm?.addEventListener("click", () => {
        const dictatedQuestion = input.value.trim();
        dictationMode = false;
        liveSession = false;
        recognition?.stop();
        form.classList.remove("is-listening");
        if (dictatedQuestion) ask(dictatedQuestion);
      });
    } else {
      micButton.disabled = true;
      micButton.title = "Voice input is not supported in this browser";
      micButton.setAttribute("aria-label", "Voice input unavailable");
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
      if (event.ctrlKey && event.key === "/") {
        event.preventDefault();
        setOpen(true);
      }
    });
  }

  function initAudioReactiveEnvironment() {
    const audio = document.querySelector("#bgm");
    if (!audio || prefersReducedMotion) return;

    const trackProfiles = [
      { hue: "255, 190, 130", secondHue: "196, 112, 178", accentHue: "123, 232, 255", tempo: 0.82, depth: 0.6 },
      { hue: "70, 232, 255", secondHue: "109, 166, 255", accentHue: "239, 201, 120", tempo: 1.22, depth: 0.72 },
      { hue: "109, 166, 255", secondHue: "74, 101, 198", accentHue: "123, 232, 255", tempo: 0.72, depth: 0.52 },
      { hue: "239, 201, 120", secondHue: "255, 156, 92", accentHue: "123, 232, 255", tempo: 0.94, depth: 0.64 },
      { hue: "114, 255, 188", secondHue: "70, 232, 255", accentHue: "179, 139, 255", tempo: 1.08, depth: 0.58 },
    ];
    let activeTrackProfile = trackProfiles[window.__aarnavAudioTrack?.index ?? Number.parseInt(localStorage.getItem("aarnav-bgm-track") || "0", 10)] || trackProfiles[0];
    let frame = null;
    let energy = 0;
    let bass = 0;
    let lastAudioFrame = 0;
    // The video already supplies continuous background motion on desktop, so
    // music ambience can update smoothly at a lighter rate without competing
    // with video decoding and compositing.
    const audioFrameInterval = isPhonePerformanceMode ? 1000 / 12 : hasDesktopVideoBackground ? 1000 / 24 : 1000 / 60;

    const syncTrackProfile = () => {
      const trackIndex = window.__aarnavAudioTrack?.index ?? Number.parseInt(localStorage.getItem("aarnav-bgm-track") || "0", 10);
      activeTrackProfile = trackProfiles[Number.isInteger(trackIndex) ? trackIndex : 0] || trackProfiles[0];
      document.documentElement.style.setProperty("--audio-primary-rgb", activeTrackProfile.hue);
      document.documentElement.style.setProperty("--audio-secondary-rgb", activeTrackProfile.secondHue);
      document.documentElement.style.setProperty("--audio-accent-rgb", activeTrackProfile.accentHue);
    };

    const drawAudioReaction = (now = 0) => {
      frame = null;
      if (now - lastAudioFrame < audioFrameInterval) {
        frame = window.requestAnimationFrame(drawAudioReaction);
        return;
      }
      lastAudioFrame = now;
      let nextEnergy = 0;
      let nextBass = 0;

      if (!audio.paused) {
        const playbackTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        const tempo = activeTrackProfile.tempo;
        const depth = activeTrackProfile.depth;
        nextEnergy = 0.08 + Math.abs(Math.sin(playbackTime * tempo * 1.18)) * 0.055 * depth + Math.abs(Math.sin(playbackTime * tempo * 0.31)) * 0.035;
        nextBass = 0.07 + Math.abs(Math.sin(playbackTime * tempo * 1.72)) * 0.07 * depth;
      }

      energy += (nextEnergy - energy) * 0.12;
      bass += (nextBass - bass) * 0.14;
      window.__aarnavAudioEnergy = energy;
      document.documentElement.style.setProperty("--audio-energy", energy.toFixed(3));
      document.documentElement.style.setProperty("--audio-bass", bass.toFixed(3));
      document.documentElement.style.setProperty("--audio-saturate", (1 + energy * 0.18).toFixed(3));
      document.documentElement.style.setProperty("--audio-glow-size", `${(12 + bass * 36).toFixed(1)}px`);
      document.documentElement.style.setProperty("--audio-glow-alpha", (0.035 + energy * 0.11).toFixed(3));
      document.documentElement.style.setProperty("--audio-cyan-alpha", (0.025 + energy * 0.075).toFixed(3));
      document.documentElement.style.setProperty("--audio-pink-alpha", (0.018 + bass * 0.06).toFixed(3));
      document.documentElement.style.setProperty("--audio-gold-alpha", (0.018 + bass * 0.055).toFixed(3));
      document.documentElement.style.setProperty("--audio-aurora-opacity", (0.2 + energy * 0.12).toFixed(3));
      document.documentElement.style.setProperty("--audio-ambient-brightness", (1 + energy * 0.12).toFixed(3));
      document.body.classList.toggle("audio-reactive", energy > 0.018);

      if (!audio.paused || energy > 0.004 || bass > 0.004) {
        frame = window.requestAnimationFrame(drawAudioReaction);
      }
    };

    audio.addEventListener("play", () => {
      syncTrackProfile();
      if (!frame) frame = window.requestAnimationFrame(drawAudioReaction);
    });
    audio.addEventListener("pause", () => {
      if (!frame) frame = window.requestAnimationFrame(drawAudioReaction);
    });
    window.addEventListener("aarnav:audio-track-change", syncTrackProfile);
    syncTrackProfile();
    if (!audio.paused) frame = window.requestAnimationFrame(drawAudioReaction);
  }

  function initReactiveGuitar() {
    const guitarSection = document.querySelector("#guitar");
    const split = guitarSection?.querySelector(".media-split");
    if (!guitarSection || !split) return;

    const stage = document.createElement("article");
    stage.className = "reactive-guitar-stage";
    stage.innerHTML = `
      <div class="reactive-guitar-scene" aria-label="Interactive audio-reactive acoustic guitar">
        <div class="reactive-guitar-model">
          <svg viewBox="0 0 360 620" role="img" aria-label="Stylized acoustic guitar">
            <defs>
              <linearGradient id="guitarWood" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#ffd88a"/>
                <stop offset="0.35" stop-color="#c9792d"/>
                <stop offset="0.72" stop-color="#7d351c"/>
                <stop offset="1" stop-color="#351317"/>
              </linearGradient>
              <linearGradient id="guitarNeck" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#321418"/>
                <stop offset="0.5" stop-color="#7e422c"/>
                <stop offset="1" stop-color="#251017"/>
              </linearGradient>
              <radialGradient id="guitarShine" cx="34%" cy="24%" r="74%">
                <stop offset="0" stop-color="#fff" stop-opacity=".45"/>
                <stop offset=".35" stop-color="#ffc66c" stop-opacity=".12"/>
                <stop offset="1" stop-color="#000" stop-opacity=".28"/>
              </radialGradient>
              <filter id="guitarGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="8" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <ellipse cx="180" cy="570" rx="108" ry="18" fill="#000" opacity=".28"/>
            <path d="M155 85 160 277h40l5-192Z" fill="url(#guitarNeck)" stroke="#efc978" stroke-opacity=".25"/>
            <path d="M151 30q29-25 58 0l-5 78h-48Z" fill="#35161d" stroke="#efc978" stroke-opacity=".3"/>
            <g fill="#e8c17a"><circle cx="151" cy="48" r="6"/><circle cx="209" cy="48" r="6"/><circle cx="151" cy="72" r="6"/><circle cx="209" cy="72" r="6"/><circle cx="151" cy="96" r="6"/><circle cx="209" cy="96" r="6"/></g>
            <g stroke="#d8a968" stroke-opacity=".46" stroke-width="2">
              <path d="M158 132h44M158 164h44M159 196h42M159 228h42M160 260h40"/>
            </g>
            <path d="M180 245C122 216 79 249 78 309c-1 43 30 67 27 107-5 65 22 126 75 137 53-11 80-72 75-137-3-40 28-64 27-107-1-60-44-93-102-64Z" fill="url(#guitarWood)" stroke="#efc978" stroke-width="3"/>
            <path d="M180 245C122 216 79 249 78 309c-1 43 30 67 27 107-5 65 22 126 75 137 53-11 80-72 75-137-3-40 28-64 27-107-1-60-44-93-102-64Z" fill="url(#guitarShine)"/>
            <circle cx="180" cy="350" r="48" fill="#1b0d13" stroke="#efc978" stroke-width="5"/>
            <circle cx="180" cy="350" r="36" fill="#05060b" filter="url(#guitarGlow)" opacity=".9"/>
            <path d="M139 458q41-18 82 0v18h-82Z" fill="#2a1117" stroke="#efc978" stroke-opacity=".38"/>
            <g class="reactive-guitar-strings" stroke="#fff3c7" stroke-width="1.2">
              <path class="reactive-guitar-string" d="M173 38 173 466"/>
              <path class="reactive-guitar-string" d="M176 38 176 466"/>
              <path class="reactive-guitar-string" d="M179 38 179 466"/>
              <path class="reactive-guitar-string" d="M182 38 182 466"/>
              <path class="reactive-guitar-string" d="M185 38 185 466"/>
              <path class="reactive-guitar-string" d="M188 38 188 466"/>
            </g>
          </svg>
        </div>
      </div>
      <div class="reactive-guitar-copy">
        <span class="section-kicker">Audio-reactive instrument</span>
        <h3>The music now has a physical pulse.</h3>
        <p>Move your pointer over the guitar to change its depth. Start the background music and its strings, light, stars, and surrounding atmosphere respond to the sound.</p>
        <div class="reactive-guitar-meter" aria-hidden="true">${Array.from({ length: 12 }, () => "<span></span>").join("")}</div>
        <div class="reactive-guitar-note">Lightweight SVG depth, designed to stay smooth without a heavy 3D engine.</div>
      </div>
    `;
    split.insertAdjacentElement("beforebegin", stage);

    const model = stage.querySelector(".reactive-guitar-model");
    stage.addEventListener("pointermove", (event) => {
      if (prefersReducedMotion) return;
      const rect = stage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      model.style.setProperty("--guitar-ry", `${(x * 24).toFixed(2)}deg`);
      model.style.setProperty("--guitar-rx", `${(-y * 13).toFixed(2)}deg`);
    }, { passive: true });
    stage.addEventListener("pointerleave", () => {
      model.style.setProperty("--guitar-ry", "-12deg");
      model.style.setProperty("--guitar-rx", "3deg");
    });
  }

  function initTravelGlobe() {
    if (!window.location.pathname.endsWith("places.html")) return;
    const pageHero = document.querySelector(".page-hero");
    if (!pageHero) return;

    const locations = [
      ["Havelock Island", 11.98, 92.99, "Andaman island beaches and clear water."],
      ["Neil Island", 11.83, 93.05, "A quieter Andaman island rhythm."],
      ["Rameshwar Temple", 9.29, 79.31, "Historic corridors in Rameswaram."],
      ["Darbhanga Maharaj Mahal", 26.15, 85.9, "Royal character and Mithila history."],
      ["Darjeeling", 27.04, 88.26, "Tea gardens, mist, and Himalayan views."],
      ["Eco Park", 22.6, 88.47, "A modern green escape in New Town."],
      ["Marina Beach", 13.05, 80.28, "Chennai's wide Bay of Bengal coastline."],
      ["Belur Math", 22.63, 88.35, "Peaceful architecture beside the Hooghly."],
      ["Dakshineswar Kali Temple", 22.65, 88.36, "A landmark of Bengal temple architecture."],
      ["Victoria Memorial", 22.54, 88.34, "White marble, lawns, and Kolkata history."],
      ["Rabindra Sarobar", 22.51, 88.36, "A calm lakeside walk in South Kolkata."],
      ["Writers' Building", 22.57, 88.35, "A bold historic facade in B.B.D. Bagh."],
      ["Nicco Park", 22.57, 88.42, "A playful amusement-park memory."],
      ["Birla Mandir", 22.53, 88.36, "Detailed marble and a calm evening glow."],
      ["Birla Museum", 22.53, 88.36, "Hands-on science and technology exhibits."],
      ["Kapaleeshwarar Temple", 13.03, 80.27, "A colourful gopuram in Mylapore."],
      ["Snow Kingdom", 12.83, 80.23, "An indoor snow experience in Chennai."],
      ["Hanuman Tok", 27.35, 88.63, "A peaceful hilltop with mountain views."],
    ].map(([name, lat, lon, detail]) => ({ name, lat: lat * Math.PI / 180, lon: lon * Math.PI / 180, detail }));

    const section = document.createElement("section");
    section.className = "travel-globe-section";
    section.dataset.reveal = "";
    section.innerHTML = `
      <div class="travel-globe-wrap">
        <canvas class="travel-globe" aria-label="Interactive globe showing places visited by Aarnav" role="img"></canvas>
      </div>
      <div class="travel-globe-copy">
        <span class="section-kicker">Interactive travel map</span>
        <h2>Drag the world. Find the memories.</h2>
        <p>Rotate the globe and select a glowing marker. Closely grouped Kolkata and Chennai memories appear together at this scale.</p>
        <div class="globe-legend">Visited location</div>
        <div class="globe-location" aria-live="polite">
          <span>Selected memory</span>
          <strong>India travel collection</strong>
          <p>Drag the globe or select a marker to explore.</p>
        </div>
      </div>
    `;
    pageHero.insertAdjacentElement("afterend", section);

    const canvas = section.querySelector(".travel-globe");
    const context = canvas.getContext("2d");
    const locationCard = section.querySelector(".globe-location");
    let size = 0;
    let rotation = 78 * Math.PI / 180;
    let tilt = 18 * Math.PI / 180;
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let projectedMarkers = [];
    let hoveredLocation = null;
    let selectedLocation = null;

    const project = (lat, lon, radius, center) => {
      const relativeLon = lon - rotation;
      const cosLat = Math.cos(lat);
      const x = cosLat * Math.sin(relativeLon);
      const y = Math.sin(lat) * Math.cos(tilt) - cosLat * Math.cos(relativeLon) * Math.sin(tilt);
      const z = Math.sin(lat) * Math.sin(tilt) + cosLat * Math.cos(relativeLon) * Math.cos(tilt);
      return { x: center + x * radius, y: center - y * radius, z };
    };

    const resize = () => {
      size = Math.max(280, canvas.clientWidth || 570);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (prefersReducedMotion) draw();
    };

    const drawGraticule = (radius, center, isLight) => {
      context.strokeStyle = isLight ? "rgba(20, 47, 82, 0.13)" : "rgba(123, 232, 255, 0.13)";
      context.lineWidth = 0.75;
      const drawCurve = (points) => {
        context.beginPath();
        let drawing = false;
        points.forEach(({ lat, lon }) => {
          const point = project(lat, lon, radius, center);
          if (point.z <= 0) {
            drawing = false;
            return;
          }
          if (!drawing) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
          drawing = true;
        });
        context.stroke();
      };

      for (let latitude = -60; latitude <= 60; latitude += 30) {
        const lat = latitude * Math.PI / 180;
        drawCurve(Array.from({ length: 73 }, (_, index) => ({ lat, lon: (-180 + index * 5) * Math.PI / 180 })));
      }
      for (let longitude = -150; longitude <= 180; longitude += 30) {
        const lon = longitude * Math.PI / 180;
        drawCurve(Array.from({ length: 37 }, (_, index) => ({ lat: (-90 + index * 5) * Math.PI / 180, lon })));
      }
    };

    const draw = () => {
      context.clearRect(0, 0, size, size);
      const center = size / 2;
      const radius = size * 0.405;
      const isLight = document.documentElement.dataset.theme === "light";
      const ocean = context.createRadialGradient(center - radius * 0.34, center - radius * 0.38, radius * 0.08, center, center, radius);
      if (isLight) {
        ocean.addColorStop(0, "rgba(240, 252, 255, 0.98)");
        ocean.addColorStop(0.52, "rgba(118, 194, 224, 0.9)");
        ocean.addColorStop(1, "rgba(35, 92, 151, 0.94)");
      } else {
        ocean.addColorStop(0, "rgba(105, 217, 255, 0.78)");
        ocean.addColorStop(0.5, "rgba(26, 78, 139, 0.88)");
        ocean.addColorStop(1, "rgba(7, 17, 48, 0.98)");
      }
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.fillStyle = ocean;
      context.shadowBlur = 46;
      context.shadowColor = isLight ? "rgba(40, 95, 199, 0.28)" : "rgba(70, 232, 255, 0.36)";
      context.fill();
      context.shadowBlur = 0;

      context.save();
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.clip();
      drawGraticule(radius, center, isLight);
      context.restore();

      projectedMarkers = locations
        .map((location) => ({ location, ...project(location.lat, location.lon, radius, center) }))
        .filter((marker) => marker.z > 0.02)
        .sort((a, b) => a.z - b.z);

      projectedMarkers.forEach((marker) => {
        const active = marker.location === selectedLocation || marker.location === hoveredLocation;
        const markerRadius = active ? 6.5 : 4.2;
        context.beginPath();
        context.arc(marker.x, marker.y, markerRadius + (active ? 4 : 2), 0, Math.PI * 2);
        context.fillStyle = active ? "rgba(239, 201, 120, 0.2)" : "rgba(123, 232, 255, 0.12)";
        context.fill();
        context.beginPath();
        context.arc(marker.x, marker.y, markerRadius, 0, Math.PI * 2);
        context.fillStyle = active ? "#fff1bb" : "#efc978";
        context.shadowBlur = active ? 24 : 14;
        context.shadowColor = "rgba(239, 201, 120, 0.9)";
        context.fill();
        context.shadowBlur = 0;
      });
    };

    const selectLocation = (location) => {
      selectedLocation = location;
      locationCard.innerHTML = `<span>Selected memory</span><strong>${location.name}</strong><p>${location.detail}</p>`;
      draw();
    };

    const markerAt = (x, y) => {
      let closest = null;
      let closestDistance = 18;
      projectedMarkers.forEach((marker) => {
        const distance = Math.hypot(marker.x - x, marker.y - y);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = marker.location;
        }
      });
      return closest;
    };

    canvas.addEventListener("pointerdown", (event) => {
      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (dragging) {
        const deltaX = event.clientX - lastX;
        const deltaY = event.clientY - lastY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 2) moved = true;
        rotation -= deltaX * 0.006;
        tilt = clamp(tilt + deltaY * 0.004, -0.9, 0.9);
        lastX = event.clientX;
        lastY = event.clientY;
        draw();
      } else {
        hoveredLocation = markerAt(x, y);
        canvas.style.cursor = hoveredLocation ? "pointer" : "grab";
        draw();
      }
    });
    canvas.addEventListener("pointerup", (event) => {
      dragging = false;
      canvas.releasePointerCapture(event.pointerId);
      if (!moved) {
        const rect = canvas.getBoundingClientRect();
        const location = markerAt(event.clientX - rect.left, event.clientY - rect.top);
        if (location) selectLocation(location);
      }
    });
    canvas.addEventListener("pointerleave", () => {
      hoveredLocation = null;
      if (!dragging) draw();
    });

    const animate = () => {
      if (!dragging && document.visibilityState === "visible") rotation += 0.00075;
      draw();
      window.requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resize);
    resize();
    if (prefersReducedMotion) draw();
    else animate();
  }

  async function initWebGpuAmbient() {
    // The desktop background video replaces this full-screen GPU pass.
    if (prefersReducedMotion || isPhonePerformanceMode || document.documentElement.classList.contains("has-background-video") || !navigator.gpu) return;
    const canvas = document.createElement("canvas");
    canvas.className = "gpu-ambient";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);

    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
      if (!adapter) throw new Error("No WebGPU adapter");
      const device = await adapter.requestDevice();
      const context = canvas.getContext("webgpu");
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: "premultiplied" });

      const shader = device.createShaderModule({ code: `
        struct Uniforms { time: f32, energy: f32, light: f32, aspect: f32 }
        @group(0) @binding(0) var<uniform> u: Uniforms;

        struct Output {
          @builtin(position) position: vec4f,
          @location(0) uv: vec2f,
        }

        @vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Output {
          var positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
          var output: Output;
          output.position = vec4f(positions[index], 0.0, 1.0);
          output.uv = positions[index] * 0.5 + vec2f(0.5);
          return output;
        }

        @fragment fn fragmentMain(input: Output) -> @location(0) vec4f {
          var p = input.uv - vec2f(0.5);
          p.x *= u.aspect;
          let waveA = sin(p.x * 5.0 + u.time * 0.22) * 0.13;
          let waveB = cos(p.y * 6.0 - u.time * 0.18) * 0.11;
          let glowA = exp(-7.0 * length(p - vec2f(-0.34 + waveB, -0.12 + waveA)));
          let glowB = exp(-6.5 * length(p - vec2f(0.39 - waveA, 0.18 + waveB)));
          let pulse = 0.72 + u.energy * 1.7;
          let darkA = vec3f(0.09, 0.52, 0.72);
          let darkB = vec3f(0.58, 0.22, 0.66);
          let lightA = vec3f(0.18, 0.48, 0.74);
          let lightB = vec3f(0.64, 0.35, 0.58);
          let colorA = mix(darkA, lightA, u.light);
          let colorB = mix(darkB, lightB, u.light);
          let color = (colorA * glowA + colorB * glowB) * pulse;
          let alpha = clamp((glowA + glowB) * (0.11 + u.energy * 0.14), 0.0, 0.32);
          return vec4f(color * alpha, alpha);
        }
      ` });

      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: shader, entryPoint: "vertexMain" },
        fragment: { module: shader, entryPoint: "fragmentMain", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
      const uniformBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });

      const resize = () => {
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
        canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      };

      let lastRender = 0;
      const renderInterval = 1000 / 60;
      const render = (now) => {
        if (now - lastRender < renderInterval) {
          window.requestAnimationFrame(render);
          return;
        }
        lastRender = now;
        const light = document.documentElement.dataset.theme === "light" ? 1 : 0;
        const uniforms = new Float32Array([now * 0.001, window.__aarnavAudioEnergy || 0, light, canvas.width / canvas.height]);
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          }],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
        window.requestAnimationFrame(render);
      };

      document.documentElement.classList.add("has-webgpu-ambient");
      window.addEventListener("resize", resize);
      resize();
      window.requestAnimationFrame(render);
    } catch {
      canvas.remove();
    }
  }

  initPortfolioGuide();
  initAudioReactiveEnvironment();
  initWebGpuAmbient();
})();
