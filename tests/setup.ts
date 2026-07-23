import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement matchMedia — several components (reduced-motion
// checks, theme detection) rely on it being present, even in tests that
// never assert on it directly.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom doesn't implement scrollTo on elements — the transcript's
// auto-scroll effect calls it on every update.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

afterEach(() => {
  cleanup();
});
