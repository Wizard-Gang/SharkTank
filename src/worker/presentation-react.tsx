import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MaintenanceState } from "./env.js";
import {
  PAGE_CSS_PATH,
  adminViewerHtml,
  controlsHtml,
  evidenceDashboardHtml,
} from "./presentation.js";

const CSP_NONCE_SLOT = "__WG_CSP_NONCE__";
const HUMAN_DOCS_MODULE = "/assets/human-docs.js";
const WIZARDGANG_FAVICON = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2032%2032%22%3E%3Crect%20width%3D%2232%22%20height%3D%2232%22%20fill%3D%22%2308080b%22%2F%3E%3Crect%20x%3D%225%22%20y%3D%2215%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22%23d9ff43%22%2F%3E%3Crect%20x%3D%2215%22%20y%3D%225%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22%23a489ff%22%2F%3E%3C%2Fsvg%3E";

const PRIMARY_NAV = [
  ["/", "Overview"],
  ["/controls/", "Controls"],
  ["/evidence/", "Evidence"],
  ["/play/", "Play"],
] as const;

const ESTATE_FOOTER = [
  ["Public", [["/", "Overview"], ["/controls/", "Controls"], ["/evidence/", "Evidence"], ["/play/", "Play"]]],
  ["Machine evidence", [["/status.json", "Status JSON"], ["/incidents.json", "Incidents JSON"], ["/spend.json", "Spend JSON"], ["/logs.json", "Logs JSON"], ["/policies.json", "Policies JSON"], ["/audit/manifest.json", "Register JSON"]]],
  ["Technical", [["/docs/", "Developer API"], ["/openapi.json", "OpenAPI JSON"], ["https://github.com/Wizard-Gang/SharkTank", "GitHub source"]]],
] as const;

type AuditedRawArtifactKind = "openapi" | "controls" | "evidence" | "admin";

interface DocumentMetadata {
  title: string;
  description?: string;
  canonicalPath?: string;
}

interface OverviewPresentationInput {
  portal: { availabilityPercent: number; windowLabel: string };
  tank: unknown;
  incidents: unknown[];
  integrity: { chainStatus?: string; entryCount: number; algorithm: string };
  spendUsd: number;
  hardLimitUsd: number;
  readiness: { percent: number; met: number; partial: number; total: number };
  release: string;
  environment: string;
}

interface GeneratedMainProps {
  kind: AuditedRawArtifactKind;
  html: string;
}

/**
 * The only raw-HTML bridge in the React Worker presentation.
 *
 * These four inputs are pre-existing, first-party generators whose contracts are already
 * exercised by conformance, public-copy, accessibility, and local HTTP acceptance tests.
 * New Worker presentation must use React elements instead of adding another raw insertion
 * site or another artifact kind here.
 */
function GeneratedMain({ kind, html }: GeneratedMainProps) {
  return (
    <main
      id="main"
      tabIndex={-1}
      data-raw-artifact={kind}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="WizardGang SharkTank home">
      <span className="brand-mark" aria-hidden="true" />
      <span className="brand-copy"><strong>WIZARDGANG</strong><small>SharkTank</small></span>
    </a>
  );
}

function PrimaryNavigation() {
  return (
    <nav aria-label="Primary">
      {PRIMARY_NAV.map(([href, label]) => <a href={href} key={href}>{label}</a>)}
    </nav>
  );
}

function EstateFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <nav aria-label="All pages on this service">
          {ESTATE_FOOTER.map(([heading, links]) => (
            <div className="footer-col" key={heading}>
              <span className="footer-head">{heading}</span>
              <ul>
                {links.map(([href, label]) => <li key={href}><a href={href}>{label}</a></li>)}
              </ul>
            </div>
          ))}
        </nav>
        <p className="footer-note">
          The game is the workload. The management system around it is the case study. Every control position links to inspectable implementation or evidence.
        </p>
      </div>
    </footer>
  );
}

function DocumentHead({ title, description = "", canonicalPath = "" }: DocumentMetadata) {
  const canonical = canonicalPath ? "https://sharktank.wizardgang.ai" + canonicalPath : "";
  return (
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <meta name="theme-color" content="#0b0a14" />
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      {canonical ? <>
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://sharktank.wizardgang.ai/sharktank-art.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
      </> : null}
      <link rel="icon" href={WIZARDGANG_FAVICON} />
      <link rel="stylesheet" href={PAGE_CSS_PATH} />
    </head>
  );
}

function DocumentChrome({ metadata, main }: { metadata: DocumentMetadata; main: ReactNode }) {
  return (
    <html lang="en">
      <DocumentHead {...metadata} />
      <body>
        <a className="skip-link" href="#main">Skip to main content</a>
        <header className="site-header"><Brand /><PrimaryNavigation /></header>
        {main}
        <EstateFooter />
        <script type="module" nonce={CSP_NONCE_SLOT} src={HUMAN_DOCS_MODULE} />
      </body>
    </html>
  );
}

function renderDocument(metadata: DocumentMetadata, main: ReactNode): string {
  return "<!doctype html>" + renderToStaticMarkup(<DocumentChrome metadata={metadata} main={main} />);
}

function renderGeneratedDocument(metadata: DocumentMetadata, kind: AuditedRawArtifactKind, generatedHtml: string): string {
  return renderDocument(metadata, <GeneratedMain kind={kind} html={generatedHtml} />);
}

function ProofTile({ href, label, value, detail, tone }: { href: string; label: string; value: string; detail: string; tone: string }) {
  return (
    <a className={"trust-tile " + tone} href={href}>
      <span className="trust-tile__label">{label}</span>
      <span className="trust-tile__value">{value}</span>
      <span className="trust-tile__detail">{detail}</span>
      <span className="trust-tile__go" aria-hidden="true">→</span>
    </a>
  );
}

function SharkMark() {
  return (
    <svg viewBox="0 0 180 110" role="img" aria-label="Goofy Shark Tank mascot">
      <path d="M35 55 4 26l8 30-8 29 31-25c12 26 67 35 112 4 12-8 20-8 29-9-9-2-17-4-29-12C102 13 47 27 35 55Z" fill="#22e6ff" stroke="#070b14" strokeWidth="5" strokeLinejoin="round" />
      <path d="M76 29 91 5l19 28M76 75 90 102l14-29" fill="#0891b2" stroke="#070b14" strokeWidth="5" strokeLinejoin="round" />
      <path d="M41 48c24-15 62-22 106-5-43-8-79 1-105 19Z" fill="#fff" opacity=".18" />
      <circle cx="137" cy="40" r="13" fill="#fff" stroke="#070b14" strokeWidth="4" />
      <circle cx="142" cy="43" r="5" fill="#070b14" />
      <path d="M119 66q21 16 42-2-21 31-42 2Z" fill="#47142a" stroke="#070b14" strokeWidth="4" strokeLinejoin="round" />
      <path d="m126 69 5 10 6-8 6 8 5-11" fill="#fff" stroke="#070b14" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="158" cy="48" r="3" fill="#070b14" />
    </svg>
  );
}

function OverviewMain({ input }: { input: OverviewPresentationInput }) {
  const chainOk = input.integrity.chainStatus === "verified";
  const uptimeClaim = input.portal.availabilityPercent === 100
    ? "100% uptime maintained"
    : input.portal.availabilityPercent + "% server availability";
  return (
    <main id="main" tabIndex={-1}>
      <section className="governance-hero home-hero">
        <div className="home-hero__copy">
          <div className="eyebrow">SharkTank · governed realtime production workload</div>
          <h1>Governance you can inspect.</h1>
          <p>SharkTank is a running realtime application that demonstrates how ISO/IEC 27001, ISO/IEC 42001, reliability, accessibility, operational continuity, and spend governance become measurable production requirements.</p>
          <div className="proof-row" aria-label="Demonstrated production capabilities">
            <span>ISO 27001</span><span>ISO 42001</span><span>{uptimeClaim}</span><span>WCAG 2.0 AA</span><span>Controlled spend</span><span>Live evidence</span>
          </div>
          <div className="action-links">
            <a className="button" href="/controls/">Explore Controls →</a>
            <a className="button secondary" href="/evidence/">Inspect Evidence →</a>
            <a className="button secondary" href="/play/">Play →</a>
            <a className="button secondary" href="https://github.com/Wizard-Gang/SharkTank">GitHub →</a>
          </div>
        </div>
        <figure className="governance-art">
          <img src="/sharktank-art.jpg" width="1280" height="720" alt="SharkTank main menu showing the interactive production workload" />
          <figcaption>Live workload · the system behind the evidence</figcaption>
        </figure>
      </section>
      <section className="governance-flow" aria-label="SharkTank governance evidence model">
        <div><strong>Running system</strong><span>Realtime software with users, agents, state, change, and failure modes.</span></div><i aria-hidden="true">↓</i>
        <div><strong>Operational evidence</strong><span>Status, incidents, logs, receipts, backups, recovery, and resource use.</span></div><i aria-hidden="true">↓</i>
        <div><strong>Controls</strong><span>Technical and operational responses tied to requirements.</span></div><i aria-hidden="true">↓</i>
        <div><strong>Management system</strong><span>Scope, risk, policy, objectives, review, and continuous improvement.</span></div>
      </section>
      <section className="standard-pair" aria-label="Implemented management systems">
        <a className="standard-card" href="/controls/#iso-27001"><span>ISO/IEC 27001:2022</span><h2>Information Security Management</h2><p>Scope, risk treatment, Annex A applicability, secure development, operations, recovery, and improvement.</p><strong>Inspect implementation →</strong></a>
        <a className="standard-card" href="/controls/#iso-42001"><span>ISO/IEC 42001:2023</span><h2>AI Management System</h2><p>Purpose, intended use, impact, human authority, monitoring, transparency, change, and known limitations.</p><strong>Inspect implementation →</strong></a>
      </section>
      <section className="case-principle">
        <div><div className="eyebrow">Evidence rule</div><h2>Requirement → meaning → implementation → proof.</h2></div>
        <p>A control is not treated as evidenced merely because it is described. Each supported position resolves to a live route or operational record. Partial implementations and gaps stay visible rather than being flattened into a compliance score.</p>
      </section>
      <section aria-labelledby="live-snapshot">
        <div className="section-head"><div><div className="eyebrow">Live system snapshot</div><h2 id="live-snapshot">Current operational evidence.</h2></div><a className="action-link" href="/evidence/">Open the evidence index →</a></div>
        <div className="trust-grid">
          <ProofTile href="/evidence/#availability" label="Server availability" value={input.portal.availabilityPercent + "%"} detail={input.portal.windowLabel + " measured"} tone="tone-green" />
          <ProofTile href="/evidence/#spend" label="Metered resource cost" value={"$" + input.spendUsd.toFixed(4)} detail={"of the $" + input.hardLimitUsd.toFixed(2) + " hard stop"} tone="tone-cyan" />
          <ProofTile href="/version.json" label="Current release" value={input.release} detail={input.environment + " environment"} tone="tone-cyan" />
          <ProofTile href="/evidence/#receipts" label="Receipt chain" value={chainOk ? "Verified" : "Unverified"} detail={input.integrity.entryCount + " receipts · " + input.integrity.algorithm} tone={chainOk ? "tone-green" : "tone-red"} />
        </div>
      </section>
      <section className="workload-card">
        <div><div className="eyebrow">Running workload</div><h2>The game gives the controls something real to govern.</h2><p>Authentication, authorization, availability, application state, secure development, change control, monitoring, incidents, recovery, operational logging, resource consumption, and AI-system governance are exercised against a live realtime application.</p></div>
        <div><SharkMark /><a className="button" href="/play/">Play →</a></div>
      </section>
    </main>
  );
}

const DOWNTIME_HEADLINES = [
  "Pool's Closed.",
  "The emergency shutoff valve held.",
  "The leak is plugged.",
  "Spend stopped at the gate.",
  "This outage is doing its job.",
  "Radar caught it.",
  "Spend stopped. Access did not.",
  "Shark sighted; risk stopped.",
] as const;

const DOWNTIME_QUIPS = [
  "The sharks pitched infinite scale. For that reason, the five-dollar limit is out.",
  "A shark valued the reef at forty million dollars. Billing valued it at four dollars and eighty cents.",
  "A hammerhead started the free trial. The free trial started on the hammerhead.",
  "The reef hired a consultant to explain the invoice. The consultant is now on the invoice.",
  "A mako called the overage a rounding error. It was the budget, rounded.",
  "The sharks asked for a bigger instance. Turns out we needed a bigger budget.",
  "The sharks called it growth. Finance called it Tuesday.",
  "The reef forecast hockey-stick growth. The meter brought a ruler.",
  "A tiger shark opened a tab. The control plane closed the bar.",
  "The reef found the upgrade button. Audit found the reef.",
  "The sharks formed a procurement committee. Nine meetings later, they approved a stapler.",
  "A great white filed a jet ski under transportation. Audit filed it under no.",
  "The sharks ordered premium chum for the table. Finance approved tap water.",
] as const;

function mix(value: number): number {
  let h = value >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function gcd(a: number, b: number): number {
  while (b) { const next = a % b; a = b; b = next; }
  return a;
}

let downtimeTick: number | null = null;
function nextDowntimeTick(): number {
  if (downtimeTick === null) downtimeTick = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  downtimeTick = (downtimeTick + 1) >>> 0;
  return downtimeTick;
}

function tickPick<T>(items: readonly T[], tick: number, salt: number): T {
  const n = items.length;
  if (n < 2) return items[0];
  const t = (tick + salt) >>> 0;
  const cycle = Math.floor(t / n);
  const position = t % n;
  let step = 1 + (mix(cycle + salt) % (n - 1));
  for (let i = 0; i < n && gcd(step, n) !== 1; i += 1) step = (step % (n - 1)) + 1;
  const offset = mix(cycle * 3 + salt + 1) % n;
  return items[(position * step + offset) % n];
}

export function renderOverviewDocument(input: OverviewPresentationInput): string {
  return renderDocument(
    {
      title: "SharkTank — Governed realtime production engineering",
      description: "A running realtime production system demonstrating ISO/IEC 27001, ISO/IEC 42001, WCAG-oriented accessibility, reliability, continuity, and controlled spend through live evidence.",
      canonicalPath: "/",
    },
    <OverviewMain input={input} />,
  );
}

export function renderControlsDocument(): string {
  return renderGeneratedDocument(
    {
      title: "SharkTank — ISO 27001, ISO 42001, and production controls",
      description: "SharkTank's information-security, AI-management, accessibility, continuity, change, and operational controls with complete registers and policy records.",
      canonicalPath: "/controls/",
    },
    "controls",
    controlsHtml(),
  );
}

export function renderEvidenceDocument(...args: Parameters<typeof evidenceDashboardHtml>): string {
  return renderGeneratedDocument(
    {
      title: "SharkTank — Live production evidence",
      description: "Live availability, incidents, continuity, spend governance, controlled degradation, logs, receipts, and release identity from the running SharkTank production workload.",
      canonicalPath: "/evidence/",
    },
    "evidence",
    evidenceDashboardHtml(...args),
  );
}

export function renderAdminDocument(): string {
  return renderGeneratedDocument({ title: "Shark — Admin" }, "admin", adminViewerHtml());
}

export function renderOpenApiDocument(openApiHtml: string): string {
  return renderGeneratedDocument({ title: "Shark — API Docs" }, "openapi", openApiHtml);
}

export function renderPolicyNotFoundDocument(id: string): string {
  return renderDocument(
    { title: "SharkTank — Policy not found" },
    <main id="main" tabIndex={-1}>
      <section className="page-intro">
        <div className="eyebrow">Not found</div>
        <h1>Policy record not found.</h1>
        <p className="sub">There is no maintained control document with the identifier <code>{id}</code>. <a href="/controls/#policies">Browse the complete policy record →</a></p>
      </section>
    </main>,
  );
}

export function renderNotFoundDocument(): string {
  return renderDocument(
    {
      title: "Shark Tank — Route not found",
      description: "The requested Shark Tank route does not exist.",
    },
    <main id="main" tabIndex={-1}>
      <section>
        <p className="eyebrow">404</p>
        <h1>Route not found</h1>
        <p>This Shark Tank route does not exist.</p>
        <p><a className="button" href="/play/">Play Shark Tank</a></p>
      </section>
    </main>,
  );
}

export function renderDowntimeDocument(state: MaintenanceState): string {
  const tick = nextDowntimeTick();
  const headline = tickPick(DOWNTIME_HEADLINES, tick, 0);
  const quip = tickPick(DOWNTIME_QUIPS, tick, 7);
  const trigger = state.reason || "Safety control active";
  const page = (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Game offline — Wizard Gang</title>
        <link rel="icon" href={WIZARDGANG_FAVICON} />
        <link rel="stylesheet" href={PAGE_CSS_PATH} />
      </head>
      <body className="downtime-page">
        <main className="downtime">
          <div className="card hero-card">
            <div className="downtime-mark"><SharkMark /></div>
            <div className="eyebrow">Controlled outage · {headline}</div>
            <h1>The game is offline right now</h1>
            <p className="downtime-quip">{quip}</p>
            <div className="downtime-trigger"><span>Current trigger</span><strong>{trigger}</strong></div>
            <p><a className="action-link" href="/evidence/#availability">Check live status and incident history →</a></p>
          </div>
        </main>
      </body>
    </html>
  );
  return "<!doctype html>" + renderToStaticMarkup(page);
}
