const { test, expect } = require("@playwright/test");

test("shows the initial RPN display", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-register-x-main]")).toHaveText("0.");
  await expect(page.locator('[data-stack-count]')).toHaveText("STACK: 1");
});

test("fills the portrait viewport and distributes sections without vertical overflow", async ({ page }) => {
  await page.goto("/");

  const metrics = await page.evaluate(() => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const calculator = document.querySelector(".calculator").getBoundingClientRect();
    const display = document.querySelector(".display-panel").getBoundingClientRect();
    const strip = document.querySelector(".memory-strip").getBoundingClientRect();
    const keypad = document.querySelector(".keypad").getBoundingClientRect();
    const keypadRows = [...document.querySelectorAll(".key-row")].map((row) => row.getBoundingClientRect().height);
    return {
      viewportHeight,
      viewportWidth,
      calculator,
      display,
      strip,
      keypad,
      keypadRows,
      bodyScrollHeight: document.body.scrollHeight,
      docScrollHeight: document.documentElement.scrollHeight,
    };
  });

  expect(Math.abs(metrics.calculator.height - metrics.viewportHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.calculator.width - metrics.viewportWidth)).toBeLessThanOrEqual(1);
  expect(metrics.docScrollHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.display.height).toBeGreaterThan(metrics.strip.height);
  expect(metrics.keypad.height).toBeGreaterThan(metrics.display.height);
  expect(Math.max(...metrics.keypadRows) - Math.min(...metrics.keypadRows)).toBeLessThan(2);
});

test("supports enter and addition", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="enter"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("2.");
  await expect(page.locator("[data-register-y-main]")).toHaveText("2.");
  await expect(page.locator('[data-stack-count]')).toHaveText("STACK: 2");
  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="add"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("5.");
  await expect(page.locator('[data-stack-count]')).toHaveText("STACK: 1");
});

test("shows an error when reciprocal is applied to zero", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="reciprocal"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("Error.");
});

test("toggles sign for the current entry", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="toggle-sign"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("-3");
});

test("supports square root and square", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="9"]').click();
  await page.locator('[data-action="sqrt"]').nth(0).click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("3.");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="4"]').click();
  await page.locator('[data-action="square"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("16.");
});

test("supports ln, log, and y^x", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="ln"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("0.693147181");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="digit"][data-value="0"]').click();
  await page.locator('[data-action="digit"][data-value="0"]').click();
  await page.locator('[data-action="log"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("2.");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="power"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("8.");
});

test("shows an error for ln of a negative number", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="toggle-sign"]').click();
  await page.locator('[data-action="ln"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("Error.");
});

test("supports swap and drop on a two-level stack", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="swap"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("1.");
  await expect(page.locator("[data-register-y-main]")).toHaveText("2.");
  await expect(page.locator('[data-stack-count]')).toHaveText("STACK: 2");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="drop"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("1.");
  await expect(page.locator('[data-stack-count]')).toHaveText("STACK: 1");
});

test("starts a lifted fresh entry after drop reveals a lower stack value", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="drop"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("2");
  await expect(page.locator("[data-register-y-main]")).toHaveText("1.");
  await expect(page.locator('[data-stack-count]')).toHaveText("STACK: 2");
});

test("keeps mantissas aligned in upper stack rows by reserving exponent width", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="4"]').click();
  await page.locator('[data-action="enter"]').click();

  const positions = await page.evaluate(() => {
    const keys = ["x", "y", "z", "t"];
    return keys.map((key) => {
      const main = document.querySelector(
        key === "x" ? "[data-register-x-main]" : `[data-register-${key}-main]`
      );
      return main.getBoundingClientRect().right;
    });
  });

  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
});

test("starts a fresh x entry after a completed binary operation", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="add"]').click();
  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="multiply"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("9.");
  await expect(page.locator('[data-stack-count]')).toHaveText("STACK: 1");
});

test("supports subtract, multiply, and divide", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="9"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="4"]').click();
  await page.locator('[data-action="subtract"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("5.");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="multiply"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("6.");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="8"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="divide"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("4.");
});

test("shows editing integers without a trailing decimal and supports backspace", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("1");
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("12");
  await page.locator('[data-action="backspace"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("1");
  await page.locator('[data-action="backspace"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("0");
});

test("supports decimal entry", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="decimal"]').click();
  await page.locator('[data-action="digit"][data-value="5"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("1.5");
});

test("supports exp entry and exponent sign editing", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="exp"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("1");
  await expect(page.locator("[data-register-x-exponent]")).toHaveText("000");
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await expect(page.locator("[data-register-x-exponent]")).toHaveText("002");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="exp"]').click();
  await page.locator('[data-action="toggle-sign"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await expect(page.locator("[data-register-x-exponent]")).toHaveText("-002");
});

test("commits exp entry as a numeric value on enter", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="exp"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="enter"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("100.");
  await expect(page.locator("[data-register-y-main]")).toHaveText("100.");
  await expect(page.locator('[data-stack-count]')).toHaveText("STACK: 2");
});

test("shows committed large exp values in scientific display like RealCalc", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="exp"]').click();
  await page.locator('[data-action="digit"][data-value="9"]').click();
  await page.locator('[data-action="digit"][data-value="9"]').click();
  await page.locator('[data-action="enter"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("1");
  await expect(page.locator("[data-register-x-exponent]")).toHaveText("99");
  await expect(page.locator("[data-register-y-main]")).toHaveText("1");
  await expect(page.locator("[data-register-y-exponent]")).toHaveText("99");
});

test("starts a fresh exponent entry after enter and supports division with a stored scientific value", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="exp"]').click();
  await page.locator('[data-action="digit"][data-value="9"]').click();
  await page.locator('[data-action="digit"][data-value="9"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="exp"]').click();
  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="divide"]').click();

  await expect(page.locator("[data-register-x-main]")).toHaveText("1");
  await expect(page.locator("[data-register-x-exponent]")).toHaveText("98");
  await expect(page.locator('[data-stack-count]')).toHaveText("STACK: 1");
});

test("supports backspace within exp entry", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="exp"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="backspace"]').click();
  await expect(page.locator("[data-register-x-exponent]")).toHaveText("000");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="exp"]').click();
  await page.locator('[data-action="toggle-sign"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="backspace"]').click();
  await expect(page.locator("[data-register-x-exponent]")).toHaveText("-000");
});

test("supports last x on long press of the swap key", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="add"]').click();

  const swap = page.locator('[data-action="swap"]');
  await swap.dispatchEvent("pointerdown", { bubbles: true, pointerType: "touch" });
  await page.waitForTimeout(750);
  await swap.dispatchEvent("pointerup", { bubbles: true, pointerType: "touch" });

  await expect(page.locator("[data-register-x-main]")).toHaveText("3.");
  await expect(page.locator("[data-register-y-main]")).toHaveText("5.");
  await expect(page.locator('[data-stack-count]')).toHaveText("STACK: 2");
});

test("supports trig functions and angle mode cycling", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="digit"][data-value="0"]').click();
  await page.locator('[data-action="sin"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("0.5");

  await page.locator('[data-action="drg"]').first().click();
  await expect(page.locator('[data-angle-mode]')).toHaveText("RAD");
  await page.locator('[data-action="drg"]').first().click();
  await expect(page.locator('[data-angle-mode]')).toHaveText("GRAD");
  await page.locator('[data-action="drg"]').first().click();
  await expect(page.locator('[data-angle-mode]')).toHaveText("DEG");
});

test("supports shift secondary scientific functions", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('[data-shift-mode]')).toBeHidden();
  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="shift"]').click();
  await expect(page.locator('[data-shift-mode]')).toHaveText("SHIFT");
  await page.locator('[data-action="square"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("27.");
  await expect(page.locator('[data-shift-mode]')).toBeHidden();

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="shift"]').click();
  await expect(page.locator('[data-shift-mode]')).toHaveText("SHIFT");
  await page.locator('[data-action="ln"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("7.389056099");
  await expect(page.locator('[data-shift-mode]')).toBeHidden();
});

test("toggles the shift indicator each time shift is pressed", async ({ page }) => {
  await page.goto("/");

  const indicator = page.locator('[data-shift-mode]');
  await expect(indicator).toBeHidden();

  await page.locator('[data-action="shift"]').click();
  await expect(indicator).toHaveText("SHIFT");

  await page.locator('[data-action="shift"]').click();
  await expect(indicator).toBeHidden();
});

test("supports memory and result history dialog", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="4"]').click();
  await page.locator('[data-action="memory-store"]').nth(0).click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="backspace"]').click();
  await page.locator('[data-action="memory-recall"]').nth(0).click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("4.");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="add"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="enter"]').click();
  await expect(page.locator('[data-dialog-title]')).toHaveText("Result History");
  await expect(page.locator('[data-dialog-body]')).toContainText("5.");
  await page.locator('[data-dialog-action="result-history"][data-dialog-id="0"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("5.");

  await page.reload();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="enter"]').click();
  await expect(page.locator('[data-dialog-title]')).toHaveText("Result History");
  await expect(page.locator('[data-dialog-body]')).toContainText("5.");
  await page.locator('[data-dialog-close]').click();

  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-dialog-action="result-history-clear"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="enter"]').click();
  await expect(page.locator('[data-dialog-title]')).toHaveText("Result History");
  await expect(page.locator('[data-dialog-body]')).not.toContainText("5.");
});

test("supports undo and constants", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="9"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="digit"][data-value="9"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("0.");

  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="digit"][data-value="1"]').click();
  await expect(page.locator("[data-register-x-main]")).toContainText("3.141592");
});

test("supports factorial, combination, and permutation", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="5"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="digit"][data-value="4"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("120.");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="5"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="digit"][data-value="5"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("10.");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="5"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="digit"][data-value="6"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("20.");
});

test("supports percent and delta percent in RPN style", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="digit"][data-value="0"]').click();
  await page.locator('[data-action="digit"][data-value="0"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="digit"][data-value="0"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="reciprocal"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("20.");
  await expect(page.locator("[data-register-y-main]")).toHaveText("200.");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="digit"][data-value="0"]').click();
  await page.locator('[data-action="digit"][data-value="0"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="digit"][data-value="0"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="digit"][data-value="3"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("20.");
});

test("supports hyp and inverse hyp modes", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="hyp"]').click();
  await expect(page.locator('[data-hyp-mode]')).toHaveText("HYP");
  await page.locator('[data-action="sin"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("1.175201194");
  await expect(page.locator('[data-hyp-mode]')).toBeHidden();

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="hyp"]').click();
  await expect(page.locator('[data-hyp-mode]')).toHaveText("HYP-1");
  await page.locator('[data-action="sin"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("1.443635475");
});

test("supports FSE cycling and TAB stack dialog", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="digit"][data-value="2"]').click();
  await page.locator('[data-action="digit"][data-value="3"]').click();
  await page.locator('[data-action="digit"][data-value="4"]').click();
  await page.locator('[data-action="enter"]').click();
  await page.locator('[data-action="fse"]').click();
  await expect(page.locator('[data-format-mode]')).toHaveText("FIX");
  await expect(page.locator("[data-register-x-main]")).toHaveText("1234.0000");
  await page.locator('[data-action="fse"]').click();
  await expect(page.locator('[data-format-mode]')).toHaveText("SCI");
  await expect(page.locator("[data-register-x-main]")).toContainText("1.2340e3");

  await page.locator('[data-action="tab"]').click();
  await expect(page.locator('[data-dialog-title]')).toHaveText("Stack");
  await expect(page.locator('[data-dialog-body]')).toContainText("Y");
  await expect(page.locator('[data-dialog-body]')).toContainText("1.2340e3");
});

test("supports memory dialogs, nested constants, and nested conversions", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="9"]').click();
  await page.locator('[data-action="store-memory-menu"]').click();
  await page.locator('[data-dialog-action="memory"][data-dialog-id="2"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="backspace"]').click();
  await page.locator('[data-action="recall-memory-menu"]').click();
  await page.locator('[data-dialog-action="memory"][data-dialog-id="2"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("9.");

  await page.goto("/");
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="toggle-sign"]').click();
  await expect(page.locator('[data-dialog-title]')).toHaveText("Constants");
  await expect(page.locator('[data-dialog-body]')).toContainText("Universal");
  await page.locator('[data-dialog-action="constant-group"][data-dialog-id="0"]').click();
  await expect(page.locator('[data-dialog-title]')).toHaveText("Universal");
  await page.locator('[data-dialog-action="constant-item"][data-dialog-id="0:0"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("299792458.");

  await page.goto("/");
  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="digit"][data-value="0"]').click();
  await expect(page.locator('[data-dialog-title]')).toHaveText("Convert");
  await expect(page.locator('[data-dialog-body]')).toContainText("Length");
  await page.locator('[data-dialog-action="conversion-group"][data-dialog-id="0"]').click();
  await expect(page.locator('[data-dialog-title]')).toHaveText("From Unit");
  await page.locator('[data-dialog-action="conversion-from"][data-dialog-id="0:3"]').click();
  await expect(page.locator('[data-dialog-title]')).toHaveText("To Unit");
  await page.locator('[data-dialog-action="conversion-to"][data-dialog-id="0:3:6"]').click();
  await expect(page.locator("[data-register-x-main]")).toHaveText("39.37007874");
});

test("supports radix mode switching", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="digit"][data-value="1"]').click();
  await page.locator('[data-action="digit"][data-value="5"]').click();
  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="divide"]').click();
  await expect(page.locator('[data-radix-mode]')).toHaveText("HEX");
  await expect(page.locator("[data-register-x-main]")).toHaveText("F");

  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="add"]').click();
  await expect(page.locator('[data-radix-mode]')).toHaveText("OCT");
  await expect(page.locator("[data-register-x-main]")).toHaveText("17");

  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="subtract"]').click();
  await expect(page.locator('[data-radix-mode]')).toHaveText("BIN");
  await expect(page.locator("[data-register-x-main]")).toContainText("1111");

  await page.locator('[data-action="shift"]').click();
  await page.locator('[data-action="multiply"]').click();
  await expect(page.locator('[data-radix-mode]')).toBeHidden();
  await expect(page.locator("[data-register-x-main]")).toHaveText("15.");
});
