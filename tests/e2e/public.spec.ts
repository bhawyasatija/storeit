import { expect, test } from "@playwright/test";

// Behaviour that must hold for anyone who is not signed in.

test("protected pages redirect to sign-in", async ({ page }) => {
  for (const path of ["/", "/documents", "/images", "/media", "/others"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});

test("sign-in form validates the email before calling the server", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();

  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Email is required")).toBeVisible();

  await page.getByPlaceholder("Enter your email").fill("not-an-email");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
});

test("sign-up form validates the name", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByPlaceholder("Enter your full name").fill("A");
  await page.getByPlaceholder("Enter your email").fill("someone@example.com");
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page.getByText("Name must be at least 2 characters")).toBeVisible();
});

test("auth pages link to each other", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Sign Up" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await page.getByRole("link", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("file API rejects unauthenticated requests", async ({ request }) => {
  const download = await request.get("/api/files/some-file-id");
  expect(download.status()).toBe(401);

  const forged = await request.get("/api/files/some-file-id", {
    headers: { cookie: "appwrite-session=forged-session-value" },
  });
  expect(forged.status()).toBe(401);

  const upload = await request.post("/api/files", {
    multipart: {
      file: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hi") },
    },
  });
  expect(upload.status()).toBe(401);
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/sign-in");
  const headers = res.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("unknown routes return 404 without leaking details", async ({ request }) => {
  const res = await request.get("/this-route-does-not-exist/at/all");
  expect(res.status()).toBe(404);
});

test("sign-in page fits a phone screen @mobile", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
