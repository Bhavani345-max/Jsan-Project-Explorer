--
-- PostgreSQL database dump
--

\restrict Voh5ZXs8gdwLbv5sxiY4AO2xQ1zzZUMTQdGFffxddpT1TIoggP0MoHiS7ddSAQd

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gin; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA public;


--
-- Name: EXTENSION btree_gin; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION btree_gin IS 'support for indexing common datatypes in GIN';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: projects_search_vector(); Type: FUNCTION; Schema: public; Owner: discovery
--

CREATE FUNCTION public.projects_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description,'')), 'B') ||
        setweight(to_tsvector('english', array_to_string(coalesce(NEW.tags,'{}'),' ')), 'C');
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.projects_search_vector() OWNER TO discovery;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: discovery
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO discovery;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_connectors; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.api_connectors (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(150) NOT NULL,
    source_type character varying(60) NOT NULL,
    base_url character varying(500) NOT NULL,
    auth_type character varying(30) DEFAULT 'None'::character varying NOT NULL,
    auth_secret_ref character varying(200),
    schedule character varying(30) NOT NULL,
    rate_limit_per_min integer DEFAULT 60 NOT NULL,
    pagination character varying(20) DEFAULT 'None'::character varying NOT NULL,
    retry_policy character varying(120),
    enabled boolean DEFAULT true NOT NULL,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    status character varying(20) DEFAULT 'Idle'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


ALTER TABLE public.api_connectors OWNER TO discovery;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    action character varying(80) NOT NULL,
    entity character varying(80),
    entity_id character varying(80),
    metadata jsonb,
    ip_address inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO discovery;

--
-- Name: connector_logs; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.connector_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    connector_id uuid NOT NULL,
    level character varying(10) NOT NULL,
    message text,
    items_fetched integer DEFAULT 0,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.connector_logs OWNER TO discovery;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    channel character varying(20) NOT NULL,
    subject character varying(255),
    body text,
    project_id uuid,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.notifications OWNER TO discovery;

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.organizations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    country character varying(100),
    industry character varying(120),
    website character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


ALTER TABLE public.organizations OWNER TO discovery;

--
-- Name: project_categories; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.project_categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(80) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.project_categories OWNER TO discovery;

--
-- Name: project_history; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.project_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    changed_field character varying(80) NOT NULL,
    old_value text,
    new_value text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by uuid
);


ALTER TABLE public.project_history OWNER TO discovery;

--
-- Name: project_sources; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.project_sources (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(150) NOT NULL,
    source_type character varying(60) NOT NULL,
    base_url character varying(500),
    country character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


ALTER TABLE public.project_sources OWNER TO discovery;

--
-- Name: project_technology_mapping; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.project_technology_mapping (
    project_id uuid NOT NULL,
    publication_date date NOT NULL,
    technology_id uuid NOT NULL
);


ALTER TABLE public.project_technology_mapping OWNER TO discovery;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.projects (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    reference_number character varying(120) NOT NULL,
    title character varying(400) NOT NULL,
    description text,
    ai_summary text,
    organization_id uuid,
    category_id uuid,
    source_id uuid,
    country character varying(100),
    state character varying(120),
    budget_usd bigint,
    currency character varying(8),
    project_type character varying(60),
    status character varying(30) DEFAULT 'Open'::character varying NOT NULL,
    eligibility text,
    official_link character varying(600),
    contact_name character varying(150),
    contact_email character varying(255),
    contact_phone character varying(60),
    tags text[],
    deadline date,
    publication_date date NOT NULL,
    source_hash character varying(64),
    search_vector tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
)
PARTITION BY RANGE (publication_date);


ALTER TABLE public.projects OWNER TO discovery;

--
-- Name: projects_2026_06; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.projects_2026_06 (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    reference_number character varying(120) NOT NULL,
    title character varying(400) NOT NULL,
    description text,
    ai_summary text,
    organization_id uuid,
    category_id uuid,
    source_id uuid,
    country character varying(100),
    state character varying(120),
    budget_usd bigint,
    currency character varying(8),
    project_type character varying(60),
    status character varying(30) DEFAULT 'Open'::character varying NOT NULL,
    eligibility text,
    official_link character varying(600),
    contact_name character varying(150),
    contact_email character varying(255),
    contact_phone character varying(60),
    tags text[],
    deadline date,
    publication_date date NOT NULL,
    source_hash character varying(64),
    search_vector tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


ALTER TABLE public.projects_2026_06 OWNER TO discovery;

--
-- Name: projects_2026_07; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.projects_2026_07 (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    reference_number character varying(120) NOT NULL,
    title character varying(400) NOT NULL,
    description text,
    ai_summary text,
    organization_id uuid,
    category_id uuid,
    source_id uuid,
    country character varying(100),
    state character varying(120),
    budget_usd bigint,
    currency character varying(8),
    project_type character varying(60),
    status character varying(30) DEFAULT 'Open'::character varying NOT NULL,
    eligibility text,
    official_link character varying(600),
    contact_name character varying(150),
    contact_email character varying(255),
    contact_phone character varying(60),
    tags text[],
    deadline date,
    publication_date date NOT NULL,
    source_hash character varying(64),
    search_vector tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


ALTER TABLE public.projects_2026_07 OWNER TO discovery;

--
-- Name: projects_default; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.projects_default (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    reference_number character varying(120) NOT NULL,
    title character varying(400) NOT NULL,
    description text,
    ai_summary text,
    organization_id uuid,
    category_id uuid,
    source_id uuid,
    country character varying(100),
    state character varying(120),
    budget_usd bigint,
    currency character varying(8),
    project_type character varying(60),
    status character varying(30) DEFAULT 'Open'::character varying NOT NULL,
    eligibility text,
    official_link character varying(600),
    contact_name character varying(150),
    contact_email character varying(255),
    contact_phone character varying(60),
    tags text[],
    deadline date,
    publication_date date NOT NULL,
    source_hash character varying(64),
    search_vector tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


ALTER TABLE public.projects_default OWNER TO discovery;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


ALTER TABLE public.roles OWNER TO discovery;

--
-- Name: saved_searches; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.saved_searches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    query_json jsonb NOT NULL,
    notify boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


ALTER TABLE public.saved_searches OWNER TO discovery;

--
-- Name: technologies; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.technologies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(80) NOT NULL,
    category character varying(60),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.technologies OWNER TO discovery;

--
-- Name: users; Type: TABLE; Schema: public; Owner: discovery
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    full_name character varying(150) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


ALTER TABLE public.users OWNER TO discovery;

--
-- Name: projects_2026_06; Type: TABLE ATTACH; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects ATTACH PARTITION public.projects_2026_06 FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');


--
-- Name: projects_2026_07; Type: TABLE ATTACH; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects ATTACH PARTITION public.projects_2026_07 FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');


--
-- Name: projects_default; Type: TABLE ATTACH; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects ATTACH PARTITION public.projects_default DEFAULT;


--
-- Data for Name: api_connectors; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.api_connectors (id, name, source_type, base_url, auth_type, auth_secret_ref, schedule, rate_limit_per_min, pagination, retry_policy, enabled, last_run_at, next_run_at, status, created_at, updated_at, created_by, updated_by, deleted_at) FROM stdin;
d0000000-0000-0000-0000-000000000001	SAM.gov Contract Opportunities	Government Procurement API	https://api.sam.gov/opportunities/v2/search	API Key	\N	Hourly	60	Offset	Exponential backoff, 3 attempts	t	\N	\N	Healthy	2026-07-23 07:41:34.465372+00	2026-07-23 07:41:34.465372+00	11111111-1111-1111-1111-111111111111	\N	\N
d0000000-0000-0000-0000-000000000002	UK Contracts Finder	Government Procurement API	https://www.contractsfinder.service.gov.uk/api	None	\N	Hourly	30	Page	Exponential backoff, 3 attempts	t	\N	\N	Healthy	2026-07-23 07:41:34.465372+00	2026-07-23 07:41:34.465372+00	11111111-1111-1111-1111-111111111111	\N	\N
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.audit_logs (id, user_id, action, entity, entity_id, metadata, ip_address, created_at) FROM stdin;
a528a12b-cdc5-4767-8ab2-e7ebfc175566	11111111-1111-1111-1111-111111111111	CREATE_CONNECTOR	api_connectors	d0000000-0000-0000-0000-000000000001	{"source": "SAM.gov"}	\N	2026-07-23 07:41:34.487445+00
\.


--
-- Data for Name: connector_logs; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.connector_logs (id, connector_id, level, message, items_fetched, duration_ms, created_at) FROM stdin;
b954b7fa-e8b3-4e72-a10a-979916a6eaad	d0000000-0000-0000-0000-000000000001	INFO	Fetched page 1/3 — 20 notices	20	842	2026-07-23 07:41:34.469571+00
f45c24c2-6f53-4b67-8152-50afe5aec230	d0000000-0000-0000-0000-000000000001	INFO	Deduplicated 16, upserted 4 new projects	4	210	2026-07-23 07:41:34.469571+00
2941c9c9-2e8e-43b7-ae87-8fd78ddbafd8	d0000000-0000-0000-0000-000000000002	INFO	Upserted 3 projects, updated 1 changed deadline	3	540	2026-07-23 07:41:34.469571+00
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.notifications (id, user_id, channel, subject, body, project_id, is_read, created_at, deleted_at) FROM stdin;
4adaaeb8-f192-4f49-802d-37bfeb6e5f34	22222222-2222-2222-2222-222222222222	Email	New GIS opportunity	A new GIS tender matched your saved search.	c0000000-0000-0000-0000-000000000001	f	2026-07-23 07:41:34.479751+00	\N
\.


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.organizations (id, name, country, industry, website, created_at, updated_at, created_by, updated_by, deleted_at) FROM stdin;
a0000000-0000-0000-0000-000000000001	California Dept. of Technology	United States	Public Sector	https://cdt.ca.gov	2026-07-23 07:41:34.401501+00	2026-07-23 07:41:34.401501+00	\N	\N	\N
a0000000-0000-0000-0000-000000000002	HM Revenue & Customs	United Kingdom	Government	https://gov.uk/hmrc	2026-07-23 07:41:34.401501+00	2026-07-23 07:41:34.401501+00	\N	\N	\N
a0000000-0000-0000-0000-000000000003	Emirates National Bank	United Arab Emirates	Banking & Finance	https://emiratesnbd.com	2026-07-23 07:41:34.401501+00	2026-07-23 07:41:34.401501+00	\N	\N	\N
c6f70188-ab70-4e8d-a8a6-f504f6ead130	PALLADIUM INTERNATIONAL LIMITED	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
6d2c1cb4-b478-43a9-8548-d79e542f70fa	Harris Federation	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
c100ecc6-d731-491d-a268-8a52d2c07413	REED IN PARTNERSHIP LIMITED	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
537cf95d-1dbc-46ca-a17d-643db60553d2	Ministry of Defence	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
c9b9493b-eb54-4a91-8832-2336dfa82760	NPTC Group of Colleges	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
efa85c90-5697-49b5-a888-15bc68d3a2be	Southend City Council	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
655ebdf4-fe95-4262-8686-fd586ae8e087	Yeovil College	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
cd0e6966-08e9-40e4-becb-e975cfa981fc	Heathrow Airport Ltd	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
c298cefe-d98e-43a7-b9a2-0c900da44efb	BIP SOLUTIONS LIMITED	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
35b1dadb-bdcc-4937-8aca-c2d9c14d215d	North East Lincolnshire Borough Council	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
33993c1c-6c3c-45d7-a25b-71dd4861f76c	Dudley College of Technology	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
c24ad6cb-238d-4105-9a5d-8005677c6777	London Borough of Haringey	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
59145ce8-08a5-4b6b-9d2b-9f7c75ccd986	BALFOUR BEATTY CIVIL ENGINEERING LIMITED	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
719b5de2-52f2-4959-8b7c-7a18ebdbb00a	East Sussex County Council	United Kingdom	\N	\N	2026-07-23 09:56:00.15017+00	2026-07-23 09:56:00.15017+00	\N	\N	\N
\.


--
-- Data for Name: project_categories; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.project_categories (id, name, created_at, updated_at, deleted_at) FROM stdin;
f1db683a-6ce7-43ab-89de-e726c2f33641	GIS	2026-07-23 07:41:34.354286+00	2026-07-23 07:41:34.354286+00	\N
00c112e1-1148-475b-84ec-8c6d98436153	AI/ML	2026-07-23 07:41:34.354286+00	2026-07-23 07:41:34.354286+00	\N
9e3e1f19-43e0-45d2-85dc-de4ea268dc1b	Cloud Migration	2026-07-23 07:41:34.354286+00	2026-07-23 07:41:34.354286+00	\N
c87a9903-8485-432d-a3ed-d2cf2826a31c	Web Development	2026-07-23 07:41:34.354286+00	2026-07-23 07:41:34.354286+00	\N
50580dfe-772a-4c69-819f-dfeac3c25495	Mobile Development	2026-07-23 07:41:34.354286+00	2026-07-23 07:41:34.354286+00	\N
c259a97b-ab52-4e01-b210-79a364c3880f	Data Engineering	2026-07-23 07:41:34.354286+00	2026-07-23 07:41:34.354286+00	\N
3bb6f9ba-8232-43e4-aa98-adacde651c03	Enterprise Software	2026-07-23 07:41:34.354286+00	2026-07-23 07:41:34.354286+00	\N
d59a57d5-e797-4e26-8df2-87a53a5c84f1	Cyber Security	2026-07-23 07:41:34.354286+00	2026-07-23 07:41:34.354286+00	\N
eb03bbce-b8f7-4dd9-a611-08bb248c8cfd	DevOps	2026-07-23 07:41:34.354286+00	2026-07-23 07:41:34.354286+00	\N
\.


--
-- Data for Name: project_history; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.project_history (id, project_id, changed_field, old_value, new_value, changed_at, changed_by) FROM stdin;
\.


--
-- Data for Name: project_sources; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.project_sources (id, name, source_type, base_url, country, created_at, updated_at, created_by, updated_by, deleted_at) FROM stdin;
b0000000-0000-0000-0000-000000000001	SAM.gov	Government Procurement API	https://api.sam.gov/opportunities/v2/search	United States	2026-07-23 07:41:34.405748+00	2026-07-23 07:41:34.405748+00	\N	\N	\N
b0000000-0000-0000-0000-000000000002	UK Contracts Finder	Government Procurement API	https://www.contractsfinder.service.gov.uk/api	United Kingdom	2026-07-23 07:41:34.405748+00	2026-07-23 07:41:34.405748+00	\N	\N	\N
b0000000-0000-0000-0000-000000000003	Tender Board Portal	Public Tender API	https://tenderboard.example.ae/api	United Arab Emirates	2026-07-23 07:41:34.405748+00	2026-07-23 07:41:34.405748+00	\N	\N	\N
\.


--
-- Data for Name: project_technology_mapping; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.project_technology_mapping (project_id, publication_date, technology_id) FROM stdin;
c0000000-0000-0000-0000-000000000001	2026-07-19	1bcadb1f-b4a8-4df7-aaa2-00054ec5e3c6
c0000000-0000-0000-0000-000000000001	2026-07-19	12357c96-3cc9-4c16-8fae-c567022a985c
c0000000-0000-0000-0000-000000000001	2026-07-19	17f6074e-421f-4df7-91a7-336605ebb726
c0000000-0000-0000-0000-000000000001	2026-07-19	2ae2562d-ac20-4f7f-9abb-38256654edf9
c0000000-0000-0000-0000-000000000001	2026-07-19	53233df5-ffa2-431d-af3a-f7eac258c30a
c0000000-0000-0000-0000-000000000002	2026-07-17	1bcadb1f-b4a8-4df7-aaa2-00054ec5e3c6
c0000000-0000-0000-0000-000000000002	2026-07-17	89462ab2-9e9f-4c70-bdc9-ebee80886c9e
c0000000-0000-0000-0000-000000000002	2026-07-17	5277bebc-1633-4295-9402-f0be64d7f123
c0000000-0000-0000-0000-000000000002	2026-07-17	75862583-9de1-4f64-a9d8-e8f718cea3ef
c0000000-0000-0000-0000-000000000002	2026-07-17	53233df5-ffa2-431d-af3a-f7eac258c30a
\.


--
-- Data for Name: projects_2026_06; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.projects_2026_06 (id, reference_number, title, description, ai_summary, organization_id, category_id, source_id, country, state, budget_usd, currency, project_type, status, eligibility, official_link, contact_name, contact_email, contact_phone, tags, deadline, publication_date, source_hash, search_vector, created_at, updated_at, created_by, updated_by, deleted_at) FROM stdin;
\.


--
-- Data for Name: projects_2026_07; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.projects_2026_07 (id, reference_number, title, description, ai_summary, organization_id, category_id, source_id, country, state, budget_usd, currency, project_type, status, eligibility, official_link, contact_name, contact_email, contact_phone, tags, deadline, publication_date, source_hash, search_vector, created_at, updated_at, created_by, updated_by, deleted_at) FROM stdin;
c0000000-0000-0000-0000-000000000001	SAM-2026-4820	Statewide GIS Land Records Modernization Platform	Design, build and operate a statewide Geographic Information System for land and parcel records with spatial search, an ArcGIS-compatible REST API, and 5,000 concurrent users.	Statewide GIS platform for land records with spatial search and an ArcGIS-compatible API on AWS GovCloud.	a0000000-0000-0000-0000-000000000001	f1db683a-6ce7-43ab-89de-e726c2f33641	b0000000-0000-0000-0000-000000000001	United States	California	4200000	USD	Government Tender	Open	Registered US businesses with prior state-government GIS delivery experience and SOC 2 Type II.	https://sam.gov/opp/4820	\N	rfp@cdt.ca.gov	\N	{GIS,"Public Sector","High Value"}	2026-08-03	2026-07-19	sha256-abc123	'000':32B '5':31B 'api':29B 'arcgi':26B 'arcgis-compat':25B 'build':8B 'compat':27B 'concurr':33B 'design':7B 'geograph':13B 'gis':2A,35C 'high':38C 'inform':14B 'land':3A,17B 'modern':5A 'oper':10B 'parcel':19B 'platform':6A 'public':36C 'record':4A,20B 'rest':28B 'search':23B 'sector':37C 'spatial':22B 'statewid':1A,12B 'system':15B 'user':34B 'valu':39C	2026-07-23 07:41:34.409338+00	2026-07-23 07:41:34.409338+00	11111111-1111-1111-1111-111111111111	\N	\N
c0000000-0000-0000-0000-000000000002	UKCF-2026-4827	AI-Powered Fraud Detection Engine for National Tax Authority	A machine-learning platform to detect anomalous filing patterns across VAT and corporation-tax submissions, with explainable outputs, deployed to the Azure tenancy under data-residency rules.	Explainable ML fraud-detection platform for VAT/corporation-tax, deployed to Azure under strict data residency.	a0000000-0000-0000-0000-000000000002	00c112e1-1148-475b-84ec-8c6d98436153	b0000000-0000-0000-0000-000000000002	United Kingdom	England	8636000	GBP	RFP	Open	UK-registered suppliers with G-Cloud listing and Cyber Essentials Plus.	https://contractsfinder.gov.uk/opp/4827	\N	tenders@hmrc.gov.uk	\N	{AI/ML,Government,"High Value"}	2026-08-12	2026-07-17	sha256-def456	'across':21B 'ai':2A 'ai-pow':1A 'ai/ml':41C 'anomal':18B 'author':10A 'azur':34B 'corpor':25B 'corporation-tax':24B 'data':38B 'data-resid':37B 'deploy':31B 'detect':5A,17B 'engin':6A 'explain':29B 'file':19B 'fraud':4A 'govern':42C 'high':43C 'learn':14B 'machin':13B 'machine-learn':12B 'nation':8A 'output':30B 'pattern':20B 'platform':15B 'power':3A 'resid':39B 'rule':40B 'submiss':27B 'tax':9A,26B 'tenanc':35B 'valu':44C 'vat':22B	2026-07-23 07:41:34.431149+00	2026-07-23 07:43:55.251108+00	11111111-1111-1111-1111-111111111111	\N	\N
67f3d536-3b02-4bb7-a4bb-23bd1599c501	ocds-b5fd17-f9f25078-d7d2-467a-8c1e-c75ccee17622	Accelerating high-voltage direct current (HVDC) development in Vietnam	The UK Government's Partnering for Accelerated Climate Transitions (UK PACT) programme is inviting quotations from qualified suppliers or consortia to provide technical assistance to Electricity of Vietnam (EVN) and the National Power Transmission Corporation (EVNNPT) to strengthen institutional, technical, and regulatory capacity for the development and deployment of High Voltage Direct Current (HVDC) transmission infrastructure in Vietnam.\r\n\r\nVietnam's rapidly growing power system faces increasing challenges associated with the uneven geographical distribution of generation resources and demand centres. As renewable energy deployment accelerates, particularly offshore wind and large-scale solar power, the national grid is experiencing growing transmission constraints, power losses, and risks to system stability. Limited land availability for new transmission corridors has highlighted the importance of modern transmission technologies to support the country's energy transition.\r\n\r\nThe Revised National Power Development Plan (PDP8) identifies HVDC infrastructure as a strategic priority for strengthening transmission capacity, improving grid flexibility and reliability, reducing electrical losses, and enabling higher penetration of renewable energy. The plan includes the development of multiple HVDC transmission corridors, converter stations, and associated infrastructure from 2031 onwards.\r\n\r\nThrough this assignment, UK PACT will support EVN and EVNNPT to assess the technical, economic, institutional, and regulatory requirements for HVDC deployment in Vietnam. The selected supplier will review the existing policy and regulatory framework, evaluate the feasibility of planned HVDC investments, assess suitable technology options, and develop practical tools and guidance documents to support investment decision-making.\r\n\r\nThe supplier will also undertake stakeholder mapping, assess capacity gaps within key institutions, and provide targeted technical assistance and training to strengthen national expertise in HVDC planning, modelling, investment appraisal, and system operation.\r\nIn addition, the assignment will generate evidence and recommendations to support implementation of PDP8, contribute to the objectives of Vietnam's Just Energy Transition Partnership (JETP), and enhance readiness for future investment in modern transmission infrastructure.\r\n\r\nInterested suppliers are invited to review the documentation provided in this notice and submit their applications to: expertdeployments@ukpact.co.uk	\N	c6f70188-ab70-4e8d-a8a6-f504f6ead130	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	292400	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/ac973032-8cce-48f3-a07c-6eba45f7f624	\N	\N	\N	{"Electricity, heating, solar and nuclear energy",UK,"Contracts Finder"}	2026-08-17	2026-07-23	e4ebff438c3e752426107809f0753a40ce8e4d5f35bed2da162e3e7bfb9f7d66	'2031':190B 'acceler':1A,17B,94B 'addit':285B 'also':254B 'applic':335B 'apprais':280B 'assess':203B,234B,258B 'assign':194B,287B 'assist':34B,268B 'associ':78B,187B 'avail':121B 'capac':53B,158B,259B 'centr':89B 'challeng':77B 'climat':18B 'consortia':30B 'constraint':111B 'contract':345C 'contribut':298B 'convert':184B 'corpor':45B 'corridor':125B,183B 'countri':137B 'current':6A,63B 'decis':249B 'decision-mak':248B 'demand':88B 'deploy':58B,93B,213B 'develop':8A,56B,145B,178B,239B 'direct':5A,62B 'distribut':83B 'document':244B,327B 'econom':206B 'electr':36B,165B,338C 'enabl':168B 'energi':92B,139B,173B,306B,343C 'enhanc':311B 'evalu':227B 'evid':290B 'evn':39B,199B 'evnnpt':46B,201B 'exist':222B 'experienc':108B 'expertdeployments@ukpact.co.uk':337B 'expertis':274B 'face':75B 'feasibl':229B 'finder':346C 'flexibl':161B 'framework':226B 'futur':314B 'gap':260B 'generat':85B,289B 'geograph':82B 'govern':13B 'grid':106B,160B 'grow':72B,109B 'guidanc':243B 'heat':339C 'high':3A,60B 'high-voltag':2A 'higher':169B 'highlight':127B 'hvdc':7A,64B,149B,181B,212B,232B,276B 'identifi':148B 'implement':295B 'import':129B 'improv':159B 'includ':176B 'increas':76B 'infrastructur':66B,150B,188B,319B 'institut':49B,207B,263B 'interest':320B 'invest':233B,247B,279B,315B 'invit':24B,323B 'jetp':309B 'key':262B 'land':120B 'larg':100B 'large-scal':99B 'limit':119B 'loss':113B,166B 'make':250B 'map':257B 'model':278B 'modern':131B,317B 'multipl':180B 'nation':42B,105B,143B,273B 'new':123B 'notic':331B 'nuclear':342C 'object':301B 'offshor':96B 'onward':191B 'oper':283B 'option':237B 'pact':21B,196B 'particular':95B 'partner':15B 'partnership':308B 'pdp8':147B,297B 'penetr':170B 'plan':146B,175B,231B,277B 'polici':223B 'power':43B,73B,103B,112B,144B 'practic':240B 'prioriti':154B 'programm':22B 'provid':32B,265B,328B 'qualifi':27B 'quotat':25B 'rapid':71B 'readi':312B 'recommend':292B 'reduc':164B 'regulatori':52B,209B,225B 'reliabl':163B 'renew':91B,172B 'requir':210B 'resourc':86B 'review':220B,325B 'revis':142B 'risk':115B 'scale':101B 'select':217B 'solar':102B,340C 'stabil':118B 'stakehold':256B 'station':185B 'strateg':153B 'strengthen':48B,156B,272B 'submit':333B 'suitabl':235B 'supplier':28B,218B,252B,321B 'support':135B,198B,246B,294B 'system':74B,117B,282B 'target':266B 'technic':33B,50B,205B,267B 'technolog':133B,236B 'tool':241B 'train':270B 'transit':19B,140B,307B 'transmiss':44B,65B,110B,124B,132B,157B,182B,318B 'uk':12B,20B,195B,344C 'undertak':255B 'uneven':81B 'vietnam':10A,38B,68B,69B,215B,303B 'voltag':4A,61B 'wind':97B 'within':261B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
cbc660b4-0e98-419d-b866-feb7d7699b90	ocds-b5fd17-e098e207-7cd3-48cb-abd2-3d192bae6687	Peckham - Distribution board replacements	As detailed in tender documents	\N	6d2c1cb4-b478-43a9-8548-d79e542f70fa	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	150000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/7eecca2c-395e-40dd-b7be-246bb2fb726f	\N	\N	\N	{"Electricity distribution and control apparatus",UK,"Contracts Finder"}	2026-08-14	2026-07-22	eb0470db948344b33a6bab16e1457c2bc0e88180c21e5f2cb06d5c8383fdefdd	'apparatus':14C 'board':3A 'contract':16C 'control':13C 'detail':6B 'distribut':2A,11C 'document':9B 'electr':10C 'finder':17C 'peckham':1A 'replac':4A 'tender':8B 'uk':15C	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
49430cf6-f73a-474b-b3c3-4bff0dbda043	ocds-b5fd17-1c131fa4-9ee4-40e2-868e-47c14667f839	Expression of Interest: Future Employment Support	Reed in Partnership intends to participate in the Department for Work and Pensions (DWP) Future Employment Support (FES) opportunity and is inviting organisations to express an interest in delivering the service with us. Together with our partners, we will deliver high-quality employability support that transforms people's lives and their communities. \r\n\r\nThe programme will provide personalised employment support to out-of-work Universal Credit claimants, helping people overcome barriers to work and achieve sustained employment. This may include skills development, work experience, health-related employment support, self-employment guidance and employer engagement activities tailored to local labour market needs. Referrals to the programme will be made via JCPs. \r\n\r\nWe encourage applications from organisations across the public, private and VCSE sectors, including SMEs. We are particularly keen to hear from organisations who can demonstrate proven experience in: \r\n\r\n- Supporting individuals into sustained employment \r\n- Delivering personalised interventions that improve employment outcomes \r\n- Employer engagement and workforce development \r\n- Supporting people with health conditions and complex barriers \r\n- Delivering services informed by local labour market needs \r\n- Innovative, proven services to support people to secure and sustain work \r\n\r\nHow to Respond\r\nTo support organisations of different sizes and specialisms, we are running two EOI routes: \r\n\r\n1. EOI A: For end-to-end delivery providers \r\nFor organisations with a proven track record of delivering high-performing employment services and the capacity to deliver across part or all of one or more CPAs please see here: https://forms.office.com/e/cvax9sttdA\r\n\r\n2. EOI B: Specialist and Innovation Partners  \r\nFor organisations offering specialist expertise or innovative solutions that complement end-to-end provision, please see here: https://forms.office.com/e/e1tbAA1rDz\r\n\r\nTo support applications, please find a full breakdown of the programme and eligible participant cohorts attached to this notice.\r\n\r\nShould you have any questions, please contact partner.network@reed.com. For more information on how we score our EOIs and work with partners please visit our website: https://reedinpartnership.co.uk/partners/.\r\n\r\nPlease note - This EOI does not constitute an offer to work with your organisation but is the first stage in our selection process. Following the initial EOI stage, selected organisations may be invited to participate in market engagement events, webinars, one-to-one discussions, further information requests, due diligence activities and commercial negotiations.	\N	c100ecc6-d731-491d-a268-8a52d2c07413	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	\N	\N	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/f6c06f22-8ec1-4500-8ad2-74e7c9dcf2bd	\N	\N	\N	{"General public services",UK,"Contracts Finder"}	2026-08-28	2026-07-22	063b584a3c1722beb1ec60847b41fc0b56a94be92517273a71b3ec3030d9e7fb	'/e/cvax9sttda':252B '/e/e1tbaa1rdz':280B '/partners/.':327B '1':209B '2':253B 'achiev':82B 'across':125B,238B 'activ':104B,378B 'applic':122B,283B 'attach':296B 'b':255B 'barrier':78B,172B 'breakdown':288B 'capac':235B 'claimant':74B 'cohort':295B 'commerci':380B 'communiti':59B 'complement':269B 'complex':171B 'condit':169B 'constitut':334B 'contact':306B 'contract':386C 'cpas':246B 'credit':73B 'deliv':35B,46B,153B,173B,227B,237B 'deliveri':217B 'demonstr':144B 'depart':15B 'develop':89B,164B 'differ':199B 'dilig':377B 'discuss':372B 'due':376B 'dwp':20B 'elig':293B 'employ':5A,22B,50B,65B,84B,95B,99B,102B,152B,158B,160B,231B 'encourag':121B 'end':214B,216B,271B,273B 'end-to-end':213B,270B 'engag':103B,161B,365B 'eoi':207B,210B,254B,316B,331B,354B 'event':366B 'experi':91B,146B 'expertis':264B 'express':1A,31B 'fes':24B 'find':285B 'finder':387C 'first':345B 'follow':351B 'forms.office.com':251B,279B 'forms.office.com/e/cvax9sttda':250B 'forms.office.com/e/e1tbaa1rdz':278B 'full':287B 'futur':4A,21B 'general':382C 'guidanc':100B 'health':93B,168B 'health-rel':92B 'hear':139B 'help':75B 'high':48B,229B 'high-perform':228B 'high-qual':47B 'improv':157B 'includ':87B,132B 'individu':149B 'inform':175B,310B,374B 'initi':353B 'innov':181B,258B,266B 'intend':10B 'interest':3A,33B 'intervent':155B 'invit':28B,360B 'jcps':119B 'keen':137B 'labour':108B,178B 'live':56B 'local':107B,177B 'made':117B 'market':109B,179B,364B 'may':86B,358B 'need':110B,180B 'negoti':381B 'note':329B 'notic':299B 'offer':262B,336B 'one':243B,369B,371B 'one-to-on':368B 'opportun':25B 'organis':29B,124B,141B,197B,220B,261B,341B,357B 'out-of-work':68B 'outcom':159B 'overcom':77B 'part':239B 'particip':12B,294B,362B 'particular':136B 'partner':43B,259B,320B 'partner.network@reed.com':307B 'partnership':9B 'pension':19B 'peopl':54B,76B,166B,186B 'perform':230B 'personalis':64B,154B 'pleas':247B,275B,284B,305B,321B,328B 'privat':128B 'process':350B 'programm':61B,114B,291B 'proven':145B,182B,223B 'provid':63B,218B 'provis':274B 'public':127B,383C 'qualiti':49B 'question':304B 'record':225B 'reed':7B 'reedinpartnership.co.uk':326B 'reedinpartnership.co.uk/partners/.':325B 'referr':111B 'relat':94B 'request':375B 'respond':194B 'rout':208B 'run':205B 'score':314B 'sector':131B 'secur':188B 'see':248B,276B 'select':349B,356B 'self':98B 'self-employ':97B 'servic':37B,174B,183B,232B,384C 'size':200B 'skill':88B 'smes':133B 'solut':267B 'special':202B 'specialist':256B,263B 'stage':346B,355B 'support':6A,23B,51B,66B,96B,148B,165B,185B,196B,282B 'sustain':83B,151B,190B 'tailor':105B 'togeth':40B 'track':224B 'transform':53B 'two':206B 'uk':385C 'univers':72B 'us':39B 'vcse':130B 'via':118B 'visit':322B 'webinar':367B 'websit':324B 'work':17B,71B,80B,90B,191B,318B,338B 'workforc':163B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
f6316a04-3570-409c-9a53-795db88741b8	ocds-b5fd17-fb0165a9-3df3-48fc-9f79-de05078b7836	Accelerating high-voltage direct current (HVDC) development in Vietnam	The UK Government's Partnering for Accelerated Climate Transitions (UK PACT) programme is inviting quotations from qualified suppliers or consortia to provide technical assistance to Electricity of Vietnam (EVN) and the National Power Transmission Corporation (EVNNPT) to strengthen institutional, technical, and regulatory capacity for the development and deployment of High Voltage Direct Current (HVDC) transmission infrastructure in Vietnam.\r\n\r\nVietnam's rapidly growing power system faces increasing challenges associated with the uneven geographical distribution of generation resources and demand centres. As renewable energy deployment accelerates, particularly offshore wind and large-scale solar power, the national grid is experiencing growing transmission constraints, power losses, and risks to system stability. Limited land availability for new transmission corridors has highlighted the importance of modern transmission technologies to support the country's energy transition.\r\n\r\nThe Revised National Power Development Plan (PDP8) identifies HVDC infrastructure as a strategic priority for strengthening transmission capacity, improving grid flexibility and reliability, reducing electrical losses, and enabling higher penetration of renewable energy. The plan includes the development of multiple HVDC transmission corridors, converter stations, and associated infrastructure from 2031 onwards.\r\n\r\nThrough this assignment, UK PACT will support EVN and EVNNPT to assess the technical, economic, institutional, and regulatory requirements for HVDC deployment in Vietnam. The selected supplier will review the existing policy and regulatory framework, evaluate the feasibility of planned HVDC investments, assess suitable technology options, and develop practical tools and guidance documents to support investment decision-making.\r\n\r\nThe supplier will also undertake stakeholder mapping, assess capacity gaps within key institutions, and provide targeted technical assistance and training to strengthen national expertise in HVDC planning, modelling, investment appraisal, and system operation.\r\nIn addition, the assignment will generate evidence and recommendations to support implementation of PDP8, contribute to the objectives of Vietnam's Just Energy Transition Partnership (JETP), and enhance readiness for future investment in modern transmission infrastructure.\r\n\r\nInterested suppliers are invited to review the documentation provided in this notice and submit their applications to: expertdeployments@ukpact.co.uk	\N	c6f70188-ab70-4e8d-a8a6-f504f6ead130	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	292400	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/ca25b528-3873-4047-bc87-47e394c4d76c	\N	\N	\N	{"Electricity, heating, solar and nuclear energy",UK,"Contracts Finder"}	2026-08-12	2026-07-22	d1e22a752a58c43542adee8f593ef49e5ea0232c0e9ef128de5c2992872beb9c	'2031':190B 'acceler':1A,17B,94B 'addit':285B 'also':254B 'applic':335B 'apprais':280B 'assess':203B,234B,258B 'assign':194B,287B 'assist':34B,268B 'associ':78B,187B 'avail':121B 'capac':53B,158B,259B 'centr':89B 'challeng':77B 'climat':18B 'consortia':30B 'constraint':111B 'contract':345C 'contribut':298B 'convert':184B 'corpor':45B 'corridor':125B,183B 'countri':137B 'current':6A,63B 'decis':249B 'decision-mak':248B 'demand':88B 'deploy':58B,93B,213B 'develop':8A,56B,145B,178B,239B 'direct':5A,62B 'distribut':83B 'document':244B,327B 'econom':206B 'electr':36B,165B,338C 'enabl':168B 'energi':92B,139B,173B,306B,343C 'enhanc':311B 'evalu':227B 'evid':290B 'evn':39B,199B 'evnnpt':46B,201B 'exist':222B 'experienc':108B 'expertdeployments@ukpact.co.uk':337B 'expertis':274B 'face':75B 'feasibl':229B 'finder':346C 'flexibl':161B 'framework':226B 'futur':314B 'gap':260B 'generat':85B,289B 'geograph':82B 'govern':13B 'grid':106B,160B 'grow':72B,109B 'guidanc':243B 'heat':339C 'high':3A,60B 'high-voltag':2A 'higher':169B 'highlight':127B 'hvdc':7A,64B,149B,181B,212B,232B,276B 'identifi':148B 'implement':295B 'import':129B 'improv':159B 'includ':176B 'increas':76B 'infrastructur':66B,150B,188B,319B 'institut':49B,207B,263B 'interest':320B 'invest':233B,247B,279B,315B 'invit':24B,323B 'jetp':309B 'key':262B 'land':120B 'larg':100B 'large-scal':99B 'limit':119B 'loss':113B,166B 'make':250B 'map':257B 'model':278B 'modern':131B,317B 'multipl':180B 'nation':42B,105B,143B,273B 'new':123B 'notic':331B 'nuclear':342C 'object':301B 'offshor':96B 'onward':191B 'oper':283B 'option':237B 'pact':21B,196B 'particular':95B 'partner':15B 'partnership':308B 'pdp8':147B,297B 'penetr':170B 'plan':146B,175B,231B,277B 'polici':223B 'power':43B,73B,103B,112B,144B 'practic':240B 'prioriti':154B 'programm':22B 'provid':32B,265B,328B 'qualifi':27B 'quotat':25B 'rapid':71B 'readi':312B 'recommend':292B 'reduc':164B 'regulatori':52B,209B,225B 'reliabl':163B 'renew':91B,172B 'requir':210B 'resourc':86B 'review':220B,325B 'revis':142B 'risk':115B 'scale':101B 'select':217B 'solar':102B,340C 'stabil':118B 'stakehold':256B 'station':185B 'strateg':153B 'strengthen':48B,156B,272B 'submit':333B 'suitabl':235B 'supplier':28B,218B,252B,321B 'support':135B,198B,246B,294B 'system':74B,117B,282B 'target':266B 'technic':33B,50B,205B,267B 'technolog':133B,236B 'tool':241B 'train':270B 'transit':19B,140B,307B 'transmiss':44B,65B,110B,124B,132B,157B,182B,318B 'uk':12B,20B,195B,344C 'undertak':255B 'uneven':81B 'vietnam':10A,38B,68B,69B,215B,303B 'voltag':4A,61B 'wind':97B 'within':261B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
451d8b2c-0818-4441-830b-91abe1ee5479	ocds-b5fd17-3e97082c-69b2-49be-ad98-d949a0d4141e	Supply Chain Notice: WC1857725 - CY- CIDP26 - Tool Ref: 126596-(AK) Akrotiri Mole Steel Jetty - Entire Structure - Refurbish, CYPRUS	WC1857725 - AKI- CIDP Tool Ref: 126596\r\n\r\n(AK)-Akrotiri Mole Steel Jetty - Refurbish Entire Structure \r\n\r\n* Please provide a detailed description of the notice you are adding: \r\n\r\nDemolish existing steel jetty, complete with concrete beam along with the structures/ buildings south of the proposed new quay wall. \r\n\r\nReconstruct new jetty using both precast units and in-situ concrete, complete with foundation, relief prism, drainage system, including oil water separator and equipped with fenders, bollards, handrails, ladders and M&E services (power & water supply) related to the Mole jetting as well as lighting installation for both new jetty and other Mole area and various reinstatement works of the affected surfaces (concrete & asphalt).\r\n\r\nThe Provisional Key Tender dates for the project are as follows:\r\n\r\n-              Expression of interest: 20/07/2026\r\n-              Expression of interest return: 27/07/2026\r\n-              Invitation to Tender:  06/08/2026\r\n-              Tender Return Date: 16/10/2026\r\n-              Contract award: 20/12/2027\r\n-              Commencement of work: 07/01/2027\r\n-              Completion of work: 30/08/2027\r\n\r\nNote: Due to Environmental Issues Works within water are to be completed by 30 April 2027.\r\n\r\nThe completion of the works will be on 30/08/2028, considering the turtle nesting period falls between April and November when no works are allowed underwater.\r\n\r\nThe currency of this project is Euro (€).\r\n\r\nThe location of this project is Cyprus (British Forces, RAF Akrotiri).\r\n\r\nAdditional information: \r\nWork commencement and completion dates will be subject to MOD DIO's agreement, as they will be dictated by the DIO Environmental Advisor to avoid the environmental restricted periods (e.g. pre-determined breeding periods, turtle nesting period, etc.).\r\n\r\nThis will lead to phasing of the works.\r\n\r\nATTACHMENTS:\r\n\r\n1.\tEOI (expression of interest) form\r\n2.\tPQQ (pre-qualification questionnaire) form\r\n\r\nBoth forms must be completed and returned by the interested tenderers	\N	537cf95d-1dbc-46ca-a17d-643db60553d2	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	2500000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/2487bb76-c509-47c9-8c6b-209430f51f68	\N	\N	\N	{"Demolition work",UK,"Contracts Finder"}	2026-07-27	2026-07-22	a301a19da80b2e7403c00e6ce106aa5f817dd694f0ab38d44a84b7d11b482ba3	'06/08/2026':152B '07/01/2027':163B '1':277B '126596':9A,24B '16/10/2026':156B '2':283B '20/07/2026':143B '20/12/2027':159B '2027':183B '27/07/2026':148B '30':181B '30/08/2027':167B '30/08/2028':192B 'ad':43B 'addit':227B 'advisor':251B 'affect':125B 'agreement':241B 'ak':10A,25B 'aki':20B 'akrotiri':11A,26B,226B 'allow':207B 'along':52B 'april':182B,200B 'area':118B 'asphalt':128B 'attach':276B 'avoid':253B 'award':158B 'beam':51B 'bollard':91B 'breed':262B 'british':223B 'build':56B 'chain':2A 'cidp':21B 'cidp26':6A 'commenc':160B,230B 'complet':48B,76B,164B,179B,185B,232B,294B 'concret':50B,75B,127B 'consid':193B 'contract':157B,304C 'currenc':210B 'cy':5A 'cyprus':18A,222B 'date':133B,155B,233B 'demolish':44B 'demolit':301C 'descript':37B 'detail':36B 'determin':261B 'dictat':246B 'dio':239B,249B 'drainag':81B 'due':169B 'e':96B 'e.g':258B 'entir':15A,31B 'environment':171B,250B,255B 'eoi':278B 'equip':88B 'etc':267B 'euro':215B 'exist':45B 'express':140B,144B,279B 'fall':198B 'fender':90B 'finder':305C 'follow':139B 'forc':224B 'form':282B,289B,291B 'foundat':78B 'handrail':92B 'in-situ':72B 'includ':83B 'inform':228B 'instal':110B 'interest':142B,146B,281B,299B 'invit':149B 'issu':172B 'jet':105B 'jetti':14A,29B,47B,66B,114B 'key':131B 'ladder':93B 'lead':270B 'light':109B 'locat':217B 'm':95B 'mod':238B 'mole':12A,27B,104B,117B 'must':292B 'nest':196B,265B 'new':61B,65B,113B 'note':168B 'notic':3A,40B 'novemb':202B 'oil':84B 'period':197B,257B,263B,266B 'phase':272B 'pleas':33B 'power':98B 'pqq':284B 'pre':260B,286B 'pre-determin':259B 'pre-qualif':285B 'precast':69B 'prism':80B 'project':136B,213B,220B 'propos':60B 'provid':34B 'provision':130B 'qualif':287B 'quay':62B 'questionnair':288B 'raf':225B 'reconstruct':64B 'ref':8A,23B 'refurbish':17A,30B 'reinstat':121B 'relat':101B 'relief':79B 'restrict':256B 'return':147B,154B,296B 'separ':86B 'servic':97B 'situ':74B 'south':57B 'steel':13A,28B,46B 'structur':16A,32B,55B 'subject':236B 'suppli':1A,100B 'surfac':126B 'system':82B 'tender':132B,151B,153B,300B 'tool':7A,22B 'turtl':195B,264B 'uk':303C 'underwat':208B 'unit':70B 'use':67B 'various':120B 'wall':63B 'water':85B,99B,175B 'wc1857725':4A,19B 'well':107B 'within':174B 'work':122B,162B,166B,173B,188B,205B,229B,275B,302C	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
0c391628-4830-45a1-ae36-8cbecc8465c5	ocds-b5fd17-460431f9-e6de-4cf8-acde-a8748aabe859	CA18257 - NPTC - Fire Detection and Fire Alarm System, Servicing, Testing and Maintenance	The College is looking to appoint a contractor to provide an annual inspection, testing and maintenance of the College's Fire Detection and Fire Alarm Systems.  \r\n\r\nTo access this competition: \r\n\r\nRegistered:\r\nLogin to https://suppliers.multiquote.com and view the opportunity CA18257.\r\n\r\nNot registered:\r\nVisit https://suppliers.multiquote.com then register and quote CA18257 as the reason for registration. \r\n\r\n Any queries please contact MultiQuote on 020 3920 8054.	\N	c9b9493b-eb54-4a91-8832-2336dfa82760	f1db683a-6ce7-43ab-89de-e726c2f33641	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	150000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/c3b59439-a79f-40ed-93a1-799925e5a987	\N	\N	\N	{"Preventive maintenance services",UK,"Contracts Finder"}	2026-08-20	2026-07-22	ad36960665aee7b00c6f9c21eb7ee6e9476cb83082cb02ee32d18fe348075a88	'020':72B '3920':73B '8054':74B 'access':40B 'alarm':7A,37B 'annual':24B 'appoint':18B 'ca18257':1A,51B,60B 'colleg':14B,31B 'competit':42B 'contact':69B 'contract':79C 'contractor':20B 'detect':4A,34B 'finder':80C 'fire':3A,6A,33B,36B 'inspect':25B 'login':44B 'look':16B 'mainten':12A,28B,76C 'multiquot':70B 'nptc':2A 'opportun':50B 'pleas':68B 'prevent':75C 'provid':22B 'queri':67B 'quot':59B 'reason':63B 'regist':43B,53B,57B 'registr':65B 'servic':9A,77C 'suppliers.multiquote.com':46B,55B 'system':8A,38B 'test':10A,26B 'uk':78C 'view':48B 'visit':54B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
7941ab60-36c3-4b70-86d5-c15be3e9611e	ocds-b5fd17-6611b4ef-177c-4e50-820d-58596919c55c	M2627-15 - REPLACEMENT OF COMPLETE DOOR ENTRY INTERCOM SYSTEM WITH IP GUARD SYSTEM	Supply, Install & configure IP Door Entry System IPGUARD\r\n\r\nAdditional information: \r\nAll documents are freely available on  https://procontract.due-north.com/	\N	efa85c90-5697-49b5-a888-15bc68d3a2be	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	150000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/2cafbee3-72ca-4e2f-9820-22698dcf526f	\N	\N	\N	{"Intercom equipment",UK,"Contracts Finder"}	2026-07-31	2026-07-22	122a61a6466d5d987628101fcbfd4530a779cf270859f89cbb6ae180dacaccc7	'-15':2A 'addit':22B 'avail':28B 'complet':5A 'configur':16B 'contract':34C 'document':25B 'door':6A,18B 'entri':7A,19B 'equip':32C 'finder':35C 'freeli':27B 'guard':12A 'inform':23B 'instal':15B 'intercom':8A,31C 'ip':11A,17B 'ipguard':21B 'm2627':1A 'procontract.due-north.com':30B 'replac':3A 'suppli':14B 'system':9A,13A,20B 'uk':33C	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
65d59a07-4fff-4415-8a0c-f78009ef07e4	ocds-b5fd17-784ef71d-238e-4e29-849b-3db462e63653	CA18265 - Yeovil College ITT for Mobile Phone Provisions	Yeovil College Invitation to Tender for Mobile Phone Provisions\r\n\r\nTo access this competition: \r\n\r\nRegistered:\r\nLogin to https://suppliers.multiquote.com and view the opportunity CA18265.\r\n\r\nNot registered:\r\nVisit https://suppliers.multiquote.com then register and quote CA18265 as the reason for registration. \r\n\r\n Any queries please contact MultiQuote on 020 3920 8054.	\N	655ebdf4-fe95-4262-8686-fd586ae8e087	f1db683a-6ce7-43ab-89de-e726c2f33641	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	72000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/2c7386b2-4b3d-43ca-a786-4f14caa90006	\N	\N	\N	{"Mobile-telephone services",UK,"Contracts Finder"}	2026-08-24	2026-07-22	842ae0fafddc32ed253414cac38efa3574d763baf487d1fbc386c330d9c68d2f	'020':51B '3920':52B '8054':53B 'access':19B 'ca18265':1A,30B,39B 'colleg':3A,10B 'competit':21B 'contact':48B 'contract':59C 'finder':60C 'invit':11B 'itt':4A 'login':23B 'mobil':6A,15B,55C 'mobile-telephon':54C 'multiquot':49B 'opportun':29B 'phone':7A,16B 'pleas':47B 'provis':8A,17B 'queri':46B 'quot':38B 'reason':42B 'regist':22B,32B,36B 'registr':44B 'servic':57C 'suppliers.multiquote.com':25B,34B 'telephon':56C 'tender':13B 'uk':58C 'view':27B 'visit':33B 'yeovil':2A,9B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
a02b4806-d639-44a3-9fcd-2909beebb124	ocds-b5fd17-deddd9b9-c033-473e-a46b-57f8d9713bca	Lift Off - Q3 - Quieter Neighbourhood Support	Heathrow Lift Off is a new concept developed in 2022 as an additional way to attract and work with SMEs. We envisage that Lift Off will provide the chance for selected innovative SMEs to meet with and present their products and services to a panel made up of Heathrow and our largest supply chain partner organisations. The participating SMEs will have opportunity to connect with Heathrow and key players in our supply chain. In addition, SMEs will also potentially be able to take part in relevant tenders and win business opportunities following up the event. SMEs chosen for each Lift Off event will be allocated with 25 mins for presentation and Q&A.\r\n      \r\n      At Heathrow, we are committed to materially reducing the impact of aircraft noise on our neighbouring communities- recognising that this is not only an operational responsibility, but a critical component of maintaining trust, supporting quality of life, and enabling the long-term sustainability of the airport. The Quieter Neighbourhood Support (QNS) programme is a central pillar of this commitment, delivering targeted, property-level interventions that directly improve the lived experience of residents most affected by noise.\r\n      \r\n      Please see the attached documents where you can find more details on this opportunity. \r\n      \r\n      The Q3, 2026 Lift Off event is scheduled to be held on 18th September 2026.\r\n\r\nAdditional information: Heathrow reserves the right to decide which SMEs will attend each Lift Off event and completing and submitting this opportunity in CompeteFor does not gurantee selection. By submitting your interest, you are agreeing for Heathrow to share your details with our supply chain.	\N	cd0e6966-08e9-40e4-becb-e975cfa981fc	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	50000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/ffb471dd-ccf4-4c0d-9059-54c0fb2db0c6	\N	\N	\N	{"Installation of outdoor illumination equipment",UK,"Contracts Finder"}	2026-07-30	2026-07-22	d4a06b121c7816f022fabffe17d10a76d0a6e5a09ecdc82723938bb8f8622d51	'18th':224B '2022':16B '2026':214B,226B '25':113B 'abl':87B 'addit':19B,81B,227B 'affect':195B 'agre':261B 'aircraft':131B 'airport':166B 'alloc':111B 'also':84B 'attach':201B 'attend':238B 'attract':22B 'busi':96B 'central':175B 'chain':60B,79B,271B 'chanc':35B 'chosen':103B 'commit':124B,179B 'communiti':136B 'competefor':250B 'complet':244B 'compon':149B 'concept':13B 'connect':70B 'contract':278C 'critic':148B 'decid':234B 'deliv':180B 'detail':208B,267B 'develop':14B 'direct':187B 'document':202B 'enabl':158B 'envisag':28B 'equip':276C 'event':101B,108B,217B,242B 'experi':191B 'find':206B 'finder':279C 'follow':98B 'gurante':253B 'heathrow':7B,55B,72B,121B,229B,263B 'held':222B 'illumin':275C 'impact':129B 'improv':188B 'inform':228B 'innov':38B 'instal':272C 'interest':258B 'intervent':185B 'key':74B 'largest':58B 'level':184B 'life':156B 'lift':1A,8B,30B,106B,215B,240B 'live':190B 'long':161B 'long-term':160B 'made':52B 'maintain':151B 'materi':126B 'meet':41B 'min':114B 'neighbour':135B 'neighbourhood':5A,169B 'new':12B 'nois':132B,197B 'oper':144B 'opportun':68B,97B,211B,248B 'organis':62B 'outdoor':274C 'panel':51B 'part':90B 'particip':64B 'partner':61B 'pillar':176B 'player':75B 'pleas':198B 'potenti':85B 'present':44B,116B 'product':46B 'programm':172B 'properti':183B 'property-level':182B 'provid':33B 'q':118B 'q3':3A,213B 'qns':171B 'qualiti':154B 'quieter':4A,168B 'recognis':137B 'reduc':127B 'relev':92B 'reserv':230B 'resid':193B 'respons':145B 'right':232B 'schedul':219B 'see':199B 'select':37B,254B 'septemb':225B 'servic':48B 'share':265B 'smes':26B,39B,65B,82B,102B,236B 'submit':246B,256B 'suppli':59B,78B,270B 'support':6A,153B,170B 'sustain':163B 'take':89B 'target':181B 'tender':93B 'term':162B 'trust':152B 'uk':277C 'way':20B 'win':95B 'work':24B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
0a8377b1-912b-4e8e-9cb8-a1bde9a805e5	ocds-b5fd17-ed575423-46e0-4639-8161-d8e4c0690af8	EKFB JV - Daywork Hire of 8 Wheel Tipper Wagons - Opportunity	EKFB seek EOI's from interested parties with the appropriate experience and resources for the supply of  8 wheel tipper wagons to support the delivery of our C23 HS2 project. The 3 areas for delivery are North Chilterns to Aylesbury (NC2A), Calvert to Greatworth (C2G)  and Greatworth to Southam (G2S).\r\n      \r\n      EKFB is proud to have been appointed by HS2 to deliver civil engineering works across an 80km section of the new high speed rail link between the Chiltern Tunnel and Long Itchington Wood. Our scope of the works includes 15 viaducts, 6.9km of green tunnels, 22km of road diversions, 81 bridges and around 30 million cubic metres of excavation. \r\n      \r\n      EKFB may look to award multiple Suppliers to suit geographical capability dependant on the response to this EOI, in support of SME's and Local Businesses.	\N	c298cefe-d98e-43a7-b9a2-0c900da44efb	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	1000000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/68038ae7-d891-4ec9-bbbd-796856886e4e	\N	\N	\N	{"Tipper trucks",UK,"Contracts Finder"}	2026-07-31	2026-07-22	2826c34d123aa7d65fe28193e4815e1b49d69336beba4bbefbb5f477589e4c26	'15':100B '22km':107B '3':42B '30':115B '6.9':102B '8':6A,28B '80km':77B '81':111B 'across':75B 'appoint':67B 'appropri':20B 'area':43B 'around':114B 'award':125B 'aylesburi':50B 'bridg':112B 'busi':146B 'c23':38B 'c2g':55B 'calvert':52B 'capabl':131B 'chiltern':48B,88B 'civil':72B 'contract':150C 'cubic':117B 'daywork':3A 'deliv':71B 'deliveri':35B,45B 'depend':132B 'divers':110B 'ekfb':1A,11B,61B,121B 'engin':73B 'eoi':13B,138B 'excav':120B 'experi':21B 'finder':151C 'g2s':60B 'geograph':130B 'greatworth':54B,57B 'green':105B 'high':82B 'hire':4A 'hs2':39B,69B 'includ':99B 'interest':16B 'itchington':92B 'jv':2A 'km':103B 'link':85B 'local':145B 'long':91B 'look':123B 'may':122B 'metr':118B 'million':116B 'multipl':126B 'nc2a':51B 'new':81B 'north':47B 'opportun':10A 'parti':17B 'project':40B 'proud':63B 'rail':84B 'resourc':23B 'respons':135B 'road':109B 'scope':95B 'section':78B 'seek':12B 'sme':142B 'southam':59B 'speed':83B 'suit':129B 'suppli':26B 'supplier':127B 'support':33B,140B 'tipper':8A,30B,147C 'truck':148C 'tunnel':89B,106B 'uk':149C 'viaduct':101B 'wagon':9A,31B 'wheel':7A,29B 'wood':93B 'work':74B,98B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
d978b4cd-1742-4bac-9ea6-5bcff2dff825	ocds-b5fd17-c0ae3b7c-9613-4dab-acd3-1e9dc7fa33db	Supply of Ten (10) x New Full Electric Small Vans	North East Lincolnshire Council is inviting tenders for Supply of Ten (10) x New Full Electric Small Vans.	\N	35b1dadb-bdcc-4937-8aca-c2d9c14d215d	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	400000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/7adc2df8-a0f4-4f19-87e1-893c24a637d1	\N	\N	\N	{"Electric vehicles",UK,"Contracts Finder"}	2026-08-24	2026-07-22	c7b8acf1752a671d6593eccb515c0606d1dee868523a5da7f6ec1f63012bd845	'10':4A,22B 'contract':32C 'council':14B 'east':12B 'electr':8A,26B,29C 'finder':33C 'full':7A,25B 'invit':16B 'lincolnshir':13B 'new':6A,24B 'north':11B 'small':9A,27B 'suppli':1A,19B 'ten':3A,21B 'tender':17B 'uk':31C 'van':10A,28B 'vehicl':30C 'x':5A,23B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
a220fc56-9f28-440c-bf66-7cf3faeed286	ocds-b5fd17-7f77ace3-8495-43f0-b30a-73a34aac9ab2	CA18266 - Dudley College of Technology tender for cleaning services	Dudley College is a well-established Further Education and Higher Education provider in the West Midlands. Courses are offered across multiple campuses within a 25-mile radius of the main campus at The Broadway. The College is seeking a cleaning provider to provide cleaning of a regular and routine nature together with more specific periodical cleaning outside of the term-time operation.   \r\nThe contract will be awarded for a period of 3 years commencing 1st April 2027 with an option to extend for a further one plus one years, which will be measured on the achievement of agreed Key Performance Indicators (KPI's), from Day One of the contract.  \r\n\r\nTo access this competition: \r\n\r\nRegistered:\r\nLogin to https://suppliers.multiquote.com and view the opportunity CA18266.\r\n\r\nNot registered:\r\nVisit https://suppliers.multiquote.com then register and quote CA18266 as the reason for registration. \r\n\r\n Any queries please contact MultiQuote on 020 3920 8054.	\N	33993c1c-6c3c-45d7-a25b-71dd4861f76c	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	3992295	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/17c9e77e-fd11-4ba1-8c69-f175d6873822	\N	\N	\N	{"School cleaning services",UK,"Contracts Finder"}	2026-08-27	2026-07-22	bcf1017e3220f90d70b421a07c9b246353e7044bea43ceb1878df42cce8fdd97	'020':154B '1st':86B '2027':88B '25':35B '3':83B '3920':155B '8054':156B 'access':122B 'achiev':107B 'across':30B 'agre':109B 'april':87B 'award':78B 'broadway':44B 'ca18266':1A,133B,142B 'campus':32B,41B 'clean':8A,50B,54B,66B,158C 'colleg':3A,11B,46B 'commenc':85B 'competit':124B 'contact':151B 'contract':75B,120B,161C 'cours':27B 'day':116B 'dudley':2A,10B 'educ':18B,21B 'establish':16B 'extend':93B 'finder':162C 'higher':20B 'indic':112B 'key':110B 'kpi':113B 'login':126B 'main':40B 'measur':104B 'midland':26B 'mile':36B 'multipl':31B 'multiquot':152B 'natur':60B 'offer':29B 'one':97B,99B,117B 'oper':73B 'opportun':132B 'option':91B 'outsid':67B 'perform':111B 'period':65B,81B 'pleas':150B 'plus':98B 'provid':22B,51B,53B 'queri':149B 'quot':141B 'radius':37B 'reason':145B 'regist':125B,135B,139B 'registr':147B 'regular':57B 'routin':59B 'school':157C 'seek':48B 'servic':9A,159C 'specif':64B 'suppliers.multiquote.com':128B,137B 'technolog':5A 'tender':6A 'term':71B 'term-tim':70B 'time':72B 'togeth':61B 'uk':160C 'view':130B 'visit':136B 'well':15B 'well-establish':14B 'west':25B 'within':33B 'year':84B,100B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
0a69a53a-ffdd-4b80-819e-8a702a59d33a	ocds-b5fd17-47f7565b-5746-4553-9408-0e6cc1cf04d2	DPS1 1409 - Housing 4-104 Acacia Road N22 Tree Work	DPS1 1409 - Housing 4-104 Acacia Road N22 Tree Work\r\n\r\nAdditional information: \r\nhttps://londonconstructionprogramme.co.uk/services/dynamic-purchasing-systems/	\N	c24ad6cb-238d-4105-9a5d-8005677c6777	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	90000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/91d2e257-c578-4abd-938e-3fa94f021b7c	\N	\N	\N	{"Architectural, construction, engineering and inspection services",UK,"Contracts Finder"}	2026-07-30	2026-07-22	83cd416d078b5f24861c505bcc5b064469c7b23d8a619cf9ecbb7048edcb3804	'-104':5A,15B '/services/dynamic-purchasing-systems/':25B '1409':2A,12B '4':4A,14B 'acacia':6A,16B 'addit':21B 'architectur':26C 'construct':27C 'contract':33C 'dps1':1A,11B 'engin':28C 'finder':34C 'hous':3A,13B 'inform':22B 'inspect':30C 'londonconstructionprogramme.co.uk':24B 'londonconstructionprogramme.co.uk/services/dynamic-purchasing-systems/':23B 'n22':8A,18B 'road':7A,17B 'servic':31C 'tree':9A,19B 'uk':32C 'work':10A,20B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
905c2fcd-ae32-4170-94f3-2ba07a2b4ceb	ocds-b5fd17-94169d39-39de-447e-94c8-e299cecec469	A66 - Access and Haul roads	The Supplier is required to strip topsoil, including residual vegetation clearance and deposition in Topsoil Storage Areas. Topsoil stockpiles are to be managed by the Subcontractor for the duration of the subcontract works, including spraying and treatment necessary by the Subcontractor to maintain the integrity of the material for re-use.   \r\n\r\nThe supplier is required to undertake site clearance, to include but not limited to: \r\n\r\nWall removal and set aside for reuse \r\n\r\nFence removal and disposal  \r\n\r\nGate removal and disposal  \r\n\r\nKerb and drainage removal and disposal \r\n\r\nSign post removal and disposal \r\n\r\nAllowance for removal / cutting of tree root systems and disposal  \r\n\r\nAllowance for hard dig and disposal of arisings	\N	59145ce8-08a5-4b6b-9d2b-9f7c75ccd986	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	100000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/5af44833-951e-4a81-a8f6-d7cf468d49a9	\N	\N	\N	{"Construction work for highways, roads",UK,"Contracts Finder"}	2026-08-05	2026-07-22	b644b89d6d8590dfd0342819cf3d22d41312f46b788facd58b2ed98b78f486e6	'a66':1A 'access':2A 'allow':98B,108B 'area':22B 'aris':115B 'asid':76B 'clearanc':16B,65B 'construct':116C 'contract':122C 'cut':101B 'deposit':18B 'dig':111B 'dispos':82B,86B,92B,97B,107B,113B 'drainag':89B 'durat':34B 'fenc':79B 'finder':123C 'gate':83B 'hard':110B 'haul':4A 'highway':119C 'includ':13B,39B,67B 'integr':50B 'kerb':87B 'limit':70B 'maintain':48B 'manag':28B 'materi':53B 'necessari':43B 'post':94B 're':56B 're-us':55B 'remov':73B,80B,84B,90B,95B,100B 'requir':9B,61B 'residu':14B 'reus':78B 'road':5A,120C 'root':104B 'set':75B 'sign':93B 'site':64B 'spray':40B 'stockpil':24B 'storag':21B 'strip':11B 'subcontract':37B 'subcontractor':31B,46B 'supplier':7B,59B 'system':105B 'topsoil':12B,20B,23B 'treatment':42B 'tree':103B 'uk':121C 'undertak':63B 'use':57B 'veget':15B 'wall':72B 'work':38B,117C	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
6d3e10e8-d24b-4f01-8c5c-f30c86814d68	ocds-b5fd17-c6ebd803-d9a9-48ed-812b-ac79898b87d4	Minibus (10-16 seats) - Minibus (10-16 seats)	Vehicle type: 16 seat minibus\r\nPassenger Assistant Required:  no\r\n\r\nProposed Taxi Route:\r\nFrom:  Chuck Hatch, Hartfield\r\nTo: Beacon Academy, Crowborough TN6 2AS\r\nPostcodes: TN7 4EX, TN7 4JF, TN3 9UB, TN3 9UG, TN3 9TZ, TN3 9NY\r\n\r\nFrequency: Mon-Fri\r\nDaily School Time: 08:35 - 15:10\r\n\r\nComments for Operator:  currently 10 pupils and 6 stops registered on this service \r\n This opportunity has been distributed on SProc.net	\N	719b5de2-52f2-4959-8b7c-7a18ebdbb00a	f1db683a-6ce7-43ab-89de-e726c2f33641	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	\N	\N	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/0a299182-75ce-4ac0-a450-747ae0eee7f6	\N	\N	\N	{"Transport services (excl. Waste transport)",UK,"Contracts Finder"}	2026-07-29	2026-07-22	9edc88850a3421b2681804fd75e43fdcbb26496ab909e2eec64a40786f54b9d4	'-16':3A,7A '08':51B '10':2A,6A,54B,59B '15':53B '16':11B '2as':30B '35':52B '4ex':33B '4jf':35B '6':62B '9ny':43B '9tz':41B '9ub':37B '9ug':39B 'academi':27B 'assist':15B 'beacon':26B 'chuck':22B 'comment':55B 'contract':81C 'crowborough':28B 'current':58B 'daili':48B 'distribut':72B 'excl':77C 'finder':82C 'frequenc':44B 'fri':47B 'hartfield':24B 'hatch':23B 'minibus':1A,5A,13B 'mon':46B 'mon-fri':45B 'oper':57B 'opportun':69B 'passeng':14B 'postcod':31B 'propos':18B 'pupil':60B 'regist':64B 'requir':16B 'rout':20B 'school':49B 'seat':4A,8A,12B 'servic':67B,76C 'sproc.net':74B 'stop':63B 'taxi':19B 'time':50B 'tn3':36B,38B,40B,42B 'tn6':29B 'tn7':32B,34B 'transport':75C,79C 'type':10B 'uk':80C 'vehicl':9B 'wast':78C	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
95a8f3fa-1265-4028-9015-fdd59dfb858b	ocds-b5fd17-bb3e9929-a81b-4a3a-9aec-ff6b65aa64e0	A66 - Works Examiner	1. Purpose of the Role\r\nThe Work Examiner is responsible for inspecting, reviewing and recording the condition, quality and compliance of works within their allocated area. The role supports safe delivery, identifies defects or non-conformances, and provides clear information to supervisors, engineers and project teams to support timely decision-making.\r\n2. Key Responsibilities\r\n•\tCarry out planned examinations, inspections and site checks in line with the agreed work bank, programme and applicable standards.\r\n•\tReview completed or ongoing works to confirm they meet drawings, specifications, method statements, inspection and test plans, and client requirements.\r\n•\tIdentify, record and communicate defects, safety concerns, incomplete works or areas requiring further investigation.\r\n•\tProduce accurate inspection records, reports, photographs and supporting evidence within agreed timescales.\r\n•\tEscalate urgent issues that may affect safety, quality, programme or asset integrity.\r\n•\tLiaise with site teams, supervisors, engineers, planners and subcontractors to coordinate access, clarify findings and support close-out of actions.\r\n•\tMaintain a safe system of work and comply with site rules, permits, risk assessments and relevant health, safety and environmental requirements.	\N	59145ce8-08a5-4b6b-9d2b-9f7c75ccd986	\N	b0000000-0000-0000-0000-000000000002	United Kingdom	\N	500000	GBP	Public Tender	Open	\N	https://www.contractsfinder.service.gov.uk/Notice/1d254b4d-ecd8-44e9-901a-fd447b7b496a	\N	\N	\N	{"Consultative engineering and construction services",UK,"Contracts Finder"}	2026-08-07	2026-07-22	c47aa99a0797c011e7452a36e074d51ae3b4f8ea471af317e19720b8dff466f5	'1':4B '2':57B 'a66':1A 'access':148B 'accur':114B 'action':157B 'affect':130B 'agre':72B,123B 'alloc':28B 'applic':77B 'area':29B,109B 'assess':171B 'asset':135B 'bank':74B 'carri':60B 'check':67B 'clarifi':149B 'clear':43B 'client':97B 'close':154B 'close-out':153B 'communic':102B 'complet':80B 'compli':165B 'complianc':23B 'concern':105B 'condit':20B 'confirm':85B 'conform':40B 'construct':182C 'consult':179C 'contract':185C 'coordin':147B 'decis':55B 'decision-mak':54B 'defect':36B,103B 'deliveri':34B 'draw':88B 'engin':47B,142B,180C 'environment':177B 'escal':125B 'evid':121B 'examin':3A,11B,63B 'find':150B 'finder':186C 'health':174B 'identifi':35B,99B 'incomplet':106B 'inform':44B 'inspect':15B,64B,92B,115B 'integr':136B 'investig':112B 'issu':127B 'key':58B 'liais':137B 'line':69B 'maintain':158B 'make':56B 'may':129B 'meet':87B 'method':90B 'non':39B 'non-conform':38B 'ongo':82B 'permit':169B 'photograph':118B 'plan':62B,95B 'planner':143B 'produc':113B 'programm':75B,133B 'project':49B 'provid':42B 'purpos':5B 'qualiti':21B,132B 'record':18B,100B,116B 'relev':173B 'report':117B 'requir':98B,110B,178B 'respons':13B,59B 'review':16B,79B 'risk':170B 'role':8B,31B 'rule':168B 'safe':33B,160B 'safeti':104B,131B,175B 'servic':183C 'site':66B,139B,167B 'specif':89B 'standard':78B 'statement':91B 'subcontractor':145B 'supervisor':46B,141B 'support':32B,52B,120B,152B 'system':161B 'team':50B,140B 'test':94B 'time':53B 'timescal':124B 'uk':184C 'urgent':126B 'within':26B,122B 'work':2A,10B,25B,73B,83B,107B,163B	2026-07-23 09:57:16.38484+00	2026-07-23 09:57:16.38484+00	\N	\N	\N
\.


--
-- Data for Name: projects_default; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.projects_default (id, reference_number, title, description, ai_summary, organization_id, category_id, source_id, country, state, budget_usd, currency, project_type, status, eligibility, official_link, contact_name, contact_email, contact_phone, tags, deadline, publication_date, source_hash, search_vector, created_at, updated_at, created_by, updated_by, deleted_at) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.roles (id, name, description, created_at, updated_at, created_by, updated_by, deleted_at) FROM stdin;
02f456fd-8bd4-4b86-bd0a-66f07dcfbd88	Administrator	Full access incl. connector & user management	2026-07-23 07:41:34.350867+00	2026-07-23 07:41:34.350867+00	\N	\N	\N
6fbaf350-17a5-4d79-bc52-842b92ead3b1	Business Development	Discover, save, and track opportunities	2026-07-23 07:41:34.350867+00	2026-07-23 07:41:34.350867+00	\N	\N	\N
b65b4de0-0edc-4f74-811c-c1ed96b9f87c	Sales Team	Pursue and update opportunity status	2026-07-23 07:41:34.350867+00	2026-07-23 07:41:34.350867+00	\N	\N	\N
5e6efe91-43eb-49a0-aa07-1335db61a091	Manager	Analytics & reporting, read/approve	2026-07-23 07:41:34.350867+00	2026-07-23 07:41:34.350867+00	\N	\N	\N
98686b43-1f1e-4cff-bdd9-e5b2a30afad4	Read Only	View-only access	2026-07-23 07:41:34.350867+00	2026-07-23 07:41:34.350867+00	\N	\N	\N
\.


--
-- Data for Name: saved_searches; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.saved_searches (id, user_id, name, query_json, notify, created_at, updated_at, created_by, updated_by, deleted_at) FROM stdin;
11a385e1-8529-41d7-81aa-2be41a5ed419	22222222-2222-2222-2222-222222222222	GIS tenders > $1M	{"category": "GIS", "minBudget": 1000000}	t	2026-07-23 07:41:34.475835+00	2026-07-23 07:41:34.475835+00	\N	\N	\N
\.


--
-- Data for Name: technologies; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.technologies (id, name, category, created_at, updated_at, deleted_at) FROM stdin;
03b3ca09-a8db-4542-85f5-db8f118460c3	Java	Language	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
1bcadb1f-b4a8-4df7-aaa2-00054ec5e3c6	Python	Language	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
12357c96-3cc9-4c16-8fae-c567022a985c	React	Framework	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
38784df3-67fa-488d-8b2f-e1af7adfd187	Angular	Framework	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
5d01b40b-becd-4ace-a39a-5162df0cfd8a	Spring Boot	Framework	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
53686af9-5377-4f0b-92a3-0996abe86c63	Node.js	Framework	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
17f6074e-421f-4df7-91a7-336605ebb726	AWS	Cloud	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
89462ab2-9e9f-4c70-bdc9-ebee80886c9e	Azure	Cloud	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
3ce05917-9e78-4a96-9b00-5f1c1d0dcfc5	GCP	Cloud	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
2ae2562d-ac20-4f7f-9abb-38256654edf9	GIS	Domain	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
5277bebc-1633-4295-9402-f0be64d7f123	AI	Domain	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
75862583-9de1-4f64-a9d8-e8f718cea3ef	Machine Learning	Domain	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
37e7367c-9ac9-4c2d-a5f5-fe3f1e66ae85	Cyber Security	Domain	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
16442d5d-1e0b-4043-b60a-ce9011b02fc4	DevOps	Practice	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
f13a6142-7649-42c8-8381-cffc33ee979f	SAP	Enterprise	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
ea165b3c-3a4d-43dd-bc8b-f63a4b393a4b	Oracle	Database	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
53233df5-ffa2-431d-af3a-f7eac258c30a	SQL	Database	2026-07-23 07:41:34.356492+00	2026-07-23 07:41:34.356492+00	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: discovery
--

COPY public.users (id, email, full_name, password_hash, role_id, is_active, last_login_at, created_at, updated_at, created_by, updated_by, deleted_at) FROM stdin;
22222222-2222-2222-2222-222222222222	alex.morgan@discovery.io	Alex Morgan	$2a$10$examplehashbdxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx	6fbaf350-17a5-4d79-bc52-842b92ead3b1	t	\N	2026-07-23 07:41:34.399076+00	2026-07-23 07:41:34.399076+00	11111111-1111-1111-1111-111111111111	\N	\N
11111111-1111-1111-1111-111111111111	admin@discovery.io	System Administrator	$2b$12$5n3E9dKan3ECUGAJugnhB.kv6G/c5377EdwZ9DTNxvAJ640UPcnba	02f456fd-8bd4-4b86-bd0a-66f07dcfbd88	t	2026-07-23 10:13:12.578546+00	2026-07-23 07:41:34.389515+00	2026-07-23 10:13:12.37983+00	\N	\N	\N
\.


--
-- Name: api_connectors api_connectors_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.api_connectors
    ADD CONSTRAINT api_connectors_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: connector_logs connector_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.connector_logs
    ADD CONSTRAINT connector_logs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_name_country_key; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_name_country_key UNIQUE (name, country);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: project_categories project_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.project_categories
    ADD CONSTRAINT project_categories_name_key UNIQUE (name);


--
-- Name: project_categories project_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.project_categories
    ADD CONSTRAINT project_categories_pkey PRIMARY KEY (id);


--
-- Name: project_history project_history_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.project_history
    ADD CONSTRAINT project_history_pkey PRIMARY KEY (id);


--
-- Name: project_sources project_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.project_sources
    ADD CONSTRAINT project_sources_pkey PRIMARY KEY (id);


--
-- Name: project_technology_mapping project_technology_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.project_technology_mapping
    ADD CONSTRAINT project_technology_mapping_pkey PRIMARY KEY (project_id, publication_date, technology_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id, publication_date);


--
-- Name: projects_2026_06 projects_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects_2026_06
    ADD CONSTRAINT projects_2026_06_pkey PRIMARY KEY (id, publication_date);


--
-- Name: projects projects_source_id_reference_number_publication_date_key; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_source_id_reference_number_publication_date_key UNIQUE (source_id, reference_number, publication_date);


--
-- Name: projects_2026_06 projects_2026_06_source_id_reference_number_publication_dat_key; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects_2026_06
    ADD CONSTRAINT projects_2026_06_source_id_reference_number_publication_dat_key UNIQUE (source_id, reference_number, publication_date);


--
-- Name: projects_2026_07 projects_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects_2026_07
    ADD CONSTRAINT projects_2026_07_pkey PRIMARY KEY (id, publication_date);


--
-- Name: projects_2026_07 projects_2026_07_source_id_reference_number_publication_dat_key; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects_2026_07
    ADD CONSTRAINT projects_2026_07_source_id_reference_number_publication_dat_key UNIQUE (source_id, reference_number, publication_date);


--
-- Name: projects_default projects_default_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects_default
    ADD CONSTRAINT projects_default_pkey PRIMARY KEY (id, publication_date);


--
-- Name: projects_default projects_default_source_id_reference_number_publication_dat_key; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.projects_default
    ADD CONSTRAINT projects_default_source_id_reference_number_publication_dat_key UNIQUE (source_id, reference_number, publication_date);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: saved_searches saved_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_pkey PRIMARY KEY (id);


--
-- Name: technologies technologies_name_key; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.technologies
    ADD CONSTRAINT technologies_name_key UNIQUE (name);


--
-- Name: technologies technologies_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.technologies
    ADD CONSTRAINT technologies_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_user_time; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_audit_user_time ON public.audit_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_conn_logs_brin; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_conn_logs_brin ON public.connector_logs USING brin (created_at);


--
-- Name: idx_conn_logs_conn; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_conn_logs_conn ON public.connector_logs USING btree (connector_id, created_at DESC);


--
-- Name: idx_notif_user_unread; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_notif_user_unread ON public.notifications USING btree (user_id) WHERE ((is_read = false) AND (deleted_at IS NULL));


--
-- Name: idx_projects_budget; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_projects_budget ON ONLY public.projects USING btree (budget_usd);


--
-- Name: idx_projects_category; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_projects_category ON ONLY public.projects USING btree (category_id);


--
-- Name: idx_projects_country; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_projects_country ON ONLY public.projects USING btree (country) WHERE (deleted_at IS NULL);


--
-- Name: idx_projects_deadline; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_projects_deadline ON ONLY public.projects USING btree (deadline) WHERE (deleted_at IS NULL);


--
-- Name: idx_projects_pub_brin; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_projects_pub_brin ON ONLY public.projects USING brin (publication_date);


--
-- Name: idx_projects_ref; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_projects_ref ON ONLY public.projects USING btree (reference_number);


--
-- Name: idx_projects_search; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_projects_search ON ONLY public.projects USING gin (search_vector);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_projects_status ON ONLY public.projects USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: idx_projects_tags; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_projects_tags ON ONLY public.projects USING gin (tags);


--
-- Name: idx_projects_title_tg; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_projects_title_tg ON ONLY public.projects USING gin (title public.gin_trgm_ops);


--
-- Name: idx_saved_user; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_saved_user ON public.saved_searches USING btree (user_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX idx_users_email ON public.users USING btree (email) WHERE (deleted_at IS NULL);


--
-- Name: projects_2026_06_budget_usd_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_06_budget_usd_idx ON public.projects_2026_06 USING btree (budget_usd);


--
-- Name: projects_2026_06_category_id_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_06_category_id_idx ON public.projects_2026_06 USING btree (category_id);


--
-- Name: projects_2026_06_country_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_06_country_idx ON public.projects_2026_06 USING btree (country) WHERE (deleted_at IS NULL);


--
-- Name: projects_2026_06_deadline_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_06_deadline_idx ON public.projects_2026_06 USING btree (deadline) WHERE (deleted_at IS NULL);


--
-- Name: projects_2026_06_publication_date_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_06_publication_date_idx ON public.projects_2026_06 USING brin (publication_date);


--
-- Name: projects_2026_06_reference_number_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_06_reference_number_idx ON public.projects_2026_06 USING btree (reference_number);


--
-- Name: projects_2026_06_search_vector_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_06_search_vector_idx ON public.projects_2026_06 USING gin (search_vector);


--
-- Name: projects_2026_06_status_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_06_status_idx ON public.projects_2026_06 USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: projects_2026_06_tags_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_06_tags_idx ON public.projects_2026_06 USING gin (tags);


--
-- Name: projects_2026_06_title_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_06_title_idx ON public.projects_2026_06 USING gin (title public.gin_trgm_ops);


--
-- Name: projects_2026_07_budget_usd_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_07_budget_usd_idx ON public.projects_2026_07 USING btree (budget_usd);


--
-- Name: projects_2026_07_category_id_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_07_category_id_idx ON public.projects_2026_07 USING btree (category_id);


--
-- Name: projects_2026_07_country_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_07_country_idx ON public.projects_2026_07 USING btree (country) WHERE (deleted_at IS NULL);


--
-- Name: projects_2026_07_deadline_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_07_deadline_idx ON public.projects_2026_07 USING btree (deadline) WHERE (deleted_at IS NULL);


--
-- Name: projects_2026_07_publication_date_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_07_publication_date_idx ON public.projects_2026_07 USING brin (publication_date);


--
-- Name: projects_2026_07_reference_number_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_07_reference_number_idx ON public.projects_2026_07 USING btree (reference_number);


--
-- Name: projects_2026_07_search_vector_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_07_search_vector_idx ON public.projects_2026_07 USING gin (search_vector);


--
-- Name: projects_2026_07_status_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_07_status_idx ON public.projects_2026_07 USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: projects_2026_07_tags_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_07_tags_idx ON public.projects_2026_07 USING gin (tags);


--
-- Name: projects_2026_07_title_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_2026_07_title_idx ON public.projects_2026_07 USING gin (title public.gin_trgm_ops);


--
-- Name: projects_default_budget_usd_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_default_budget_usd_idx ON public.projects_default USING btree (budget_usd);


--
-- Name: projects_default_category_id_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_default_category_id_idx ON public.projects_default USING btree (category_id);


--
-- Name: projects_default_country_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_default_country_idx ON public.projects_default USING btree (country) WHERE (deleted_at IS NULL);


--
-- Name: projects_default_deadline_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_default_deadline_idx ON public.projects_default USING btree (deadline) WHERE (deleted_at IS NULL);


--
-- Name: projects_default_publication_date_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_default_publication_date_idx ON public.projects_default USING brin (publication_date);


--
-- Name: projects_default_reference_number_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_default_reference_number_idx ON public.projects_default USING btree (reference_number);


--
-- Name: projects_default_search_vector_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_default_search_vector_idx ON public.projects_default USING gin (search_vector);


--
-- Name: projects_default_status_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_default_status_idx ON public.projects_default USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: projects_default_tags_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_default_tags_idx ON public.projects_default USING gin (tags);


--
-- Name: projects_default_title_idx; Type: INDEX; Schema: public; Owner: discovery
--

CREATE INDEX projects_default_title_idx ON public.projects_default USING gin (title public.gin_trgm_ops);


--
-- Name: projects_2026_06_budget_usd_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_budget ATTACH PARTITION public.projects_2026_06_budget_usd_idx;


--
-- Name: projects_2026_06_category_id_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_category ATTACH PARTITION public.projects_2026_06_category_id_idx;


--
-- Name: projects_2026_06_country_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_country ATTACH PARTITION public.projects_2026_06_country_idx;


--
-- Name: projects_2026_06_deadline_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_deadline ATTACH PARTITION public.projects_2026_06_deadline_idx;


--
-- Name: projects_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.projects_pkey ATTACH PARTITION public.projects_2026_06_pkey;


--
-- Name: projects_2026_06_publication_date_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_pub_brin ATTACH PARTITION public.projects_2026_06_publication_date_idx;


--
-- Name: projects_2026_06_reference_number_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_ref ATTACH PARTITION public.projects_2026_06_reference_number_idx;


--
-- Name: projects_2026_06_search_vector_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_search ATTACH PARTITION public.projects_2026_06_search_vector_idx;


--
-- Name: projects_2026_06_source_id_reference_number_publication_dat_key; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.projects_source_id_reference_number_publication_date_key ATTACH PARTITION public.projects_2026_06_source_id_reference_number_publication_dat_key;


--
-- Name: projects_2026_06_status_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_status ATTACH PARTITION public.projects_2026_06_status_idx;


--
-- Name: projects_2026_06_tags_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_tags ATTACH PARTITION public.projects_2026_06_tags_idx;


--
-- Name: projects_2026_06_title_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_title_tg ATTACH PARTITION public.projects_2026_06_title_idx;


--
-- Name: projects_2026_07_budget_usd_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_budget ATTACH PARTITION public.projects_2026_07_budget_usd_idx;


--
-- Name: projects_2026_07_category_id_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_category ATTACH PARTITION public.projects_2026_07_category_id_idx;


--
-- Name: projects_2026_07_country_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_country ATTACH PARTITION public.projects_2026_07_country_idx;


--
-- Name: projects_2026_07_deadline_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_deadline ATTACH PARTITION public.projects_2026_07_deadline_idx;


--
-- Name: projects_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.projects_pkey ATTACH PARTITION public.projects_2026_07_pkey;


--
-- Name: projects_2026_07_publication_date_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_pub_brin ATTACH PARTITION public.projects_2026_07_publication_date_idx;


--
-- Name: projects_2026_07_reference_number_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_ref ATTACH PARTITION public.projects_2026_07_reference_number_idx;


--
-- Name: projects_2026_07_search_vector_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_search ATTACH PARTITION public.projects_2026_07_search_vector_idx;


--
-- Name: projects_2026_07_source_id_reference_number_publication_dat_key; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.projects_source_id_reference_number_publication_date_key ATTACH PARTITION public.projects_2026_07_source_id_reference_number_publication_dat_key;


--
-- Name: projects_2026_07_status_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_status ATTACH PARTITION public.projects_2026_07_status_idx;


--
-- Name: projects_2026_07_tags_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_tags ATTACH PARTITION public.projects_2026_07_tags_idx;


--
-- Name: projects_2026_07_title_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_title_tg ATTACH PARTITION public.projects_2026_07_title_idx;


--
-- Name: projects_default_budget_usd_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_budget ATTACH PARTITION public.projects_default_budget_usd_idx;


--
-- Name: projects_default_category_id_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_category ATTACH PARTITION public.projects_default_category_id_idx;


--
-- Name: projects_default_country_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_country ATTACH PARTITION public.projects_default_country_idx;


--
-- Name: projects_default_deadline_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_deadline ATTACH PARTITION public.projects_default_deadline_idx;


--
-- Name: projects_default_pkey; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.projects_pkey ATTACH PARTITION public.projects_default_pkey;


--
-- Name: projects_default_publication_date_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_pub_brin ATTACH PARTITION public.projects_default_publication_date_idx;


--
-- Name: projects_default_reference_number_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_ref ATTACH PARTITION public.projects_default_reference_number_idx;


--
-- Name: projects_default_search_vector_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_search ATTACH PARTITION public.projects_default_search_vector_idx;


--
-- Name: projects_default_source_id_reference_number_publication_dat_key; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.projects_source_id_reference_number_publication_date_key ATTACH PARTITION public.projects_default_source_id_reference_number_publication_dat_key;


--
-- Name: projects_default_status_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_status ATTACH PARTITION public.projects_default_status_idx;


--
-- Name: projects_default_tags_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_tags ATTACH PARTITION public.projects_default_tags_idx;


--
-- Name: projects_default_title_idx; Type: INDEX ATTACH; Schema: public; Owner: discovery
--

ALTER INDEX public.idx_projects_title_tg ATTACH PARTITION public.projects_default_title_idx;


--
-- Name: api_connectors trg_connectors_upd; Type: TRIGGER; Schema: public; Owner: discovery
--

CREATE TRIGGER trg_connectors_upd BEFORE UPDATE ON public.api_connectors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organizations trg_orgs_upd; Type: TRIGGER; Schema: public; Owner: discovery
--

CREATE TRIGGER trg_orgs_upd BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: projects trg_projects_search; Type: TRIGGER; Schema: public; Owner: discovery
--

CREATE TRIGGER trg_projects_search BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.projects_search_vector();


--
-- Name: saved_searches trg_saved_upd; Type: TRIGGER; Schema: public; Owner: discovery
--

CREATE TRIGGER trg_saved_upd BEFORE UPDATE ON public.saved_searches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_upd; Type: TRIGGER; Schema: public; Owner: discovery
--

CREATE TRIGGER trg_users_upd BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: api_connectors api_connectors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.api_connectors
    ADD CONSTRAINT api_connectors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: api_connectors api_connectors_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.api_connectors
    ADD CONSTRAINT api_connectors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: connector_logs connector_logs_connector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.connector_logs
    ADD CONSTRAINT connector_logs_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES public.api_connectors(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: project_technology_mapping project_technology_mapping_project_id_publication_date_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.project_technology_mapping
    ADD CONSTRAINT project_technology_mapping_project_id_publication_date_fkey FOREIGN KEY (project_id, publication_date) REFERENCES public.projects(id, publication_date) ON DELETE CASCADE;


--
-- Name: project_technology_mapping project_technology_mapping_technology_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.project_technology_mapping
    ADD CONSTRAINT project_technology_mapping_technology_id_fkey FOREIGN KEY (technology_id) REFERENCES public.technologies(id);


--
-- Name: projects projects_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE public.projects
    ADD CONSTRAINT projects_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.project_categories(id);


--
-- Name: projects projects_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE public.projects
    ADD CONSTRAINT projects_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: projects projects_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE public.projects
    ADD CONSTRAINT projects_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.project_sources(id);


--
-- Name: saved_searches saved_searches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: discovery
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- PostgreSQL database dump complete
--

\unrestrict Voh5ZXs8gdwLbv5sxiY4AO2xQ1zzZUMTQdGFffxddpT1TIoggP0MoHiS7ddSAQd

