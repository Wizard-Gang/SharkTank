# Architecture

SharkTank is one Cloudflare Worker, one React Three Fiber browser client, one Room Durable Object class and static Vite assets.

```text
browser ── HTTPS ──> Worker ───────> Static Assets
   │                   │
   │                   └───────────> Room Durable Object
   │                                  in-memory authority
   ├── localStorage
   └── WebSocket ──────────────────> Room Durable Object
```

## Worker surface

The shared `platform/wg-edge/` shell owns host/TLS checks, `/version.json`, response security headers, errors and 404s. SharkTank adds only the game routes.

- `/` and `/play` redirect to `/play/`.
- `/play/` is the one explicit browser application boundary.
- `/room/room-1/ws` is the only gameplay socket.
- Static game assets are served through the Worker asset binding.
- Every other application path falls through to the shared 404.

The top-level `sharktank` Worker exports only `Room`. The stable gameplay id is `room-1`, displayed as **SharkTank**.

## Room authority

`Room` owns competitive state: X/Y/Z movement, yaw + pitch, prey, score, growth, damage, death/respawn, Feeding Frenzy, Apex and round transitions. The engine advances deterministic in-memory state from ordered actions and seeded RNG. Length-only tier helpers derive Pup, Reef Shark, Tiger Shark, Great White and Megalodon without protocol changes; a steady one-bait-per-second eater reaches their milestones within one five-minute round.

Gameplay is not restored after a Room object restart. A new object starts a new round. Browser-local preferences never become gameplay authority.

The pure deterministic `src/engine/` and shared `src/protocol/` stay free of DOM, React, Three.js and Node-only APIs. Simulation randomness uses seeded RNG in live memory.

Sharks use one authoritative `position`; client snapshots and prediction use the same single-position model. Engine, client and wire state use `Shark` / `sharks` with a single `position`. Protocol 12 omits legacy segments, boosting, chargeTicks and schemaVersion. Prey tuples carry a stable short id hash, species code, X/Y/Z at 0.1 precision and yaw/pitch at 0.01; the parser restores presentation fields from the permanent sixteen-species table.

In-memory engine schema 11 and realtime protocol 12 are current. The Worker imports only server-safe engine/protocol entries.

## Premium prey presentation

Premium protocol-12 prey now render as four distinct silhouettes: long silver-blue tuna, pointed squid mantles with four trailing tentacles, broad flat rays with cosmetic wing flaps, and an emissive golden fish with a small sparkle. Shapes are instanced in bounded batches; Reduced motion freezes the fin flap and sparkle rotation. A semantic 18-unit proximity caption ("Golden fish nearby · 12 points") appears independently of sound settings. All motion, scoring, species codes and the 14,000-byte snapshot cap remain authoritative and unchanged.

## Client boundary

`src/client/game-document.tsx` owns the React 19 game shell, `src/client/main.tsx` mounts it, and Vite owns the browser module graph.

The browser-only game lives in `src/game/`. One strict root TypeScript program covers the Worker, engine, protocol and client through relative imports.

React Three Fiber / Three.js is the only gameplay renderer. The world is full X/Y/Z with authoritative yaw + pitch; banking is presentation-only. The local shark uses local prediction followed by server reconciliation. Remote sharks and prey use remote interpolation.

`WorldEnvironment` owns the arena boundary and Feeding Frenzy volume cues. `FxLayer` shares one instanced particle draw between impact bursts, lunge wakes and inferred prey pops.

The semantic DOM owns menus, HUD, leaderboard, settings, dialogs, captions, announcements, labels and depth cues. WebGL does not replace those interfaces.

## Audio scheduling

ST-276 replaces the six-note melody with a deterministic, eight-bar D minor score: Dm9 → Bbmaj7 → Gm9 → A7, two bars per chord with a different second-bar pad voicing. Each bar contains eight 320 ms steps; detuned low-pass pad voices start on beat one, and a filtered bass sounds twice per bar. Pad, bass, percussion and lead use independent gain buses with 1.2 s crossfades. Existing protocol-12 snapshots choose Calm, Hunt (health ≤40 or devouring threat within 30 units), Frenzy (additional shaker offbeats and lead), Apex (semitone lead tension), or Result (existing short sting and calm mix). The browser audio manager still wakes every 25 ms and queues only onsets up to 100 ms ahead using `AudioContext.currentTime`; throttled wakes skip expired notes. Muting or ending a session cancels the timer and all active or queued voices, with browser visibility suspension and first-gesture activation unchanged. Fresh-device music defaults to 35% after first browser activation; saved mute continues to win. Both music and SFX (including ambience) enter one 2.4 kHz low-pass, then parallel 88% dry and 12% deterministic 550 ms stereo-impulse convolver sends combine at the existing volume-controlled master before a fast 12:1 compressor/limiter and AudioContext destination. The impulse and processing nodes are created once per context, disconnected on dispose and never added per voice. ST-280 replaces square/saw chirps with low-peak sine/triangle plucks and chimes plus filtered deterministic noise for bite crunch, Dash whoosh and soft elimination. One shared small noise buffer also drives a continuous speed-modulated swim band-pass layer. Swim speed is derived locally from successive authoritative positions and ticks with teleport/stale guards; silence follows death, disconnect or mute. Shark-presence pulses are now one emitter per 2–5.6 seconds according to distance, with existing directional captions independent of audio playback. Voices remain capped, are routed through the same spatial sends and master limiter, and stop on session cleanup.

## Controls

Desktop:
- W/S — pitch.
- A/D — yaw.
- Arrow keys — chase-camera look.
- Space — burst.
- F — directional bite.
- Escape — pause.

Mobile defaults to Simple pitch/yaw with automatic camera recentring; Advanced uses independent dual-stick pitch/yaw and camera look with separate ability pointers.

## Local development

Use Node 26.10.0 and npm 12.1.0.

```sh
npm ci
npm run dev -- --no-open
npm run check
npm run audit:dependencies
```

`npm run check` is credential-free. Live GitHub settings verification remains a separate read-only command.

## Release and delivery

Controlled repository changes are squash-only and land as one non-merge commit on `main`. Protected `verify` must pass on the exact PR head and merged branches delete automatically.

Release identity is package version + immutable annotated tag + GitHub Release + exact accepted commit. The Release workflow calls the pinned baseline `deploy-worker.yml`, waits for protected `production` approval, deploys `sharktank`, and verifies the live release identity.

## WG-ARCH-001 project-specific boundaries

SharkTank uses Node.js 26.10.0, npm 12.1.0, React 19, React Three Fiber 9, Three.js and Cloudflare Room Durable Objects. Server authority, exact-head CI, immutable release tags and protected production deployment remain repository requirements.

Remote sharks, prey and effects share a 150 ms interpolation delay, derived from the protocol’s 100 ms broadcast cadence. Snapshot bracketing uses authoritative ticks on the client clock, estimating tick rate and tracking the minimum packet offset over two seconds with phase correction limited to 5 ms per second. Reconnects and tick regressions reset the clock.

Remote actors extrapolate for at most 120 ms beyond the newest snapshot, then hold. Sharks follow authoritative yaw/pitch and dash-derived speed (including Frenzy); prey use their last snapshot velocity. Per-actor presentation offsets blend back over 120 ms without a position jump when packets resume. Competitive state remains authoritative.

Shark and prey swim phases use continuous client frame seconds at the existing frequencies, independent of snapshot arrival or holds. Remote banking uses snapshot-pair yaw rates with a low-pass filter before roll easing. Reduced motion keeps swim flex in the rest pose.

Steering intent sends at most every 50 ms (20 Hz), with 0.015 rad yaw/pitch thresholds. A trailing timer sends smaller final changes after 50 ms of settling, within 100 ms of the last input change while connected. Reconnect and cleanup discard pending orientation. Competitive movement remains server-owned.

Local dash prediction starts on a connected burst press when the latest authoritative cooldown is ready, using the engine dash envelope. Authoritative lunge state confirms it; an unconfirmed lunge cancels after 250 ms and uses bounded movement reconciliation. Damage and cooldown remain server-owned.

Local shark reconciliation uses a shared visual offset for the mesh, labels and camera target. Corrections up to 12 units blend with a 120 ms half-life while prediction continues; larger discontinuities, spawn, respawn and reconnect snap. This presentation offset never changes competitive state.

Per-session welcome and state snapshots retain every shark, effect and round field, but include only prey within 72 units of the living player's position (the tank centre while dead or absent). The server still simulates every prey. All quality presets finish fog by 70 units. Prey disappearance produces an eat sound or caption only within 12 units of a living shark mouth. Typical 32-shark session snapshots fit within 14 KB.

Graphics quality defaults to Auto: Medium for coarse-pointer or ≤ 4 GB device-memory hints, High otherwise. Saved explicit choices win. A two-second frame average above 1.25 × the 60 Hz target lowers DPR in 0.25 steps to a floor of 1; ten seconds below 0.8 × target raises it toward the preset/device cap. Resolution adaptation preserves quality, actors and cues. Suspension gaps reset sampling.

Shark yaw and pitch share a length-based turn multiplier: 1.15× at Pup, smoothly decreasing to 0.85× at Megalodon, in Room authority and client prediction. Wall returning-current steering remains authoritative.

Shark climb and dive pitch share a proportional limit over the final three units before the surface or seabed. The Room, local prediction and input use the same helper, preserving inward steering and leveling outward movement without contact snapping.

The arena wall is a non-lethal returning current: it turns shark headings inward with growing strength over the final 4 units and clamps positions 0.5 units inside the wall. Local prediction shares the current and clamp; bite and retirement remain the only death actions.

The chase camera follows closer and higher, framing a level-swimming shark in the lower third with more water ahead. Follow distance still scales with shark size and speed, and camera/aim positions stay clamped inside the water. Reduced motion still disables speed-based camera expansion and snaps directly to the follow pose.

Client aim assist gently nudges steering toward prey or living sharks at most two-thirds your length, within a 20° cone and 14 units. Its combined angular correction is capped at 0.25 rad/s. It defaults on with touch controls and off with keyboard controls; an explicit Controls Settings toggle persists on the device. Hits, damage and score remain server-owned.

Touch steering defaults to Simple: one floating flight stick starts anywhere in the chosen flight half, with automatic camera recentring and no look stick. Advanced dual-stick retains independent flight and camera look. Controls Settings switches schemes live and saves the choice on this device; switching releases active stick gestures. Desktop controls are unchanged.

Simple touch vertical deflection sets a proportional climb or dive target up to 0.85 rad; releasing the stick targets level even when Auto-level is off. Horizontal deflection remains a yaw rate. Advanced dual-stick and keyboard pitch retain their existing rate controls. Server movement and water-bound pitch limits remain authoritative.

Touch Bite is an 88 px round pad in the bottom corner opposite flight, with Dash above and inward. Advanced places the arc above the look pad. Radial rings and spoken labels show authoritative cooldowns; pads accept cooldown presses, with one bite buffered only during the final 200 ms. Pause, disconnect, rotation and hidden-page cleanup discard buffered intent. The Room still enforces cooldowns.

Portrait touch play uses a lower-left flight stick and bottom-right Bite and Dash by default; the flight-side setting mirrors the layout. Advanced keeps its look stick above the action pads. The HUD is compact, and tall aspect ratios widen camera framing up to 100° without changing server state. Rotation releases held sticks, ability pointers and buffered bites before play resumes.

The server-safe engine owns the unchanged shark size curve and oriented rest-pose geometry: mouth at 1.9 × scale, snout tip at 2.56 × scale and tail at 2.45 × scale behind. Renderer landmarks and camera framing share this geometry; damage and cooldown rules remain unchanged. Automated geometry tests cover size limits, yaw and pitch.

Prey consumption uses a swept capsule from the previous tick’s mouth to its current mouth, with radius 1.2 + 0.55 × shark scale plus prey radius. Humans eat at most four prey per tick and bots two; score and growth remain server-owned.

Bites measure the attacker mouth to the nearest point on the victim body axis, subtracting 0.62 × victim scale. Reach is 1.8 + 0.3 × attacker scale, with a 65° cone from the attacker position to that point. The nearest valid body surface wins, with stable id ties; bots use the same reach. Tail, flank and aimed-away cases have deterministic tests.

Bites devour sharks at most two-thirds the attacker’s length. Other bites deal 50 damage (60 during burst; regeneration between bites can require an additional hit), or 20 against a victim at least 1.5× longer. Kill rewards are 25% of victim score rounded and clamped to 5–60, and 25% of victim length clamped to 0.5–8; Apex bounty remains additive. Living sharks regenerate 4 HP/s up to 100 on the server clock; round results freeze health. Spawn protection and bite cooldown remain authoritative.

Client presentation classifies every other living shark at the same 1.5× devour boundary: ▼ eat, ■ even and ▲ danger. Shark rims and projected name tags use green, amber and red alongside those glyphs, and the depth radar repeats the glyph plus text label, so color is never the only cue. This presentation does not change server-owned combat authority.

The shared engine `OCEAN` defines the production tank: radius 120, seabed −18 and surface +18. Room creation, client volume cues and camera defaults share it; live snapshots remain authoritative. Prey budgets are 480 ambient fish, a cap of 720, eight top-ups per tick, 24 schools and 60 Frenzy chum. All quality modes retain the 70-unit fog boundary and 72-unit per-session prey visibility.

Initial bait schools roam the open water, spread uniformly by area outside the central Frenzy volume. About 35% of replenished bait is placed 10–30 units from a living human selected with seeded RNG over sorted player ids. Each living human spawn, respawn and round reset regroups four already-visible bait into a small school ahead without increasing the 480-fish population. Reef fish spawn inside one of eight coral sites, with home populations balanced to avoid local snapshot crowding, and orbit a deterministic home chosen from their existing school id; nearby sharks still trigger the original flee behavior. Frenzy supplies its central chum. The 14,000-byte per-session snapshot limit and protocol 12 remain unchanged.

The eight protocol-12 school species now have client-only instanced silhouettes and stripes: sardine, anchovy, silverside, clownfish, blue tang, yellow tang, angelfish and parrotfish. Decoded species codes select distinct proportions, body/head/tail palettes and bands; hashed fish IDs give stable ±15% size variation. Visual swim wobble is at most 0.14 units and zero with Reduced motion. Fish carry a slight emissive for fog readability; all X/Y/Z positions, consumption and protocol payloads remain authoritative and unchanged. The 14,000-byte snapshot regression remains enforced.

Reef appearance remains client-only: five instanced coral kinds use deterministic pink, purple, orange, yellow, teal and red per-piece colours, varied sizes and depth-based tint. Eight kelp patches between neighbouring reefs add one instanced draw (16/32/48 stalks by Low/Medium/High quality). Kelp tips sway in a vertex shader; Reduced motion sets its amplitude to zero. Neither system changes server authority, snapshots or the 14,000-byte full-room gate.

Tuna and ray prey (ST-265) are deterministic Room actors: two open-midwater tuna schools of five (5 points each) and one solitary near-seabed ray per reef (8 points each). Tuna move quickly and flee strongly; rays glide slowly with a short evasive response. Depletion is replenished within the existing 480-ambient/720-total quota, bot targets use authoritative prey value, and protocol 12 uses previously reserved species codes 12 and 14 without adding snapshot fields. Their streamlined and flat instanced silhouettes are now included with ST-267. The 14,000-byte per-session snapshot gate remains unchanged.
Squid and golden fish (ST-266) remain server-owned: twelve value-4 squid roam mid-water, darting for four ticks when chased according to stable ID and simulation tick. One value-12 golden fish appears on a 30-second round-relative grid, flees strongly and expires after 60 seconds uneaten. Golden fish replaces ambient bait, preserving 480 ambient / 720 total. Reserved protocol-12 codes 13 and 15 add no packet fields. ST-267 adds their dedicated instanced silhouettes, golden glow and sparkle. The 14,000-byte snapshot gate remains unchanged.

ST-272 bot fairness: Bots ignore sharks until four seconds after spawn grace ends, then pursue and bite only humans they can devour under the 1.5× rule; they can still evade older, larger threats. Bots retire at Great White length (78), not at score 240, and use their normal respawn. This server-owned deterministic change adds no protocol-12 fields and preserves the 14,000-byte snapshot limit.

ST-273 tier feedback is derived on the client from the local shark's authoritative length and round number. A per-life high-water tier tracker ignores repeated/reordered snapshots, new joins, reconnects, deaths and respawn baselines. A bounded toast, cosmetic CSS ring and existing SFX bus chime never change protocol 12, Room state or the 14,000-byte wire budget.

## Local eat feedback

The HUD derives cosmetic +N score gains and 1.5-second consecutive eat streaks solely from successive authoritative local score samples. A pure helper guards identity, tick ordering, death, respawn, reconnect and round resets. A pitch-limited local eat SFX is on the existing bounded browser audio graph; the floating +N is decorative and never affects Room authority or protocol 12.

The HUD uses one compact top bar for tier/progress, points, round clock, rank and a slim health meter. Frenzy and Apex countdowns share a small status-chip row below with eat streaks. Five flexible CSS tracks keep the bar on one row at 740×360 and 375 px wide, safe-area insets are respected, and the leaderboard starts below the HUD. The on-demand screen-reader snapshot, bounded score/streak and phase announcements remain available. Protocol 12 and the 14,000-byte snapshot gate are unchanged.

The leaderboard shows the top three plus your row, with original ordinal ranks, aria-current and Apex marking. It derives complete score ordering (including score ties and dead sharks) from the existing full snapshot, so your row remains available below tenth place without changing protocol 12. Touch starts with a closed native disclosure; tap or keyboard activation expands the same compact list and preserves expansion across broadcasts. Its 48 px summary alone intercepts pointers, and the panel sits below the HUD in the flight half, opposite the ability arc.

Camera-relative DOM edge arrows show at most four off-screen targets: devouring sharks within 40 units, Apex, active Frenzy centre and visible-snapshot golden fish. One slot per available kind precedes extra nearby threats, with no duplicated Apex shark. Pure homogeneous projection keeps behind-camera directions unmirrored and clamps to an inset ellipse; cards sharing a direction spread along that ellipse while their arrows keep the original bearing. Projection and DOM updates are bounded to 10 Hz, with no per-frame React state, extra network fields or server writes. Glyphs, distance and accessible names preserve meaning without colour; arrows never flash or ease, including Reduced motion, and High contrast uses explicit black/white borders. The text depth radar defaults to screen-reader-only on new devices; the existing saved display preference and Settings toggle remain available. Protocol 12 and the 14,000-byte snapshot gate are unchanged.

Shark name tags auto-size to their text at 11–12 px at the default font scale, with a 180 px cap and ellipsis for long names. At most five visible tags prioritize Apex, devouring threats and then nearest sharks with deterministic ID ties. Tags fade from full opacity at 30 units to hidden at 55 units, measured from the local shark (camera while spectating); your own label disappears after three seconds and resets on a new life, round or connection. Existing quality-bounded projection/DOM timers and the label setting remain. Edibility glyphs and a non-shrinking Apex badge remain visible; an observer clamps tags below the actual HUD, including status chips, font scaling and safe areas. Tags stay pointer-transparent, have no animated transition and retain explicit High contrast colours. Protocol 12 and the 14,000-byte snapshot gate are unchanged.

Death cards show the named cause, the local shark tier from existing snapshots and the life score, plus a large Respawn button with a decorative countdown ring and matching text. The existing 200 ms timer gates only client availability; the Room still enforces respawn. Death remains non-modal, with click-through surroundings, reachable tools and focus on Respawn when ready. Round results show a semantic top-three podium (winner centered visually), your rank and score, and a primary Play again action. Standings are captured from the first result snapshot seen on this connection, with the authoritative winner retained if it has left; the view stays stable as players leave or join. Play again and Escape dismiss the modal while the server countdown continues, and gameplay stays disabled until the next authoritative round. Existing focus trapping/restoration remains. Cards scroll on short screens and at larger font scales, respect safe areas and High contrast, and add no animation. Protocol 12 and the 14,000-byte snapshot gate are unchanged.

The main menu puts a large Play button and a shark preview beside inline display-name and named skin swatches, stacking on narrow screens. Selecting a native skin radio immediately updates the preview and device-local skin. Valid names save on blur, Settings or Play using the existing canonical name policy; rejected names expose an associated error and disable Play, while an empty draft uses Player. Play remains the initial focus target, radio focus is visible, and the preview adds no animation, WebGL context or network request. Customize is folded into the menu. Protocol 12 and the 14,000-byte snapshot gate are unchanged.

First-run coaching uses the existing device-local player record for monotonic hint progress and a single 30-second window starting on the first connected, living play. Touch sees “Drag to swim”; desktop sees the current remapped flight keys. “Eat fish to grow” points to the nearest visible bait/reef fish as the school anchor (school IDs remain server-only), then “Bite smaller sharks ▼” uses the existing 1.5× devour boundary. Steering intent, snapshot-derived fish growth and a server bite effect on a smaller shark clear their respective steps. Each new hint has a bounded polite DOM announcement and a 48 px Skip hints control. Completed, skipped and expired steps do not return after reload, reconnect or Settings reset; unfinished steps can resume only inside the original window. Pause, death, disconnection and hidden pages suppress success inference, while the 30-second deadline continues. Arrow projection and DOM sampling are bounded to 10 Hz, stop after completion, intercept no gameplay pointers and add no animation. No Room state, protocol-12 field, network request, dependency or 14,000-byte snapshot-gate change is added.

Shark anatomy uses rough, non-metallic lit materials under the existing ocean lights. Neutral vertex colours multiply each instance’s skin colour from a dark back to a light belly in shark rest space, so countershading follows pitch and bank. High contrast raises the dark shading floor; unlit edibility rims, eyes, Apex markers and semantic glyph/name cues remain readable. One smooth tapered profile joins tail, body, head and snout, with thin blade fins. Low/Medium/High use 12/20/32 longitudinal and 8/12/16 radial body segments, plus 2/3/4 fin curve segments. Five anatomy batches replace eight, reducing the maximum actor draw inventory from twelve to nine; Reduced motion keeps the rest pose. Protocol 12 and the 14,000-byte snapshot gate are unchanged.

Shark swimming uses a continuous vertex-shader spine wave on the tapered body and all four thin fins, with shared per-instance phase and amplitude. The head and eyes stay steady; the bend grows smoothly toward the tail, and normals follow the bend for lit volume. Stable actor phases advance on continuous client seconds without jumping when speed changes; amplitude rises from 0.12 at cruise to 0.4 at burst speed in shark rest-space units. Reduced motion sets amplitude to zero. All quality levels retain the wave with their existing detail budgets, five anatomy batches and nine maximum actor draws. Rest-space countershading, skin colours and High contrast remain intact. Protocol 12, server authority and the 14,000-byte snapshot gate are unchanged.

Lower jaws open for 150 ms on a connected local bite press (including a touch cooldown press) or a remote shark's advancing bite cooldown on the presentation timeline. Standard motion closes smoothly; Reduced motion holds one static open frame for the same window. Remote baselines, duplicate snapshots, death, round/timeline resets and reconnects do not replay bites. The split lower snout and opaque mouth interiors share the existing lit body batch, preserving five anatomy batches and nine maximum actor draws, the continuous speed-driven spine wave (zero amplitude in Reduced motion), thin fins, quality detail, skin countershading and High contrast. This is cosmetic: server authority, protocol 12 and the 14,000-byte snapshot gate remain unchanged.

Lunging sharks leave short instanced bubble streaks behind their oriented tails. Prey disappearance within 12 units of a living shark's shared mouth landmark produces a 320 ms, six-particle pop at the last prey position, in its species body colour. Wakes and pops each use at most one third of the existing 192/320/512 Low/Medium/High particle budget; impact bursts use the remaining capacity in the same single FX draw. Reduced motion removes both new cues and clears pending pops without replay. Connection, round, timeline, Frenzy/result transitions and stale gaps establish fresh inference baselines. Existing eat captions and semantic score/streak cues remain independent. Shark jaw timing, spine animation, lit tapered anatomy, thin fins, quality detail and High contrast are unchanged, as are server authority, protocol 12 and the 14,000-byte snapshot gate.

Confirmed local bite impacts and devours produce a bounded 180 ms camera shake; incoming damage also shakes and adds a 280 ms red edge vignette. Bitten living sharks brighten for 120 ms through their existing instanced skin colours, preserving rest-space countershading and High contrast. Camera motion disables all three effects, as does Reduced motion; disabled cues are discarded without replay. Flash batches and local damage edges each have a 400 ms minimum onset interval. Connection, identity, round/result, respawn, timeline regression and stale gaps reset the presentation baseline. The vignette is decorative and pointer-transparent; semantic health, edibility glyphs and existing independent combat captions remain available. These effects add no WebGL draws, per-frame React state, protocol fields or server writes. ST-289–ST-293 anatomy, lighting, spine/jaw animation and shared particle budgets remain intact; protocol 12 and the 14,000-byte snapshot gate are unchanged.
