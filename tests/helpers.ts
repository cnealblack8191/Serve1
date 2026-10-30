import { expect, type Page } from "@playwright/test";

/** Demo accounts of the local backend (src/data/local/seed.ts). */
export const DEMO = {
  admin: { email: "admin@serv1.demo", password: "serv1demo" },
  office: { email: "office@serv1.demo", password: "serv1demo" },
  owner: { email: "owner@serv1.demo", password: "serv1demo" },
  tech1: { email: "tech1@serv1.demo", password: "serv1demo" },
  tech2: { email: "tech2@serv1.demo", password: "serv1demo" },
};

export async function signIn(page: Page, who: keyof typeof DEMO) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(DEMO[who].email);
  await page.getByLabel("Password", { exact: true }).fill(DEMO[who].password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/auth/);
}
