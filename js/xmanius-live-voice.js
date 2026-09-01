/**
 * XManius Live Multimodal Voice & Camera Interface
 * Full-screen interactive voice overlay featuring:
 * - Fluid dynamic blue sphere orb visualizer (canvas-rendered, mic-reactive)
 * - Hands-free continuous audio transcription & Gemini API speech response
 * - Live Camera vision feed & snapshot analysis
 * - Interruption detection (barge-in: AI stops speaking when user speaks)
 * - Full bottom pill control bar matching screenshot design
 */

(function () {
  'use strict';

  let voiceModalEl = null;
  let canvasEl = null;
  let canvasCtx = null;
  let animFrameId = 0;

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

  let currentTranscript = '';
  let audioPhase = 0;

  // Render fluid watercolor sphere orb on HTML5 Canvas
  function drawSphereOrb(volumeLevel) {
    if (!canvasCtx || !canvasEl) return;
    const width = canvasEl.width;
    const height = canvasEl.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) * 0.22;
    const pulseRadius = baseRadius + (volumeLevel * 35) + Math.sin(audioPhase * 2) * 4;

    canvasCtx.clearRect(0, 0, width, height);

    // Outer aura glow
    const auraGrad = canvasCtx.createRadialGradient(
      centerX, centerY, baseRadius * 0.8,
      centerX, centerY, pulseRadius * 1.45
    );
    auraGrad.addColorStop(0, 'rgba(0, 170, 255, 0.45)');
    auraGrad.addColorStop(0.6, 'rgba(0, 102, 255, 0.15)');
    auraGrad.addColorStop(1, 'rgba(0, 50, 150, 0)');

    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, pulseRadius * 1.45, 0, Math.PI * 2);
    canvasCtx.fillStyle = auraGrad;
    canvasCtx.fill();

    // Main Sphere Body with moving watercolor texture gradients
    canvasCtx.save();
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
    canvasCtx.clip();

    // Base sphere fluid gradient
    const sphereGrad = canvasCtx.createRadialGradient(
      centerX - pulseRadius * 0.35, centerY - pulseRadius * 0.35, pulseRadius * 0.1,
      centerX, centerY, pulseRadius
    );
    sphereGrad.addColorStop(0, '#ffffff');
    sphereGrad.addColorStop(0.25, '#d4f2ff');
    sphereGrad.addColorStop(0.55, '#0099ff');
    sphereGrad.addColorStop(0.85, '#0055e6');
    sphereGrad.addColorStop(1, '#002699');

    canvasCtx.fillStyle = sphereGrad;
    canvasCtx.fill();

    // Swirling inner watercolor cloud layers
    const layerCount = 4;
    for (let i = 0; i < layerCount; i++) {
      const offsetAngle = audioPhase * (0.8 + i * 0.3) + i * Math.PI / 2;
      const swirlX = centerX + Math.cos(offsetAngle) * (pulseRadius * 0.25);
      const swirlY = centerY + Math.sin(offsetAngle) * (pulseRadius * 0.25);
      const swirlRadius = pulseRadius * (0.55 + Math.sin(audioPhase + i) * 0.1);

      const cloudGrad = canvasCtx.createRadialGradient(
        swirlX, swirlY, 0,
        swirlX, swirlY, swirlRadius
      );
      if (i % 2 === 0) {
        cloudGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
        cloudGrad.addColorStop(0.5, 'rgba(128, 223, 255, 0.3)');
        cloudGrad.addColorStop(1, 'rgba(0, 102, 255, 0)');
      } else {
        cloudGrad.addColorStop(0, 'rgba(0, 180, 255, 0.7)');
        cloudGrad.addColorStop(0.6, 'rgba(0, 70, 200, 0.25)');
        cloudGrad.addColorStop(1, 'rgba(0, 30, 120, 0)');
      }

      canvasCtx.beginPath();
      canvasCtx.arc(swirlX, swirlY, swirlRadius, 0, Math.PI * 2);
      canvasCtx.fillStyle = cloudGrad;
      canvasCtx.fill();
    }

    canvasCtx.restore();
    audioPhase += 0.035;
  }

  // Canvas animation frame handler
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
      volume = Math.min(1, rms * 4.5);

      // Barge-in Interruption Detection: If AI is speaking & user starts talking, cancel AI speech!
      if (isAiSpeaking && volume > 0.18) {
        stopAiSpeech();
      }
    }

    drawSphereOrb(volume);
    animFrameId = requestAnimationFrame(renderLoop);
  }

  function stopAiSpeech() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isAiSpeaking = false;
  }

  function speakText(text) {
    if (!window.speechSynthesis || isMuted) return;
    stopAiSpeech();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      isAiSpeaking = true;
    };
    utterance.onend = () => {
      isAiSpeaking = false;
    };
    utterance.onerror = () => {
      isAiSpeaking = false;
    };

    window.speechSynthesis.speak(utterance);
  }

  // Camera Management
  async function toggleCamera() {
    const videoEl = document.getElementById('xmanius-live-video');
    const container = document.getElementById('xmanius-camera-container');
    if (!videoEl || !container) return;

    if (isCameraActive) {
      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
      }
      videoEl.srcObject = null;
      container.style.display = 'none';
      isCameraActive = false;
      showToast('Camera turned off');
    } else {
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoEl.srcObject = videoStream;
        container.style.display = 'block';
        isCameraActive = true;
        showToast('Live Camera active');
      } catch (err) {
        console.error('Camera access failed', err);
        showToast('Unable to access camera.');
      }
    }
  }

  function captureCameraFrame() {
    const videoEl = document.getElementById('xmanius-live-video');
    if (!videoEl || !isCameraActive || !videoStream) return null;

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = videoEl.videoWidth || 640;
    snapCanvas.height = videoEl.videoHeight || 480;
    const ctx = snapCanvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, snapCanvas.width, snapCanvas.height);
    return snapCanvas.toDataURL('image/jpeg', 0.82);
  }

  function showToast(msg) {
    const toast = document.getElementById('xmanius-live-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-visible');
    setTimeout(() => {
      if (toast.textContent === msg) toast.classList.remove('is-visible');
    }, 3000);
  }

  // Start Mic & Audio Context
  async function startAudioSession() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      isListening = true;
      initSpeechRecognition();
    } catch (err) {
      console.warn('Microphone initialization error:', err);
      showToast('Microphone permission required for Live Voice.');
    }
  }

  function initSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast('Speech recognition not supported in browser.');
      return;
    }

    recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const finalPhrase = event.results[i][0].transcript.trim();
          if (finalPhrase) {
            handleUserVoiceQuery(finalPhrase);
          }
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const inputDisplay = document.getElementById('xmanius-live-input');
      if (inputDisplay && interim) {
        inputDisplay.value = interim;
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech') {
        console.warn('Speech recognition error:', e.error);
      }
    };

    recognition.onend = () => {
      if (isListening && !isMuted && voiceModalEl && voiceModalEl.classList.contains('is-open')) {
        try { recognition.start(); } catch {}
      }
    };

    try { recognition.start(); } catch {}
  }

  async function handleUserVoiceQuery(queryText) {
    const inputDisplay = document.getElementById('xmanius-live-input');
    if (inputDisplay) inputDisplay.value = queryText;

    showToast('Thinking...');
    stopAiSpeech();

    const cameraFrame = captureCameraFrame();
    const attachments = cameraFrame ? [{
      name: 'camera_snapshot.jpg',
      mimeType: 'image/jpeg',
      dataUrl: cameraFrame
    }] : [];

    try {
      const response = await fetch('/api/xmanius-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          model: 'xmanius-1', // Primary Slot 1 Gemini Model
          attachments: attachments,
          mode: 'fast'
        })
      });

      if (response.ok) {
        const data = await response.json();
        const replyText = data.reply || data.answer || 'I got your response.';
        speakText(replyText);
        showToast('Responding...');
      } else {
        speakText("I couldn't complete that request. Please try again.");
      }
    } catch (err) {
      console.error('Voice API error:', err);
      speakText('Connection error. Please check your network.');
    }
  }

  // Create Overlay Modal DOM
  function createLiveVoiceDOM() {
    if (document.getElementById('xmanius-live-voice-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'xmanius-live-voice-modal';
    modal.className = 'xmanius-live-modal';
    modal.innerHTML = `
      <div class="xmanius-live-backdrop"></div>
      
      <!-- Camera Viewfinder Layer -->
      <div id="xmanius-camera-container" class="xmanius-camera-viewfinder" style="display: none;">
        <video id="xmanius-live-video" autoplay playsinline muted></video>
        <div class="xmanius-camera-badge">Live Camera Active</div>
      </div>

      <!-- Center Fluid Canvas Sphere -->
      <div class="xmanius-live-center">
        <canvas id="xmanius-live-canvas" width="600" height="600"></canvas>
      </div>

      <!-- Toast Notification -->
      <div id="xmanius-live-toast" class="xmanius-live-toast">XManius Live Voice</div>

      <!-- Bottom Control Bar (matching user screenshot) -->
      <div class="xmanius-live-bottom-bar">
        <div class="xmanius-live-options-menu" id="xmanius-live-menu" style="display: none;">
          <button type="button" class="xmanius-live-menu-item" id="xmanius-btn-camera">
            <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <span>Toggle Live Camera</span>
          </button>
        </div>

        <button type="button" class="xmanius-live-btn xmanius-live-plus" id="xmanius-live-plus-btn" aria-label="More options">+</button>
        
        <div class="xmanius-live-input-wrapper">
          <input type="text" id="xmanius-live-input" class="xmanius-live-input" placeholder="Type or speak hands-free..." autocomplete="off">
        </div>

        <button type="button" class="xmanius-live-btn xmanius-live-mic" id="xmanius-live-mic-btn" aria-label="Mute microphone">
          <svg viewBox="0 0 24 24" id="mic-icon-active" style="width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg>
          <svg viewBox="0 0 24 24" id="mic-icon-muted" style="display:none; width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="22"></line><line x1="9" y1="21" x2="15" y2="21"></line></svg>
        </button>

        <button type="button" class="xmanius-live-btn xmanius-live-close" id="xmanius-live-close-btn" aria-label="Exit Live Voice">✕</button>
      </div>
    `;

    document.body.appendChild(modal);
    voiceModalEl = modal;

    canvasEl = document.getElementById('xmanius-live-canvas');
    if (canvasEl) {
      canvasCtx = canvasEl.getContext('2d');
    }

    document.getElementById('xmanius-live-close-btn')?.addEventListener('click', closeLiveVoiceModal);
    
    const plusBtn = document.getElementById('xmanius-live-plus-btn');
    const optionsMenu = document.getElementById('xmanius-live-menu');
    plusBtn?.addEventListener('click', () => {
      isMenuOpen = !isMenuOpen;
      if (optionsMenu) optionsMenu.style.display = isMenuOpen ? 'flex' : 'none';
    });

    document.getElementById('xmanius-btn-camera')?.addEventListener('click', () => {
      toggleCamera();
      if (optionsMenu) {
        optionsMenu.style.display = 'none';
        isMenuOpen = false;
      }
    });

    const micBtn = document.getElementById('xmanius-live-mic-btn');
    micBtn?.addEventListener('click', () => {
      isMuted = !isMuted;
      micBtn.classList.toggle('is-muted', isMuted);
      const activeIcon = document.getElementById('mic-icon-active');
      const mutedIcon = document.getElementById('mic-icon-muted');
      if (activeIcon) activeIcon.style.display = isMuted ? 'none' : 'block';
      if (mutedIcon) mutedIcon.style.display = isMuted ? 'block' : 'none';

      if (isMuted) {
        stopAiSpeech();
        showToast('Microphone Muted');
      } else {
        showToast('Microphone Active');
      }
    });

    const liveInput = document.getElementById('xmanius-live-input');
    liveInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = liveInput.value.trim();
        if (val) {
          handleUserVoiceQuery(val);
          liveInput.value = '';
        }
      }
    });
  }

  function resizeCanvas() {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    canvasEl.width = rect.width * (window.devicePixelRatio || 1);
    canvasEl.height = rect.height * (window.devicePixelRatio || 1);
  }

  function openLiveVoiceModal() {
    createLiveVoiceDOM();
    if (!voiceModalEl) return;

    voiceModalEl.classList.add('is-open');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    startAudioSession();
    animFrameId = requestAnimationFrame(renderLoop);
    showToast('XManius Live Voice Ready');
  }

  function closeLiveVoiceModal() {
    if (!voiceModalEl) return;

    voiceModalEl.classList.remove('is-open');
    if (animFrameId) cancelAnimationFrame(animFrameId);
    stopAiSpeech();

    isListening = false;
    if (recognition) {
      try { recognition.stop(); } catch {}
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

    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }

    window.removeEventListener('resize', resizeCanvas);
  }

  window.XmaniusLiveVoice = {
    open: openLiveVoiceModal,
    close: closeLiveVoiceModal,
    toggleCamera: toggleCamera
  };

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
