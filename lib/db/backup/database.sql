--
-- PostgreSQL database dump
--

\restrict Tg5A3WSn3vCUkMcZ37smOQoNG4xTuctDLaLhzl0kuXUeyxKvUmeObElVMEjpdOP

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_state (
    id integer DEFAULT 1 NOT NULL,
    monitoring_enabled boolean DEFAULT false NOT NULL
);


--
-- Name: automation_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_jobs (
    id integer NOT NULL,
    target_username text NOT NULL,
    action_type text NOT NULL,
    frequency_minutes integer NOT NULL,
    randomize_delay boolean DEFAULT true NOT NULL,
    status text DEFAULT 'paused'::text NOT NULL,
    next_run_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automation_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_jobs_id_seq OWNED BY public.automation_jobs.id;


--
-- Name: request_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_config (
    id integer DEFAULT 1 NOT NULL,
    target_url text,
    headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    cookies jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: request_run_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_run_log (
    id integer NOT NULL,
    success boolean NOT NULL,
    status integer,
    status_text text,
    error_message text,
    ran_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: request_run_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.request_run_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: request_run_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.request_run_log_id_seq OWNED BY public.request_run_log.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: tracked_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracked_users (
    id integer NOT NULL,
    username text NOT NULL,
    full_name text NOT NULL,
    avatar_url text NOT NULL,
    category text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    last_interaction_at timestamp with time zone,
    interaction_count integer DEFAULT 0 NOT NULL,
    auto_like_enabled boolean DEFAULT false NOT NULL
);


--
-- Name: tracked_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tracked_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tracked_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tracked_users_id_seq OWNED BY public.tracked_users.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: automation_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_jobs ALTER COLUMN id SET DEFAULT nextval('public.automation_jobs_id_seq'::regclass);


--
-- Name: request_run_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_run_log ALTER COLUMN id SET DEFAULT nextval('public.request_run_log_id_seq'::regclass);


--
-- Name: tracked_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracked_users ALTER COLUMN id SET DEFAULT nextval('public.tracked_users_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: app_state; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.app_state (id, monitoring_enabled) FROM stdin;
\.


--
-- Data for Name: automation_jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.automation_jobs (id, target_username, action_type, frequency_minutes, randomize_delay, status, next_run_at, created_at) FROM stdin;
\.


--
-- Data for Name: request_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.request_config (id, target_url, headers, cookies, updated_at) FROM stdin;
\.


--
-- Data for Name: request_run_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.request_run_log (id, success, status, status_text, error_message, ran_at) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session (sid, sess, expire) FROM stdin;
gtwsUqwWeSHeichMODvuy-CkfICSGt-T	{"cookie":{"originalMaxAge":604800000,"expires":"2026-07-19T14:32:04.129Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1}	2026-07-19 14:32:05
\.


--
-- Data for Name: tracked_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tracked_users (id, username, full_name, avatar_url, category, added_at, last_interaction_at, interaction_count, auto_like_enabled) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, password_hash, created_at) FROM stdin;
1	admin	$2b$10$ln4rzmg5KVC7lqSAwOi.Yu84jPheokQD/AdVJxGjidpBtZNu/mCTG	2026-07-12 14:31:41.614992+00
\.


--
-- Name: automation_jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.automation_jobs_id_seq', 1, false);


--
-- Name: request_run_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.request_run_log_id_seq', 1, false);


--
-- Name: tracked_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tracked_users_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- Name: app_state app_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_state
    ADD CONSTRAINT app_state_pkey PRIMARY KEY (id);


--
-- Name: automation_jobs automation_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_jobs
    ADD CONSTRAINT automation_jobs_pkey PRIMARY KEY (id);


--
-- Name: request_config request_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_config
    ADD CONSTRAINT request_config_pkey PRIMARY KEY (id);


--
-- Name: request_run_log request_run_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_run_log
    ADD CONSTRAINT request_run_log_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: tracked_users tracked_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracked_users
    ADD CONSTRAINT tracked_users_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- PostgreSQL database dump complete
--

\unrestrict Tg5A3WSn3vCUkMcZ37smOQoNG4xTuctDLaLhzl0kuXUeyxKvUmeObElVMEjpdOP

