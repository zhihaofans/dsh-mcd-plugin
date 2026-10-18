#!/usr/bin/env bash
# Set MCD_MCP_TOKEN for GUI apps on macOS without writing it to a config file.
#
# `cordis.patch.yml` reads process.env at mount time, so the variable must be
# present when DeepSeek Harness starts. This helper puts it in the launchd
# environment with a hidden prompt; the value is not written to disk by this
# script. It is still readable by processes running as the same user, so treat
# it as a convenience, not a vault.
set -euo pipefail

if [[ "${1:-}" == "--unset" ]]; then
  launchctl unsetenv MCD_MCP_TOKEN
  echo "Unset MCD_MCP_TOKEN. Restart DeepSeek Harness."
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This helper is for macOS GUI launches. Elsewhere, export MCD_MCP_TOKEN in the shell that starts DSH." >&2
  exit 2
fi

printf 'MCD_MCP_TOKEN (input hidden): '
IFS= read -r -s token
printf '\n'

if [[ -z "${token}" ]]; then
  echo "Empty token; nothing changed." >&2
  exit 1
fi

launchctl setenv MCD_MCP_TOKEN "$token"
unset token

echo "MCD_MCP_TOKEN is set in the launchd environment."
echo "Quit DeepSeek Harness completely, reopen it, then start a new session."
