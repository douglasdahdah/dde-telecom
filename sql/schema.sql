--
-- PostgreSQL database dump
--

\restrict yalA501mfoA4kiy1F40Po7QEx0e1gskhEi6anBCtae8Gm8R2H39cdWTXpzcok5o

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: atualizar_data_planos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atualizar_data_planos() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN

    NEW.atualizado_em = NOW();

    RETURN NEW;

END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id integer NOT NULL,
    nome character varying(150) NOT NULL,
    cpf character varying(14),
    email character varying(150),
    telefone character varying(20) NOT NULL,
    data_nascimento date,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_id_seq OWNED BY public.clientes.id;


--
-- Name: enderecos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enderecos (
    id integer NOT NULL,
    cliente_id integer,
    cep character varying(9) NOT NULL,
    logradouro character varying(150),
    numero character varying(20),
    complemento character varying(100),
    bairro character varying(100),
    cidade character varying(100),
    estado character varying(2),
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: enderecos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.enderecos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: enderecos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.enderecos_id_seq OWNED BY public.enderecos.id;


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id integer NOT NULL,
    nome character varying(150) NOT NULL,
    telefone character varying(20) NOT NULL,
    email character varying(150),
    cep character varying(9),
    interesse character varying(100),
    status character varying(30) DEFAULT 'novo'::character varying,
    origem character varying(50) DEFAULT 'site'::character varying,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    logradouro character varying(150),
    numero character varying(20),
    complemento character varying(100),
    bairro character varying(100),
    cidade character varying(100),
    estado character varying(2),
    observacoes text,
    ultimo_contato timestamp without time zone,
    vendedor character varying(120),
    vendedor_id integer
);


--
-- Name: leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leads_id_seq OWNED BY public.leads.id;


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id integer NOT NULL,
    cliente_id integer,
    plano_id integer,
    status character varying(30) DEFAULT 'pendente'::character varying,
    observacoes text,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pedidos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedidos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedidos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pedidos_id_seq OWNED BY public.pedidos.id;


--
-- Name: planos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planos (
    id integer NOT NULL,
    nome character varying(100) NOT NULL,
    tipo character varying(50) NOT NULL,
    velocidade character varying(50),
    franquia character varying(50),
    preco numeric(10,2) NOT NULL,
    descricao text,
    ativo boolean DEFAULT true,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    destaque boolean DEFAULT false NOT NULL,
    selo character varying(80),
    ordem integer DEFAULT 0 NOT NULL,
    beneficios jsonb DEFAULT '[]'::jsonb NOT NULL,
    fidelidade_meses integer,
    preco_original numeric(10,2),
    promocional boolean DEFAULT false NOT NULL,
    oferta_valida_ate date,
    observacoes text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT planos_ordem_check CHECK ((ordem >= 0)),
    CONSTRAINT planos_preco_check CHECK ((preco >= (0)::numeric)),
    CONSTRAINT planos_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['internet'::character varying, 'controle'::character varying, 'pos'::character varying])::text[])))
);


--
-- Name: planos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.planos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: planos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.planos_id_seq OWNED BY public.planos.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nome character varying(120) NOT NULL,
    email character varying(150) NOT NULL,
    senha_hash character varying(255) NOT NULL,
    perfil character varying(30) DEFAULT 'vendedor'::character varying NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp without time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: clientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id SET DEFAULT nextval('public.clientes_id_seq'::regclass);


--
-- Name: enderecos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enderecos ALTER COLUMN id SET DEFAULT nextval('public.enderecos_id_seq'::regclass);


--
-- Name: leads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads ALTER COLUMN id SET DEFAULT nextval('public.leads_id_seq'::regclass);


--
-- Name: pedidos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos ALTER COLUMN id SET DEFAULT nextval('public.pedidos_id_seq'::regclass);


--
-- Name: planos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planos ALTER COLUMN id SET DEFAULT nextval('public.planos_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: enderecos enderecos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enderecos
    ADD CONSTRAINT enderecos_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id);


--
-- Name: planos planos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planos
    ADD CONSTRAINT planos_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_clientes_cpf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_cpf ON public.clientes USING btree (cpf);


--
-- Name: idx_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_status ON public.leads USING btree (status);


--
-- Name: idx_leads_telefone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_telefone ON public.leads USING btree (telefone);


--
-- Name: idx_leads_vendedor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_vendedor_id ON public.leads USING btree (vendedor_id);


--
-- Name: idx_pedidos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_status ON public.pedidos USING btree (status);


--
-- Name: idx_planos_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planos_ativo ON public.planos USING btree (ativo);


--
-- Name: idx_planos_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planos_tipo ON public.planos USING btree (tipo);


--
-- Name: idx_planos_tipo_ativo_ordem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planos_tipo_ativo_ordem ON public.planos USING btree (tipo, ativo, ordem);


--
-- Name: planos trg_planos_atualizado_em; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_planos_atualizado_em BEFORE UPDATE ON public.planos FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_planos();


--
-- Name: enderecos enderecos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enderecos
    ADD CONSTRAINT enderecos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: leads leads_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: pedidos pedidos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: pedidos pedidos_plano_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_plano_id_fkey FOREIGN KEY (plano_id) REFERENCES public.planos(id);


--
-- PostgreSQL database dump complete
--

\unrestrict yalA501mfoA4kiy1F40Po7QEx0e1gskhEi6anBCtae8Gm8R2H39cdWTXpzcok5o

