// Client-side user-action reporter. Fire-and-forget POST to the server's 90-day user
// audit log. Used for UI actions the server can't see on its own (navigation, cosmetic
// changes, entering/leaving a game). Never throws.

export interface UserAction {
  type: string;
  subject?: string; // the acting player's name
  room?: string;
  detail?: string;
}

export function logUserAction(action: UserAction, baseUrl = ""): void {
  try {
    void fetch(baseUrl + "/api/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
      keepalive: true, // still delivered if the page is unloading
    }).catch(() => {});
  } catch {
    /* audit logging must never break the UI */
  }
}
