// ------------------------------------------------------------------
// Domain model for the JSAN_NexusAI_Enterprise_Growth_Platform
// Mirrors the relational schema (see db/schema.sql) — the repository
// layer can be swapped from in-memory to PostgreSQL without touching
// the API or UI, following the Repository pattern.
// ------------------------------------------------------------------

export type ProjectType =
  | "RFP"
  | "RFQ"
  | "Government Tender"
  | "IT Procurement"
  | "Startup Announcement"
  | "Digital Transformation"
  | "Open Opportunity";

export type ProjectStatus = "Open" | "Closing Soon" | "Closed" | "Awarded";

export type ProjectCategory =
  | "GIS"
  | "Utility Network GIS"
  | "Geospatial / Telecom Adjacent"
  // The three autonomous-mobility pillars, one per column of slide 2 of the
  // capability deck. See lib/ingest/autonomy.ts for what earns each of them.
  | "Autonomous Vehicle Data"
  | "Perception & Road Intelligence"
  | "Validation & QA Operations"
  | "AI/ML"
  | "Cloud Migration"
  | "Web Development"
  | "Mobile Development"
  | "Data Engineering"
  | "Enterprise Software"
  | "Cyber Security"
  | "DevOps"
  | "Telecom / Network"
  | "Workforce Solutions"
  | "Program Management"
  // Nothing in the notice matched any focus-area rule. Deliberately NOT a
  // target category: it is the bucket that keeps agriculture, health and
  // construction tenders out of the portal now that the catch-all no longer
  // falls through into Digital Engineering.
  | "Unclassified";

// JSAN Consulting's service pillars. GIS and Telecom are the core business;
// every opportunity is mapped to the pillar it best fits so the BD team can
// filter for on-strategy work.
//
// "Geospatial & Telecom Adjacent" is the third line the portal carries: work in
// the same field that isn't a pure GIS or telecom contract — earth observation,
// digital twins, IoT/sensor networks, SCADA, national digital-infrastructure
// programmes. It is kept as its own line, rather than folded into the two core
// ones, so capability-fit scores stay meaningful.
//
// "Utility Network Intelligence" is the connected operating model JSAN delivers
// to electrical, water and gas distribution utilities — field survey, asset
// digitization, consumer indexing, topology validation and enterprise GIS
// migration. It is its own line rather than a flavour of Geospatial
// Intelligence because the buyer, the deliverable and the competition are all
// different: the customer is a distribution utility, and the product is a
// connected network model of its assets and consumers, not a map.
//
// The three autonomous-mobility lines are the capability architecture on slide
// 2 of JSAN_Autonomous_Mobility_Services.pptx, carried across as its own three
// lines rather than folded into Geospatial Intelligence. The deck sells them as
// three columns with their own sub-capabilities and their own buyer — an
// autonomous-driving programme, not a mapping agency — and collapsing them
// would make a capability-fit score for an annotation-operations contract read
// as if it were a survey. See lib/ingest/autonomy.ts.
export type ServiceLine =
  | "Geospatial Intelligence"
  | "Telecom & Network Engineering"
  | "Utility Network Intelligence"
  | "Geospatial & Telecom Adjacent"
  | "Autonomous Data Engineering"
  | "Geospatial & Perception Intelligence"
  | "Validation & Managed Operations"
  | "Digital Engineering"
  | "Strategic Workforce Solutions"
  | "Structured Program Management"
  /** Retained but never surfaced — see "Unclassified" above. */
  | "Out of Scope";

export type SourceType =
  | "Government Procurement API"
  | "Public Tender API"
  | "RSS Feed"
  | "Open Data Portal"
  | "JSON Endpoint"
  | "XML Feed";

export type AuthType = "None" | "API Key" | "OAuth" | "Bearer Token";

export interface Project {
  id: string;
  referenceNumber: string;
  /** Display title — the English translation when one exists, else the original. */
  title: string;
  /** The notice's title exactly as published. Kept for provenance and shown on
   *  the details page: these are official notices and must stay citable. */
  originalTitle: string;
  description: string;
  summary: string; // the notice's own wording, trimmed at ingest
  organization: string;
  country: string;
  state: string;
  budget: number | null; // USD
  /** Did the buyer actually publish a contract value?
   *
   *  `budget` cannot answer this on its own. A notice that discloses nothing is
   *  stored with the UNDISCLOSED_BUDGET_USD stand-in so every record carries a
   *  number the UI can format — and that stand-in is the primary line itself,
   *  so an undisclosed notice is indistinguishable from a genuine $15M contract
   *  by value alone. Two thirds of the board discloses nothing, so without this
   *  flag the great majority of rows read as confirmed primary work.
   *
   *  Anything that reports money to a reader — a figure on a card, a ranking
   *  that claims to lead with contract value — must consult this first. */
  budgetDisclosed: boolean;
  budgetLabel: string;
  currency: string;
  deadline: string; // ISO date
  publicationDate: string; // ISO date
  /** ISO timestamp this notice was FIRST persisted — i.e. when it became new to
   *  the portal, which is not the same as when the buyer published it. Set from
   *  `opportunities.ingested_at`, which the upsert deliberately leaves alone on
   *  conflict. Absent on the bundled seed, which was never ingested. */
  ingestedAt?: string;
  source: string;
  sourceType: SourceType;
  category: ProjectCategory;
  serviceLine: ServiceLine; // JSAN pillar this opportunity maps to
  fitScore: number; // 0–100, rule-based (see lib/scoring.ts)
  projectType: ProjectType;
  status: ProjectStatus;
  technologies: string[]; // matched from the notice text by keyword rules
  tags: string[]; // derived from category, country and the rule-based score
  eligibility: string;
  officialLink: string;
  contact: {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  industry: string;
}

export interface APIConnector {
  id: string;
  name: string;
  sourceType: SourceType;
  baseUrl: string;
  authType: AuthType;
  enabled: boolean;
  schedule: "Every 15 minutes" | "Hourly" | "Daily";
  rateLimitPerMin: number;
  pagination: "Offset" | "Cursor" | "Page" | "None";
  retryPolicy: string;
  lastRun: string;
  nextRun: string;
  status: "Healthy" | "Degraded" | "Error" | "Idle";
  projectsCollected: number;
  country: string;
}

export interface ConnectorLog {
  id: string;
  connectorId: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  itemsFetched: number;
  durationMs: number;
}

export interface DashboardStats {
  totalProjects: number;
  newToday: number;
  closingSoon: number;
  totalBudget: number;
  // Disclosed value carried by the primary band — see the contract value
  // policy in lib/domain.ts.
  primaryPipeline: number;
  primaryCount: number;
  byCountry: { label: string; value: number }[];
  byTechnology: { label: string; value: number }[];
  byBudget: { label: string; value: number }[];
  bySource: { label: string; value: number }[];
  byCategory: { label: string; value: number }[];
  byServiceLine: { label: string; value: number }[];
  // Real monthly counts from publication dates — rolling window ending at the
  // current month (see perMonthTrend in lib/repository).
  perMonth: { label: string; value: number }[];
  highFitCount: number; // opportunities at or above HIGH_FIT_THRESHOLD
  countryCount: number; // distinct countries represented — the portal is worldwide
  organizationCount: number; // distinct publishing buyers
  byOrganization: { label: string; value: number }[];
  // High-fit count per month, on the same rolling window as perMonth, so the
  // two trend lines can be read against each other.
  highFitPerMonth: { label: string; value: number }[];
}

export interface ProjectQuery {
  q?: string;
  country?: string;
  state?: string;
  category?: string;
  serviceLine?: string;
  technology?: string;
  projectType?: string;
  status?: string;
  organization?: string;
  source?: string;
  minBudget?: number;
  maxBudget?: number;
  minFit?: number;
  /** Only opportunities whose deadline falls within this many days from today.
   *  Records with no parseable deadline are excluded when this is set. */
  maxDeadlineDays?: number;
  /** Publication-date window, inclusive, as ISO `YYYY-MM-DD`. Either bound may
   *  be given on its own. A record with no parseable publication date is
   *  excluded when either bound is set — the filter cannot vouch for it. */
  publishedFrom?: string;
  publishedTo?: string;
  // When true, hide opportunities that are no longer pursuable (Awarded/Closed).
  availableOnly?: boolean;
  /** When true, keep only notices whose buyer actually published a contract
   *  value. Pair it with `minBudget` to ask for confirmed money: `minBudget`
   *  alone matches the undisclosed stand-in too, which sits exactly on the
   *  primary line. See `Project.budgetDisclosed`. */
  disclosedBudgetOnly?: boolean;
  page?: number;
  pageSize?: number;
  // Ranking is capability- and time-based only. There is deliberately no
  // location-preference sort: where JSAN happens to have an office is not a
  // property of the opportunity, and ranking by it buried every other country
  // on the back pages. Filter by country instead — every country in the data is
  // available in the Country filter.
  sort?: "fitScore" | "deadline" | "budget" | "publicationDate";
}
