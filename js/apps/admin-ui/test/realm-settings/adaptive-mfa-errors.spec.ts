import { expect, test } from "@playwright/test";
import { v4 as uuid } from "uuid";
import adminClient from "../utils/AdminClient.ts";
import {
  alert,
  blockedNotice,
  daysField,
  EFFECTIVE_DAYS,
  ENGINE_DOWN_BODY,
  expandSignal,
  goToAdaptiveMfa,
  savedDormancyRow,
  saveButton,
  stubAmfa,
  type Write,
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

  test("a failed scoring write puts the risk signals back", async ({ page }) => {
    const writes: Write[] = [];
    await stubAmfa(page, {
      realm: realmName,
      scoringPut: { status: 502, body: ENGINE_DOWN_BODY },
      onWrite: (w) => writes.push(w),
    });
    await goToAdaptiveMfa(page, realmName);
    await expandSignal(page, "inActiveAcc");
    await daysField(page).fill("77");

    await saveButton(page).click();

    await expect(alert(page)).toContainText("Saving the scoring config failed");
    await expect(alert(page)).toContainText("HTTP 502");
    await expect(alert(page)).toContainText("Nothing was changed");
    // New signals, the scoring write and its one retry, then the signals as
    // loaded. The realm attributes (the AMFA toggle) are never written.
    expect(writes.map((w) => w.kind)).toEqual([
      "settings",
      "scoring",
      "scoring",
      "settings",
    ]);
    expect(savedDormancyRow(writes[0].payload).inactive_days).toBe(77);
    expect(savedDormancyRow(writes[3].payload).inactive_days).toBe(EFFECTIVE_DAYS);
  });

  test("a write that fails once is retried and the save goes through", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, {
      realm: realmName,
      scoringPut: [
        { status: 502, body: ENGINE_DOWN_BODY },
        { status: 200, body: '"success"' },
      ],
      onWrite: (w) => writes.push(w),
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();

    await expect(alert(page)).toContainText("All the data are saved");
    expect(writes.map((w) => w.kind)).toEqual([
      "settings",
      "scoring",
      "scoring",
      "realm",
    ]);
  });

  test("when putting the signals back fails too, the message says so", async ({
    page,
  }) => {
    await stubAmfa(page, {
      realm: realmName,
      // The save's own write succeeds, then the engine goes away.
      settingsPut: [
        { status: 200, body: '"success"' },
        { status: 502, body: ENGINE_DOWN_BODY },
      ],
      scoringPut: { status: 502, body: ENGINE_DOWN_BODY },
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();

    await expect(alert(page)).toContainText("Saving the scoring config failed");
    await expect(alert(page)).toContainText(
      "putting back the risk signals failed too",
    );
    await expect(alert(page)).toContainText("Press Save again");
  });

  test("a failed realm update puts both engine writes back", async ({ page }) => {
    const writes: Write[] = [];
    await stubAmfa(page, {
      realm: realmName,
      realmPut: { status: 500, body: JSON.stringify({ error: "unknown_error" }) },
      onWrite: (w) => writes.push(w),
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();

    await expect(alert(page)).toContainText("Saving the realm settings failed");
    await expect(alert(page)).toContainText("Nothing was changed");
    // Newest first: scoring, then signals.
    expect(writes.map((w) => w.kind)).toEqual([
      "settings",
      "scoring",
      "realm",
      "scoring",
      "settings",
    ]);
    expect(writes[3].payload).toEqual({ mode: "weight" });
  });

  test("invalid thresholds are refused before anything is written", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, { realm: realmName, onWrite: (w) => writes.push(w) });
    await goToAdaptiveMfa(page, realmName);
    await page.locator("#scoringMode").selectOption("bayesian");
    await page.locator("#scoring-thresholds").fill("0.9, 0.5, 0.2");

    await saveButton(page).click();

    await expect(alert(page)).toContainText(
      "Thresholds must be three ascending numbers between 0 and 1",
    );
    expect(writes).toEqual([]);
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

  test("saving stays blocked until the configuration has loaded", async ({
    page,
  }) => {
    // Until both loads answer, the form holds its built-in defaults, so an early
    // click would overwrite live config with them. A slow engine made this easy
    // to hit, and the button used to be enabled the whole time.
    let releaseSettings!: () => void;
    let releaseScoring!: () => void;
    let saveAttempted = false;
    await stubAmfa(page, {
      realm: realmName,
      settingsGetGate: new Promise<void>((r) => (releaseSettings = r)),
      scoringGetGate: new Promise<void>((r) => (releaseScoring = r)),
      onSave: () => {
        saveAttempted = true;
      },
    });
    await goToAdaptiveMfa(page, realmName);

    await expect(saveButton(page)).toBeDisabled();
    // The guard inside onSubmit must hold as well.
    await page.evaluate(() => {
      const save = document.querySelector('[data-testid="amfa-save"]');
      (save?.closest("form") as HTMLFormElement | null)?.requestSubmit();
    });

    // One load done is not enough: the scoring fields feed the save too.
    const settingsLoaded = page.waitForResponse(
      "**/amfa-api/fetchAdaptiveMFAParameters",
    );
    releaseSettings();
    await settingsLoaded;
    await expect(saveButton(page)).toBeDisabled();

    releaseScoring();
    await expect(saveButton(page)).toBeEnabled();
    // Nothing is wrong, so no "blocked" explanation.
    await expect(blockedNotice(page)).toHaveCount(0);
    expect(saveAttempted).toBe(false);
  });

  test("a healthy save still reports success", async ({ page }) => {
    const writes: Write[] = [];
    await stubAmfa(page, { realm: realmName, onWrite: (w) => writes.push(w) });
    await goToAdaptiveMfa(page, realmName);

    await expect(saveButton(page)).toBeEnabled();
    await expect(blockedNotice(page)).toHaveCount(0);

    await saveButton(page).click();

    await expect(alert(page)).toContainText("All the data are saved");
    // The realm attributes carry the AMFA toggle, so they go last: AMFA is never
    // switched on before the engine holds its config.
    expect(writes.map((w) => w.kind)).toEqual(["settings", "scoring", "realm"]);
  });
});
