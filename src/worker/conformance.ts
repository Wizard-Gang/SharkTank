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
  register: ev("This register", "/audit/"),
  manifest: ev("Register as JSON", "/audit/manifest.json"),
  change: ev("Change record", "/roadmap/"),
  changeJson: ev("Change record (JSON)", "/roadmap.json"),
  incidents: ev("Incident record", "/incidents/"),
  incidentsJson: ev("Incident record (JSON)", "/incidents.json"),
  receipts: ev("Control receipt chain", "/incidents/#control-history"),
  logs: ev("Service and tank logs", "/logs/"),
  logsJson: ev("Logs (JSON)", "/logs.json"),
  status: ev("Availability status", "/status/"),
  statusJson: ev("Status (JSON)", "/status.json"),
  inquiry: ev("Cost and capacity meters", "/inquiry/"),
  inquiryJson: ev("Cost meters (JSON)", "/inquiry.json"),
  api: ev("API reference", "/docs/"),
  openapi: ev("OpenAPI document", "/openapi.json"),
  intake: ev("Security report intake", "/docs/#op-post-api-security-report"),
  admin: ev("Operations control panel", "/admin/", true),
  adminStatus: ev("Full operational record", "/admin/status.json", true),
  adminLog: ev("90-day action log", "/admin/log.json", true),
  adminGame: ev("Deterministic tank log", "/admin/game/room-1.jsonl", true),
  adminReplay: ev("Deterministic replay at a tick", "/admin/replay/room-1?tick=100", true),
  game: ev("The service itself", "/"),
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
    status: "partial",
    steps: [
      "Classify the change as feature, enhancement, fix, bonus or hotfix.",
      "State the security consequence: does it touch authentication, public input, retention, or spend.",
      "Assess whether the change alters the risk treatment already recorded for the affected control.",
      "Record the classification against the change identifier before work starts.",
    ],
    records: ["Change identifier and label on the published change record", "Deployment grouping"],
    clauses: ["27001 Clause 6.3", "27001 Clause 8.1", "27001 A.8.32", "42001 Clause 6.3"],
    evidence: [E.change, E.changeJson],
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
    status: "partial",
    steps: [
      "The change is released only through the credentialed deployment path.",
      "Control actions taken around the release — closing the tank, restoring it — require operations authentication, a same-origin request, and an explicit action header.",
      "Each control action is written to the append-only receipt chain with a sequence number and a hash of the previous entry.",
    ],
    records: ["Control receipt with sequence, code, decision, outcome, timestamp and hash"],
    clauses: ["27001 A.8.32", "27001 A.5.3", "27001 A.8.2"],
    evidence: [E.receipts, E.admin],
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
    status: "partial",
    steps: [
      "Re-check the affected routes on production after release.",
      "Confirm the evidence items claimed by the change entry are actually observable.",
      "Where the change answered an incident or a report, record the closure against that record.",
      "Feed recurring failure modes back into the verification gate.",
    ],
    records: ["Evidence list per change entry", "Incident closure state"],
    clauses: ["27001 Clause 10.1", "27001 A.5.27", "42001 A.6.2.6"],
    evidence: [E.change, E.incidents],
  },
  {
    id: "CM-11",
    title: "Review of unintended change",
    purpose: "Clause 8.1 requires the consequences of unintended changes to be reviewed and acted on, not only planned ones.",
    trigger: "Behaviour changes that nobody requested — platform behaviour, dependency drift, state loss, measurement resets.",
    status: "partial",
    steps: [
      "Detect through the live meters and status surface rather than by report alone.",
      "Record the observation as an incident where service was affected.",
      "Determine whether it originated in this service, in configuration, or upstream at the platform.",
      "Where the service must tolerate it, change the service and record that as a normal change.",
    ],
    records: ["Incident entry", "Change entry where a tolerance was added"],
    clauses: ["27001 Clause 8.1", "27001 A.8.16", "27001 Clause 10.2"],
    evidence: [E.incidents, E.status, E.inquiry],
  },
  {
    id: "CM-12",
    title: "Supplier and platform change monitoring",
    purpose: "Changes made by the infrastructure provider are watched, because they change this service's risk without asking.",
    trigger: "Provider runtime, storage or edge behaviour changes; compatibility date changes.",
    status: "gap",
    steps: [
      "The runtime compatibility date is pinned in version-controlled configuration, so provider behaviour changes are adopted deliberately.",
      "A record of provider security bulletins, certificate currency and service changes is not yet kept.",
      "A scheduled review of the provider's own certifications and their scope is not yet in place.",
    ],
    records: ["Pinned compatibility date", "Supplier review record — not yet produced"],
    clauses: ["27001 A.5.22", "27001 A.5.23", "27001 A.5.19"],
    evidence: [ev("Supplier review record required")],
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
  { ref: "DOC-01", title: "Scope of the information security management system", clause: "27001 Clause 4.3", status: "partial", note: "The technical scope is observable — one Worker, two durable classes, one bucket, the routes listed in the API reference — but it is not yet issued as a controlled scope statement with boundaries, interfaces and exclusions.", evidence: [E.api, E.openapi] },
  { ref: "DOC-02", title: "Information security policy", clause: "27001 Clause 5.2", status: "gap", note: "No approved, dated, top-level policy exists. This is the single most common Stage 1 blocker.", evidence: [ev("Policy required")] },
  { ref: "DOC-03", title: "Information security roles and responsibilities", clause: "27001 Clause 5.3", status: "gap", note: "One operator holds every role. That is acceptable for a small scope, but it must be written down, including who authorises what.", evidence: [ev("Role assignment required")] },
  { ref: "DOC-04", title: "Information security risk assessment process", clause: "27001 Clause 6.1.2", status: "gap", note: "Risks have been identified and treated in practice — an independent review produced findings that were closed as recorded changes — but there is no documented method, criteria or acceptance threshold.", evidence: [E.change] },
  { ref: "DOC-05", title: "Information security risk treatment process", clause: "27001 Clause 6.1.3", status: "gap", note: "Treatment happens as change entries. The process that decides between treat, accept, avoid and share is not documented.", evidence: [E.change] },
  { ref: "DOC-06", title: "Statement of Applicability", clause: "27001 Clause 6.1.3 d)", status: "partial", note: "This register is the working Statement of Applicability: all 93 Annex A controls appear, each with a status and justification. It becomes the real thing once it is approved, dated and version-controlled.", evidence: [E.register, E.manifest] },
  { ref: "DOC-07", title: "Risk treatment plan", clause: "27001 Clause 6.1.3 e)", status: "gap", note: "The open rows in this register are the raw material for the plan; owners and target dates are not yet assigned.", evidence: [E.register] },
  { ref: "DOC-08", title: "Information security objectives", clause: "27001 Clause 6.2", status: "partial", note: "Measurable objectives exist in operational form — availability since project start, spend under a hard limit, incident closure times — but they are not issued as approved objectives with targets.", evidence: [E.status, E.inquiry, E.change] },
  { ref: "DOC-09", title: "Evidence of competence", clause: "27001 Clause 7.2", status: "gap", note: "No competence record for the operator holding the security roles.", evidence: [ev("Competence record required")] },
  { ref: "DOC-10", title: "Documented information determined as necessary", clause: "27001 Clause 7.5.1", status: "partial", note: "Operating detail is published — API reference, this register, the change record — but there is no document control scheme with owners, versions and review dates.", evidence: [E.api, E.register] },
  { ref: "DOC-11", title: "Operational planning and control records", clause: "27001 Clause 8.1", status: "met", note: "Every production change is recorded with an identifier, a deployment grouping and its evidence; control actions are receipted.", evidence: [E.change, E.receipts] },
  { ref: "DOC-12", title: "Results of information security risk assessments", clause: "27001 Clause 8.2", status: "partial", note: "One independent security and accessibility review has been performed and every finding closed as a recorded change. The results are not published as an assessment record.", evidence: [E.change] },
  { ref: "DOC-13", title: "Results of information security risk treatment", clause: "27001 Clause 8.3", status: "met", note: "Each treatment is a published change entry naming the finding it closes, the fix, and the evidence produced.", evidence: [E.change, E.changeJson] },
  { ref: "DOC-14", title: "Monitoring and measurement results", clause: "27001 Clause 9.1", status: "met", note: "Availability, capacity, spend and action volume are measured continuously and published, with the raw figures available as JSON.", evidence: [E.status, E.statusJson, E.inquiry, E.logs] },
  { ref: "DOC-15", title: "Internal audit programme and results", clause: "27001 Clause 9.2", status: "gap", note: "No internal audit has been planned or performed against the management system.", evidence: [ev("Internal audit required")] },
  { ref: "DOC-16", title: "Management review results", clause: "27001 Clause 9.3", status: "gap", note: "No management review has been held or minuted.", evidence: [ev("Management review required")] },
  { ref: "DOC-17", title: "Nonconformities and corrective actions", clause: "27001 Clause 10.2", status: "partial", note: "Security findings and incidents are recorded with their corrective action and closure, which is most of what this clause wants; they are not yet classified as nonconformities with root cause analysis.", evidence: [E.incidents, E.change] },
  { ref: "DOC-18", title: "Inventory of information and associated assets", clause: "27001 A.5.9", status: "partial", note: "The bound services are inventoried and metered — runtime, durable storage, object storage — but there is no asset register naming owners and classifications.", evidence: [E.inquiry, E.inquiryJson] },
  { ref: "DOC-19", title: "Acceptable use, access control and supplier policies", clause: "27001 A.5.10, A.5.15, A.5.19", status: "gap", note: "Access control is enforced technically and provably; the policies behind it are not written.", evidence: [E.admin] },
  { ref: "DOC-20", title: "Incident management procedure", clause: "27001 A.5.24", status: "met", note: "Intake, assessment, response, restoration and closure are separate documented operations, each with its own route and its own record.", evidence: [E.intake, E.incidents, E.receipts] },
  { ref: "DOC-21", title: "Business continuity and ICT readiness plan", clause: "27001 A.5.29, A.5.30", status: "partial", note: "The portal and every evidence route stay online while the game is closed, which is a tested continuity property. There is no documented plan, recovery objective, or continuity test record.", evidence: [E.status, E.incidents] },
  { ref: "DOC-22", title: "Legal, statutory, regulatory and contractual register", clause: "27001 A.5.31", status: "gap", note: "No register of applicable obligations exists.", evidence: [ev("Legal register required")] },
  { ref: "DOC-23", title: "Logging, retention and evidence handling procedure", clause: "27001 A.5.28, A.5.33, A.8.15", status: "met", note: "Retention is enforced in code — 90 days for the action log, 24 hours for tank captures, no expiry for control receipts — and public writes are capped so they cannot evict recorded evidence.", evidence: [E.logs, E.logsJson, E.receipts] },
  { ref: "DOC-24", title: "Secure development and change management procedure", clause: "27001 A.8.25, A.8.32", status: "partial", note: "The change processes are documented on this page and operated on every release; they are not yet issued as an approved procedure.", evidence: [E.register, E.change] },
  { ref: "DOC-25", title: "AI policy and AI system impact assessment", clause: "42001 Clause 5.2, 6.1.4", status: "gap", note: "The service operates autonomous agents against human players, which brings ISO/IEC 42001 into scope. Neither an AI policy nor an impact assessment has been produced.", evidence: [ev("AI policy and impact assessment required")] },
] as const;

/* ── ISO/IEC 27001:2022, Clauses 4 to 10 ─────────────────────────────────────
   The management system requirements. Annex A cannot compensate for a gap here:
   a missing policy or a missing management review is a major nonconformity on
   its own, however good the technical controls are. */

const ISO27001_CLAUSES: Control[] = [
  { ref: "4.1", title: "Understanding the organisation and its context", ask: "Show the internal and external issues relevant to the management system, and how they were determined.", status: "gap", note: "Context is implicit in the design — a single-operator service on managed infrastructure with a hard spend limit — but has never been written down or reviewed.", evidence: [ev("Context analysis required")] },
  { ref: "4.2", title: "Needs and expectations of interested parties", ask: "Show who the interested parties are and which of their requirements are relevant to security.", status: "gap", note: "Players, the infrastructure provider and security researchers are the parties in practice. No documented analysis exists.", evidence: [E.intake] },
  { ref: "4.3", title: "Determining the scope of the ISMS", ask: "Show the documented scope, its boundaries, and the justification for anything excluded.", status: "partial", note: "The technical boundary is fully observable and published as an API document; it is not issued as a controlled scope statement.", evidence: [E.api, E.openapi] },
  { ref: "4.4", title: "Information security management system", ask: "Show that the ISMS and its processes are established, implemented, maintained and continually improved.", status: "partial", note: "Operational processes run and leave records. The management system layer around them — policy, review, audit — is not yet established.", evidence: [E.register, E.change] },
  { ref: "5.1", title: "Leadership and commitment", ask: "Show how top management demonstrates commitment: resources, direction, integration into business processes.", status: "gap", note: "No documented commitment, resource decision or direction-setting exists.", evidence: [ev("Leadership record required")] },
  { ref: "5.2", title: "Information security policy", ask: "Show an approved, communicated, available policy appropriate to the purpose of the organisation.", status: "gap", note: "Not written. Blocks Stage 1.", evidence: [ev("Policy required")] },
  { ref: "5.3", title: "Roles, responsibilities and authorities", ask: "Show who is assigned which security responsibility, and who reports on ISMS performance.", status: "gap", note: "One operator holds every role; the assignment is not documented.", evidence: [ev("Role assignment required")] },
  { ref: "6.1.1", title: "Actions to address risks and opportunities", ask: "Show how risks and opportunities were determined and how the actions are integrated into the ISMS.", status: "partial", note: "Risks have been acted on and the actions are published as changes; the determination step is undocumented.", evidence: [E.change] },
  { ref: "6.1.2", title: "Information security risk assessment", ask: "Show the documented risk assessment process: criteria, repeatability, comparable results.", status: "gap", note: "No documented method or acceptance criteria.", evidence: [ev("Risk method required")] },
  { ref: "6.1.3", title: "Information security risk treatment", ask: "Show the treatment process, the Statement of Applicability covering all 93 Annex A controls, and the treatment plan.", status: "partial", note: "This register covers all 93 Annex A controls with status and justification, which is the substance of a Statement of Applicability. The treatment process and plan are still missing.", evidence: [E.register, E.manifest] },
  { ref: "6.2", title: "Information security objectives", ask: "Show measurable objectives, with plans, resources, responsibility and evaluation.", status: "partial", note: "Availability, spend ceiling and incident closure are measured and published; they are not stated as approved objectives with targets.", evidence: [E.status, E.inquiry] },
  { ref: "6.3", title: "Planning of changes", ask: "Show that changes to the management system are carried out in a planned manner.", status: "partial", note: "Changes to the service are planned, classified and recorded. Changes to the management system itself have no process yet, because the management system is not yet established.", evidence: [E.change, E.register] },
  { ref: "7.1", title: "Resources", ask: "Show the resources determined and provided for the ISMS.", status: "partial", note: "Infrastructure resources are metered against a hard limit and published; people and time are not accounted for.", evidence: [E.inquiry] },
  { ref: "7.2", title: "Competence", ask: "Show the competence required for security roles and the evidence that it is held.", status: "gap", note: "No competence record.", evidence: [ev("Competence record required")] },
  { ref: "7.3", title: "Awareness", ask: "Show that people are aware of the policy, their contribution, and the consequences of not conforming.", status: "gap", note: "No awareness activity, because no policy exists to be aware of.", evidence: [ev("Awareness record required")] },
  { ref: "7.4", title: "Communication", ask: "Show what is communicated about security, when, to whom and by whom.", status: "partial", note: "External communication is strong and continuous: status, incidents, logs, costs and this register are public and machine-readable. Internal communication is undefined.", evidence: [E.status, E.incidents, E.logs] },
  { ref: "7.5.1", title: "Documented information — general", ask: "Show the documented information required by the standard and determined as necessary.", status: "partial", note: "Substantial documentation is published and live; the required management-system documents are largely absent.", evidence: [E.api, E.register] },
  { ref: "7.5.2", title: "Creating and updating documented information", ask: "Show identification, format and approval control for documents.", status: "gap", note: "Published documents carry no identifier, version or approval.", evidence: [ev("Document control required")] },
  { ref: "7.5.3", title: "Control of documented information", ask: "Show that documents are available, protected, controlled for distribution, access, retrieval, retention and disposal.", status: "partial", note: "Evidence records are strongly controlled — retention enforced in code, integrity chained, access split between public and authenticated. Ordinary documents are not under control.", evidence: [E.logs, E.receipts] },
  { ref: "8.1", title: "Operational planning and control", ask: "Show controlled processes, control of planned changes, review of unintended changes, and control of externally provided processes.", status: "partial", note: "Planned change control is operated and recorded. Unintended change is detected through live meters but has no documented review step, and the externally provided platform is not formally controlled.", evidence: [E.change, E.status, E.inquiry] },
  { ref: "8.2", title: "Information security risk assessment (performance)", ask: "Show risk assessments performed at planned intervals and their documented results.", status: "gap", note: "One independent review was performed and acted on, but not at planned intervals and not documented as an assessment.", evidence: [E.change] },
  { ref: "8.3", title: "Information security risk treatment (performance)", ask: "Show the treatment plan implemented and its documented results.", status: "met", note: "Every finding closed to date is published as a change entry naming the finding, the fix, the closure time and the evidence produced.", evidence: [E.change, E.changeJson] },
  { ref: "9.1", title: "Monitoring, measurement, analysis and evaluation", ask: "Show what is monitored, by what methods, when, and by whom — with the results retained.", status: "met", note: "Availability is measured from project start rather than a rolling window, spend is sampled and charted against a hard limit, and every measurement is retained and downloadable.", evidence: [E.status, E.statusJson, E.inquiry, E.logsJson] },
  { ref: "9.2", title: "Internal audit", ask: "Show the audit programme, its criteria and scope, the auditors' objectivity, and the results reported to management.", status: "gap", note: "No internal audit programme.", evidence: [ev("Internal audit required")] },
  { ref: "9.3", title: "Management review", ask: "Show reviews at planned intervals covering the required inputs, with documented results.", status: "gap", note: "No management review has been held.", evidence: [ev("Management review required")] },
  { ref: "10.1", title: "Continual improvement", ask: "Show that the suitability, adequacy and effectiveness of the ISMS is continually improved.", status: "partial", note: "The service improves continually and visibly — every hotfix is published with its trigger and closure time — but improvement of the management system itself is not yet measured.", evidence: [E.change] },
  { ref: "10.2", title: "Nonconformity and corrective action", ask: "Show reaction to nonconformities, evaluation of causes, corrective action, and retained evidence of both nature and outcome.", status: "partial", note: "Incidents and security findings are recorded, corrected and closed with receipts. They are not classified as nonconformities and no root cause analysis is retained.", evidence: [E.incidents, E.receipts, E.change] },
];

/* ── ISO/IEC 27001:2022 Annex A — all 93 controls ────────────────────────────
   Every control must appear in the Statement of Applicability with a decision,
   including the ones that do not apply. An omitted control is a finding. */

const ISO27001_ANNEX_A: Control[] = [
  { ref: "A.5.1", title: "Policies for information security", ask: "Show a defined, approved, published and reviewed policy set.", status: "gap", note: "No policy set exists.", evidence: [ev("Policy set required")] },
  { ref: "A.5.2", title: "Information security roles and responsibilities", ask: "Show roles defined and allocated according to need.", status: "gap", note: "Undocumented; one operator.", evidence: [ev("Role definition required")] },
  { ref: "A.5.3", title: "Segregation of duties", ask: "Show conflicting duties separated, or the compensating controls where they cannot be.", status: "partial", note: "Duties cannot be separated with one operator. The compensating control is real and verifiable: every control action requires authentication plus a same-origin request plus an explicit action header, and lands in a hash-chained receipt that cannot be silently edited.", evidence: [E.receipts, E.admin] },
  { ref: "A.5.4", title: "Management responsibilities", ask: "Show management requiring personnel to apply security per policy.", status: "gap", note: "No policy, so nothing to require.", evidence: [ev("Management direction required")] },
  { ref: "A.5.5", title: "Contact with authorities", ask: "Show maintained contacts with relevant authorities.", status: "gap", note: "No contacts identified or maintained.", evidence: [ev("Authority contact list required")] },
  { ref: "A.5.6", title: "Contact with special interest groups", ask: "Show contact with security forums and professional associations.", status: "gap", note: "None maintained.", evidence: [ev("Interest group contacts required")] },
  { ref: "A.5.7", title: "Threat intelligence", ask: "Show threat information collected and analysed to produce intelligence.", status: "gap", note: "No threat intelligence process. Findings arrive through the public report intake rather than being sought.", evidence: [E.intake] },
  { ref: "A.5.8", title: "Information security in project management", ask: "Show security integrated into project management.", status: "partial", note: "Security work is planned and released through the same change process as everything else, and each entry states the security consequence it addresses.", evidence: [E.change] },
  { ref: "A.5.9", title: "Inventory of information and other associated assets", ask: "Show an inventory with owners.", status: "partial", note: "Bound services are inventoried and metered per service; the inventory carries no owners or classification.", evidence: [E.inquiry, E.inquiryJson] },
  { ref: "A.5.10", title: "Acceptable use of information and assets", ask: "Show rules for acceptable use, documented and implemented.", status: "gap", note: "Not written.", evidence: [ev("Acceptable use rules required")] },
  { ref: "A.5.11", title: "Return of assets", ask: "Show assets returned on change or termination.", status: "excluded", note: "No personnel and no issued assets. Re-enters scope on the first hire or contractor.", evidence: [] },
  { ref: "A.5.12", title: "Classification of information", ask: "Show information classified by confidentiality, integrity and availability needs.", status: "partial", note: "A working two-tier split is enforced in code — public evidence versus operator-only records — and applied consistently by one shared route list. It is not expressed as a classification scheme.", evidence: [E.logs, E.adminStatus] },
  { ref: "A.5.13", title: "Labelling of information", ask: "Show labelling procedures aligned to the classification scheme.", status: "partial", note: "Authenticated routes are marked as such in the API reference and on this page, but there is no formal labelling procedure.", evidence: [E.api, E.register] },
  { ref: "A.5.14", title: "Information transfer", ask: "Show rules and controls for transfer inside and outside the organisation.", status: "met", note: "Every route refuses plaintext; operations routes are never redirected, because a redirect would mean the credential already crossed in clear text. Strict transport security is set on every response, and there are no third-party endpoints in the page delivery path.", evidence: [E.change, E.api] },
  { ref: "A.5.15", title: "Access control", ask: "Show rules to control physical and logical access, based on requirements.", status: "met", note: "One list defines every credentialed route, and the same list drives the gate — so a new control route cannot be added without also being gated.", evidence: [E.admin, E.api] },
  { ref: "A.5.16", title: "Identity management", ask: "Show the full life cycle of identities.", status: "partial", note: "Players hold a pseudonymous identifier set by the server, never accepted from the client for anything that matters. There is one operations identity with no documented life cycle.", evidence: [E.api] },
  { ref: "A.5.17", title: "Authentication information", ask: "Show allocation and management of secrets controlled by a management process.", status: "met", note: "The operations credential exists only as a platform secret. With no secret configured the gate denies rather than falling open, comparison is constant-time over digests so no length leaks, and the credential is refused entirely over plaintext.", evidence: [E.change, E.admin] },
  { ref: "A.5.18", title: "Access rights", ask: "Show provisioning, review and removal of access rights.", status: "partial", note: "Exactly one privileged role exists and it is enforced everywhere; there is no periodic review record.", evidence: [E.admin] },
  { ref: "A.5.19", title: "Information security in supplier relationships", ask: "Show processes to manage supplier-related risk.", status: "partial", note: "There is one supplier — the infrastructure platform — and the dependency is total. No supplier risk process exists.", evidence: [E.inquiry] },
  { ref: "A.5.20", title: "Addressing security within supplier agreements", ask: "Show security requirements agreed with each supplier.", status: "gap", note: "Standard platform terms only; no security requirements negotiated or recorded.", evidence: [ev("Supplier agreement record required")] },
  { ref: "A.5.21", title: "Managing security in the ICT supply chain", ask: "Show processes to manage risk from the products and services supply chain.", status: "partial", note: "The dependency set is deliberately small and pinned in version control, which limits the surface. There is no software bill of materials and no upstream advisory process.", evidence: [ev("Software bill of materials required")] },
  { ref: "A.5.22", title: "Monitoring, review and change management of supplier services", ask: "Show regular monitoring and review of supplier service delivery and changes.", status: "gap", note: "See CM-12. The runtime compatibility date is pinned, but nothing reviews provider changes on a schedule.", evidence: [ev("Supplier review record required")] },
  { ref: "A.5.23", title: "Information security for use of cloud services", ask: "Show processes for acquisition, use, management and exit of cloud services.", status: "partial", note: "Acquisition and use are fully declared in version-controlled configuration, and consumption is metered against a hard limit. There is no documented exit strategy.", evidence: [E.inquiry, E.adminStatus] },
  { ref: "A.5.24", title: "Incident management planning and preparation", ask: "Show planned processes, roles and responsibilities for incident management.", status: "met", note: "Intake, assessment, response, restoration and closure are separate operations with separate routes, separate authorisation and separate records — deliberately so, because reporting must never be the same act as taking the service down.", evidence: [E.intake, E.incidents, E.admin] },
  { ref: "A.5.25", title: "Assessment and decision on information security events", ask: "Show events assessed and classified into incidents or not.", status: "met", note: "A public report records an event and raises it; whether it warrants downtime is a separate authenticated operator decision, and both steps are recorded.", evidence: [E.intake, E.receipts] },
  { ref: "A.5.26", title: "Response to information security incidents", ask: "Show response according to documented procedures.", status: "met", note: "Lockdown closes active connections and gates game traffic while every evidence route stays online. Restoring traffic records the end of impact and explicitly does not close the underlying report.", evidence: [E.incidents, E.receipts] },
  { ref: "A.5.27", title: "Learning from information security incidents", ask: "Show knowledge from incidents used to strengthen controls.", status: "met", note: "Each report produces a published hotfix entry naming the trigger, the closure time and the controls strengthened. The pattern is visible across the whole post-delivery record.", evidence: [E.change, E.incidents] },
  { ref: "A.5.28", title: "Collection of evidence", ask: "Show procedures for identification, collection, acquisition and preservation of evidence.", status: "met", note: "Control decisions are appended to a SHA-256 chain that is re-derived on every read, with the verdict stated on the page. An altered entry is named by sequence number.", evidence: [E.receipts, E.incidentsJson] },
  { ref: "A.5.29", title: "Information security during disruption", ask: "Show how security is maintained during disruption.", status: "partial", note: "Disruption of the game does not disrupt the evidence: status, incidents, logs, cost and this register stay online and authenticated routes stay gated while the tank is closed. No documented plan states this as a requirement.", evidence: [E.status, E.incidents] },
  { ref: "A.5.30", title: "ICT readiness for business continuity", ask: "Show ICT readiness planned, implemented, maintained and tested against continuity objectives.", status: "partial", note: "Recovery has been exercised in production — the tank has been closed and restored, each time with paired receipts — but no recovery objectives are stated and no test is scheduled.", evidence: [E.incidents, E.receipts] },
  { ref: "A.5.31", title: "Legal, statutory, regulatory and contractual requirements", ask: "Show requirements identified, documented and kept current.", status: "gap", note: "No register of obligations.", evidence: [ev("Legal register required")] },
  { ref: "A.5.32", title: "Intellectual property rights", ask: "Show procedures to protect intellectual property.", status: "partial", note: "The licence is declared in the published change record; third-party licence obligations are not inventoried.", evidence: [E.changeJson] },
  { ref: "A.5.33", title: "Protection of records", ask: "Show records protected from loss, destruction, falsification and unauthorised access.", status: "met", note: "Retention is enforced in code, public writes are capped so a flood cannot evict recorded evidence, and control receipts are exempt from the action-log retention window.", evidence: [E.logs, E.receipts, E.change] },
  { ref: "A.5.34", title: "Privacy and protection of PII", ask: "Show identification and implementation of privacy requirements.", status: "partial", note: "The service holds no accounts, no email and no payment data; the player identifier is a server-set pseudonym, display names are stripped of invisible and direction-reversing characters, and public output carries no player identifiers. There is no published privacy notice.", evidence: [E.logs, E.change] },
  { ref: "A.5.35", title: "Independent review of information security", ask: "Show independent review at planned intervals and after significant change.", status: "partial", note: "An independent security and accessibility review was performed and every finding closed as a recorded change. It was a single review, not a programme.", evidence: [E.change] },
  { ref: "A.5.36", title: "Compliance with policies, rules and standards", ask: "Show regular review of compliance with the organisation's own policies.", status: "gap", note: "No policies to comply with yet.", evidence: [ev("Compliance review required")] },
  { ref: "A.5.37", title: "Documented operating procedures", ask: "Show procedures documented and available to those who need them.", status: "partial", note: "Operating procedures are published as an API reference covering every route, its authorisation and its effect, plus the change processes on this page. They are not issued as controlled procedures.", evidence: [E.api, E.register] },

  { ref: "A.6.1", title: "Screening", ask: "Show background verification of candidates.", status: "excluded", note: "No personnel are engaged. Re-enters scope on the first hire.", evidence: [] },
  { ref: "A.6.2", title: "Terms and conditions of employment", ask: "Show security responsibilities in employment agreements.", status: "excluded", note: "No employment agreements exist within the scope.", evidence: [] },
  { ref: "A.6.3", title: "Security awareness, education and training", ask: "Show awareness and training appropriate to role, updated regularly.", status: "gap", note: "Applies to the operator; no training record exists.", evidence: [ev("Training record required")] },
  { ref: "A.6.4", title: "Disciplinary process", ask: "Show a formalised, communicated disciplinary process.", status: "excluded", note: "No personnel within the scope.", evidence: [] },
  { ref: "A.6.5", title: "Responsibilities after termination or change of employment", ask: "Show responsibilities that remain valid after termination, and their enforcement.", status: "excluded", note: "No personnel within the scope.", evidence: [] },
  { ref: "A.6.6", title: "Confidentiality or non-disclosure agreements", ask: "Show identified, documented, reviewed confidentiality agreements.", status: "excluded", note: "No party other than the infrastructure provider holds access, and that access is governed by the provider's own terms.", evidence: [] },
  { ref: "A.6.7", title: "Remote working", ask: "Show security measures for working outside the organisation's premises.", status: "gap", note: "All work is remote; no rule set covers the endpoint used to deploy.", evidence: [ev("Remote working rules required")] },
  { ref: "A.6.8", title: "Information security event reporting", ask: "Show a mechanism for timely reporting of observed events.", status: "met", note: "A public, documented, same-origin intake accepts white-hat reports, records each one with a receipt, raises it to operations, and deliberately changes no service state. Accepted reports are throttled to one per minute.", evidence: [E.intake, E.incidents] },

  { ref: "A.7.1", title: "Physical security perimeters", ask: "Show perimeters protecting areas holding information and processing facilities.", status: "supplier", note: "All processing runs in the provider's data centres. Inherited from the provider's own certified controls; their certificate needs to be held on file.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.2", title: "Physical entry", ask: "Show secure areas protected by entry controls.", status: "supplier", note: "Provider-operated. No premises within the scope.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.3", title: "Securing offices, rooms and facilities", ask: "Show physical security designed and implemented for facilities.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.4", title: "Physical security monitoring", ask: "Show premises continuously monitored for unauthorised access.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.5", title: "Protecting against physical and environmental threats", ask: "Show protection against natural and human physical threats.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.6", title: "Working in secure areas", ask: "Show security measures for working in secure areas.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.7", title: "Clear desk and clear screen", ask: "Show clear desk and clear screen rules defined and enforced.", status: "gap", note: "Applies to the operator endpoint that holds deployment credentials. No rule defined.", evidence: [ev("Clear screen rule required")] },
  { ref: "A.7.8", title: "Equipment siting and protection", ask: "Show equipment sited and protected securely.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.9", title: "Security of assets off-premises", ask: "Show protection of assets used away from premises.", status: "gap", note: "The operator endpoint is the only such asset and is not covered by a documented control.", evidence: [ev("Endpoint control required")] },
  { ref: "A.7.10", title: "Storage media", ask: "Show management of storage media through its life cycle.", status: "excluded", note: "No removable media are used. All data resides in the provider's managed storage and is deleted by retention rules enforced in code.", evidence: [E.logs] },
  { ref: "A.7.11", title: "Supporting utilities", ask: "Show protection from power and utility failures.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.12", title: "Cabling security", ask: "Show power and telecommunications cabling protected.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.13", title: "Equipment maintenance", ask: "Show equipment correctly maintained.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },
  { ref: "A.7.14", title: "Secure disposal or re-use of equipment", ask: "Show verified removal of data before disposal or re-use.", status: "supplier", note: "Provider-operated.", evidence: [ev("Provider certificate required")] },

  { ref: "A.8.1", title: "User endpoint devices", ask: "Show information on endpoint devices protected.", status: "gap", note: "The deployment endpoint is uncontrolled by any documented measure.", evidence: [ev("Endpoint policy required")] },
  { ref: "A.8.2", title: "Privileged access rights", ask: "Show privileged access restricted and managed.", status: "met", note: "There is exactly one privileged path. It accepts only the minted token, only over transport security, and denies outright when no token is configured — the earlier unauthenticated fallback was removed and the removal is published with its closure time.", evidence: [E.admin, E.change] },
  { ref: "A.8.3", title: "Information access restriction", ask: "Show access to information restricted per the access control policy.", status: "met", note: "Public and operator views are separated by one shared route list used by both the authentication gate and the availability gate, so the two cannot disagree.", evidence: [E.api, E.adminStatus] },
  { ref: "A.8.4", title: "Access to source code", ask: "Show read and write access to source appropriately managed.", status: "partial", note: "Source is held in a private repository and is not reachable from any public route. No documented access review exists.", evidence: [ev("Source access review required")] },
  { ref: "A.8.5", title: "Secure authentication", ask: "Show secure authentication technologies and procedures.", status: "met", note: "Token-only, transport-secured, constant-time comparison over digests, fail-closed when unconfigured, and refused outright on plaintext rather than redirected.", evidence: [E.change, E.admin] },
  { ref: "A.8.6", title: "Capacity management", ask: "Show resource use monitored and adjusted against capacity requirements.", status: "met", note: "Seat capacity per tank is enforced where the seat is claimed rather than where the connection opens, and consumption is metered per service against a stated hard limit with a projection and a redline.", evidence: [E.status, E.inquiry] },
  { ref: "A.8.7", title: "Protection against malware", ask: "Show malware protection implemented and supported by awareness.", status: "partial", note: "The attack surface is inherently narrow: no file upload, no user-supplied content beyond a sanitised display name, and a managed runtime with no interactive shell. No malware control is documented.", evidence: [E.api] },
  { ref: "A.8.8", title: "Management of technical vulnerabilities", ask: "Show vulnerability information obtained, exposure evaluated, and measures taken.", status: "partial", note: "Reported vulnerabilities have been evaluated and closed quickly, each with a published closure time. There is no scheduled scanning, dependency advisory feed or disclosure policy.", evidence: [E.change, E.intake] },
  { ref: "A.8.9", title: "Configuration management", ask: "Show configurations established, documented, implemented, monitored and reviewed.", status: "met", note: "Every binding, variable, route and limit lives in one version-controlled file that is deploy-valid as written; there is no hand-configured state at the edge to drift away from it.", evidence: [E.change, E.adminStatus] },
  { ref: "A.8.10", title: "Information deletion", ask: "Show information deleted when no longer required.", status: "met", note: "Action records are trimmed at 90 days, tank captures at 24 hours, and a retention generation change wipes the record deliberately and observably rather than by hand.", evidence: [E.logs, E.logsJson] },
  { ref: "A.8.11", title: "Data masking", ask: "Show data masking used per the access control policy and applicable requirements.", status: "met", note: "Public output is redacted at every depth for the running version identifier and the storage bucket name, and public logs carry no player identifiers. The operator view keeps the full record.", evidence: [E.logsJson, E.inquiryJson, E.adminStatus] },
  { ref: "A.8.12", title: "Data leakage prevention", ask: "Show measures preventing unauthorised disclosure and extraction.", status: "met", note: "Failures return a generic message while detail goes only to the operator log; build and storage identifiers are stripped from public output; and exported names cannot be interpreted as spreadsheet formulas.", evidence: [E.change, E.logs] },
  { ref: "A.8.13", title: "Information backup", ask: "Show backups maintained and tested against an agreed policy.", status: "gap", note: "Durable state has no backup and no restore test. The strongest available compensating property is that the receipt chain is verifiable and the action record is reproducible from it — that is not a backup.", evidence: [ev("Backup and restore test required")] },
  { ref: "A.8.14", title: "Redundancy of information processing facilities", ask: "Show facilities implemented with sufficient redundancy for availability requirements.", status: "supplier", note: "Redundancy is the provider's, and the availability it produces is measured and published from project start.", evidence: [E.status] },
  { ref: "A.8.15", title: "Logging", ask: "Show logs recording activities, exceptions, faults and events, and kept protected.", status: "met", note: "Three independent records exist: a 90-day service and action log with reason codes, a 24-hour per-tank capture, and an unexpiring control receipt chain. All three are downloadable and the first two are public.", evidence: [E.logs, E.logsJson, E.adminLog, E.receipts] },
  { ref: "A.8.16", title: "Monitoring activities", ask: "Show networks, systems and applications monitored for anomalous behaviour.", status: "met", note: "Availability, occupancy, request velocity, spend and rate-limit buckets are all observable live, and the authenticated record adds instance residency so an in-memory throttle can be proven to be firing.", evidence: [E.status, E.inquiry, E.adminStatus] },
  { ref: "A.8.17", title: "Clock synchronisation", ask: "Show clocks synchronised to approved time sources.", status: "supplier", note: "Time comes from the provider's runtime; every record is timestamped from it and ordered by sequence in the receipt chain.", evidence: [E.receipts] },
  { ref: "A.8.18", title: "Use of privileged utility programs", ask: "Show restriction and tight control of utility programs capable of overriding controls.", status: "met", note: "The runtime exposes no interactive shell and no administrative utility. The only privileged capability is the authenticated control route set, and every use of it is receipted.", evidence: [E.admin, E.receipts] },
  { ref: "A.8.19", title: "Installation of software on operational systems", ask: "Show procedures managing installation on operational systems.", status: "met", note: "The only route to production is a versioned deployment of the entire bundle. There is no in-place editing, no partial upload and no runtime package installation.", evidence: [E.adminStatus, E.change] },
  { ref: "A.8.20", title: "Networks security", ask: "Show networks and devices secured and managed to protect information.", status: "met", note: "Two listeners exist: transport-secured requests and a same-origin socket upgrade. Plaintext is refused, credentialed paths are never redirected, and socket upgrades check the origin against the request host.", evidence: [E.api, E.change] },
  { ref: "A.8.21", title: "Security of network services", ask: "Show security mechanisms and service levels for network services identified and managed.", status: "met", note: "Transport security is mandatory and stated on every response; the availability produced is measured and published rather than asserted.", evidence: [E.status, E.api] },
  { ref: "A.8.22", title: "Segregation of networks", ask: "Show groups of services and systems segregated on networks.", status: "supplier", note: "Isolation between tenants and between durable instances is the provider's; within the scope each tank is a separate durable instance with its own state.", evidence: [E.status] },
  { ref: "A.8.23", title: "Web filtering", ask: "Show access to external websites managed to reduce exposure.", status: "excluded", note: "The service performs no user-directed browsing. Outbound requests are limited to one configured same-account origin, validated for scheme and rejected if it resolves back to this origin.", evidence: [E.api] },
  { ref: "A.8.24", title: "Use of cryptography", ask: "Show rules for effective use of cryptography, including key management.", status: "partial", note: "Cryptography is used correctly where it matters: transport security everywhere, SHA-256 receipt chaining, a fresh 128-bit content-policy token per response, and constant-time credential comparison. There is no documented key management procedure for the operations credential.", evidence: [E.receipts, E.change] },
  { ref: "A.8.25", title: "Secure development life cycle", ask: "Show rules for secure development established and applied.", status: "partial", note: "The life cycle is operated and now written down as the change processes on this page. It is not issued as an approved procedure with an owner and a review date.", evidence: [E.register, E.change] },
  { ref: "A.8.26", title: "Application security requirements", ask: "Show security requirements identified, specified and approved for applications.", status: "met", note: "The application enforces a strict content policy with a per-response token and no inline allowance, a full set of transport and framing headers, and same-origin plus explicit action headers on every state-changing operation.", evidence: [E.change, E.api] },
  { ref: "A.8.27", title: "Secure system architecture and engineering principles", ask: "Show principles for engineering secure systems established and applied.", status: "met", note: "The simulation is server-authoritative, so no client claim is trusted; gates fail closed; the credentialed route list has one definition used by every gate; and the Worker imports only server-safe entry points so browser code cannot enter the server bundle.", evidence: [E.api, E.change] },
  { ref: "A.8.28", title: "Secure coding", ask: "Show secure coding principles applied to software development.", status: "partial", note: "The codebase is fully typed and type-checked before release, output is escaped through one helper, and identifiers are validated against fixed patterns rather than trusted. No coding standard is documented.", evidence: [E.change] },
  { ref: "A.8.29", title: "Security testing in development and acceptance", ask: "Show security testing processes defined and implemented in the development life cycle.", status: "partial", note: "A pre-deploy gate runs build, type-check and tree checks, and changed routes are exercised against the same runtime as production. There is no automated security test suite and no acceptance criteria document.", evidence: [E.change] },
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
  { ref: "4.1", title: "Understanding the organisation and its context", ask: "Show the context analysis, including the organisation's role as AI provider, developer or user.", status: "gap", note: "The role is unambiguous — provider and developer of the agents — but no context analysis is documented.", evidence: [ev("AI context analysis required")] },
  { ref: "4.2", title: "Understanding the needs of interested parties", ask: "Show interested parties for the AI system and their requirements.", status: "gap", note: "Players are the affected party. No analysis exists.", evidence: [ev("Interested party analysis required")] },
  { ref: "4.3", title: "Determining the scope of the AI management system", ask: "Show the documented scope of the AIMS.", status: "partial", note: "The AI scope is stated on this page and is technically observable — agent behaviour is server-side code whose every decision appears in a replayable tank log. It is not issued as a controlled scope statement.", evidence: [E.register, E.adminGame] },
  { ref: "4.4", title: "AI management system", ask: "Show the AIMS established, implemented, maintained and improved.", status: "gap", note: "No AIMS exists as a management system.", evidence: [ev("AIMS establishment required")] },
  { ref: "5.1", title: "Leadership and commitment", ask: "Show top management commitment to the AIMS.", status: "gap", note: "Not documented.", evidence: [ev("Leadership record required")] },
  { ref: "5.2", title: "AI policy", ask: "Show an established, approved AI policy appropriate to the organisation's purpose.", status: "gap", note: "No AI policy exists.", evidence: [ev("AI policy required")] },
  { ref: "5.3", title: "Roles, responsibilities and authorities", ask: "Show AI roles assigned and communicated.", status: "gap", note: "Not documented.", evidence: [ev("Role assignment required")] },
  { ref: "6.1.2", title: "AI risk assessment", ask: "Show a defined AI risk assessment process, with criteria, that produces consistent results.", status: "gap", note: "No documented AI risk assessment.", evidence: [ev("AI risk method required")] },
  { ref: "6.1.3", title: "AI risk treatment", ask: "Show the treatment process and a Statement of Applicability covering the Annex A controls.", status: "partial", note: "This register covers all 38 Annex A controls with a status and a justification. The process behind it is undocumented.", evidence: [E.register, E.manifest] },
  { ref: "6.1.4", title: "AI system impact assessment", ask: "Show a process to assess potential consequences for individuals and society, and its results.", status: "gap", note: "Not performed. The agents compete directly against human players, which is exactly the kind of consequence this clause wants assessed.", evidence: [ev("Impact assessment required")] },
  { ref: "6.2", title: "AI objectives and planning to achieve them", ask: "Show measurable AI objectives consistent with the AI policy.", status: "gap", note: "No stated objectives for agent behaviour, fairness or difficulty.", evidence: [ev("AI objectives required")] },
  { ref: "6.3", title: "Planning of changes", ask: "Show changes to the AIMS carried out in a planned manner.", status: "partial", note: "Changes to agent behaviour go through the same recorded change process as all other code, and their effect is replayable. See CM-14.", evidence: [E.register, E.change] },
  { ref: "7.1", title: "Resources", ask: "Show resources determined and provided for the AIMS.", status: "partial", note: "Compute resources for the agents are metered and published per service; no resource plan exists.", evidence: [E.inquiry] },
  { ref: "7.2", title: "Competence", ask: "Show the competence needed for people working on the AI system.", status: "gap", note: "No competence record.", evidence: [ev("Competence record required")] },
  { ref: "7.3", title: "Awareness", ask: "Show awareness of the AI policy and of individual contribution to AIMS effectiveness.", status: "gap", note: "No policy to be aware of.", evidence: [ev("Awareness record required")] },
  { ref: "7.4", title: "Communication", ask: "Show what is communicated about the AI system, to whom and when.", status: "partial", note: "The presence and count of autonomous agents is published live alongside human occupancy, so a player can always see how many opponents are not people. No communication plan is documented.", evidence: [E.status, E.admin] },
  { ref: "7.5", title: "Documented information", ask: "Show the documented information required by the standard and by the AIMS.", status: "partial", note: "Technical documentation of agent behaviour exists as deterministic, replayable logs; management documentation does not.", evidence: [E.adminGame, E.adminReplay] },
  { ref: "8.1", title: "Operational planning and control", ask: "Show the processes needed to meet AIMS requirements, planned and controlled.", status: "partial", note: "Operation is controlled and observable; the planning layer above it is absent.", evidence: [E.status, E.change] },
  { ref: "8.2", title: "AI risk assessment (performance)", ask: "Show AI risk assessments performed at planned intervals.", status: "gap", note: "Not performed.", evidence: [ev("AI risk assessment required")] },
  { ref: "8.3", title: "AI risk treatment (performance)", ask: "Show the AI risk treatment plan implemented and its results retained.", status: "gap", note: "No plan exists to implement.", evidence: [ev("AI treatment plan required")] },
  { ref: "8.4", title: "AI system impact assessment (performance)", ask: "Show impact assessments performed and their results retained.", status: "gap", note: "Not performed.", evidence: [ev("Impact assessment required")] },
  { ref: "9.1", title: "Monitoring, measurement, analysis and evaluation", ask: "Show what is monitored for the AI system and the retained results.", status: "partial", note: "Agent population, occupancy and every agent action are recorded, and any session can be replayed to a chosen tick. What is not measured is behaviour quality against a stated objective, because no objective is stated.", evidence: [E.status, E.adminGame, E.adminReplay] },
  { ref: "9.2", title: "Internal audit", ask: "Show the internal audit programme for the AIMS.", status: "gap", note: "None.", evidence: [ev("Internal audit required")] },
  { ref: "9.3", title: "Management review", ask: "Show management review of the AIMS at planned intervals.", status: "gap", note: "None held.", evidence: [ev("Management review required")] },
  { ref: "10.1", title: "Continual improvement", ask: "Show continual improvement of the AIMS.", status: "gap", note: "Improvement happens to the agents, not to a management system that does not yet exist.", evidence: [E.change] },
  { ref: "10.2", title: "Nonconformity and corrective action", ask: "Show reaction to nonconformity, cause evaluation, corrective action and retained evidence.", status: "partial", note: "Agent defects have been found, corrected and published as changes with closure times; they are not classified as AIMS nonconformities.", evidence: [E.change, E.incidents] },
];

const ISO42001_ANNEX_A: Control[] = [
  { ref: "A.2.2", title: "AI policy", ask: "Show a documented AI policy approved by management.", status: "gap", note: "Not written.", evidence: [ev("AI policy required")] },
  { ref: "A.2.3", title: "Alignment with other organisational policies", ask: "Show the AI policy aligned with other policies, including information security.", status: "gap", note: "Neither policy exists yet, so alignment cannot be shown.", evidence: [ev("Policy set required")] },
  { ref: "A.2.4", title: "Review of the AI policy", ask: "Show the AI policy reviewed at planned intervals.", status: "gap", note: "Nothing to review.", evidence: [ev("Policy review required")] },
  { ref: "A.3.2", title: "AI roles and responsibilities", ask: "Show AI roles defined and allocated.", status: "gap", note: "Undocumented; one operator holds them all.", evidence: [ev("Role definition required")] },
  { ref: "A.3.3", title: "Reporting of concerns", ask: "Show a process for reporting concerns about the AI system.", status: "partial", note: "A public, throttled, receipted intake exists and accepts any report against the service, including agent behaviour. It is not signposted as an AI-specific channel.", evidence: [E.intake] },
  { ref: "A.4.2", title: "Resource documentation", ask: "Show the resources for the AI system identified and documented.", status: "partial", note: "Compute and storage consumed by the agents are metered per bound service and published; there is no consolidated resource document.", evidence: [E.inquiry, E.inquiryJson] },
  { ref: "A.4.3", title: "Data resources", ask: "Show the data resources used by the AI system documented.", status: "met", note: "The agents consume only live tank state — positions, sizes and the ordered action stream — and no stored, purchased or personal dataset. The full input to any decision is in the tank log and can be replayed.", evidence: [E.adminGame, E.adminReplay] },
  { ref: "A.4.4", title: "Tooling resources", ask: "Show the tooling used to develop and run the AI system documented.", status: "partial", note: "The agents run inside the same Worker runtime as the rest of the service, deployed from the same version-controlled configuration; no separate tooling inventory is kept.", evidence: [E.api] },
  { ref: "A.4.5", title: "System and computing resources", ask: "Show the computing resources for the AI system documented.", status: "met", note: "Agent execution is part of the metered durable-object workload, reported per service and charted against a hard spend limit.", evidence: [E.inquiry, E.adminStatus] },
  { ref: "A.4.6", title: "Human resources", ask: "Show the human resources for the AI system, including competences.", status: "gap", note: "Not documented.", evidence: [ev("Competence record required")] },
  { ref: "A.5.2", title: "AI system impact assessment process", ask: "Show a documented process for assessing impacts on individuals and society.", status: "gap", note: "No process defined.", evidence: [ev("Impact assessment process required")] },
  { ref: "A.5.3", title: "Documentation of AI system impact assessments", ask: "Show the results of impact assessments documented and retained.", status: "gap", note: "None performed.", evidence: [ev("Impact assessment required")] },
  { ref: "A.5.4", title: "Assessing AI system impact on individuals or groups", ask: "Show assessment of consequences for individuals, including foreseeable misuse.", status: "gap", note: "The agents compete directly with people and influence a player's outcome. The consequence is low in severity but has never been assessed.", evidence: [ev("Impact assessment required")] },
  { ref: "A.5.5", title: "Assessing societal impacts of AI systems", ask: "Show assessment of broader societal consequences.", status: "gap", note: "Not assessed.", evidence: [ev("Societal assessment required")] },
  { ref: "A.6.1.2", title: "Objectives for responsible development", ask: "Show objectives for responsible development of the AI system.", status: "gap", note: "None stated.", evidence: [ev("Development objectives required")] },
  { ref: "A.6.1.3", title: "Processes for responsible design and development", ask: "Show defined processes for responsible design and development.", status: "partial", note: "Agent code follows the same recorded change and verification process as every other component, and its output is deterministic and replayable — but responsibility criteria are not stated.", evidence: [E.register, E.change] },
  { ref: "A.6.2.2", title: "AI system requirements and specification", ask: "Show requirements specified for the AI system.", status: "partial", note: "Behavioural requirements exist as published change entries — agent population per tank, seat accounting, and the rule that agents never receive capabilities withheld from players. They are not a specification document.", evidence: [E.change, E.status] },
  { ref: "A.6.2.3", title: "Documentation of AI system design and development", ask: "Show design and development documented sufficiently for review.", status: "partial", note: "The change record documents each behavioural change and its rationale; there is no design document for the agents as a whole.", evidence: [E.change] },
  { ref: "A.6.2.4", title: "AI system verification and validation", ask: "Show verification and validation performed against the requirements, with criteria and results.", status: "partial", note: "Determinism is the verification method available here: a session can be replayed exactly at any tick and compared. No acceptance criteria are stated and no validation record is kept.", evidence: [E.adminReplay, E.adminGame] },
  { ref: "A.6.2.5", title: "AI system deployment", ask: "Show a documented deployment plan and that requirements are met before release.", status: "partial", note: "Agents deploy as part of one atomic versioned release through the same gate as everything else. The plan is operated but not issued as a document. See CM-14.", evidence: [E.register, E.adminStatus] },
  { ref: "A.6.2.6", title: "AI system operation and monitoring", ask: "Show operational monitoring covering performance, errors and unexpected behaviour.", status: "met", note: "Agent occupancy is reported live per tank, every agent action is captured in the tank log, and any session can be replayed at a chosen tick to inspect exactly what an agent did and when.", evidence: [E.status, E.adminGame, E.adminReplay] },
  { ref: "A.6.2.7", title: "AI system technical documentation", ask: "Show technical documentation appropriate to the audience.", status: "partial", note: "Every route touching the agents is documented in the API reference with its parameters and effects; the agents' own decision model is not described in prose.", evidence: [E.api, E.openapi] },
  { ref: "A.6.2.8", title: "AI system recording of event logs", ask: "Show event logs recorded automatically, with enough detail to reconstruct behaviour.", status: "met", note: "Each tank writes a deterministic log of seed plus the ordered action stream, retained for the capture window, downloadable, and replayable to any tick. This is the strongest single piece of AI evidence the service holds.", evidence: [E.adminGame, E.adminReplay, E.logs] },
  { ref: "A.7.2", title: "Data for development and enhancement of the AI system", ask: "Show the data used to develop the AI system and how it is managed.", status: "met", note: "No dataset is used. Behaviour is written as deterministic rules and seeded, so there is no training corpus to govern — which is itself the answer this control needs, recorded here.", evidence: [E.register, E.adminGame] },
  { ref: "A.7.3", title: "Acquisition of data", ask: "Show how data is acquired and the provenance recorded.", status: "met", note: "The only data the agents consume is live state generated inside the service itself. Nothing is acquired from outside it.", evidence: [E.adminGame] },
  { ref: "A.7.4", title: "Quality of data for AI systems", ask: "Show data quality requirements defined and met.", status: "partial", note: "Inputs are the simulation's own state, which is authoritative by construction, so quality reduces to simulation correctness. No quality criteria are stated.", evidence: [E.adminReplay] },
  { ref: "A.7.5", title: "Data provenance", ask: "Show provenance recorded and maintained over the life cycle.", status: "met", note: "Provenance is complete and mechanical: the seed plus the ordered action stream reproduce any state exactly, so the origin of every value an agent saw is recoverable.", evidence: [E.adminGame, E.adminReplay] },
  { ref: "A.7.6", title: "Data preparation", ask: "Show data preparation methods defined and documented.", status: "excluded", note: "No dataset is prepared, cleaned or labelled, because none is used.", evidence: [E.register] },
  { ref: "A.8.2", title: "System documentation and information for users", ask: "Show documentation available to users of the AI system.", status: "partial", note: "Autonomous occupancy is shown live beside human occupancy, so the presence of agents is disclosed rather than hidden. There is no user-facing explanation of how they behave.", evidence: [E.status, E.game] },
  { ref: "A.8.3", title: "External reporting", ask: "Show a capability for interested parties to report adverse impacts.", status: "met", note: "The public intake is documented, same-origin protected, throttled, and produces a receipt and an audit record for every accepted report.", evidence: [E.intake, E.incidents] },
  { ref: "A.8.4", title: "Communication of incidents", ask: "Show a process for communicating incidents to users.", status: "met", note: "Incidents are published with cause, start, duration and resolution as they happen, and a controlled outage states the current trigger on the page a player actually lands on.", evidence: [E.incidents, E.status] },
  { ref: "A.8.5", title: "Information for interested parties", ask: "Show the information provided to interested parties about the AI system.", status: "partial", note: "Availability, occupancy, cost and this register are all public and machine-readable; an AI-specific disclosure is not.", evidence: [E.status, E.register] },
  { ref: "A.9.2", title: "Processes for responsible use of AI systems", ask: "Show defined processes for responsible use.", status: "partial", note: "Agents are confined to the tank simulation and hold no capability a player lacks. That constraint is enforced in code but not stated as a use policy.", evidence: [E.change] },
  { ref: "A.9.3", title: "Objectives for responsible use of AI systems", ask: "Show objectives for responsible use documented.", status: "gap", note: "Not stated.", evidence: [ev("Use objectives required")] },
  { ref: "A.9.4", title: "Intended use of the AI system", ask: "Show the intended use documented and the system used accordingly.", status: "partial", note: "The intended use is narrow and stated here: populate tanks with opponents so a player is never alone, with no other function and no decision affecting anyone outside the game. It is not published as a use statement to players.", evidence: [E.register, E.status] },
  { ref: "A.10.2", title: "Allocating responsibilities", ask: "Show responsibilities allocated between the organisation, its partners, suppliers, customers and third parties.", status: "gap", note: "Not documented. The agents are wholly developed and operated within this scope, which simplifies the allocation but does not remove the need to record it.", evidence: [ev("Responsibility allocation required")] },
  { ref: "A.10.3", title: "Suppliers", ask: "Show suppliers of AI services or components assessed and managed.", status: "excluded", note: "No third-party AI service, model or component is used at runtime. Agent behaviour is written and operated inside this service.", evidence: [E.register] },
  { ref: "A.10.4", title: "Customers", ask: "Show customer requirements for the AI system understood and addressed.", status: "partial", note: "Players are the only consumers and are told live how many opponents are autonomous. No requirements have been gathered from them.", evidence: [E.status] },
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
  { route: "/roadmap/", access: "public", proves: "Every production change with an identifier, a classification, a deployment grouping, its evidence and the report or incident it answers.", controls: "8.1, 8.3, A.8.32, A.5.27" },
  { route: "/roadmap.json", access: "public", proves: "The same change record as machine-readable data, including delivery velocity and post-delivery hotfixes kept separate from the delivery metrics.", controls: "8.1, A.8.32" },
  { route: "/incidents/", access: "public", proves: "Every incident with cause, start, duration and resolution, charted by cause, plus the append-only control receipt chain and its verification verdict.", controls: "A.5.24, A.5.26, A.5.28, 10.2" },
  { route: "/incidents.json", access: "public", proves: "Incident and receipt data with the integrity verdict, for independent re-verification.", controls: "A.5.28, A.5.33" },
  { route: "/status/", access: "public", proves: "Availability measured from project start rather than a rolling window, scheduled versus unscheduled downtime, live occupancy and autonomous agent counts.", controls: "9.1, A.8.6, A.8.16, 42001 A.6.2.6" },
  { route: "/status.json", access: "public", proves: "The same measurements as data, with infrastructure identifiers redacted.", controls: "9.1, A.8.11" },
  { route: "/logs/", access: "public", proves: "A 90-day reason-coded service log and 24-hour per-tank captures, searchable, filterable and downloadable.", controls: "A.8.15, A.5.33, A.8.10" },
  { route: "/logs.json", access: "public", proves: "The same records as data, with the retention windows and record counts stated.", controls: "A.8.15, A.8.10" },
  { route: "/logs/game/{tank}.txt", access: "public", proves: "A tank's capture window as a fixed-schema text export with no player identifiers.", controls: "A.8.11, A.8.15" },
  { route: "/inquiry/", access: "public", proves: "Consumption per bound service against the free-tier allowance and a hard spend limit, on a logarithmic axis with an hourly spend trend.", controls: "A.8.6, A.5.9, 7.1" },
  { route: "/docs/ and /openapi.json", access: "public", proves: "Every route, its authorisation, its required headers and its effect — the operating procedure for the service.", controls: "A.5.37, 4.3, A.8.27" },
  { route: "/api/security-report", access: "public", proves: "A same-origin white-hat intake that records a report and raises it without changing service state, throttled to one accepted report a minute.", controls: "A.6.8, A.5.25, 42001 A.8.3" },
  { route: "/audit/ and /audit/manifest.json", access: "public", proves: "This register: every clause and control of both standards with a status, a justification and its evidence.", controls: "6.1.3, 42001 6.1.3" },
  { route: "/admin/", access: "operator", proves: "The authenticated control panel: traffic control, billing thresholds, live runtime figures and the receipt chain.", controls: "A.8.2, A.5.15, A.8.18" },
  { route: "/admin/status.json", access: "operator", proves: "The unredacted operational record, including the running version identifier, the measurement window and instance residency for rate-limit verification.", controls: "A.8.16, A.8.19, A.8.9" },
  { route: "/admin/log.json and /admin/log.jsonl", access: "operator", proves: "The 90-day action record in full, including the fields withheld from public output.", controls: "A.8.15, A.8.3" },
  { route: "/admin/game/{tank}.jsonl", access: "operator", proves: "The deterministic tank log: seed plus the ordered action stream for every agent and player decision.", controls: "42001 A.6.2.8, A.7.5" },
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
    <td class="cell-code"><code>${esc(item.ref)}</code></td>
    <td class="cell-key" title="${esc(item.title)}">${esc(item.title)}</td>
    <td class="cell-code"><code>${esc(item.clause)}</code></td>
    <td>${statusPill(item.status)}</td>
    <td class="iso-note">${esc(item.note)}</td>
    <td>${evidenceList(item.evidence)}</td>
  </tr>`;
}

function controlRow(control: Control, standard: string): string {
  const key = standard.includes("42001") ? "42001" : "27001";
  return `<tr data-control-row data-standard="${key}" data-status="${control.status}" data-search="${esc((control.ref + " " + control.title + " " + control.ask + " " + control.note).toLowerCase())}">
    <td class="cell-code"><code>${esc(control.ref)}</code></td>
    <td class="cell-key" title="${esc(control.title)}">${esc(control.title)}</td>
    <td class="iso-ask">${esc(control.ask)}</td>
    <td>${statusPill(control.status)}</td>
    <td class="iso-note">${esc(control.note)}</td>
    <td>${evidenceList(control.evidence)}</td>
  </tr>`;
}

function registerHtml(register: Register): string {
  const summary = summarise(register.controls);
  return `<section class="card iso-register" id="${esc(register.id)}" data-register>
    <div class="iso-register__head"><div><div class="eyebrow">${esc(register.standard)}</div><h3>${esc(register.title)}</h3></div><span class="iso-count" data-register-count>${summary.total} controls</span></div>
    <p class="sub">${esc(register.intro)}</p>
    <div class="table-scroll" role="region" aria-label="${esc(register.title)}" tabindex="0"><table class="iso-table"><caption class="sr-only">${esc(register.title)}</caption><thead><tr><th scope="col">Ref</th><th scope="col">Control</th><th scope="col">What an assessor asks for</th><th scope="col">Status</th><th scope="col">Position</th><th scope="col">Evidence</th></tr></thead><tbody>${register.controls.map((control) => controlRow(control, register.standard)).join("")}</tbody></table></div>
    <p class="iso-empty" data-register-empty hidden>No rows in this register match the current filter.</p>
  </section>`;
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
    "if(empty)empty.hidden=visible>0;});",
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

export function conformanceHtml(metricCard: MetricCard): string {
  const overall = summarise(ALL_CONTROLS);
  const statusOptions = STATUSES.map((value) => `<option value="${value}">${esc(STATUS_LABEL[value])}</option>`).join("");
  const documents = summarise(MANDATORY_DOCUMENTS.map((item) => ({ ref: item.ref, title: item.title, ask: "", status: item.status, note: item.note, evidence: item.evidence })));
  const changes = summarise(CHANGE_PROCESSES.map((item) => ({ ref: item.id, title: item.title, ask: "", status: item.status, note: item.purpose, evidence: item.evidence })));

  return `<section class="page-intro"><div class="eyebrow">Certification readiness · the site is the evidence</div><h1>Audit</h1>
    <p class="sub">Every clause of ISO/IEC 27001:2022 and ISO/IEC 42001:2023, every one of the 93 Annex A controls and all 38 AI controls, each with what an assessor asks for, where this service stands, and the live route that proves it. Nothing here is a screenshot: an evidence link is a URL you can open now and check against the running system.</p>
    <a class="action-link" href="/audit/manifest.json">Register as JSON →</a></section>

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

  <h2 class="iso-section" id="registers">Clause and control registers</h2>
  <p class="sub">All ${overall.total} rows across both standards, filtered together. The search covers the reference, the control name, the assessor's question and this service's position on it.</p>
  <div class="card iso-toolbar-card">
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
      ${EVIDENCE_INDEX.map((route) => `<tr><td class="cell-code"><code>${esc(route.route)}</code></td><td>${route.access === "operator" ? `<span class="iso-pill is-supplier">Operator</span>` : `<span class="iso-pill is-met">Public</span>`}</td><td class="iso-note">${esc(route.proves)}</td><td class="iso-clauses">${esc(route.controls)}</td></tr>`).join("")}
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
    <p class="sub" style="margin:14px 0 0">Operational controls for the running service are at <a href="/admin/">the control panel</a>, which requires operations credentials. The public record it writes to is at <a href="/incidents/">Incidents</a>, <a href="/logs/">Logs</a> and <a href="/roadmap/">the change record</a>.</p>
  </div>
  ${filterScript()}`;
}
