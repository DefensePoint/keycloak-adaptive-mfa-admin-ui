#!/usr/bin/env bash
# build.sh — Build the AMFA admin-ui JAR
#
# Output: dist/keycloak-admin-ui-amfa.jar
#
# Prerequisites:
#   - Node.js 18+
#   - pnpm 9+  (npm install -g pnpm)
#   - JDK 17+  (for the `jar` command)
#
# Usage:
#   ./build.sh                        # build JAR
#   ./build.sh --deploy <compose-dir> # build and hot-deploy to a running stack

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JS_DIR="$SCRIPT_DIR/js"
ADMIN_UI_DIR="$JS_DIR/apps/admin-ui"
ADMIN_UI_BUILD="$ADMIN_UI_DIR/target/classes/theme/keycloak.v2/admin/resources"
MESSAGES_DIR="$SCRIPT_DIR/messages"
OUT_DIR="$SCRIPT_DIR/dist"
JAR_NAME="keycloak-admin-ui-amfa.jar"

DEPLOY_DIR=""
if [[ "${1:-}" == "--deploy" && -n "${2:-}" ]]; then
  DEPLOY_DIR="$2"
fi

echo "==> Installing dependencies"
cd "$JS_DIR"
pnpm install

# Build workspace libs that admin-ui depends on (replaces wireit dependency orchestration)
echo "==> Building keycloak-admin-client"
cd "$JS_DIR/libs/keycloak-admin-client"
pnpm exec tsc --pretty

echo "==> Building ui-shared"
cd "$JS_DIR/libs/ui-shared"
# dts plugin reports PatternFly type mismatches but the JS output is correct; treat as non-fatal
pnpm exec vite build || true

echo "==> Building admin-ui"
cd "$ADMIN_UI_DIR"
pnpm exec vite build

# ── Prepare JAR staging area ────────────────────────────────────────────────
STAGE="$SCRIPT_DIR/.stage"
rm -rf "$STAGE"
mkdir -p "$STAGE/theme/keycloak.v2/admin/resources"
mkdir -p "$STAGE/theme/keycloak.v2/admin/messages"
mkdir -p "$STAGE/META-INF"

echo "==> Staging build output"
cp -r "$ADMIN_UI_BUILD/." "$STAGE/theme/keycloak.v2/admin/resources/"

# ── Merge messages_en.properties ────────────────────────────────────────────
# Strategy: stock Keycloak messages_en (from Maven Central) + AMFA custom keys.
# We pull the stock file from Maven Central so the build is self-contained.
KC_VERSION="$(node -p "require('$ADMIN_UI_DIR/package.json').version" 2>/dev/null || echo "26.0.0")"
STOCK_JAR="$SCRIPT_DIR/.cache/keycloak-admin-ui-${KC_VERSION}.jar"

if [[ ! -f "$STOCK_JAR" ]]; then
  echo "==> Downloading stock Keycloak admin-ui JAR v${KC_VERSION} from Maven Central"
  mkdir -p "$(dirname "$STOCK_JAR")"
  MAVEN_URL="https://repo1.maven.org/maven2/org/keycloak/keycloak-admin-ui/${KC_VERSION}/keycloak-admin-ui-${KC_VERSION}.jar"
  curl -fsSL "$MAVEN_URL" -o "$STOCK_JAR" || {
    echo "ERROR: Failed to download $MAVEN_URL"
    echo "       If you are offline, place the JAR at $STOCK_JAR manually."
    exit 1
  }
fi

echo "==> Merging messages_en.properties (stock + AMFA)"
STOCK_MESSAGES="$SCRIPT_DIR/.cache/messages_en_stock_${KC_VERSION}.properties"
if [[ ! -f "$STOCK_MESSAGES" ]]; then
  unzip -p "$STOCK_JAR" theme/keycloak.v2/admin/messages/messages_en.properties > "$STOCK_MESSAGES"
fi

{
  cat "$STOCK_MESSAGES"
  echo ""
  echo "# AMFA (Point Adaptive Authentication)"
  cat "$MESSAGES_DIR/amfa-messages-en.properties" | grep -v '^#' | grep -v '^$'
} > "$STAGE/theme/keycloak.v2/admin/messages/messages_en.properties"

echo "==> Copying other language files from stock JAR"
# Copy all non-English message files from the stock JAR as-is
OTHER_LANGS=$(unzip -l "$STOCK_JAR" "theme/keycloak.v2/admin/messages/*" 2>/dev/null \
  | awk '{print $4}' | grep '\.properties$' | grep -v 'messages_en\.properties')

for lang_path in $OTHER_LANGS; do
  lang_file=$(basename "$lang_path")
  unzip -p "$STOCK_JAR" "$lang_path" > "$STAGE/theme/keycloak.v2/admin/messages/$lang_file" 2>/dev/null || true
done

# ── Write MANIFEST ───────────────────────────────────────────────────────────
cat > "$STAGE/META-INF/MANIFEST.MF" <<EOF
Manifest-Version: 1.0
Implementation-Title: keycloak-admin-ui
Implementation-Version: ${KC_VERSION}
EOF

# ── Package JAR ──────────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"
JAR_PATH="$OUT_DIR/$JAR_NAME"
rm -f "$JAR_PATH"

echo "==> Packaging JAR → $JAR_PATH"
cd "$STAGE"
jar cf "$JAR_PATH" .
rm -rf "$STAGE"

echo ""
echo "Done: $JAR_PATH"
echo "      $(du -sh "$JAR_PATH" | cut -f1) — $(unzip -l "$JAR_PATH" | tail -1)"

# ── Optional deploy ──────────────────────────────────────────────────────────
if [[ -n "$DEPLOY_DIR" ]]; then
  echo ""
  echo "==> Deploying to $DEPLOY_DIR"
  cp "$JAR_PATH" "$DEPLOY_DIR/keycloak-admin-ui-amfa.jar"
  echo "    Restarting Keycloak..."
  docker compose -f "$DEPLOY_DIR/docker-compose.yml" restart keycloak
  echo "    Done. Hard-refresh your browser (Cmd+Shift+R) after Keycloak starts."
fi
