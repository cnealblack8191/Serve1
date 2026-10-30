/**
 * Light and dark mode (SPEC.md section 13). Follows the device setting unless the
 * person picks one; the choice is remembered per browser.
 */
export type Theme = "light" | "dark" | "system";
const KEY = "serv1.theme";

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(t: Theme): "light" | "dark" {
  if (t !== "system") return t;
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(t: Theme) {
  const resolved = resolveTheme(t);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
}

/** Call once at start-up; also re-applies when the device setting changes while "system" is chosen. */
export function initTheme() {
  applyTheme(readTheme());
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (readTheme() === "system") applyTheme("system");
  });
}
