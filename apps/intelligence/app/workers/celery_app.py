from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "obi_intelligence",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.scrape_tasks",
        "app.workers.pipeline_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Argentina/Buenos_Aires",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=120,
    task_time_limit=180,
    result_expires=86400,

    # Queues
    task_default_queue="default",
    task_queues={
        "scrape": {"exchange": "scrape", "routing_key": "scrape"},
        "pipeline": {"exchange": "pipeline", "routing_key": "pipeline"},
        "briefs": {"exchange": "briefs", "routing_key": "briefs"},
    },
    task_routes={
        "app.workers.scrape_tasks.*": {"queue": "scrape"},
        "app.workers.pipeline_tasks.*": {"queue": "pipeline"},
    },

    # Retry defaults
    task_max_retries=3,
    task_default_retry_delay=30,

    # Beat schedule — periodic scraping
    beat_schedule={
        "scrape-all-priority-sources": {
            "task": "app.workers.scrape_tasks.scrape_all_sources",
            "schedule": crontab(minute="*/30"),
            "kwargs": {"priority_only": True},
        },
        "scrape-all-sources-hourly": {
            "task": "app.workers.scrape_tasks.scrape_all_sources",
            "schedule": crontab(minute="5"),
            "kwargs": {"priority_only": False},
        },
        "generate-operator-briefs": {
            "task": "app.workers.pipeline_tasks.generate_all_operator_briefs",
            "schedule": crontab(hour="7", minute="0"),
        },
        "retry-stuck-articles": {
            "task": "app.workers.pipeline_tasks.retry_stuck_articles",
            "schedule": crontab(minute="*/15"),
        },
    },
)
