import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function rows(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8").trim().split("\n").slice(1).map((line) => line.split(","));
}

const changeRows = rows("docs/history/CHANGE-MAP.csv");
const nestedRows = rows("docs/history/NESTED-SOURCE-MAP.csv");
const failures = [];
const byId = new Map();

for (const row of changeRows) {
  const [id, commit, sourceRepository, sourceCommit, sourceDate, mappingType, release] = row;
  if (!/^ST-\d{3}$/.test(id)) failures.push(`invalid ST id: ${id}`);
  if (byId.has(id)) failures.push(`duplicate ST id: ${id}`);
  byId.set(id, { commit, sourceRepository, sourceCommit, sourceDate, mappingType, release });
  if (!/^v\d+\.\d+\.\d+$/.test(release)) failures.push(`${id}: invalid release ${release}`);
  if (!/^(direct|decomposed|consolidated|forward-change|controlled-record)$/.test(mappingType)) failures.push(`${id}: invalid mapping type ${mappingType}`);
  if (sourceRepository && !sourceCommit) failures.push(`${id}: source repository without source commit`);
  for (const sha of sourceCommit.split(/\s+/).filter(Boolean)) if (!/^[0-9a-f]{7,40}$/.test(sha)) failures.push(`${id}: invalid source SHA ${sha}`);
  if (sourceDate && !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) failures.push(`${id}: invalid source date ${sourceDate}`);
}

for (let number = 1; number <= 31; number += 1) {
  const id = `ST-${String(number).padStart(3, "0")}`;
  if (!byId.has(id)) failures.push(`missing ${id}`);
}

const log = execFileSync("git", ["log", "--no-merges", "--format=%H%x09%s"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
for (const line of log) {
  const [sha, subject] = line.split("\t");
  const id = subject.match(/^\[(ST-\d{3})\]/)?.[1];
  if (!id) continue;
  const mapped = byId.get(id);
  if (!mapped) { failures.push(`${id}: commit exists without a map row`); continue; }
  if (id === "ST-031") {
    if (mapped.commit !== "v1.0.0") failures.push("ST-031: self-identifying record must resolve through v1.0.0");
    continue;
  }
  if (mapped.commit !== sha) failures.push(`${id}: map has ${mapped.commit}, history has ${sha}`);
}

for (const row of nestedRows) {
  const [id, repository, commit, sourceDate] = row;
  if (!byId.has(id)) failures.push(`nested source refers to unknown ${id}`);
  if (!repository || !/^[0-9a-f]{7,40}$/.test(commit)) failures.push(`${id}: invalid nested source ${repository} ${commit}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) failures.push(`${id}: invalid nested source date ${sourceDate}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Provenance: ${changeRows.length} change rows and ${nestedRows.length} nested-source rows passed.`);
