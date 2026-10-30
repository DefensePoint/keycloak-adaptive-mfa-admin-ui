import { expect, test } from "@playwright/test";
import { v4 as uuid } from "uuid";
import adminClient from "../utils/AdminClient.ts";
import { goToRealm } from "../utils/sidebar.ts";
import {
  alert,
  blockedNotice,
  daysField,
  EFFECTIVE_DAYS,
  ENGINE_DOWN_BODY,
  REFUSED_BODY,
  WRITE_LIMIT_BODY,
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

  test("a refused scoring write puts the risk signals back", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, {
      realm: realmName,
      scoringPut: { status: 502, body: REFUSED_BODY },
      onWrite: (w) => writes.push(w),
    });
    await goToAdaptiveMfa(page, realmName);
    // The stub loads "weight"; scoring is only written when it changed.
    await page.locator("#scoringMode").selectOption("bayesian");
    await expandSignal(page, "inActiveAcc");
    await daysField(page).fill("77");

    await saveButton(page).click();

    await expect(alert(page)).toContainText("Saving the scoring config failed");
    await expect(alert(page)).toContainText("HTTP 422");
    await expect(alert(page)).toContainText(
      "Nothing was changed: everything this save had written was put back.",
    );
    // New signals, the scoring write and its one retry, then the signals as
    // loaded. A refused scoring write was not applied, so it is not put back. The realm attributes (the AMFA toggle) are never written.
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
    // The stub loads "weight"; scoring is only written when it changed.
    await page.locator("#scoringMode").selectOption("bayesian");

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
      scoringPut: { status: 502, body: REFUSED_BODY },
    });
    await goToAdaptiveMfa(page, realmName);
    // The stub loads "weight"; scoring is only written when it changed.
    await page.locator("#scoringMode").selectOption("bayesian");

    await saveButton(page).click();

    await expect(alert(page)).toContainText("Saving the scoring config failed");
    await expect(alert(page)).toContainText(
      "putting back the risk signals failed too, so the new risk signals stay saved. Press Save again to finish the save.",
    );
  });

  test("a failed realm update puts both engine writes back", async ({ page }) => {
    const writes: Write[] = [];
    await stubAmfa(page, {
      realm: realmName,
      realmPut: { status: 500, body: JSON.stringify({ error: "unknown_error" }) },
      onWrite: (w) => writes.push(w),
    });
    await goToAdaptiveMfa(page, realmName);
    // The stub loads "weight"; scoring is only written when it changed.
    await page.locator("#scoringMode").selectOption("bayesian");

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
    // Scoring is put back as loaded.
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

  test("the write limit gets a plain message, not the raw engine response", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, {
      realm: realmName,
      settingsPut: { status: 502, body: WRITE_LIMIT_BODY },
      onWrite: (w) => writes.push(w),
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();

    await expect(alert(page)).toContainText(
      "changed too often in the last minute. Nothing was changed. Wait a minute, then press Save again.",
    );
    await expect(alert(page)).not.toContainText("An error occurred");
    await expect(alert(page)).not.toContainText("502");
    await expect(alert(page)).not.toContainText("Rate limit exceeded");
    // Refused writes do not count against the limit, so the one retry is kept.
    expect(writes.map((w) => w.kind)).toEqual(["settings", "settings"]);
  });

  test("the write limit on scoring after the signals were put back", async ({ page }) => {
    await stubAmfa(page, {
      realm: realmName,
      scoringPut: { status: 502, body: WRITE_LIMIT_BODY },
    });
    await goToAdaptiveMfa(page, realmName);
    await page.locator("#scoringMode").selectOption("bayesian");

    await saveButton(page).click();

    await expect(alert(page)).toContainText("changed too often in the last minute");
    await expect(alert(page)).toContainText(
      "Nothing was changed: everything this save had written was put back. Wait a minute, then press Save again.",
    );
    await expect(alert(page)).not.toContainText("An error occurred");
  });

  test("the write limit on scoring when putting the signals back is refused too", async ({
    page,
  }) => {
    await stubAmfa(page, {
      realm: realmName,
      settingsPut: [
        { status: 200, body: '"success"' },
        { status: 502, body: WRITE_LIMIT_BODY },
      ],
      scoringPut: { status: 502, body: WRITE_LIMIT_BODY },
    });
    await goToAdaptiveMfa(page, realmName);
    await page.locator("#scoringMode").selectOption("bayesian");

    await saveButton(page).click();

    await expect(alert(page)).toContainText("changed too often in the last minute");
    await expect(alert(page)).toContainText(
      "so the new risk signals stay saved. Wait a minute, then press Save again to finish the save.",
    );
    await expect(alert(page)).not.toContainText("Rate limit exceeded");
  });

  test("a 429 passed through as is is recognised too", async ({ page }) => {
    await stubAmfa(page, {
      realm: realmName,
      settingsPut: {
        status: 429,
        body: '{"success":false,"message":"Rate limit exceeded"}',
      },
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();

    await expect(alert(page)).toContainText("changed too often in the last minute");
    await expect(alert(page)).not.toContainText("An error occurred");
  });

  test("other engine errors keep their detail", async ({ page }) => {
    await stubAmfa(page, {
      realm: realmName,
      settingsPut: {
        status: 502,
        body: JSON.stringify({ error: "AMFA engine returned HTTP 4290: odd" }),
      },
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();

    await expect(alert(page)).toContainText("Saving risk signals failed");
    await expect(alert(page)).toContainText("HTTP 4290");
  });

  test("a signals write the engine did not confirm is not reported as unchanged", async ({
    page,
  }) => {
    // No answer, or the engine unreachable, may mean the write arrived and only
    // the answer was lost.
    await stubAmfa(page, {
      realm: realmName,
      settingsPut: { status: 502, body: ENGINE_DOWN_BODY },
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();

    await expect(alert(page)).toContainText(
      "The engine did not confirm the write, so the new risk signals may be saved. Press Save again to finish the save.",
    );
    await expect(alert(page)).not.toContainText("Nothing was changed");
  });

  test("a scoring write the engine did not confirm is put back too", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, {
      realm: realmName,
      // The write and its retry go unconfirmed, the put-back goes through.
      scoringPut: [
        { status: 502, body: ENGINE_DOWN_BODY },
        { status: 502, body: ENGINE_DOWN_BODY },
        { status: 200, body: '"success"' },
      ],
      onWrite: (w) => writes.push(w),
    });
    await goToAdaptiveMfa(page, realmName);
    await page.locator("#scoringMode").selectOption("bayesian");

    await saveButton(page).click();

    await expect(alert(page)).toContainText(
      "Nothing was changed: everything this save had written was put back.",
    );
    // Newest first: the scoring config as loaded, then the signals.
    expect(writes.map((w) => w.kind)).toEqual([
      "settings",
      "scoring",
      "scoring",
      "scoring",
      "settings",
    ]);
    expect(writes[3].payload).toEqual({ mode: "weight" });
  });

  test("a save keeps writing to the realm it started in", async ({ page }) => {
    const otherRealm = `adaptive-mfa-other-${uuid()}`;
    await adminClient.createRealm(otherRealm);
    try {
      const writes: Write[] = [];
      const realmPuts: string[] = [];
      page.on("request", (request) => {
        if (
          request.method() === "PUT" &&
          /\/admin\/realms\/[^/]+$/.test(request.url())
        ) {
          realmPuts.push(decodeURIComponent(request.url().split("/").pop()!));
        }
      });
      let release!: () => void;
      await stubAmfa(page, {
        realm: realmName,
        // Held open until the admin has switched realms.
        settingsPutGate: new Promise<void>((r) => (release = r)),
        onWrite: (w) => writes.push(w),
      });
      await goToAdaptiveMfa(page, realmName);
      // A changed scoring config, so a write follows the switch.
      await page.locator("#scoringMode").selectOption("bayesian");

      await saveButton(page).click();
      await expect.poll(() => writes.length).toBe(1);
      await goToRealm(page, otherRealm);
      release();

      await expect.poll(() => realmPuts.length).toBe(1);
      expect(writes.map((w) => [w.kind, w.realm])).toEqual([
        ["settings", realmName],
        ["scoring", realmName],
        ["realm", realmName],
      ]);
      expect(realmPuts).toEqual([realmName]);
    } finally {
      await adminClient.deleteRealm(otherRealm);
    }
  });

  test("a second Save while one is running is ignored", async ({ page }) => {
    const writes: Write[] = [];
    let release!: () => void;
    await stubAmfa(page, {
      realm: realmName,
      settingsPutGate: new Promise<void>((r) => (release = r)),
      onWrite: (w) => writes.push(w),
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();
    await expect.poll(() => writes.length).toBe(1);
    await expect(saveButton(page)).toBeDisabled();
    // A submit that gets past the disabled button must not start a second save.
    await page.evaluate(() => {
      const save = document.querySelector('[data-testid="amfa-save"]');
      (save?.closest("form") as HTMLFormElement | null)?.requestSubmit();
    });
    release();

    await expect(alert(page)).toContainText("All the data are saved");
    await expect(saveButton(page)).toBeEnabled();
    expect(writes.map((w) => w.kind)).toEqual(["settings", "realm"]);
  });

  test("hidden bayesian fields neither block nor change a weight-mode save", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, {
      realm: realmName,
      scoringGet: {
        status: 200,
        body: JSON.stringify({
          mode: "weight",
          bias: -2,
          thresholds: [0.2, 0.5, 0.8],
        }),
      },
      onWrite: (w) => writes.push(w),
    });
    await goToAdaptiveMfa(page, realmName);
    await page.locator("#scoringMode").selectOption("bayesian");
    await page.locator("#scoring-thresholds").fill("0.9, 0.5");
    await page.locator("#scoring-bias").fill("abc");
    await page.locator("#scoringMode").selectOption("weight");

    await saveButton(page).click();

    await expect(alert(page)).toContainText("All the data are saved");
    // The stored scoring config is unchanged, so it is not written.
    expect(writes.map((w) => w.kind)).toEqual(["settings", "realm"]);
  });

  test("a bias that is not a number is refused, not saved as empty", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, { realm: realmName, onWrite: (w) => writes.push(w) });
    await goToAdaptiveMfa(page, realmName);
    await page.locator("#scoringMode").selectOption("bayesian");
    await page.locator("#scoring-bias").fill("-3,9");

    await saveButton(page).click();

    await expect(alert(page)).toContainText("The bias must be a number");
    expect(writes).toEqual([]);
  });

  test("signals the engine sends no row for get the engine's default weights", async ({
    page,
  }) => {
    // The stub only answers the client and dormancy rows.
    let saved: any = null;
    await stubAmfa(page, {
      realm: realmName,
      onSave: (payload) => (saved = payload),
    });
    await goToAdaptiveMfa(page, realmName);

    await saveButton(page).click();
    await expect(alert(page)).toContainText("All the data are saved");

    const weightOf = (name: string) =>
      Number(
        saved.parameters.find(
          (p: any) =>
            p.parameter_name === name &&
            (p.group_id ?? "default") === "default",
        ).weight,
      );
    expect(weightOf("impossible_travel")).toBe(3);
    expect(weightOf("event_cluster_label")).toBe(2);
    expect(weightOf("geolocation_cluster_label")).toBe(3);
    expect(weightOf("date_time")).toBe(2);
    expect(weightOf("device")).toBe(3);
  });

  test("an invalid IP stays marked on its field until it is fixed", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, { realm: realmName, onWrite: (w) => writes.push(w) });
    await goToAdaptiveMfa(page, realmName);
    await expandSignal(page, "ipAddress");
    const allow = page.getByTestId("ipAddress.0.insertIPWhitelist0");
    await allow.fill("10.0.0.999");

    await saveButton(page).click();

    await expect(alert(page)).toContainText(
      "Invalid IPs on allow list: 10.0.0.999",
    );
    await expect(allow).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Not a valid IP address: 10.0.0.999"),
    ).toBeVisible();
    expect(writes).toEqual([]);

    await allow.fill("10.0.0.9");
    await saveButton(page).click();
    await expect(alert(page)).toContainText("All the data are saved");
    await expect(allow).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Not a valid IP address")).toHaveCount(0);
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
    // The realm attributes carry the AMFA toggle, so they go last. The scoring
    // config is unchanged, so it is not written: every write counts against
    // the engine's config write limit.
    expect(writes.map((w) => w.kind)).toEqual(["settings", "realm"]);
  });

  test("a changed scoring config is written, and only once", async ({ page }) => {
    const writes: Write[] = [];
    await stubAmfa(page, { realm: realmName, onWrite: (w) => writes.push(w) });
    await goToAdaptiveMfa(page, realmName);
    await page.locator("#scoringMode").selectOption("bayesian");
    await page.locator("#scoring-thresholds").fill("0.3, 0.6, 0.85");

    await saveButton(page).click();
    await expect(alert(page)).toContainText("All the data are saved");
    expect(writes.map((w) => w.kind)).toEqual(["settings", "scoring", "realm"]);
    expect(writes[1].payload).toEqual({ mode: "bayesian", thresholds: [0.3, 0.6, 0.85] });

    // Saving again without touching scoring does not resend it.
    await alert(page).locator("button").first().click();
    await saveButton(page).click();
    await expect.poll(() => writes.length).toBe(5);
    await expect(alert(page)).toContainText("All the data are saved");
    expect(writes.map((w) => w.kind)).toEqual([
      "settings",
      "scoring",
      "realm",
      "settings",
      "realm",
    ]);
  });
});
