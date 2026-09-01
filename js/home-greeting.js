// Handle the dynamic personalized greeting and centered empty state logic
(function() {
  const emptyStateHeader = document.querySelector("[data-empty-state] h1");
  const emptyStateSection = document.querySelector("[data-empty-state]");

  const getGreetingText = () => {
    const profile = window.XmaniusAuth?.getUserProfile?.() || {};
    const name = (!profile.isGuest && profile.displayName && profile.displayName !== "Guest User") ? profile.displayName.trim().split(/\s+/)[0] : "";

    const templates = [
      name ? `Ready when you are, ${name}` : "Ready when you are",
      name ? `What's the vibe, ${name}?` : "What's the vibe?",
      name ? `What's on the agenda today, ${name}?` : "What's on the agenda today?",
      name ? `Where should we begin, ${name}?` : "Where should we begin?",
      name ? `What should we focus on, ${name}?` : "What should we focus on?"
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  };

  const randomizeGreeting = () => {
    if (emptyStateHeader) {
      emptyStateHeader.textContent = getGreetingText();
    }
  };

  window.XmaniusRandomizeGreeting = randomizeGreeting;

  // Randomize on initial script load
  randomizeGreeting();

  // Use a MutationObserver to toggle the body class based on the empty state visibility
  if (emptyStateSection) {
    const updateBodyClass = () => {
      if (emptyStateSection.hidden || emptyStateSection.style.display === 'none') {
        document.body.classList.remove('is-empty-state');
      } else {
        document.body.classList.add('is-empty-state');
        randomizeGreeting();
      }
    };

    // Initial check
    updateBodyClass();

    // Observe changes to the 'hidden' attribute of the empty state
    const observer = new MutationObserver(updateBodyClass);
    observer.observe(emptyStateSection, { attributes: true, attributeFilter: ['hidden', 'style'] });
  }
})();
