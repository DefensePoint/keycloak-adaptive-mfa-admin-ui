# Keycloak Admin UI — AMFA Extension

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A fork of the Keycloak Admin UI that adds Adaptive MFA configuration pages to the Keycloak admin console. It builds into a JAR that is mounted over Keycloak's built-in admin UI JAR, replacing it entirely.

This is one of three repositories that make up the full AMFA system:

| Repository | Language | Role |
|---|---|---|
| [keycloak-adaptive-mfa-engine](https://github.com/DefensePoint/keycloak-adaptive-mfa-engine) | Python | Risk evaluation engine + Docker Compose stack |
| [keycloak-adaptive-mfa](https://github.com/DefensePoint/keycloak-adaptive-mfa) | Java | Keycloak SPI plugin — authenticator that calls the engine |
| [**keycloak-adaptive-mfa-admin-ui**](https://github.com/DefensePoint/keycloak-adaptive-mfa-admin-ui) (this repo) | TypeScript | Keycloak Admin UI extension — AMFA configuration pages |

## What this repo adds

The AMFA pages live under `js/apps/admin-ui/src/amfa/` and surface in the Keycloak
admin console under **Realm Settings → Security Defenses → Adaptive MFA**:

- **Adaptive MFA settings** — configure the engine endpoint, fallback risk level, signal
  weights, allow/deny lists, and event expiration per realm
- **AMFA Events** — view and clear the stored authentication events for a realm

Custom i18n keys are defined in `messages/amfa-messages-en.properties` and merged on top
of the stock Keycloak messages during build.

## Prerequisites

- **Node.js 18+**
- **pnpm 9+**
- **JDK 17+** — for the `jar` command used to package the output

Install on macOS with Homebrew:

```bash
# Node.js (if not already installed)
brew install node

# pnpm
npm install -g pnpm

# JDK 17
brew install openjdk@17
echo 'export JAVA_HOME="/opt/homebrew/opt/openjdk@17"' >> ~/.bash_profile
echo 'export PATH="$JAVA_HOME/bin:$PATH"' >> ~/.bash_profile
source ~/.bash_profile
```

## Building

```bash
./build.sh
# Output: dist/keycloak-admin-ui-amfa.jar
```

The build script:
1. Installs pnpm workspace dependencies
2. Builds `keycloak-admin-client` and `ui-shared` libraries
3. Builds the `admin-ui` app with Vite
4. Downloads the stock Keycloak admin UI JAR from Maven Central (cached in `.cache/`)
5. Merges AMFA i18n keys on top of the stock English messages
6. Packages everything into a single JAR

### First-time pnpm setup

Before building for the first time, make sure `pnpm-workspace.yaml` has build scripts
enabled for the native dependencies:

```yaml
allowBuilds:
  '@swc/core': true
  esbuild: true
```

This is already set in the repo. If pnpm blocks with `ERR_PNPM_IGNORED_BUILDS`, run:

```bash
cd js
pnpm approve-builds
```

### Deploying to the running stack

To build and hot-deploy into the `keycloak-adaptive-mfa-engine` Docker stack in one step:

```bash
./build.sh --deploy ../keycloak-adaptive-mfa-engine/config/keycloak/
```

This copies the JAR and restarts Keycloak automatically.

To deploy manually:

```bash
cp dist/keycloak-admin-ui-amfa.jar ../keycloak-adaptive-mfa-engine/config/keycloak/keycloak-admin-ui-amfa.jar
docker compose -f ../keycloak-adaptive-mfa-engine/config/keycloak/docker-compose.yml restart keycloak
```

## Project Structure

```
build.sh                        Main build script
messages/
  amfa-messages-en.properties   AMFA-specific i18n keys (merged into the JAR)
js/
  pnpm-workspace.yaml           pnpm workspace config
  apps/
    admin-ui/                   Keycloak Admin UI app (fork of keycloak/keycloak)
      src/amfa/                 AMFA-specific pages and components
        pages/AdaptiveMFA/      Adaptive MFA settings page
        components/             Shared AMFA UI components
  libs/
    keycloak-admin-client/      Keycloak Admin REST client
    ui-shared/                  Shared UI components
    keycloak-js/                Keycloak JS adapter
dist/
  keycloak-admin-ui-amfa.jar    Build output
```

## Running Tests

```bash
cd js/apps/admin-ui
pnpm test
```

## Related Projects

- [keycloak-adaptive-mfa-engine](https://github.com/DefensePoint/keycloak-adaptive-mfa-engine) — Python risk engine
- [keycloak-adaptive-mfa](https://github.com/DefensePoint/keycloak-adaptive-mfa) — Keycloak SPI

## License

Apache-2.0 — see [LICENSE](LICENSE).
