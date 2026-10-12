import { describe, expect, it } from "vitest";
import {
  emailSchema,
  fileBaseNameSchema,
  fullNameSchema,
  isValidAppwriteId,
  otpSchema,
  parseShareEmails,
  parseSort,
  sanitizeFileTypes,
  sanitizeUploadName,
  validateRecipients,
  validateUploadFile,
} from "@/lib/validation";
import { MAX_FILE_SIZE, MAX_SHARE_RECIPIENTS } from "@/constants";

describe("auth input validation", () => {
  it("normalises valid emails and rejects invalid ones", () => {
    expect(emailSchema.parse("  Alice@Example.COM ")).toBe("alice@example.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("").success).toBe(false);
  });

  it("validates full names", () => {
    expect(fullNameSchema.safeParse("A").success).toBe(false);
    expect(fullNameSchema.parse("  Ada Lovelace ")).toBe("Ada Lovelace");
    expect(fullNameSchema.safeParse("x".repeat(51)).success).toBe(false);
  });

  it("only accepts 6-character alphanumeric OTP codes", () => {
    expect(otpSchema.safeParse("123456").success).toBe(true);
    expect(otpSchema.safeParse("ab3c45").success).toBe(true);
    expect(otpSchema.safeParse("12345").success).toBe(false);
    expect(otpSchema.safeParse("12345!").success).toBe(false);
    expect(otpSchema.safeParse("1234567").success).toBe(false);
    expect(otpSchema.safeParse("' OR 1").success).toBe(false);
  });

  it("validates Appwrite ids", () => {
    expect(isValidAppwriteId("6712ab34cd56ef")).toBe(true);
    expect(isValidAppwriteId("../etc/passwd")).toBe(false);
    expect(isValidAppwriteId("a".repeat(37))).toBe(false);
    expect(isValidAppwriteId("")).toBe(false);
    expect(isValidAppwriteId(undefined)).toBe(false);
  });
});

describe("file name rules", () => {
  it("rejects empty names, slashes and control characters on rename", () => {
    expect(fileBaseNameSchema.safeParse("   ").success).toBe(false);
    expect(fileBaseNameSchema.safeParse("../secret").success).toBe(false);
    expect(fileBaseNameSchema.safeParse("a\\b").success).toBe(false);
    expect(fileBaseNameSchema.safeParse("bad\u0000name").success).toBe(false);
    expect(fileBaseNameSchema.safeParse("..").success).toBe(false);
    expect(fileBaseNameSchema.parse(" Report 2026 ")).toBe("Report 2026");
  });

  it("strips directories and control characters from uploaded names", () => {
    expect(sanitizeUploadName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeUploadName("C:\\Users\\me\\photo.png")).toBe("photo.png");
    expect(sanitizeUploadName("na\u0007me.txt")).toBe("name.txt");
    expect(sanitizeUploadName("   ")).toBe("untitled");
    expect(sanitizeUploadName("..")).toBe("untitled");
  });

  it("caps long names but keeps the extension", () => {
    const name = sanitizeUploadName(`${"a".repeat(400)}.pdf`);
    expect(name.length).toBe(255);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("upload validation", () => {
  it("accepts files within the limit", () => {
    expect(validateUploadFile({ name: "a.txt", size: 10 })).toBeNull();
    expect(validateUploadFile({ name: "a.txt", size: MAX_FILE_SIZE })).toBeNull();
  });

  it("rejects empty, unnamed and oversized files", () => {
    expect(validateUploadFile({ name: "a.txt", size: 0 })).toMatch(/empty/);
    expect(validateUploadFile({ name: "", size: 5 })).toMatch(/no name/);
    expect(validateUploadFile({ name: "a.bin", size: MAX_FILE_SIZE + 1 })).toMatch(
      /too large/,
    );
  });
});

describe("sharing", () => {
  it("parses comma/space separated emails, de-duplicates and reports invalid ones", () => {
    expect(parseShareEmails("a@x.com, B@x.com;a@x.com  c@y.org")).toEqual({
      emails: ["a@x.com", "b@x.com", "c@y.org"],
      invalid: [],
    });
    expect(parseShareEmails("a@x.com, nope").invalid).toEqual(["nope"]);
    expect(parseShareEmails("  ").emails).toEqual([]);
  });

  it("validates the stored recipient list and drops the owner", () => {
    expect(validateRecipients(["A@x.com", "a@x.com", "owner@x.com"], "owner@x.com")).toEqual({
      ok: true,
      emails: ["a@x.com"],
    });
    expect(validateRecipients(["bad"]).ok).toBe(false);
    expect(validateRecipients("a@x.com").ok).toBe(false);

    const many = Array.from({ length: MAX_SHARE_RECIPIENTS + 1 }, (_, i) => `u${i}@x.com`);
    expect(validateRecipients(many).ok).toBe(false);
  });
});

describe("queries", () => {
  it("whitelists sort fields and orders", () => {
    expect(parseSort("size-desc")).toEqual({ field: "size", order: "desc" });
    expect(parseSort("$createdAt-asc")).toEqual({ field: "$createdAt", order: "asc" });
    expect(parseSort("password-asc")).toEqual({ field: "$createdAt", order: "desc" });
    expect(parseSort("name-sideways")).toEqual({ field: "$createdAt", order: "desc" });
    expect(parseSort(undefined)).toEqual({ field: "$createdAt", order: "desc" });
  });

  it("keeps only known file types", () => {
    expect(sanitizeFileTypes(["image", "evil", "video"])).toEqual(["image", "video"]);
    expect(sanitizeFileTypes("image")).toEqual([]);
  });
});
