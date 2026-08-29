export type DebugAction = "PLAYER_JOIN" | "PLAYER_MOVE" | "PLAYER_TURN" | "SHARK_DASH" | "ROCKET_FIRE" | "FOOD_COLLISION" | "PLAYER_GROW" | "SCORE_UPDATE" | "GAME_STATE_SYNC" | "PLAYER_COLLISION" | "PLAYER_LEAVE";
export type DebugLanguage = "php" | "ts";

export interface DebugEvent {
  action: DebugAction;
  event: string;
  input?: Record<string, string | number | boolean>;
  result?: Record<string, string | number | boolean>;
  at: number;
}

export interface CodeExample { php: string[]; ts: string[]; highlight: number[] }

export const DEBUG_CODE: Record<DebugAction, CodeExample> = {
  PLAYER_JOIN: { php: ["$sharks[$sharkId] = makeShark(", "    $sharkId, $sharkName, $sharkSkin", ");"], ts: ["tank.sharks[sharkId] = makeShark(", "  tank, sharkId, sharkName, sharkSkin", ");"], highlight: [0, 1] },
  PLAYER_MOVE: { php: ["$nextX = $sharkHead['x'] + cos($sharkHeading) * $swimSpeed;", "$nextZ = $sharkHead['z'] + sin($sharkHeading) * $swimSpeed;", "$shark['trail'][] = ['x' => $nextX, 'z' => $nextZ];"], ts: ["const nextX = sharkHead.x + Math.cos(shark.heading) * swimSpeed;", "const nextZ = sharkHead.z + Math.sin(shark.heading) * swimSpeed;", "shark.trail.unshift({ x: nextX, z: nextZ });"], highlight: [0, 1, 2] },
  PLAYER_TURN: { php: ["$shark['targetHeading'] = $finAngle;", "$shark['heading'] = rotateToward(", "    $shark['heading'], $finAngle, SHARK_TURN_RATE", ");"], ts: ["shark.targetHeading = finAngle;", "shark.heading = rotateToward(", "  shark.heading, shark.targetHeading, SHARK_TURN_RATE", ");"], highlight: [0, 1, 2] },
  SHARK_DASH: { php: ["if ($tankTick >= $shark['dashCooldownTick']) {", "    $shark['lungeTicks'] = DASH_TICKS;", "    $shark['dashCooldownTick'] = $tankTick + DASH_COOLDOWN_TICKS;", "}"], ts: ["if (tank.tick >= shark.dashCooldownTick) {", "  shark.lungeTicks = DASH_TICKS;", "  shark.dashCooldownTick = tank.tick + DASH_COOLDOWN_TICKS;", "}"], highlight: [0, 1, 2] },
  ROCKET_FIRE: { php: ["$rocket = fireRocket($sharkHead, $sharkHeading);", "$tank['rockets'][] = $rocket;", "$shark['rocketCooldownTick'] = $tankTick + ROCKET_COOLDOWN_TICKS;"], ts: ["const rocket = fireRocket(sharkHead, shark.heading);", "tank.rockets.push(rocket);", "shark.rocketCooldownTick = tank.tick + ROCKET_COOLDOWN_TICKS;"], highlight: [0, 1, 2] },
  FOOD_COLLISION: { php: ["$chompDistance = hypot($snack['x'] - $sharkHead['x'], $snack['z'] - $sharkHead['z']);", "if ($chompDistance <= CHOMP_RADIUS + $snack['r']) {", "    $snacksChomped += $snack['value'];", "}"], ts: ["const chompDistance = Math.hypot(snack.x - sharkHead.x, snack.z - sharkHead.z);", "if (chompDistance <= CHOMP_RADIUS + snack.r) {", "  snacksChomped += snack.value;", "}"], highlight: [1, 2] },
  PLAYER_GROW: { php: ["$shark['size'] += $snacksChomped;", "$shark['silhouette'] = scaleShark(", "    $shark['size'], $shark['heading']", ");"], ts: ["shark.size += snacksChomped;", "shark.silhouette = scaleShark(", "  shark.size, shark.heading", ");"], highlight: [0, 1, 2] },
  SCORE_UPDATE: { php: ["$scoreBeforeChomp = $shark['score'];", "$shark['score'] += $snack['value'];", "$sharkBoard = rankSharks($tank);"], ts: ["const scoreBeforeChomp = shark.score;", "shark.score += snack.value;", "const sharkBoard = rankSharks(tank);"], highlight: [1] },
  GAME_STATE_SYNC: { php: ["$payload = json_encode(['t' => 'state', 'state' => $state]);", "foreach ($clients as $client) {", "    $client->send($payload);", "}"], ts: ["const payload = JSON.stringify({ t: \"state\", state: net });", "for (const ws of sessions) {", "  ws.send(payload);", "}"], highlight: [0, 2] },
  PLAYER_COLLISION: { php: ["if (sharkCollided($tank, $shark)) {", "    scatterShark($tank, $shark);", "}"], ts: ["if (sharkCollided(tank, shark)) {", "  scatterShark(tank, shark);", "}"], highlight: [0, 1] },
  PLAYER_LEAVE: { php: ["unset($tank['sharks'][$sharkId]);", "reportSharkCount($tank);"], ts: ["delete tank.sharks[sharkId];", "reportSharkCount();"], highlight: [0] },
};

export const DEMO_SEQUENCE: DebugEvent[] = [
  event("PLAYER_JOIN", "player joins the authoritative room", { name: "Player" }, { players: 1 }),
  event("PLAYER_MOVE", "server advances the shark", { x: 14, z: 8, direction: "RIGHT" }, { x: 15, z: 8 }),
  event("PLAYER_TURN", "steering target changes", { heading: 0, target: 1.57 }, { heading: 0.16 }),
  event("SHARK_DASH", "two-second dash cooldown starts", { cooldown: 0 }, { lungeTicks: 10, cooldown: 2 }),
  event("ROCKET_FIRE", "server creates a lethal projectile", { rockets: 0 }, { rockets: 1, cooldown: 3 }),
  event("FOOD_COLLISION", "shark chomps a snack", { distance: 0.7, chompRadius: 1.1 }, { gained: 1 }),
  event("PLAYER_GROW", "food value extends the body", { length: 8, gained: 1 }, { length: 9 }),
  event("SCORE_UPDATE", "food value is added to score", { score: 40, value: 10 }, { score: 50 }),
  event("GAME_STATE_SYNC", "authoritative snapshot broadcasts", { tick: 240 }, { clients: 1 }),
  event("PLAYER_COLLISION", "head intersects wall or another body", { alive: true }, { alive: false }),
];

function event(action: DebugAction, description: string, input?: DebugEvent["input"], result?: DebugEvent["result"]): DebugEvent { return { action, event: description, input, result, at: 0 }; }
