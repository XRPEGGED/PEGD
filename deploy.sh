#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
npx wrangler pages deploy . --project-name pegd --branch main