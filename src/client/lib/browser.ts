/** Small browser helpers that would otherwise be repeated across modules. */

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * sessionStorage that never throws: private windows, blocked storage and
 * embedded previews simply fall back to "nothing remembered".
 */
export const session = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Not remembering is fine.
    }
  },
};

export function newConversationId(): string {
  // randomUUID only exists in secure contexts; plain http on a LAN address is not one.
  if (window.isSecureContext) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Keeps the monitor inside the visible area when an on-screen keyboard opens.
 * Chrome resizes the layout itself (interactive-widget in the viewport meta);
 * iOS Safari does not, so the frame follows the visual viewport. Pinch zoom
 * is left alone: shrinking the frame then would make zooming pointless.
 */
export function followVisualViewport(frame: HTMLElement, onChange: () => void): void {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const update = () => {
    const zoomed = Math.abs(viewport.scale - 1) > 0.01;
    frame.style.height = zoomed ? "" : `${viewport.height}px`;
    frame.style.transform = zoomed ? "" : `translateY(${viewport.offsetTop}px)`;
    onChange();
  };
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  return node;
}

export function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in the page.`);
  return node as T;
}
