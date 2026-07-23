// ------------------------------------------------------------------
// Domain model for the Project Discovery Portal
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

// JSAN's location footprint priority. Offices rank highest, then operating
// markets, then everywhere else.
export type PresenceTier = "Headquarters" | "Office" | "Operating" | "New Market";

export type ProjectCategory =
  | "GIS"
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
  | "Program Management";

// JSAN Consulting's service pillars. GIS and Telecom are the core business;
// every opportunity is mapped to the pillar it best fits so the BD team can
// filter for on-strategy work.
export type ServiceLine =
  | "Geospatial Intelligence"
  | "Telecom & Network Engineering"
  | "Digital Engineering"
  | "Strategic Workforce Solutions"
  | "Structured Program Management";

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
  title: string;
  description: string;
  summary: string; // AI-generated
  organization: string;
  country: string;
  state: string;
  budget: number | null; // USD
  budgetLabel: string;
  currency: string;
  deadline: string; // ISO date
  publicationDate: string; // ISO date
  source: string;
  sourceType: SourceType;
  category: ProjectCategory;
  serviceLine: ServiceLine; // JSAN pillar this opportunity maps to
  fitScore: number; // 0–100 relevance to JSAN's capabilities
  presenceTier: PresenceTier; // JSAN footprint priority for this location
  presenceLabel: string; // e.g. "UK HQ · Brentford"
  presenceRank: number; // higher = higher location priority
  projectType: ProjectType;
  status: ProjectStatus;
  technologies: string[]; // AI-extracted
  tags: string[]; // AI-generated
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
  byCountry: { label: string; value: number }[];
  byTechnology: { label: string; value: number }[];
  byBudget: { label: string; value: number }[];
  bySource: { label: string; value: number }[];
  byCategory: { label: string; value: number }[];
  byServiceLine: { label: string; value: number }[];
  byPresence: { label: string; value: number }[];
  perMonth: { label: string; value: number }[];
  highFitCount: number; // opportunities with fitScore >= 70
  inFootprintCount: number; // opportunities in a JSAN office or operating market
}

export interface ProjectQuery {
  q?: string;
  country?: string;
  state?: string;
  category?: string;
  serviceLine?: string;
  presenceTier?: string;
  technology?: string;
  projectType?: string;
  status?: string;
  organization?: string;
  source?: string;
  minBudget?: number;
  maxBudget?: number;
  page?: number;
  pageSize?: number;
  sort?: "priority" | "deadline" | "budget" | "publicationDate" | "fitScore";
}
