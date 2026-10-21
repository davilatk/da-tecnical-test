#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

i=0
while [ "$i" -lt 30 ]; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 2
done

docker info >/dev/null

cp -n .env.example .env
docker compose up -d --build --wait
docker compose exec -T ai-agent-service python -m app.scripts.seed_knowledge
