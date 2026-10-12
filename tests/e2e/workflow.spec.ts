import { BrowserContext, expect, Page, test } from "@playwright/test";
import {
  createOtp,
  createSessionSecret,
  createTestUser,
  deleteTestUser,
  liveConfigured,
  TestUser,
} from "./helpers/appwrite";

// Live workflow against the real Appwrite project in .env.local.
// Run with: E2E_LIVE=1 npm run test:e2e
// It creates two throwaway users (@example.com) and deletes them afterwards.

test.describe.configure({ mode: "serial" });
test.skip(!liveConfigured, "Set E2E_LIVE=1 with a configured .env.local to run");

let alice: TestUser;
let bob: TestUser;
let aliceCtx: BrowserContext;
let bobCtx: BrowserContext;
let alicePage: Page;
let fileId = "";

const COOKIE = "appwrite-session";
const TEXT = "hello from the StoreIt e2e suite\n";

const signInWithCookie = async (ctx: BrowserContext, user: TestUser, baseURL: string) => {
  const secret = await createSessionSecret(user);
  const { hostname } = new URL(baseURL);
  await ctx.addCookies([
    { name: COOKIE, value: secret, domain: hostname, path: "/", httpOnly: true, sameSite: "Strict" },
  ]);
};

const openActions = async (page: Page, fileName: RegExp | string) => {
  await page.getByRole("button", { name: `Actions for ${fileName}` }).first().click();
};

test.beforeAll(async ({ browser }) => {
  alice = await createTestUser("alice");
  bob = await createTestUser("bob");
  aliceCtx = await browser.newContext();
  bobCtx = await browser.newContext();
  alicePage = await aliceCtx.newPage();
});

test.afterAll(async () => {
  await aliceCtx?.close();
  await bobCtx?.close();
  if (alice) await deleteTestUser(alice);
  if (bob) await deleteTestUser(bob);
});

test("sign in with an email OTP", async () => {
  const page = alicePage;
  await page.goto("/sign-in");
  await page.getByPlaceholder("Enter your email").fill(alice.email);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page.getByText("Enter Your OTP")).toBeVisible({ timeout: 20_000 });

  // A wrong code is rejected with a clear message.
  await page.getByRole("textbox", { name: "One-time code" }).fill("000000");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("That code is invalid or has expired")).toBeVisible({ timeout: 20_000 });

  // The real code (what the email would contain) signs the user in.
  const otp = await createOtp(alice);
  await page.getByRole("textbox", { name: "One-time code" }).fill(otp);
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Recent files" })).toBeVisible();
  await expect(page.getByText(alice.email).first()).toBeVisible();
});

test("unknown accounts get a helpful sign-in error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Enter your email").fill(`nobody-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("No account found for this email")).toBeVisible({ timeout: 20_000 });
});

test("upload a file with progress and see it listed", async () => {
  const page = alicePage;
  await page.getByTestId("file-input").first().setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(TEXT),
  });

  await expect(page.getByText("Uploaded 1 file", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("hello.txt").first()).toBeVisible({ timeout: 15_000 });

  const href = await page.getByRole("link", { name: "Open hello.txt" }).first().getAttribute("href");
  fileId = href!.split("/").pop()!;
  expect(fileId).toMatch(/^[a-zA-Z0-9]+$/);

  // Dashboard usage reflects the upload.
  await page.reload();
  await expect(page.getByText(/% ?Space used/).first()).toBeVisible();
});

test("upload limits and validation are enforced on the server", async () => {
  const api = aliceCtx.request;

  const empty = await api.post("/api/files", {
    multipart: { file: { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) } },
  });
  expect(empty.status()).toBe(400);

  const tooBig = await api.post("/api/files", {
    multipart: {
      file: {
        name: "big.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(51 * 1024 * 1024),
      },
    },
  });
  expect(tooBig.status()).toBe(413);
  expect((await tooBig.json()).error).toMatch(/too large/i);

  const noFile = await api.post("/api/files", { multipart: { other: "x" } });
  expect(noFile.status()).toBe(400);
});

test("owner can view and download; others cannot", async ({ baseURL }) => {
  const view = await aliceCtx.request.get(`/api/files/${fileId}`);
  expect(view.status()).toBe(200);
  expect(await view.text()).toBe(TEXT);
  expect(view.headers()["content-type"]).toContain("text/plain");
  expect(view.headers()["content-disposition"]).toMatch(/^inline;/);
  expect(view.headers()["x-content-type-options"]).toBe("nosniff");

  const download = await aliceCtx.request.get(`/api/files/${fileId}?download=1`);
  expect(download.headers()["content-disposition"]).toMatch(/^attachment;.*hello\.txt/);

  await signInWithCookie(bobCtx, bob, baseURL!);
  const asBob = await bobCtx.request.get(`/api/files/${fileId}`);
  expect(asBob.status()).toBe(404);

  const anonymous = await (await bobCtx.browser()!.newContext()).request.get(
    `${baseURL}/api/files/${fileId}`,
  );
  expect(anonymous.status()).toBe(401);
});

test("active content is never rendered inline", async () => {
  const page = alicePage;
  await page.getByTestId("file-input").first().setInputFiles({
    name: "page.html",
    mimeType: "text/html",
    buffer: Buffer.from("<script>alert(document.cookie)</script>"),
  });
  await expect(page.getByText("page.html").first()).toBeVisible({ timeout: 30_000 });
  const href = await page.getByRole("link", { name: "Open page.html" }).first().getAttribute("href");

  const res = await aliceCtx.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/octet-stream");
  expect(res.headers()["content-disposition"]).toMatch(/^attachment;/);
  expect(res.headers()["content-security-policy"]).toContain("sandbox");
});

test("share with another user, who can then open it but not manage it", async () => {
  const page = alicePage;
  await openActions(page, "hello.txt");
  await page.getByRole("menuitem", { name: "Share" }).click();
  await page.getByLabel("Email addresses to share with").fill(`not-an-email, ${bob.email}`);
  await page.getByRole("button", { name: "share" }).click();
  await expect(page.getByText("Not a valid email: not-an-email")).toBeVisible();

  await page.getByLabel("Email addresses to share with").fill(bob.email.toUpperCase());
  await page.getByRole("button", { name: "share" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });

  const asBob = await bobCtx.request.get(`/api/files/${fileId}`);
  expect(asBob.status()).toBe(200);

  const bobPage = await bobCtx.newPage();
  await bobPage.goto("/documents");
  await expect(bobPage.getByText("hello.txt")).toBeVisible();
  await expect(bobPage.getByText(`Shared by: ${alice.name}`)).toBeVisible();
  await openActions(bobPage, "hello.txt");
  await expect(bobPage.getByRole("menuitem", { name: "Download" })).toBeVisible();
  await expect(bobPage.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await expect(bobPage.getByRole("menuitem", { name: "Share" })).toHaveCount(0);
  await bobPage.close();
});

test("search, sort and rename", async () => {
  const page = alicePage;
  await page.getByLabel("Search files").fill("hello");
  await expect(page.getByRole("option", { name: /hello\.txt/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("option", { name: /hello\.txt/ }).click();
  await expect(page).toHaveURL(/\/documents\?query=hello/);

  await page.goto("/documents?sort=name-asc");
  await expect(page.getByRole("combobox", { name: "Sort files" })).toContainText("Name (A-Z)");

  await openActions(page, "hello.txt");
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("New file name").fill("../renamed");
  await page.getByRole("button", { name: "rename" }).click();
  await expect(page.getByText("Name cannot contain slashes")).toBeVisible();

  await page.getByLabel("New file name").fill("renamed");
  await page.getByRole("button", { name: "rename" }).click();
  await expect(page.getByText("renamed.txt").first()).toBeVisible({ timeout: 20_000 });
});

test("stop sharing revokes access", async () => {
  const page = alicePage;
  await openActions(page, "renamed.txt");
  await page.getByRole("menuitem", { name: "Share" }).click();
  await page.getByRole("button", { name: `Stop sharing with ${bob.email}` }).click();
  await expect(page.getByText("0 users")).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");

  const asBob = await bobCtx.request.get(`/api/files/${fileId}`);
  expect(asBob.status()).toBe(404);
});

test("delete removes the file and its content", async () => {
  const page = alicePage;
  await openActions(page, "renamed.txt");
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "delete" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText("renamed.txt")).toHaveCount(0, { timeout: 15_000 });

  const after = await aliceCtx.request.get(`/api/files/${fileId}`);
  expect(after.status()).toBe(404);
});

test("sign out clears the session", async () => {
  const page = alicePage;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/, { timeout: 20_000 });
  const res = await aliceCtx.request.get("/api/files/anything");
  expect(res.status()).toBe(401);
});
