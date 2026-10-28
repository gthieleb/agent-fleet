#!/bin/sh
# Worker image smoke test. Container runtimes are optional on the dev host:
# without podman/docker the test reports SKIPPED (exit 3); CI and the E2E env run it for real.
set -eu
cd "$(dirname "$0")"

RUNTIME=""
if command -v podman >/dev/null 2>&1; then RUNTIME=podman
elif command -v docker >/dev/null 2>&1; then RUNTIME=docker
fi

if [ -z "$RUNTIME" ]; then
  echo "SKIPPED: neither podman nor docker available — smoke test runs in CI / E2E environment"
  exit 3
fi

IMAGE=agent-fleet-worker:smoke
NAME=agent-fleet-worker-smoke
PORT=14096
PASSWORD=smoke-test-password

cleanup() { $RUNTIME rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

$RUNTIME build -t "$IMAGE" .
$RUNTIME run -d --name "$NAME" -e OPENCODE_PASSWORD="$PASSWORD" -p "$PORT:4096" "$IMAGE"

i=0
until curl -fsS -u "opencode:$PASSWORD" "http://127.0.0.1:$PORT/api/info" > /tmp/worker-info.json 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then echo "FAIL: /api/info not reachable after 60s"; exit 1; fi
  sleep 1
done

grep -q '"2\.2' /tmp/worker-info.json || { echo "FAIL: server version is not 2.2.x:"; cat /tmp/worker-info.json; exit 1; }
echo "PASS: worker serves /api/info with opencode 2.2.x"
