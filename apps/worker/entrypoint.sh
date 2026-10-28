#!/bin/sh
set -eu

if [ -z "${OPENCODE_PASSWORD:-}" ]; then
  echo "FATAL: OPENCODE_PASSWORD is required (Basic auth, username 'opencode')" >&2
  exit 1
fi

mkdir -p "${HOME}/.local/share/opencode"

exec opencode serve --hostname 0.0.0.0 --port "${OPENCODE_PORT:-4096}"
