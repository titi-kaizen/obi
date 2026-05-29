# OBI Intelligence — Setup Guide

## 1. Prerequisites

- Python 3.12+
- Redis (Docker or local)
- PostgreSQL (Supabase recommended)
- Groq API key (free tier works)

## 2. Install dependencies

```bash
cd apps/intelligence
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium --with-deps
```

## 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, GROQ_API_KEY
```

## 4. Run database migration

```bash
# In Supabase SQL Editor, run:
# supabase/migrations/006_python_backend.sql
```

## 5. Seed sources

```bash
python seed_sources.py
```

## 6. Start services

### Development (all-in-one)
```bash
# Terminal 1: API
uvicorn main:app --reload --port 8000

# Terminal 2: Scraper worker
celery -A celery_worker worker --loglevel=info -Q scrape -c 8

# Terminal 3: Pipeline worker
celery -A celery_worker worker --loglevel=info -Q pipeline -c 4

# Terminal 4: Beat scheduler
celery -A celery_worker beat --loglevel=info
```

### Production (Docker)
```bash
# From /obi root:
docker-compose up -d intelligence-api celery-scraper celery-pipeline celery-beat

# With monitoring:
docker-compose --profile tools up -d flower
```

## 7. API endpoints

| Endpoint | Description |
|---|---|
| `GET /api/v1/articles` | List articles (filterable by status, category, operator, relevance) |
| `GET /api/v1/pipeline/stats` | Pipeline stage counts and performance |
| `GET /api/v1/pipeline/scrape-logs` | Recent scrape logs with method/selector/timing |
| `GET /api/v1/pipeline/stuck-articles` | Articles stuck in pipeline |
| `POST /api/v1/pipeline/process-pending` | Manually trigger pending articles |
| `GET /api/v1/sources` | All configured sources |
| `POST /api/v1/sources/{id}/scrape` | Trigger scrape for one source |
| `POST /api/v1/sources/scrape-all` | Trigger all sources |
| `GET /api/v1/operators` | List operators/companies |
| `GET /api/v1/operators/{slug}/stats` | Operator stats (articles, sentiment, keywords) |
| `GET /api/v1/operators/{slug}/brief` | Daily operator brief |
| `GET /api/v1/dashboard/kpis` | KPIs (articles today, avg relevance, etc.) |

## 8. Monitoring (Flower)

```
http://localhost:5555
user: admin / pass: obi2025
```

## 9. Key tuning parameters (.env)

| Variable | Default | Effect |
|---|---|---|
| `MIN_OG_RELEVANCE_FOR_LLM` | 0.15 | Articles below this skip LLM classification |
| `MIN_OG_RELEVANCE_TO_STORE` | 0.05 | Articles below this are not stored at all |
| `AI_CONCURRENCY` | 4 | Parallel LLM calls per worker |
| `AI_RATE_LIMIT_DELAY_MS` | 500 | Delay between LLM calls (avoids rate limits) |
| `SCRAPE_CONCURRENCY` | 8 | Parallel scraping jobs |
| `ENABLE_PLAYWRIGHT` | true | Allow Playwright fallback for JS pages |
| `ENABLE_DEBUG_SCREENSHOTS` | false | Save screenshots on scrape for debugging |
