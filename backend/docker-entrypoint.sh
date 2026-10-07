#!/bin/sh
set -e

python manage.py migrate --noinput

if [ "${SEED_DEMO_USERS:-false}" = "true" ]; then
  python manage.py seed_demo
fi

exec "$@"
