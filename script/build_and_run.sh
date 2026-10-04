#!/usr/bin/env bash
set -euo pipefail

NRFI_MODE="${1:-run}"
NRFI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NRFI_BUILD_ROOT="${NRFI_BUILD_ROOT:-${TMPDIR:-/tmp}nrfi-local-build}"
NRFI_APP_NAME="No Reel For Instagram"
NRFI_APP_BUNDLE="$NRFI_BUILD_ROOT/Build/Products/Debug/$NRFI_APP_NAME.app"

case "$NRFI_MODE" in
    run|--build-only|--debug|--logs|--telemetry|--verify) ;;
    *) echo "usage: $0 [run|--build-only|--debug|--logs|--telemetry|--verify]" >&2; exit 2 ;;
esac

if [[ "$NRFI_MODE" != "--build-only" ]]; then
    pkill -x "$NRFI_APP_NAME" >/dev/null 2>&1 || true
fi

xcodebuild -project "$NRFI_ROOT/No Reel For Instagram.xcodeproj" \
    -scheme "No Reel For Instagram (macOS)" \
    -configuration Debug -destination "platform=macOS" \
    -derivedDataPath "$NRFI_BUILD_ROOT" \
    MARKETING_VERSION=1.0.8 CURRENT_PROJECT_VERSION=18 \
    MACOSX_DEPLOYMENT_TARGET=12.0 build

case "$NRFI_MODE" in
    --build-only) printf '%s\n' "$NRFI_APP_BUNDLE" ;;
    --debug) lldb -- "$NRFI_APP_BUNDLE/Contents/MacOS/$NRFI_APP_NAME" ;;
    run) /usr/bin/open -n "$NRFI_APP_BUNDLE" ;;
    --verify)
        /usr/bin/open -n "$NRFI_APP_BUNDLE"
        sleep 1
        pgrep -x "$NRFI_APP_NAME" >/dev/null
        ;;
    --logs|--telemetry)
        /usr/bin/open -n "$NRFI_APP_BUNDLE"
        /usr/bin/log stream --info --style compact --predicate \
            'process == "No Reel For Instagram" OR subsystem == "com.guillaumeclaverie.No-Reel-For-Instagram"'
        ;;
esac
