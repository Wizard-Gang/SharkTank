/**
 * Progressive enhancement for Worker-rendered human documents.
 *
 * Core content, navigation, forms, evidence, and status remain server/static rendered.
 * This module only improves hash-target focus/open behavior; no React hydration or router
 * is installed for ordinary documentation or operations pages.
 */
export function landOnHashTarget(): void {
  const id = location.hash.slice(1);
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  const disclosure = target.matches("details") ? target : target.closest("details");
  if (disclosure instanceof HTMLDetailsElement && !disclosure.open) disclosure.open = true;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start" });
}

export function installHumanDocumentEnhancements(): void {
  if (location.hash) landOnHashTarget();
  window.addEventListener("hashchange", landOnHashTarget);
}

installHumanDocumentEnhancements();
