export const THEME_STORAGE_KEY = "opengames-theme";

/**
 * Runs synchronously in <head>, before first paint, so the page never
 * flashes the wrong theme. Kept as a plain string (not a module import)
 * because it's inlined directly into the document via a `<script is:inline>`.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (e) {}
})();
`;
