/**
 * XManius Live Multimodal Voice & Vision Interface
 * Exact match to user screenshots (media_1788282358872.png, media_1788282389081.png, media_1788282408013.png, media_1788282470279.png):
 * - Desktop layout: Mounts inside chat-main so left sidebar remains visible and dark
 * - Dynamic mixing watercolor clouds:
 *     * Procedural multi-layer fluid cloud swirling & blending inside the crisp circular sphere
 *     * Living vapor and organic shape morphing between radiant white and vivid sky-blue
 *     * Responds smoothly to speech audio volume
 * - Bottom pill bar:
 *     * "+" button toggles attachment popup ("📎 Add files", "📚 Add from library")
 *     * Instant typing: Inline input field is always active so users can type directly without pressing "+"
 *     * Mic toggle & Solid white circle with black "✕" close button
 * - Spoken dialogue:
 *     * Speaks completely naturally like a human friend
 *     * Strips all formatting, numbers, bullet lists, markdown, and summary tags
 * - Barge-in interruption detection (AI stops speaking when user speaks)
 */

(function () {
  'use strict';

  let voiceModalEl = null;
  let canvasEl = null;
  let canvasCtx = null;
  let animFrameId = 0;

  // Preload base texture for granular watercolor fiber details
  const orbTextureImg = new Image();
  orbTextureImg.src = 'assets/xmanius-voice-orb.png?v=20260901-cropped';
  let orbImgLoaded = false;
  orbTextureImg.onload = () => { orbImgLoaded = true; };

  let audioCtx = null;
  let analyser = null;
  let mediaStream = null;
  let videoStream = null;
  let recognition = null;

  let isListening = false;
  let isAiSpeaking = false;
  let isMuted = false;
  let isCameraActive = false;
  let isMenuOpen = false;
  let isAttachPopupOpen = false;
  let isProcessingQuery = false;
  let attachedFiles = [];

  let audioPhase = 0;
  let smoothVolume = 0;

  // ─── Dynamic Mixing Cloud Parameters ───────────────────────────────────────
  const cloudLobes = [
    { baseAngle: 0.2,  radiusRatio: 0.38, speed: 0.012, sizeRatio: 0.52, color: 'rgba(2, 132, 199, ' },
    { baseAngle: 1.8,  radiusRatio: 0.44, speed: -0.015, sizeRatio: 0.58, color: 'rgba(14, 165, 233, ' },
    { baseAngle: 3.4,  radiusRatio: 0.35, speed: 0.018, sizeRatio: 0.48, color: 'rgba(56, 189, 248, ' },
    { baseAngle: 4.9,  radiusRatio: 0.42, speed: -0.011, sizeRatio: 0.62, color: 'rgba(0, 102, 204, ' },
    { baseAngle: 1.1,  radiusRatio: 0.28, speed: 0.022, sizeRatio: 0.44, color: 'rgba(255, 255, 255, ' },
    { baseAngle: 2.7,  radiusRatio: 0.32, speed: -0.019, sizeRatio: 0.46, color: 'rgba(240, 249, 255, ' },
    { baseAngle: 5.6,  radiusRatio: 0.26, speed: 0.016, sizeRatio: 0.40, color: 'rgba(186, 230, 253, ' }
  ];

  // ─── Dynamic Watercolor Cloud Sphere Rendering (Exact Carbon Copy) ────────
  function drawDynamicCloudSphere(volumeLevel) {
    if (!canvasCtx || !canvasEl) return;
    const W = canvasEl.width;
    const H = canvasEl.height;
    const cx = W / 2;
    const cy = H / 2;

    smoothVolume += (volumeLevel - smoothVolume) * 0.18;

    const baseR = Math.min(W, H) * 0.44;
    const pulse = smoothVolume * 8 + Math.sin(audioPhase * 1.2) * 2;
    const R = Math.max(10, baseR + pulse);

    canvasCtx.clearRect(0, 0, W, H);

    // ── 1. Circular Clip for Crisp Edge ──
    canvasCtx.save();
    canvasCtx.beginPath();
    canvasCtx.arc(cx, cy, R, 0, Math.PI * 2);
    canvasCtx.clip();

    // ── 2. Render Exact Carbon Copy Cloud Artwork ──
    if (orbImgLoaded && orbTextureImg.naturalWidth > 0) {
      // Draw exact high-resolution cropped artwork at 100% full opacity
      canvasCtx.drawImage(orbTextureImg, cx - R, cy - R, R * 2, R * 2);

      // ── Dynamic Watercolor Cloud Mixing Inside the Sphere ──
      // Layer 1: Luminous white vapor cloud drifting across upper/mid clouds
      const shiftX1 = Math.cos(audioPhase * 0.45) * (R * 0.10);
      const shiftY1 = Math.sin(audioPhase * 0.35) * (R * 0.08);
      const vapor1 = canvasCtx.createRadialGradient(
        cx + shiftX1, cy - R * 0.15 + shiftY1, 0,
        cx, cy, R * 0.95
      );
      const alpha1 = 0.16 + Math.sin(audioPhase * 1.2) * 0.05 + smoothVolume * 0.16;
      vapor1.addColorStop(0.00, `rgba(255, 255, 255, ${Math.min(0.45, alpha1)})`);
      vapor1.addColorStop(0.40, 'rgba(240, 249, 255, 0.07)');
      vapor1.addColorStop(1.00, 'rgba(2, 132, 199, 0.00)');
      canvasCtx.fillStyle = vapor1;
      canvasCtx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // Layer 2: Vivid azure sky-blue cloud mixing plume across mid/lower clouds
      const shiftX2 = Math.sin(audioPhase * 0.40) * (R * 0.09);
      const shiftY2 = Math.cos(audioPhase * 0.50) * (R * 0.07);
      const vapor2 = canvasCtx.createRadialGradient(
        cx + shiftX2, cy + R * 0.20 + shiftY2, 0,
        cx, cy + R * 0.20, R * 0.80
      );
      const alpha2 = 0.14 + Math.cos(audioPhase * 0.9) * 0.04 + smoothVolume * 0.12;
      vapor2.addColorStop(0.00, `rgba(14, 165, 233, ${Math.min(0.38, alpha2)})`);
      vapor2.addColorStop(0.55, 'rgba(2, 132, 199, 0.06)');
      vapor2.addColorStop(1.00, 'rgba(0, 102, 204, 0.00)');
      canvasCtx.fillStyle = vapor2;
      canvasCtx.fillRect(cx - R, cy - R, R * 2, R * 2);
    } else {
      // Fallback base gradient
      const baseGrad = canvasCtx.createLinearGradient(cx, cy - R, cx, cy + R);
      baseGrad.addColorStop(0.00, '#ffffff');
      baseGrad.addColorStop(0.25, '#f0f9ff');
      baseGrad.addColorStop(0.50, '#bae6fd');
      baseGrad.addColorStop(0.78, '#0284c7');
      baseGrad.addColorStop(1.00, '#0052cc');
      canvasCtx.fillStyle = baseGrad;
      canvasCtx.fillRect(cx - R, cy - R, R * 2, R * 2);
    }

    canvasCtx.restore();

    const speedBoost = isAiSpeaking ? 0.038 : (smoothVolume > 0.05 ? 0.026 : 0.015);
    audioPhase += speedBoost;
  }

  // ─── Render Loop ────────────────────────────────────────────────────────────
  function renderLoop() {
    let volume = 0;
    if (analyser && isListening && !isMuted) {
      const dataArray = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      volume = Math.min(1, rms * 5.5);

      // Barge-in: stop AI speech when user talks
      if (isAiSpeaking && volume > 0.16) {
        stopAiSpeech();
      }
    } else if (isAiSpeaking) {
      volume = 0.28 + Math.sin(audioPhase * 3) * 0.12;
    }

    drawDynamicCloudSphere(volume);
    animFrameId = requestAnimationFrame(renderLoop);
  }

  let voiceHistory = [];

  let currentAiAudio = null;
  let audioQueue = [];
  let isAudioPlaying = false;
  let abortController = null;

  // ─── AI Speech (Natural Human Conversational Synthesis) ─────────────────────
  function stopAiSpeech() {
    audioQueue = [];
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (currentAiAudio) {
      currentAiAudio.pause();
      currentAiAudio.currentTime = 0;
      currentAiAudio = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isAiSpeaking = false;
    isAudioPlaying = false;
  }

  // Sanitize text so AI talks completely like a real human in conversation
  function sanitizeForVoice(text) {
    if (!text) return '';
    let clean = String(text)
      .replace(/\[\[ANSWER_SUMMARY\]\][\s\S]*?\[\[\/ANSWER_SUMMARY\]\]/gi, '')
      .replace(/\[\[ANSWER_SUMMARY\]\][^\n]*/gi, '')
      .replace(/\[\[\/ANSWER_SUMMARY\]\]/gi, '')
      .replace(/\[\[[\s\S]*?\]\]/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[-*•+]\s+/gm, '')
      .replace(/^\d+[\.\)]\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/^>\s*/gm, '')
      .replace(/---+/g, '')
      .replace(/===+/g, '')
      .replace(/&/g, ' and ')
      .replace(/%/g, ' percent')
      .replace(/\+/g, ' plus ')
      .replace(/=/g, ' equals ')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return clean;
  }

  async function playNextAudioChunk() {
    if (audioQueue.length === 0) {
      isAudioPlaying = false;
      isAiSpeaking = false;
      return;
    }
    
    isAudioPlaying = true;
    isAiSpeaking = true;
    const audioSrc = audioQueue.shift();
    
    currentAiAudio = new Audio(audioSrc);
    currentAiAudio.onended = () => {
      // Small pause between sentences
      setTimeout(playNextAudioChunk, 80);
    };
    currentAiAudio.onerror = () => {
      playNextAudioChunk();
    };
    
    try {
      await currentAiAudio.play();
    } catch (e) {
      playNextAudioChunk();
    }
  }

  async function speakText(rawText) {
    stopAiSpeech();

    const clean = sanitizeForVoice(rawText);
    if (!clean) return;
    
    const selectedVoice = window.localStorage.getItem('xmanius_tts_voice') || 'Aoede';
    
    // Split into sentences so the first audio plays almost instantly
    const phrases = clean.match(/[^.!?\n]+[.!?\n]+|\s*[^.!?\n]+$/g) || [clean];
    abortController = new AbortController();
    const signal = abortController.signal;

    let ttsUrl = '/api/xmanius-tts';
    if (typeof window.XmaniusApiEndpoint === 'function') {
      const ep = window.XmaniusApiEndpoint();
      if (ep.includes('/api/xmanius-chat')) {
        ttsUrl = ep.replace('/api/xmanius-chat', '/api/xmanius-tts');
      }
    }

    // Process phrases sequentially but play them as soon as they are ready
    for (let i = 0; i < phrases.length; i++) {
      if (signal.aborted) break;
      const phrase = phrases[i].trim();
      if (!phrase) continue;

      if (selectedVoice.startsWith('Browser_')) {
        playBrowserFallback(phrase, selectedVoice);
        continue;
      }

      try {
        const response = await fetch(ttsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: phrase, voice: selectedVoice }),
          signal
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.audio) {
            const audioSrc = `data:${data.mimeType || 'audio/wav'};base64,${data.audio}`;
            audioQueue.push(audioSrc);
            
            // Start playback immediately if not already playing
            if (!isAudioPlaying) {
              playNextAudioChunk();
            }
          }
        } else {
          console.warn("High-quality TTS chunk failed:", await response.text());
          playBrowserFallback(phrase, selectedVoice);
        }
      } catch (err) {
        if (err.name === 'AbortError') break;
        console.warn("TTS network error:", err);
        playBrowserFallback(phrase, selectedVoice);
      }
    }
  }

  function playBrowserFallback(phrase, voiceName) {
    const fb = new SpeechSynthesisUtterance(phrase);
    
    const voices = window.speechSynthesis.getVoices() || [];
    const isUK = /UK/i.test(voiceName);
    const isMale = /Male/i.test(voiceName) || ['Charon', 'Fenrir', 'Puck', 'Pegasus'].includes(voiceName);

    const ukPool = voices.filter(v => v.lang && (/en[-_](gb|uk)|united kingdom/i.test(v.lang) || /uk|british|english \(united kingdom\)/i.test(v.name || "")));
    const usPool = voices.filter(v => v.lang && (/en[-_]us|united states/i.test(v.lang) || /us|united states/i.test(v.name || "")));
    const langPool = isUK ? (ukPool.length ? ukPool : voices) : (usPool.length ? usPool : voices);

    const maleKeywords = ['male', 'george', 'oliver', 'david', 'mark', 'guy', 'ryan', 'stefan', 'james', 'richard', 'daniel', 'standard-b', 'standard-c', 'standard-d', 'standard-j'];
    const femaleKeywords = ['female', 'hazel', 'susan', 'zira', 'jenny', 'sonia', 'aria', 'catherine', 'standard-a', 'standard-e', 'standard-f', 'standard-g'];

    const targetKeywords = isMale ? maleKeywords : femaleKeywords;
    const avoidKeywords = isMale ? femaleKeywords : maleKeywords;

    let matchedVoice = null;
    for (const v of langPool) {
      const name = (v.name || "").toLowerCase();
      if (targetKeywords.some(kw => name.includes(kw)) && !avoidKeywords.some(kw => name.includes(kw))) {
        matchedVoice = v;
        break;
      }
    }

    if (!matchedVoice) {
      for (const v of langPool) {
        const name = (v.name || "").toLowerCase();
        if (targetKeywords.some(kw => name.includes(kw))) {
          matchedVoice = v;
          break;
        }
      }
    }

    fb.voice = matchedVoice || langPool[0] || voices[0] || null;
    
    // Explicitly modulate pitch and speed per profile so every voice sounds noticeably distinct
    if (voiceName === 'UK_Male') {
      fb.pitch = 0.76;
      fb.rate = 0.93;
    } else if (voiceName === 'UK_Female') {
      fb.pitch = 1.22;
      fb.rate = 0.94;
    } else if (voiceName === 'US_Male') {
      fb.pitch = 0.84;
      fb.rate = 0.98;
    } else if (voiceName === 'US_Female') {
      fb.pitch = 1.14;
      fb.rate = 1.00;
    } else if (voiceName === 'Charon') {
      fb.pitch = 0.65;
      fb.rate = 0.88;
    } else if (voiceName === 'Fenrir') {
      fb.pitch = 0.82;
      fb.rate = 1.05;
    } else if (voiceName === 'Puck') {
      fb.pitch = 1.08;
      fb.rate = 1.12;
    } else if (voiceName === 'Pegasus') {
      fb.pitch = 0.72;
      fb.rate = 0.96;
    } else if (voiceName === 'Aoede') {
      fb.pitch = 1.18;
      fb.rate = 1.02;
    } else if (voiceName === 'Kore') {
      fb.pitch = 0.94;
      fb.rate = 0.92;
    } else if (voiceName === 'Zephyr') {
      fb.pitch = 1.30;
      fb.rate = 0.90;
    } else if (isMale) {
      fb.pitch = 0.80;
      fb.rate = 0.96;
    } else {
      fb.pitch = 1.15;
      fb.rate = 1.00;
    }
    
    window.speechSynthesis.speak(fb);
  }

  // ─── Camera Management ──────────────────────────────────────────────────────
  async function toggleCamera() {
    const videoEl = document.getElementById('xmanius-live-video');
    const container = document.getElementById('xmanius-camera-container');
    if (!videoEl || !container) return;

    if (isCameraActive) {
      if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
      videoEl.srcObject = null;
      container.style.display = 'none';
      isCameraActive = false;
      showStatus('Camera turned off');
    } else {
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoEl.srcObject = videoStream;
        container.style.display = 'block';
        isCameraActive = true;
        showStatus('Live Camera active');
      } catch (err) {
        console.error('Camera access failed', err);
        showStatus('Unable to access camera.');
      }
    }
  }

  function captureCameraFrame() {
    const videoEl = document.getElementById('xmanius-live-video');
    if (!videoEl || !isCameraActive || !videoStream) return null;
    try {
      const snap = document.createElement('canvas');
      const maxDim = 640;
      let w = videoEl.videoWidth || 640;
      let h = videoEl.videoHeight || 480;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      snap.width = w;
      snap.height = h;
      const ctx = snap.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, w, h);
      return snap.toDataURL('image/jpeg', 0.72);
    } catch (e) {
      console.warn('Frame capture error:', e);
      return null;
    }
  }

  // ─── Status / Toast ─────────────────────────────────────────────────────────
  function showStatus(msg) {
    const el = document.getElementById('xmanius-live-status');
    if (!el) return;
    if (!msg) {
      el.classList.remove('is-visible');
      return;
    }
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      if (el.textContent === msg) el.classList.remove('is-visible');
    }, 3200);
  }

  // ─── API Call: Multi-Turn Voice / Text → AI → Spoken Speech ──────────────────
  async function handleUserVoiceQuery(queryText) {
    if (!queryText || !queryText.trim() || isProcessingQuery) return;
    isProcessingQuery = true;

    stopAiSpeech();
    showStatus('Thinking…');

    const endpoint = (typeof window.XmaniusApiEndpoint === 'function')
      ? window.XmaniusApiEndpoint()
      : '/api/xmanius-chat';

    // Capture camera snapshot to give AI vision context if camera is active
    const cameraFrame = isCameraActive ? captureCameraFrame() : null;
    const attachments = [...attachedFiles];
    if (cameraFrame) {
      attachments.push({
        name: 'live_camera_view.jpg',
        mimeType: 'image/jpeg',
        data: cameraFrame
      });
    }

    const promptMessage = queryText.trim();

    // Maintain multi-turn voice context
    voiceHistory.push({ role: 'user', text: promptMessage });

    // Only trigger search engine and GPS location when query actually requires live facts / local search
    const needsWebSearch = /\b(weather|news|near\s+me|nearby|closest|find|search|dominos?|pizza|restaurant|food|today|current|price|who\s+is|where\s+is|when\s+is|latest|location|salon|store|shop|hospital)\b/i.test(promptMessage);

    let userLocation = null;
    if (needsWebSearch && navigator.geolocation) {
      try {
        userLocation = await new Promise((resolve) => {
          const t = setTimeout(() => resolve(null), 300);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(t);
              const tz = Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || "";
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                timezone: tz
              });
            },
            () => { clearTimeout(t); resolve(null); },
            { enableHighAccuracy: false, timeout: 300, maximumAge: 600000 }
          );
        });
      } catch {}
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: promptMessage,
          model: "xmanius-2",
          attachments,
          thinkMode: false,
          webSearch: needsWebSearch,
          location: userLocation,
          mode: 'live_voice',
          voice: true,
          history: voiceHistory.slice(-8)
        })
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.reply || data.answer || 'Got it.';
        voiceHistory.push({ role: 'model', text: reply });
        showStatus('');
        attachedFiles = [];
        speakText(reply);
      } else {
        showStatus('Could not reach AI. Try again.');
        speakText("Hmm... I couldn't complete that request. Please try again.");
      }
    } catch (err) {
      console.error('[XManius Voice] API error:', err);
      showStatus('Connection error.');
      speakText('Connection error. Please check your network.');
    } finally {
      isProcessingQuery = false;
    }
  }

  // ─── Microphone & Audio Context ─────────────────────────────────────────────
  async function startAudioSession(userTriggered = false) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (userTriggered) showStatus('Microphone not supported in this browser.');
        return false;
      }

      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });

      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        const source = audioCtx.createMediaStreamSource(mediaStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
      }

      isListening = true;
      isMuted = false;
      updateMicButtonState();
      startSpeechRecognition();
      showStatus('');
      return true;
    } catch (err) {
      console.warn('[XManius Voice] Microphone init:', err);
      isListening = false;
      updateMicButtonState();
      if (userTriggered) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          showStatus('Allow microphone access in browser settings.');
        } else if (err.name === 'NotFoundError') {
          showStatus('No microphone found.');
        } else {
          showStatus('Could not start microphone.');
        }
      }
      return false;
    }
  }

  function updateMicButtonState() {
    const micBtn = document.getElementById('xmanius-live-mic-btn');
    if (!micBtn) return;
    const activeIcon = document.getElementById('mic-icon-active');
    const mutedIcon  = document.getElementById('mic-icon-muted');

    const shouldShowMuted = isMuted || !isListening;
    micBtn.classList.toggle('is-muted', shouldShowMuted);
    if (activeIcon) activeIcon.style.display = shouldShowMuted ? 'none' : 'block';
    if (mutedIcon)  mutedIcon.style.display  = shouldShowMuted ? 'block' : 'none';
  }

  // ─── Speech Recognition ─────────────────────────────────────────────────────
  function startSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      return;
    }

    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }

    recognition = new SpeechRec();
    recognition.continuous    = true;
    recognition.interimResults = false;
    recognition.lang          = navigator.language || 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const phrase = event.results[i][0].transcript.trim();
          if (phrase) {
            handleUserVoiceQuery(phrase);
          }
        }
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      console.warn('[XManius Voice] Recognition event:', e.error);
    };

    recognition.onend = () => {
      if (isListening && !isMuted && voiceModalEl && voiceModalEl.classList.contains('is-open')) {
        try { recognition.start(); } catch (_) {}
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.warn('[XManius Voice] Recognition start:', err);
      setTimeout(() => {
        if (isListening && !isMuted) {
          try { recognition.start(); } catch {}
        }
      }, 500);
    }
  }

  // ─── Create Exact Overlay DOM ────────────────────────────────────────────────
  function createLiveVoiceDOM() {
    if (document.getElementById('xmanius-live-voice-modal')) return;

    const modal = document.createElement('div');
    modal.id        = 'xmanius-live-voice-modal';
    modal.className = 'xmanius-live-modal';
    modal.innerHTML = `
      <div class="xmanius-live-backdrop"></div>

      <!-- Hidden file input for attachments -->
      <input type="file" id="xmanius-live-file-input" style="display:none;" multiple accept="image/*,audio/*,video/*,application/pdf,text/*">

      <!-- Top Right Settings / Equalizer Button matching reference -->
      <button type="button" class="xmanius-live-top-btn" id="xmanius-live-settings-btn" aria-label="Settings">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="4" y1="8" x2="20" y2="8"></line>
          <circle cx="16" cy="8" r="2.5" fill="#000" stroke="currentColor"></circle>
          <line x1="4" y1="16" x2="20" y2="16"></line>
          <circle cx="8" cy="16" r="2.5" fill="#000" stroke="currentColor"></circle>
        </svg>
      </button>

      <!-- Camera Viewfinder -->
      <div id="xmanius-camera-container" class="xmanius-camera-viewfinder" style="display:none;">
        <video id="xmanius-live-video" autoplay playsinline muted></video>
        <div class="xmanius-camera-badge">Live Camera Active</div>
      </div>

      <!-- Center Fluid Watercolor Sky-and-White Sphere Canvas -->
      <div class="xmanius-live-center">
        <canvas id="xmanius-live-canvas" width="500" height="500"></canvas>
      </div>

      <!-- Status / Toast -->
      <div id="xmanius-live-status" class="xmanius-live-toast"></div>

      <!-- Options popup -->
      <div class="xmanius-live-options-menu" id="xmanius-live-menu" style="display:none;">
        <button type="button" class="xmanius-live-menu-item" id="xmanius-btn-camera">
          <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          <span>Toggle Live Camera</span>
        </button>
        <div class="xmanius-live-menu-item">
          <svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          <select id="xmanius-voice-selector" style="background: #333; border: 1px solid #555; color: #fff; width: 100%; outline: none; margin-left: 10px; padding: 4px; border-radius: 4px;">
            <optgroup label="Gemini AI Voices (Cloud)" style="background: #222; color: #4ade80;">
              <option value="Aoede" style="background: #333; color: #fff;">Aoede (Female - Calm & Warm)</option>
              <option value="Kore" style="background: #333; color: #fff;">Kore (Female - Professional)</option>
              <option value="Charon" style="background: #333; color: #fff;">Charon (Male - Deep & Rich)</option>
              <option value="Fenrir" style="background: #333; color: #fff;">Fenrir (Male - Bold & Direct)</option>
              <option value="Puck" style="background: #333; color: #fff;">Puck (Male - Friendly)</option>
            </optgroup>
            <optgroup label="Natural System Voices (Offline)" style="background: #222; color: #60a5fa;">
              <option value="US_Female" style="background: #333; color: #fff;">US English (Female - Natural)</option>
              <option value="US_Male" style="background: #333; color: #fff;">US English (Male - Natural)</option>
              <option value="UK_Female" style="background: #333; color: #fff;">UK English (Female - Natural)</option>
              <option value="UK_Male" style="background: #333; color: #fff;">UK English (Male - Natural)</option>
            </optgroup>
          </select>
        </div>
      </div>

      <!-- Attachment Popup matching media_1788282470279.png -->
      <div class="xmanius-live-attach-popup" id="xmanius-live-attach-popup" style="display:none;">
        <button type="button" class="xmanius-live-popup-item" id="xmanius-live-btn-add-files">
          <svg viewBox="0 0 24 24" class="xmanius-popup-icon">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
          </svg>
          <span class="xmanius-popup-title">Add files</span>
          <span class="xmanius-popup-desc">Upload from computer</span>
        </button>
        <button type="button" class="xmanius-live-popup-item" id="xmanius-live-btn-add-library">
          <svg viewBox="0 0 24 24" class="xmanius-popup-icon">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
            <path d="M6 6h10M6 10h10"></path>
          </svg>
          <span class="xmanius-popup-title">Add from library</span>
          <span class="xmanius-popup-desc">Browse and search your files</span>
        </button>
      </div>

      <!-- Bottom Pill Control Bar matching exact media_1788282408013.png -->
      <div class="xmanius-live-bottom-bar" id="xmanius-live-bottom-bar">
        <!-- Left "+" action & instant typing input -->
        <div class="xmanius-live-type-wrapper" id="xmanius-live-type-wrapper">
          <button type="button" class="xmanius-live-plus-btn" id="xmanius-live-plus-btn" aria-label="Add files or library">+</button>
          <input type="text" class="xmanius-live-pill-input" id="xmanius-live-pill-input" placeholder="Type..." autocomplete="off">
        </div>

        <div class="xmanius-live-bar-spacer"></div>

        <!-- Right mic mute / grant button -->
        <button type="button" class="xmanius-live-btn xmanius-live-mic" id="xmanius-live-mic-btn" aria-label="Toggle microphone">
          <svg viewBox="0 0 24 24" id="mic-icon-active" style="width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="22"></line>
            <line x1="8"  y1="22" x2="16" y2="22"></line>
          </svg>
          <svg viewBox="0 0 24 24" id="mic-icon-muted" style="display:none;width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
            <line x1="12" y1="19" x2="12" y2="22"></line>
            <line x1="8"  y1="22" x2="16" y2="22"></line>
          </svg>
        </button>

        <!-- Right White Circle Close Button -->
        <button type="button" class="xmanius-live-btn xmanius-live-close" id="xmanius-live-close-btn" aria-label="Exit Live Voice">✕</button>
      </div>
    `;

    // Mount inside chat-main so sidebar remains visible on desktop, or fallback to body
    const mountTarget = document.querySelector('.chat-main') || document.body;
    mountTarget.appendChild(modal);
    voiceModalEl = modal;

    canvasEl  = document.getElementById('xmanius-live-canvas');
    if (canvasEl) canvasCtx = canvasEl.getContext('2d');

    // ── Event wiring ──
    document.getElementById('xmanius-live-close-btn')?.addEventListener('click', closeLiveVoiceModal);

    const plusBtn      = document.getElementById('xmanius-live-plus-btn');
    const pillInput    = document.getElementById('xmanius-live-pill-input');
    const attachPopup  = document.getElementById('xmanius-live-attach-popup');
    const fileInput    = document.getElementById('xmanius-live-file-input');
    const optionsMenu  = document.getElementById('xmanius-live-menu');

    // Toggle attachment popup on "+" click
    plusBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      isAttachPopupOpen = !isAttachPopupOpen;
      if (attachPopup) attachPopup.style.display = isAttachPopupOpen ? 'flex' : 'none';
    });

    // Close popup on outside click
    modal.addEventListener('click', (e) => {
      if (isAttachPopupOpen && !e.target.closest('#xmanius-live-attach-popup') && !e.target.closest('#xmanius-live-plus-btn')) {
        isAttachPopupOpen = false;
        if (attachPopup) attachPopup.style.display = 'none';
      }
    });

    // "Add files" click
    document.getElementById('xmanius-live-btn-add-files')?.addEventListener('click', () => {
      isAttachPopupOpen = false;
      if (attachPopup) attachPopup.style.display = 'none';
      fileInput?.click();
    });

    // File selection handler
    fileInput?.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      for (const file of files) {
        try {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result;
            attachedFiles.push({
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              data: dataUrl,
              dataUrl: dataUrl
            });
            showStatus(`Attached: ${file.name}`);
          };
          reader.readAsDataURL(file);
        } catch (err) {
          console.warn('File read error:', err);
        }
      }
      fileInput.value = '';
    });

    // "Add from library" click
    document.getElementById('xmanius-live-btn-add-library')?.addEventListener('click', () => {
      isAttachPopupOpen = false;
      if (attachPopup) attachPopup.style.display = 'none';
      if (window.XmaniusLibrary) {
        window.XmaniusLibrary.open();
      } else {
        showStatus('Library is ready.');
      }
    });

    // Direct inline typing on Enter key
    pillInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = pillInput.value.trim();
        if (val) {
          handleUserVoiceQuery(val);
          pillInput.value = '';
        }
      }
    });

    document.getElementById('xmanius-live-settings-btn')?.addEventListener('click', () => {
      isMenuOpen = !isMenuOpen;
      if (optionsMenu) optionsMenu.style.display = isMenuOpen ? 'flex' : 'none';
    });

    document.getElementById('xmanius-btn-camera')?.addEventListener('click', () => {
      isMenuOpen = false;
      if (optionsMenu) optionsMenu.style.display = 'none';
      toggleCamera();
    });

    const voiceSelector = document.getElementById('xmanius-voice-selector');
    if (voiceSelector) {
      voiceSelector.value = window.localStorage.getItem('xmanius_tts_voice') || 'Aoede';
      voiceSelector.addEventListener('change', (e) => {
        window.localStorage.setItem('xmanius_tts_voice', e.target.value);
      });
    }

    const micBtn = document.getElementById('xmanius-live-mic-btn');
    micBtn?.addEventListener('click', async () => {
      if (!isListening || !mediaStream) {
        const success = await startAudioSession(true);
        if (success) {
          showStatus('');
        }
        return;
      }

      isMuted = !isMuted;
      updateMicButtonState();

      if (isMuted) {
        if (recognition) { try { recognition.stop(); } catch {} }
        showStatus('Microphone muted');
      } else {
        showStatus('');
        if (isListening) startSpeechRecognition();
      }
    });
  }

  // ─── Canvas Resize ───────────────────────────────────────────────────────────
  function resizeCanvas() {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    canvasEl.width  = rect.width  * dpr;
    canvasEl.height = rect.height * dpr;
  }

  // ─── Open / Close ────────────────────────────────────────────────────────────
  function openLiveVoiceModal() {
    createLiveVoiceDOM();
    if (!voiceModalEl) return;

    isMuted           = false;
    smoothVolume      = 0;
    audioPhase        = 0;
    isProcessingQuery = false;
    isAttachPopupOpen = false;
    attachedFiles     = [];
    voiceHistory      = [];

    updateMicButtonState();

    const pillInput   = document.getElementById('xmanius-live-pill-input');
    const attachPopup = document.getElementById('xmanius-live-attach-popup');
    if (pillInput) pillInput.value = '';
    if (attachPopup) attachPopup.style.display = 'none';

    voiceModalEl.classList.add('is-open');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    animFrameId = requestAnimationFrame(renderLoop);

    setTimeout(() => {
      startAudioSession(false);
    }, 100);
  }

  function closeLiveVoiceModal() {
    if (!voiceModalEl) return;

    voiceModalEl.classList.remove('is-open');
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = 0; }
    stopAiSpeech();

    isListening = false;
    isProcessingQuery = false;
    isAttachPopupOpen = false;
    attachedFiles = [];

    if (recognition) {
      try { recognition.stop(); } catch {}
      try { recognition.abort(); } catch {}
      recognition = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }

    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }
    isCameraActive = false;

    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    analyser = null;

    window.removeEventListener('resize', resizeCanvas);
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  window.XmaniusLiveVoice = {
    open:         openLiveVoiceModal,
    close:        closeLiveVoiceModal,
    toggleCamera: toggleCamera
  };

  // ─── Trigger on data-attach-live-voice click ──────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-attach-live-voice]');
      if (trigger) {
        e.preventDefault();
        openLiveVoiceModal();
      }
    });
  });

})();
