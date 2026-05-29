"""
Celery worker entry point.

Usage:
  # Default worker (scrape + pipeline queues)
  celery -A celery_worker worker --loglevel=info -Q scrape,pipeline -c 4

  # Pipeline only (AI classification, higher concurrency safe)
  celery -A celery_worker worker --loglevel=info -Q pipeline -c 4

  # Scrape only
  celery -A celery_worker worker --loglevel=info -Q scrape -c 8

  # Beat scheduler
  celery -A celery_worker beat --loglevel=info
"""
from app.workers.celery_app import celery_app

if __name__ == "__main__":
    celery_app.start()
