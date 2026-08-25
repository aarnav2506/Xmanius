const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
const smallViewport = window.matchMedia("(max-width: 900px)").matches;
const performanceMode = (() => {
  if (prefersReducedMotion) return "reduced";
  if (coarsePointer || smallViewport) return "phone";
  return "full";
})();
const isPhonePerformanceMode = performanceMode === "phone";
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const shouldUseDesktopVideo = performanceMode === "full"
  && !connection?.saveData;
window.__aarnavPerformanceMode = performanceMode;
document.documentElement.dataset.performance = performanceMode;
document.documentElement.classList.toggle("performance-phone", isPhonePerformanceMode);
const isHomePage = /(?:^|\/)index(?:\.html?)?$/.test(window.location.pathname)
  || /\/$/.test(window.location.pathname);
document.documentElement.classList.toggle("home-page", isHomePage);

const titleIconHref = "./assets/images/at-favicon-zoomed.png";
["icon", "apple-touch-icon"].forEach((rel) => {
  let iconLink = document.querySelector(`link[rel="${rel}"]`);

  if (!iconLink) {
    iconLink = document.createElement("link");
    iconLink.rel = rel;
    document.head.append(iconLink);
  }

  iconLink.href = titleIconHref;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.log("SW registration failed:", error);
    });
  });
}

const themeKey = "aarnav-theme";
const savedTheme = localStorage.getItem(themeKey);
const preferredTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
let activeTheme = savedTheme || preferredTheme;

function applyTheme(theme) {
  activeTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = activeTheme;
  document.documentElement.style.colorScheme = activeTheme;
  localStorage.setItem(themeKey, activeTheme);
}

applyTheme(activeTheme);

// A muted video is much lighter than the previous desktop canvas stack. It is
// kept off phones, tablets, reduced-motion sessions, and data-saving connections.
function initDesktopVideoBackground() {
  if (!shouldUseDesktopVideo) return;

  const video = document.createElement("video");
  video.className = "site-background-video";
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.playsInline = true;
  // Native looping avoids the visible pause caused by seeking back to frame zero.
  video.preload = "auto";
  video.loop = true;
  video.setAttribute("autoplay", "");
  video.setAttribute("muted", "");
  video.setAttribute("aria-hidden", "true");
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("tabindex", "-1");
  document.body.prepend(video);
  document.documentElement.classList.add("has-background-video");
  document.body.classList.add("has-background-video");

  const sourceUrl = new URL("./assets/video/portfolio-background.mp4?v=20260813-4", window.location.href).href;
  let sourceObjectUrl = null;

  const startPlayback = () => {
    if (document.visibilityState !== "visible" || !video.paused) return;
    video.playbackRate = 1;
    video.play().catch(() => {});
  };

  const loadVideo = (url) => {
    video.src = url;
    video.addEventListener("canplay", startPlayback, { once: true });
    video.load();
  };

  // The background clip is small enough to keep in memory. Loading it once as
  // a Blob eliminates mid-video streaming stalls from CDN range responses.
  fetch(sourceUrl, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Background video could not be loaded.");
      return response.blob();
    })
    .then((blob) => {
      sourceObjectUrl = URL.createObjectURL(blob);
      loadVideo(sourceObjectUrl);
    })
    .catch(() => loadVideo(sourceUrl));

  window.addEventListener("pagehide", () => {
    if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
  }, { once: true });
}

initDesktopVideoBackground();

const siteHeader = document.querySelector(".site-header");
if (siteHeader) {
  const themeToggle = document.createElement("button");
  themeToggle.className = "theme-toggle";
  themeToggle.type = "button";

  const syncThemeToggle = () => {
    const isLight = activeTheme === "light";
    themeToggle.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
    themeToggle.setAttribute("title", isLight ? "Switch to dark mode" : "Switch to light mode");
    themeToggle.innerHTML = `
      <span class="theme-toggle__track" aria-hidden="true">
        <span class="theme-toggle__thumb">
          <svg class="theme-toggle__moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 14.4A8.2 8.2 0 0 1 9.6 3a7.4 7.4 0 1 0 11.4 11.4Z"></path></svg>
          <svg class="theme-toggle__sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
        </span>
      </span>
    `;
  };

  syncThemeToggle();
  themeToggle.addEventListener("click", () => {
    applyTheme(activeTheme === "light" ? "dark" : "light");
    syncThemeToggle();
  });
  document.body.append(themeToggle);
}

const scrollProgress = document.createElement("div");
scrollProgress.className = "scroll-progress";
document.body.append(scrollProgress);

let scrollProgressFrame = null;
function syncScrollProgress() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
  scrollProgress.style.transform = `scaleX(${Math.min(Math.max(progress, 0), 1)})`;
  scrollProgressFrame = null;
}

function requestScrollProgress() {
  if (scrollProgressFrame) return;
  scrollProgressFrame = window.requestAnimationFrame(syncScrollProgress);
}

window.addEventListener("scroll", requestScrollProgress, { passive: true });
window.addEventListener("resize", requestScrollProgress);
requestScrollProgress();

let startBackgroundMusicForIdleScroll = () => {};

// Scrolling and background audio must always be initiated deliberately by the visitor.
const idleAutoScrollEnabled = false;

if (idleAutoScrollEnabled) {
  const idleDelay = 10000;
  const idleAutoSpeed = 0.034; // pixels per millisecond, slowed down for a smoother idle glide.
  const autoEase = 0.12;
  let autoScrollFrame = null;
  let currentAutoScrollY = window.scrollY;
  let targetAutoScrollY = currentAutoScrollY;
  let lastAutoFrameTime = 0;
  let autoScrolling = false;
  let idleTimer = null;
  let programmaticScrollUntil = 0;

  const maxScrollY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const clampScrollY = (value) => Math.min(Math.max(value, 0), maxScrollY());

  function stopAutoScroll() {
    autoScrolling = false;
    lastAutoFrameTime = 0;
    if (autoScrollFrame) {
      window.cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
  }

  function scheduleIdleAutoScroll() {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      if (document.body.style.overflow === "hidden") return;
      if (window.scrollY >= maxScrollY() - 2) return;

      currentAutoScrollY = window.scrollY;
      targetAutoScrollY = currentAutoScrollY;
      autoScrolling = true;
      startBackgroundMusicForIdleScroll();
      requestAutoScrollFrame();
    }, idleDelay);
  }

  function noteUserActivity() {
    stopAutoScroll();
    scheduleIdleAutoScroll();
  }

  function requestAutoScrollFrame() {
    if (autoScrollFrame) return;
    autoScrollFrame = window.requestAnimationFrame(renderAutoScroll);
  }

  function renderAutoScroll(now) {
    autoScrollFrame = null;
    if (!autoScrolling) return;
    if (document.visibilityState !== "visible" || document.body.style.overflow === "hidden") {
      stopAutoScroll();
      return;
    }

    const deltaTime = lastAutoFrameTime ? Math.min(now - lastAutoFrameTime, 48) : 16;
    targetAutoScrollY = clampScrollY(targetAutoScrollY + idleAutoSpeed * deltaTime);
    currentAutoScrollY += (targetAutoScrollY - currentAutoScrollY) * autoEase;
    lastAutoFrameTime = now;

    if (Math.abs(targetAutoScrollY - currentAutoScrollY) < 0.25) {
      currentAutoScrollY = targetAutoScrollY;
    }

    programmaticScrollUntil = performance.now() + 90;
    window.scrollTo(0, currentAutoScrollY);

    if (targetAutoScrollY >= maxScrollY() - 1 && Math.abs(targetAutoScrollY - currentAutoScrollY) < 0.5) {
      stopAutoScroll();
      return;
    }

    requestAutoScrollFrame();
  }

  window.addEventListener("scroll", () => {
    if (performance.now() <= programmaticScrollUntil) return;
    currentAutoScrollY = window.scrollY;
    targetAutoScrollY = currentAutoScrollY;
    noteUserActivity();
  }, { passive: true });

  window.addEventListener("resize", () => {
    currentAutoScrollY = clampScrollY(window.scrollY);
    targetAutoScrollY = currentAutoScrollY;
  });

  ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, noteUserActivity, { passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      noteUserActivity();
    } else {
      stopAutoScroll();
    }
  });

  scheduleIdleAutoScroll();
}

// Tactile ripple + press feedback on buttons.
if (!prefersReducedMotion && !isPhonePerformanceMode) {
  document.querySelectorAll(".button, .icon-button, .play-button, .modal-close").forEach((control) => {
    control.addEventListener("pointerdown", (event) => {
      const rect = control.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement("span");
      ripple.className = "btn-ripple";
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      control.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    });
  });
}

document.querySelectorAll(".channel-avatar img").forEach((image) => {
  image.src = "./assets/images/youtube-play-with-aarnav.jpg";
  image.alt = "Play With Aarnav YouTube channel photo";
});

const technoSavvyChannelUrl = "https://www.youtube.com/@technosavvy2506";
document.querySelectorAll("a[href]").forEach((link) => {
  if (link.href.includes("youtube.com/@technosavvy")) {
    link.href = technoSavvyChannelUrl;
  }
});
document.querySelectorAll("[data-channel-url]").forEach((item) => {
  if (item.dataset.channelUrl?.includes("youtube.com/@technosavvy")) {
    item.dataset.channelUrl = technoSavvyChannelUrl;
  }
});

const heroTitle = document.querySelector(".hero-copy h1 .gradient-text");
const heroLede = document.querySelector(".hero-lede");
const heroLedeText = heroLede?.textContent.trim().replace(/\s+/g, " ") || "";

if (heroLede && !prefersReducedMotion) {
  heroLede.setAttribute("aria-label", heroLedeText);
  heroLede.textContent = "";
}

function startHeroLedeTyping() {
  if (!heroLede || prefersReducedMotion) return;
  if (heroLede.dataset.hasTypedIntro === "true") return;

  const ledeRoles = ["coder", "sports lover", "creator", "learner"];
  const prefix = "I am a passionate ";
  const suffix = " from Kolkata, building ideas, chasing better execution, and using AI like a launchpad for sharper work.";
  let phase = "prefix";
  let roleIndex = 0;
  let characterIndex = 0;

  heroLede.dataset.hasTypedIntro = "true";
  heroLede.setAttribute("aria-label", heroLedeText);
  heroLede.innerHTML = `
    <span class="lede-prefix" aria-hidden="true"></span><span class="lede-type-text" aria-hidden="true"></span><span class="lede-type-caret" aria-hidden="true"></span><span class="lede-suffix" aria-hidden="true"></span>
  `;

  const prefixNode = heroLede.querySelector(".lede-prefix");
  const roleNode = heroLede.querySelector(".lede-type-text");
  const suffixNode = heroLede.querySelector(".lede-suffix");

  const rotateRole = (isDeleting = true) => {
    const currentRole = ledeRoles[roleIndex];

    if (isDeleting) {
      characterIndex -= 1;
      roleNode.textContent = currentRole.slice(0, Math.max(characterIndex, 0));

      if (characterIndex > 0) {
        window.setTimeout(() => rotateRole(true), 72);
        return;
      }

      roleIndex = (roleIndex + 1) % ledeRoles.length;
      window.setTimeout(() => rotateRole(false), 280);
      return;
    }

    const nextRole = ledeRoles[roleIndex];
    characterIndex += 1;
    roleNode.textContent = nextRole.slice(0, characterIndex);

    if (characterIndex < nextRole.length) {
      window.setTimeout(() => rotateRole(false), 126);
      return;
    }

    window.setTimeout(() => rotateRole(true), 1500);
  };

  const typeFullLede = () => {
    if (phase === "prefix") {
      characterIndex += 1;
      prefixNode.textContent = prefix.slice(0, characterIndex);

      if (characterIndex < prefix.length) {
        window.setTimeout(typeFullLede, 58);
        return;
      }

      phase = "role";
      characterIndex = 0;
    }

    if (phase === "role") {
      characterIndex += 1;
      roleNode.textContent = ledeRoles[0].slice(0, characterIndex);

      if (characterIndex < ledeRoles[0].length) {
        window.setTimeout(typeFullLede, 118);
        return;
      }

      phase = "suffix";
      characterIndex = 0;
    }

    if (phase === "suffix") {
      characterIndex += 1;
      suffixNode.textContent = suffix.slice(0, characterIndex);

      if (characterIndex < suffix.length) {
        window.setTimeout(typeFullLede, 34);
        return;
      }

      characterIndex = ledeRoles[0].length;
      window.setTimeout(() => rotateRole(true), 1450);
    }
  };

  window.setTimeout(typeFullLede, 260);
}

if (heroTitle && !prefersReducedMotion) {
  const titleText = heroTitle.textContent;
  heroTitle.setAttribute("aria-label", titleText);
  heroTitle.textContent = "";
  heroTitle.classList.add("is-typing");

  let characterIndex = 0;
  const typeHeroTitle = () => {
    characterIndex += 1;
    heroTitle.textContent = titleText.slice(0, characterIndex);

    if (characterIndex < titleText.length) {
      window.setTimeout(typeHeroTitle, characterIndex === 6 ? 340 : 150);
    } else {
      heroTitle.classList.remove("is-typing");
      heroTitle.classList.add("is-typed");
      startHeroLedeTyping();
    }
  };

  window.setTimeout(typeHeroTitle, 420);
} else {
  startHeroLedeTyping();
}

const currentPage = window.location.pathname.split("/").pop() || "index.html";

if (currentPage === "books.html") {
  document.querySelectorAll(".grid").forEach((grid) => {
    const hasBookCards = grid.querySelector(".book-card");
    const hasTreasureIsland = Array.from(grid.querySelectorAll(".book-card h3")).some((heading) => heading.textContent.trim() === "Treasure Island");
    const hasSherlockHolmes = Array.from(grid.querySelectorAll(".book-card h3")).some((heading) => heading.textContent.trim() === "Sherlock Holmes");

    if (!hasBookCards || !hasTreasureIsland || hasSherlockHolmes) return;

    const card = document.createElement("article");
    card.className = "book-card delay-4";
    card.dataset.reveal = "";
    card.innerHTML = `
      <figure class="book-cover">
        <img src="./assets/images/sherlock homes.jpg" alt="Sherlock Holmes book cover">
      </figure>
      <div class="book-content">
        <span class="book-meta">Arthur Conan Doyle &middot; Mystery</span>
        <h3>Sherlock Holmes</h3>
        <p>A detective classic full of observation, logic, and sharp twists. Holmes makes problem-solving feel clever, calm, and exciting.</p>
      </div>
    `;
    grid.append(card);
  });
}

if (currentPage === "places.html") {
  const placesGrid = document.querySelector(".grid.three");
  const existingPlaces = new Set(Array.from(document.querySelectorAll(".place-card h3")).map((heading) => heading.textContent.trim()));
  const placesToAdd = [
    {
      className: "place-card delay-1",
      image: "./assets/images/belur muth.jpg",
      alt: "Belur Math",
      meta: "Belur Math &middot; Kolkata",
      title: "Belur Math",
      copy: "A peaceful riverside landmark with grand architecture, calm gardens, and a spiritual atmosphere that feels steady and reflective.",
    },
    {
      className: "place-card delay-2",
      image: "./assets/images/daksh mandir.jpg",
      alt: "Dakshineswar Kali Temple",
      meta: "Dakshineswar &middot; Kolkata",
      title: "Dakshineswar Kali Temple",
      copy: "A powerful temple visit with classic Bengal architecture, devotional energy, and the Hooghly river adding a quiet sense of scale.",
    },
    {
      className: "place-card",
      image: "./assets/images/victorial memorial.jpg",
      alt: "Victoria Memorial",
      meta: "Maidan &middot; Kolkata",
      title: "Victoria Memorial",
      copy: "One of Kolkata's most iconic sights, with white marble, open lawns, and a historic mood that feels royal, cinematic, and timeless.",
    },
    {
      className: "place-card delay-1",
      image: "./assets/images/rabindra sarobar.jpg",
      alt: "Rabindra Sarobar",
      meta: "South Kolkata &middot; Lakeside",
      title: "Rabindra Sarobar",
      copy: "A calm lakeside escape with shaded paths, soft water views, and a peaceful city-nature mood that feels perfect for slow walks.",
    },
    {
      className: "place-card delay-2",
      image: "./assets/images/writers building.jpg",
      alt: "Writers' Building",
      meta: "B.B.D. Bagh &middot; Kolkata",
      title: "Writers' Building",
      copy: "A powerful colonial-era landmark with a bold red facade, historic importance, and the feeling of old Kolkata standing tall.",
    },
    {
      className: "place-card",
      image: "./assets/images/nicoo park.jpg",
      alt: "Nicco Park",
      meta: "Salt Lake &middot; Kolkata",
      title: "Nicco Park",
      copy: "A fun amusement-park memory with rides, water splashes, and that light weekend energy where the city turns playful.",
    },
    {
      className: "place-card delay-1",
      image: "./assets/images/birla mandir.jpg",
      alt: "Birla Mandir Kolkata",
      meta: "Ballygunge &middot; Kolkata",
      title: "Birla Mandir",
      copy: "A graceful marble temple with detailed carvings, calm devotional energy, and a peaceful glow that feels especially beautiful in the evening.",
    },
    {
      className: "place-card delay-2",
      image: "./assets/images/birla museum.jpg",
      alt: "Birla Industrial and Technological Museum",
      meta: "Ballygunge &middot; Kolkata",
      title: "Birla Museum",
      copy: "A science-and-learning stop with exhibits, curiosity, and a hands-on museum feeling that makes technology feel close and interesting.",
    },
    {
      className: "place-card",
      image: "./assets/images/kapaleeshwarar mandir.jpg",
      alt: "Kapaleeshwarar Temple",
      meta: "Mylapore &middot; Chennai",
      title: "Kapaleeshwarar Temple",
      copy: "A vibrant South Indian temple with a towering gopuram, rich colours, and a sacred atmosphere full of tradition and detail.",
    },
    {
      className: "place-card delay-1",
      image: "./assets/images/snow kindom.jpg",
      alt: "Snow Kingdom",
      meta: "Chennai &middot; Snow park",
      title: "Snow Kingdom",
      copy: "A playful indoor snow experience with icy textures, bright blue atmosphere, and a fun contrast from the usual city heat.",
    },
    {
      className: "place-card delay-2",
      image: "./assets/images/hanuman tok.jpg",
      alt: "Hanuman Tok",
      meta: "Gangtok &middot; Sikkim",
      title: "Hanuman Tok",
      copy: "A peaceful hilltop temple with wide mountain views, crisp air, and a quiet feeling that makes the landscape feel huge.",
    },
  ];

  if (placesGrid) {
    placesToAdd.forEach((place) => {
      if (existingPlaces.has(place.title)) return;

      const card = document.createElement("article");
      card.className = place.className;
      card.dataset.reveal = "";
      card.innerHTML = `
        <figure class="place-image">
          <img src="${place.image}" alt="${place.alt}">
        </figure>
        <div class="place-content">
          <span class="place-meta">${place.meta}</span>
          <h3>${place.title}</h3>
          <p>${place.copy}</p>
        </div>
      `;
      placesGrid.append(card);
      existingPlaces.add(place.title);
    });
  }
}

const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      navLinks.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
}

const revealItems = document.querySelectorAll("[data-reveal]");
if (revealItems.length) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    // Reveal shortly after an element enters view, matching native scrolling
    // without trying to control the visitor's wheel or touch distance.
    { threshold: 0.08, rootMargin: "0px 0px -5% 0px" }
  );

  revealItems.forEach((item, index) => {
    const hasManualDelay = ["delay-1", "delay-2", "delay-3"].some((className) => item.classList.contains(className));
    if (!hasManualDelay) item.style.setProperty("--reveal-delay", `${Math.min((index % 4) * 65, 195)}ms`);
    revealObserver.observe(item);
  });
}

const counterItems = Array.from(document.querySelectorAll(".ring-content b")).filter((item) => /^\d+$/.test(item.textContent.trim()));
if (counterItems.length && !prefersReducedMotion) {
  const animateCounter = (item) => {
    const target = Number(item.textContent.trim());
    const duration = 900;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      item.textContent = String(Math.round(target * eased));
      if (progress < 1) window.requestAnimationFrame(tick);
    };

    item.textContent = "0";
    window.requestAnimationFrame(tick);
  };

  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.5 }
  );

  counterItems.forEach((item) => counterObserver.observe(item));
}

if (!isPhonePerformanceMode) {
  document.querySelectorAll(".glass-card, .feature-card, .book-card, .place-card, .timeline-card, .video-card, .contact-card, .stat-card").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty("--cursor-x", `${x}%`);
      card.style.setProperty("--cursor-y", `${y}%`);
    });
  });
}

const featuredGuitarVideoId = "VsbFO2rWAP0";
document.querySelectorAll("#guitarRail .video-card:first-child, #creatorRail .video-card:first-child").forEach((card) => {
  card.dataset.videoId = featuredGuitarVideoId;
  card.dataset.title = "Featured guitar cover";

  const title = card.querySelector(".video-content h3");
  const description = card.querySelector(".video-content p");
  const visual = card.querySelector(".video-visual");

  if (title) title.textContent = "Featured guitar cover";
  if (description) description.textContent = "Click to watch the selected guitar video directly inside the portfolio.";
  if (visual) {
    visual.style.backgroundImage = `linear-gradient(135deg, rgba(5, 8, 20, 0.18), rgba(5, 8, 20, 0.68)), url("https://img.youtube.com/vi/${featuredGuitarVideoId}/hqdefault.jpg")`;
    visual.style.backgroundPosition = "center";
    visual.style.backgroundSize = "cover";
  }
});

if (!prefersReducedMotion && !isPhonePerformanceMode) {
  let parallaxX = 0;
  let parallaxY = 0;
  let velX = 0;
  let velY = 0;
  let parallaxFrame = null;

  const smoothParallax = () => {
    parallaxX += velX;
    parallaxY += velY;
    velX *= 0.86;
    velY *= 0.86;
    document.documentElement.style.setProperty("--parallax-x", parallaxX.toFixed(3));
    document.documentElement.style.setProperty("--parallax-y", parallaxY.toFixed(3));

    if (Math.abs(velX) > 0.001 || Math.abs(velY) > 0.001) {
      parallaxFrame = window.requestAnimationFrame(smoothParallax);
    } else {
      parallaxFrame = null;
    }
  };

  window.addEventListener("pointermove", (event) => {
    const targetX = (event.clientX / window.innerWidth - 0.5) * 2.5;
    const targetY = (event.clientY / window.innerHeight - 0.5) * 2.5;
    velX = (targetX - parallaxX) * 0.14;
    velY = (targetY - parallaxY) * 0.14;
    if (!parallaxFrame) parallaxFrame = window.requestAnimationFrame(smoothParallax);
  }, { passive: true });
}

const audio = document.querySelector("#bgm");
const audioToggle = document.querySelector(".audio-toggle");
let pauseBackgroundMusicForVideo = () => {};
let resumeBackgroundMusicAfterVideo = () => {};

if (audio && audioToggle) {
  const audioPlaylist = [
    { title: "Bare Minimum (Slowed)", src: "./assets/audio/bare-minimum-slowed.mp3" },
    { title: "Minecraft Theme", src: "./assets/audio/minecraft-theme.mp3" },
    { title: "Subwoofer Lullaby", src: "./assets/audio/1-03. Subwoofer Lullaby.mp3" },
    { title: "Haggstrom", src: "./assets/audio/1-07. Haggstrom.mp3" },
    { title: "Biome Fest", src: "./assets/audio/2-08. Biome Fest.mp3" },
  ];
  const audioStateKey = "aarnav-bgm-state";
  const audioTrackKey = "aarnav-bgm-track";
  const audioTimeKey = "aarnav-bgm-time";
  const audioPlaylistVersionKey = "aarnav-bgm-playlist-version";
  const audioPlaylistVersion = "2026-08-12-bare-minimum";
  let isLeavingPage = false;
  let isChangingTrack = false;
  let isVideoPausingMusic = false;
  let shouldResumeAfterVideo = false;
  let hasUserPausedIdleMusic = false;
  let pendingIdleMusicStart = false;

  if (localStorage.getItem(audioPlaylistVersionKey) !== audioPlaylistVersion) {
    localStorage.setItem(audioTrackKey, "0");
    localStorage.setItem(audioTimeKey, "0");
    localStorage.setItem(audioPlaylistVersionKey, audioPlaylistVersion);
  }

  const savedAudioTimeOnLoad = Number.parseFloat(localStorage.getItem(audioTimeKey) || "0");
  let hasRestoredAudioTime = !(Number.isFinite(savedAudioTimeOnLoad) && savedAudioTimeOnLoad > 0);

  audio.volume = 0.26;
  audio.preload = "auto";
  audio.loop = false;

  const audioPopover = document.createElement("div");
  audioPopover.className = "audio-popover";
  audioPopover.innerHTML = `
    <strong>Music queue</strong>
    <p>Choose a track. The playlist keeps looping every song.</p>
    <div class="audio-track-list"></div>
    <button class="audio-pause-control" type="button">Pause music</button>
  `;
  audioToggle.insertAdjacentElement("afterend", audioPopover);

  const audioTrackList = audioPopover.querySelector(".audio-track-list");
  const audioPauseControl = audioPopover.querySelector(".audio-pause-control");

  const getSavedTrackIndex = () => {
    const savedIndex = Number.parseInt(localStorage.getItem(audioTrackKey) || "0", 10);
    return Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < audioPlaylist.length ? savedIndex : 0;
  };

  let currentTrackIndex = getSavedTrackIndex();
  audio.src = audioPlaylist[currentTrackIndex].src;

  const syncAudioAmbientTrack = () => {
    window.__aarnavAudioTrack = {
      index: currentTrackIndex,
      title: audioPlaylist[currentTrackIndex]?.title || "",
      src: audioPlaylist[currentTrackIndex]?.src || "",
    };
    window.dispatchEvent(new CustomEvent("aarnav:audio-track-change", { detail: window.__aarnavAudioTrack }));
  };

  const syncAudioButton = (isPlaying) => {
    audioToggle.classList.toggle("is-playing", isPlaying);
    audioToggle.classList.toggle("needs-tap", false);
    audioToggle.setAttribute("aria-label", isPlaying ? "Open music controls" : "Play background music");
  };

  const syncAudioPopover = () => {
    audioPopover.querySelectorAll(".audio-track").forEach((button, index) => {
      button.classList.toggle("is-active", index === currentTrackIndex);
      button.setAttribute("aria-current", index === currentTrackIndex ? "true" : "false");
    });

    if (audioPauseControl) {
      audioPauseControl.textContent = audio.paused ? "Resume music" : "Pause music";
    }
  };

  if (audioTrackList) {
    audioTrackList.innerHTML = audioPlaylist
      .map((track, index) => `<button class="audio-track" type="button" data-track-index="${index}"><span>${String(index + 1).padStart(2, "0")}</span>${track.title}</button>`)
      .join("");
  }

  const openAudioPopover = () => {
    audioPopover.classList.add("is-open");
    syncAudioPopover();
  };

  const closeAudioPopover = () => {
    audioPopover.classList.remove("is-open");
  };

  const toggleAudioPopover = () => {
    audioPopover.classList.toggle("is-open");
    syncAudioPopover();
  };

  const saveAudioTime = () => {
    localStorage.setItem(audioTrackKey, String(currentTrackIndex));

    if (!hasRestoredAudioTime && Number.isFinite(savedAudioTimeOnLoad) && savedAudioTimeOnLoad > 0 && audio.currentTime < 1) {
      return;
    }

    if (Number.isFinite(audio.currentTime)) {
      localStorage.setItem(audioTimeKey, String(audio.currentTime));
    }
  };

  const restoreAudioTime = () => {
    const savedTime = Number.isFinite(savedAudioTimeOnLoad) && savedAudioTimeOnLoad > 0 ? savedAudioTimeOnLoad : Number.parseFloat(localStorage.getItem(audioTimeKey) || "0");
    if (!Number.isFinite(savedTime) || savedTime <= 0) return;

    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    audio.currentTime = duration ? savedTime % duration : savedTime;
    hasRestoredAudioTime = true;
  };

  const loadTrack = (trackIndex, { restoreTime = false } = {}) => {
    isChangingTrack = true;
    currentTrackIndex = (trackIndex + audioPlaylist.length) % audioPlaylist.length;
    audio.src = audioPlaylist[currentTrackIndex].src;
    localStorage.setItem(audioTrackKey, String(currentTrackIndex));
    syncAudioAmbientTrack();

    if (restoreTime) {
      if (audio.readyState >= 1) {
        restoreAudioTime();
      } else {
        audio.addEventListener("loadedmetadata", restoreAudioTime, { once: true });
      }
    } else {
      localStorage.setItem(audioTimeKey, "0");
      hasRestoredAudioTime = true;
    }

    isChangingTrack = false;
    syncAudioPopover();
  };

  if (audio.readyState >= 1) {
    restoreAudioTime();
  } else {
    audio.addEventListener("loadedmetadata", restoreAudioTime, { once: true });
  }
  syncAudioAmbientTrack();

  const playBackgroundMusic = async ({ fromUser = false } = {}) => {
    try {
      if (!hasRestoredAudioTime) {
        restoreAudioTime();
      }

      await audio.play();
      localStorage.setItem(audioStateKey, "playing");
      syncAudioButton(true);
      return true;
    } catch {
      if (fromUser) {
        localStorage.setItem(audioStateKey, "paused");
      }
      syncAudioButton(false);
      audioToggle.classList.toggle("needs-tap", !fromUser);
      return false;
    }
  };

  const resetToFirstTrack = () => {
    loadTrack(0);
    try {
      audio.currentTime = 0;
    } catch {
      audio.addEventListener("loadedmetadata", () => {
        audio.currentTime = 0;
      }, { once: true });
    }
    hasRestoredAudioTime = true;
    localStorage.setItem(audioTrackKey, "0");
    localStorage.setItem(audioTimeKey, "0");
  };

  audioToggle.addEventListener("click", async () => {
    if (audio.paused) {
      hasUserPausedIdleMusic = false;
      pendingIdleMusicStart = false;
      await playBackgroundMusic({ fromUser: true });
    } else {
      toggleAudioPopover();
    }
  });

  audioTrackList?.addEventListener("click", async (event) => {
    const trackButton = event.target.closest("[data-track-index]");
    if (!trackButton) return;

    loadTrack(Number.parseInt(trackButton.dataset.trackIndex || "0", 10));
    hasUserPausedIdleMusic = false;
    pendingIdleMusicStart = false;
    await playBackgroundMusic({ fromUser: true });
    openAudioPopover();
  });

  audioPauseControl?.addEventListener("click", async () => {
    if (audio.paused) {
      hasUserPausedIdleMusic = false;
      pendingIdleMusicStart = false;
      await playBackgroundMusic({ fromUser: true });
    } else {
      hasUserPausedIdleMusic = true;
      pendingIdleMusicStart = false;
      saveAudioTime();
      localStorage.setItem(audioStateKey, "paused");
      audio.pause();
      syncAudioButton(false);
    }

    syncAudioPopover();
  });

  startBackgroundMusicForIdleScroll = () => {
    if (hasUserPausedIdleMusic) return;
    closeAudioPopover();
    resetToFirstTrack();
    pendingIdleMusicStart = true;
    localStorage.setItem(audioStateKey, "playing");
    playBackgroundMusic().then((didPlay) => {
      pendingIdleMusicStart = !didPlay;
    });
  };

  const resumePendingIdleMusicStart = async () => {
    if (!pendingIdleMusicStart || hasUserPausedIdleMusic || !audio.paused) return;

    pendingIdleMusicStart = false;
    resetToFirstTrack();
    await playBackgroundMusic({ fromUser: true });
  };

  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, resumePendingIdleMusicStart, { passive: true });
  });

  audio.addEventListener("play", () => {
    syncAudioButton(true);
    syncAudioPopover();
  });
  audio.addEventListener("timeupdate", saveAudioTime);
  audio.addEventListener("ended", () => {
    loadTrack(currentTrackIndex + 1);
    playBackgroundMusic();
  });
  audio.addEventListener("pause", () => {
    syncAudioPopover();
    if (isLeavingPage || isChangingTrack || isVideoPausingMusic || audio.ended) return;
    saveAudioTime();
    localStorage.setItem(audioStateKey, "paused");
    syncAudioButton(false);
  });

  window.addEventListener("pagehide", () => {
    isLeavingPage = true;
    const shouldKeepPlaying = localStorage.getItem(audioStateKey) === "playing" || !audio.paused;
    saveAudioTime();
    localStorage.setItem(audioStateKey, shouldKeepPlaying ? "playing" : "paused");
  });

  window.addEventListener("beforeunload", () => {
    isLeavingPage = true;
    const shouldKeepPlaying = localStorage.getItem(audioStateKey) === "playing" || !audio.paused;
    saveAudioTime();
    localStorage.setItem(audioStateKey, shouldKeepPlaying ? "playing" : "paused");
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || audio.paused) return;

    const target = link.getAttribute("target");
    const href = link.getAttribute("href") || "";
    if (target === "_blank" || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

    saveAudioTime();
    localStorage.setItem(audioStateKey, "playing");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".audio-toggle") && !event.target.closest(".audio-popover")) {
      closeAudioPopover();
    }
  });

  // Preserve playback intent across full-page navigation. Autoplay may still
  // be rejected by the browser, but permitted sessions resume automatically.
  const shouldResumeOnLoad = localStorage.getItem(audioStateKey) === "playing";
  if (shouldResumeOnLoad) {
    const resumeAfterLoad = () => playBackgroundMusic();
    if (audio.readyState >= 1) resumeAfterLoad();
    else audio.addEventListener("loadedmetadata", resumeAfterLoad, { once: true });
  } else {
    syncAudioButton(false);
  }

  pauseBackgroundMusicForVideo = () => {
    if (audio.paused) return;

    closeAudioPopover();
    shouldResumeAfterVideo = true;
    isVideoPausingMusic = true;
    saveAudioTime();
    audio.pause();
    isVideoPausingMusic = false;
    syncAudioButton(false);
    syncAudioPopover();
  };

  resumeBackgroundMusicAfterVideo = () => {
    if (!shouldResumeAfterVideo || !audio.paused) return;

    shouldResumeAfterVideo = false;
    playBackgroundMusic();
  };

  syncAudioPopover();
}

const instaTrigger = document.querySelector(".instagram-float");
const instaPopover = document.querySelector(".insta-popover");

if (instaTrigger && instaPopover) {
  instaTrigger.addEventListener("click", () => {
    instaPopover.classList.toggle("is-open");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".floating-actions")) {
      instaPopover.classList.remove("is-open");
    }
  });
}

document.querySelectorAll("[data-rail-prev], [data-rail-next]").forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.getAttribute("data-rail-prev") || button.getAttribute("data-rail-next");
    const rail = document.querySelector(targetId);
    if (!rail) return;

    const direction = button.hasAttribute("data-rail-next") ? 1 : -1;
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.82,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  });
});

const videoModal = document.querySelector("#videoModal");
const videoModalBody = document.querySelector("#videoModalBody");
let youtubePlayer = null;
let youtubeApiPromise = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.append(script);
    }
  });

  return youtubeApiPromise;
}

async function connectYouTubePlayer(iframeId) {
  const YT = await loadYouTubeApi();
  const iframe = document.querySelector(`#${iframeId}`);
  if (!iframe) return;

  youtubePlayer = new YT.Player(iframeId, {
    events: {
      onStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
          pauseBackgroundMusicForVideo();
        }

        if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
          resumeBackgroundMusicAfterVideo();
        }
      },
    },
  });
}

function closeVideoModal() {
  if (!videoModal || !videoModalBody) return;
  youtubePlayer?.destroy?.();
  youtubePlayer = null;
  resumeBackgroundMusicAfterVideo();
  videoModal.classList.remove("is-open");
  videoModal.setAttribute("aria-hidden", "true");
  videoModalBody.innerHTML = "";
  document.body.style.overflow = "";
}

function openVideoModal(card) {
  if (!videoModal || !videoModalBody) return;

  const videoId = (card.dataset.videoId || "").trim();
  const title = card.dataset.title || "Featured video";
  const channelUrl = card.dataset.channelUrl || "#";

  if (videoId && !videoId.includes("VIDEO_ID")) {
    const safeId = encodeURIComponent(videoId);
    const videoUrl = `https://www.youtube.com/watch?v=${safeId}`;

    if (window.location.protocol === "file:") {
      videoModalBody.innerHTML = `
        <div class="modal-placeholder">
          <div>
            <h3>${title}</h3>
            <p>YouTube blocks embedded playback from local file previews, which causes Error 153. Open this site through localhost or GitHub Pages and the video will play inside this modal.</p>
            <a class="button primary" href="${videoUrl}" target="_blank" rel="noreferrer">Watch on YouTube</a>
          </div>
        </div>
      `;
      videoModal.classList.add("is-open");
      videoModal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      return;
    }

    const embedParams = new URLSearchParams({
      autoplay: "1",
      enablejsapi: "1",
      rel: "0",
      playsinline: "1",
    });

    embedParams.set("origin", window.location.origin);

    pauseBackgroundMusicForVideo();
    videoModalBody.innerHTML = `
      <div class="modal-frame">
        <iframe
          id="youtubePlayerFrame"
          title="${title}"
          src="https://www.youtube.com/embed/${safeId}?${embedParams.toString()}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="origin-when-cross-origin"
          allowfullscreen></iframe>
      </div>
    `;
    connectYouTubePlayer("youtubePlayerFrame");
  } else {
    videoModalBody.innerHTML = `
      <div class="modal-placeholder">
        <div>
          <h3>${title}</h3>
          <p>This featured slot is prepared for a YouTube clip and will play directly inside the portfolio once a video is selected.</p>
          <a class="button primary" href="${channelUrl}" target="_blank" rel="noreferrer">Open channel</a>
        </div>
      </div>
    `;
  }

  videoModal.classList.add("is-open");
  videoModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

document.querySelectorAll(".video-card").forEach((card) => {
  card.addEventListener("click", () => openVideoModal(card));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openVideoModal(card);
    }
  });
});

document.querySelectorAll("[data-close-video]").forEach((item) => {
  item.addEventListener("click", closeVideoModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeVideoModal();
    instaPopover?.classList.remove("is-open");
  }
});

const canvas = document.querySelector("#starfield");
const context = canvas?.getContext("2d");

if (canvas && context && !prefersReducedMotion && !isPhonePerformanceMode
  && !document.documentElement.classList.contains("has-background-video")) {
  let width = 0;
  let height = 0;
  let stars = [];
  let shooting = null;
  let lastStarFrame = 0;
  const starDprCap = isPhonePerformanceMode ? 1 : 1.75;
  const starFrameInterval = isPhonePerformanceMode ? Infinity : 1000 / 60;
  const starDensity = isPhonePerformanceMode ? 28000 : 14000;

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, starDprCap);
    width = canvas.width = window.innerWidth * dpr;
    height = canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    const count = Math.max(isPhonePerformanceMode ? 45 : 70, Math.round((window.innerWidth * window.innerHeight) / starDensity));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: (Math.random() * 1.4 + 0.2) * dpr,
      alpha: Math.random() * 0.8 + 0.2,
      speed: (Math.random() * 0.22 + 0.03) * dpr,
    }));
  }

  function drawStars(now = 0) {
    if (Number.isFinite(starFrameInterval) && now - lastStarFrame < starFrameInterval) {
      requestAnimationFrame(drawStars);
      return;
    }
    lastStarFrame = now;
    context.clearRect(0, 0, width, height);
    const time = Date.now() * 0.00015;
    const isLightTheme = document.documentElement.dataset.theme === "light";
    const starColor = isLightTheme ? "24, 39, 66" : "255, 255, 255";
    const starAlpha = isLightTheme ? 0.64 : 1;

    for (const star of stars) {
      star.y += star.speed;
      if (star.y > height + 4) {
        star.y = -4;
        star.x = Math.random() * width;
      }
    }

    const audioEnergy = Math.min(1, window.__aarnavAudioEnergy || 0);
    const audioPulse = 1 + audioEnergy * 0.82;
    const glowStars = audioEnergy > 0.035;
    for (const star of stars) {
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(time + star.x * 0.01));
      const alpha = Math.min(1, star.alpha * twinkle * starAlpha * audioPulse);
      const radius = star.radius * audioPulse;
      context.beginPath();
      context.fillStyle = `rgba(${starColor}, ${alpha})`;
      context.arc(star.x, star.y, radius, 0, Math.PI * 2);
      context.fill();
      if (glowStars && star.alpha > 0.62) {
        context.beginPath();
        context.fillStyle = isLightTheme
          ? `rgba(0, 127, 159, ${audioEnergy * 0.08})`
          : `rgba(123, 232, 255, ${audioEnergy * 0.12})`;
        context.arc(star.x, star.y, radius * 2.35, 0, Math.PI * 2);
        context.fill();
      }
    }

    if (!isPhonePerformanceMode && !shooting && Math.random() < 0.012 + audioEnergy * 0.004) {
      const dpr = window.devicePixelRatio || 1;
      shooting = {
        x: Math.random() * width * 0.8,
        y: Math.random() * height * 0.25,
        vx: (8 + Math.random() * 7) * dpr,
        vy: (4 + Math.random() * 3) * dpr,
        life: 1,
      };
    }

    if (shooting) {
      context.beginPath();
      context.strokeStyle = isLightTheme
        ? `rgba(0, 127, 159, ${shooting.life * 0.78})`
        : `rgba(123, 232, 255, ${shooting.life})`;
      context.lineWidth = 2 * (window.devicePixelRatio || 1);
      context.moveTo(shooting.x, shooting.y);
      context.lineTo(shooting.x - shooting.vx * 4, shooting.y - shooting.vy * 4);
      context.stroke();
      shooting.x += shooting.vx;
      shooting.y += shooting.vy;
      shooting.life -= 0.018;
      if (shooting.life <= 0) shooting = null;
    }

    if (!isPhonePerformanceMode) requestAnimationFrame(drawStars);
  }

  window.addEventListener("resize", () => {
    resizeCanvas();
    if (isPhonePerformanceMode) drawStars();
  });
  resizeCanvas();
  drawStars();
}
