// Governance documents — the written record ISO/IEC 27001 and 42001 ask for, published
// as routes rather than filed as documents nobody can check.
//
// The register at /audit/ links controls to live routes on the principle that the site is
// the evidence. A policy set kept as PDFs would break that principle at exactly the point
// an assessor starts reading. So these are pages, versioned by the deployment that
// published them, and the register's rows point here.
//
// Everything below has to be true of the running service. A policy asserting a control
// that does not exist is worse than a recorded gap: it fails a Stage 2 audit faster, and
// it makes every other row on the register suspect.

export interface DocSection {
  heading: string;
  /** Paragraphs. Kept as prose because an assessor reads these, not a machine. */
  body: string[];
}

export interface GovernanceDoc {
  /** Matches the documented-information reference on /audit/ where one exists. */
  ref: string;
  id: string;
  title: string;
  purpose: string;
  /** Clauses and controls this document is the record for. */
  satisfies: string[];
  sections: DocSection[];
  /** What triggers a review. Tied to mechanisms this service actually runs. */
  review: string;
}

const OPERATOR = "The service is built and run by one person, who holds every role named below.";

export const GOVERNANCE_DOCS: readonly GovernanceDoc[] = [
  {
    ref: "DOC-01",
    id: "context",
    title: "Context, scope and interested parties",
    purpose:
      "States what this service is, what it runs on, who it affects, and where the boundary of the management system sits.",
    satisfies: [
      "27001 Clause 4.1", "27001 Clause 4.2", "27001 Clause 4.3",
      "42001 Clause 4.1", "42001 Clause 4.2", "42001 Clause 4.3",
    ],
    sections: [
      {
        heading: "What the service is",
        body: [
          "Wizard Gang Shark Tank is a browser game. A player swims a shark in one of four tanks, eats to grow, and appears on a leaderboard. It is free, it requires no account, and it is offered with no availability commitment.",
          "It is a personal project, not a commercial product. There is no customer, no contract, no revenue and no service level agreement. That shapes every judgement in this policy set: controls are chosen to be honest and verifiable rather than to satisfy an obligation nobody has undertaken.",
        ],
      },
      {
        heading: "Technical scope",
        body: [
          "One Cloudflare Worker serves the game client and every route in the API reference. Two Durable Object classes hold state: one per tank for live play, and one shared instance for profiles, spend history, the service action log and the control receipt chain. One R2 bucket holds static assets.",
          "In scope: the Worker, both Durable Object classes, the R2 bucket, the routes listed in the API reference, and the source repositories that produce them.",
          "Out of scope: the operator's personal device, the browser the player uses, and the underlying Cloudflare platform. The platform is addressed as a supplier rather than as something this management system controls.",
        ],
      },
      {
        heading: "Internal and external issues",
        body: [
          "The service runs under a hard spend limit of five US dollars. When measured consumption reaches it, the service stops rather than bills. That is the dominant constraint on the design, and it is why capacity is published at the cost and capacity meters rather than treated as confidential.",
          "There is one operator. Availability, response to reports, and every review named here are bounded by one person's time. Where a clause assumes an organisation with separable roles, that is recorded as a limitation rather than papered over.",
          "The service is deliberately transparent: the change record, incident record, logs, availability measurements and this policy set are public. The design assumption is that publishing the evidence is cheaper and more credible than asserting it.",
        ],
      },
      {
        heading: "Interested parties and what they need",
        body: [
          "Players need the game to work, their display name not to be abused to impersonate someone, and the small amount of data held about them to be limited and disclosed. They need no account and give no personal details.",
          "The infrastructure provider needs the service to stay inside its acceptable use terms and its paid limits.",
          "Anyone reporting a security problem needs a route that accepts the report and a record that it was received. That intake is public and unauthenticated.",
          "No regulator, customer or contractual counterparty has expressed a requirement, because none exists. If that changes, this section changes first.",
        ],
      },
    ],
    review:
      "Reviewed when a change record entry alters the technical scope — a new binding, a new durable class, a new route class — and otherwise at least once every 90 days, the same window as the service action log.",
  },
  {
    ref: "DOC-02",
    id: "security-policy",
    title: "Information security policy",
    purpose:
      "The top-level commitment: what this service protects, what it refuses to do, and what an acceptable use of it looks like.",
    satisfies: ["27001 Clause 5.2", "27001 A.5.1", "27001 A.5.10", "27001 A.5.36"],
    sections: [
      {
        heading: "Commitment",
        body: [
          "This service protects three things, in order: the integrity of the public evidence it publishes, the availability of the game to the people playing it, and the small amount of data held about players.",
          "Confidentiality ranks last deliberately, because almost nothing here is confidential. The change record, incidents, logs, availability, spend and this policy set are all public by design. What is protected is that they are true and that they cannot be quietly altered.",
        ],
      },
      {
        heading: "What is actually held",
        body: [
          "A player profile holds a display name the player chose, a skin identifier, a best score, and a timestamp of when it was last seen. It is keyed by a random identifier generated in the player's browser and stored in a cookie. No email address, no password, no payment detail and no account exists.",
          "Display names are sanitised on the server before storage: invisible and text-direction characters are stripped, because a name is echoed into the leaderboard, the tank list, the public log and the text export, and those characters allow one player to impersonate or reorder another.",
          "The service action log is retained for 90 days. Per-tank capture logs are retained for 24 hours. Both are published with the retention window stated on the page.",
        ],
      },
      {
        heading: "What this service will not do",
        body: [
          "It will not add accounts, passwords or payment. Any change that would introduce a credential store is out of scope for this policy and would require it to be rewritten first.",
          "It will not raise the spend limit to keep the service up. If consumption reaches the limit the service stops, and the stop is recorded as an incident with a receipt.",
          "It will not publish an operational figure it cannot evidence from a live route. A number without a route behind it is removed rather than estimated.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "The game is open to anyone with no registration. Acceptable use is: play the game, read the public evidence, and report problems through the security report intake.",
          "Unacceptable use is: automating play to distort the leaderboard, attempting to exhaust the spend limit, and submitting a display name intended to impersonate another player or to break a downstream export. The name policy enforces the last of these in code rather than by request.",
          "There is no separate acceptable-use agreement to sign, because there is no account to bind one to. This section is that policy.",
        ],
      },
      {
        heading: "Compliance with this policy",
        body: [
          "Conformance is checked by the register at /audit/, which records every clause and control of both standards against what the service actually does, including the gaps.",
          "A control recorded as met must name a live route that demonstrates it. Where a control is met in the running service but the record is not yet issued, it is recorded as partial rather than met. Where nothing exists, it is recorded as a gap.",
        ],
      },
    ],
    review:
      "Reviewed whenever a control receipt records a change to a security control, and otherwise at least once every 90 days.",
  },
  {
    ref: "DOC-03",
    id: "roles",
    title: "Roles, responsibilities and authorities",
    purpose:
      "Who is accountable for what, and an honest statement of what a single operator can and cannot separate.",
    satisfies: [
      "27001 Clause 5.3", "27001 A.5.2", "27001 A.5.4",
      "42001 Clause 5.3", "42001 A.3.2", "42001 A.10.2", "42001 A.4.6",
    ],
    sections: [
      {
        heading: "The roles",
        body: [
          OPERATOR + " Naming them separately is still useful, because it makes clear which hat is being worn when a decision is taken and which evidence that decision should leave behind.",
          "Owner — decides scope, accepts risk, approves this policy set, and is the only party who can raise the spend limit or change what the service does.",
          "Operator — runs the service: deploys, responds to incidents, works the control panel, and files the receipts that record each control action.",
          "Developer — writes and reviews the code, and is responsible for the secure development practice recorded in the change management processes.",
          "Responder — receives security reports through the public intake and decides whether a report becomes an incident.",
        ],
      },
      {
        heading: "Authority to act",
        body: [
          "Taking the game down is an authenticated control action available to the Operator, and every use of it writes a receipt into the control history chain. The public security report intake can also take the game down, which is deliberate: a reporter can demonstrate impact without needing credentials.",
          "Changing what the service does requires a deployment, and every deployment is recorded in the change record with an identifier and a classification. There is no path to production that bypasses that record.",
        ],
      },
      {
        heading: "Segregation of duties, and its limits",
        body: [
          "Segregation of duties cannot be achieved with one person, and this document does not claim it. The mitigation is that actions are made evident rather than prevented: control actions write receipts into a hash chain anchored outside the table it summarises, deployments appear in the public change record, and the tank logs are deterministic and replayable.",
          "That is detection, not separation. It is recorded as a limitation of scope, and it is why the independent review and internal audit clauses remain open on the register rather than being asserted here.",
        ],
      },
      {
        heading: "Competence",
        body: [
          "Competence is not evidenced by certificates held. It is claimed on the basis of the work product itself: the change record, the incident record with causes and durations, and the register's own honesty about what is missing.",
          "This is a weaker form of evidence than the clause envisages, and the register records the competence and awareness clauses as open rather than met.",
        ],
      },
    ],
    review: "Reviewed when the number of people running the service changes, and otherwise at least once every 90 days.",
  },
  {
    ref: "DOC-04",
    id: "risk-assessment",
    title: "Risk assessment process",
    purpose:
      "How a risk to this service is identified, analysed and evaluated, and the criteria that decide whether it is acceptable.",
    satisfies: [
      "27001 Clause 6.1.1", "27001 Clause 6.1.2", "27001 Clause 8.2",
      "42001 Clause 6.1.2", "42001 Clause 8.2",
    ],
    sections: [
      {
        heading: "One method, both standards",
        body: [
          "There is one assessment method and it covers information security and the AI system together. The assets are the same assets: the computer-controlled sharks are a component of the same Worker, running on the same durable storage, under the same spend ceiling. Two methods over one object would produce two answers about it, and the second answer would be the one nobody checked.",
          "Where a risk is specific to the AI system it is marked as such in the risk treatment plan. Nothing else about the method changes.",
        ],
      },
      {
        heading: "How a risk is identified",
        body: [
          "Four standing sources, each of which is a route on this site rather than a meeting nobody minuted. First, the open rows of the conformance register: every row not marked met is a statement that something is missing, and each one is read as a candidate risk. Second, the public security report intake, which is unauthenticated and accepts a report from anyone. Third, the incident record, because something that has already happened once is the cheapest risk to identify. Fourth, the cost and capacity meters, which show consumption approaching a limit before the limit is reached.",
          "Identification also runs on demand. Any change record entry that adds a binding, adds a class of route, changes a retention window, or touches authentication triggers an identification pass for that change before it ships. The trigger is the change itself, not a calendar.",
        ],
      },
      {
        heading: "Risk owner",
        body: [
          "Every risk has one named owner. With one person running the service that owner is the Owner role in every case, and it is stated once here rather than repeated against each row.",
          "Naming it still does work: acceptance of a risk is an act by the Owner recorded in the treatment plan, not the default that follows from nobody looking. An unrecorded risk is not an accepted one.",
        ],
      },
      {
        heading: "How a risk is analysed",
        body: [
          "Two scales, each one to five, multiplied to a score between one and twenty-five. Consequence is judged against the three things the information security policy protects, in the order it puts them: the integrity of the public evidence, the availability of the game, and the small amount of data held about players.",
          "Likelihood. 1 — remote: no path is known, and one would need a platform failure of the kind the supplier publishes as its own incident. 2 — unlikely: a path exists but needs an unusual combination, such as an operator mistake or a lost credential. 3 — possible: it has nearly happened, or one existing control is all that stands in the way. 4 — likely: expected at least once inside the ninety-day review window. 5 — present: it is the standing condition of the service rather than an event that might occur.",
          "Consequence. 1 — negligible: nothing published becomes untrue and play is unaffected. 2 — minor: a session is disrupted or a published figure is briefly stale. 3 — moderate: the game is unavailable, or a display name can be abused — recoverable, and visible in the public record while it happens. 4 — major: the service is wholly unavailable including the evidence routes, or an attacker can act with the operator's authority. 5 — severe: something this service publishes as true becomes false, or the evidence that would show it is unrecoverable.",
        ],
      },
      {
        heading: "Acceptance criteria",
        body: [
          "Score fifteen and above is not acceptable and is treated before the next production deployment. Score eight to twelve is treated inside the ninety-day review window, or accepted by the Owner with the justification written into the treatment plan. Score six and below is acceptable: recorded, accepted, and looked at again at the next interval.",
          "One rule overrides the score. Any risk whose consequence is five is treated regardless of how unlikely it is. This service holds nothing of value except that what it publishes is true, so a risk that would falsify a published claim or destroy the evidence behind one is not allowed to be argued down by a low likelihood. The treatment plan shows this rule doing real work rather than sitting decoratively at the end of a method.",
        ],
      },
      {
        heading: "Repeatability and comparability",
        body: [
          "Repeatability comes from fixing the inputs, not from asserting rigour. Every run uses the same four identification sources, the same asset boundary as the scope statement, and the two scales above with their wording unchanged. The output is the risk treatment plan, published at a route, so a later run can be compared against the earlier one line by line rather than against a memory of it.",
          "The scores are published rather than held. A score that only its author can see is a score nobody can dispute, and the whole point of putting this register on the public internet is that disputing it should be possible.",
        ],
      },
      {
        heading: "When the assessment runs",
        body: [
          "At least once every ninety days, matching the retention window of the service action log so that a full assessment always has a complete log behind it, and additionally whenever an identification trigger above fires.",
          "The results of each run are the risk treatment plan at its published version. A run that changes nothing still reissues the plan, because a plan that has not been reissued and a plan nobody has looked at are indistinguishable from the outside.",
        ],
      },
    ],
    review:
      "Reviewed when the acceptance criteria are found to be producing an answer the Owner would not act on, and otherwise at least once every 90 days alongside the assessment it governs.",
  },
  {
    ref: "DOC-05",
    id: "risk-treatment",
    title: "Risk treatment process",
    purpose:
      "How a decision is taken between treating, accepting, avoiding and sharing a risk, and how the resulting plan is approved and verified.",
    satisfies: [
      "27001 Clause 6.1.3", "27001 Clause 8.3",
      "42001 Clause 6.1.3", "42001 Clause 8.3",
    ],
    sections: [
      {
        heading: "The four options, and how each is chosen here",
        body: [
          "Treat — apply or strengthen a control. This is the default where the score is fifteen or above, and it is mandatory where the consequence is five, under the overriding rule in the assessment method.",
          "Accept — the Owner records the residual risk and the reason for living with it. Available at score twelve and below. Acceptance has to be written into the treatment plan to count; inaction is not acceptance, and a risk nobody wrote down has not been accepted by anyone.",
          "Avoid — remove the feature, the route or the scope that carries the risk. Under a five dollar ceiling this is a real option rather than a rhetorical one: a control that costs more than the thing it protects is worth is a reason to delete the thing.",
          "Share — available only where the infrastructure provider already carries the risk under its own certification, and the register marks those rows as supplier for exactly that reason. Sharing is not a way to move a risk this service actually holds. A supplier marking means nothing until the supplier's certificate is held on file, and the register says so on every one of those rows.",
        ],
      },
      {
        heading: "Cost is a constraint on treatment",
        body: [
          "A control that materially raises metered consumption is itself a risk, because measured spend reaching the hard limit closes the game. Every proposed treatment is checked against the cost and capacity meters before it ships, and a treatment that would move a meter noticeably is recorded with that cost rather than adopted quietly.",
          "This is the one place where the constraint that dominates the whole design shows up as a process step instead of a background fact.",
        ],
      },
      {
        heading: "Comparison against Annex A",
        body: [
          "Once controls are chosen they are compared, control by control, against Annex A of both standards, to check that necessary controls were not omitted. The conformance register is that comparison: all ninety-three controls of ISO/IEC 27001 Annex A and all thirty-eight of ISO/IEC 42001 Annex A appear with a decision.",
          "The comparison is why exclusions carry a justification rather than a blank. A control left out without a reason is indistinguishable from a control nobody thought about, and an assessor cannot tell the difference either.",
        ],
      },
      {
        heading: "Approval and residual risk",
        body: [
          "The treatment decisions become the risk treatment plan. The Owner approves the plan and, in the same act, accepts the residual risk it names.",
          "Approval is evidenced by the deployment that publishes it. Each publication is a change entry with its own identifier in the change record, and a control action leaves a receipt in the append-only chain whose head is anchored outside the table it summarises. There is no approval step that leaves no trace, because there is no path to production that leaves no trace.",
        ],
      },
      {
        heading: "Implementation and verification",
        body: [
          "Each treatment ships as a recorded change naming the finding it closes, the fix, and the evidence it produces. That is already how every finding closed to date has been handled; this document states the rule the practice was already following.",
          "Verification is deliberately mechanical: the evidence route named on the row is fetched, and it either returns what the row claims or the row is wrong. Public routes must answer 200, operator routes 401 without a credential. A row whose evidence link is dead is treated as a finding in its own right rather than as a broken link.",
        ],
      },
      {
        heading: "What this process does not claim",
        body: [
          "Treatment happens on one person's schedule and against one person's judgement. There is no second opinion in the loop, and the process above cannot manufacture one.",
          "That limitation is why the independent review and internal audit rows on the register stay open rather than being asserted here. A treatment process that claimed independent challenge it does not have would be the first thing to fail under examination.",
        ],
      },
    ],
    review:
      "Reviewed whenever a treatment decision is taken that the four options above do not cleanly describe, and otherwise at least once every 90 days.",
  },
  {
    ref: "DOC-06",
    id: "statement-of-applicability",
    title: "Statement of Applicability",
    purpose:
      "The controlled cover for the applicability decisions: what is covered, at which version, approved by whom, and the rules by which each status was chosen.",
    satisfies: ["27001 Clause 6.1.3 d)", "42001 Clause 6.1.3"],
    sections: [
      {
        heading: "Where the controls actually are",
        body: [
          "The Statement of Applicability proper is the conformance register at /audit/. It carries all ninety-three ISO/IEC 27001:2022 Annex A controls and all thirty-eight ISO/IEC 42001:2023 Annex A controls, each with a status, a justification and the evidence for it, alongside the management system clauses of both standards.",
          "This document is the controlled cover for that register: its scope, its approval, its version, and the rules that decide a status. The rows are kept at a route rather than copied into this page on purpose. A Statement of Applicability transcribed into a document can disagree with the service it describes; one rendered from the same source the service ships cannot.",
        ],
      },
      {
        heading: "What is covered, and what is excluded",
        body: [
          "Every control of both Annexes appears. There is no control omitted for being irrelevant: irrelevance is itself a decision, and it is recorded as an exclusion with its justification.",
          "Exclusions here fall into two groups. Controls that presume employed people — screening, terms of employment, return of assets — are excluded because there are none, and each such row says so and says it re-enters scope on the first hire. Controls that presume physical premises, removable media or corporate networks are excluded or marked supplier, because the scope statement puts the operator's device, the player's browser and the underlying platform outside the boundary.",
          "The inclusion side is not a formality either. A control is included wherever the service does anything the control describes, including where what it does is inadequate — an included control with a recorded gap is more useful than a tidy exclusion.",
        ],
      },
      {
        heading: "The status vocabulary",
        body: [
          "Met — implemented, and provable from a route named on the row. This is the only status that asserts anything, and the rule behind it is strict: a row may not be marked met unless a reader can open a link on that row and see the control working.",
          "Partial — the control operates in the running service, but the record an assessor would sample has not been issued. Implemented-but-unrecorded is never met.",
          "Gap — nothing exists yet. Must be closed before certification, and named plainly rather than softened.",
          "Supplier — delivered by the infrastructure provider under its own certification, which has to be held on file for the marking to mean anything.",
          "Excluded — out of scope, with the justification that belongs in this Statement.",
          "The reason for the strictness is arithmetic rather than principle. An overstated register fails a Stage 2 audit faster than an honest one with open gaps, because a single row that cannot be evidenced makes every other row a candidate for the same fault.",
        ],
      },
      {
        heading: "Approval, version and supersession",
        body: [
          "Approved by the Owner and published by the deployment named in the change record entry that shipped this document. The version of this Statement is that deployment: the register renders from the same source the deployment ships, so the document and the running service are the same artefact seen twice and cannot drift apart between releases.",
          "This Statement is superseded by the next deployment that changes any status. There is therefore no separate revision history to maintain, and no window in which the published Statement describes a service that has already moved.",
          "The position at this version, so that a later reader can tell whether the register has moved since: 184 rows across the four sections — 102 evidenced, 42 partial, 15 gaps, 14 inherited from the supplier and 11 excluded, against 159 rows this service has to close itself. The two Annex A sections stand at 93 controls with 4 gaps and 38 controls with none. The live count is rendered at the head of the register and in its JSON, and if the two disagree the register is right and this paragraph is stale.",
        ],
      },
    ],
    review:
      "Reissued by every deployment that changes a control status, which is the only way a status can change. Reviewed in full at least once every 90 days alongside the risk assessment.",
  },
  {
    ref: "DOC-07",
    id: "risk-treatment-plan",
    title: "Risk treatment plan",
    purpose:
      "The assessment itself: the risks this service actually carries, scored under the stated method, with the decision taken on each and what remains.",
    satisfies: [
      "27001 Clause 6.1.1", "27001 Clause 6.1.3 e)", "27001 Clause 8.2", "27001 Clause 8.3",
      "42001 Clause 6.1.2", "42001 Clause 6.1.3", "42001 Clause 8.2", "42001 Clause 8.3",
    ],
    sections: [
      {
        heading: "How to read this",
        body: [
          "Each entry names the risk, gives likelihood and consequence on the one-to-five scales in the assessment process and their product, states the decision taken under the treatment process, then says what is in place and what is left over. The owner of every risk is the Owner role, stated once here rather than twelve times below.",
          "These are the risks this service has, not a generic list. Several of them are the reason particular rows on the register are still open, and one of them is the only place where the service is genuinely weaker rather than merely undocumented.",
        ],
      },
      {
        heading: "Assessed risks",
        body: [
          "R-01 — Loss of the single durable object holding the receipt chain. Likelihood 2, consequence 5, score 10, and treated regardless of the score under the overriding rule for consequence 5. One Durable Object instance holds the control receipt chain, the ninety-day service action log, the player profiles and the spend history. There is no backup and no restore path: nothing in this service exports that state anywhere, and losing the instance would destroy the evidence behind most of this register. The realistic path is an operator mistake — a class rename, a migration error — rather than a platform failure. In place: the chain is hash-linked and its head is anchored outside the table it summarises, so truncation is detectable. That is detection, not recovery, and detecting the loss of the only copy is not much comfort. Left over: everything. This is the open engineering gap on the register at A.8.13, an R2 bucket is already bound and unused for this purpose, and the continuity plan cannot honestly claim a recovery capability until an export, a restore path and a recorded restore test exist.",
          "R-02 — Metered spend reaches the hard limit and the game closes. Likelihood 3, consequence 3, score 9, accepted. Traffic is public, unauthenticated and unbounded, and the meters are the only brake. In place: consumption is measured continuously and compared against a five dollar limit held in configuration; when the measurement reaches it the service disables game traffic across every tank by itself, opens an incident, and writes a receipt recording that spend forced the downtime. The limit cannot be cleared by turning maintenance off — the reset is refused with a conflict until the limit itself is dealt with. Residual accepted: the game becomes unavailable. That is the intended outcome, because the security policy states the limit will not be raised to keep the service up, and every evidence route stays online while the game is closed.",
          "R-03 — A display name is used to impersonate another player or to break a downstream export. Likelihood 4, consequence 3, score 12, treated. Names are public, unauthenticated, retryable without limit, and echoed into the leaderboard, the tank list, the public log and a fixed-schema text export. In place: one canonical policy is applied on the server to every name crossing the wire. It strips code points that carry no visible glyph but change how surrounding text renders — the C0 and C1 controls, the soft hyphen, the bidirectional overrides and isolates, the zero-width and joiner characters, the Hangul and Mongolian fillers, the line and paragraph separators that would break the text export, the musical and interlinear format controls, and the tag characters that can smuggle hidden ASCII — then trims, clips to sixteen whole code points so an astral character cannot be cut in half, and screens against a word list. Residual accepted: the word list is Latin-only, so profanity written in another script is not screened. That consequence is offence rather than integrity, and widening the net would need a word list per script rather than a broader pattern here.",
          "R-04 — The infrastructure provider suffers an outage. Likelihood 2, consequence 4, score 8, shared and the residual accepted. An outage of the platform's compute, durable storage or object storage takes the game and every evidence route down together, including the incident record that would otherwise describe it. In place: nothing this service can build. There is no second region, no failover and no static mirror, and under a five dollar ceiling none of those is affordable. The risk is carried by the provider under its own certifications, which is what the supplier rows on the register record. Residual accepted on the stated basis that this service is offered with no availability commitment at all.",
          "R-05 — The operator credential is compromised. Likelihood 2, consequence 4, score 8, treated, residual accepted. The operations credential authorises taking the game down, changing billing thresholds, and reading the unredacted operational record. In place: authentication fails closed in every direction — no minted token denies, a non-loopback request that is not over TLS denies, anything that is not a bearer or basic credential denies — and both halves of the basic credential are compared in constant time. The credential lives as a platform secret, never in the tracked configuration, and the production deploy script refuses to run if either secret is absent. Every authenticated control action writes a receipt into the anchored chain, so misuse is evident even though it is not prevented. Residual accepted: it is one long-lived shared credential with rotation on demand and no scheduled rotation, and there is no second factor.",
          "R-06 — A dependency is compromised and reaches the Worker bundle. Likelihood 3, consequence 4, score 12, partially treated, and open. Arbitrary code inside the bundle could falsify every claim this site makes about itself, including this document. In place: the dependency surface is small and pinned by a lockfile, the build is reproducible from a clean checkout, and the Worker imports only the engine, store and protocol entry points of the game module — never its client code, so browser libraries cannot enter the server bundle at all. Left over: nothing scans dependencies for known vulnerabilities, and there is no automated build in which such a scan could run. This is recorded as the weakness it is rather than dressed as a small residual.",
          "R-07 — The register overstates what the service does. Likelihood 3, consequence 5, score 15, treated, and treated regardless under the consequence rule. The register is the service's central claim; a row that cannot be evidenced makes every other row a candidate for the same fault. In place: the honesty rule is written into the source of the register itself, met requires a live route named on the row, implemented-but-unrecorded is recorded as partial, and every evidence link is walked and fetched before a deployment that touches the register — public routes must answer 200, operator routes 401. Residual accepted: that walk is a manual step with no automated gate behind it, so it depends on being performed rather than on being enforced.",
          "R-08 — One person holds every role. Likelihood 5, consequence 3, score 15, treated as far as it can be, residual accepted. There is no separation of duties available and no independent challenge inside the loop. In place: the design substitutes evidence for separation. Control actions write receipts into a hash chain anchored outside its own table, every production change appears in the public change record with an identifier and a classification, and any tank can be reconstructed exactly at any tick from its seed and ordered action stream. Residual accepted, and named for what it is: that is detection, not separation. It is precisely why the internal audit, independent review, competence and awareness rows stay open on the register instead of being written into a document.",
          "R-09 — Public writes flood the action log and evict recorded evidence. Likelihood 3, consequence 3, score 9, treated. The action log is written through an unauthenticated route, and the log is the evidence behind several rows of this register. In place: the public route accepts only two event types; writes are limited per connection and, separately, under a global ceiling across every public caller at once, which is a real global limit because the object holding the counter is a singleton; and publicly written rows are trimmed to their own floor of fifteen hundred rows before the whole-log trim runs, so a flood can only evict other public rows and leaves the rest of the five thousand row capacity for server-recorded evidence. The security report intake accepts one report a minute. Residual accepted: a determined flood still costs metered consumption, which is R-02.",
          "R-10 — Loss of the source. Likelihood 2, consequence 3, score 6, accepted. The source exists as a working copy on the operator's machine and one hosted remote, with the game engine as a pinned submodule. Losing both would not stop the running service, which is deployed and independent of the repository, but it would end the ability to change or rebuild it. Accepted at this score, and noted as the reason the source access row on the register is partial rather than met: access is controlled by the hosting account, not by anything this service can show you.",
          "R-12 — A player cannot have their profile erased. Likelihood 3, consequence 3, score 9, partially treated, and open. There is no route by which a player can ask for their profile to be deleted, and clearing the cookie orphans the profile rather than removing it. The retention rule is also not the clean ninety days the security policy implies: a profile that never scored is deleted after ninety days unseen, but a profile holding a best score is kept indefinitely, because deleting it would silently remove entries from a leaderboard this service publishes as a record. In place: the data held is minimal and pseudonymous, no player identifier appears in any public output, display names are sanitised, and a player can change the only field they can see about themselves at any time. Left over: the erasure route itself, and a decision about what deleting a scoring profile should do to the leaderboard. Recorded in the legal register as a shortfall against an erasure right rather than argued away.",
          "R-11 — The AI system is described in a way that implies more than it is. Likelihood 3, consequence 4, score 12, treated. Specific to the AI system. Calling twenty-four rule-driven sharks an AI system invites a reader to assume a learned model, and a claim of that kind would be the easiest thing on this site to disprove. In place: the AI policy states exactly what the sharks are and what they are not — no model, no training data, no inference call, no third-party service — and the deterministic replay route lets any statement about how a shark behaves be checked against a reconstruction rather than taken on trust. Residual accepted: the wording has to be defended at every future change, which the objectives document makes an explicit target rather than a habit.",
        ],
      },
      {
        heading: "What the Owner is accepting",
        body: [
          "Accepted, in plain terms: that the game will close rather than overspend; that a total provider outage would take everything down with no failover; that one long-lived operations credential with no second factor guards the control panel; that profanity in a non-Latin script is not screened; that the register's link check is a manual step; that losing the source would end the ability to rebuild; and that one person cannot audit themselves.",
          "Not accepted, and therefore open: three of them. The absence of any backup or restore for the object that holds the receipt chain — the one entry where the honest answer is that the service is weaker than its own description of itself, and it stays open until an export, a restore path and a recorded restore test exist. The absence of any dependency scanning, which no amount of a small pinned dependency set substitutes for. And the absence of a route by which a player can have their profile erased.",
        ],
      },
      {
        heading: "Next assessment",
        body: [
          "Within ninety days, or immediately on any change that adds a binding, adds a class of route, changes a retention window or touches authentication.",
          "The next run will be comparable with this one line by line, because it will use the same identification sources, the same scales and the same acceptance bands. Where a score moves, the movement is the finding.",
        ],
      },
    ],
    review:
      "Reissued by each run of the risk assessment, and immediately whenever a treatment named here is completed or a new risk is identified between runs.",
  },
  {
    ref: "DOC-08",
    id: "objectives",
    title: "Security and AI objectives",
    purpose:
      "What this service is trying to achieve, stated so that each objective can be measured from a route rather than asserted.",
    satisfies: [
      "27001 Clause 6.2", "42001 Clause 6.2",
      "42001 A.6.1.2", "42001 A.9.3",
    ],
    sections: [
      {
        heading: "How these are set",
        body: [
          "Objectives come from the risks. Each one is consistent with the information security policy and, for the AI objectives, with the AI policy, and each is measurable from a live route on this site.",
          "That last condition is doing real work. An objective this service cannot measure from its own published evidence is one it cannot honestly report against, and would end up being evaluated by whoever wrote it deciding it had been met. Every target below names where the measurement is taken.",
        ],
      },
      {
        heading: "Security objectives",
        body: [
          "OBJ-1, evidence integrity. Target: the control receipt chain verifies on every check, meaning the published integrity verdict reads verified rather than tampered. Measured at the incident record and its JSON, which carry the verdict alongside the receipts it covers. Evaluated on every deployment and at each ninety-day review. A tampered verdict is handled as an incident, not as a defect report.",
          "OBJ-2, the record outlives the game. Target: every public evidence route stays available while game traffic is disabled. Taking the game down must never take down the record of why. Measured at the availability page, which separates scheduled from unscheduled downtime and is itself one of the routes that has to stay up. Evaluated at every downtime event, of which the spend-limit stop is the one the service can cause by itself.",
          "OBJ-3, spend stays under the ceiling. Target: measured consumption stays below the five dollar hard limit, and the limit is enforced by code that closes the game rather than by an intention to watch the meter. Measured at the cost and capacity meters and their JSON, which publish consumption per bound service against the limit. Evaluated continuously by the meter itself and reviewed at each interval.",
          "OBJ-4, the register does not overstate. Target: every evidence link on the register resolves — public routes answering 200, operator routes 401 — and no row is marked met without a live route named on that row. Measured by walking the register's own manifest and fetching each link. Evaluated before every deployment that touches the register.",
          "OBJ-5, findings are closed and the closure is published. Target: an accepted security finding is closed before the next feature deployment, and its closure time is published rather than described. Measured at the change record, where each entry states the time it took and the evidence it produced. Evaluated at each ninety-day review by reading the record back.",
        ],
      },
      {
        heading: "Objectives for responsible development of the AI system",
        body: [
          "OBJ-6, every decision stays reconstructable. Target: any tick of any tank inside its retention window can be reconstructed exactly from the tank's seed and its ordered action stream. Measured at the deterministic replay route, which returns tank state at a requested tick. Evaluated on every change to how a shark decides: a change that would make a tank unreplayable is not shipped, because replay is the only reason anything in the AI policy can be verified rather than believed.",
          "OBJ-7, no silent change in what the system is. Target: no learned model, no training data and no third-party inference is introduced into this service without the AI policy being rewritten first and the AI rows of the register reassessed in the same deployment. Measured by reading the AI policy against the register, both of which ship from the same deployment. Evaluated at every change that touches the engine.",
        ],
      },
      {
        heading: "Objectives for responsible use of the AI system",
        body: [
          "OBJ-8, the system takes no decision about a person. Target: the computer-controlled sharks read no display name, no profile and no history; their inputs remain the tank's own state — the positions of food, the distance to the arena wall, the tick, and whether a feeding frenzy is running. Measured by replay, and the measurement is unusually strong: no shark decision is recorded anywhere. The tank log holds only the actions players sent, and a replay reconstructs every shark from the seed alone. If anything about a player reached a shark's decision, replaying the seed and the player actions would not reproduce the tank — and it does. Evaluated on every change to the steering rules.",
          "OBJ-9, a computer-controlled shark is never passed off as a person. Target: agents are distinguishable from human players in every published record and every published count. Measured three ways: the availability page publishes agent counts alongside human occupancy; the tank log declares its agent count as a field of the record; and in a reconstructed tank every agent carries an identifier of the form bot-0 through bot-23 while a player carries a random session identifier. The per-tank text export contains no agent rows at all, because it records only what players sent. Evaluated at each ninety-day review and whenever the published counts change shape.",
        ],
      },
      {
        heading: "Evaluation, and what a miss means",
        body: [
          "Objectives are evaluated at each ninety-day review, and additionally at every deployment that touches the thing being measured. There is no separate reporting cycle, because each measurement is already a public route and reporting against it privately would add nothing but delay.",
          "A missed objective becomes a risk entry in the treatment plan at the next assessment. Where the miss means something published has become untrue, it is an incident first and a risk entry second — in that order, because the correction matters more than the paperwork about it.",
        ],
      },
    ],
    review:
      "Reviewed at each risk assessment, since the objectives are derived from the risks, and whenever an objective is missed.",
  },
  {
    ref: "DOC-19",
    id: "access-and-suppliers",
    title: "Access control, supplier and endpoint policy",
    purpose:
      "Who and what may reach each part of this service, what is entrusted to the one supplier it has, and the rules covering the machine it is deployed from.",
    satisfies: [
      "27001 A.5.15", "27001 A.5.19", "27001 A.5.20", "27001 A.5.22", "27001 A.5.23",
      "27001 A.6.7", "27001 A.7.7", "27001 A.7.9", "27001 A.8.1",
    ],
    sections: [
      {
        heading: "Access control policy",
        body: [
          "There are exactly two levels of access and no roles in between. Public: every evidence route, the API reference, the game itself and the report intake, all reachable with no credential by anyone, because a register nobody can read proves nothing to anybody. Operator: the control panel, the unredacted operational record, the full action log, the per-tank action stream and the replay route, all behind one credential.",
          "The boundary is enforced from a single list. Every route that is credentialed or performs a control mutation appears in one place used by every gate, so a new control route cannot be added without also being gated — the failure mode where a new endpoint is protected by having been remembered is designed out rather than watched for.",
          "Access is provable rather than asserted: the control panel answers unauthorised without a credential, and it does so on the public internet where anyone can check. The register's own link walk depends on that: operator rows must answer unauthorised, and a row that answered anything else would be a finding.",
          "Nothing reaches the durable state except through the Worker. There is no direct client connection to storage, no console into it, and no query interface. Read access to what is inside is therefore exactly what the routes expose and nothing more.",
          "Player identity is not an access level. The visitor identifier is a random value minted by the server, held in a cookie marked http-only, same-site strict and secure, and it authorises nothing: it names which profile a request is about. Holding someone else's identifier would let a person change that profile's display name, which is why the identifier is never published in any output and never accepted from a client in any form other than that cookie.",
        ],
      },
      {
        heading: "The supplier, and what is entrusted to it",
        body: [
          "There is one supplier and the dependency on it is total: compute, durable storage, object storage, the domain and its TLS termination all come from the same infrastructure provider. This is recorded as an assessed risk with the residual accepted, rather than described as a partnership.",
          "What is entrusted: all of it. Every byte this service holds — the receipt chain, the action log, the profiles, the spend history and the static assets — sits in the provider's storage, and the operations credential is held as a platform secret, which means the supplier holds the credential that guards the service against the supplier's other customers. There is no part of this system where the provider is not, in principle, able to see what it is running.",
          "That is stated plainly rather than mitigated, because the mitigations available at this scale are not real. Client-side encryption of durable state would break the receipt chain's own verification. A second provider is not affordable under a five dollar ceiling. What is done instead is to hold nothing that would matter: no password, no payment detail, no email address, no account, and no personal data beyond a chosen display name and a pseudonymous identifier.",
        ],
      },
      {
        heading: "Security requirements for the supplier, and their status",
        body: [
          "The requirements this service has of its provider are: that processing runs in physically secured facilities under an audited regime; that the platform's own storage is redundant; that TLS is terminated correctly and current; that platform secrets are not readable by other tenants; and that changes to the runtime do not silently alter behaviour.",
          "How they are met, and how far that can be verified. The first four are addressed by the provider's published certifications, which is what the supplier-marked rows on the conformance register record. Those rows carry a standing condition and it is not yet discharged: a supplier marking means nothing until a copy of the certificate is actually held. The register says so on every one of those rows and this document does not paper over it.",
          "The fifth is met by pinning: the runtime compatibility date is fixed in version-controlled configuration, so a platform change does not reach this service until the pin is deliberately moved. That is the one supplier control this service enforces itself rather than inherits.",
          "These requirements are not negotiated. This is a free personal project with no contract and no commercial relationship, and the provider's standard terms are accepted as offered. Recording that as an accepted position is honest; recording it as an agreement reached would not be, and the supplier agreement row on the register stays short of met for that reason.",
        ],
      },
      {
        heading: "Monitoring and review of the supplier",
        body: [
          "What is monitored continuously, and published: consumption per bound service against the free allowance and the hard limit, availability measured from project start, and the incident record where a provider-side outage would appear as unscheduled downtime. Provider-side failure is visible in this service's own evidence rather than taken from a status page.",
          "What is reviewed on a cycle: the runtime pin, at each ninety-day review, together with the provider's published changes since the last one. Moving the pin is a change entry like any other, classified before it is built.",
          "What has not happened yet, stated rather than implied: no such review cycle has yet completed, because this is the deployment that defines it. The supplier review row on the register is partial for that reason, and it becomes met on the first review that produces a record.",
        ],
      },
      {
        heading: "Exit from the cloud service",
        body: [
          "An exit strategy is required by the cloud services control and the honest one here is short. The game engine, the routes and the pages are portable TypeScript with no provider-specific dependency; they would move. The static assets in object storage are ordinary files and would copy. The domain would re-point.",
          "What would not move is the durable state, because it is held in a provider-specific storage class with a provider-specific consistency model. Migrating it would mean writing an export, and no export exists — which is the same missing capability recorded as the open backup risk. An exit today would therefore lose the receipt chain, the action log, the profiles and the spend history.",
          "That connection is the point of writing this section down: the backup gap is not only a resilience problem, it is also what makes this service unable to leave its provider without loss. One piece of engineering closes both, and until it exists the exit strategy is a plan to abandon the evidence rather than to carry it.",
        ],
      },
      {
        heading: "The operator endpoint and remote working",
        body: [
          "All work is remote and there are no premises. One machine is used to develop and deploy, and it is the only endpoint in existence. The scope statement places it outside the boundary of this management system, but it holds the ability to change the service, so rules are stated rather than the matter being left at an exclusion.",
          "The rules. The machine is not shared, and no other person uses the account that holds the deployment tools. The screen is locked when it is left. Credentials are never written into tracked files: the account identifier lives in an untracked environment file, the operations secrets are platform secrets and exist on the machine only for local development in a separate untracked file, and both filenames are excluded from version control so that committing them is an error rather than an oversight. Work is not done on a machine other than this one, and deployment is not performed over a network the operator does not control.",
          "What can be evidenced, and what cannot. This document can be checked against the repository for the parts that live there — the ignore rules, the absence of the account identifier from the tracked configuration, the deploy script's refusal to run without credentials supplied from outside it. The rest is the operator's attestation about a machine, and no route this service serves could demonstrate it. The endpoint rows on the conformance register are therefore recorded as partial: the rules exist, and their observance is attested rather than proved.",
          "The compensating position is that endpoint compromise is detectable rather than preventable. Every production change appears in the public change record with an identifier, every control action writes a receipt into the anchored chain, and the operations credential is a platform secret rather than a file the machine holds in a usable form for production. An attacker with the machine could do damage; they could not do it quietly.",
        ],
      },
      {
        heading: "Clear screen, and what a clear desk means here",
        body: [
          "There is no desk to clear, no paper, no printer, no removable media and no office. The clear desk half of the control has nothing to attach to and is recorded as inapplicable rather than answered with a rule nobody would follow.",
          "The clear screen half does apply, and the rule is the ordinary one: the screen is locked when the machine is left, and the control panel is not left open on an unattended display. The control panel holds no credential in its own markup and re-authorisation is a browser credential prompt, so an open tab is an exposure of what is displayed rather than of the credential itself — which is worth knowing but is not a reason to leave it open.",
        ],
      },
    ],
    review:
      "Reviewed when the number of people with access changes, when a second supplier is introduced, when the runtime pin is moved, and otherwise at least once every 90 days.",
  },
  {
    ref: "DOC-22",
    id: "legal-register",
    title: "Legal, regulatory and contractual register",
    purpose:
      "The obligations that apply to this service, where each comes from, how it is met, and the privacy notice the data protection obligations require.",
    satisfies: ["27001 A.5.5", "27001 A.5.31", "27001 A.5.32", "27001 A.5.34"],
    sections: [
      {
        heading: "How these were identified",
        body: [
          "Four sources were worked through: what the service does with personal data, the terms of the one supplier it depends on, the licences of the software it ships, and any contract or regulatory relationship it has entered. The last of those is empty, and its emptiness is itself a finding worth recording rather than a blank to be skipped.",
          "This is a determination made by the operator, not legal advice and not a lawyer's opinion. Where a determination is uncertain it is marked as uncertain below rather than resolved in the direction that makes the register look better.",
        ],
      },
      {
        heading: "Data protection",
        body: [
          "The service is offered to the public over the internet with no geographic restriction, so data protection regimes attach on their own terms rather than by anyone's choice. The United Kingdom and European Union general data protection regimes both extend to offering a service to people in those territories, and this service does so by being reachable there.",
          "The one determination not made here: which supervisory authority is the lead one depends on where the operator is established, and that is not recorded on this register. It is the single item in this document that the Owner has to state rather than the service demonstrate, and it is flagged rather than guessed.",
          "What is processed, exhaustively. A display name the player types. A skin identifier they choose. A best score. A timestamp of when the profile was last seen. A random identifier minted by the server and stored in a cookie, which is the key the other four hang from. Server-side, the connecting network address is used as a rate-limit key and is not stored in any record. Nothing else: no email address, no password, no payment detail, no account, no tracking across sites, no advertising identifier, and no profile built from behaviour.",
          "Whether that set is personal data is a real question rather than a rhetorical one. A random pseudonym plus a self-chosen display name is personal data where the display name identifies a person, which it may well, and the honest position is to treat all of it as personal data rather than to argue it away.",
          "Purpose and basis. The purpose is to let a returning player keep their name, their skin and their best score without an account, and to keep a leaderboard that means something. The basis relied on is the legitimate interest in operating the game the player asked to play; there is no consent mechanism because there is nothing collected that the player did not type in order to play.",
          "Retention, stated accurately including the part that is not a clean ninety days. A profile that has never scored is deleted after ninety days without being seen. A profile that holds a best score is kept indefinitely, because deleting it would silently remove entries from a leaderboard the service publishes as a record. The service action log is retained ninety days; per-tank capture logs twenty-four hours; control receipts have no expiry by design, since a receipt that expired would defeat the chain it belongs to.",
          "Rights, and the gap. What is honoured today: nothing about a player is published with an identifier attached, the display name is the only field a player can see about themselves and they can change it at any time, and clearing the cookie ends the association between the person and the profile. What is not honoured today: there is no route by which a player can ask for their profile to be erased, and clearing the cookie orphans a profile rather than deleting it. That is a real shortfall against an erasure right, it is recorded as an assessed risk with treatment outstanding, and it is stated here rather than left for someone to discover.",
          "Disclosure and transfer. Nothing is sold, shared or transferred to any third party. The data sits in the infrastructure provider's storage, which is a processor relationship in substance under the provider's standard terms, and the choice of storage region is not currently constrained by this service.",
        ],
      },
      {
        heading: "Supplier terms",
        body: [
          "The infrastructure provider's terms of service and acceptable use policy apply to everything this service runs. The obligations that actually bite are: staying inside the paid limits, which is enforced by the spend ceiling closing the game rather than billing; not using the platform to serve prohibited content, which a shark game does not; and accepting that the provider may change the platform, which is why the runtime compatibility date is pinned in version-controlled configuration.",
          "These terms are accepted as offered. There is no negotiated agreement and no contract in the commercial sense, because there is no commercial relationship: the service is free, has no revenue, and has no customer.",
        ],
      },
      {
        heading: "Intellectual property",
        body: [
          "This service is published under the MIT licence, and the game engine submodule under the same. The licence is declared in the change record data and in the repository.",
          "Third-party obligations, inventoried rather than assumed. Everything shipped to a browser or into the Worker bundle is MIT-licensed: the rendering library, its React renderer, React and its DOM package. The build-time tooling adds an Apache 2.0 licence and a dual MIT or Apache 2.0 licence, neither of which ships in the artefact. No copyleft licence is present anywhere in the dependency set, so there is no source-disclosure obligation beyond the one this project has already taken on voluntarily by being MIT itself.",
          "The obligation each of these carries is attribution: the licence text and copyright notice must travel with the software. That obligation is met by the licence files present in the distributed source, and it is recorded here so that adding a dependency under a different licence is recognised as a change to this register rather than as an ordinary dependency bump.",
          "Nothing in this service uses third-party assets — no purchased model, texture, font or sound — and no content is reproduced from another work.",
        ],
      },
      {
        heading: "Standards, and what they oblige",
        body: [
          "ISO/IEC 27001:2022 and ISO/IEC 42001:2023 are the criteria this register is written against. They are voluntary: no obligation to conform to either has been imposed on this service by anyone, and no certification body has assessed it.",
          "That is worth stating in a legal register precisely because the rest of this site could be misread as a claim of certification. The register describes itself as a readiness statement rather than a certificate, and this entry is the same statement made where an assessor would look for it.",
        ],
      },
      {
        heading: "What does not apply",
        body: [
          "No contract with a customer, because there is no customer. No service level agreement, because none has been offered. No sector regulation: the service is not financial, not medical, not a marketplace and not a communications provider. No payment card obligations, because no payment is taken and no card data touches the service at any point. No employment obligations, because there are no employees.",
          "No age gate is operated, and this is the second entry in this document where the honest answer is uncomfortable. The service is a free browser game with no account and no data collection beyond a typed name, which is the profile that attracts the lightest treatment under children's privacy regimes, but it makes no attempt to establish whether a player is a child. It is recorded as identified and unresolved rather than omitted.",
        ],
      },
      {
        heading: "Contact with authorities",
        body: [
          "Which authorities are relevant, and what would trigger contact. A data protection supervisory authority, in the event of a personal data breach affecting the profiles, or on receipt of a complaint routed through one. National law enforcement's cybercrime reporting route, in the event of an intrusion or an attack rather than a defect. The infrastructure provider's abuse contact, for anything originating on or through the platform.",
          "The honest status: those are the routes that would be used, and no relationship with any of them is currently maintained. Nobody has been contacted, no reporting contact has been established in advance, and the register records this control as short of met rather than treating an identified list as a maintained contact. Identifying who to call is not the same as knowing them, and the standard asks for the second.",
          "In the other direction the position is stronger: anyone — including an authority — can reach this service through the public report intake with no credential, and a report received there is recorded and receipted on arrival.",
        ],
      },
      {
        heading: "Keeping this current",
        body: [
          "Reviewed at each ninety-day cycle, and immediately on any of four triggers: a new field of personal data is collected, a dependency is added under a licence not listed above, a second supplier is introduced, or any contractual or regulatory relationship comes into existence for the first time.",
          "Two items in this document are open rather than met and are carried on the risk treatment plan rather than being quietly resolved here: the absence of an erasure route, and the absence of an established authority contact.",
        ],
      },
    ],
    review:
      "Reviewed at least once every 90 days, and immediately when personal data collection changes, a dependency licence changes, a supplier is added, or any contract or regulatory relationship begins.",
  },
  {
    ref: "DOC-24",
    id: "secure-development",
    title: "Secure development and operations",
    purpose:
      "The rules under which code is written, checked, released and run — including the two places where this service is weaker than the rules would suggest.",
    satisfies: [
      "27001 A.5.8", "27001 A.5.37", "27001 A.8.7", "27001 A.8.24",
      "27001 A.8.25", "27001 A.8.28", "27001 A.8.29", "27001 A.8.32",
    ],
    sections: [
      {
        heading: "Scope",
        body: [
          "This procedure covers everything from a change being proposed to it running in production: how code is written, what must pass before a release, how cryptography is used, how the deployment refuses to proceed, and what is monitored afterwards. It applies to the Worker, both durable classes and the game engine submodule alike, because they ship as one artefact.",
          "The change processes themselves — classification, the change record, authorisation, rollback — are set out on the conformance register and are not repeated here. This document is the security half of the same life cycle.",
        ],
      },
      {
        heading: "Secure coding rules",
        body: [
          "The whole codebase is TypeScript under strict checking, and the type check must pass with no errors before a release. This is a security rule rather than a tidiness one: most of the input-handling faults this service could have are shapes the checker rejects.",
          "Output escaping goes through one helper per module and never inline. Having a single escape function means a review question — is this interpolation escaped — has one place to look rather than several hundred.",
          "User input is validated against a fixed pattern, not sanitised into shape and trusted. The visitor identifier must match its expected form or a fresh one is minted rather than the supplied value being repaired. A reason code must be exactly one letter followed by three digits, checked in the browser and checked again on the server, and the fallback used when a code is unknown is itself validated against the same pattern. Display names go through the single name policy described in the risk treatment plan.",
          "Exports are treated as an injection surface in their own right. A field in the text log that begins with an equals, plus, minus or at sign is prefixed with an apostrophe before it is written, because a spreadsheet opening that file would otherwise treat a player-supplied name as a formula; fields containing a quote or a comma are quoted and their quotes doubled.",
          "Comparisons of secrets are constant-time. Authorisation fails closed in every branch — no configured token denies, a non-loopback request that is not over TLS denies, an unrecognised authorisation scheme denies — and there is no branch that grants by falling through.",
        ],
      },
      {
        heading: "Content security policy",
        body: [
          "Server-rendered pages are served with a policy whose script-src is a per-response nonce and nothing else: no unsafe-inline, no host allowance, no scheme allowance. Under CSP level 3 the presence of a nonce makes every unmarked inline script inert, which is the property being bought — injected markup cannot guess a nonce it has never seen.",
          "The nonce is 128 bits from the platform's cryptographic random source, minted fresh for each response. Every inline script this service emits is written with a literal placeholder in place of the nonce value, and exactly one function swaps that placeholder for the real value while setting the header. A script that was not written through that path does not get a nonce, and a placeholder must never survive into a response — both are checked before release.",
          "The policy for the client bundle is deliberately different and the difference is worth recording, because it looks like a weakening and is not. It carries both self and a nonce. Self covers the application's own modules; the nonce exists so the platform's edge rewriter, which runs downstream of this Worker and injects an analytics tag, has a nonce to copy. Without one it injects an unnonced inline script and the console fills with policy violations. This is also why no external host is named in that policy: the nonce authorises the edge's own injection without widening the policy for anybody else.",
          "Alongside it: strict transport security for a year including subdomains, no content-type sniffing, framing denied both by header and by frame-ancestors, base-uri and object-src set to none, and form-action confined to self.",
        ],
      },
      {
        heading: "Rules for the use of cryptography",
        body: [
          "There are four uses and no others. Transport: everything runs over TLS terminated by the platform, with strict transport security asserted for a year including subdomains, and the operations routes refusing plaintext outright anywhere but loopback because a basic credential is reversible base64.",
          "Integrity: each control receipt is hashed with SHA-256 over a canonical serialisation with a fixed field order and an explicit version marker, chained to its predecessor's hash, with the head anchored under a separate key written in the same operation as the row it describes. One function computes that hash and both the writer and the verifier call it — two implementations that drifted by a single field would make verification fail on honest data and look exactly like a real tamper alarm.",
          "Randomness: the content-policy nonce and the visitor identifier both come from the platform's cryptographic random source. Nothing security-relevant uses the simulation's seeded generator, and nothing in the simulation uses the cryptographic one; the two are kept apart deliberately, since the simulation's determinism depends on its generator being reproducible and that is the opposite of what a nonce needs.",
          "Comparison: credential comparison is constant-time over the raw bytes.",
          "Key management, in full. There is one long-lived secret, the operations token, held as a platform secret and never written into tracked configuration. Rotation is performed by putting a new value and redeploying; it is on demand rather than scheduled, and the risk treatment plan records that as accepted residual risk. There is no key hierarchy, no key this service generates and stores, no certificate this service manages — the platform terminates TLS — and no encryption at rest configured by this service beyond what the platform applies to its own storage. The shortness of this list is the control: there is nothing here to mismanage.",
        ],
      },
      {
        heading: "The gate before production",
        body: [
          "Four checks must pass, in order, and a failure of any of them stops the release. The client build must succeed. The type check must pass with no errors across the Worker, the engine and the client. The working tree must be free of whitespace damage, and the submodule's tree checked separately, because a check run in the parent repository says nothing about the engine.",
          "Then the service is run against the same runtime production uses — the local runtime is the same engine, not an emulation of it — and the release is exercised rather than assumed. Every route that must answer does answer, repeatedly rather than once, since a route that works on the first request and fails on the fifteenth is the failure mode that matters. Requests carry a cache-buster: a cached response has produced a false result here before and cost real time.",
          "Four contract checks run at the same time, each of which has been broken by a plausible change in the past. Every inline script carries its response nonce and no placeholder survives. The operator console answers unauthorised rather than serving. The receipt chain's published verdict reads verified. Every evidence link on the register resolves — public routes 200, operator routes 401 — because a dead evidence link is a finding in its own right rather than a broken link.",
          "One thing this gate is honest about: it is a checklist a person performs, not a pipeline that enforces it. There is no automated build, and the checks above run because they are followed rather than because a machine refuses without them.",
        ],
      },
      {
        heading: "Deployment",
        body: [
          "Production deploys through one script and there is no second path. It refuses to run at all if the account identifier is absent, and it says where the value belongs — an untracked environment file, never the tracked configuration, because an account identifier does not belong in a file under version control. It then builds, and refuses again if either operations secret is missing from the deployed environment, so a release cannot produce a running service whose control panel has no valid credential.",
          "The deployment is the whole bundle at a version. There is no in-place editing of a running service, no partial upload and no package installation at runtime. Rollback is a redeploy of an earlier version through the same script.",
          "After release the running version identifier is readable from the operator status route, which is what ties a running service back to the change entry that produced it.",
        ],
      },
      {
        heading: "Technical vulnerabilities, stated as they are",
        body: [
          "How vulnerability information arrives: through the public report intake, which is unauthenticated and open to anyone, and through the operator noticing. That is the complete list, and it is a passive one.",
          "How exposure is evaluated and acted on: a report is recorded as a retained event and a receipt on arrival; the affected code path is read; where the report is about behaviour, the tick or the route is exercised rather than reasoned about; and the fix ships as a change entry naming the finding it closes with its closure time published. Every finding accepted to date has been closed this way, and the closure times are on the public record rather than described here.",
          "What is missing, recorded rather than dressed: nothing scans the dependencies of this service for known vulnerabilities. There is no advisory feed subscribed to, no scheduled scan, and no automated build in which such a scan could run. The mitigations are real but partial — the dependency surface is small and pinned by a lockfile, the build is reproducible from a clean checkout, and the Worker imports only the engine, store and protocol entry points of the game module so browser libraries cannot enter the server bundle at all — and none of them tells anyone that a pinned dependency has had an advisory published against it. This is carried on the risk treatment plan as an open risk, and the conformance row for technical vulnerabilities stays partial because of it.",
        ],
      },
      {
        heading: "Malware, and why the surface is the control",
        body: [
          "There is no anti-malware product here, and installing one would be theatre. The control is that there is no vector for a file to arrive and no mechanism to execute one.",
          "Every route this service serves is enumerated in the API reference. None of them accepts a file, a multipart body or a form upload; there is no code path anywhere in the Worker that reads a multipart body or form data at all. The only content a member of the public can store is a display name of at most sixteen code points, passed through the name policy, and a skin identifier checked against a fixed pattern.",
          "The runtime executes only the deployed bundle. There is no interactive shell, no filesystem the service writes executables to, and no runtime package installation. Content served to a browser is constrained by a content security policy that permits no external script origin and makes unmarked inline script inert.",
          "The awareness half of this control has no meaning at one person and no endpoint in scope, and it is not claimed. The endpoint the operator works from is outside the boundary of this management system by the scope statement.",
        ],
      },
      {
        heading: "Access to the source",
        body: [
          "The source is a private repository with one hosted remote and one account holding write access, plus the operator's working copy. The engine is a pinned submodule of it.",
          "What this service can demonstrate: the source is not reachable from any route it serves, no secret is present in any served response, and the deploy path requires a credential the repository does not contain — the account identifier comes from an untracked environment file and the operations secrets are platform secrets, both deliberately absent from tracked configuration.",
          "What it cannot demonstrate, and does not claim: who holds write access to the repository, and that anyone has reviewed that list. Access there is controlled by the hosting account, which is outside the boundary of this management system, and there is no route this service could serve that would prove anything about it. The conformance row stays partial for that reason rather than being marked met on an assertion.",
        ],
      },
      {
        heading: "Security in project management",
        body: [
          "There is no separate security workstream. Every change is classified before it is built, and the classification includes the security consequence: whether it touches authentication, public input, retention or spend. That classification then decides how much of the gate above applies.",
          "The classification step also asks whether the change alters a treatment already recorded against a risk. Where it does, the risk treatment plan is reissued in the same deployment as the change, so the assessment cannot quietly fall behind the service it describes.",
        ],
      },
      {
        heading: "Where the operating procedures live",
        body: [
          "Route-level operation: the API reference documents every route this service serves, with its authorisation, its required headers and its effect, and the machine-readable version of the same. Every functionally distinct route appears there — the pages, the public writes and the operator routes alike. Writing this section is what turned up the one that did not: the unauthenticated route that records a public gameplay event was operating undocumented, and it is documented now.",
          "What deliberately does not get its own entry, so that the claim above is exact rather than approximate: trailing-slash forms of a documented path; three earlier path names that reach a documented handler unchanged, noted on the entries they reach where the service's own copy rules allow the old name to be printed; a redirect used by the interface; and the earlier operator paths kept working under the register's old prefix, which are the same handlers behind the same authentication. There are also two proxy routes to a second backend that is not configured in this deployment and that answer unavailable in consequence; they are described here rather than documented as capabilities the service does not currently have.",
          "Development and release: this document.",
          "Change control: the change processes published on the conformance register, each with its trigger, its steps and the record it produces.",
          "Incident handling: the incident record and the report intake, each of which is an operation with its own route and its own record.",
          "They are published rather than filed, so availability to whoever needs them is a property of the service being up rather than a claim about a document store.",
        ],
      },
    ],
    review:
      "Reviewed whenever the gate changes, whenever a new class of user input is accepted, and whenever the cryptography in use changes. Reviewed in any case at least once every 90 days, and immediately if a dependency scanning capability is introduced, since that is the weakness this document is currently recording.",
  },
  {
    ref: "DOC-25",
    id: "ai-policy",
    title: "AI policy and AI system impact assessment",
    purpose:
      "What the AI in this service actually is, what it is allowed to do, and an assessment of who it can affect.",
    satisfies: [
      "42001 Clause 5.2", "42001 Clause 4.4", "42001 Clause 6.1.4", "42001 Clause 8.4",
      "42001 A.2.2", "42001 A.2.3", "42001 A.2.4",
      "42001 A.5.2", "42001 A.5.3", "42001 A.5.4", "42001 A.5.5", "42001 A.9.4",
    ],
    sections: [
      {
        heading: "What the AI system is",
        body: [
          "The AI system is the set of computer-controlled sharks that populate a tank alongside human players. There are up to 24 of them per tank.",
          "It is worth being exact about what they are, because the term invites an assumption this service would not survive. They are deterministic rules, not a learned model. Each shark, on each tick, steers back toward the middle if it is past four fifths of the way to the arena wall; otherwise it turns toward the nearest food inside a fixed sight radius; otherwise it makes an occasional random turn drawn from the tank's seeded generator, offset by its own identifier so a tank of sharks does not pivot in unison. Two rules complete the set: while a feeding frenzy is running the sight radius widens and a shark with nothing in sight heads for the middle, and a shark that gets within a short distance of high-value food charges briefly and then lunges at it under a cooldown. Firing a rocket is a player-only ability that the steering rules cannot reach.",
          "There is no model, no training, no training data, no inference call and no third-party AI service anywhere in this system. Nothing about a shark's behaviour changes in response to anything a player does beyond the food and walls in front of it.",
        ],
      },
      {
        heading: "Intended use, and limits on use",
        body: [
          "The intended use is narrow and complete: populate a tank with opponents so a player is never swimming alone.",
          "The system takes no decision about any person. It does not rank, score, profile, moderate, price, recommend or gate anything. It does not read a player's display name, profile or history. Its entire input is the tank's own state: the positions of food, its distance from the arena wall, the tick, and whether a feeding frenzy is running.",
          "Any use beyond populating a tank is outside this policy and would require it to be rewritten before that use ships.",
        ],
      },
      {
        heading: "Impact assessment — individuals",
        body: [
          "Assessed impact on an individual: limited to the experience of playing a game. A shark can end a player's run by colliding with them, which is the game working as described.",
          "No personal data reaches the system. It processes tank state — positions and food — and nothing that identifies a player. There is therefore no profiling, no automated decision with legal or similarly significant effect, and no basis for discriminatory outcome between players, because the system cannot distinguish one player from another.",
          "Fairness is bounded by design rather than by monitoring: every shark runs the identical rule set, the only variation between them is a phase offset taken from the shark's own identifier so their wandering does not synchronise, and the whole tank is reproducible from its seed and action stream. Nothing in the rules varies by which player is in the tank, because nothing in the rules can see one.",
        ],
      },
      {
        heading: "Impact assessment — groups and society",
        body: [
          "Assessed societal impact: negligible, and stated as such rather than left implied. The system produces no content, makes no claim, reaches no one outside the tank, and has no downstream consumer of its outputs.",
          "The residual concerns normally raised at this point — misinformation, labour displacement, surveillance, environmental cost at scale — do not apply to twenty-four rule-driven sharks in a browser game running under a five dollar ceiling. Recording that honestly is more useful than manufacturing a risk to demonstrate diligence.",
          "The one genuine risk is misrepresentation: describing this as artificial intelligence in a way that implies a learned model. This document exists partly to prevent that.",
        ],
      },
      {
        heading: "Transparency and verification",
        body: [
          "Computer-controlled sharks are not disguised as human players in the game's own records. The per-tank capture log records only the actions players sent and declares the agent count as a field of the record, so a shark is never written down as though a person had done it; the availability page publishes the agent count beside human occupancy; and in a reconstructed tank an agent carries an identifier of the form bot-0 through bot-23 while a player carries a random session identifier.",
          "That replay is the verification mechanism for this policy. Any claim made here about how a shark behaves can be checked against a reconstruction rather than taken on trust.",
        ],
      },
    ],
    review:
      "Reviewed before any change to how computer-controlled sharks decide, and otherwise at least once every 90 days. If a learned model is ever introduced, this document is rewritten before that change ships. The life cycle document carries the technical detail behind every claim made here.",
  },
  {
    ref: "DOC-26",
    id: "ai-lifecycle",
    title: "AI system life cycle",
    purpose:
      "The technical record of the computer-controlled sharks: what they are specified to do, how they are built, how that is verified, how they are deployed and used, and what is deliberately withheld from them.",
    satisfies: [
      "42001 A.3.3", "42001 A.4.2", "42001 A.4.4",
      "42001 A.6.1.3", "42001 A.6.2.2", "42001 A.6.2.3", "42001 A.6.2.4",
      "42001 A.6.2.5", "42001 A.6.2.7",
      "42001 A.7.4", "42001 A.8.2", "42001 A.8.5", "42001 A.9.2", "42001 A.10.4",
    ],
    sections: [
      {
        heading: "Requirements and specification",
        body: [
          "A tank holds a roster of thirty-two sharks. Eight of those seats are for human players; the remaining twenty-four are filled by computer-controlled sharks, and they are respawned to keep that number up so a player is never swimming in an empty arena. That is the whole requirement the system exists to meet.",
          "The simulation runs at twenty ticks a second and the server is authoritative: the client draws what the server says, and no shark decision is taken in a browser. Each tank has a seed fixed for its lifetime, derived from the tank's own durable identifier.",
          "Steering, in the order the rules are applied on each tick. If the shark is more than four fifths of the way from the centre to the arena wall, it heads back toward the centre and stops boosting — survival first. Otherwise it turns toward the nearest food inside its sight radius, twenty-two units normally and thirty-four while a feeding frenzy is running. Otherwise, during a frenzy, it heads for the chum in the middle. Otherwise, on every twentieth tick offset by a phase taken from its own identifier, it makes a random turn drawn from the tank's seeded generator. Separately, a shark within a short distance of high-value food charges for six ticks and then lunges, under a cooldown.",
          "A feeding frenzy is a tank-wide event on a fixed cycle: every seventy-five seconds a chum drop lands in the centre and for the following twenty seconds every shark moves faster, dashes more often and sees further. It is driven by the tick counter, not by anything a player does.",
          "Retirement. A computer-controlled shark that reaches a score of two hundred and forty is killed, bursting into food, and respawns after the normal one-second delay. This is a requirement rather than a side effect: without it a long-lived agent would accumulate an unreachable score and the leaderboard would stop meaning anything.",
        ],
      },
      {
        heading: "What the system is deliberately not given",
        body: [
          "Rockets are a player-only ability. This is enforced as an explicit rule in the action handler rather than left to be an accident of the steering function, so that a future change to steering cannot quietly arm twenty-four opponents.",
          "A computer-controlled shark may take one bite per tick; a player may take two. The agents are therefore strictly less capable than the humans they play against, in both of the places where capability is bounded.",
          "The steering rules are given no access to anything about a person. No display name, no profile, no best score, no history and no cookie identifier is in scope for them. This is the constraint that makes the fairness claim in the AI policy checkable rather than aspirational.",
        ],
      },
      {
        heading: "Design and development",
        body: [
          "Determinism is the design decision everything else rests on. The tank's random number generator is a mulberry32 step seeded by an FNV-1a hash of the seed string, and its state is carried inside the serialisable snapshot rather than held beside it. There is no wall-clock read and no unseeded randomness anywhere in the simulation. Two runs of the same seed with the same actions applied at the same ticks produce the same tank.",
          "That choice has a consequence worth stating explicitly, because it is what makes the rest of this document verifiable: no shark decision is ever recorded. The tank log holds only the actions players sent. A reconstruction re-derives every agent from the seed. If anything outside the tank's own state had reached an agent's decision, replaying the seed and the player actions would not reproduce the tank.",
          "Agent code follows the same recorded change process as every other component of the service: classified before it is built, carried by a change entry with an identifier, and released through the same gate. The change record is the development history, and every entry that altered agent behaviour states what it changed and why.",
        ],
      },
      {
        heading: "Responsible design and development criteria",
        body: [
          "Four criteria are applied to any change to this system, and each is a reason to refuse a change rather than a value to aspire to.",
          "Replayability is not negotiable. A change that would make a tank unreconstructable from its seed and action stream is not shipped, whatever it improves, because replay is the only mechanism by which any claim in the AI policy can be checked instead of believed.",
          "No personal data may enter the steering rules. A change that gives an agent access to a name, a profile or a history is out of scope for the AI policy as written and requires that policy to be rewritten first.",
          "Agents may not be given a capability withheld from players. The direction is one-way: an agent may be less capable than a player, never more.",
          "No learned model may be introduced silently. Introducing a model, training data, or a third-party inference call changes what this system is, and the AI policy and the affected register rows are rewritten in the same deployment that would introduce it.",
        ],
      },
      {
        heading: "Verification and validation",
        body: [
          "The acceptance criterion is exact and there is only one: a tank reconstructed at tick N from its seed and its ordered action stream must equal the tank the service reported at tick N. Not approximately — the reconstruction is derived by re-running the identical step function over the identical generator state.",
          "The verification is performed by asking for it. The replay route rebuilds a named tank at a requested tick and returns the resulting state, so the check is a request rather than a stored test report, and anyone with the operator credential can run it now rather than reading a record of someone else having run it. That is a stronger artefact than a test log, because a test log can only tell you about the build it was written against.",
          "The route refuses rather than guessing when it cannot honour the criterion. If the earliest retained action is no longer tick zero, the tank's complete history has aged out of its twenty-four hour window and the route answers with a gone status instead of returning a reconstruction it cannot vouch for. Above one hundred thousand ticks it refuses on cost grounds. Both refusals are the criterion working.",
          "What is not done, stated plainly: there is no automated test suite in this repository and therefore no regression test asserting determinism on every build. Verification is performed on demand against a live tank, not continuously. That is a real weakness in the life cycle and it is recorded here rather than left for an assessor to discover.",
        ],
      },
      {
        heading: "Deployment",
        body: [
          "There is one deployment plan and the agents have no separate release. They are compiled into the same Worker as the rest of the service and ship as one atomic version: the engine, the routes, the pages and this document all move together or none of them do.",
          "Before release the build must compile, the type check must pass clean, and the working tree must be free of whitespace damage. The production deploy refuses to run at all unless the account identifier is supplied from the untracked environment file, and refuses again unless both operations secrets are already configured — so a deployment cannot silently produce a service whose control panel has no credential.",
          "After release the running version identifier is readable from the operator status route, which is how a deployed version is tied back to the change entry that produced it. Tank logs carry a generation marker; changing it resets the captures, so a behavioural change that would make older captures unreplayable does not leave a log that appears complete and is not.",
        ],
      },
      {
        heading: "Resources and tooling",
        body: [
          "Compute: the agents run inside the same Cloudflare Worker runtime as everything else, and each tank's simulation runs inside that tank's Durable Object. There is no separate inference service, no accelerator and no external call, and no budget line for one — consumption by the agents is part of the same metered spend published at the cost and capacity meters, under the same five dollar limit.",
          "Storage: the only AI-related storage is the tank's own action log, held in the tank's durable storage, capped at ten thousand events and twenty-four hours.",
          "Data: there is no training data, no evaluation set and no data acquisition of any kind, because there is nothing that learns. This is the whole data resource statement, and its shortness is the point.",
          "Tooling: TypeScript, a bundler for the client, and the platform's own local runtime for development, with the engine held as a pinned submodule of the deploying repository. No machine-learning framework, model runtime, vector store, annotation tool or evaluation harness is used at any stage. There is nothing in the tool chain that could introduce a model without the change being obvious in the dependency manifest.",
          "People: one person, holding every role, as recorded in the roles document.",
        ],
      },
      {
        heading: "Data quality",
        body: [
          "The inputs to this system are the tank's own simulation state — food positions, distance to the arena wall, the tick counter and whether a frenzy is running. There is no external dataset, so data quality here is not about completeness, labelling or bias in a corpus; it reduces entirely to whether the simulation is correct and reproducible.",
          "The quality criteria are therefore the determinism criterion above, plus the bounds the simulation already enforces: food is capped so that corpse drops cannot accumulate without limit, spawn length is bounded, and the arena radius is fixed per tank. A state that violates those bounds is a simulation defect, and it would show up as a replay that does not reproduce.",
          "Provenance is trivially answerable and worth answering anyway: every input is generated by this service, inside this tank, in the same request path. Nothing is acquired, purchased, scraped or received.",
        ],
      },
      {
        heading: "Use, and the limits on it",
        body: [
          "The permitted use is populating a tank with opponents. The system is confined to the simulation: it produces no text, no image, no score about a person, no recommendation and no output consumed by anything outside the tank it runs in.",
          "Three limits are enforced in code rather than requested in prose: an agent cannot fire a rocket, an agent cannot out-eat a player per tick, and an agent cannot read anything about a player. A use beyond populating a tank — moderating, ranking, matchmaking, generating anything — is outside the AI policy and requires it to be rewritten before that use ships.",
          "There is no separate operator procedure for the agents, because there is no lever to pull: they have no configuration, no runtime tuning surface and no controls in the operations panel. The only way agent behaviour changes is a deployment, which is recorded.",
        ],
      },
      {
        heading: "Reporting a concern about the agents",
        body: [
          "The security report intake is the channel for concerns about this system, and this section is the signposting that was previously missing. It is public, needs no account, accepts a report from anyone, and is throttled to one accepted report a minute.",
          "A report about agent behaviour is handled the same way as any other: it is recorded as a retained event and written into the append-only receipt chain, and it does not by itself change service state. Where a concern is about how a shark behaves, the first response is a reconstruction — the tick in question is replayed and inspected — rather than an opinion about whether the described behaviour is possible.",
          "A concern that the system is being described inaccurately is explicitly in scope for this channel. Misrepresentation is the one genuine risk the impact assessment identifies, and a reader who thinks this document overstates or understates what the sharks are is reporting exactly the thing most worth hearing.",
        ],
      },
      {
        heading: "Information for players and other interested parties",
        body: [
          "Players are the only consumers of this system, and there is no customer in any contractual sense: the game is free, needs no account, and is offered with no availability commitment. Their requirements have been determined by analysis rather than gathered by survey, and that is stated rather than dressed up.",
          "What a player needs from this system, and where each is addressed. That the tank is populated — met by respawning agents to hold the roster at thirty-two. That opponents play by the same rules — met, and more than met, since agents are strictly less capable. That they can tell what is a person and what is not — met by publishing agent counts alongside human occupancy on the availability page. That nothing about them is fed to the opponents — met by the steering rules having no access to it, and demonstrable by replay.",
          "For anyone else: the AI policy states what the system is, this document states how it is built and checked, the conformance register records both against the standard, and all of it is machine-readable. Nothing about this system is disclosed only on request.",
        ],
      },
    ],
    review:
      "Reviewed before any change to how a computer-controlled shark decides, before any change to the roster size or the capability limits, and otherwise at least once every 90 days. Rewritten in the same deployment as the AI policy if a learned model is ever introduced.",
  },
];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function governanceManifest() {
  return {
    ok: true,
    statement:
      "The written record ISO/IEC 27001 and 42001 ask for, published as routes. Each document names the clauses it is the record for; the register at /audit/ links back to it.",
    documents: GOVERNANCE_DOCS.map((doc) => ({
      ref: doc.ref,
      id: doc.id,
      title: doc.title,
      purpose: doc.purpose,
      satisfies: doc.satisfies,
      review: doc.review,
      sections: doc.sections.map((s) => ({ heading: s.heading, body: s.body })),
    })),
  };
}

function docHtml(doc: GovernanceDoc): string {
  const sections = doc.sections.map((section) => `<section class="gov-section">
      <h3>${esc(section.heading)}</h3>
      ${section.body.map((p) => `<p>${esc(p)}</p>`).join("")}
    </section>`).join("");
  return `<article class="card gov-doc" id="${esc(doc.id)}" tabindex="-1">
    <div class="gov-head">
      <div><div class="eyebrow">${esc(doc.ref)}</div><h2>${esc(doc.title)}</h2></div>
    </div>
    <p class="sub gov-purpose">${esc(doc.purpose)}</p>
    <div class="gov-satisfies"><span class="gov-satisfies-label">Record for</span><ul>${
      doc.satisfies.map((c) => `<li><code>${esc(c)}</code></li>`).join("")
    }</ul></div>
    ${sections}
    <p class="gov-review"><strong>Review.</strong> ${esc(doc.review)}</p>
  </article>`;
}

export function governanceHtml(): string {
  return `<section class="page-intro">
    <div class="eyebrow">Governance · the documents behind the register</div>
    <h1>Policies</h1>
    <p class="sub">The written record that ISO/IEC 27001:2022 and ISO/IEC 42001:2023 ask for, published as pages rather than filed as documents nobody can check. Each one names the clauses it is the record for. The <a href="/audit/">conformance register</a> links back to these, and the same content is available as <a href="/policies.json">data</a>.</p>
    <p class="sub">These describe the service as it actually runs, including where it falls short. A policy asserting a control that does not exist would make every other row on the register suspect.</p>
  </section>
  <nav class="card gov-index" aria-label="Documents">
    <h2 style="margin:0 0 10px;font-size:1.05rem">Documents</h2>
    <ul>${GOVERNANCE_DOCS.map((d) => `<li><a href="#${esc(d.id)}"><code>${esc(d.ref)}</code> ${esc(d.title)}</a></li>`).join("")}</ul>
  </nav>
  ${GOVERNANCE_DOCS.map(docHtml).join("")}`;
}
