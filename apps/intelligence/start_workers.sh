#!/bin/bash
# Combined Celery worker + beat scheduler for single-service deployment

set -e

echo "Starting Celery workers (scrape + pipeline queues)..."
celery -A celery_worker worker \
  --loglevel=info \
  -Q scrape,pipeline \
  -c 6 \
  --without-heartbeat &

WORKER_PID=$!
echo "Worker PID: $WORKER_PID"

echo "Starting Celery beat scheduler..."
celery -A celery_worker beat --loglevel=info &

BEAT_PID=$!
echo "Beat PID: $BEAT_PID"

# Wait for either process to exit
wait -n $WORKER_PID $BEAT_PID
echo "A process exited — shutting down..."
kill $WORKER_PID $BEAT_PID 2>/dev/null
