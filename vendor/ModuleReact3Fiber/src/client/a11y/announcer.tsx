// Screen-reader announcer. A single polite/assertive live region pair lives at the
// app root; components call announce() to push status text (score changes, deaths,
// leaderboard shifts, screen transitions) — satisfying WCAG 4.1.3 Status Messages
// without moving focus.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Politeness = "polite" | "assertive";

interface AnnouncerApi {
  announce: (message: string, politeness?: Politeness) => void;
}

const Ctx = createContext<AnnouncerApi>({ announce: () => {} });

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const lastRef = useRef<string>("");

  const announce = useCallback((message: string, politeness: Politeness = "polite") => {
    if (!message || message === lastRef.current) return;
    lastRef.current = message;
    // Toggle via a leading zero-width space so identical consecutive messages re-fire.
    const stamped = message;
    if (politeness === "assertive") {
      setAssertive("");
      requestAnimationFrame(() => setAssertive(stamped));
    } else {
      setPolite("");
      requestAnimationFrame(() => setPolite(stamped));
    }
  }, []);

  const api = useMemo(() => ({ announce }), [announce]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </Ctx.Provider>
  );
}

export function useAnnouncer(): AnnouncerApi {
  return useContext(Ctx);
}
