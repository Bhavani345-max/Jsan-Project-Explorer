-- =====================================================================
--  Sample data — run AFTER schema.sql. Demonstrates the full graph:
--  users/roles, organizations, sources, projects, tech mapping,
--  connectors, logs, saved searches and audit trail.
-- =====================================================================

-- ---- Users (password_hash is a BCrypt placeholder) -------------------
-- DEV/DEMO credentials (bcrypt) — rotate before any shared deployment:
--   admin@discovery.io      / Admin#2026!
--   alex.morgan@discovery.io / BizDev#2026!
INSERT INTO users (id, email, full_name, password_hash, role_id, created_by)
SELECT '11111111-1111-1111-1111-111111111111', 'admin@discovery.io', 'System Administrator',
       '$2b$12$TqkLSDUolZUe7Gjn0LZj0e1ugr0VSogI7Cr0VW5EB5W3kpVlsZ1C.',
       r.id, NULL
FROM roles r WHERE r.name = 'Administrator';

INSERT INTO users (id, email, full_name, password_hash, role_id, created_by)
SELECT '22222222-2222-2222-2222-222222222222', 'alex.morgan@discovery.io', 'Alex Morgan',
       '$2b$12$Df8tRhox3VeyofrRNjJobu0Bm2i2M1g39YeeC2BQRJInv7a.6KLe.',
       r.id, '11111111-1111-1111-1111-111111111111'
FROM roles r WHERE r.name = 'Business Development';

-- ---- Organizations ---------------------------------------------------
INSERT INTO organizations (id, name, country, industry, website) VALUES
 ('a0000000-0000-0000-0000-000000000001','California Dept. of Technology','United States','Public Sector','https://cdt.ca.gov'),
 ('a0000000-0000-0000-0000-000000000002','HM Revenue & Customs','United Kingdom','Government','https://gov.uk/hmrc'),
 ('a0000000-0000-0000-0000-000000000003','Emirates National Bank','United Arab Emirates','Banking & Finance','https://emiratesnbd.com');

-- ---- Sources ---------------------------------------------------------
INSERT INTO project_sources (id, name, source_type, base_url, country) VALUES
 ('b0000000-0000-0000-0000-000000000001','SAM.gov','Government Procurement API','https://api.sam.gov/opportunities/v2/search','United States'),
 ('b0000000-0000-0000-0000-000000000002','UK Contracts Finder','Government Procurement API','https://www.contractsfinder.service.gov.uk/api','United Kingdom'),
 ('b0000000-0000-0000-0000-000000000003','Tender Board Portal','Public Tender API','https://tenderboard.example.ae/api','United Arab Emirates');

-- ---- Projects (publication_date drives partition routing) ------------
INSERT INTO projects (id, reference_number, title, description, ai_summary,
    organization_id, category_id, source_id, country, state, budget_usd, currency,
    project_type, status, eligibility, official_link, contact_email, tags,
    deadline, publication_date, source_hash, created_by)
SELECT
    'c0000000-0000-0000-0000-000000000001','SAM-2026-4820',
    'Statewide GIS Land Records Modernization Platform',
    'Design, build and operate a statewide Geographic Information System for land and parcel records with spatial search, an ArcGIS-compatible REST API, and 5,000 concurrent users.',
    'Statewide GIS platform for land records with spatial search and an ArcGIS-compatible API on AWS GovCloud.',
    'a0000000-0000-0000-0000-000000000001',
    (SELECT id FROM project_categories WHERE name='GIS'),
    'b0000000-0000-0000-0000-000000000001',
    'United States','California',4200000,'USD','Government Tender','Open',
    'Registered US businesses with prior state-government GIS delivery experience and SOC 2 Type II.',
    'https://sam.gov/opp/4820','rfp@cdt.ca.gov',
    ARRAY['GIS','Public Sector','High Value'],
    DATE '2026-08-03', DATE '2026-07-19','sha256-abc123',
    '11111111-1111-1111-1111-111111111111';

INSERT INTO projects (id, reference_number, title, description, ai_summary,
    organization_id, category_id, source_id, country, state, budget_usd, currency,
    project_type, status, eligibility, official_link, contact_email, tags,
    deadline, publication_date, source_hash, created_by)
SELECT
    'c0000000-0000-0000-0000-000000000002','UKCF-2026-4827',
    'AI-Powered Fraud Detection Engine for National Tax Authority',
    'A machine-learning platform to detect anomalous filing patterns across VAT and corporation-tax submissions, with explainable outputs, deployed to the Azure tenancy under data-residency rules.',
    'Explainable ML fraud-detection platform for VAT/corporation-tax, deployed to Azure under strict data residency.',
    'a0000000-0000-0000-0000-000000000002',
    (SELECT id FROM project_categories WHERE name='AI/ML'),
    'b0000000-0000-0000-0000-000000000002',
    'United Kingdom','England',8636000,'GBP','RFP','Open',
    'UK-registered suppliers with G-Cloud listing and Cyber Essentials Plus.',
    'https://contractsfinder.gov.uk/opp/4827','tenders@hmrc.gov.uk',
    ARRAY['AI/ML','Government','High Value'],
    DATE '2026-08-12', DATE '2026-07-17','sha256-def456',
    '11111111-1111-1111-1111-111111111111';

-- ---- Project ↔ technology mapping ------------------------------------
INSERT INTO project_technology_mapping (project_id, publication_date, technology_id)
SELECT 'c0000000-0000-0000-0000-000000000001', DATE '2026-07-19', t.id
FROM technologies t WHERE t.name IN ('GIS','Python','React','AWS','SQL');

INSERT INTO project_technology_mapping (project_id, publication_date, technology_id)
SELECT 'c0000000-0000-0000-0000-000000000002', DATE '2026-07-17', t.id
FROM technologies t WHERE t.name IN ('Python','Machine Learning','AI','Azure','SQL');

-- ---- Connectors ------------------------------------------------------
INSERT INTO api_connectors (id, name, source_type, base_url, auth_type, schedule,
    rate_limit_per_min, pagination, retry_policy, enabled, status, created_by) VALUES
 ('d0000000-0000-0000-0000-000000000001','SAM.gov Contract Opportunities','Government Procurement API',
  'https://api.sam.gov/opportunities/v2/search','API Key','Hourly',60,'Offset',
  'Exponential backoff, 3 attempts', TRUE,'Healthy','11111111-1111-1111-1111-111111111111'),
 ('d0000000-0000-0000-0000-000000000002','UK Contracts Finder','Government Procurement API',
  'https://www.contractsfinder.service.gov.uk/api','None','Hourly',30,'Page',
  'Exponential backoff, 3 attempts', TRUE,'Healthy','11111111-1111-1111-1111-111111111111');

INSERT INTO connector_logs (connector_id, level, message, items_fetched, duration_ms) VALUES
 ('d0000000-0000-0000-0000-000000000001','INFO','Fetched page 1/3 — 20 notices',20,842),
 ('d0000000-0000-0000-0000-000000000001','INFO','Deduplicated 16, upserted 4 new projects',4,210),
 ('d0000000-0000-0000-0000-000000000002','INFO','Upserted 3 projects, updated 1 changed deadline',3,540);

-- ---- Saved search + notification + audit -----------------------------
INSERT INTO saved_searches (user_id, name, query_json, notify) VALUES
 ('22222222-2222-2222-2222-222222222222','GIS tenders > $1M',
  '{"category":"GIS","minBudget":1000000}'::jsonb, TRUE);

INSERT INTO notifications (user_id, channel, subject, body, project_id) VALUES
 ('22222222-2222-2222-2222-222222222222','Email','New GIS opportunity',
  'A new GIS tender matched your saved search.', 'c0000000-0000-0000-0000-000000000001');

INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata) VALUES
 ('11111111-1111-1111-1111-111111111111','CREATE_CONNECTOR','api_connectors',
  'd0000000-0000-0000-0000-000000000001', '{"source":"SAM.gov"}'::jsonb);

-- ---- Verify: weighted full-text search -------------------------------
-- SELECT title, ts_rank(search_vector, plainto_tsquery('english','fraud detection')) AS rank
-- FROM projects WHERE search_vector @@ plainto_tsquery('english','fraud detection')
-- ORDER BY rank DESC;
