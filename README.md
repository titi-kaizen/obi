# OGASCI — Oil & Gas Argentina Supply Chain Intelligence

Plataforma de inteligencia de noticias para planificación estratégica de Supply Chain en el sector O&G Argentina.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| API | Fastify 5 + TypeScript |
| Base de datos | Supabase (PostgreSQL 15 + pgvector + RLS) |
| Colas | Redis + BullMQ |
| Scraping | rss-parser + Cheerio + Playwright |
| IA | Claude Haiku (clasificación, NER, score) + Claude Sonnet (brief diario) |
| Monorepo | pnpm workspaces + Turborepo |
| Deploy | Docker + GitHub Actions |

## Arquitectura

```
Fuentes (RSS / HTML / Playwright)
       │
       ▼
 [scrape queue]
       │
  Scraper Worker ──── deduplication ────► Supabase articles (pending)
       │
       ▼
 [process-article queue]
       │
  AI Pipeline Worker (Claude Haiku)
    ├── classify + NER + score + summarize (1 API call)
    └──► Supabase articles (done) + entities
       │
       ├─── [detect-signals queue] ──► Signal Detector
       │                                └──► signals table
       ├─── [evaluate-alerts queue] ──► Alert Engine
       │                                └──► email / Slack / webhook
       └─── [generate-brief queue] ──► Brief Generator (Claude Sonnet)
                                        └──► executive_briefs table
```

## Prereqs

- Node.js 22+
- pnpm 9.15+
- Docker Desktop (para Redis local)
- Cuenta Supabase (free tier OK para dev)
- API key Anthropic

## Setup inicial

### 1. Clonar y instalar

```bash
git clone https://github.com/tu-org/ogasci.git
cd ogasci
pnpm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores reales:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - DATABASE_URL
# - ANTHROPIC_API_KEY
```

### 3. Supabase — base de datos

**Opción A: Supabase Cloud (recomendado)**

```bash
# Instalar CLI
npm install -g supabase

# Linkear al proyecto existente
supabase link --project-ref TU_PROJECT_REF

# Aplicar migraciones
supabase db push

# Cargar fuentes iniciales
psql $DATABASE_URL -f supabase/seed.sql
```

**Opción B: Local con Supabase CLI**

```bash
supabase start
# Supabase Studio disponible en http://localhost:54323
supabase db reset  # aplica migrations + seed
```

### 4. Redis

```bash
docker compose up -d redis
# Redis disponible en localhost:6379
```

### 5. Arrancar todos los servicios en desarrollo

```bash
pnpm dev
# Arranca en paralelo:
# - API Fastify        → http://localhost:3001
# - API Docs (Swagger) → http://localhost:3001/docs
# - Scraper Worker     → background
# - AI Pipeline Worker → background
# - Signal Detector    → background
# - Alert Engine       → background
# - Brief Generator    → background
```

O arrancar servicios individuales:

```bash
# Solo la API
pnpm --filter @ogasci/api dev

# Solo el scraper
pnpm --filter @ogasci/scraper dev

# Solo el AI pipeline
pnpm --filter @ogasci/ai-pipeline dev
```

### 6. Verificar que todo funciona

```bash
# Health check de la API
curl http://localhost:3001/health

# Estado de las colas (requiere auth)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/admin/queue-status

# Disparar scrape manual de una fuente
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/sources/SOURCE_ID/test
```

## Autenticación

OGASCI usa JWT de Supabase Auth. Los roles se configuran en `app_metadata` del usuario:

```sql
-- En Supabase SQL Editor o via API
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
WHERE email = 'tu@email.com';
```

| Rol | Permisos |
|---|---|
| `admin` | Todo |
| `analyst` | Lectura + generar briefs + test scraping |
| `viewer` | Solo lectura |

## Estructura del proyecto

```
ogasci/
├── apps/
│   ├── api/            Fastify REST API
│   └── web/            Next.js 14 (Phase 2)
├── packages/
│   ├── shared/         Tipos TypeScript + constantes
│   ├── scraper/        Worker RSS + HTML + Playwright
│   ├── ai-pipeline/    Worker Claude Haiku
│   ├── signal-detector Worker detección de señales
│   ├── alert-engine/   Worker alertas (email/Slack/webhook)
│   └── brief-generator Worker brief diario (Claude Sonnet)
├── supabase/
│   ├── migrations/     001-004 SQL migrations
│   └── seed.sql        20+ fuentes O&G Argentina
├── .github/workflows/  CI + Deploy
└── docker-compose.yml  Dev (Redis) / docker-compose.prod.yml
```

## API — Endpoints principales

```
# Artículos
GET  /api/articles                 Lista con filtros
GET  /api/articles/:id             Detalle + entidades
GET  /api/articles/:id/similar     Similares

# Búsqueda
GET  /api/search?q=vaca+muerta     Full-text PostgreSQL
GET  /api/search/trending          Búsquedas populares

# Fuentes
GET  /api/sources                  Listar fuentes
POST /api/sources                  Crear [admin]
POST /api/sources/:id/test         Scrape manual [admin/analyst]
POST /api/sources/:id/toggle       Activar/desactivar [admin]

# Dashboard
GET  /api/dashboard/kpis           KPIs principales
GET  /api/dashboard/trends         Tendencias diarias
GET  /api/dashboard/companies      Top empresas mencionadas

# Señales
GET  /api/signals                  Señales detectadas
GET  /api/signals/trending         Señales activas 48hs
PATCH /api/signals/:id/resolve     Resolver señal

# Alertas
GET  /api/alert-rules              Mis reglas
POST /api/alert-rules              Crear regla
GET  /api/alert-rules/events       Historial de eventos

# Brief ejecutivo
GET  /api/brief/today              Brief del día
GET  /api/brief/:date              Brief por fecha (YYYY-MM-DD)
POST /api/brief/generate           Generar manualmente

# Admin
GET  /api/admin/queue-status       Estado de colas
POST /api/admin/reprocess/:id      Re-procesar artículo fallido
GET  /api/admin/scrape-logs        Logs de scraping
```

## Costos IA estimados

| Modelo | Uso | Costo estimado |
|---|---|---|
| Claude Haiku | ~500 artículos/día × 400 tokens avg | ~$0.08/día |
| Claude Sonnet | 1 brief/día × 4000 tokens | ~$0.02/día |
| **Total** | | **~$3/mes** |

## Fases de desarrollo

- ✅ **Phase 1** — Infra + BD + API + Scraper + AI Pipeline
- 🔲 **Phase 2** — Frontend Next.js + búsqueda semántica + dashboard
- 🔲 **Phase 3** — Brief PDF/PPTX/Excel + Realtime + alertas avanzadas
- 🔲 **Phase 4** — CI/CD hardening + monitoreo + onboarding producción

## Deploy a producción

```bash
# 1. Configurar secretos en GitHub repo:
#    DATABASE_URL, ANTHROPIC_API_KEY, DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY
#    SLACK_DEPLOY_WEBHOOK (opcional)

# 2. Push a main = deploy automático
git push origin main

# 3. O deploy manual
gh workflow run deploy.yml -f environment=production
```

## Troubleshooting

**Scraper no procesa artículos**
```bash
# Ver artículos pendientes
curl .../api/admin/processing-errors

# Ver estado de colas
curl .../api/admin/queue-status

# Reencolar manualmente
curl -X POST .../api/admin/reprocess/ARTICLE_ID
```

**Error de conexión Supabase**
```bash
# Verificar variables de entorno
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Test directo
psql $DATABASE_URL -c "SELECT 1"
```

**Playwright no arranca**
```bash
# Instalar dependencias del sistema (Linux)
npx playwright install-deps chromium

# O deshabilitar scraping dinámico
ENABLE_DYNAMIC_SCRAPING=false pnpm dev
```
