import test from "node:test";
import assert from "node:assert/strict";
import { validateImplementationPlan } from "./implementation-plan.mjs";

function validate(planContent, lastDeliveredId = "ST-074") {
  return validateImplementationPlan({ planExists: true, planContent, lastDeliveredId });
}

test("genuine current and future task IDs ahead of delivered history pass", () => {
  const plan = ["# Active implementation plan","","Explanatory wording may change without becoming process state.","","## Open tasks","","### ST-075 — [TEST] Guard process boundaries","","Current work.","","### ST-078 — [BUILD] Prepare later work","","Future work."].join("\n");
  assert.deepEqual(validate(plan), []);
});

test("an already delivered task cannot remain active", () => {
  const plan = "## Open tasks\n\n### ST-074 — [BUILD] Already delivered\n";
  assert.match(validate(plan).join("\n"), /ST-074 is already delivered through ST-074/);
});

test("completed or history sections are not active queue substitutes", () => {
  const plan = "## Completed\n\n### ST-075 — [TEST] Historical placeholder\n";
  assert.match(validate(plan).join("\n"), /must not contain completed\/history sections/);
});

test("queue exhaustion is represented by no implementation plan", () => {
  assert.deepEqual(validateImplementationPlan({ planExists: false, planContent: "", lastDeliveredId: "ST-075" }), []);
});

test("an empty or completed-task placeholder must be deleted", () => {
  const plan = "# Active implementation plan\n\nAll work is complete.\n";
  assert.match(validate(plan).join("\n"), /delete exhausted implementation_plan\.md instead/);
});

test("harmless explanatory wording does not affect task semantics", () => {
  const first = "# Plan\n\n## Open tasks\n\n### ST-075 — [TEST] Guard process boundaries\n\nShort note.\n";
  const second = "# Plan\n\nThis explanation is intentionally different.\n\n## Open tasks\n\n### ST-075 — [TEST] Guard process boundaries\n\nAnother harmless note.\n";
  assert.deepEqual(validate(first), []);
  assert.deepEqual(validate(second), []);
});
