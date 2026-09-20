import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function rows(path) {
  const lines = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
  return lines.slice(1).map((line) => line.split(","));
}

const changeRows = rows("docs/history/CHANGE-MAP.csv");
const nestedRows = rows("docs/history/NESTED-SOURCE-MAP.csv");
const sourceMappingTypes = new Set(["direct", "decomposed", "consolidated"]);
const failures = [];
const byId = new Map();

for (const row of changeRows) {
  const [id, commit, sourceRepository, sourceCommit, sourceDate, mappingType, release] = row;

  if (!/^ST-\d{3}$/.test(id)) failures.push(`invalid ST id: ${id}`);
  if (byId.has(id)) failures.push(`duplicate provenance id: ${id}`);
  byId.set(id, { commit, sourceRepository, sourceCommit, sourceDate, mappingType, release });

  if (!/^[0-9a-f]{40}$/.test(commit)) failures.push(`${id}: invalid public commit ${commit}`);
  if (!sourceRepository) failures.push(`${id}: missing imported source repository`);
  if (!sourceCommit) failures.push(`${id}: missing imported source commit`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) failures.push(`${id}: invalid source date ${sourceDate}`);
  if (!sourceMappingTypes.has(mappingType)) failures.push(`${id}: invalid source mapping type ${mappingType}`);
  if (!/^v\d+\.\d+\.\d+$/.test(release)) failures.push(`${id}: invalid release ${release}`);

  for (const sha of sourceCommit.split(/\s+/).filter(Boolean)) {
    if (!/^[0-9a-f]{7,40}$/.test(sha)) failures.push(`${id}: invalid source SHA ${sha}`);
  }
}

const historyById = new Map();
const log = execFileSync("git", ["log", "--no-merges", "--format=%H%x09%s"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

for (const line of log) {
  const [sha, subject] = line.split("\t");
  const id = subject.match(/^\[(ST-\d{3})\]/)?.[1];
  if (id) historyById.set(id, sha);
}

for (const [id, mapped] of byId) {
  const historyCommit = historyById.get(id);
  if (!historyCommit) {
    failures.push(`${id}: provenance row has no controlled commit in Git history`);
  } else if (historyCommit !== mapped.commit) {
    failures.push(`${id}: provenance maps ${mapped.commit}, Git history has ${historyCommit}`);
  }
}

for (const row of nestedRows) {
  const [id, repository, commit, sourceDate] = row;
  if (!byId.has(id)) failures.push(`nested source refers to unmapped provenance id ${id}`);
  if (!repository) failures.push(`${id}: missing nested source repository`);
  if (!/^[0-9a-f]{7,40}$/.test(commit)) failures.push(`${id}: invalid nested source SHA ${commit}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) failures.push(`${id}: invalid nested source date ${sourceDate}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Provenance: ${changeRows.length} imported-source mappings and `
  + `${nestedRows.length} nested-source mappings passed.`,
);
