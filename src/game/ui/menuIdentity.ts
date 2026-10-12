import { isFamilyFriendlyName, sanitizeDisplayName } from "../../protocol/index.js";

// Judge the same canonical value that the device and Room will store. Empty drafts
// keep the existing Player fallback; rejected non-empty drafts must be corrected.
export function menuName(draftName: string) {
  const trimmedName = draftName.trim();
  const storedName = sanitizeDisplayName(draftName);
  const nameRejected = trimmedName.length > 0 && trimmedName !== storedName && storedName === "Player";
  return { storedName, validName: !nameRejected && isFamilyFriendlyName(storedName) };
}
