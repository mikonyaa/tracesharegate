import { test, expect } from "@playwright/test";
// Deliberately synthetic text, never a credential. This source is captured.
const canary = 'TSG_SYNTHETIC_CANARY_09_"<&Ж🙂';
test("assertion scenario", async ({ page }, info) => {
  const base = process.env.TSG_FIXTURE_URL!;
  await page.goto(base);
  await test.step("synthetic setup", async () => {
    await page.getByLabel("Sample value").fill(canary);
    await page.getByRole("button", { name: "Submit sample" }).click();
  });
  await page.waitForTimeout(300);
  await expect(page.locator("#canary")).toHaveText(canary);
  await info.attach("synthetic-image", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await expect(page.getByTestId("status"), canary).toHaveText("Completed", {
    timeout: 500,
  });
});
test("element timeout scenario", async ({ page }) => {
  await page.goto(process.env.TSG_FIXTURE_URL!);
  await page.getByLabel("Sample value").fill("Synthetic sample");
  await page
    .getByRole("button", { name: "Missing control" })
    .click({ timeout: 500 });
});
test("navigation scenario", async ({ page }) => {
  await page.goto(process.env.TSG_FIXTURE_URL!);
  await page.getByLabel("Sample value").fill("Synthetic navigation");
  await page.goto(process.env.TSG_FIXTURE_URL! + "/navigation-failure");
});
