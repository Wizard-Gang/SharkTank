// Minimal, no-build 2D client for the PHP backend. Speaks the SAME wire protocol as the
// React/R3F client (hello / input / welcome / state / leaderboard / died), so it proves
// the PHP server is protocol-compatible. Top-down canvas render + mouse/keyboard steering.

const SKINS = {
  cyan: "#22e6ff", orange: "#ff8a1f", lime: "#57ff5a",
  magenta: "#ff43d4", gold: "#ffe14d", violet: "#a78bff",
};
const SKIN_IDS = Object.keys(SKINS);

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const lengthEl = document.getElementById("length");
const lbEl = document.getElementById("lb");

let dpr = Math.min(window.devicePixelRatio || 1, 2);
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
}
addEventListener("resize", resize);
resize();

// ── Net ──────────────────────────────────────────────────────────────────────
const WS_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.hostname}:8081`;
const myName = "Web" + Math.floor(Math.random() * 900 + 100);
const mySkin = SKIN_IDS[Math.floor(Math.random() * SKIN_IDS.length)];

let ws = null;
let youId = null;
let state = null;
let dead = false;
let lastHeading = Infinity;
let lastBoost = false;

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => ws.send(JSON.stringify({ t: "hello", name: myName, skin: mySkin }));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.t === "welcome") { youId = msg.youId; state = msg.state; dead = false; }
    else if (msg.t === "state") { state = msg.state; }
    else if (msg.t === "leaderboard") { renderLeaderboard(msg.entries); }
    else if (msg.t === "died") { dead = true; setTimeout(() => send({ t: "input", action: { type: "respawn" } }), 1600); }
  };
  ws.onclose = () => setTimeout(connect, 500);
  ws.onerror = () => ws.close();
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
connect();

// ── Input ────────────────────────────────────────────────────────────────────
addEventListener("pointermove", (e) => {
  const angle = Math.atan2(e.clientY - innerHeight / 2, e.clientX - innerWidth / 2);
  if (Math.abs(angle - lastHeading) > 0.03) {
    lastHeading = angle;
    send({ t: "input", action: { type: "setHeading", angle } });
  }
});
function setBoost(on) { if (on !== lastBoost) { lastBoost = on; send({ t: "input", action: { type: "setBoost", on } }); } }
addEventListener("pointerdown", (e) => { if (e.button === 0) setBoost(true); });
addEventListener("pointerup", (e) => { if (e.button === 0) setBoost(false); });

// ── Render ───────────────────────────────────────────────────────────────────
const SCALE = 9; // px per world unit
let camX = 0, camZ = 0;

function renderLeaderboard(entries) {
  lbEl.innerHTML = entries.map((e) =>
    `<li><span style="color:${SKINS[e.skin] || "#fff"}">●</span> ${escapeHtml(e.name)} — ${e.score}</li>`
  ).join("");
}
function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

function frame() {
  requestAnimationFrame(frame);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!state) return;

  const me = state.snakes.find((s) => s.id === youId && s.alive);
  if (me && me.segments[0]) { camX += (me.segments[0].x - camX) * 0.2; camZ += (me.segments[0].z - camZ) * 0.2; scoreEl.textContent = me.score; lengthEl.textContent = Math.round(me.length); }

  const cx = canvas.width / 2, cy = canvas.height / 2;
  const toX = (x) => cx + (x - camX) * SCALE * dpr;
  const toY = (z) => cy + (z - camZ) * SCALE * dpr;

  // Arena boundary
  ctx.strokeStyle = "#ff5a5a"; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.arc(toX(0), toY(0), state.arenaRadius * SCALE * dpr, 0, Math.PI * 2); ctx.stroke();

  // Food
  ctx.fillStyle = "#ffe14d";
  for (const f of state.food) {
    ctx.beginPath(); ctx.arc(toX(f.x), toY(f.z), Math.max(1.5, f.r * SCALE * 0.6 * dpr), 0, Math.PI * 2); ctx.fill();
  }

  // Snakes
  for (const s of state.snakes) {
    if (!s.alive || !s.segments.length) continue;
    const color = SKINS[s.skin] || "#33b679";
    ctx.strokeStyle = color; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.lineWidth = 1.3 * SCALE * dpr;
    ctx.beginPath();
    ctx.moveTo(toX(s.segments[0].x), toY(s.segments[0].z));
    for (let i = 1; i < s.segments.length; i++) ctx.lineTo(toX(s.segments[i].x), toY(s.segments[i].z));
    ctx.stroke();
    // Head + eyes
    const h = s.segments[0];
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(toX(h.x), toY(h.z), 0.95 * SCALE * dpr, 0, Math.PI * 2); ctx.fill();
    const fx = Math.cos(s.heading), fz = Math.sin(s.heading), px = -fz, pz = fx;
    for (const sgn of [-1, 1]) {
      const ex = h.x + fx * 0.35 + px * sgn * 0.35, ez = h.z + fz * 0.35 + pz * sgn * 0.35;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(toX(ex), toY(ez), 0.32 * SCALE * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0b0a14"; ctx.beginPath(); ctx.arc(toX(ex + fx * 0.12), toY(ez + fz * 0.12), 0.16 * SCALE * dpr, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (dead) {
    ctx.fillStyle = "rgba(6,5,12,.6)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f3f1ff"; ctx.textAlign = "center"; ctx.font = `${28 * dpr}px ui-sans-serif, system-ui`;
    ctx.fillText("You died — respawning…", cx, cy);
  }
}
requestAnimationFrame(frame);
