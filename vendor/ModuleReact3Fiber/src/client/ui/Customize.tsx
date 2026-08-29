// Cosmetics: display name + skin. Edits are held as a local DRAFT and only committed on
// Confirm; Exit discards them. Skins are a radio group (keyboard-operable, announced);
// each option shows a swatch AND its name, so color is never the only cue (WCAG 1.4.1).

import { useState } from "react";
import { SKINS } from "../../engine/index.js";
import { isFamilyFriendlyName, sanitizeDisplayName } from "../../protocol/index.js";

export function Customize({
  name,
  skin,
  onConfirm,
  onExit,
}: {
  name: string;
  skin: string;
  onConfirm: (name: string, skin: string) => void;
  onExit: () => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftSkin, setDraftSkin] = useState(skin);
  const dirty = draftName !== name || draftSkin !== skin;
  // Judge what the server will actually store, not what was typed. This used to check the
  // raw draft while Confirm committed the sanitised string, so the gate and the saved value
  // could disagree — a draft could be accepted here and land as something else, or be
  // refused here despite sanitising to a perfectly good name.
  const trimmedName = draftName.trim();
  const storedName = sanitizeDisplayName(draftName);
  const nameRejected = trimmedName.length > 0 && trimmedName !== storedName && storedName === "Player";
  const validName = !nameRejected && isFamilyFriendlyName(storedName);

  return (
    <div className="center-screen">
      <div className="panel stack" style={{ width: "min(560px, 100%)" }}>
        <h1 style={{ margin: 0, fontSize: "1.6rem" }}>Customize</h1>

        <div className="field">
          <label htmlFor="cz-name">Display name</label>
          <input
            id="cz-name"
            className="input"
            value={draftName}
            maxLength={16}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Player"
            autoComplete="off"
            aria-invalid={!validName}
            aria-describedby={!validName ? "cz-name-error" : undefined}
          />
          {!validName && <span id="cz-name-error" role="alert" style={{ color: "var(--danger, #ff7b7b)" }}>That name can&rsquo;t be used. Try letters and numbers.</span>}
        </div>

        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: 8 }}>Skin</legend>
          <div role="radiogroup" aria-label="Shark skin" style={grid}>
            {SKINS.map((s) => {
              const selected = s.id === draftSkin;
              return (
                <label key={s.id} style={{ ...swatch, outline: selected ? "3px solid var(--focus-ring)" : "1px solid var(--border)" }}>
                  <input type="radio" name="skin" checked={selected} onChange={() => setDraftSkin(s.id)} className="sr-only" />
                  <span aria-hidden="true" style={{ ...preview, background: s.accent ? `linear-gradient(135deg, ${s.color}, ${s.accent})` : s.color }} />
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  {selected && <span className="sr-only">(selected)</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onExit}>Exit</button>
          <button className="btn btn--primary" onClick={() => onConfirm(storedName, draftSkin)} disabled={!dirty || !validName}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 };
const swatch: React.CSSProperties = { display: "grid", gap: 8, placeItems: "center", padding: 12, borderRadius: "var(--radius)", background: "var(--surface-2)", cursor: "pointer" };
const preview: React.CSSProperties = { width: 56, height: 56, borderRadius: "50%" };
