# NKSW CRM

CRM interno da Naked Swimwear para personal shoppers e atendimento premium.

## Stack

- **Frontend:** Next.js 15 + TypeScript + TailwindCSS + Shadcn/UI
- **Backend:** API Routes (Node.js)
- **Banco:** PostgreSQL via Supabase + Prisma ORM
- **Auth:** NextAuth v5 (email/senha)
- **IA:** OpenAI GPT-4o-mini (insights + RFM + recomendações)
- **Integrações:** Shopify Admin API, Omnisend, WhatsApp Cloud API

---

## Setup rápido

### 1. Instalar dependências

```bash
npm install
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
# Edite .env.local com as credenciais reais
```

### 3. Banco de dados

```bash
# Aplicar schema
npm run db:push

# Seed inicial (admin + personal shoppers + pipeline)
npm run db:seed
```

### 4. Rodar em dev

```bash
npm run dev
```

Acesse: http://localhost:3000

---

## Credenciais iniciais (após seed)

| Role | Email | Senha |
|------|-------|-------|
| Admin | admin@nakedsw.com.br | nksw2025admin |
| Personal Shopper | ps1@nakedsw.com.br | nksw2025ps |

> **Trocar as senhas imediatamente após o primeiro login.**

---

## Estrutura do projeto

```
src/
├── app/
│   ├── (auth)/login/           # Página de login
│   ├── (dashboard)/            # Layout autenticado
│   │   ├── dashboard/          # KPIs + RFM + alertas
│   │   ├── customers/          # Lista com filtros
│   │   ├── customers/[id]/     # Perfil completo
│   │   ├── pipeline/           # Kanban drag-and-drop
│   │   └── tasks/              # Gestão de tarefas
│   └── api/
│       ├── auth/               # NextAuth
│       ├── customers/          # CRUD + busca
│       ├── pipeline/           # Pipeline + cards
│       ├── tasks/              # Tarefas
│       ├── dashboard/          # Stats
│       ├── integrations/shopify/sync/  # Sync manual
│       └── webhooks/shopify/   # Webhook Shopify
├── lib/
│   ├── auth.ts                 # NextAuth config
│   ├── db.ts                   # Prisma singleton
│   ├── shopify.ts              # Shopify Admin API
│   ├── omnisend.ts             # Omnisend API
│   └── openai.ts               # OpenAI + prompts
├── services/
│   ├── rfm.service.ts          # Cálculo RFM completo
│   ├── sync.service.ts         # Sync Shopify → DB
│   └── customer.service.ts     # Lógica de clientes
└── components/
    ├── layout/                 # Sidebar + Header
    ├── dashboard/              # StatsCards + RFMChart
    ├── customers/              # CustomerList + CustomerProfile
    ├── pipeline/               # KanbanBoard (dnd)
    ├── tasks/                  # TasksView
    └── shared/                 # ScoreBadge + GlobalSearch
```

---

## Sync Shopify

### Manual (via UI)
Configurações → Integrações → Shopify → Sincronizar

### Via API
```bash
# Sync completo
curl -X POST /api/integrations/shopify/sync \
  -H "Content-Type: application/json" \
  -d '{"incremental": false}'

# Sync incremental (últimas 2h)
curl -X POST /api/integrations/shopify/sync \
  -d '{"incremental": true}'
```

### Webhooks Shopify
Configure no Admin Shopify → Configurações → Notificações → Webhooks:

| Evento | URL |
|--------|-----|
| orders/paid | https://seu-crm.vercel.app/api/webhooks/shopify |
| orders/updated | https://seu-crm.vercel.app/api/webhooks/shopify |
| customers/create | https://seu-crm.vercel.app/api/webhooks/shopify |
| customers/update | https://seu-crm.vercel.app/api/webhooks/shopify |
| checkouts/create | https://seu-crm.vercel.app/api/webhooks/shopify |

---

## RFM — Critérios NKSW

| Dimensão | Score 5 | Score 4 | Score 3 | Score 2 | Score 1 |
|----------|---------|---------|---------|---------|---------|
| Recência | ≤30 dias | ≤60 | ≤120 | ≤180 | >180 |
| Frequência | ≥6 pedidos | ≥4 | ≥2 | ≥1 | 0 |
| Monetário | ≥R$2000 | ≥R$1000 | ≥R$500 | ≥R$200 | <R$200 |

---

## Deploy (Vercel)

```bash
# Conecte o repo no Vercel e configure as env vars
# O deploy é automático no push para main
vercel --prod
```

Variáveis obrigatórias no Vercel:
- `DATABASE_URL` + `DIRECT_URL`
- `NEXTAUTH_SECRET` (gere com `openssl rand -base64 32`)
- `SHOPIFY_ADMIN_TOKEN`
- `OMNISEND_API_KEY`
- `OPENAI_API_KEY`

---

## Roadmap

### MVP (pronto)
- [x] Auth + controle de permissões
- [x] Dashboard com KPIs
- [x] Lista de clientes com filtros
- [x] Perfil completo do cliente
- [x] Pipeline Kanban drag-and-drop
- [x] Gestão de tarefas
- [x] Sync Shopify (clientes + pedidos + carrinhos)
- [x] Score RFM automático
- [x] Insights de IA (OpenAI)
- [x] Busca global (⌘K)
- [x] Notas internas
- [x] Webhooks Shopify em tempo real

### Próximas features
- [ ] Integração Gmail (OAuth + envio de emails)
- [ ] WhatsApp Cloud API (inbox + templates)
- [ ] Integração Omnisend (engajamento + automações)
- [ ] Distribuição automática de leads via IA
- [ ] Recomendações de produtos personalizadas
- [ ] Relatórios de performance dos personal shoppers
- [ ] Automações (carrinho abandonado → alerta)
- [ ] App mobile (PWA)
