# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Report security issues by emailing **security@defensepoint.com**. Include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

We will acknowledge receipt within 48 hours and aim to release a fix within 14 days for critical issues.

## Scope

This extension is a fork of the Keycloak Admin UI and is mounted over
Keycloak's built-in admin UI, replacing it. A flaw here therefore reaches the
whole admin console, not only the Adaptive MFA pages. When reporting, it helps
to say which trust boundary is involved:

- The admin console session and the realm-administrator privileges it carries
- The Adaptive MFA configuration the pages write, including the engine endpoint
  and the fallback risk level applied when the engine cannot be reached
- Rendering of values that originate outside the console, such as realm and
  client configuration, where they reach the page unescaped
- Divergence from the upstream Keycloak Admin UI this fork is based on,
  including upstream security fixes not yet carried across
