# Changelog

All notable changes to the AMFA extension in this project will be documented in
this file. Upstream Keycloak Admin UI changes are not tracked here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Save stays disabled until the current configuration has loaded, so an early
  click can no longer overwrite the realm's settings with the form's defaults
- A group override without a group, or the same group picked twice in one
  signal, is now stopped with a clear message instead of failing the whole save

## [1.0.1] - 2026-09-22

### Added

- AMFA configuration pages in the Keycloak Admin UI
- Per-realm risk signal weights and thresholds editor
- Allow-list and deny-list management (country, IP, OS)
- Scoring mode selection (weight-based or log-odds Bayesian)
- Failure mode and fallback risk level configuration
- Authentication event history viewer
- SECURITY.md, CODE_OF_CONDUCT.md, and CONTRIBUTING.md

[1.0.1]: https://github.com/DefensePoint/keycloak-adaptive-mfa-admin-ui/releases/tag/v1.0.1
