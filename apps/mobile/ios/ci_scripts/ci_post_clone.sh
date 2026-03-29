#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
IOS_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
MOBILE_ROOT="$(CDPATH= cd -- "$IOS_ROOT/.." && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$MOBILE_ROOT/../.." && pwd)"

export CI="${CI:-1}"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

if ! command -v bun >/dev/null 2>&1; then
  INSTALL_SCRIPT="$(mktemp)"
  trap 'rm -f "$INSTALL_SCRIPT"' EXIT
  curl -fsSL https://bun.sh/install -o "$INSTALL_SCRIPT"
  bash "$INSTALL_SCRIPT"
  rm -f "$INSTALL_SCRIPT"
  trap - EXIT
fi

if ! command -v node >/dev/null 2>&1; then
  export HOMEBREW_NO_AUTO_UPDATE=1
  brew install node@24
  export PATH="/opt/homebrew/opt/node@24/bin:/usr/local/opt/node@24/bin:$PATH"
fi

cd "$REPO_ROOT"
node -v
bun -v
bun install --frozen-lockfile
bun run build

cd "$MOBILE_ROOT"
node --no-warnings --eval "require('expo/bin/autolinking')" expo-modules-autolinking react-native-config --json --platform ios > /dev/null
bun x expo prebuild -p ios --clean
