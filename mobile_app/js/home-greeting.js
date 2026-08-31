// Handle the dynamic greeting and centered empty state logic
(function() {
  const greetings = [
    "What should we focus on?",
    "Ready when you are",
    "Where should we begin?",
    "What's the vibe?",
    "What's on the agenda today?"
  ];

  const emptyStateHeader = document.querySelector("[data-empty-state] h1");
  const emptyStateSection = document.querySelector("[data-empty-state]");

  const randomizeGreeting = () => {
    if (emptyStateHeader) {
      const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
      emptyStateHeader.textContent = randomGreeting;
    }
  };

  // Randomize on initial script load
  randomizeGreeting();

  // Use a MutationObserver to toggle the body class based on the empty state visibility
  if (emptyStateSection) {
    const updateBodyClass = () => {
      if (emptyStateSection.hidden || emptyStateSection.style.display === 'none') {
        document.body.classList.remove('is-empty-state');
      } else {
        document.body.classList.add('is-empty-state');
        randomizeGreeting(); // Also randomize when returning to empty state (e.g. clicking New Chat)
      }
    };

    // Initial check
    updateBodyClass();

    // Observe changes to the 'hidden' attribute of the empty state
    const observer = new MutationObserver(updateBodyClass);
    observer.observe(emptyStateSection, { attributes: true, attributeFilter: ['hidden', 'style'] });
  }
})();
