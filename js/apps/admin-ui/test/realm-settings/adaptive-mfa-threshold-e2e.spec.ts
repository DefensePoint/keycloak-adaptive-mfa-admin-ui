import { expect, test } from "@playwright/test";
import { v4 as uuid } from "uuid";
import adminClient from "../utils/AdminClient.ts";
import { switchOn } from "../utils/form.ts";
import { login } from "../utils/login.ts";
import { goToRealm, goToRealmSettings } from "../utils/sidebar.ts";
import { goToSecurityDefensesTab } from "./security-defenses.ts";
import { expandSignal } from "./adaptive-mfa.ts";

/**
 * FULL-STACK end-to-end test for the realm-level dormancy threshold.
 *
 * Nothing is mocked. A value typed into the admin console travels through the
 * Keycloak SPI to the AMFA engine, into the engine's database, and back out
 * again on reload. That is the hop chain a sibling feature (the geolocation
 * white/blacklist) once broke silently: each layer looked correct in isolation
 * while the value was quietly dropped between them.
 *
 * Contrast with adaptive-mfa-errors.spec.ts, which stubs every AMFA endpoint to
 * reproduce HTTP failures deterministically. That one proves the UI reacts
 * correctly to a response; this one proves the response chain exists at all.
 *
 * REQUIRES a running AMFA engine reachable from Keycloak. If the engine is down
 * the first save fails and this test fails loudly, which is the correct outcome:
 * "the threshold round-trips" cannot be confirmed without the backend.
 *
 * Runs against a throwaway realm that is created and deleted here, so it can
 * never damage a real realm's configuration.
 */

/** Copied from a known-working realm; see docs/keycloak-setup.md. Without all
 * three of these the AMFA page fails with 403/500, because the engine refuses
 * tokens it cannot verify and cannot be reached under a hostname the browser
 * also resolves. */
const ENGINE_URL = "http://adaptive_auth";
const KEYCLOAK_INTERNAL_URL = "http://keycloak:8080";
const AMFA_CLIENT_ID = "adaptive-auth-api";

const REALM_THRESHOLD = "90";

test.describe.serial("Adaptive MFA dormancy threshold (full stack)", () => {
  const realmName = `amfa-threshold-e2e-${uuid()}`;

  test.beforeAll(async () => {
    await adminClient.createRealm(realmName, {
      enabled: true,
      // The engine validates the token issuer and must be able to reach
      // Keycloak at it, so the browser-facing and engine-facing hostnames
      // have to agree.
      attributes: {
        frontendUrl: KEYCLOAK_INTERNAL_URL,
        adaptiveAuthEndpoint: ENGINE_URL,
      },
    });

    // The SPI exchanges a service-account token with this client, and the engine
    // requires aud=amfa on it (OIDC_VERIFY_AUDIENCE defaults to true).
    await adminClient.createClient({
      realm: realmName,
      clientId: AMFA_CLIENT_ID,
      publicClient: false,
      serviceAccountsEnabled: true,
      protocolMappers: [
        {
          name: "amfa-audience",
          protocol: "openid-connect",
          protocolMapper: "oidc-audience-mapper",
          consentRequired: false,
          config: {
            "included.custom.audience": "amfa",
            "access.token.claim": "true",
            "id.token.claim": "false",
          },
        },
      ],
    });
  });

  test.afterAll(() => adminClient.deleteRealm(realmName));

  async function goToAdaptiveMfa(page: any) {
    await login(page);
    await goToRealm(page, realmName);
    await goToRealmSettings(page);
    await goToSecurityDefensesTab(page);
    await page.getByRole("tab", { name: "Adaptive MFA" }).click();
    // The form body, Save included, is gated behind this toggle. Idempotent
    // because a successful save persists it on the realm.
    const toggle = page.locator("#adaptiveToggle");
    if (!(await toggle.isChecked())) {
      await switchOn(page, toggle);
    }
  }

  const daysField = (page: any) => page.locator("#inActiveAcc-days");
  const saveButton = (page: any) => page.getByTestId("amfa-save");


  test("the threshold survives a save and reload through the whole stack", async ({
    page,
  }) => {
    await goToAdaptiveMfa(page);
    await expandSignal(page, "inActiveAcc");

    // Proves the read path first: the engine fills the effective value, so this
    // is never blank even though the realm has never stored a threshold.
    await expect(daysField(page)).not.toHaveValue("");

    await daysField(page).fill(REALM_THRESHOLD);

    // Save must be enabled: the guard disables it when the load failed, so a
    // clickable Save is itself evidence the config loaded.
    await expect(saveButton(page)).toBeEnabled();
    await saveButton(page).click();
    await expect(page.getByTestId("last-alert")).toContainText(
      "All the data are saved",
    );

    // Reload from scratch. Anything that drops the value between the UI, the
    // SPI's DTO, the engine's schema and the database shows up here.
    await page.reload();
    await goToSecurityDefensesTab(page);
    await page.getByRole("tab", { name: "Adaptive MFA" }).click();
    await expandSignal(page, "inActiveAcc");

    await expect(daysField(page)).toHaveValue(REALM_THRESHOLD);
  });

  test("the engine really stored it, not just the browser", async () => {
    // Read back through the SPI with an independent client, so a value cached
    // in the page cannot make this pass.
    const realm = await adminClient.getRealm(realmName);
    expect(realm?.attributes?.adaptiveAuthEndpoint).toBe(ENGINE_URL);

    // The settings endpoint is the same one the SPI proxies to the engine.
    const response = await fetch(
      `http://localhost:8080/realms/${realmName}/amfa-api/fetchAdaptiveMFAParameters`,
      { headers: await authHeader() },
    );
    expect(response.ok).toBe(true);

    const rows = (await response.json()) as any[];
    const dormancy = rows.filter((r) => r.parameter_name === "inactive_account");
    expect(dormancy.length).toBeGreaterThan(0);

    const defaultRow = dormancy.find(
      (r) => (r.group_id ?? "default") === "default",
    );
    expect(String(defaultRow.inactive_days)).toBe(REALM_THRESHOLD);
  });

  test("a group override carries no threshold of its own", async () => {
    // The realm-level invariant, checked in the persisted data rather than the
    // rendered form: only the default row may carry inactive_days.
    const response = await fetch(
      `http://localhost:8080/realms/${realmName}/amfa-api/fetchAdaptiveMFAParameters`,
      { headers: await authHeader() },
    );
    const rows = (await response.json()) as any[];

    const overrides = rows.filter(
      (r) =>
        r.parameter_name === "inactive_account" &&
        (r.group_id ?? "default") !== "default",
    );
    for (const row of overrides) {
      expect(row.inactive_days ?? null).toBeNull();
    }
  });
});

/** A master-realm admin bearer token, for reading back independently of the page. */
async function authHeader(): Promise<Record<string, string>> {
  const response = await fetch(
    "http://localhost:8080/realms/master/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "admin-cli",
        username: "admin",
        password: "admin",
        grant_type: "password",
      }),
    },
  );
  const { access_token } = await response.json();
  return { Authorization: `Bearer ${access_token}` };
}
