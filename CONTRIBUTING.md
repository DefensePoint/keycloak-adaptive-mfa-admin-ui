# Contributing to Keycloak Adaptive MFA Admin UI

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository and create a branch from `main`.
2. Follow the setup instructions in the README to build the project locally.
3. Make your changes, add tests where applicable, and ensure all existing tests pass.
4. Open a pull request with a clear description of the change.

## Development Setup

```bash
# Build the admin UI JAR
./build.sh

# Build and deploy into the running Docker stack in one step
./build.sh --deploy ../keycloak-adaptive-mfa-engine/config/keycloak/
```

See the README for first-time pnpm setup instructions.

## Running Tests

```bash
cd js/apps/admin-ui
pnpm test
```

## Code Style

- TypeScript + React, built with Vite
- pnpm workspace with `keycloak-admin-client`, `keycloak-js`, `ui-shared`, and `admin-ui`
- AMFA-specific pages live in `js/apps/admin-ui/src/amfa/`
- Custom i18n keys go in `messages/amfa-messages-en.properties`

## Pull Request Guidelines

- Keep pull requests focused on a single concern
- Include a test for any bug fix or new feature
- Update relevant documentation if behavior changes

## Developer Certificate of Origin (DCO)

This project requires a DCO sign-off on every commit. By signing off, you
certify that you wrote the change or otherwise have the right to submit it
under the project's open-source license.

Add a `Signed-off-by` line to each commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Git can do this automatically with `git commit -s`.

By signing off you agree to the
[Developer Certificate of Origin](https://developercertificate.org/).

## Reporting Issues

Open a GitHub issue with a clear description, steps to reproduce, and the
version you are running.
