// Device-local identity controls share the landing screen with the primary Play action.
import { useState } from "react";
import { SKINS } from "../../engine/index.js";
import { menuName } from "./menuIdentity.js";

export function MainMenu({
  playerName,
  skin,
  best,
  onPlay,
  onIdentityChange,
  onSettings,
}: {
  playerName: string;
  skin: string;
  best: number;
  onPlay: (name: string, skin: string) => void;
  onIdentityChange: (identity: { name?: string; skin?: string }) => void;
  onSettings: () => void;
}) {
  const [draftName, setDraftName] = useState(playerName);
  const { storedName, validName } = menuName(draftName);
  const selectedSkin = SKINS.find((option) => option.id === skin) ?? SKINS[0];
  const saveName = () => {
    if (validName) onIdentityChange({ name: storedName });
  };

  return (
    <div className="center-screen menu-screen">
      <div className="stack shark-menu shark-menu--centered">
        <div className="shark-menu__brand">
          <span className="wizardgang-menu-mark" aria-hidden="true" />
          <div>
            <span>WIZARDGANG</span>
            <h1>Shark Tank</h1>
          </div>
        </div>
        <p className="shark-menu__tagline">Eat. Grow. Rule the ocean.</p>

        <form className="panel shark-menu__panel shark-menu__identity" onSubmit={(event) => {
          event.preventDefault();
          if (validName) onPlay(storedName, selectedSkin.id);
        }}>
          <div className="shark-menu__launch">
            <figure className="menu-shark">
              <svg className="menu-shark__image" viewBox="0 0 240 130" role="img" aria-label={`${selectedSkin.name} shark preview`}>
                <g stroke="#0b0a14" strokeWidth="2" strokeLinejoin="round">
                  <path d="M75 64 25 27 34 69 18 103 78 84" fill={selectedSkin.accent} />
                  <path d="m119 63 15-47 30 48m-42 20 32 32 8-34" fill={selectedSkin.accent} />
                  <path d="M45 74c27-37 108-46 161-12l20 15-20 17C150 112 80 101 45 74Z" fill={selectedSkin.color} />
                  <path d="M80 86c45 17 96 15 126 8l20-17c-48 13-93 12-146 9Z" fill={selectedSkin.accent} />
                  <path d="m127 81 19 27 20-24" fill={selectedSkin.color} />
                  <path d="m168 65-3 17m-7-19-3 17m-7-19-3 17" fill="none" />
                  <circle cx="197" cy="68" r="4" fill="#0b0a14" />
                  <path d="m203 84 15-5" fill="none" />
                </g>
              </svg>
              <figcaption>{selectedSkin.name} shark</figcaption>
            </figure>
            <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={!validName} autoFocus>Play</button>
            <p className="menu-player-summary">Personal best {best}</p>
          </div>

          <div className="stack shark-menu__controls">
            <div className="field">
              <label htmlFor="menu-name">Display name</label>
              <input id="menu-name" className="input" value={draftName} maxLength={16}
                onChange={(event) => setDraftName(event.target.value)} onBlur={saveName}
                placeholder="Player" autoComplete="off" aria-invalid={!validName}
                aria-describedby={!validName ? "menu-name-error" : undefined} />
              {!validName && <span id="menu-name-error" role="alert" className="field-error">That name can&rsquo;t be used. Try letters and numbers.</span>}
            </div>
            <fieldset className="skin-fieldset">
              <legend className="skin-legend">Skin</legend>
              <div role="radiogroup" aria-label="Shark skin" className="skin-grid">
                {SKINS.map((option) => (
                  <label key={option.id} className={option.id === skin ? "skin-option is-selected" : "skin-option"}>
                    <input type="radio" name="skin" value={option.id} checked={option.id === skin}
                      onChange={() => onIdentityChange({ skin: option.id })} className="sr-only" />
                    <svg className="skin-preview" viewBox="0 0 32 32" aria-hidden="true">
                      <circle cx="16" cy="16" r="15" fill={option.color} />
                      <path d="M2 16a14 14 0 0 0 28 0Z" fill={option.accent} />
                    </svg>
                    <span>{option.name}</span>
                    {option.id === skin && <span className="sr-only">(selected)</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <button type="button" className="btn shark-menu__settings" onClick={() => { saveName(); onSettings(); }}>Settings</button>
        </form>
      </div>
    </div>
  );
}
