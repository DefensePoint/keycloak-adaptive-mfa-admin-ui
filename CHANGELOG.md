# Changelog

All notable changes to the AMFA extension in this project will be documented in
this file. Upstream Keycloak Admin UI changes are not tracked here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- An empty or blank row in the operating system or VPN / Proxy allow and
  deny lists (left by "Add value" or by clearing a row) is no longer saved as
  an empty entry, and an empty entry saved before no longer comes back as an
  empty row
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
- A signal the engine sends no row for, and a new group override, start at the
  engine's own default weight instead of Low
- An IP address that blocks a save stays marked on its allow or deny list,
  with the invalid entries named under it, until the next save
- The "Risk Classification" signal is now labelled "Event Cluster", and its
  help text says what it checks
- Save also waits for the realm's AMFA settings (endpoint, fallback risk,
  notifications), and stays blocked if they fail to load, so a save can no
  longer write the form's defaults over them

- AMFA can be switched off again: Save stays visible when the switch is
  off, and saving then only writes the realm's switch, so it also works while
  the engine is down. It is still blocked when the realm itself could not be
  read, as the switch then does not show the realm's real state. With the
  plugin's matching change, logins in a realm that has AMFA off continue as
  low risk and nothing is sent to the engine
- The Adaptive MFA tab loads only when it is opened, and makes no engine
  calls while AMFA is off or the realm has no engine endpoint, so a realm
  without AMFA set up, master included, no longer shows "Could not load"
  errors on the Security defenses tabs
- A realm without an engine endpoint can be set up from the page: with AMFA
  on, the page asks for the endpoint and saves it first, and the risk signals
  and scoring load once it is saved
- The switch is read as the plugin's login reads it: only an explicit
  `false` shows AMFA off, and a realm without the switch shows it on. Such a
  realm may have the AMFA step in its login and have lost its AMFA attributes
  to an admin REST update; its logins then step up at the fallback level, so
  the page shows it on and asks for the endpoint rather than showing it off.
  Ship it with the plugin release that has the same rule
- A save whose writes failed because Keycloak could not get its token for the
  engine says nothing was changed: the engine was never called
- The engine endpoint must be an http:// or https:// URL. A changed endpoint
  is saved on its own and the risk signals and scoring reload from it, so they
  are no longer written to the old engine, and a mistyped endpoint can be
  corrected even when loading from it failed
- A realm without a fallback risk level shows 3, the level the plugin's login
  uses when the engine cannot be reached, instead of 1, and a save keeps it.
  Before, any save of the page wrote 1, so logins during an engine outage went
  through as low risk instead of being stepped up. A stored level the login does
  not accept is shown as 3 too, and only a level from 1 to 4 can be saved

### Changed

- The Geolocation signal's country lists are labelled "Countries Allowlist"
  and "Countries Blocklist", as in the Point admin UI; they said
  "Countries Whitelist" and "Countries Blacklist"
- The IP address signal's description says allowlist and blocklist

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
