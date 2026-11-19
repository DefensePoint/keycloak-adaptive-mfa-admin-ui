import { expect, test } from "@playwright/test";
import { v4 as uuid } from "uuid";
import adminClient from "../utils/AdminClient.ts";
import { switchOff, switchOn } from "../utils/form.ts";
import {
  alert,
  goToAdaptiveMfa,
  saveButton,
  stubAmfa,
  type Write,
} from "./adaptive-mfa.ts";

/**
 * The fallback risk level: the level a login gets when the AMFA engine cannot be
 * reached. The plugin uses 3 (a step-up) when the realm has none, or one outside
 * 1-4. The page used to show 1 for such a realm and write it on every save, so
 * any save turned the step-up during an outage into a login with no second
 * factor, without the admin choosing it.
 *
 * Every AMFA endpoint is stubbed; only the realm's attributes are real.
 */
test.describe.serial("Adaptive MFA fallback risk level", () => {
  const realmName = `adaptive-mfa-fallback-${uuid()}`;
  const fallbackField = (page: any) => page.locator("#necessaryParametersId");
  const notifySwitch = (page: any) =>
    page.locator("#adaptiveNotifyLoginAttempt");
  const storedFallback = async () =>
    (await adminClient.getRealm(realmName))?.attributes?.fallbackRisk;

  async function setStoredFallback(value: string | undefined) {
    const stored = await adminClient.getRealm(realmName);
    const attributes = { ...stored?.attributes };
    if (value === undefined) {
      delete attributes.fallbackRisk;
    } else {
      attributes.fallbackRisk = value;
    }
    await adminClient.updateRealm(realmName, { ...stored, attributes });
  }

  // Changes another setting, so a save has something to write.
  async function toggleNotify(page: any) {
    const on = await notifySwitch(page).isChecked();
    await (on ? switchOff : switchOn)(page, notifySwitch(page));
  }

  test.beforeAll(() => adminClient.createRealm(realmName));
  test.afterAll(() => adminClient.deleteRealm(realmName));

  test("a realm without a fallback level shows 3, as the login uses, and a save keeps it", async ({
    page,
  }) => {
    await setStoredFallback(undefined);
    await stubAmfa(page, { realm: realmName });
    await goToAdaptiveMfa(page, realmName);
    await expect(saveButton(page)).toBeEnabled();

    await expect(fallbackField(page)).toHaveValue("3");

    await toggleNotify(page);
    await saveButton(page).click();
    await expect(alert(page)).toContainText("All the data are saved");
    expect(await storedFallback()).toBe("3");
  });

  test("a level the admin chose is shown and kept by a save of another setting", async ({
    page,
  }) => {
    await setStoredFallback("2");
    await stubAmfa(page, { realm: realmName });
    await goToAdaptiveMfa(page, realmName);
    await expect(saveButton(page)).toBeEnabled();

    await expect(fallbackField(page)).toHaveValue("2");

    await toggleNotify(page);
    await saveButton(page).click();
    await expect(alert(page)).toContainText("All the data are saved");
    expect(await storedFallback()).toBe("2");
  });

  for (const stored of ["9", "0", "high"]) {
    test(`a stored level the login does not accept ("${stored}") is shown as 3, the level it uses`, async ({
      page,
    }) => {
      await setStoredFallback(stored);
      await stubAmfa(page, { realm: realmName });
      await goToAdaptiveMfa(page, realmName);
      await expect(saveButton(page)).toBeEnabled();
      await expect(fallbackField(page)).toHaveValue("3");
    });
  }

  for (const typed of ["7", "0", "", "2.5"]) {
    test(`a level outside 1-4 ("${typed}") is refused before anything is written`, async ({
      page,
    }) => {
      await setStoredFallback("2");
      const writes: Write[] = [];
      await stubAmfa(page, {
        realm: realmName,
        onWrite: (w) => writes.push(w),
      });
      await goToAdaptiveMfa(page, realmName);
      await expect(saveButton(page)).toBeEnabled();

      await fallbackField(page).fill(typed);
      await saveButton(page).click();

      await expect(alert(page)).toContainText(
        "The fallback risk level must be a whole number from 1 to 4",
      );
      expect(writes).toEqual([]);
      expect(await storedFallback()).toBe("2");
    });
  }

  test("a level outside 1-4 is refused when the endpoint changes too, and the endpoint is not saved", async ({
    page,
  }) => {
    await setStoredFallback("2");
    const writes: Write[] = [];
    await stubAmfa(page, { realm: realmName, onWrite: (w) => writes.push(w) });
    await goToAdaptiveMfa(page, realmName);
    await expect(saveButton(page)).toBeEnabled();
    const before = (await adminClient.getRealm(realmName))?.attributes
      ?.adaptiveAuthEndpoint;

    await page.getByTestId("adaptiveAuthApiEndpoint").fill("http://other.test");
    await fallbackField(page).fill("7");
    await saveButton(page).click();

    await expect(alert(page)).toContainText(
      "The fallback risk level must be a whole number from 1 to 4",
    );
    expect(writes).toEqual([]);
    const after = (await adminClient.getRealm(realmName))?.attributes;
    expect(after?.adaptiveAuthEndpoint).toBe(before);
    expect(after?.fallbackRisk).toBe("2");
  });
});
