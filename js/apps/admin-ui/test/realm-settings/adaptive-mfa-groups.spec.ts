import { expect, test } from "@playwright/test";
import { v4 as uuid } from "uuid";
import adminClient from "../utils/AdminClient.ts";
import {
  alert,
  expandSignal,
  goToAdaptiveMfa,
  saveButton,
  stubAmfa,
} from "./adaptive-mfa.ts";

/**
 * Group overrides: each group-scoped signal saves one parameter row per group.
 * An override with no group, or a group picked twice, would make the engine
 * reject the whole save, so the page stops it and says why.
 */

const SALES = { id: "group-sales", name: "Sales" };
const SUPPORT = { id: "group-support", name: "Support" };

test.describe.serial("Adaptive MFA group overrides", () => {
  const realmName = `adaptive-mfa-groups-${uuid()}`;

  test.beforeAll(() => adminClient.createRealm(realmName));
  test.afterAll(() => adminClient.deleteRealm(realmName));

  const groupSelect = (page: any, index: number) =>
    page.locator(`[id="ipAddress.${index}.groupId"]`);

  async function openIpOverrides(page: any, saves: any[]) {
    await stubAmfa(page, {
      realm: realmName,
      groups: [SALES, SUPPORT],
      onSave: (payload) => saves.push(payload),
    });
    await goToAdaptiveMfa(page, realmName);
    await expandSignal(page, "ipAddress");
  }

  test("an override without a group is not saved", async ({ page }) => {
    const saves: any[] = [];
    await openIpOverrides(page, saves);
    await page.getByRole("button", { name: "Add group override" }).click();
    await saveButton(page).click();

    await expect(alert(page)).toContainText("Select a group for every group override");
    expect(saves).toHaveLength(0);
  });

  test("the same group twice is not saved, and the group is named", async ({ page }) => {
    const saves: any[] = [];
    await openIpOverrides(page, saves);
    const add = page.getByRole("button", { name: "Add group override" });
    await add.click();
    await add.click();
    await groupSelect(page, 1).selectOption(SALES.id);
    await groupSelect(page, 2).selectOption(SALES.id);
    await saveButton(page).click();

    await expect(alert(page)).toContainText('The group "Sales" has more than one rule');
    expect(saves).toHaveLength(0);
  });

  test("distinct groups save one row per group", async ({ page }) => {
    const saves: any[] = [];
    await openIpOverrides(page, saves);
    const add = page.getByRole("button", { name: "Add group override" });
    await add.click();
    await add.click();
    await groupSelect(page, 1).selectOption(SALES.id);
    await groupSelect(page, 2).selectOption(SUPPORT.id);
    await saveButton(page).click();

    await expect.poll(() => saves.length).toBe(1);
    const ipGroups = saves[0].parameters
      .filter((p: any) => p.parameter_name === "ip_address")
      .map((p: any) => p.group_id)
      .sort();
    expect(ipGroups).toEqual(["default", SALES.id, SUPPORT.id].sort());
  });
});
