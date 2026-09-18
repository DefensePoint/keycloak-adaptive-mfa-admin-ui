import { expect, test } from "@playwright/test";
import { v4 as uuid } from "uuid";
import adminClient from "../utils/AdminClient.ts";
import {
  daysField,
  EFFECTIVE_DAYS,
  expandSignal,
  goToAdaptiveMfa,
  savedDormancyRow,
  saveButton,
  stubAmfa,
} from "./adaptive-mfa.ts";

/**
 * The "Inactive after (days)" field: what the UI SENDS, and where it renders.
 *
 * These assert the outgoing request body rather than re-reading a value after a
 * round trip, because the interesting logic is the payload shaping itself:
 *
 *   - clamped to a sane maximum, so an absurd number cannot overflow the SPI's
 *     Java `Integer` and make Jackson reject the whole save,
 *   - omitted entirely when it is empty, zero or negative, which is how "unset,
 *     use the server default" reaches the engine. A literal 0 would be a value
 *     the engine then has to defend against.
 *
 * Plus the two rendering rules that keep the field honest about being
 * realm-level: it must not appear in a group-override card, and the shared
 * "these lists apply to all users" hint must not appear for a signal that has no
 * lists and whose threshold a group override cannot change.
 */
test.describe.serial("Adaptive MFA threshold field", () => {
  const realmName = `adaptive-mfa-threshold-form-${uuid()}`;

  test.beforeAll(() => adminClient.createRealm(realmName));
  test.afterAll(() => adminClient.deleteRealm(realmName));

  /** Fill the days field, save, and return the row the UI put on the wire. */
  async function saveWithDays(page: any, value: string) {
    let payload: any = null;
    await stubAmfa(page, {
      realm: realmName,
      onSave: (p) => {
        payload = p;
      },
    });
    await goToAdaptiveMfa(page, realmName);
    await expandSignal(page, "inActiveAcc");

    await daysField(page).fill(value);
    await expect(saveButton(page)).toBeEnabled();
    await saveButton(page).click();

    await expect(page.getByTestId("last-alert")).toContainText(
      "All the data are saved",
    );
    return savedDormancyRow(payload);
  }

  test("a normal value is sent as typed", async ({ page }) => {
    const row = await saveWithDays(page, "90");
    expect(row.inactive_days).toBe(90);
  });

  test("an absurd value is clamped instead of overflowing the SPI", async ({
    page,
  }) => {
    // Unclamped this exceeds Java's Integer.MAX_VALUE, Jackson rejects the
    // payload, and the SPI never forwards the save.
    const row = await saveWithDays(page, "99999999999");
    expect(row.inactive_days).toBe(36500);
  });

  test("a value just over the maximum is clamped to it", async ({ page }) => {
    const row = await saveWithDays(page, "36501");
    expect(row.inactive_days).toBe(36500);
  });

  test("zero is omitted, not sent as a literal 0", async ({ page }) => {
    const row = await saveWithDays(page, "0");
    expect(row).toBeTruthy();
    expect("inactive_days" in row).toBe(false);
  });

  test("a negative value is omitted", async ({ page }) => {
    const row = await saveWithDays(page, "-5");
    expect("inactive_days" in row).toBe(false);
  });

  test("clearing the field omits it, meaning use the server default", async ({
    page,
  }) => {
    const row = await saveWithDays(page, "");
    expect("inactive_days" in row).toBe(false);
  });

  test("a fractional value is floored", async ({ page }) => {
    const row = await saveWithDays(page, "90.7");
    expect(row.inactive_days).toBe(90);
  });

  test("the field renders at realm scope only, never in a group override", async ({
    page,
  }) => {
    await stubAmfa(page, { realm: realmName });
    await goToAdaptiveMfa(page, realmName);
    await expandSignal(page, "inActiveAcc");

    // Loaded from the engine's effective value, so never blank.
    await expect(daysField(page)).toHaveValue(String(EFFECTIVE_DAYS));
    await expect(daysField(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Add group override" }).last().click();

    // The override card must offer group, status and weight only. If the days
    // input leaked into it there would be a second one on the page.
    await expect(daysField(page)).toHaveCount(1);
    await expect(page.getByText("Group override").last()).toBeVisible();
  });

  test("the shared lists hint is suppressed for this signal but kept for others", async ({
    page,
  }) => {
    // Asserted via per-signal testids rather than by searching for the text:
    // PatternFly renders every signal's expandable content and merely hides the
    // collapsed ones, so a text search finds hidden copies belonging to other
    // signals and proves nothing about which one is showing it.
    await stubAmfa(page, { realm: realmName });
    await goToAdaptiveMfa(page, realmName);

    // Geolocation genuinely has allow/deny lists, so it keeps the hint.
    await expandSignal(page, "geoLoc");
    await expect(page.getByTestId("geoLoc-scope-help")).toBeVisible();

    // Inactive Account has no lists, and a group override cannot change its
    // threshold, so the hint would contradict the field's own help text. It is
    // not merely hidden for this signal, it is never rendered.
    await expandSignal(page, "inActiveAcc");
    await expect(daysField(page)).toBeVisible();
    await expect(page.getByTestId("inActiveAcc-scope-help")).toHaveCount(0);
  });
});
