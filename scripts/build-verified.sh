#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec bash "${script_dir}/sites-env.sh" -- bash "${script_dir}/build-verified.sh" "$@"
fi

# Vercel expects the native Next.js Build Output API artifacts in `.next`.
# ChatGPT Sites uses vinext to produce its Cloudflare Worker bundle instead.
if [[ "${VERCEL:-}" == "1" ]]; then
  next_bin="${SITES_PROJECT_ROOT}/node_modules/.bin/next"
  if [[ ! -x "${next_bin}" ]]; then
    echo "Next.js is unavailable. Install dependencies before building." >&2
    exit 69
  fi
  echo "Running native Next.js build for Vercel..."
  exec "${next_bin}" build
fi

command -v timeout >/dev/null || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${vinext}" build

bash "${script_dir}/validate-artifact.sh"
