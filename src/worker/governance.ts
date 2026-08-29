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
          "It is worth being exact about what they are, because the term invites an assumption this service would not survive. They are deterministic rules, not a learned model. Each shark, on each tick, steers away from the arena wall if it is close to it; otherwise it turns toward the nearest food within a fixed sight radius; otherwise it makes an occasional random turn drawn from the tank's seeded generator.",
          "There is no model, no training, no training data, no inference call and no third-party AI service anywhere in this system. Nothing about a shark's behaviour changes in response to anything a player does beyond the food and walls in front of it.",
        ],
      },
      {
        heading: "Intended use, and limits on use",
        body: [
          "The intended use is narrow and complete: populate a tank with opponents so a player is never swimming alone.",
          "The system takes no decision about any person. It does not rank, score, profile, moderate, price, recommend or gate anything. It does not read a player's display name, profile or history. Its entire input is the position of food and walls in the tank it is in.",
          "Any use beyond populating a tank is outside this policy and would require it to be rewritten before that use ships.",
        ],
      },
      {
        heading: "Impact assessment — individuals",
        body: [
          "Assessed impact on an individual: limited to the experience of playing a game. A shark can end a player's run by colliding with them, which is the game working as described.",
          "No personal data reaches the system. It processes tank state — positions and food — and nothing that identifies a player. There is therefore no profiling, no automated decision with legal or similarly significant effect, and no basis for discriminatory outcome between players, because the system cannot distinguish one player from another.",
          "Fairness is bounded by design rather than by monitoring: every shark runs the identical rule set with no per-player variation, and the whole tank is reproducible from its seed and action stream.",
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
          "Computer-controlled sharks are not disguised as human players in the game's own records: the per-tank capture log distinguishes them, and the deterministic replay route reconstructs exact tank state at any tick from the seed and the ordered action stream.",
          "That replay is the verification mechanism for this policy. Any claim made here about how a shark behaves can be checked against a reconstruction rather than taken on trust.",
        ],
      },
    ],
    review:
      "Reviewed before any change to how computer-controlled sharks decide, and otherwise at least once every 90 days. If a learned model is ever introduced, this document is rewritten before that change ships.",
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
