-- ============================================================
-- HABILITAR ROW LEVEL SECURITY EM TODAS AS TABELAS
-- nksw-crm — rodar no Supabase SQL Editor
--
-- O app usa Prisma (conexão direta postgres) que bypass RLS.
-- Nenhuma policy permissiva é adicionada — isso bloqueia todo
-- acesso via API REST pública (PostgREST / anon key).
-- ============================================================

-- AUTH & USUÁRIOS
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_tokens  ENABLE ROW LEVEL SECURITY;

-- CLIENTES
ALTER TABLE public.customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tags        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_scores      ENABLE ROW LEVEL SECURITY;

-- PEDIDOS
ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_items           ENABLE ROW LEVEL SECURITY;

-- CARRINHOS ABANDONADOS
ALTER TABLE public.abandoned_carts      ENABLE ROW LEVEL SECURITY;

-- PRODUTOS
ALTER TABLE public.products             ENABLE ROW LEVEL SECURITY;

-- COMUNICAÇÃO
ALTER TABLE public.conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_engagements    ENABLE ROW LEVEL SECURITY;

-- CAMPANHAS
ALTER TABLE public.omnisend_campaigns   ENABLE ROW LEVEL SECURITY;

-- TAREFAS & NOTAS
ALTER TABLE public.tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes                ENABLE ROW LEVEL SECURITY;

-- PIPELINE
ALTER TABLE public.pipelines            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_cards       ENABLE ROW LEVEL SECURITY;

-- DISTRIBUIÇÃO DE LEADS
ALTER TABLE public.lead_assignments     ENABLE ROW LEVEL SECURITY;

-- IA & SCORES
ALTER TABLE public.ai_recommendations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_profiles     ENABLE ROW LEVEL SECURITY;

-- INTEGRAÇÕES
ALTER TABLE public.integrations         ENABLE ROW LEVEL SECURITY;

-- AUDITORIA
ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VERIFICAÇÃO: lista tabelas com RLS habilitado
-- ============================================================
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
