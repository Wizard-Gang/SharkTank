/**
 * ISO/IEC 27001:2022 and ISO/IEC 42001:2023 conformance register.
 *
 * This module is the evidence-based checklist that /audit/ renders. It holds no runtime
 * state and reaches no binding: every row is a fixed statement of what a certification
 * auditor asks for, what this service actually does about it, and which live route on
 * this site proves it. The point of the page is that the evidence is the running system,
 * not a folder of screenshots — so an evidence link is a URL an assessor can open now.
 *
 * Honesty rule for this file: a row may only claim `met` when a reader can verify it from
 * a route listed on that row. Everything else is `partial`, `gap`, `supplier` or
 * `excluded`, and `excluded` must carry the justification that would appear in the
 * Statement of Applicability. An overstated register fails a Stage 2 audit faster than an
 * honest one with open gaps.
 */

export type Status = "met" | "partial" | "gap" | "supplier" | "excluded";

export interface Evidence {
  label: string;
  /** A live route on this site. Absent means the artefact does not exist yet. */
  href?: string;
  /** True when the route is behind operations authentication. */
  auth?: boolean;
}

export interface Control {
  ref: string;
  title: string;
  /** What an assessor asks to see. Phrased as the audit question, not as marketing. */
  ask: string;
  status: Status;
  /** What this service actually does, or what is missing. */
  note: string;
  evidence: Evidence[];
}

export interface Register {
  id: string;
  standard: string;
  title: string;
  intro: string;
  controls: Control[];
}

const ev = (label: string, href?: string, auth?: boolean): Evidence => ({ label, href, auth });

/* ── Evidence shorthands ──────────────────────────────────────────────────────
   Every one of these is a route this Worker serves. Keep them in sync with the
   routing table in index.ts; a dead evidence link is a finding in its own right. */
const E = {
  register: ev("This register", "/controls/#registers"),
  trust: ev("Governance overview", "/"),
  policies: ev("Policy set", "/controls/#policies"),
  policiesJson: ev("Policy set (JSON)", "/policies.json"),
  docContext: ev("Context, scope and interested parties", "/controls/#context"),
  docSecurity: ev("Information security policy", "/controls/#security-policy"),
  docRoles: ev("Roles, responsibilities and authorities", "/controls/#roles"),
  docAi: ev("AI policy and impact assessment", "/controls/#ai-policy"),
  docRiskMethod: ev("Risk assessment process", "/controls/#risk-assessment"),
  docRiskTreatment: ev("Risk treatment process", "/controls/#risk-treatment"),
  docSoa: ev("Statement of Applicability", "/controls/#statement-of-applicability"),
  docPlan: ev("Risk treatment plan", "/controls/#risk-treatment-plan"),
  docObjectives: ev("Security and AI objectives", "/controls/#objectives"),
  docLifecycle: ev("AI system life cycle", "/controls/#ai-lifecycle"),
  docSecureDev: ev("Secure development and operations", "/controls/#secure-development"),
  docAccess: ev("Access control, supplier and endpoint policy", "/controls/#access-and-suppliers"),
  docLegal: ev("Legal, regulatory and contractual register", "/controls/#legal-register"),
  manifest: ev("Register as JSON", "/audit/manifest.json"),
  change: ev("Change record", "/evidence/#changes"),
  changeJson: ev("Change record (JSON)", "/roadmap.json"),
  incidents: ev("Incident record", "/evidence/#incidents"),
  incidentsJson: ev("Incident record (JSON)", "/incidents.json"),
  receipts: ev("Control receipt chain", "/evidence/#receipts"),
  logs: ev("Service and tank logs", "/evidence/#logs"),
  logsJson: ev("Logs (JSON)", "/logs.json"),
  status: ev("Availability status", "/evidence/#availability"),
  statusJson: ev("Status (JSON)", "/status.json"),
  inquiry: ev("Cost and capacity meters", "/evidence/#spend"),
  inquiryJson: ev("Cost meters (JSON)", "/spend.json"),
  api: ev("API reference", "/docs/"),
  openapi: ev("OpenAPI document", "/openapi.json"),
  intake: ev("Security report intake", "/docs/#op-post-api-security-report"),
  admin: ev("Operations control panel", "/admin/", true),
  adminStatus: ev("Full operational record", "/admin/status.json", true),
  adminLog: ev("90-day action log", "/admin/log.json", true),
  adminGame: ev("Deterministic tank log", "/admin/game/room-1.jsonl", true),
  adminReplay: ev("Deterministic replay at a tick", "/admin/replay/room-1?tick=100", true),
  docDocInfo: ev("Control of documented information", "/controls/#documented-information"),
  docNonconformity: ev("Nonconformity and corrective action", "/controls/#nonconformity"),
  docAssets: ev("Asset inventory and classification", "/controls/#asset-inventory"),
  docContinuity: ev("Continuity, backup and restore", "/controls/#continuity"),
  docRecords: ev("Operating records", "/controls/#operating-records"),
  docPlanning: ev("Operational planning and performance", "/controls/#operational-planning"),
  docAudit: ev("Internal audit and management review", "/controls/#audit-and-review"),
  backupStatus: ev("State copies and restore drills", "/evidence/#continuity"),
  adminBackup: ev("Full state export", "/admin/backup.json", true),
  game: ev("Live Shark Tank demo", "/play/"),
};

/* ── Change management ────────────────────────────────────────────────────────
   ISO/IEC 27001 asks for change control in four separate places — Clause 6.3
   (planned changes to the management system), Clause 8.1 (control of planned
   changes and review of unintended ones), A.8.32 (change management proper) and
   the development controls A.8.25 to A.8.34. ISO/IEC 42001 adds Clause 6.3 and
   A.6.2.5/A.6.2.6 for changes to the AI system itself. These are the processes
   that have to exist, be operated, and leave records. */

export interface ChangeProcess {
  id: string;
  title: string;
  purpose: string;
  trigger: string;
  status: Status;
  /** The procedure as actually operated. Each step must be observable in evidence. */
  steps: string[];
  /** The record the step produces — this is what the auditor samples. */
  records: string[];
  /** Clause and control references this process discharges. */
  clauses: string[];
  evidence: Evidence[];
}

export const CHANGE_PROCESSES: readonly ChangeProcess[] = [
  {
    id: "CM-01",
    title: "Change classification and risk assessment",
    purpose: "Every change is classified before it is built, so the amount of control applied matches the risk it carries.",
    trigger: "Any proposed alteration to code, configuration, bindings, retention, or the operations gate.",
    status: "met",
    steps: [
      "Classify the change as feature, enhancement, fix, bonus or hotfix.",
      "State the security consequence: does it touch authentication, public input, retention, or spend.",
      "Assess whether the change alters the risk treatment already recorded for the affected control.",
      "Record the classification against the change identifier before work starts.",
    ],
    records: ["Change identifier and label on the published change record", "Deployment grouping", "Classification record in DOC-27, naming the class assigned to every change and what the class decides"],
    clauses: ["27001 Clause 6.3", "27001 Clause 8.1", "27001 A.8.32", "42001 Clause 6.3"],
    evidence: [E.change, E.changeJson, E.docRecords],
  },
  {
    id: "CM-02",
    title: "Change request and change record",
    purpose: "No change reaches production without a record that says what changed, why, and what proves it works.",
    trigger: "Start of any unit of work intended for production.",
    status: "met",
    steps: [
      "Open a change entry with a unique identifier in the WG-### series.",
      "Write the title as the outcome, and the summary as the problem it closes.",
      "List the evidence items the change is expected to produce.",
      "Attach the reference the change answers to, where one exists — a report, an incident, a review finding.",
    ],
    records: ["Published change entry with identifier, title, summary, evidence list and reference"],
    clauses: ["27001 A.8.32", "27001 A.5.37", "42001 A.6.2.3"],
    evidence: [E.change, E.changeJson],
  },
  {
    id: "CM-03",
    title: "Authorisation before deployment",
    purpose: "A change is deployed by an authorised person, and the authorisation is visible after the fact.",
    trigger: "A change has passed the verification gate and is ready to release.",
    status: "met",
    steps: [
      "The change is released only through the credentialed deployment path.",
      "Control actions taken around the release — closing the tank, restoring it — require operations authentication, a same-origin request, and an explicit action header.",
      "Each control action is written to the append-only receipt chain with a sequence number and a hash of the previous entry.",
    ],
    records: ["Control receipt with sequence, code, decision, outcome, timestamp and hash", "Authorisation record in DOC-27 — the deployment batch identifier carried by every change entry, which is the authorisation and the change as one record"],
    clauses: ["27001 A.8.32", "27001 A.5.3", "27001 A.8.2"],
    evidence: [E.receipts, E.admin, E.docRecords],
  },
  {
    id: "CM-04",
    title: "Separation of development, test and production",
    purpose: "Development can never reach production data or production storage by accident.",
    trigger: "Continuous — a property of the environment, checked at every change.",
    status: "met",
    steps: [
      "Development runs the production runtime locally with its own in-memory storage, which starts empty on every run.",
      "Development and production bind different object storage buckets and different durable storage.",
      "The production environment is a separate named configuration in one version-controlled file; nothing is configured by hand at the edge.",
    ],
    records: ["Environment configuration under version control", "Separate bucket names per environment"],
    clauses: ["27001 A.8.31", "27001 A.8.33", "42001 A.6.2.5"],
    evidence: [E.api, E.adminStatus],
  },
  {
    id: "CM-05",
    title: "Pre-deployment verification gate",
    purpose: "A change that does not build, does not type-check, or carries damaged whitespace is stopped before release.",
    trigger: "Immediately before every deployment, including hotfixes.",
    status: "partial",
    steps: [
      "Build the client bundle.",
      "Type-check the Worker and the client with no emit.",
      "Check the working tree and the submodule for whitespace and conflict damage.",
      "Exercise the changed routes against the local runtime, which is the same runtime as production.",
    ],
    records: ["Gate output retained by the operator", "Post-deploy route checks recorded in the change entry evidence"],
    clauses: ["27001 A.8.29", "27001 A.8.32", "42001 A.6.2.4"],
    evidence: [E.change],
  },
  {
    id: "CM-06",
    title: "Deployment and release control",
    purpose: "Production changes as one atomic, identified unit, and the running version is knowable.",
    trigger: "Release of an authorised change.",
    status: "met",
    steps: [
      "The whole bundle — Worker, durable classes, static assets and configuration — deploys as a single version.",
      "The platform mints a version identifier that the Worker reads back at runtime.",
      "The billing measurement window resets on the new version, so post-release consumption is attributable to the release.",
      "The version identifier is withheld from public output and kept in the authenticated operational record.",
    ],
    records: ["Version identifier in the authenticated status record", "Measurement window start"],
    clauses: ["27001 A.8.19", "27001 A.8.9", "27001 A.8.32"],
    evidence: [E.adminStatus, E.inquiry],
  },
  {
    id: "CM-07",
    title: "Configuration and secret management",
    purpose: "Runtime configuration is declared, reviewable and reproducible; secrets never enter the record.",
    trigger: "Any change to bindings, variables, routes, retention generations or limits.",
    status: "partial",
    steps: [
      "All bindings, variables and routes live in one version-controlled configuration file.",
      "Account identifiers and credentials are held outside version control and injected at deploy time.",
      "The operations credential exists only as a platform secret; there is no fallback path when it is absent, and the gate denies instead.",
      "Retention generations are configuration values, so a data reset is an auditable configuration change rather than an ad-hoc deletion.",
    ],
    records: ["Configuration diff per change", "Denial behaviour observable at the gate"],
    clauses: ["27001 A.8.9", "27001 A.5.17", "27001 A.8.24"],
    evidence: [E.admin, E.change],
  },
  {
    id: "CM-08",
    title: "Rollback and recovery",
    purpose: "A bad change can be withdrawn without losing the record of what happened.",
    trigger: "A release that degrades availability, correctness or spend.",
    status: "partial",
    steps: [
      "Close the tank from the control panel; the portal, evidence routes and this register stay online.",
      "Redeploy the previous version, or deploy a forward fix.",
      "Restore tank access, which records the end of service impact as a separate event from the cause.",
      "Durable state survives the version change: uptime, scores and the receipt chain are not reset by a rollback.",
    ],
    records: ["Two receipts — impact start and impact end", "Incident entry with cause and duration"],
    clauses: ["27001 A.8.32", "27001 A.5.29", "27001 A.5.30"],
    evidence: [E.receipts, E.incidents, E.admin],
  },
  {
    id: "CM-09",
    title: "Emergency change (hotfix)",
    purpose: "Urgent security or availability fixes bypass waiting, never bypass recording.",
    trigger: "A security report, an active incident, or a defect with user impact.",
    status: "met",
    steps: [
      "Record the trigger — report identifier, incident, or review finding — before the fix ships.",
      "Apply the smallest change that closes the finding.",
      "Deploy through the same gate as a planned change; the gate is not skipped.",
      "Publish the change entry with its closure time and the evidence it produced, marked as a hotfix.",
    ],
    records: ["Hotfix change entry with closure time and reference", "Incident and receipt where service was affected"],
    clauses: ["27001 A.8.32", "27001 A.5.26", "27001 A.5.27"],
    evidence: [E.change, E.incidents],
  },
  {
    id: "CM-10",
    title: "Post-implementation review and learning",
    purpose: "Each change is checked in production against the outcome it claimed, and what was learned is written down.",
    trigger: "After every deployment.",
    status: "met",
    steps: [
      "Re-check the affected routes on production after release.",
      "Confirm the evidence items claimed by the change entry are actually observable.",
      "Where the change answered an incident or a report, record the closure against that record.",
      "Feed recurring failure modes back into the verification gate.",
    ],
    records: ["Evidence list per change entry", "Incident closure state", "Post-implementation review record in DOC-27, sampled against the evidence bullets written after each change shipped"],
    clauses: ["27001 Clause 10.1", "27001 A.5.27", "42001 A.6.2.6"],
    evidence: [E.change, E.incidents, E.docRecords],
  },
  {
    id: "CM-11",
    title: "Review of unintended change",
    purpose: "Clause 8.1 requires the consequences of unintended changes to be reviewed and acted on, not only planned ones.",
    trigger: "Behaviour changes that nobody requested — platform behaviour, dependency drift, state loss, measurement resets.",
    status: "met",
    steps: [
      "Detect through the live meters and status surface rather than by report alone.",
      "Record the observation as an incident where service was affected.",
      "Determine whether it originated in this service, in configuration, or upstream at the platform.",
      "Where the service must tolerate it, change the service and record that as a normal change.",
    ],
    records: ["Incident entry", "Change entry where a tolerance was added", "Unintended-change review record in DOC-27, across four independent signals", "Daily state copy under a digest, making an unintended change to durable state detectable by comparison"],
    clauses: ["27001 Clause 8.1", "27001 A.8.16", "27001 Clause 10.2"],
    evidence: [E.incidents, E.status, E.inquiry, E.docRecords, E.backupStatus],
  },
  {
    id: "CM-12",
    title: "Supplier and platform change monitoring",
    purpose: "Changes made by the infrastructure provider are watched, because they change this service's risk without asking.",
    trigger: "Provider runtime, storage or edge behaviour changes; compatibility date changes.",
    status: "met",
    steps: [
      "Review the pinned runtime compatibility date against the provider's published runtime changes.",
      "Review the provider's published changes to the terms under which the service is offered.",
      "Check the incident record for anything attributable to the provider since the last review.",
      "Record the outcome as a dated record, whether or not anything changed.",
    ],
    records: ["Supplier monitoring record in DOC-27, dated and stating what was examined", "The pinned compatibility date in tracked configuration"],
    clauses: ["27001 A.5.22", "27001 A.5.23", "27001 A.5.19"],
    evidence: [ev("Supplier review record required"), E.docRecords, E.docAccess],
  },
  {
    id: "CM-13",
    title: "Change record retention and integrity",
    purpose: "The change and control record must be there, complete and unaltered, when the auditor arrives.",
    trigger: "Continuous.",
    status: "met",
    steps: [
      "Control decisions are appended to a hash chain; each entry carries the hash of the previous one.",
      "Every entry is re-derived from its own contents on read, and the verdict is stated on the page rather than assumed.",
      "An edited entry is named by sequence number; a removed entry is detected against the separate incident record.",
      "Receipts are exempt from the 90-day action-log retention window, so evidence does not age out.",
    ],
    records: ["Receipt chain with head hash and entry count", "Stated integrity verdict"],
    clauses: ["27001 A.5.28", "27001 A.5.33", "27001 A.8.15"],
    evidence: [E.receipts, E.incidentsJson],
  },
  {
    id: "CM-14",
    title: "AI system change control",
    purpose: "Changes to the autonomous agents that share the tank with players are controlled and reproducible.",
    trigger: "Any change to agent behaviour, difficulty, population, or the simulation that governs them.",
    status: "partial",
    steps: [
      "Agent behaviour is server-authoritative code, deployed as part of the same versioned bundle as everything else.",
      "Each tank writes a deterministic log — seed plus the ordered action stream — so a session can be replayed exactly at any tick.",
      "A behaviour change is therefore observable as a change in replayable output, not only as a claim.",
      "An impact assessment for behaviour changes affecting players is not yet produced.",
    ],
    records: ["Deterministic tank log", "Replay at a chosen tick", "Change entry"],
    clauses: ["42001 Clause 6.3", "42001 A.6.2.5", "42001 A.6.2.6", "42001 A.6.2.8"],
    evidence: [E.adminGame, E.adminReplay, E.change],
  },
] as const;

/* ── Mandatory documented information ─────────────────────────────────────────
   The Stage 1 document review. An assessor works down a list very close to this
   one and asks to see each item before Stage 2 is scheduled. */

export interface DocumentItem {
  ref: string;
  title: string;
  clause: string;
  status: Status;
  note: string;
  evidence: Evidence[];
}

export const MANDATORY_DOCUMENTS: readonly DocumentItem[] = [
  { ref: "DOC-01", title: "Scope of the information security management system", clause: "27001 Clause 4.3", status: "met", note: "Issued as a controlled scope statement: the boundary, what is inside it, the interfaces, and the exclusions with their justification.", evidence: [E.docContext, E.api] },
  { ref: "DOC-02", title: "Information security policy", clause: "27001 Clause 5.2", status: "met", note: "Issued and published. Covers what is protected and in what order, what is held about a player, what the service refuses to do, and acceptable use.", evidence: [E.docSecurity, E.policiesJson] },
  { ref: "DOC-03", title: "Information security roles and responsibilities", clause: "27001 Clause 5.3", status: "met", note: "Issued: four roles with their authority, what each may do, and an explicit statement of what a single operator cannot separate.", evidence: [E.docRoles] },
  { ref: "DOC-04", title: "Information security risk assessment process", clause: "27001 Clause 6.1.2", status: "met", note: "Issued: one method for security and the AI system together, with worded five-point scales, consequence judged against what the security policy protects and in its order, acceptance bands, and an overriding rule that treats any consequence-five risk whatever its likelihood.", evidence: [E.docRiskMethod, E.policiesJson] },
  { ref: "DOC-05", title: "Information security risk treatment process", clause: "27001 Clause 6.1.3", status: "met", note: "Issued: how treat, accept, avoid and share are chosen, why sharing is available only where the supplier already carries the risk, cost as a constraint on treatment under the spend ceiling, the Annex A comparison, and how approval is evidenced by the deployment that publishes it.", evidence: [E.docRiskTreatment, E.policiesJson] },
  { ref: "DOC-06", title: "Statement of Applicability", clause: "27001 Clause 6.1.3 d)", status: "met", note: "Issued with a controlled cover: scope, approval by the Owner, the deployment that is its version, the two grounds on which anything is excluded, and the status vocabulary with the rule that met requires a live route on the row. The controls themselves stay in this register so the Statement and the running service cannot drift apart.", evidence: [E.docSoa, E.register, E.manifest] },
  { ref: "DOC-07", title: "Risk treatment plan", clause: "27001 Clause 6.1.3 e)", status: "met", note: "Issued: twelve assessed risks, each scored under the stated method with the decision taken, what is in place, and what is left. Ten are treated or accepted with the residual named; two stay open — no dependency scanning, and no route by which a player can have their profile erased. The backup risk was the third and is now treated, with a daily digested copy and a drilled restore, leaving a stated residual rather than an open item.", evidence: [E.docPlan, E.policiesJson] },
  { ref: "DOC-08", title: "Information security objectives", clause: "27001 Clause 6.2", status: "met", note: "Issued: five security objectives and four for the AI system, each with a target, the route its measurement is taken from and when it is evaluated. Every objective is measurable from published evidence, on the rule that an objective this service cannot measure from its own routes is one it cannot honestly report against.", evidence: [E.docObjectives, E.status, E.inquiry] },
  { ref: "DOC-09", title: "Evidence of competence", clause: "27001 Clause 7.2", status: "met", note: "Issued: the competence required for the roles held, the basis on which it is held — the service itself, whose controls are implemented and demonstrable from public routes — and, recorded alongside it, the competence not held: no formal qualification in either standard, and no independent audit competence, the latter a structural limit rather than a training gap.", evidence: [E.docAudit, E.policiesJson] },
  { ref: "DOC-10", title: "Documented information determined as necessary", clause: "27001 Clause 7.5.1", status: "met", note: "Issued: what counts as a document and what counts as a record and why the two are controlled differently, identification and format, the version being the deployment that published it, distribution, protection, retention windows, and the mechanical check that catches the failure this arrangement is most likely to produce — a renamed anchor that silently breaks every row pointing at it.", evidence: [E.docDocInfo, E.policiesJson, E.manifest] },
  { ref: "DOC-11", title: "Operational planning and control records", clause: "27001 Clause 8.1", status: "met", note: "Every production change is recorded with an identifier, a deployment grouping and its evidence; control actions are receipted.", evidence: [E.change, E.receipts] },
  { ref: "DOC-12", title: "Results of information security risk assessments", clause: "27001 Clause 8.2", status: "met", note: "The results are published as the risk treatment plan, with likelihood, consequence and score for each risk under the stated method. The earlier independent review remains what several of those entries were identified from, and its findings are closed as recorded changes.", evidence: [E.docPlan, E.change] },
  { ref: "DOC-13", title: "Results of information security risk treatment", clause: "27001 Clause 8.3", status: "met", note: "Each treatment is a published change entry naming the finding it closes, the fix, and the evidence produced, and the treatment plan records what is in place and what residual risk the Owner is accepting on each.", evidence: [E.docPlan, E.change, E.changeJson] },
  { ref: "DOC-14", title: "Monitoring and measurement results", clause: "27001 Clause 9.1", status: "met", note: "Availability, capacity, spend and action volume are measured continuously and published, with the raw figures available as JSON.", evidence: [E.status, E.statusJson, E.inquiry, E.logs] },
  { ref: "DOC-15", title: "Internal audit programme and results", clause: "27001 Clause 9.2", status: "partial", note: "Issued, and run: frequency, method, criteria and full scope over both standards, with what this version's pass actually did — every evidence link fetched, every changed status re-derived from the code behind it, and the backup control tested by execution rather than inspection. What it is missing is stated precisely rather than glossed: objectivity. Partial for that reason, and not excludable, because this is a management-system requirement rather than an Annex A control.", evidence: [E.docAudit, E.manifest] },
  { ref: "DOC-16", title: "Management review results", clause: "27001 Clause 9.3", status: "met", note: "Held and recorded with every required input — previous actions, external and internal issues, performance, nonconformities, monitoring and audit results, interested-party feedback, risk results and improvement opportunities — and with documented outputs as five numbered decisions, including that dependency scanning is the next engineering item ahead of further documentation.", evidence: [E.docAudit, E.policiesJson] },
  { ref: "DOC-17", title: "Nonconformities and corrective actions", clause: "27001 Clause 10.2", status: "met", note: "Issued with five nonconformities recorded, each classified as a documentation, control or design fault, each with its cause and a recurrence check asking what else in the service has the same shape as the thing that failed. It also states what is deliberately not a nonconformity — a recorded gap, and an accepted residual risk — so the process is not flooded with items that have already been through it.", evidence: [E.docNonconformity, E.change, E.receipts] },
  { ref: "DOC-18", title: "Inventory of information and associated assets", clause: "27001 A.5.9", status: "met", note: "Issued: eight assets with owners and classifications, exhaustive rather than representative because everything in scope is bound in one configuration file the deployment reads. It carries the three-tier scheme and — the part that matters — how the scheme is enforced, which is by one route list every gate consults rather than by labelling.", evidence: [E.docAssets, E.inquiry] },
  { ref: "DOC-19", title: "Acceptable use, access control and supplier policies", clause: "27001 A.5.10, A.5.15, A.5.19", status: "met", note: "Issued in three parts. Access control: two levels, no roles between them, enforced from one gate list so a new control route cannot be added without being gated. Supplier: one provider, total dependency, and exactly what is entrusted to it. Endpoint: the rules for the one machine, with the line drawn between what the repository can prove and what is attested. Acceptable use remains in the security policy.", evidence: [E.docAccess, E.docSecurity, E.admin] },
  { ref: "DOC-20", title: "Incident management procedure", clause: "27001 A.5.24", status: "met", note: "Intake, assessment, response, restoration and closure are separate documented operations, each with its own route and its own record.", evidence: [E.intake, E.incidents, E.receipts] },
  { ref: "DOC-21", title: "Business continuity and ICT readiness plan", clause: "27001 A.5.29, A.5.30", status: "met", note: "Issued: what disruption means for a service with no availability commitment — not losing the evidence rather than keeping the game up — what is copied, the schedule and retention, how a failed copy is made visible rather than silent, and the restore drill that reads the stored copy back out of object storage and compares digests. It is explicit about what is still not claimed: no recovery objective is committed to, and no real recovery has been executed.", evidence: [E.docContinuity, E.backupStatus, E.status] },
  { ref: "DOC-22", title: "Legal, statutory, regulatory and contractual register", clause: "27001 A.5.31", status: "met", note: "Issued: data protection with the exhaustive field list, purpose, basis and the retention rule stated accurately; the privacy notice itself; the provider's terms; the licence inventory of everything shipped; the standards as voluntary criteria; and what does not apply. Three items are recorded open — no erasure route, no age gate, and which supervisory authority is the lead one, which needs the Owner rather than the service.", evidence: [E.docLegal, E.policiesJson] },
  { ref: "DOC-23", title: "Logging, retention and evidence handling procedure", clause: "27001 A.5.28, A.5.33, A.8.15", status: "met", note: "Retention is enforced in code — 90 days for the action log, 24 hours for tank captures, no expiry for control receipts — and public writes are capped so they cannot evict recorded evidence.", evidence: [E.logs, E.logsJson, E.receipts] },
  { ref: "DOC-24", title: "Secure development and change management procedure", clause: "27001 A.8.25, A.8.32", status: "met", note: "Issued: coding rules, the content security policy scheme and why the asset policy differs, the four documented uses of cryptography with their key management, the release gate and its contract checks, how the production deploy refuses, and the two weaknesses recorded rather than dressed — no dependency scanning and no automated pipeline behind the gate.", evidence: [E.docSecureDev, E.register, E.change] },
  { ref: "DOC-25", title: "AI policy and AI system impact assessment", clause: "42001 Clause 5.2, 6.1.4", status: "met", note: "Issued: the AI policy and the impact assessment in one document, exact about the system being deterministic rules rather than a learned model.", evidence: [E.docAi, E.adminReplay] },
  { ref: "DOC-27", title: "Operating records", clause: "27001 A.5.18, A.5.22, A.5.36; 42001 A.2.4", status: "met", note: "Issued: the dated first performance of four recurring activities that had been defined and never run — an access review enumerating every non-public route against the one list every gate consults, a supplier monitoring pass under the 90-day cycle, a compliance review against this policy set, and the AI policy review. Each states what was examined rather than only that it happened, and the supplier record restates the undischarged certificate condition instead of quietly closing it.", evidence: [E.docRecords, E.manifest] },
  { ref: "DOC-28", title: "Operational planning, resources, communication and performance", clause: "27001 Clause 4.4, 7.1, 7.4, 8.1; 42001 Clause 9.1", status: "met", note: "Issued: the management system stated as processes with their interactions, resources named exactly including the ones that do not exist and the register rows they directly cause, what is communicated to whom and when, and the AI monitoring measures — with the limit stated that these are verification measures rather than outcome measures.", evidence: [E.docPlanning, E.policiesJson] },
  { ref: "DOC-29", title: "Internal audit programme and management review", clause: "27001 Clause 5.1, 7.2, 7.3, 9.3", status: "met", note: "Issued: the audit programme with its objectivity limitation stated first rather than buried, the management review with all required inputs and five numbered decisions, leadership evidenced by what was chosen when nobody was watching, and competence recorded together with the competence not held. It also records why three Annex A controls are excluded and why the audit clause itself cannot be.", evidence: [E.docAudit, E.policiesJson] },
] as const;

/* ── ISO/IEC 27001:2022, Clauses 4 to 10 ─────────────────────────────────────
   The management system requirements. Annex A cannot compensate for a gap here:
   a missing policy or a missing management review is a major nonconformity on
   its own, however good the technical controls are. */

const ISO27001_CLAUSES: Control[] = [
  { ref: "4.1", title: "Understanding the organisation and its context", ask: "Show the internal and external issues relevant to the management system, and how they were determined.", status: "met", note: "Written up as the context section of the policy set: what the service is, the five dollar ceiling that dominates every design judgement, the single operator, and the deliberate choice to publish evidence rather than assert it.", evidence: [E.docContext, E.inquiry] },
  { ref: "4.2", title: "Needs and expectations of interested parties", ask: "Show who the interested parties are and which of their requirements are relevant to security.", status: "met", note: "Interested parties are named with what each needs: players, the infrastructure provider, and anyone reporting a security problem. It also records that no regulator, customer or contractual counterparty exists.", evidence: [E.docContext, E.intake] },
  { ref: "4.3", title: "Determining the scope of the ISMS", ask: "Show the documented scope, its boundaries, and the justification for anything excluded.", status: "met", note: "The scope statement names what is in — one Worker, two durable classes, one bucket, the routes in the API reference — and what is out: the operator's device, the player's browser, and the platform, which is handled as a supplier.", evidence: [E.docContext, E.api] },
  { ref: "4.4", title: "Information security management system", ask: "Show that the ISMS and its processes are established, implemented, maintained and continually improved.", status: "met", note: "The management system is stated as a set of processes with their interactions — risk assessment feeds the treatment plan, the plan produces changes, changes ship through the change process into the public change record, operating them produces records, and the register cites those records. It is not maintained separately from the service: every part of it renders from source that ships in the same artefact, so the two cannot drift between releases.", evidence: [E.docPlanning, E.register, E.change] },
  { ref: "5.1", title: "Leadership and commitment", ask: "Show how top management demonstrates commitment: resources, direction, integration into business processes.", status: "met", note: "Policy and objectives established and published; resources provided to the stated limit and the limit named rather than implied; management system requirements integrated into the service's own processes to the point of being the same processes. The specific evidence of direction is that the register's honesty rule is written into its own source and has cost readiness at every pass, including this one.", evidence: [E.docAudit, E.docRoles, E.docObjectives] },
  { ref: "5.2", title: "Information security policy", ask: "Show an approved, communicated, available policy appropriate to the purpose of the organisation.", status: "met", note: "Issued as the information security policy: what is protected and in what order, what is actually held about a player, what the service refuses to do, and what acceptable use means. Published rather than filed, so it is available by definition.", evidence: [E.docSecurity, E.policiesJson] },
  { ref: "5.3", title: "Roles, responsibilities and authorities", ask: "Show who is assigned which security responsibility, and who reports on ISMS performance.", status: "met", note: "Four roles are named with their authority — owner, operator, developer, responder — together with which actions each may take and what evidence each action leaves behind.", evidence: [E.docRoles, E.receipts] },
  { ref: "6.1.1", title: "Actions to address risks and opportunities", ask: "Show how risks and opportunities were determined and how the actions are integrated into the ISMS.", status: "met", note: "Determination is documented as four standing sources — the open rows of this register, the public report intake, the incident record and the cost meters — plus a trigger on any change that adds a binding, adds a route class, alters retention or touches authentication. The resulting actions are integrated by being change entries with identifiers, which is the only path to production.", evidence: [E.docRiskMethod, E.docPlan, E.change] },
  { ref: "6.1.2", title: "Information security risk assessment", ask: "Show the documented risk assessment process: criteria, repeatability, comparable results.", status: "met", note: "One documented method covers security and the AI system together: five-point likelihood and consequence scales with each level worded, consequence judged against the three things the security policy protects in its stated order, a score of one to twenty-five, and acceptance bands at fifteen and above, eight to twelve, and six and below. An overriding rule treats any consequence-five risk whatever its likelihood.", evidence: [E.docRiskMethod, E.docPlan] },
  { ref: "6.1.3", title: "Information security risk treatment", ask: "Show the treatment process, the Statement of Applicability covering all 93 Annex A controls, and the treatment plan.", status: "met", note: "All three parts exist and are published. The treatment process states how treat, accept, avoid and share are chosen and why sharing is only available where the supplier already carries the risk; the Statement of Applicability has a controlled cover naming its approval and version, with all 93 Annex A controls carried in this register; the treatment plan records twelve assessed risks with scores and decisions.", evidence: [E.docRiskTreatment, E.docSoa, E.docPlan, E.register] },
  { ref: "6.2", title: "Information security objectives", ask: "Show measurable objectives, with plans, resources, responsibility and evaluation.", status: "met", note: "Five security objectives are issued, each with a target, the route the measurement is taken from, and when it is evaluated: chain integrity, evidence routes surviving game downtime, spend under the hard limit, no register row marked met without a live route, and published closure times for findings. A missed objective becomes a risk entry, and an incident first where something published has become untrue.", evidence: [E.docObjectives, E.status, E.inquiry, E.incidentsJson] },
  { ref: "6.3", title: "Planning of changes", ask: "Show that changes to the management system are carried out in a planned manner.", status: "met", note: "Changes to the management system are made the same way as changes to the service, because they are the same act: tracked source, shipped by a deployment, recorded with a class and an identifier. A change is planned by fixing its purpose, the register rows it should move, and how it will be verified — and the verification is written into the change record as evidence rather than as a claim of completion.", evidence: [E.docPlanning, E.change, E.changeJson] },
  { ref: "7.1", title: "Resources", ask: "Show the resources determined and provided for the ISMS.", status: "met", note: "Stated exactly: one person part-time, one platform account under a five dollar ceiling the service enforces on itself, one domain, no budget beyond that, no staff, no external assessor and no tooling licence. The resources that do not exist are named as the direct cause of specific open rows — no automated build, hence no dependency scanning; no second person, hence no audit independence — rather than left unexplained.", evidence: [E.docPlanning, E.inquiry] },
  { ref: "7.2", title: "Competence", ask: "Show the competence required for security roles and the evidence that it is held.", status: "met", note: "Required competence determined and recorded; the basis on which it is held is the service itself, which is an unusually direct evidence record — the controls claimed are implemented and demonstrable from public routes. Competence not held is recorded with it: no formal qualification in either standard, and no independent audit competence, the latter being a structural limitation rather than a training gap.", evidence: [E.docAudit] },
  { ref: "7.3", title: "Awareness", ask: "Show that people are aware of the policy, their contribution, and the consequences of not conforming.", status: "met", note: "The person doing the work wrote the policy, set the objectives and decided every control status, so awareness is direct rather than communicated, and the implication of not conforming — that the register becomes untrue — is the failure the whole arrangement is built to prevent. Recorded for completeness; the corresponding Annex A training control is excluded rather than dressed up as satisfied.", evidence: [E.docAudit] },
  { ref: "7.4", title: "Communication", ask: "Show what is communicated about security, when, to whom and by whom.", status: "met", note: "What, when, with whom and by whom are all stated. Everything is communicated by default on a public unauthenticated route, continuously rather than periodically because the routes render live state. The only inbound channel is the security report intake, which is rate-limited and cannot alter service state. There is no internal communication to define and no confidential channel exists.", evidence: [E.docPlanning, E.status, E.incidents, E.intake] },
  { ref: "7.5.1", title: "Documented information — general", ask: "Show the documented information required by the standard and determined as necessary.", status: "met", note: "The required management-system documents are published as twenty documents at one route, each naming the clauses it is the record for, with the same content available as data. Documents and records are distinguished and controlled differently: a document is superseded when it changes, a record is never edited, and where a record proves wrong a further record says so.", evidence: [E.docDocInfo, E.policies, E.policiesJson] },
  { ref: "7.5.2", title: "Creating and updating documented information", ask: "Show identification, format and approval control for documents.", status: "met", note: "Every document carries a reference, a stable anchor, a title, a purpose and its clause list, all rendered from one source object so a document cannot be published without them. The version is the deployment that published it — a mechanism rather than a convention, since the pages ship in the same artefact as the service — and approval is by the only role that exists.", evidence: [E.docDocInfo, E.policiesJson, E.change] },
  { ref: "7.5.3", title: "Control of documented information", ask: "Show that documents are available, protected, controlled for distribution, access, retrieval, retention and disposal.", status: "met", note: "Availability and distribution are trivial because every document is public and unauthenticated; documents of external origin are cited rather than copied. Protection against alteration is the deployment path, and retention windows are enforced in code by trimming, with trims receipted where they remove evidence. Retrieval is checked mechanically: a committed checker walks every evidence link and requires each anchor to exist as an identifier in the page returned.", evidence: [E.docDocInfo, E.manifest] },
  { ref: "8.1", title: "Operational planning and control", ask: "Show controlled processes, control of planned changes, review of unintended changes, and control of externally provided processes.", status: "met", note: "The change, incident, risk and operating-record processes each have a defined trigger and are controlled by being code paths rather than intentions — a control action cannot occur without writing a receipt, and a route cannot be added under the operator prefix without being gated. Unintended change is reviewed against four independent signals, the fourth being a daily state copy under a digest. Outsourced processes are the platform's, controlled as supplier.", evidence: [E.docPlanning, E.change, E.receipts, E.backupStatus] },
  { ref: "8.2", title: "Information security risk assessment (performance)", ask: "Show risk assessments performed at planned intervals and their documented results.", status: "met", note: "An assessment has been performed under the documented method and its results are published as the risk treatment plan: twelve risks, each with likelihood, consequence, score and decision. The planned interval is 90 days — matching the action log retention window so a full assessment always has a complete log behind it — with named triggers for assessment between runs.", evidence: [E.docPlan, E.docRiskMethod] },
  { ref: "8.3", title: "Information security risk treatment (performance)", ask: "Show the treatment plan implemented and its documented results.", status: "met", note: "Every finding closed to date is published as a change entry naming the finding, the fix, the closure time and the evidence produced, under a treatment process that states how the decision between treat, accept, avoid and share is taken.", evidence: [E.docRiskTreatment, E.docPlan, E.change, E.changeJson] },
  { ref: "9.1", title: "Monitoring, measurement, analysis and evaluation", ask: "Show what is monitored, by what methods, when, and by whom — with the results retained.", status: "met", note: "Availability is measured from project start rather than a rolling window, spend is sampled and charted against a hard limit, and every measurement is retained and downloadable.", evidence: [E.status, E.statusJson, E.inquiry, E.logsJson] },
  { ref: "9.2", title: "Internal audit", ask: "Show the audit programme, its criteria and scope, the auditors' objectivity, and the results reported to management.", status: "partial", note: "A programme now exists and has been run: full scope over both standards, evidence-first method, every link fetched and every changed status re-derived from the code or record behind it — the pass that found N-05 by executing the backup control rather than inspecting it. What it cannot have is objectivity: the person checking the rows wrote them and the code beneath them. The evidence is public and independently repeatable, which is a weaker property and is not offered as a substitute. Stays partial for that reason; a management-system clause cannot be excluded.", evidence: [E.docAudit, E.manifest] },
  { ref: "9.3", title: "Management review", ask: "Show reviews at planned intervals covering the required inputs, with documented results.", status: "met", note: "Performed and recorded with every required input — previous actions, external and internal issues, performance, nonconformities, monitoring results, audit results, interested-party feedback, risk results and improvement opportunities — and with documented outputs as five numbered decisions. Unlike internal audit this clause does not require independence, so one person can discharge it, and has.", evidence: [E.docAudit] },
  { ref: "10.1", title: "Continual improvement", ask: "Show that the suitability, adequacy and effectiveness of the ISMS is continually improved.", status: "met", note: "The mechanism is that the register carries its own shortfalls in public with a readiness figure that moves, and the record is the change record. The evidence that it is real rather than asserted: this pass closed rows by performing activities and building a backup, and still names dependency scanning, the erasure route, audit independence and the undischarged supplier certificates as open at the end of a pass whose purpose was to close things.", evidence: [E.docPlanning, E.change, E.register] },
  { ref: "10.2", title: "Nonconformity and corrective action", ask: "Show reaction to nonconformities, evaluation of causes, corrective action, and retained evidence of both nature and outcome.", status: "met", note: "Five nonconformities recorded, each classified as a documentation, control or design fault, each with a cause and a recurrence check, and each linked to the change that corrected it. The classification step is what was previously missing — a list of corrections is not a corrective-action process, because nothing in it separates a slip from a pattern. N-05 was found by the backup control failing its own first test, and both the failure and the later passes are on the public receipt chain.", evidence: [E.docNonconformity, E.change, E.receipts] },
];

/* ── ISO/IEC 27001:2022 Annex A — all 93 controls ────────────────────────────
   Every control must appear in the Statement of Applicability with a decision,
   including the ones that do not apply. An omitted control is a finding. */

const ISO27001_ANNEX_A: Control[] = [
  { ref: "A.5.1", title: "Policies for information security", ask: "Show a defined, approved, published and reviewed policy set.", status: "met", note: "The policy set is defined, published and communicated by being a public route, and each document names the clauses it is the record for.", evidence: [E.docSecurity, E.policies] },
  { ref: "A.5.2", title: "Information security roles and responsibilities", ask: "Show roles defined and allocated according to need.", status: "met", note: "Roles are defined and allocated, including which of them may take the game down and which may change what the service does.", evidence: [E.docRoles, E.admin] },
  { ref: "A.5.3", title: "Segregation of duties", ask: "Show conflicting duties and areas of responsibility are segregated.", status: "excluded", note: "Excluded: the control presumes more than one person, and there is exactly one. No division of conflicting duties is available at any cost, so recording this as a gap would imply a shortfall that could be closed by effort. It re-enters scope on the first hire. What the design substitutes — receipts, a public change record and deterministic replay — is detection rather than separation, and is recorded as accepted residual R-08 rather than offered as compensation here.", evidence: [E.docAudit, E.docRoles] },
  { ref: "A.5.4", title: "Management responsibilities", ask: "Show management requires all personnel to apply information security per the policy.", status: "met", note: "The requirement is established in the roles document and discharged through the management review, which is where the Owner reviews conformance against the policy set and records decisions. With one person, requiring personnel to apply the policy and being the personnel are the same act; the record is the review, not an instruction to somebody else.", evidence: [E.docRecords, E.docRoles, E.docAudit] },
  { ref: "A.5.5", title: "Contact with authorities", ask: "Show maintained contacts with relevant authorities.", status: "partial", note: "The relevant authorities and the circumstances that would trigger contact are now identified: a data protection supervisory authority on a breach or a routed complaint, the national cybercrime reporting route on an intrusion, and the provider's abuse contact for anything originating on the platform. No relationship with any of them is maintained. Identifying who to call is not knowing them, and the standard asks for the second.", evidence: [E.docLegal] },
  { ref: "A.5.6", title: "Contact with special interest groups", ask: "Show contact with security forums and professional associations.", status: "gap", note: "None maintained. The public report intake is inbound only and is not a substitute for participation in a security community, so it is not offered as one. Left as a gap rather than argued into something else.", evidence: [E.intake] },
  { ref: "A.5.7", title: "Threat intelligence", ask: "Show threat information collected and analysed to produce intelligence.", status: "gap", note: "No threat intelligence process. Findings arrive through the public report intake rather than being sought.", evidence: [E.intake] },
  { ref: "A.5.8", title: "Information security in project management", ask: "Show security integrated into project management.", status: "met", note: "There is no separate security workstream: every change is classified before it is built, the classification states whether it touches authentication, public input, retention or spend, and that answer decides how much of the release gate applies. Where a change alters a recorded treatment, the risk treatment plan is reissued in the same deployment.", evidence: [E.docSecureDev, E.docPlan, E.change] },
  { ref: "A.5.9", title: "Inventory of information and other associated assets", ask: "Show an inventory with owners.", status: "met", note: "Eight assets inventoried exhaustively rather than representatively, each with an owner and a classification: the Worker, the per-tank durable class, the shared durable instance, the object storage bucket, the domain, the source repositories, the operator credential and this documentation. The list can be complete because everything in scope is bound in one configuration file the deployment reads — an asset absent from it is not reachable by the running service.", evidence: [E.docAssets, E.inquiry] },
  { ref: "A.5.10", title: "Acceptable use of information and assets", ask: "Show rules for acceptable use, documented and implemented.", status: "met", note: "Acceptable use is stated in the policy: play, read the evidence, report problems. Unacceptable use names leaderboard automation, spend exhaustion and impersonating display names — the last of which is enforced in code rather than by request.", evidence: [E.docSecurity, E.game] },
  { ref: "A.5.11", title: "Return of assets", ask: "Show assets returned on change or termination.", status: "excluded", note: "No personnel and no issued assets. Re-enters scope on the first hire or contractor.", evidence: [] },
  { ref: "A.5.12", title: "Classification of information", ask: "Show information classified by legal, value, criticality and sensitivity.", status: "met", note: "Three tiers, deliberately few: public, operator-only and secret. There is no confidential-but-not-secret tier, because there is no third party to share anything with and inventing one would be labelling rather than classifying. Each inventoried asset carries its tier, and the state copies inherit the strictest classification of anything inside them.", evidence: [E.docAssets] },
  { ref: "A.5.13", title: "Labelling of information", ask: "Show labelling procedures consistent with the classification scheme.", status: "met", note: "Labelled where a label can be acted on and not otherwise. Every route in the API reference states whether it is public or requires the operations credential, and the register's evidence links carry the same distinction in machine-readable form — which is what lets the link checker assert operator routes answer 401 and public routes 200. The 200 is no longer taken on its own: because the asset fallback answers 200 for any path at all, a public route must also return a marker only the real page emits before the checker counts it as served. Physical and media labelling have no application: no premises, no removable media, every document public.", evidence: [E.docAssets, E.api, E.manifest] },
  { ref: "A.5.14", title: "Information transfer", ask: "Show rules and controls for transfer inside and outside the organisation.", status: "met", note: "Every route refuses plaintext; operations routes are never redirected, because a redirect would mean the credential already crossed in clear text. Strict transport security is set on every response, and there are no third-party endpoints in the page delivery path.", evidence: [E.change, E.api] },
  { ref: "A.5.15", title: "Access control", ask: "Show rules to control physical and logical access, based on requirements.", status: "met", note: "One list defines every credentialed route, and the same list drives the gate — so a new control route cannot be added without also being gated.", evidence: [E.admin, E.api] },
  { ref: "A.5.16", title: "Identity management", ask: "Show the full life cycle of identities is managed.", status: "met", note: "There is one identity — the operator, authenticated by one credential — and its life cycle is stated: created as a platform secret, never in tracked configuration, rotated on demand, and required by every gated route. There are no player accounts, no passwords and no registration; the browser-held identifier names a profile row, authenticates nobody and authorises nothing. Adding any credential store would put the service outside the security policy as written.", evidence: [E.docAssets, E.docAccess] },
  { ref: "A.5.17", title: "Authentication information", ask: "Show allocation and management of secrets controlled by a management process.", status: "met", note: "The operations credential exists only as a platform secret. With no secret configured the gate denies rather than falling open, comparison is constant-time over digests so no length leaks, and the credential is refused entirely over plaintext.", evidence: [E.change, E.admin] },
  { ref: "A.5.18", title: "Access rights", ask: "Show access rights provisioned, reviewed, modified and removed against a policy.", status: "met", note: "An access review has been performed and recorded. It enumerated every non-public route against the single list every gate consults, confirmed all require the credential including the three added this version, and confirmed the operations console refuses an unauthenticated request. Two things are explicitly outside it and not implied by it: repository write access, controlled outside the boundary, and the absence of scheduled credential rotation, accepted as R-05.", evidence: [E.docRecords, E.docAccess, E.admin] },
  { ref: "A.5.19", title: "Information security in supplier relationships", ask: "Show processes to manage supplier-related risk.", status: "met", note: "One supplier, total dependency, and the supplier policy states exactly what is entrusted to it — including that the provider holds the credential that guards the service against the provider's other customers. The mitigation recorded is not encryption or a second region, neither of which is available at this scale, but holding nothing that would matter. The dependency is an assessed risk with the residual accepted by the Owner.", evidence: [E.docAccess, E.docPlan, E.inquiry] },
  { ref: "A.5.20", title: "Addressing security within supplier agreements", ask: "Show security requirements agreed with each supplier.", status: "partial", note: "Five security requirements of the provider are now determined and recorded, with how each is addressed and how far it can be verified. What is missing is the word agreed: this is a free project with no contract, the standard terms are accepted as offered, and nothing has been negotiated. Recording that as an accepted position is honest; recording it as an agreement reached would not be.", evidence: [E.docAccess, E.docLegal] },
  { ref: "A.5.21", title: "Managing security in the ICT supply chain", ask: "Show processes to manage risk from the products and services supply chain.", status: "partial", note: "The shipped dependency set is now inventoried by licence in the legal register, the surface is deliberately small and pinned by a lockfile, and the Worker imports only the engine, store and protocol entry points so browser libraries cannot enter the server bundle. Still missing, and it is the same weakness as the technical vulnerabilities row: no advisory process and no scan. Open on the risk treatment plan.", evidence: [E.docLegal, E.docSecureDev, E.docPlan] },
  { ref: "A.5.22", title: "Monitoring, review and change management of supplier services", ask: "Show supplier service delivery is monitored, reviewed and changes managed.", status: "met", note: "The ninety-day cycle defined in the supplier policy has been run and recorded: the runtime remains pinned by an explicit compatibility date in tracked configuration so a platform-side change cannot alter behaviour without a deployment, no change to the offered terms was identified, and no provider-attributable incident is recorded. The record restates rather than closes the standing shortfall that the supplier certificates are not held on file.", evidence: [E.docRecords, E.docAccess, E.incidents] },
  { ref: "A.5.23", title: "Information security for use of cloud services", ask: "Show processes for acquisition, use, management and exit of cloud services.", status: "met", note: "Acquisition and use are declared in version-controlled configuration and metered against a hard limit; management is the pinned runtime and the defined review; and the exit strategy is written, including the part that hurts. Code, assets and the domain would move; the durable state would not, because no export exists, so an exit today would lose the receipt chain. The same missing engineering closes that and the backup gap.", evidence: [E.docAccess, E.inquiry, E.adminStatus] },
  { ref: "A.5.24", title: "Incident management planning and preparation", ask: "Show planned processes, roles and responsibilities for incident management.", status: "met", note: "Intake, assessment, response, restoration and closure are separate operations with separate routes, separate authorisation and separate records — deliberately so, because reporting must never be the same act as taking the service down.", evidence: [E.intake, E.incidents, E.admin] },
  { ref: "A.5.25", title: "Assessment and decision on information security events", ask: "Show events assessed and classified into incidents or not.", status: "met", note: "A public report records an event and raises it; whether it warrants downtime is a separate authenticated operator decision, and both steps are recorded.", evidence: [E.intake, E.receipts] },
  { ref: "A.5.26", title: "Response to information security incidents", ask: "Show response according to documented procedures.", status: "met", note: "Lockdown closes active connections and gates game traffic while every evidence route stays online. Restoring traffic records the end of impact and explicitly does not close the underlying report.", evidence: [E.incidents, E.receipts] },
  { ref: "A.5.27", title: "Learning from information security incidents", ask: "Show knowledge from incidents used to strengthen controls.", status: "met", note: "Each report produces a published hotfix entry naming the trigger, the closure time and the controls strengthened. The pattern is visible across the whole post-delivery record.", evidence: [E.change, E.incidents] },
  { ref: "A.5.28", title: "Collection of evidence", ask: "Show procedures for identification, collection, acquisition and preservation of evidence.", status: "met", note: "Control decisions are appended to a SHA-256 chain that is re-derived on every read, with the verdict stated on the page. An altered entry is named by sequence number.", evidence: [E.receipts, E.incidentsJson] },
  { ref: "A.5.29", title: "Information security during disruption", ask: "Show security is maintained during disruption.", status: "met", note: "Continuity here is about not losing the evidence rather than keeping the game up, which is stated to players rather than implied. Two disruptions are planned for: a platform outage, carried by the provider and accepted as R-04, and loss of the shared durable instance, which was untreated until this version and is now covered by a daily digested copy with a proven restore. Security properties survive a restore because the receipt chain is restored with its anchor and re-verified on read.", evidence: [E.docContinuity, E.backupStatus, E.receipts] },
  { ref: "A.5.30", title: "ICT readiness for business continuity", ask: "Show ICT continuity is planned, implemented, tested and reviewed.", status: "met", note: "Planned, implemented and tested: a daily copy to object storage, thirty dated copies retained, each run receipting its own outcome, and a restore drill that reads the stored copy back out of object storage, restores it into a scratch instance and compares digests. Reviewed after every drill and every failed copy. What is deliberately not claimed: no recovery time or recovery point objective is committed to, no real recovery has been executed, and there is no second region or failover.", evidence: [E.docContinuity, E.backupStatus] },
  { ref: "A.5.31", title: "Legal, statutory, regulatory and contractual requirements", ask: "Show requirements identified, documented and kept current.", status: "met", note: "Issued: data protection obligations and the basis on which they attach, the provider's terms and which of them actually bite, the licence obligations of everything shipped, the standards as voluntary criteria with no certification claimed, and an explicit list of what does not apply and why. Kept current by four named triggers plus the 90-day cycle. Three items are recorded as open rather than resolved: no erasure route, no age gate, and which supervisory authority is the lead one.", evidence: [E.docLegal, E.policiesJson] },
  { ref: "A.5.32", title: "Intellectual property rights", ask: "Show procedures to protect intellectual property.", status: "met", note: "Inventoried rather than assumed. This service and its engine are MIT; every dependency that reaches the shipped artefact is MIT — the renderer, its React binding, React and its DOM package. Build-time tooling adds an Apache 2.0 and a dual-licensed package, neither of which ships. No copyleft licence is present anywhere, so no source-disclosure obligation arises beyond the one taken on voluntarily. Adding a dependency under an unlisted licence is a change to this register, not an ordinary bump.", evidence: [E.docLegal, E.changeJson] },
  { ref: "A.5.33", title: "Protection of records", ask: "Show records protected from loss, destruction, falsification and unauthorised access.", status: "met", note: "Retention is enforced in code, public writes are capped so a flood cannot evict recorded evidence, and control receipts are exempt from the action-log retention window.", evidence: [E.logs, E.receipts, E.change] },
  { ref: "A.5.34", title: "Privacy and protection of PII", ask: "Show identification and implementation of privacy requirements.", status: "partial", note: "The notice is now published and exhaustive: the five fields held, the purpose and basis, and the retention rule stated accurately rather than as a clean 90 days — a profile that never scored is deleted after 90 days unseen, one holding a best score is kept indefinitely so the published leaderboard stays whole. Implementation is strong in code and short in one place: there is no route by which a player can ask for erasure, and clearing the cookie orphans a profile rather than deleting it. Recorded as an open risk, not argued away.", evidence: [E.docLegal, E.docPlan, E.logs] },
  { ref: "A.5.35", title: "Independent review of information security", ask: "Show independent reviews at planned intervals and after significant change.", status: "excluded", note: "Excluded: independence is unavailable at one person and cannot be manufactured by procedure. Recording it as a gap would imply a shortfall closable by effort; it re-enters scope on the first hire or on engaging an external assessor. The evidence being public, machine-readable and checkable by a committed checker makes the review independently repeatable, which is a weaker property than independent and is not claimed as this control.", evidence: [E.docAudit] },
  { ref: "A.5.36", title: "Compliance with policies, rules and standards", ask: "Show compliance with the organisation's own policies is regularly reviewed.", status: "met", note: "A compliance review against this policy set has been performed and recorded, distinct from the register's review against the standards. Method and result are both stated: every evidence link fetched, public routes required to answer 200, operator routes 401, every anchor required to exist as an identifier in the page returned, and no met row permitted an evidence list without a link. Thirty-seven routes, no failures. The weakness — that it is a manual step with no automated gate — is recorded as R-07.", evidence: [E.docRecords, E.manifest, E.register] },
  { ref: "A.5.37", title: "Documented operating procedures", ask: "Show procedures documented and available to those who need them.", status: "met", note: "Four issued procedures, each at a route: route-level operation in the API reference, development and release in the secure development document, change control as the processes on this register, and incident handling as the intake and the incident record. Writing the third of those found the first gap in the first: the unauthenticated public write route was operating undocumented, and it is documented now. What is deliberately not given its own entry — slash variants, three noted aliases, a redirect, the operator paths under the register's old prefix, and two proxy routes to a backend not configured here — is listed rather than glossed.", evidence: [E.docSecureDev, E.api, E.openapi, E.register] },

  { ref: "A.6.1", title: "Screening", ask: "Show background verification of candidates.", status: "excluded", note: "No personnel are engaged. Re-enters scope on the first hire.", evidence: [] },
  { ref: "A.6.2", title: "Terms and conditions of employment", ask: "Show security responsibilities in employment agreements.", status: "excluded", note: "No employment agreements exist within the scope.", evidence: [] },
  { ref: "A.6.3", title: "Security awareness, education and training", ask: "Show an awareness programme and training appropriate to role.", status: "excluded", note: "Excluded: an awareness and training programme presumes people to deliver it to, and there are none. The one person is the author of the policy set rather than an audience for it, so a programme would be a document addressed to its own writer. Re-enters scope on the first hire. Clause-level awareness is discharged separately and is recorded there.", evidence: [E.docAudit] },
  { ref: "A.6.4", title: "Disciplinary process", ask: "Show a formalised, communicated disciplinary process.", status: "excluded", note: "No personnel within the scope.", evidence: [] },
  { ref: "A.6.5", title: "Responsibilities after termination or change of employment", ask: "Show responsibilities that remain valid after termination, and their enforcement.", status: "excluded", note: "No personnel within the scope.", evidence: [] },
  { ref: "A.6.6", title: "Confidentiality or non-disclosure agreements", ask: "Show identified, documented, reviewed confidentiality agreements.", status: "excluded", note: "No party other than the infrastructure provider holds access, and that access is governed by the provider's own terms.", evidence: [] },
  { ref: "A.6.7", title: "Remote working", ask: "Show security measures for remote working.", status: "excluded", note: "Excluded on the scope statement's existing ground: the operator's device is outside the boundary of this management system. Rules for it are stated in the access policy and the repository-side parts are checkable, but the machine's own state is attested rather than evidenced, and no route this service could serve would prove anything about it. Excluded deliberately rather than left permanently partial, and no mobile device policy has been invented to cover it.", evidence: [E.docContext, E.docAccess] },
  { ref: "A.6.8", title: "Information security event reporting", ask: "Show a mechanism for timely reporting of observed events.", status: "met", note: "A public, documented, same-origin intake accepts white-hat reports, records each one with a receipt, raises it to operations, and deliberately changes no service state. Accepted reports are throttled to one per minute.", evidence: [E.intake, E.incidents] },

  { ref: "A.7.1", title: "Physical security perimeters", ask: "Show perimeters protecting areas holding information and processing facilities.", status: "supplier", note: "Standing condition for all fourteen supplier rows, restated here because it is not discharged: a supplier marking records where a control lives, not that it has been verified, and it means nothing until the provider's certificate is held on file. It is not. The supplier monitoring record confirms nobody has obtained them, and these rows are excluded from the readiness denominator, so leaving this open costs no percentage — only credibility if it were written otherwise. All processing runs in the provider's data centres. Inherited from the provider's own certified controls; their certificate needs to be held on file.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.2", title: "Physical entry", ask: "Show secure areas protected by entry controls.", status: "supplier", note: "Provider-operated. No premises within the scope.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.3", title: "Securing offices, rooms and facilities", ask: "Show physical security designed and implemented for facilities.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.4", title: "Physical security monitoring", ask: "Show premises continuously monitored for unauthorised access.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.5", title: "Protecting against physical and environmental threats", ask: "Show protection against natural and human physical threats.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.6", title: "Working in secure areas", ask: "Show security measures for working in secure areas.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.7", title: "Clear desk and clear screen", ask: "Show clear desk and clear screen rules are defined and applied.", status: "excluded", note: "Excluded on the scope statement's existing ground: there are no premises, and the operator's device is outside the boundary. The screen half of the control would apply only to that device, whose state cannot be evidenced from any route this service serves.", evidence: [E.docContext, E.docAccess] },
  { ref: "A.7.8", title: "Equipment siting and protection", ask: "Show equipment sited and protected securely.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.9", title: "Security of assets off-premises", ask: "Show protection for assets used outside the organisation's premises.", status: "excluded", note: "Excluded on the scope statement's existing ground. There are no premises, so every asset is nominally off-premises; the only physical asset in question is the operator's device, which the scope statement places outside the boundary. The in-scope assets are all platform-hosted and are addressed by the supplier rows.", evidence: [E.docContext, E.docAssets] },
  { ref: "A.7.10", title: "Storage media", ask: "Show management of storage media through its life cycle.", status: "excluded", note: "No removable media are used. All data resides in the provider's managed storage and is deleted by retention rules enforced in code.", evidence: [E.logs] },
  { ref: "A.7.11", title: "Supporting utilities", ask: "Show protection from power and utility failures.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.12", title: "Cabling security", ask: "Show power and telecommunications cabling protected.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.13", title: "Equipment maintenance", ask: "Show equipment correctly maintained.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.14", title: "Secure disposal or re-use of equipment", ask: "Show verified removal of data before disposal or re-use.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },

  { ref: "A.8.1", title: "User endpoint devices", ask: "Show information on user endpoint devices is protected.", status: "excluded", note: "Excluded on the scope statement's existing ground: the operator's device and the player's browser are both outside the boundary. Rules for the operator's device are stated in the access policy, and it holds the ability to change the service — which is why they are stated rather than the matter being left silent — but its configuration cannot be evidenced, so the row is excluded rather than marked met on an attestation.", evidence: [E.docContext, E.docAccess] },
  { ref: "A.8.2", title: "Privileged access rights", ask: "Show privileged access restricted and managed.", status: "met", note: "There is exactly one privileged path. It accepts only the minted token, only over transport security, and denies outright when no token is configured — the earlier unauthenticated fallback was removed and the removal is published with its closure time.", evidence: [E.admin, E.change] },
  { ref: "A.8.3", title: "Information access restriction", ask: "Show access to information restricted per the access control policy.", status: "met", note: "Public and operator views are separated by one shared route list used by both the authentication gate and the availability gate, so the two cannot disagree.", evidence: [E.api, E.adminStatus] },
  { ref: "A.8.4", title: "Access to source code", ask: "Show read and write access to source appropriately managed.", status: "partial", note: "What can be demonstrated is documented: the source is not reachable from any route, no secret appears in any served response, and the deploy path needs credentials the repository does not contain. What cannot be is stated rather than asserted — who holds write access, and whether anyone reviewed that list, is controlled by a hosting account outside the scope boundary, and no route this service serves could prove it. Left partial for exactly that reason.", evidence: [E.docSecureDev, E.docPlan] },
  { ref: "A.8.5", title: "Secure authentication", ask: "Show secure authentication technologies and procedures.", status: "met", note: "Token-only, transport-secured, constant-time comparison over digests, fail-closed when unconfigured, and refused outright on plaintext rather than redirected.", evidence: [E.change, E.admin] },
  { ref: "A.8.6", title: "Capacity management", ask: "Show resource use monitored and adjusted against capacity requirements.", status: "met", note: "Seat capacity per tank is enforced where the seat is claimed rather than where the connection opens, and consumption is metered per service against a stated hard limit with a projection and a redline. The limit now closes the two unauthenticated write routes along with the game: it previously exempted every API path, so the routes generating the billable durable writes kept running while the thing they paid for was switched off. Reads and the report intake stay up. Egress is managed as well as writes: the page stylesheet is served once under a content-hashed name and cached, rather than inlined into every no-store response, which took a trust page from 45 KB to 7 KB and a policy document from 49 KB to 11 KB.", evidence: [E.status, E.inquiry, E.api] },
  { ref: "A.8.7", title: "Protection against malware", ask: "Show malware protection implemented and supported by awareness.", status: "met", note: "The control is the absence of a vector, and it is now documented as such. No route accepts a file, a multipart body or a form upload, and no code path in the Worker reads one; the only content the public can store is a sixteen code point display name and a pattern-checked skin identifier; the runtime executes only the deployed bundle with no shell and no runtime package installation. The awareness half is not claimed — the operator endpoint is outside the scope boundary.", evidence: [E.docSecureDev, E.api, E.openapi] },
  { ref: "A.8.8", title: "Management of technical vulnerabilities", ask: "Show vulnerability information obtained, exposure evaluated, and measures taken.", status: "partial", note: "Evaluation and measures are documented and operated: a report is receipted on arrival, the code path is read, the route or tick is exercised rather than reasoned about, and the fix ships as a change entry with its closure time published. Obtaining information is the half that is missing — nothing scans dependencies, no advisory feed is subscribed to, and there is no automated build to run a scan in. Open on the risk treatment plan; deliberately not marked met.", evidence: [E.docSecureDev, E.docPlan, E.change, E.intake] },
  { ref: "A.8.9", title: "Configuration management", ask: "Show configurations established, documented, implemented, monitored and reviewed.", status: "met", note: "Every binding, variable, route and limit lives in one version-controlled file that is deploy-valid as written; there is no hand-configured state at the edge to drift away from it.", evidence: [E.change, E.adminStatus] },
  { ref: "A.8.10", title: "Information deletion", ask: "Show information deleted when no longer required.", status: "met", note: "Action records are trimmed at 90 days, tank captures at 24 hours, and a retention generation change wipes the record deliberately and observably rather than by hand.", evidence: [E.logs, E.logsJson] },
  { ref: "A.8.11", title: "Data masking", ask: "Show data masking used per the access control policy and applicable requirements.", status: "met", note: "Public output is redacted at every depth for the running version identifier and the storage bucket name, and public logs carry no player identifiers. The operator view keeps the full record.", evidence: [E.logsJson, E.inquiryJson, E.adminStatus] },
  { ref: "A.8.12", title: "Data leakage prevention", ask: "Show measures preventing unauthorised disclosure and extraction.", status: "met", note: "Failures return a generic message while detail goes only to the operator log; build and storage identifiers are stripped from public output; and exported names cannot be interpreted as spreadsheet formulas.", evidence: [E.change, E.logs] },
  { ref: "A.8.13", title: "Information backup", ask: "Show backups maintained and tested against an agreed policy.", status: "met", note: "State is copied daily to object storage under a digest covering both places it lives — the durable object's keys and the two tables beneath them — with thirty dated copies retained and each run receipting its own outcome, so a failed copy is visible rather than silent. Tested by execution: a drill reads the most recent copy back out of object storage, restores that copy into a scratch instance, exports it and compares digests, which compares every key and row at once rather than sampling. The stored copy is the thing under test: with no bucket bound or no copy in it the drill fails and says so rather than testing the live object instead. The first drill failed for a real reason and is on the public chain before the passes.", evidence: [E.docContinuity, E.backupStatus, E.adminBackup, E.receipts] },
  { ref: "A.8.14", title: "Redundancy of information processing facilities", ask: "Show facilities implemented with sufficient redundancy for availability requirements.", status: "supplier", note: "Redundancy is the provider's, and the availability it produces is measured and published from project start.", evidence: [E.status] },
  { ref: "A.8.15", title: "Logging", ask: "Show logs recording activities, exceptions, faults and events, and kept protected.", status: "met", note: "Three independent records exist: a 90-day service and action log with reason codes, a 24-hour per-tank capture, and an unexpiring control receipt chain. All three are downloadable and the first two are public.", evidence: [E.logs, E.logsJson, E.adminLog, E.receipts] },
  { ref: "A.8.16", title: "Monitoring activities", ask: "Show networks, systems and applications monitored for anomalous behaviour.", status: "met", note: "Availability, occupancy, request velocity, spend and rate-limit buckets are all observable live, and the authenticated record adds instance residency so an in-memory throttle can be proven to be firing. Both unauthenticated write routes are bucketed the same way — per edge connection and under a global ceiling — including the profile write, which was previously bounded only in how many rows it could create and not at all in how often an existing one could be overwritten.", evidence: [E.status, E.inquiry, E.adminStatus] },
  { ref: "A.8.17", title: "Clock synchronisation", ask: "Show clocks synchronised to approved time sources.", status: "supplier", note: "Time comes from the provider's runtime; every record is timestamped from it and ordered by sequence in the receipt chain.", evidence: [E.receipts] },
  { ref: "A.8.18", title: "Use of privileged utility programs", ask: "Show restriction and tight control of utility programs capable of overriding controls.", status: "met", note: "The runtime exposes no interactive shell and no administrative utility. The only privileged capability is the authenticated control route set, and every use of it is receipted.", evidence: [E.admin, E.receipts] },
  { ref: "A.8.19", title: "Installation of software on operational systems", ask: "Show procedures managing installation on operational systems.", status: "met", note: "The only route to production is a versioned deployment of the entire bundle. There is no in-place editing, no partial upload and no runtime package installation.", evidence: [E.adminStatus, E.change] },
  { ref: "A.8.20", title: "Networks security", ask: "Show networks and devices secured and managed to protect information.", status: "met", note: "Two listeners exist: transport-secured requests and a same-origin socket upgrade. Plaintext is refused, credentialed paths are never redirected, and socket upgrades check the origin against the request host. One header table is applied to every response the Worker emits rather than per branch — Permissions-Policy was previously set only on the static asset path, so the server-rendered pages shipped without it.", evidence: [E.api, E.change] },
  { ref: "A.8.21", title: "Security of network services", ask: "Show security mechanisms and service levels for network services identified and managed.", status: "met", note: "Transport security is mandatory and stated on every response; the availability produced is measured and published rather than asserted.", evidence: [E.status, E.api] },
  { ref: "A.8.22", title: "Segregation of networks", ask: "Show groups of services and systems segregated on networks.", status: "supplier", note: "Isolation between tenants and between durable instances is the provider's; within the scope each tank is a separate durable instance with its own state.", evidence: [E.status] },
  { ref: "A.8.23", title: "Web filtering", ask: "Show access to external websites managed to reduce exposure.", status: "excluded", note: "The service performs no user-directed browsing. Outbound requests are limited to one configured same-account origin, validated for scheme and rejected if it resolves back to this origin.", evidence: [E.api] },
  { ref: "A.8.24", title: "Use of cryptography", ask: "Show rules for effective use of cryptography, including key management.", status: "met", note: "Four uses are documented and there are no others: TLS with a year of strict transport security and operations routes refusing plaintext outside loopback; SHA-256 receipt chaining over a versioned canonical serialisation with one hash function shared by writer and verifier; cryptographic randomness for the per-response nonce and the visitor identifier, kept strictly apart from the simulation's seeded generator; and constant-time credential comparison. Key management is complete because it is small: one platform secret, never in tracked configuration, rotated on demand, no key hierarchy and no certificate this service manages.", evidence: [E.docSecureDev, E.receipts, E.incidentsJson] },
  { ref: "A.8.25", title: "Secure development life cycle", ask: "Show rules for secure development established and applied.", status: "met", note: "Issued as an approved procedure with an owner and named review triggers, covering coding rules, content security policy, cryptography, the release gate, deployment and what happens afterwards. It applies to the Worker, both durable classes and the engine submodule alike, because they ship as one artefact.", evidence: [E.docSecureDev, E.register, E.change] },
  { ref: "A.8.26", title: "Application security requirements", ask: "Show security requirements identified, specified and approved for applications.", status: "met", note: "The application enforces a strict content policy with a per-response token and no inline allowance, a full set of transport and framing headers, and same-origin plus explicit action headers on every state-changing operation.", evidence: [E.change, E.api] },
  { ref: "A.8.27", title: "Secure system architecture and engineering principles", ask: "Show principles for engineering secure systems established and applied.", status: "met", note: "The simulation is server-authoritative, so no client claim is trusted; gates fail closed; the credentialed route list has one definition used by every gate; and the Worker imports only server-safe entry points so browser code cannot enter the server bundle.", evidence: [E.api, E.change] },
  { ref: "A.8.28", title: "Secure coding", ask: "Show secure coding principles applied to software development.", status: "met", note: "The standard is written down: strict type checking as a security rule rather than a tidiness one, one escape helper per module so a review question has one place to look, input validated against a fixed pattern rather than repaired and trusted, exports treated as an injection surface with a formula-injection guard on the text log, constant-time secret comparison, and authorisation with no branch that grants by falling through.", evidence: [E.docSecureDev, E.logs, E.change] },
  { ref: "A.8.29", title: "Security testing in development and acceptance", ask: "Show security testing processes defined and implemented in the development life cycle.", status: "met", note: "Defined with named acceptance criteria and operated on every release: build, a clean type check across Worker, engine and client, clean trees in both repositories checked separately, then the release exercised against the same runtime production uses on repeated cache-busted requests. Four contract checks run with it — every inline script nonced with no placeholder surviving, the operator console answering unauthorised, the receipt chain verdict verified, and every evidence link resolving. Stated limitation: it is a checklist a person performs, not a pipeline that enforces it.", evidence: [E.docSecureDev, E.incidentsJson, E.manifest] },
  { ref: "A.8.30", title: "Outsourced development", ask: "Show outsourced development directed, monitored and reviewed.", status: "excluded", note: "No development is outsourced.", evidence: [] },
  { ref: "A.8.31", title: "Separation of development, test and production environments", ask: "Show environments separated and secured.", status: "met", note: "Development runs the production runtime against its own empty in-memory storage; production is a separate named configuration with its own bucket and its own durable storage. See CM-04.", evidence: [E.register, E.adminStatus] },
  { ref: "A.8.32", title: "Change management", ask: "Show changes subject to change management procedures.", status: "met", note: "Fourteen documented processes cover classification, request, authorisation, environment separation, verification, release, configuration, rollback, emergency change, post-implementation review, unintended change, supplier change, record integrity and AI change. Every production change carries an identifier, a deployment grouping and its evidence, and the record is public.", evidence: [E.register, E.change, E.changeJson] },
  { ref: "A.8.33", title: "Test information", ask: "Show test information appropriately selected, protected and managed.", status: "met", note: "No production data is used for testing. The local runtime starts from an empty in-memory store on every run, by design.", evidence: [E.register] },
  { ref: "A.8.34", title: "Protection of information systems during audit testing", ask: "Show audit tests on operational systems planned and agreed to minimise disruption.", status: "met", note: "Every route on this register is safe to exercise: public evidence routes are read-only, and each control mutation needs authentication plus a same-origin request plus an explicit action header. Closing a security report additionally requires an explicit dry-run flag and owner confirmation.", evidence: [E.api, E.admin] },
];

/* ── ISO/IEC 42001:2023 ──────────────────────────────────────────────────────
   The AI management system. The AI system in scope is the population of
   server-authoritative autonomous agents that share each tank with human
   players: they perceive the tank state, choose actions without human
   instruction, and their decisions affect a person's experience of the service.
   That is enough to bring 42001 into scope, and it is the honest scope — no
   model is trained here and no personal data feeds any decision. */

const ISO42001_CLAUSES: Control[] = [
  { ref: "4.1", title: "Understanding the organisation and its context", ask: "Show the context analysis, including the organisation's role as AI provider, developer or user.", status: "met", note: "The AI context is stated exactly: this service is provider and developer of the computer-controlled sharks, which are deterministic rules rather than a learned model, with no model, training data or third-party inference anywhere.", evidence: [E.docAi, E.adminReplay] },
  { ref: "4.2", title: "Understanding the needs of interested parties", ask: "Show interested parties for the AI system and their requirements.", status: "met", note: "Interested parties for the AI system are the players sharing a tank with it. The assessment records that nobody outside the tank is reached, because the system has no downstream consumer.", evidence: [E.docAi, E.docContext] },
  { ref: "4.3", title: "Determining the scope of the AI management system", ask: "Show the documented scope of the AIMS.", status: "met", note: "Scope of the AI management system is the computer-controlled sharks and the engine that steers them, bounded by the same technical scope as the security management system.", evidence: [E.docAi, E.docContext] },
  { ref: "4.4", title: "AI management system", ask: "Show the AIMS is established, implemented, maintained and continually improved.", status: "met", note: "The AI management system is the same system, with the AI-specific documents inside it: the AI policy, the life cycle document and the AI objectives. Its processes and their interactions are stated, and it renders from source shipping in the same artefact as the service, so it cannot drift from the AI system it governs between releases.", evidence: [E.docPlanning, E.docAi, E.docLifecycle] },
  { ref: "5.1", title: "Leadership and commitment", ask: "Show top management commitment to the AI management system.", status: "met", note: "Demonstrated by the same evidence as the security clause, plus one AI-specific commitment that is unusual enough to be worth citing as leadership: the AI policy states plainly that the computer-controlled sharks are rules and not a learned model, which is a description that reduces rather than inflates what the system appears to be. Maintaining that wording against every future change is an explicit objective rather than a habit.", evidence: [E.docAudit, E.docAi, E.docObjectives] },
  { ref: "5.2", title: "AI policy", ask: "Show an established, approved AI policy appropriate to the organisation's purpose.", status: "met", note: "An AI policy is issued and published. It is exact about what the system is: rule-based steering — avoid the wall, turn toward the nearest food in sight, otherwise a seeded random turn — with no model, training or inference anywhere.", evidence: [E.docAi, E.policiesJson] },
  { ref: "5.3", title: "Roles, responsibilities and authorities", ask: "Show AI roles assigned and communicated.", status: "met", note: "The same four roles carry the AI responsibilities, with the AI policy naming who may change how the sharks decide.", evidence: [E.docRoles, E.docAi] },
  { ref: "6.1.2", title: "AI risk assessment", ask: "Show a defined AI risk assessment process, with criteria, that produces consistent results.", status: "met", note: "The same documented method covers the AI system, deliberately rather than by omission: the agents are a component of the same Worker on the same storage under the same spend ceiling, and two methods over one object would produce two answers about it. The assessed AI-specific risk is misrepresentation — describing rule-based steering in terms that imply a learned model.", evidence: [E.docRiskMethod, E.docPlan] },
  { ref: "6.1.3", title: "AI risk treatment", ask: "Show the treatment process and a Statement of Applicability covering the Annex A controls.", status: "met", note: "The treatment process is documented and applies to the AI risk as it does to the rest; the Statement of Applicability carries all 38 Annex A controls of this standard with a decision and a justification, under a controlled cover naming its approval and version.", evidence: [E.docRiskTreatment, E.docSoa, E.register] },
  { ref: "6.1.4", title: "AI system impact assessment", ask: "Show a process to assess potential consequences for individuals and society, and its results.", status: "met", note: "An impact assessment is documented, covering individuals, groups and society, and recording that no personal data reaches the system and that it takes no decision about any person.", evidence: [E.docAi] },
  { ref: "6.2", title: "AI objectives and planning to achieve them", ask: "Show measurable AI objectives consistent with the AI policy.", status: "met", note: "Four AI objectives are issued and each is measured from a route: every tick stays reconstructable from seed and action stream; no learned model, training data or third-party inference enters without the AI policy being rewritten first; the agents read no name, profile or history; and an agent is never passed off as a person in a published record or count.", evidence: [E.docObjectives, E.adminReplay, E.docAi] },
  { ref: "6.3", title: "Planning of changes", ask: "Show changes to the AI management system are planned.", status: "met", note: "Changes to the AI system and to the documents governing it are planned and shipped by the same process as any other change, with the AI policy's review triggers — a change to how a shark decides, to the roster size, or to the capability limits — determining when the AI documents must be reissued alongside the change.", evidence: [E.docPlanning, E.docLifecycle, E.change] },
  { ref: "7.1", title: "Resources", ask: "Show resources determined and provided for the AIMS.", status: "met", note: "Stated with the same exactness as the security clause, and the AI-specific position is that the AI system consumes no additional resource of consequence: the sharks are rules running inside the same Worker, with no model to host, no inference to buy and no third-party service to pay for.", evidence: [E.docPlanning, E.inquiry] },
  { ref: "7.2", title: "Competence", ask: "Show competence needed for the AI system and evidence it is held.", status: "met", note: "Required competence determined and recorded, with the AI-specific element being the ability to describe a rule-driven system accurately rather than in the vocabulary of learned models — the competence that risk R-11 exists to protect. Held on the basis that the system is implemented, its behaviour reconstructible from a public route, and its description verified against source rather than against the previous description.", evidence: [E.docAudit, E.docAi] },
  { ref: "7.3", title: "Awareness", ask: "Show awareness of the AI policy and its implications.", status: "met", note: "The person doing the work wrote the AI policy and set its objectives, so awareness is direct. The implication of not conforming is specific here and recorded: describing the system in a way that implies more than it is would be the easiest claim on this site to disprove, which is why it is carried as risk R-11 rather than left to awareness alone.", evidence: [E.docAudit, E.docAi] },
  { ref: "7.4", title: "Communication", ask: "Show what is communicated about the AI system, when and to whom.", status: "met", note: "Communicated on the same public, continuous basis as everything else, and the AI-specific content is unusually complete: what the system is, what it is not, how it is built and checked, and a deterministic replay route by which any statement about how a shark behaved can be reconstructed rather than taken on trust. Nothing about the AI system is disclosed only on request.", evidence: [E.docPlanning, E.docAi, E.docLifecycle, E.adminReplay] },
  { ref: "7.5", title: "Documented information", ask: "Show the documented information required by the AIMS.", status: "met", note: "The AI documents sit inside the same documented-information regime as the rest: reference, anchor, purpose, clause list and a version that is the deployment that published them, with the same content available as data and every link mechanically checked.", evidence: [E.docDocInfo, E.policies, E.policiesJson] },
  { ref: "8.1", title: "Operational planning and control", ask: "Show the AI system's operational processes are planned and controlled.", status: "met", note: "The AI system's operational control is the life cycle document's process plus one property most systems cannot offer: every tank is exactly reconstructible at any tick from its seed and ordered action stream, so what the system actually did is recoverable rather than inferred. Externally provided processes: none, because there is no third-party AI service in the system at all.", evidence: [E.docPlanning, E.docLifecycle, E.adminGame, E.adminReplay] },
  { ref: "8.2", title: "AI risk assessment (performance)", ask: "Show AI risk assessments performed at planned intervals.", status: "met", note: "Performed as part of the single assessment covering both standards, on the same 90-day interval and the same change triggers, with the AI-specific risk scored and decided in the published plan.", evidence: [E.docPlan, E.docRiskMethod] },
  { ref: "8.3", title: "AI risk treatment (performance)", ask: "Show the AI risk treatment plan implemented and its results retained.", status: "met", note: "The plan exists and its AI treatment is implemented rather than proposed: the AI policy states exactly what the system is and is not, and the deterministic replay route makes every statement in it checkable against a reconstruction. The results are retained as the published plan and the policy it points at.", evidence: [E.docPlan, E.docAi, E.adminReplay] },
  { ref: "8.4", title: "AI system impact assessment (performance)", ask: "Show impact assessments performed and their results retained.", status: "met", note: "The assessment is performed and documented, with its conclusions checkable against the deterministic replay rather than taken on trust.", evidence: [E.docAi, E.adminReplay] },
  { ref: "9.1", title: "Monitoring, measurement, analysis and evaluation", ask: "Show what is monitored and measured about the AI system, by what method, and when.", status: "met", note: "Answerable now that AI objectives exist to measure against. What: that the sharks remain rule-driven and reconstructible, measured through the deterministic replay route; that the roster size and capability limits match the policy, read from running configuration; that the description stays accurate, measured against source. When and by whom: on the policy's triggers and otherwise every ninety days, evaluated at the management review. The honest limit is stated — these are verification measures, not outcome measures, and no fairness or quality objective has been set.", evidence: [E.docPlanning, E.docObjectives, E.adminReplay] },
  { ref: "9.2", title: "Internal audit", ask: "Show the AI management system is internally audited.", status: "partial", note: "Covered by the same programme, at the same scope, with the same limitation: the audit has been performed and recorded, and objectivity is structurally unavailable at one person. Stays partial rather than met for that reason, and cannot be excluded because it is a management-system requirement rather than an Annex A control.", evidence: [E.docAudit, E.manifest] },
  { ref: "9.3", title: "Management review", ask: "Show management review of the AI management system with the required inputs.", status: "met", note: "Held as one review covering both systems, with the AI-specific inputs recorded: the AI policy review found no change to how a shark decides since publication, the rule-driven claim re-verified against engine source rather than carried forward, and the AI objectives confirmed measurable from live routes.", evidence: [E.docAudit, E.docRecords] },
  { ref: "10.1", title: "Continual improvement", ask: "Show continual improvement of the AI management system.", status: "met", note: "Improved by the same mechanism and recorded in the same change record. The AI-specific improvement at this version is that the system's monitoring clause became answerable rather than nominal, because objectives now exist to measure behaviour against — and the review that established this checked the description against source instead of against its own previous statement.", evidence: [E.docPlanning, E.docObjectives, E.change] },
  { ref: "10.2", title: "Nonconformity and corrective action", ask: "Show reaction, cause evaluation and corrective action for AI nonconformities.", status: "met", note: "Two of the five recorded nonconformities are AI-specific and both are documentation faults: an incomplete account of the steering rules, and a claim repeated in two documents that the capture log distinguishes computer-controlled sharks when it holds no such rows. The second established the recurrence rule that a claim appearing in two documents must be verified in both, because copying is how an unverified statement acquires the appearance of corroboration.", evidence: [E.docNonconformity, E.docAi] },
];

const ISO42001_ANNEX_A: Control[] = [
  { ref: "A.2.2", title: "AI policy", ask: "Show a documented AI policy approved by management.", status: "met", note: "The AI policy is established and published as a route.", evidence: [E.docAi] },
  { ref: "A.2.3", title: "Alignment with other organisational policies", ask: "Show the AI policy aligned with other policies, including information security.", status: "met", note: "The AI policy sits inside the same policy set as the security policy and shares its scope statement, so alignment is structural rather than asserted.", evidence: [E.docAi, E.docSecurity] },
  { ref: "A.2.4", title: "Review of the AI policy", ask: "Show the AI policy is reviewed at planned intervals.", status: "met", note: "Reviewed and recorded against the policy's own stated trigger. The review found no change to how a shark decides since publication, re-verified the no-model claim against engine source rather than accepting it from the previous review, confirmed the steering-rule description corrected as N-01 matches the implementation, and concluded the policy remains suitable and is reissued unchanged.", evidence: [E.docRecords, E.docAi] },
  { ref: "A.3.2", title: "AI roles and responsibilities", ask: "Show AI roles defined and allocated.", status: "met", note: "AI roles and responsibilities are allocated in the policy set, and the AI policy states that a change to shark decision-making requires the document to be rewritten first.", evidence: [E.docRoles, E.docAi] },
  { ref: "A.3.3", title: "Reporting of concerns", ask: "Show a process for reporting concerns about the AI system.", status: "met", note: "The public intake is now signposted as the channel for concerns about the agents, with what happens to such a report stated: it is recorded as a retained event and a receipt, and a concern about how a shark behaved is answered by replaying the tick rather than by an opinion. A concern that this system is described inaccurately is explicitly in scope.", evidence: [E.docLifecycle, E.intake] },
  { ref: "A.4.2", title: "Resource documentation", ask: "Show the resources for the AI system identified and documented.", status: "met", note: "Consolidated: compute is the same Worker and the tank's own durable object with no inference service, accelerator or external call; storage is the tank action log at ten thousand events and twenty-four hours; data resources are nil because nothing learns; people are one person. Consumption stays inside the same metered spend under the same limit.", evidence: [E.docLifecycle, E.inquiry, E.inquiryJson] },
  { ref: "A.4.3", title: "Data resources", ask: "Show the data resources used by the AI system documented.", status: "met", note: "The agents consume only live tank state — positions, sizes and the ordered action stream — and no stored, purchased or personal dataset. The full input to any decision is in the tank log and can be replayed.", evidence: [E.adminGame, E.adminReplay] },
  { ref: "A.4.4", title: "Tooling resources", ask: "Show the tooling used to develop and run the AI system documented.", status: "met", note: "Inventoried, including the negative half that matters: TypeScript, a client bundler, the platform's local runtime, and the engine as a pinned submodule — and no machine-learning framework, model runtime, vector store, annotation tool or evaluation harness at any stage, so a model could not be introduced without it being visible in the dependency manifest.", evidence: [E.docLifecycle, E.api] },
  { ref: "A.4.5", title: "System and computing resources", ask: "Show the computing resources for the AI system documented.", status: "met", note: "Agent execution is part of the metered durable-object workload, reported per service and charted against a hard spend limit.", evidence: [E.inquiry, E.adminStatus] },
  { ref: "A.4.6", title: "Human resources", ask: "Show the human resources for the AI system are identified and provided.", status: "met", note: "Identified and provided, and small enough to state exactly: one person, holding every role, with the required competence determined and recorded alongside the competence not held. The AI system needs no operational staffing because it is rules inside the Worker — nothing to host, tune, retrain or monitor in production beyond the verification measures already recorded.", evidence: [E.docPlanning, E.docAudit, E.docRoles] },
  { ref: "A.5.2", title: "AI system impact assessment process", ask: "Show a documented process for assessing impacts on individuals and society.", status: "met", note: "The impact assessment process is documented, with the scope it covers and what would put a use outside it.", evidence: [E.docAi] },
  { ref: "A.5.3", title: "Documentation of AI system impact assessments", ask: "Show the results of impact assessments documented and retained.", status: "met", note: "The assessment itself is documented and published rather than held privately.", evidence: [E.docAi] },
  { ref: "A.5.4", title: "Assessing AI system impact on individuals or groups", ask: "Show assessment of consequences for individuals, including foreseeable misuse.", status: "met", note: "Impact on individuals is assessed: limited to the experience of a game, with no profiling and no automated decision, because the system cannot distinguish one player from another.", evidence: [E.docAi] },
  { ref: "A.5.5", title: "Assessing societal impacts of AI systems", ask: "Show assessment of broader societal consequences.", status: "met", note: "Societal impact is assessed as negligible and stated as such, with the reasoning given rather than a risk manufactured to demonstrate diligence.", evidence: [E.docAi] },
  { ref: "A.6.1.2", title: "Objectives for responsible development", ask: "Show objectives for responsible development of the AI system.", status: "met", note: "Two objectives are stated for how this system is developed. Every tick of every tank must stay reconstructable from its seed and ordered action stream, so a change that would make a tank unreplayable is not shipped; and no learned model, training data or third-party inference may be introduced without the AI policy being rewritten first and these rows reassessed in the same deployment.", evidence: [E.docObjectives, E.docAi, E.adminReplay] },
  { ref: "A.6.1.3", title: "Processes for responsible design and development", ask: "Show defined processes for responsible design and development.", status: "met", note: "Four criteria are stated, each phrased as a reason to refuse a change rather than a value to aspire to: replayability is not negotiable, no personal data may enter the steering rules, an agent may never be given a capability withheld from a player, and no learned model may be introduced without the AI policy being rewritten in the same deployment.", evidence: [E.docLifecycle, E.docObjectives, E.change] },
  { ref: "A.6.2.2", title: "AI system requirements and specification", ask: "Show requirements specified for the AI system.", status: "met", note: "Specified: a thirty-two shark roster with eight human seats and twenty-four agents held up by respawn, twenty ticks a second under server authority, the steering rules written in the order they are applied with their sight radii, the tank-wide frenzy cycle, and retirement at a score of two hundred and forty so a long-lived agent cannot make the leaderboard meaningless.", evidence: [E.docLifecycle, E.change, E.status] },
  { ref: "A.6.2.3", title: "Documentation of AI system design and development", ask: "Show design and development documented sufficiently for review.", status: "met", note: "The design is documented down to the mechanism: a mulberry32 generator seeded by a hash of the tank's own identifier, its state carried inside the serialisable snapshot, no wall-clock read and no unseeded randomness in the simulation. The change record remains the development history, entry by entry.", evidence: [E.docLifecycle, E.change] },
  { ref: "A.6.2.4", title: "AI system verification and validation", ask: "Show verification and validation performed against the requirements, with criteria and results.", status: "met", note: "One exact acceptance criterion is stated — a tank reconstructed at tick N must equal the tank the service reported at tick N — and the result is obtainable on demand rather than filed: the replay route is the test. It refuses rather than guesses, answering gone once a tank's history no longer starts at tick zero. Recorded weakness: no automated suite asserts this on every build.", evidence: [E.docLifecycle, E.adminReplay, E.adminGame] },
  { ref: "A.6.2.5", title: "AI system deployment", ask: "Show a documented deployment plan and that requirements are met before release.", status: "met", note: "Issued: the agents have no separate release and ship inside one atomic version with the engine, routes and pages. The gate is build, clean type check and clean tree; the production deploy refuses without the account identifier and refuses again unless both operations secrets exist. The running version is readable afterwards from the operator status route.", evidence: [E.docLifecycle, E.adminStatus, E.register] },
  { ref: "A.6.2.6", title: "AI system operation and monitoring", ask: "Show operational monitoring covering performance, errors and unexpected behaviour.", status: "met", note: "Agent occupancy is reported live per tank, every agent action is captured in the tank log, and any session can be replayed at a chosen tick to inspect exactly what an agent did and when.", evidence: [E.status, E.adminGame, E.adminReplay] },
  { ref: "A.6.2.7", title: "AI system technical documentation", ask: "Show technical documentation appropriate to the audience.", status: "met", note: "The decision model is now written out in prose for a technical reader — the rules in application order, the sight radii, the frenzy cycle, retirement, and the two places capability is bounded — alongside the route-level reference that was already published.", evidence: [E.docLifecycle, E.api, E.openapi] },
  { ref: "A.6.2.8", title: "AI system recording of event logs", ask: "Show event logs recorded automatically, with enough detail to reconstruct behaviour.", status: "met", note: "Each tank writes a deterministic log of seed plus the ordered action stream, retained for the capture window, downloadable, and replayable to any tick. This is the strongest single piece of AI evidence the service holds.", evidence: [E.adminGame, E.adminReplay, E.logs] },
  { ref: "A.7.2", title: "Data for development and enhancement of the AI system", ask: "Show the data used to develop the AI system and how it is managed.", status: "met", note: "No dataset is used. Behaviour is written as deterministic rules and seeded, so there is no training corpus to govern — which is itself the answer this control needs, recorded here.", evidence: [E.register, E.adminGame] },
  { ref: "A.7.3", title: "Acquisition of data", ask: "Show how data is acquired and the provenance recorded.", status: "met", note: "The only data the agents consume is live state generated inside the service itself. Nothing is acquired from outside it.", evidence: [E.adminGame] },
  { ref: "A.7.4", title: "Quality of data for AI systems", ask: "Show data quality requirements defined and met.", status: "met", note: "Criteria are stated and are the only ones that mean anything here: there is no external dataset, so quality reduces to reproducibility plus the bounds the simulation enforces on food count, spawn length and arena radius. A state violating those bounds is a defect, and it shows up as a replay that does not reproduce.", evidence: [E.docLifecycle, E.adminReplay] },
  { ref: "A.7.5", title: "Data provenance", ask: "Show provenance recorded and maintained over the life cycle.", status: "met", note: "Provenance is complete and mechanical: the seed plus the ordered action stream reproduce any state exactly, so the origin of every value an agent saw is recoverable.", evidence: [E.adminGame, E.adminReplay] },
  { ref: "A.7.6", title: "Data preparation", ask: "Show data preparation methods defined and documented.", status: "excluded", note: "No dataset is prepared, cleaned or labelled, because none is used.", evidence: [E.register] },
  { ref: "A.8.2", title: "System documentation and information for users", ask: "Show documentation available to users of the AI system.", status: "met", note: "The behaviour is now explained in plain terms as well as counted: what the sharks do on each tick, that they are strictly less capable than a player — no rockets, one bite a tick against two — and that they can read nothing about the person they are swimming against.", evidence: [E.docLifecycle, E.status, E.game] },
  { ref: "A.8.3", title: "External reporting", ask: "Show a capability for interested parties to report adverse impacts.", status: "met", note: "The public intake is documented, same-origin protected, throttled, and produces a receipt and an audit record for every accepted report.", evidence: [E.intake, E.incidents] },
  { ref: "A.8.4", title: "Communication of incidents", ask: "Show a process for communicating incidents to users.", status: "met", note: "Incidents are published with cause, start, duration and resolution as they happen, and a controlled outage states the current trigger on the page a player actually lands on.", evidence: [E.incidents, E.status] },
  { ref: "A.8.5", title: "Information for interested parties", ask: "Show the information provided to interested parties about the AI system.", status: "met", note: "The AI-specific disclosure exists and is public: the policy states what the system is, the life cycle document states how it is built and checked, this register records both against the standard, and all of it is machine-readable. Nothing about this system is disclosed only on request.", evidence: [E.docLifecycle, E.docAi, E.policiesJson, E.status] },
  { ref: "A.9.2", title: "Processes for responsible use of AI systems", ask: "Show defined processes for responsible use.", status: "met", note: "Stated as a use policy, with three limits enforced in code rather than requested in prose: an agent cannot fire a rocket, cannot out-eat a player per tick, and cannot read anything about a player. There is no operator procedure because there is no lever — the agents have no configuration and no runtime tuning surface, so behaviour changes only by a recorded deployment.", evidence: [E.docLifecycle, E.docAi, E.change] },
  { ref: "A.9.3", title: "Objectives for responsible use of AI systems", ask: "Show objectives for responsible use documented.", status: "met", note: "Two objectives are stated for how this system is used. It takes no decision about any person — the agents read no display name, profile or history, and their inputs stay the tank's own state — and an agent is never passed off as a person: counts are published alongside human occupancy and the per-tank export marks them in the record itself.", evidence: [E.docObjectives, E.status, E.adminGame] },
  { ref: "A.9.4", title: "Intended use of the AI system", ask: "Show the intended use documented and the system used accordingly.", status: "met", note: "Intended use is published: populate a tank so a player is never alone, with the limits on use stated alongside it.", evidence: [E.docAi, E.game] },
  { ref: "A.10.2", title: "Allocating responsibilities", ask: "Show responsibilities allocated between the organisation, its partners, suppliers, customers and third parties.", status: "met", note: "Responsibilities across the AI life cycle are allocated to the named roles.", evidence: [E.docRoles, E.docAi] },
  { ref: "A.10.3", title: "Suppliers", ask: "Show suppliers of AI services or components assessed and managed.", status: "excluded", note: "No third-party AI service, model or component is used at runtime. Agent behaviour is written and operated inside this service.", evidence: [E.register] },
  { ref: "A.10.4", title: "Customers", ask: "Show customer requirements for the AI system understood and addressed.", status: "met", note: "Four player requirements are determined and each is addressed at a route: a populated tank, opponents under the same rules, the ability to tell a person from an agent, and nothing about the player reaching the opponents. It is recorded that these were determined by analysis rather than gathered by survey, and that no contractual customer exists.", evidence: [E.docLifecycle, E.status, E.docContext] },
];

export const REGISTERS: readonly Register[] = [
  { id: "iso27001-clauses", standard: "ISO/IEC 27001", title: "ISO/IEC 27001:2022 — Clauses 4 to 10", intro: "The management system requirements. These are not optional and Annex A cannot compensate for a gap here: a missing policy, internal audit or management review is a nonconformity in its own right.", controls: ISO27001_CLAUSES },
  { id: "iso27001-annex-a", standard: "ISO/IEC 27001", title: "ISO/IEC 27001:2022 — Annex A, all 93 controls", intro: "Every Annex A control appears with a decision and a justification, including those excluded. This section is the working Statement of Applicability.", controls: ISO27001_ANNEX_A },
  { id: "iso42001-clauses", standard: "ISO/IEC 42001", title: "ISO/IEC 42001:2023 — Clauses 4 to 10", intro: "The AI management system requirements. In scope: the autonomous agents that share each tank with human players.", controls: ISO42001_CLAUSES },
  { id: "iso42001-annex-a", standard: "ISO/IEC 42001", title: "ISO/IEC 42001:2023 — Annex A, all 38 controls", intro: "Controls A.2 to A.10. The strongest rows here are the life-cycle and data ones, because agent behaviour is deterministic and every decision is replayable.", controls: ISO42001_ANNEX_A },
] as const;

/* ── Evidence index ───────────────────────────────────────────────────────────
   Every route this service publishes, and what it proves. An assessor should be
   able to work down this list without asking for anything that is not here. */

export interface EvidenceRoute {
  route: string;
  access: "public" | "operator";
  proves: string;
  controls: string;
}

export const EVIDENCE_INDEX: readonly EvidenceRoute[] = [
  { route: "/", access: "public", proves: "The management-system overview: the governed workload, evidence model, ISO/IEC 27001 and ISO/IEC 42001 implementations, accessibility scope, and a live operational snapshot whose figures link to the records that own them.", controls: "7.4, 9.1, 42001 7.4" },
  { route: "/evidence/#changes", access: "public", proves: "Every production change with an identifier, a classification, a deployment grouping, its evidence and the report or incident it answers.", controls: "8.1, 8.3, A.8.32, A.5.27" },
  { route: "/roadmap.json", access: "public", proves: "The same change record as machine-readable data, including delivery velocity and post-delivery hotfixes kept separate from the delivery metrics.", controls: "8.1, A.8.32" },
  { route: "/evidence/#incidents", access: "public", proves: "Every incident with cause, start, duration and resolution, charted by cause, with the append-only control receipt chain and its verification verdict at /evidence/#receipts on the same page.", controls: "A.5.24, A.5.26, A.5.28, 10.2" },
  { route: "/incidents.json", access: "public", proves: "Incident and receipt data with the integrity verdict, for independent re-verification.", controls: "A.5.28, A.5.33" },
  { route: "/evidence/#availability and /evidence/#continuity", access: "public", proves: "Availability measured from project start rather than a rolling window, scheduled versus unscheduled downtime, live occupancy and autonomous agent counts, and the state of the most recent copy of durable state with the result of the last restore drill.", controls: "9.1, A.8.6, A.8.13, A.8.16, A.5.29, A.5.30, 42001 A.6.2.6" },
  { route: "/status.json", access: "public", proves: "The same measurements as data, with infrastructure identifiers redacted.", controls: "9.1, A.8.11" },
  { route: "/evidence/#logs", access: "public", proves: "A 90-day reason-coded service log and 24-hour per-tank captures, searchable, filterable and downloadable.", controls: "A.8.15, A.5.33, A.8.10" },
  { route: "/logs.json", access: "public", proves: "The same records as data, with the retention windows and record counts stated.", controls: "A.8.15, A.8.10" },
  { route: "/logs/game/{tank}.txt", access: "public", proves: "A tank's capture window as a fixed-schema text export with no player identifiers.", controls: "A.8.11, A.8.15" },
  { route: "/evidence/#spend and /evidence/#degradation", access: "public", proves: "Consumption per bound service against the free-tier allowance, the hard spend stop, and the degradation path that preserves read-only evidence and recovery access.", controls: "A.8.6, A.5.9, 7.1" },
  { route: "/docs/ and /openapi.json", access: "public", proves: "Every route, its authorisation, its required headers and its effect — the operating procedure for the service.", controls: "A.5.37, 4.3, A.8.27" },
  { route: "/api/profile", access: "public", proves: "The other unauthenticated write, and the limits on it: a per-connection bucket and a global ceiling across every public caller at once, a 16 KiB body ceiling enforced on the bytes that arrive rather than on a declared length, and refusal along with the game once the spend limit closes the gate. The identity it writes under is a cookie the caller is handed, so the cookie cannot be the throttle key.", controls: "A.8.20, A.8.6, A.5.33, 8.1" },
  { route: "/api/audit", access: "public", proves: "The only unauthenticated write into the 90-day action log, and the limits that make it safe: two permitted event types, a per-connection bucket, a global ceiling across every public caller at once, and a separate retention floor so a flood evicts only other public rows.", controls: "A.8.15, A.5.33, A.8.20, 8.1" },
  { route: "/api/security-report", access: "public", proves: "A same-origin white-hat intake that records a report and raises it without changing service state, throttled to one accepted report a minute.", controls: "A.6.8, A.5.25, 42001 A.8.3" },
  { route: "/controls/#registers and /audit/manifest.json", access: "public", proves: "This register: every clause and control of both standards with a status, a justification and its evidence.", controls: "6.1.3, 42001 6.1.3" },
  { route: "/controls/#policies and /policies.json", access: "public", proves: "The complete written record the standards ask for: scope, policy, roles, risk, applicability, objectives, AI impact and life cycle, secure development, access, suppliers, legal and privacy obligations, documented information, nonconformity, assets, continuity, operations, internal audit, and management review.", controls: "27001 4.1-10.2 and applicable Annex A controls; 42001 4.1-10.2 and applicable Annex A controls" },
  { route: "/admin/", access: "operator", proves: "The authenticated control panel: traffic control, billing thresholds, live runtime figures and the receipt chain.", controls: "A.8.2, A.5.15, A.8.18" },
  { route: "/admin/status.json", access: "operator", proves: "The unredacted operational record, including the running version identifier, the measurement window and instance residency for rate-limit verification.", controls: "A.8.16, A.8.19, A.8.9" },
  { route: "/admin/log.json and /admin/log.jsonl", access: "operator", proves: "The 90-day action record in full, including the fields withheld from public output.", controls: "A.8.15, A.8.3" },
  { route: "/admin/game/{tank}.jsonl", access: "operator", proves: "The deterministic tank log: seed plus the ordered action stream for every agent and player decision.", controls: "42001 A.6.2.8, A.7.5" },
  { route: "/admin/backup.json, /admin/backup/run, /admin/backup/drill", access: "operator", proves: "The full state export covering the durable object's keys and both tables beneath them under a digest, the trigger that writes a copy outside the daily schedule, and the restore drill that reads the most recent stored copy back out of object storage, restores it into a scratch instance and compares digests before wiping it. Operator-only because the export carries every profile row; the public evidence is the shape and timing panel at /evidence/#continuity.", controls: "A.8.13, A.5.29, A.5.30, A.5.12" },
  { route: "/admin/replay/{tank}?tick=N", access: "operator", proves: "Exact reconstruction of tank state at any tick, so agent behaviour can be inspected rather than described. Answers 410 once the retained history for that tank has expired, which is the retention rule working rather than a broken route.", controls: "42001 A.6.2.4, A.6.2.6, A.7.5" },
];

/* ── Summary ──────────────────────────────────────────────────────────────── */

export const STATUS_LABEL: Record<Status, string> = {
  met: "Evidenced",
  partial: "Partial",
  gap: "Gap",
  supplier: "Supplier",
  excluded: "Excluded",
};

export const STATUS_MEANING: Record<Status, string> = {
  met: "Implemented, and provable from a route listed on the row.",
  partial: "Implemented in the running service, but the record an assessor needs is not yet issued.",
  gap: "No evidence exists yet. Must be closed before certification.",
  supplier: "Delivered by the infrastructure provider under its own certification; their certificate has to be held on file.",
  excluded: "Out of scope, with the justification that would appear in the Statement of Applicability.",
};

export interface Summary {
  total: number;
  byStatus: Record<Status, number>;
  /** Controls that must be closed by this organisation: everything but supplier and excluded. */
  applicable: number;
  readiness: number;
}

const STATUSES: readonly Status[] = ["met", "partial", "gap", "supplier", "excluded"];

export function summarise(controls: readonly Control[]): Summary {
  const byStatus = { met: 0, partial: 0, gap: 0, supplier: 0, excluded: 0 } as Record<Status, number>;
  for (const control of controls) byStatus[control.status] += 1;
  const applicable = controls.length - byStatus.supplier - byStatus.excluded;
  // Partial counts as half: the control operates, but the record an assessor samples is missing.
  const readiness = applicable === 0 ? 100 : Math.round(((byStatus.met + byStatus.partial * 0.5) / applicable) * 100);
  return { total: controls.length, byStatus, applicable, readiness };
}

export const ALL_CONTROLS: readonly Control[] = REGISTERS.flatMap((register) => register.controls);

/**
 * The figures the evidence-link walk produces, derived from the arrays the walk reads.
 *
 * These numbers were transcribed into the policy records by hand and went stale twice --
 * once as the register grew, once as the policy split multiplied the routes -- while the
 * sentences carrying them stayed in the present tense. A record that states a measured
 * result and states it wrongly is worse than one that states nothing, because the whole
 * register is read on the assumption that its numbers were checked.
 *
 * The distinct-route count deliberately mirrors scripts/check-evidence.mjs: the same three
 * sources, the same `href|auth` key. The published figure and the checker's output are
 * therefore the same figure, and a disagreement between them is a real disagreement rather
 * than two ways of counting.
 */
export function evidenceWalkStats(): { distinctRoutes: number; rows: number; metRows: number; metWithoutRoute: number } {
  const distinct = new Set<string>();
  let rows = 0;
  const add = (list: readonly Evidence[] | undefined) => {
    for (const item of list ?? []) if (item && item.href) { rows += 1; distinct.add(`${item.href}|${Boolean(item.auth)}`); }
  };
  for (const process of CHANGE_PROCESSES) add(process.evidence);
  for (const document of MANDATORY_DOCUMENTS) add(document.evidence);
  for (const register of REGISTERS) for (const control of register.controls) add(control.evidence);

  let metRows = 0, metWithoutRoute = 0;
  for (const control of ALL_CONTROLS) {
    if (control.status !== "met") continue;
    metRows += 1;
    if (!(control.evidence ?? []).some((item) => item && item.href)) metWithoutRoute += 1;
  }
  return { distinctRoutes: distinct.size, rows, metRows, metWithoutRoute };
}

/** The full register as data, for anyone who would rather re-verify it themselves. */
export function conformanceManifest() {
  return {
    ok: true,
    statement: "Readiness register, not a certificate. No certification body has assessed this service.",
    standards: ["ISO/IEC 27001:2022", "ISO/IEC 42001:2023"],
    statusMeanings: STATUS_MEANING,
    summary: summarise(ALL_CONTROLS),
    perRegister: REGISTERS.map((register) => ({ id: register.id, standard: register.standard, title: register.title, summary: summarise(register.controls) })),
    changeManagement: CHANGE_PROCESSES,
    mandatoryDocuments: MANDATORY_DOCUMENTS,
    registers: REGISTERS,
    evidenceIndex: EVIDENCE_INDEX,
  };
}

/* ── Rendering ────────────────────────────────────────────────────────────────
   The page takes its metric-card renderer as an argument rather than importing
   it, so this module stays free of any dependency on the routing file and the
   two cannot form a cycle. */

type MetricIconName = "players" | "bot" | "rooms" | "uptime" | "availability" | "traffic" | "requests" | "audit";
type MetricCard = (value: string | number, label: string, detail: string, icon: MetricIconName, tone?: string, id?: string) => string;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

const STATUS_TONE: Record<Status, string> = { met: "is-met", partial: "is-partial", gap: "is-gap", supplier: "is-supplier", excluded: "is-excluded" };

function statusPill(status: Status): string {
  return `<span class="iso-pill ${STATUS_TONE[status]}">${esc(STATUS_LABEL[status])}</span>`;
}

function evidenceList(items: readonly Evidence[]): string {
  if (!items.length) return `<span class="iso-none">No evidence held — excluded from scope.</span>`;
  return `<ul class="iso-evidence">${items.map((item) => {
    const label = esc(item.label) + (item.auth ? ` <span class="iso-lock" title="Operations authentication required">auth</span>` : "");
    return `<li>${item.href ? `<a href="${esc(item.href)}">${label}</a>` : `<span class="iso-missing">${label}</span>`}</li>`;
  }).join("")}</ul>`;
}

function readinessBar(label: string, summary: Summary, href: string): string {
  const met = summary.applicable ? (summary.byStatus.met / summary.applicable) * 100 : 0;
  const partial = summary.applicable ? (summary.byStatus.partial / summary.applicable) * 100 : 0;
  return `<div class="iso-readiness">
    <div class="iso-readiness__head"><a href="${esc(href)}">${esc(label)}</a><strong>${summary.readiness}%</strong></div>
    <div class="iso-track" role="img" aria-label="${esc(label)}: ${summary.byStatus.met} evidenced, ${summary.byStatus.partial} partial, ${summary.byStatus.gap} gaps, of ${summary.applicable} controls this organisation must close"><i class="is-met" style="width:${met.toFixed(2)}%"></i><i class="is-partial" style="width:${partial.toFixed(2)}%"></i></div>
    <p class="iso-readiness__foot">${summary.byStatus.met} evidenced · ${summary.byStatus.partial} partial · ${summary.byStatus.gap} gaps · ${summary.byStatus.supplier} supplier · ${summary.byStatus.excluded} excluded</p>
  </div>`;
}

function changeProcessHtml(process: ChangeProcess): string {
  return `<article class="card iso-process" id="${esc(process.id.toLowerCase())}">
    <div class="iso-process__head"><div><div class="eyebrow">${esc(process.id)}</div><h3>${esc(process.title)}</h3></div>${statusPill(process.status)}</div>
    <p class="iso-process__purpose">${esc(process.purpose)}</p>
    <p class="iso-trigger"><span>Trigger</span><strong>${esc(process.trigger)}</strong></p>
    <div class="iso-process__grid">
      <div><h4>Procedure as operated</h4><ol class="iso-steps">${process.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol></div>
      <div>
        <h4>Records produced</h4><ul class="iso-records">${process.records.map((record) => `<li>${esc(record)}</li>`).join("")}</ul>
        <h4>Discharges</h4><p class="iso-clauses">${process.clauses.map((clause) => `<code>${esc(clause)}</code>`).join(" ")}</p>
        <h4>Evidence</h4>${evidenceList(process.evidence)}
      </div>
    </div>
  </article>`;
}

/** Deliberately not part of the shared filter: the toolbar sits below this table and must
 *  govern only what a reader can see it governing. */
function documentRow(item: DocumentItem): string {
  return `<tr>
    <td class="cell-code" data-label="Ref"><code>${esc(item.ref)}</code></td>
    <td class="cell-key" data-label="Document" title="${esc(item.title)}">${esc(item.title)}</td>
    <td class="cell-code" data-label="Clause"><code>${esc(item.clause)}</code></td>
    <td data-label="Status">${statusPill(item.status)}</td>
    <td class="iso-note" data-label="Position">${esc(item.note)}</td>
    <td data-label="Evidence">${evidenceList(item.evidence)}</td>
  </tr>`;
}

function controlRow(control: Control, standard: string): string {
  const key = standard.includes("42001") ? "42001" : "27001";
  return `<tr data-control-row data-standard="${key}" data-status="${control.status}" data-search="${esc((control.ref + " " + control.title + " " + control.ask + " " + control.note).toLowerCase())}">
    <td class="cell-code" data-label="Ref"><code>${esc(control.ref)}</code></td>
    <td class="cell-key" data-label="Control" title="${esc(control.title)}">${esc(control.title)}</td>
    <td class="iso-ask" data-label="What an assessor asks for">${esc(control.ask)}</td>
    <td data-label="Status">${statusPill(control.status)}</td>
    <td class="iso-note" data-label="Position">${esc(control.note)}</td>
    <td data-label="Evidence">${evidenceList(control.evidence)}</td>
  </tr>`;
}

function registerHtml(register: Register): string {
  const summary = summarise(register.controls);
  return `<details class="card iso-register" id="${esc(register.id)}" data-register>
    <summary class="iso-register__head"><div><div class="eyebrow">${esc(register.standard)}</div><h3>${esc(register.title)}</h3></div><span class="iso-count" data-register-count>${summary.total} controls</span></summary>
    <div class="iso-register__body">
    <p class="sub">${esc(register.intro)}</p>
    <div class="table-scroll" role="region" aria-label="${esc(register.title)}" tabindex="0"><table class="iso-table"><caption class="sr-only">${esc(register.title)}</caption><thead><tr><th scope="col">Ref</th><th scope="col">Control</th><th scope="col">What an assessor asks for</th><th scope="col">Status</th><th scope="col">Position</th><th scope="col">Evidence</th></tr></thead><tbody>${register.controls.map((control) => controlRow(control, register.standard)).join("")}</tbody></table></div>
    <p class="iso-empty" data-register-empty hidden>No rows in this register match the current filter.</p>
    </div>
  </details>`;
}

function filterScript(): string {
  // No template literals or ${} inside — this string is emitted verbatim into the page.
  const script = [
    "(function(){",
    "var search=document.getElementById('iso-search'),standard=document.getElementById('iso-standard'),status=document.getElementById('iso-status'),count=document.getElementById('iso-count'),reset=document.getElementById('iso-reset');",
    "var rows=Array.prototype.slice.call(document.querySelectorAll('tr[data-control-row]')),total=rows.length,timer=null;",
    "function announce(text){if(count.textContent!==text)count.textContent=text;}",
    "function apply(delay){",
    "var q=(search.value||'').trim().toLowerCase(),s=standard.value||'',st=status.value||'',shown=0;",
    "rows.forEach(function(row){var ok=(!q||(row.dataset.search||'').indexOf(q)>-1)&&(!s||row.dataset.standard===s)&&(!st||row.dataset.status===st);row.hidden=!ok;if(ok)shown++;});",
    "Array.prototype.forEach.call(document.querySelectorAll('[data-register]'),function(section){",
    "var visible=Array.prototype.filter.call(section.querySelectorAll('tr[data-control-row]'),function(row){return !row.hidden;}).length;",
    "var label=section.querySelector('[data-register-count]'),empty=section.querySelector('[data-register-empty]');",
    "if(label)label.textContent=visible+(visible===1?' control':' controls');",
    "if(empty)empty.hidden=visible>0;if((q||s||st)&&visible>0)section.open=true;});",
    "var text=shown===total?'Showing all '+total+' rows.':'Showing '+shown+' of '+total+' rows.';",
    "if(timer)clearTimeout(timer);if(delay){timer=setTimeout(function(){announce(text);},450);}else announce(text);}",
    "search.addEventListener('input',function(){apply(true);});",
    "standard.addEventListener('change',function(){apply(false);});",
    "status.addEventListener('change',function(){apply(false);});",
    "reset.addEventListener('click',function(){search.value='';standard.value='';status.value='';apply(false);search.focus();});",
    "apply(false);",
    "}());",
  ].join("");
  return `<script nonce="__WG_CSP_NONCE__">${script}</script>`;
}

export function conformanceHtml(metricCard: MetricCard, embedded = false): string {
  const overall = summarise(ALL_CONTROLS);
  const statusOptions = STATUSES.map((value) => `<option value="${value}">${esc(STATUS_LABEL[value])}</option>`).join("");
  const documents = summarise(MANDATORY_DOCUMENTS.map((item) => ({ ref: item.ref, title: item.title, ask: "", status: item.status, note: item.note, evidence: item.evidence })));
  const changes = summarise(CHANGE_PROCESSES.map((item) => ({ ref: item.id, title: item.title, ask: "", status: item.status, note: item.purpose, evidence: item.evidence })));

  const intro = embedded
    ? `<section class="controls-block" id="registers" tabindex="-1" aria-labelledby="registers-heading"><div class="eyebrow">Certification readiness · the site is the evidence</div><h2 id="registers-heading">Control register</h2>`
    : `<section class="page-intro"><div class="eyebrow">Certification readiness · the site is the evidence</div><h1>Audit</h1>`;

  return `${intro}
    <p class="sub">Every clause of ISO/IEC 27001:2022 and ISO/IEC 42001:2023, every one of the 93 Annex A controls and all 38 AI controls, each with what an assessor asks for, where this service stands, and the live route that proves it. Nothing here is a screenshot: an evidence link is a URL you can open now and check against the running system.</p>
    <p class="action-links"><a class="action-link" href="#register-filter">Search all ${overall.total} rows →</a> <a class="action-link" href="/audit/manifest.json">Register as JSON →</a></p></section>

  <div class="card hero-card">
    <div class="eyebrow">Statement</div>
    <h2 style="margin:0 0 8px;font-size:1.25rem">This is a readiness register, not a certificate</h2>
    <p class="sub" style="margin:0 0 18px">No certification body has assessed this service. The register is published in the state it is actually in, gaps included, because an overstated register fails a Stage 2 audit faster than an honest one. ${overall.byStatus.gap} rows have no evidence at all and say so.</p>
    <div class="iso-readiness-grid">
      ${REGISTERS.map((register) => readinessBar(register.title.replace(/^ISO\/IEC /, "").replace(/:20\d\d/, ""), summarise(register.controls), "#" + register.id)).join("")}
    </div>
  </div>

  <div class="metric-grid stat-grid">
    ${metricCard(overall.total, "Controls in register", "27001 and 42001, complete", "audit", "tone-cyan")}
    ${metricCard(overall.byStatus.met, "Evidenced", "provable from a live route", "availability", "tone-green")}
    ${metricCard(overall.byStatus.partial, "Partial", "operating, record not issued", "requests", "tone-yellow")}
    ${metricCard(overall.byStatus.gap, "Gaps", "must close before certification", "traffic", "tone-red")}
    ${metricCard(overall.byStatus.supplier, "Supplier-inherited", "needs the provider's certificate", "rooms", "tone-violet")}
    ${metricCard(overall.byStatus.excluded, "Excluded", "with stated justification", "bot", "tone-violet")}
  </div>

  <div class="card">
    <h2 style="margin:0 0 10px;font-size:1.05rem">How to read a row</h2>
    <div class="table-scroll" role="region" aria-label="Status meanings" tabindex="0" style="margin:0"><table class="iso-key-table"><caption class="sr-only">Status meanings</caption><thead><tr><th scope="col">Status</th><th scope="col">What it means here</th></tr></thead><tbody>
      ${STATUSES.map((value) => `<tr><td>${statusPill(value)}</td><td>${esc(STATUS_MEANING[value])}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="sub" style="margin:12px 0 0">Readiness counts only the controls this organisation has to close — supplier-inherited and excluded rows are removed from the denominator, and a partial row counts as half. Rows marked <span class="iso-lock">auth</span> need operations credentials; an assessor is given them for the engagement.</p>
  </div>

  <h2 class="iso-section" id="change-management">Change management</h2>
  <p class="sub">ISO/IEC 27001 asks for change control in four separate places — Clause 6.3 for planned changes to the management system, Clause 8.1 for control of planned changes and review of unintended ones, A.8.32 for change management proper, and the development controls A.8.25 to A.8.34. ISO/IEC 42001 adds Clause 6.3 and the deployment and operation controls for the AI system itself. These are the ${CHANGE_PROCESSES.length} processes that satisfy all of them: ${changes.byStatus.met} evidenced, ${changes.byStatus.partial} partial, ${changes.byStatus.gap} with no evidence yet.</p>
  ${CHANGE_PROCESSES.map(changeProcessHtml).join("")}

  <h2 class="iso-section" id="documents">Mandatory documented information</h2>
  <p class="sub">The Stage 1 document review. An assessor works down a list very close to this one and will not schedule Stage 2 until each item exists. ${documents.byStatus.met} of these ${MANDATORY_DOCUMENTS.length} are held today, ${documents.byStatus.partial} exist in substance but are not issued as controlled documents, and ${documents.byStatus.gap} have to be written.</p>
  <div class="card">
    <div class="table-scroll" role="region" aria-label="Mandatory documented information" tabindex="0"><table class="iso-table iso-doc-table"><caption class="sr-only">Mandatory documented information</caption><thead><tr><th scope="col">Ref</th><th scope="col">Document</th><th scope="col">Clause</th><th scope="col">Status</th><th scope="col">Position</th><th scope="col">Evidence</th></tr></thead><tbody>${MANDATORY_DOCUMENTS.map(documentRow).join("")}</tbody></table></div>
  </div>

  <h3 class="iso-section" id="clause-registers">Clause and control registers</h3>
  <p class="sub">All ${overall.total} rows across both standards, filtered together. The search covers the reference, the control name, the assessor's question and this service's position on it.</p>
  <div class="card iso-toolbar-card" id="register-filter">
    <div class="log-toolbar iso-toolbar">
      <label for="iso-search">Search controls<input type="search" id="iso-search" placeholder="change management, logging, A.8.32…" autocomplete="off"></label>
      <label for="iso-standard">Standard<select id="iso-standard"><option value="">Both standards</option><option value="27001">ISO/IEC 27001</option><option value="42001">ISO/IEC 42001</option></select></label>
      <label for="iso-status">Status<select id="iso-status"><option value="">Any status</option>${statusOptions}</select></label>
      <button type="button" class="secondary" id="iso-reset">Clear filters</button>
    </div>
    <p class="log-visible-count" id="iso-count" role="status" aria-live="polite" aria-atomic="true">Showing all ${overall.total} rows.</p>
  </div>
  ${REGISTERS.map(registerHtml).join("")}

  <h2 class="iso-section" id="evidence">Evidence index</h2>
  <p class="sub">Every route this service publishes and what it proves. An assessor should be able to work down this list without asking for anything that is not already here.</p>
  <div class="card">
    <div class="table-scroll" role="region" aria-label="Evidence index" tabindex="0"><table class="iso-table iso-evidence-table"><caption class="sr-only">Evidence index</caption><thead><tr><th scope="col">Route</th><th scope="col">Access</th><th scope="col">What it proves</th><th scope="col">Controls</th></tr></thead><tbody>
      ${EVIDENCE_INDEX.map((route) => `<tr><td class="cell-code" data-label="Route"><code>${esc(route.route)}</code></td><td data-label="Access">${route.access === "operator" ? `<span class="iso-pill is-supplier">Operator</span>` : `<span class="iso-pill is-met">Public</span>`}</td><td class="iso-note" data-label="What it proves">${esc(route.proves)}</td><td class="iso-clauses" data-label="Controls">${esc(route.controls)}</td></tr>`).join("")}
    </tbody></table></div>
  </div>

  <h2 class="iso-section" id="path">What certification still requires</h2>
  <div class="card">
    <ol class="iso-path">
      <li><strong>Close the management-system gaps first.</strong> Policy, roles, risk method, objectives, internal audit and management review. Every one of them is a clause-level requirement, and no amount of technical control substitutes for them.</li>
      <li><strong>Issue this register as a controlled Statement of Applicability.</strong> It already covers all 93 Annex A controls and all 38 AI controls with justifications; it needs an owner, a version, an approval date and a review interval.</li>
      <li><strong>Run the management system for long enough to have records.</strong> An assessor samples records over a period. Change entries, incidents and receipts already accumulate continuously; audit and review records do not exist yet.</li>
      <li><strong>Hold the infrastructure provider's certificate on file</strong> to support the ${overall.byStatus.supplier} supplier-inherited rows, and record its scope and expiry.</li>
      <li><strong>Stage 1</strong> — document review against the list above. <strong>Stage 2</strong> — evidence of the system actually operating. <strong>Surveillance</strong> — annually thereafter.</li>
    </ol>
    <p class="sub" style="margin:14px 0 0">Operational controls for the running service remain protected behind operations credentials. Their public records are consolidated under <a href="/evidence/#incidents">Incidents</a>, <a href="/evidence/#logs">Logs</a>, and <a href="/evidence/#changes">Change management</a>.</p>
  </div>
  ${filterScript()}`;
}
