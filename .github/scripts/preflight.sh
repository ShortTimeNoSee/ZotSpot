#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if [[ $(node --version) != v24.20.0 ]]; then
  echo "Node.js 24.20.0 is required" >&2
  exit 1
fi
if [[ $(pnpm --version) != 11.26.0 ]]; then
  echo "pnpm 11.26.0 is required" >&2
  exit 1
fi
if ! adb devices | grep -Eq '^emulator-[0-9]+[[:space:]]+device$'; then
  echo "Start an Android API 35 AOSP ATD x86_64 emulator before running preflight" >&2
  exit 1
fi
if [[ $(adb shell getprop ro.build.version.sdk | tr -d '\r') != 35 ]]; then
  echo "The Android emulator must run API 35" >&2
  exit 1
fi
if [[ $(adb shell getprop ro.product.name | tr -d '\r') != sdk_slim_x86_64 ]]; then
  echo "Use the AOSP ATD x86_64 system image used by CI" >&2
  exit 1
fi
if [[ $("$HOME/.maestro/bin/maestro" --version) != 2.10.0 ]]; then
  echo "Maestro 2.10.0 is required" >&2
  exit 1
fi

bash .github/scripts/web-checks.sh
pnpm build:android
bash .github/scripts/android-ui.sh
