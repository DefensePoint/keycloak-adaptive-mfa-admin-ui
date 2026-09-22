import { expect, type Page, type Route } from "@playwright/test";
import { switchOn } from "../utils/form.ts";
import { login } from "../utils/login.ts";
import { goToRealm, goToRealmSettings } from "../utils/sidebar.ts";
import { goToSecurityDefensesTab } from "./security-defenses.ts";

/**
 * Shared helpers for the Adaptive MFA specs.
 *
 * The AMFA endpoints are stubbed rather than hit for real, so the specs can
 * reproduce HTTP failures deterministically and, more importantly, can never
 * write to a real configuration. The full-stack counterpart that deliberately
 * mocks nothing is adaptive-mfa-threshold-e2e.spec.ts.
 */

export const SETTINGS_GET = "**/amfa-api/fetchAdaptiveMFAParameters";
export const SETTINGS_PUT = "**/amfa-api/updateAdaptiveMFAParameters";
export const SCORING_GET = "**/amfa-api/fetchScoringConfig";
export const SCORING_PUT = "**/amfa-api/updateScoringConfig";
export const GROUPS = "**/amfa-api/groups";
export const COUNTRIES = "**/amfa-api/countries";

export const ENGINE_DOWN_BODY = JSON.stringify({
  error: "AMFA engine unreachable: adaptive_auth:80 failed to respond",
});

/** The engine's GET fills an effective threshold, so this is never absent. */
export const EFFECTIVE_DAYS = 40;

/** A realistic parameter set: one weighted signal plus the dormancy signal. */
export function parameters(realm: string) {
  return [
    {
      realm_id: realm,
      group_id: "default",
      parameter_name: "client",
      weight: 3,
      disabled: false,
      whitelist: null,
      blacklist: null,
    },
    {
      realm_id: realm,
      group_id: "default",
      parameter_name: "inactive_account",
      weight: 3,
      disabled: false,
      whitelist: null,
      blacklist: null,
      inactive_days: EFFECTIVE_DAYS,
    },
  ];
}

type Response = { status: number; body: string };

export type Stubs = {
  realm: string;
  settingsGet?: Response;
  settingsPut?: Response;
  scoringGet?: Response;
  scoringPut?: Response;
  /** Receives the parsed body of each save, for asserting what the UI sends. */
  onSave?: (payload: any) => void;
};

/**
 * Stub every AMFA endpoint. Defaults are all-healthy, so a caller only has to
 * describe the one thing it wants to go wrong.
 */
export async function stubAmfa(page: Page, stubs: Stubs) {
  const json = (r: Response) => ({
    status: r.status,
    contentType: "application/json",
    body: r.body,
  });

  const settingsGet =
    stubs.settingsGet ?? {
      status: 200,
      body: JSON.stringify(parameters(stubs.realm)),
    };
  const settingsPut = stubs.settingsPut ?? { status: 200, body: '"success"' };
  const scoringGet =
    stubs.scoringGet ?? { status: 200, body: JSON.stringify({ mode: "weight" }) };
  const scoringPut = stubs.scoringPut ?? { status: 200, body: '"success"' };

  // Lookup lists: always healthy, never under test here.
  await page.route(GROUPS, (r: Route) => r.fulfill(json({ status: 200, body: "[]" })));
  await page.route(COUNTRIES, (r: Route) =>
    r.fulfill(json({ status: 200, body: "[]" })),
  );

  await page.route(SETTINGS_GET, (r: Route) => r.fulfill(json(settingsGet)));
  await page.route(SCORING_GET, (r: Route) => r.fulfill(json(scoringGet)));
  await page.route(SETTINGS_PUT, (r: Route) => {
    if (stubs.onSave) {
      try {
        stubs.onSave(JSON.parse(r.request().postData() ?? "{}"));
      } catch {
        stubs.onSave(null);
      }
    }
    return r.fulfill(json(settingsPut));
  });
  await page.route(SCORING_PUT, (r: Route) => r.fulfill(json(scoringPut)));
}

export async function goToAdaptiveMfa(page: Page, realm: string) {
  await login(page);
  await goToRealm(page, realm);
  await goToRealmSettings(page);
  await goToSecurityDefensesTab(page);
  await page.getByRole("tab", { name: "Adaptive MFA" }).click();
  // The whole form body, Save included, is gated behind this toggle, and a
  // fresh realm renders it off. Must be idempotent: a successful save persists
  // adaptiveToggle=true through the Keycloak admin API, which is deliberately
  // not stubbed, so blindly force-clicking would switch it back off.
  const toggle = page.locator("#adaptiveToggle");
  if (!(await toggle.isChecked())) {
    await switchOn(page, toggle);
  }
  await expect(toggle).toBeChecked();
}

/**
 * Open a signal's expandable row; its fields only mount once expanded.
 *
 * Takes the signal KEY (e.g. "inActiveAcc", "geoLoc") and uses the toggle's
 * stable `expandId`. Matching on the visible row name is fragile here because
 * "Geolocation" is a prefix of "Geolocation Cluster".
 */
export async function expandSignal(page: Page, signalKey: string) {
  // PatternFly renders the toggle id as `${expandId}${rowIndex}`, e.g.
  // "inActiveAcc-expand5", so match on the prefix rather than the row's
  // position, which shifts whenever a signal is added or reordered.
  await page.locator(`[id^="${signalKey}-expand"]`).click();
}

export const alert = (page: Page) => page.getByTestId("last-alert");
export const saveButton = (page: Page) => page.getByTestId("amfa-save");
export const blockedNotice = (page: Page) => page.getByTestId("amfa-save-blocked");
export const daysField = (page: Page) => page.locator("#inActiveAcc-days");

/** The `inactive_account` row the UI sent for the realm/default scope. */
export function savedDormancyRow(payload: any) {
  return payload?.parameters?.find(
    (p: any) =>
      p.parameter_name === "inactive_account" &&
      (p.group_id ?? "default") === "default",
  );
}
