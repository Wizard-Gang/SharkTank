import { CONTROLLED_TYPES, parseControlledTitle } from "./change-contract.mjs";
import { createHash } from "node:crypto";

const emptyPlanHash = "59cdf5f8622ee928364b5647474b3a83f502c949bde9562d0a53a33291b090d0";

const historySectionPattern = /^#{1,6}\s+(?:Done|Completed|History|Retrospective)\b/im;
const taskHeadingPattern = /^###\s+(ST-\d{3})\s+(?:—|-)\s+\[([A-Z][A-Z0-9-]*)\]\s+([^\r\n]+?)\s*$/gm;
const controlledTypeSet = new Set(CONTROLLED_TYPES);

function deliveredNumber(lastDeliveredId) {
  if (lastDeliveredId === null) return 0;
  const match = /^ST-(\d{3})$/.exec(lastDeliveredId ?? "");
  return match ? Number(match[1]) : null;
}

export function validateImplementationPlan({ planExists, planContent = "", lastDeliveredId = null }) {
  const failures = [];
  if (!planExists) return ["implementation_plan.md must remain tracked, including when the queue is empty"];
  if (historySectionPattern.test(planContent)) failures.push("active implementation plan must not contain completed/history sections");
  const tasks = [...planContent.matchAll(taskHeadingPattern)].map((match) => ({ id: match[1], type: match[2], summary: match[3] }));
  if (tasks.length === 0) {
    const hash = createHash("sha256").update(planContent).digest("hex");
    if (hash !== emptyPlanHash) failures.push("empty implementation_plan.md must use the shared permanent queue template");
    return failures;
  }
  const delivered = deliveredNumber(lastDeliveredId);
  if (delivered === null) {
    failures.push(`unable to interpret delivered controlled history boundary: ${lastDeliveredId || "(empty)"}`);
    return failures;
  }
  for (const task of tasks) {
    const parsed = parseControlledTitle(`[${task.id}] [${task.type}] ${task.summary}`);
    if (!parsed || !controlledTypeSet.has(parsed.type)) {
      failures.push(`invalid controlled task heading: ${task.id} [${task.type}] ${task.summary}`);
      continue;
    }
    if (parsed.number <= delivered) failures.push(`${parsed.id} is already delivered through ${lastDeliveredId}; remove completed work from implementation_plan.md`);
  }
  return failures;
}
