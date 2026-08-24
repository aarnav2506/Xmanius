(() => {
  "use strict";
  const themeButton = document.querySelector("[data-theme-toggle]");
  const savedTheme = localStorage.getItem("xmanius-theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  themeButton?.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("xmanius-theme", theme);
  });
})();
