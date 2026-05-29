"""
OBI Intelligence — FastAPI Backend
Oil & Gas Argentina Intelligence Platform
"""
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import engine, Base
from app.api.router import api_router

settings = get_settings()

structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(
        {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40}.get(settings.log_level, 20)
    ),
)

log = structlog.get_logger(__name__)

app = FastAPI(
    title="OBI Intelligence API",
    description="Oil & Gas Argentina — Intelligence & News Pipeline",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("obi_intelligence_started", version="2.0.0")


@app.on_event("shutdown")
async def shutdown():
    await engine.dispose()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "obi-intelligence"}


@app.get("/")
async def root():
    return {
        "service": "OBI Intelligence",
        "version": "2.0.0",
        "docs": "/docs",
    }


app.include_router(api_router, prefix=settings.api_prefix)
