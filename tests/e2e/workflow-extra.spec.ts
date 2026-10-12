import { BrowserContext, expect, Page, test } from "@playwright/test";
import {
  createOtp,
  createSessionSecret,
  createTestUser,
  deleteTestUser,
  liveConfigured,
  TestUser,
} from "./helpers/appwrite";

// Additional live checks: OTP reuse, client-side upload validation, name
// sanitising, multi-recipient sharing, dashboard usage and mobile navigation.
// Run with: E2E_LIVE=1 npm run test:e2e

test.describe.configure({ mode: "serial" });
test.skip(!liveConfigured, "Set E2E_LIVE=1 with a configured .env.local to run");

let owner: TestUser;
let r1: TestUser;
let r2: TestUser;
let ownerCtx: BrowserContext;
let r1Ctx: BrowserContext;
let r2Ctx: BrowserContext;
let page: Page;
let fileId = "";

const signInWithCookie = async (ctx: BrowserContext, user: TestUser, baseURL: string) => {
  const secret = await createSessionSecret(user);
  await ctx.addCookies([
    {
      name: "appwrite-session",
      value: secret,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
};

test.beforeAll(async ({ browser, baseURL }) => {
  owner = await createTestUser("owner");
  r1 = await createTestUser("r1");
  r2 = await createTestUser("r2");
  ownerCtx = await browser.newContext();
  r1Ctx = await browser.newContext();
  r2Ctx = await browser.newContext();
  await signInWithCookie(ownerCtx, owner, baseURL!);
  await signInWithCookie(r1Ctx, r1, baseURL!);
  await signInWithCookie(r2Ctx, r2, baseURL!);
  page = await ownerCtx.newPage();
});

test.afterAll(async () => {
  await Promise.all([ownerCtx, r1Ctx, r2Ctx].map((c) => c?.close()));
  for (const u of [owner, r1, r2]) if (u) await deleteTestUser(u);
});

test("a sign-in code works once and cannot be reused", async ({ browser }) => {
  const code = await createOtp(owner);

  const signInWith = async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/sign-in");
    await p.getByPlaceholder("Enter your email").fill(owner.email);
    await p.getByRole("button", { name: "Sign In" }).click();
    await expect(p.getByText("Enter Your OTP")).toBeVisible({ timeout: 20_000 });
    await p.getByRole("textbox", { name: "One-time code" }).fill(code);
    await p.getByRole("button", { name: "Submit" }).click();
    return { ctx, p };
  };

  const first = await signInWith();
  await expect(first.p).toHaveURL(/\/$/, { timeout: 30_000 });
  await first.ctx.close();

  const second = await signInWith();
  await expect(second.p.getByText("That code is invalid or has expired")).toBeVisible({ timeout: 20_000 });
  await expect(second.p).toHaveURL(/\/sign-in$/);
  await second.ctx.close();
});

test("the browser rejects empty and oversized files before uploading", async () => {
  await page.goto("/");
  let uploadRequests = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/files") uploadRequests++;
  });

  const input = page.getByTestId("file-input").first();
  await input.setInputFiles({ name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) });
  await expect(page.getByText("File is empty").first()).toBeVisible();

  await input.setInputFiles({
    name: "huge.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(50_000_001),
  });
  await expect(page.getByText(/File is too large/).first()).toBeVisible();
  expect(uploadRequests).toBe(0);
});

test("uploaded names are stripped of directory components", async () => {
  const res = await ownerCtx.request.post("/api/files", {
    multipart: {
      file: { name: "../../etc/report.txt", mimeType: "text/plain", buffer: Buffer.from("report body") },
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.file.name).toBe("report.txt");
  fileId = body.file.$id;
});

test("sharing with a second person keeps the first; removing one keeps the other", async () => {
  const share = async (email: string) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: "Actions for report.txt" }).first().click();
    await page.getByRole("menuitem", { name: "Share" }).click();
    await page.getByLabel("Email addresses to share with").fill(email);
    await page.getByRole("button", { name: "share" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
  };

  await share(r1.email);
  await share(r2.email);
  expect((await r1Ctx.request.get(`/api/files/${fileId}`)).status()).toBe(200);
  expect((await r2Ctx.request.get(`/api/files/${fileId}`)).status()).toBe(200);

  await page.goto("/documents");
  await page.getByRole("button", { name: "Actions for report.txt" }).first().click();
  await page.getByRole("menuitem", { name: "Share" }).click();
  await expect(page.getByText(r1.email)).toBeVisible();
  await page.getByLabel(`Stop sharing with ${r2.email}`).click();
  await expect(page.getByLabel(`Stop sharing with ${r2.email}`)).toHaveCount(0);
  await page.keyboard.press("Escape");

  expect((await r2Ctx.request.get(`/api/files/${fileId}`)).status()).toBe(404);
  expect((await r1Ctx.request.get(`/api/files/${fileId}`)).status()).toBe(200);
});

test("dashboard shows storage usage for the owner's files", async () => {
  await page.goto("/");
  await expect(page.getByText("Space used")).toBeVisible();
  await expect(page.getByText(/free of 2 GB/)).toBeVisible();
  await expect(page.getByText("report.txt").first()).toBeVisible();
});

test("mobile: navigation sheet works and nothing overflows horizontally", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInWithCookie(ctx, owner, baseURL!);
  const p = await ctx.newPage();
  await p.goto("/");
  await p.getByRole("button", { name: "Open menu" }).click();
  await p.getByRole("link", { name: "Documents" }).last().click();
  await expect(p).toHaveURL(/\/documents$/);
  await expect(p.getByText("report.txt").first()).toBeVisible();
  const overflow = await p.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});
