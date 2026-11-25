import { expect, test, type Page } from "@playwright/test";
import { v4 as uuid } from "uuid";
import adminClient from "../utils/AdminClient.ts";
import { switchOff, switchOn } from "../utils/form.ts";
import {
  goToAdaptiveMfa,
  parameters,
  saveButton,
  STUB_ENDPOINT,
  stubAmfa,
  type Write,
} from "./adaptive-mfa.ts";

/**
 * AMFA settings changed outside the page, for example through the admin REST
 * API, while an admin has it open. Opening the tab must show the current
 * settings, and a save must not write the page's older view over them.
 *
 * Every AMFA endpoint is stubbed; the realm's attributes are real.
 */
test.describe("Adaptive MFA settings changed elsewhere", () => {
  const realmName = `adaptive-mfa-elsewhere-${uuid()}`;
  const endpointField = (page: Page) =>
    page.getByTestId("adaptiveAuthApiEndpoint");
  const fallbackField = (page: Page) => page.locator("#necessaryParametersId");
  const toggle = (page: Page) => page.locator("#adaptiveToggle");
  const notifySwitch = (page: Page) =>
    page.locator("#adaptiveNotifyLoginAttempt");
  const changedNotice = (page: Page) =>
    page.getByTestId("amfa-changed-elsewhere");
  const reloadButton = (page: Page) =>
    page.getByTestId("amfa-changed-elsewhere-reload");

  const stored = async () =>
    (await adminClient.getRealm(realmName))?.attributes ?? {};

  // What another admin, or a script, does through the admin REST API.
  async function changeElsewhere(attributes: Record<string, string>) {
    const realm = await adminClient.getRealm(realmName);
    await adminClient.updateRealm(realmName, {
      ...realm,
      attributes: { ...realm?.attributes, ...attributes },
    });
  }

  // Changes something on the page, so a save has something to write. Save is
  // enabled once the realm and engine loads are done: a click before then is
  // undone when the realm's values arrive.
  async function editNotify(page: Page) {
    await expect(saveButton(page)).toBeEnabled();
    const on = await notifySwitch(page).isChecked();
    await (on ? switchOff : switchOn)(page, notifySwitch(page));
  }

  test.beforeAll(() => adminClient.createRealm(realmName));
  test.afterAll(() => adminClient.deleteRealm(realmName));
  test.beforeEach(async () => {
    const realm = await adminClient.getRealm(realmName);
    await adminClient.updateRealm(realmName, {
      ...realm,
      attributes: {
        ...realm?.attributes,
        adaptiveToggle: "true",
        adaptiveAuthEndpoint: STUB_ENDPOINT,
        fallbackRisk: "3",
        notifyUsersRiskyLogin: "false",
      },
    });
  });

  test("opening the tab again shows settings changed since it was first opened", async ({
    page,
  }) => {
    await stubAmfa(page, { realm: realmName });
    await goToAdaptiveMfa(page, realmName);
    await expect(fallbackField(page)).toHaveValue("3");

    await changeElsewhere({
      adaptiveAuthEndpoint: "http://amfa-moved.test",
      fallbackRisk: "4",
    });
    await page.getByTestId("security-defenses-headers-tab").click();
    await page.getByRole("tab", { name: "Adaptive MFA" }).click();

    await expect(endpointField(page)).toHaveValue("http://amfa-moved.test");
    await expect(fallbackField(page)).toHaveValue("4");
  });

  test("a save does not overwrite realm settings changed since the page loaded", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, { realm: realmName, onWrite: (w) => writes.push(w) });
    await goToAdaptiveMfa(page, realmName);
    await expect(fallbackField(page)).toHaveValue("3");

    await changeElsewhere({ fallbackRisk: "4" });
    await editNotify(page);
    await saveButton(page).click();

    await expect(changedNotice(page)).toBeVisible();
    expect(writes).toEqual([]);
    expect((await stored()).fallbackRisk).toBe("4");
    await expect(saveButton(page)).toBeDisabled();

    // Reload shows the current settings, and a save from them works.
    await reloadButton(page).click();
    await expect(changedNotice(page)).toBeHidden();
    await expect(fallbackField(page)).toHaveValue("4");
    await editNotify(page);
    await saveButton(page).click();
    await expect(page.getByTestId("last-alert")).toContainText(
      "All the data are saved",
    );
    expect((await stored()).fallbackRisk).toBe("4");
    expect((await stored()).notifyUsersRiskyLogin).toBe("true");
  });

  test("a save does not switch AMFA back on after it was switched off elsewhere", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, { realm: realmName, onWrite: (w) => writes.push(w) });
    await goToAdaptiveMfa(page, realmName);

    await changeElsewhere({ adaptiveToggle: "false" });
    await editNotify(page);
    await saveButton(page).click();

    await expect(changedNotice(page)).toBeVisible();
    expect(writes).toEqual([]);
    expect((await stored()).adaptiveToggle).toBe("false");

    await reloadButton(page).click();
    await expect(toggle(page)).not.toBeChecked();
  });

  test("a save does not overwrite engine signals changed since the page loaded", async ({
    page,
  }) => {
    const writes: Write[] = [];
    const changed = parameters(realmName).map((p) =>
      p.parameter_name === "client" ? { ...p, weight: 5 } : p,
    );
    await stubAmfa(page, {
      realm: realmName,
      onWrite: (w) => writes.push(w),
      // The first answer is the page's load; the next, the check before a save.
      settingsGet: [
        { status: 200, body: JSON.stringify(parameters(realmName)) },
        { status: 200, body: JSON.stringify(changed) },
      ],
    });
    await goToAdaptiveMfa(page, realmName);

    await editNotify(page);
    await saveButton(page).click();

    await expect(changedNotice(page)).toBeVisible();
    expect(writes).toEqual([]);
  });

  test("a save does not overwrite an engine scoring config changed since the page loaded", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, {
      realm: realmName,
      onWrite: (w) => writes.push(w),
      scoringGet: [
        { status: 200, body: JSON.stringify({ mode: "weight" }) },
        { status: 200, body: JSON.stringify({ mode: "bayesian" }) },
      ],
    });
    await goToAdaptiveMfa(page, realmName);

    await editNotify(page);
    await saveButton(page).click();

    await expect(changedNotice(page)).toBeVisible();
    expect(writes).toEqual([]);
  });

  test("with nothing changed elsewhere a save writes as before", async ({
    page,
  }) => {
    const writes: Write[] = [];
    await stubAmfa(page, { realm: realmName, onWrite: (w) => writes.push(w) });
    await goToAdaptiveMfa(page, realmName);

    await editNotify(page);
    await saveButton(page).click();

    await expect(page.getByTestId("last-alert")).toContainText(
      "All the data are saved",
    );
    await expect(changedNotice(page)).toBeHidden();
    expect(writes.map((w) => w.kind)).toEqual(["settings", "realm"]);
    expect((await stored()).notifyUsersRiskyLogin).toBe("true");
  });

  test("switching off writes only the switch, so a newer endpoint does not stop it", async ({
    page,
  }) => {
    await stubAmfa(page, { realm: realmName });
    await goToAdaptiveMfa(page, realmName);

    await changeElsewhere({ adaptiveAuthEndpoint: "http://amfa-moved.test" });
    await switchOff(page, toggle(page));
    await saveButton(page).click();

    await expect(page.getByTestId("last-alert")).toContainText(
      "Adaptive MFA is off for this realm",
    );
    await expect(changedNotice(page)).toBeHidden();
    expect((await stored()).adaptiveToggle).toBe("false");
    expect((await stored()).adaptiveAuthEndpoint).toBe(
      "http://amfa-moved.test",
    );
  });
});
