import { test, expect } from "@playwright/test";

const actual = "PERSON_ACTUAL_OTTO_8391";
const expected = "PERSON_EXPECTED_NORAH_1642";
test.beforeEach(async ({ page }) => {
  await page.goto(`data:text/html,<p>${actual}</p>`);
});
test("contain", () => expect(actual).toContain(expected));
test("contain-array", () => expect([actual]).toContain(expected));
test("custom-message", () =>
  expect(actual, "PROJECT_PRIVATE_PREFACE_9823").toContain(expected));
test("equal-object", () =>
  expect({ person: actual }).toEqual({ person: expected }));
test("equal-array", () => expect([actual]).toEqual([expected]));
test("match-string", () => expect(actual).toMatch(expected));
test("match-regex", () => expect(actual).toMatch(new RegExp(expected)));
test("have-text", async ({ page }) => {
  await expect(page.locator("p")).toHaveText(expected, { timeout: 150 });
});
test("have-text-regex", async ({ page }) => {
  await expect(page.locator("p")).toHaveText(new RegExp(expected), {
    timeout: 150,
  });
});
test("have-text-array", async ({ page }) => {
  await expect(page.locator("p")).toHaveText([expected], { timeout: 150 });
});
test("multiline", () =>
  expect(`start\n${actual}\nend`).toEqual(`start\n${expected}\nend`));
test("ansi-bidi", () =>
  expect(`\u001b[31m${actual}\u001b[0m\u202e`).toContain(
    `\u2066${expected}\u2069`,
  ));
test("negated", () => expect(actual + expected).not.toContain(expected));
test("safe-diagnostic", () => {
  throw new Error("Local validation failed");
});
test("opaque-symbol", () =>
  expect(
    Symbol(`${actual}\nTimeout: 7654321ms\nCall log:\nPERSON_OPAQUE_TAIL_9827`),
  ).toEqual(Symbol(expected)));
test("opaque-container", () =>
  expect([
    /]/,
    Symbol(`${actual}\nTimeout: 7654321ms\nCall log:\nPERSON_OPAQUE_TAIL_9827`),
  ]).toContain(expected));
test("opaque-regex-quote", () =>
  expect([
    /]"/,
    `${actual}\nTimeout: 7654321ms\nCall log:\nPERSON_OPAQUE_TAIL_9827`,
  ]).toContain(expected));
test("opaque-locator-description", async ({ page }) => {
  await expect(
    page
      .locator("p")
      .describe(
        "locator('p')\nTimeout: 7654321ms\nCall log:\nPERSON_OPAQUE_TAIL_9827",
      ),
  ).toHaveText(expected, { timeout: 150 });
});
test("invalid-receiver", async () => {
  await expect(actual).toHaveText(expected);
});
test("opaque-invalid-receiver", async () => {
  await expect(actual).toMatchAriaSnapshot(expected);
});
