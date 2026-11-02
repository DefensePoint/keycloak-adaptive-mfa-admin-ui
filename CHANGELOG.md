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
- Keycloak's own pages keep their original texts for "IP address",
  "Expiration", "Local" and "Save events"; the AMFA strings no longer
  replace them
- A Save applies as a whole or not at all: when a later write fails, the
  earlier ones are put back, and the message says what, if anything, stayed
  saved. Invalid scoring thresholds or bias are refused before anything is
  written, and a write that fails once is retried
- The scoring config is only written when it changed, so a Save uses fewer of
  the engine's config writes
- A save refused by the engine's config write limit gets a plain message
  instead of the raw engine response
- A save keeps writing to the realm it started in, even if the admin switches
  realms before it finishes
- Save is disabled while a save runs, so a double click can no longer start a
  second save that undoes the first
- Bias and thresholds are only checked and sent from their fields in bayesian
  mode, where those fields are shown; other modes keep the stored values
- A bias that is not a number is refused instead of being saved as "not set"
- When the engine did not confirm a write, the message no longer claims that
  nothing was changed
- The save messages can be translated

### Removed

- Unused strings for per-signal weight labels and for an event history viewer
  this project does not include

## [1.0.1] - 2026-09-22

### Added

- AMFA configuration pages in the Keycloak Admin UI
- Per-realm risk signal weights and thresholds editor
- Allow-list and deny-list management (country, IP, OS)
- Scoring mode selection (weight-based or log-odds Bayesian)
- Failure mode and fallback risk level configuration
- SECURITY.md, CODE_OF_CONDUCT.md, and CONTRIBUTING.md

[1.0.1]: https://github.com/DefensePoint/keycloak-adaptive-mfa-admin-ui/releases/tag/v1.0.1
