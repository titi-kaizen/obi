from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/obi"
    database_url_sync: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/obi"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # Supabase (optional — direct DB access preferred)
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # AI
    groq_api_key: str = ""
    anthropic_api_key: str = ""
    preferred_ai_provider: str = "groq"  # groq | anthropic

    # Scraping
    scrape_concurrency: int = 8
    scrape_timeout_seconds: int = 25
    playwright_timeout_ms: int = 20000
    enable_playwright: bool = True
    enable_debug_screenshots: bool = False
    screenshots_dir: str = "/tmp/obi_screenshots"

    # Pipeline
    min_og_relevance_for_llm: float = 0.15
    min_og_relevance_to_store: float = 0.05
    ai_concurrency: int = 4
    ai_rate_limit_delay_ms: int = 500  # 500ms between LLM calls

    # App
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:3000", "https://*.vercel.app"]
    debug: bool = False
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
