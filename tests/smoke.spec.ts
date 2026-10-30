import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("login page loads", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a wrong password is refused", async ({ page }) => {
  await page.goto("/auth");
  await page.getByLabel("Email").fill("office@serv1.demo");
  await page.getByLabel("Password", { exact: true }).fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Couldn't sign in")).toBeVisible();
  await expect(page).toHaveURL(/\/auth/);
});

test("office signs in and sees the office navigation", async ({ page }) => {
  await signIn(page, "office");
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dispatch" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("a signed-out visitor is sent to the login page", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/auth/);
});
