/**
 * Build a stable-ish CSS selector for an element, capped in depth/length.
 * Picks tag + id (if present) + class (first), walking up at most 5 levels.
 */
export function elementSelector(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 5 && cur.nodeName !== 'HTML' && cur.nodeName !== 'BODY') {
    let part = cur.nodeName.toLowerCase();
    if (cur.id) {
      part += `#${cur.id}`;
      parts.unshift(part);
      break; // id is unique enough
    }
    const cls = cur.classList?.[0];
    if (cls) part += `.${cls}`;
    parts.unshift(part);
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(' > ').slice(0, 200);
}

type ChangeHandler = () => void;

/**
 * Hook into SPA-style navigation:
 *  - pushState / replaceState (programmatic nav)
 *  - popstate (back/forward)
 *  - hashchange
 *  - initial load
 *
 * Calls onChange once for each effective navigation.
 */
export function watchNavigation(onChange: ChangeHandler): () => void {
  if (typeof window === 'undefined') return () => {};

  // Wrap pushState/replaceState so SPA navigations fire our callback.
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  const wrap = (fn: typeof history.pushState) =>
    function (this: History, ...args: Parameters<typeof history.pushState>) {
      const ret = fn.apply(this, args);
      onChange();
      return ret;
    };
  history.pushState = wrap(origPush);
  history.replaceState = wrap(origReplace);

  const handler = () => onChange();
  window.addEventListener('popstate', handler);
  window.addEventListener('hashchange', handler);

  // Initial pageview (deferred so init() can finish first).
  setTimeout(onChange, 0);

  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener('popstate', handler);
    window.removeEventListener('hashchange', handler);
  };
}

/**
 * Capture clicks anywhere in the document. Calls onClick with the target +
 * computed coordinates + selector. Ignores clicks the user marked with
 * `data-serla-ignore` (anywhere up the tree) so sensitive controls can opt out.
 */
export function watchClicks(
  onClick: (info: { target: Element; x: number; y: number; selector: string }) => void
): () => void {
  if (typeof document === 'undefined') return () => {};

  const handler = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target || !(target instanceof Element)) return;
    if (target.closest('[data-serla-ignore]')) return;
    onClick({
      target,
      x: e.clientX,
      y: e.clientY,
      selector: elementSelector(target),
    });
  };
  document.addEventListener('click', handler, { capture: true });
  return () => document.removeEventListener('click', handler, { capture: true });
}
