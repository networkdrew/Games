import { useEffect, useState, type RefObject } from "react";

/**
 * Fullscreen API as a progressive enhancement. `supported` starts false and
 * flips true in an effect (never read synchronously during render) so
 * server-rendered and first-paint client markup match. Callers should hide
 * the fullscreen control entirely when `supported` is false rather than
 * disabling it — there's no meaningful fallback UI for it.
 */
export function useFullscreen(targetRef: RefObject<HTMLElement | null>) {
  const [supported, setSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setSupported(
      typeof document !== "undefined" && !!document.fullscreenEnabled,
    );
  }, []);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(
        !!document.fullscreenElement &&
          document.fullscreenElement === targetRef.current,
      );
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [targetRef]);

  async function toggleFullscreen() {
    if (!supported) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await targetRef.current?.requestFullscreen();
      }
    } catch {
      // User agent denied the request (e.g. no user gesture) — ignore, control stays a no-op.
    }
  }

  return { supported, isFullscreen, toggleFullscreen };
}
