import { expect, test } from "@playwright/test";
import { v4 as uuid } from "uuid";
import adminClient from "../utils/AdminClient.ts";
import {
  alert,
  blockedNotice,
  ENGINE_DOWN_BODY,
  goToAdaptiveMfa,
  saveButton,
  stubAmfa,
} from "./adaptive-mfa.ts";

/**
 * Error handling for the Adaptive MFA settings page.
 *
 * These cover three defects that shared one root cause: `fetch` only rejects on
 * a network-level failure, so a 4xx/5xx resolved normally and was ignored.
 *
 *   1. A rejected save reported "All the data are saved".
 *   2. When an error WAS shown, the reason was discarded, because `addError`
 *      needs a message key plus an {{error}} placeholder to interpolate into.
 *   3. A failed initial load left the form on built-in defaults with no warning,
 *      so the next save would overwrite live config with those defaults.
 *
 * Every AMFA endpoint is stubbed, so no test needs a running engine and none can
 * write to a real configuration. That matters: these paths were originally
 * verified by stopping the engine and clicking Save by hand, which overwrote a
 * realm's config once.
 */
test.describe.serial("Adaptive MFA error handling", () => {
  const realmName = `adaptive-mfa-errors-${uuid()}`;

  test.beforeAll(() => adminClient.createRealm(realmName));
  test.afterAll(() => adminClient.deleteRealm(realmName));

  test("a rejected save reports the failure instead of success", async ({
    page,
  }) => {
    await stubAmfa(page, {
      realm: realmName,
      settingsPut: { status: 502, body: ENGINE_DOWN_BODY },
    });
    await goToAdaptiveMfa(page, realmName);

    await expect(saveButton(page)).toBeEnabled();
    await saveButton(page).click();

    // The defect: this used to read "All the data are saved".
    await expect(alert(page)).toContainText("Saving risk signals failed");
    await expect(alert(page)).not.toContainText("All the data are saved");
  });

  test("the failure reason reaches the user, not just a generic message", async ({
    page,
  }) => {
    await stubAmfa(page, {
      realm: realmName,
      settingsPut: { status: 502, body: ENGINE_DOWN_BODY },
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();

    // Guards the addError contract: a bare message key plus an {{error}}
    // placeholder. With either missing, only "An error occurred" survives.
    await expect(alert(page)).toContainText("HTTP 502");
    await expect(alert(page)).toContainText("AMFA engine unreachable");
  });

  test("a partial save names the step that failed", async ({ page }) => {
    await stubAmfa(page, {
      realm: realmName,
      settingsPut: { status: 200, body: '"success"' },
      scoringPut: {
        status: 502,
        body: JSON.stringify({
          error:
            "AMFA engine returned HTTP 422: thresholds must be three ascending values within [0, 1]",
        }),
      },
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();

    // The two writes are independent, so reporting a flat failure would be as
    // misleading as reporting success: the signals really were saved.
    await expect(alert(page)).toContainText("Risk signals were saved");
    await expect(alert(page)).toContainText("scoring config failed");
  });

  test("a failed settings load blocks saving over live config", async ({
    page,
  }) => {
    await stubAmfa(page, {
      realm: realmName,
      settingsGet: { status: 502, body: ENGINE_DOWN_BODY },
    });
    await goToAdaptiveMfa(page, realmName);

    await expect(alert(page)).toContainText(
      "Could not load the current Adaptive MFA configuration",
    );
    // The form is holding defaults, so saving would destroy the real settings.
    await expect(saveButton(page)).toBeDisabled();
    await expect(blockedNotice(page)).toBeVisible();
  });

  test("a failed scoring load also blocks saving", async ({ page }) => {
    await stubAmfa(page, {
      realm: realmName,
      scoringGet: { status: 502, body: ENGINE_DOWN_BODY },
    });
    await goToAdaptiveMfa(page, realmName);

    // The scoring fields feed the save payload too, so this is the same hazard
    // even though the risk-signal list loaded fine.
    await expect(saveButton(page)).toBeDisabled();
    await expect(blockedNotice(page)).toBeVisible();
  });

  test("submitting the form directly cannot bypass the load-failed guard", async ({
    page,
  }) => {
    // Exercises the guard inside onSubmit, which the disabled button hides.
    //
    // Worth spelling out, because it corrects the reasoning that motivated the
    // guard: pressing Enter in a text input does NOT reach onSubmit here, since
    // browsers suppress implicit submission when the form's submit button is
    // disabled. So the button alone is currently sufficient. The guard is
    // defence in depth for the day someone removes `isDisabled` or adds another
    // submit path, and requestSubmit() is how we reach it: it dispatches a
    // submit event regardless of the button's state.
    let saveAttempted = false;
    await stubAmfa(page, {
      realm: realmName,
      settingsGet: { status: 502, body: ENGINE_DOWN_BODY },
      onSave: () => {
        saveAttempted = true;
      },
    });
    await goToAdaptiveMfa(page, realmName);

    await expect(saveButton(page)).toBeDisabled();

    await page.evaluate(() => {
      const save = document.querySelector('[data-testid="amfa-save"]');
      (save?.closest("form") as HTMLFormElement | null)?.requestSubmit();
    });

    await expect(alert(page)).toContainText(
      "Saving is disabled because the current configuration could not be loaded",
    );
    expect(saveAttempted).toBe(false);
  });

  test("a healthy save still reports success", async ({ page }) => {
    await stubAmfa(page, { realm: realmName });
    await goToAdaptiveMfa(page, realmName);

    await expect(saveButton(page)).toBeEnabled();
    await expect(blockedNotice(page)).toHaveCount(0);

    await saveButton(page).click();

    await expect(alert(page)).toContainText("All the data are saved");
  });
});
