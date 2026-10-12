#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/test-assertions.XXXXXX")" && pwd -P)
cleanup() {
  rm -rf "$fixture"
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture/scripts"
run_check() {
  TEST_ASSERTIONS_ROOT="$fixture" bash "$project_root/scripts/check-test-assertions.sh"
}

# Explicit assertions pass.
printf '[[ -n "$x" ]] || exit 1\nif grep -q a b; then exit 1; fi\n' >"$fixture/scripts/test-ok.sh"
run_check >/dev/null

# A bare [[ ]] assertion is rejected.
printf '[[ -n "$x" ]]\n' >"$fixture/scripts/test-bare.sh"
if run_check >/dev/null 2>&1; then exit 1; fi
rm "$fixture/scripts/test-bare.sh"

# A negated command assertion is rejected.
printf '! grep -q a b\n' >"$fixture/scripts/test-negated.sh"
if run_check >/dev/null 2>&1; then exit 1; fi

printf 'test-test-assertions: pass\n'
