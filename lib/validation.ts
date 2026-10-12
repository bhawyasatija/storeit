import { z } from "zod";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL, MAX_SHARE_RECIPIENTS } from "@/constants";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Enter a valid email address");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(50, "Name must be at most 50 characters");

// Email OTPs are 6 digits; Appwrite tokens issued by an admin (e.g. for
// support or tests) are 6 alphanumeric characters. Appwrite verifies both.
export const otpSchema = z
  .string()
  .regex(/^[A-Za-z0-9]{6}$/, "Enter the 6-character code");

// Appwrite IDs: up to 36 chars of a-z, A-Z, 0-9, period, hyphen, underscore.
export const appwriteIdSchema = z
  .string()
  .min(1)
  .max(36)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Invalid id");

export const isValidAppwriteId = (id: unknown): id is string =>
  appwriteIdSchema.safeParse(id).success;

// File name without its extension, as entered in the rename dialog.
export const fileBaseNameSchema = z
  .string()
  .trim()
  .min(1, "Name cannot be empty")
  .max(200, "Name is too long")
  // eslint-disable-next-line no-control-regex
  .refine((v) => !/[\\/\u0000-\u001f\u007f]/.test(v), {
    message: "Name cannot contain slashes or control characters",
  })
  .refine((v) => v !== "." && v !== "..", { message: "Invalid name" });

export const FILE_TYPES = [
  "document",
  "image",
  "video",
  "audio",
  "other",
] as const;

export const sanitizeFileTypes = (types: unknown): FileType[] =>
  Array.isArray(types)
    ? (types.filter((t) =>
        (FILE_TYPES as readonly string[]).includes(t as string),
      ) as FileType[])
    : [];

const SORT_FIELDS = ["$createdAt", "name", "size"] as const;
type SortField = (typeof SORT_FIELDS)[number];

/** Parses "field-order" (e.g. "size-desc"); falls back to newest first. */
export const parseSort = (
  sort?: string | null,
): { field: SortField; order: "asc" | "desc" } => {
  const fallback = { field: "$createdAt" as SortField, order: "desc" as const };
  if (!sort) return fallback;

  const idx = sort.lastIndexOf("-");
  if (idx <= 0) return fallback;

  const field = sort.slice(0, idx);
  const order = sort.slice(idx + 1);

  if (!(SORT_FIELDS as readonly string[]).includes(field)) return fallback;
  if (order !== "asc" && order !== "desc") return fallback;

  return { field: field as SortField, order };
};

/**
 * Splits free-form recipient input ("a@x.com, b@y.com") into normalised,
 * de-duplicated emails and the entries that are not valid emails.
 */
export const parseShareEmails = (input: string) => {
  const parts = input
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const emails: string[] = [];
  const invalid: string[] = [];

  for (const part of parts) {
    const parsed = emailSchema.safeParse(part);
    if (!parsed.success) invalid.push(part);
    else if (!emails.includes(parsed.data)) emails.push(parsed.data);
  }

  return { emails, invalid };
};

/** Validates the full recipient list that will be stored on a file. */
export const validateRecipients = (
  emails: unknown,
  ownerEmail?: string,
): { ok: true; emails: string[] } | { ok: false; error: string } => {
  if (!Array.isArray(emails)) return { ok: false, error: "Invalid recipients" };

  const normalised: string[] = [];
  for (const raw of emails) {
    const parsed = emailSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: `"${String(raw)}" is not a valid email` };
    }
    if (ownerEmail && parsed.data === ownerEmail.toLowerCase()) continue;
    if (!normalised.includes(parsed.data)) normalised.push(parsed.data);
  }

  if (normalised.length > MAX_SHARE_RECIPIENTS) {
    return {
      ok: false,
      error: `A file can be shared with at most ${MAX_SHARE_RECIPIENTS} people`,
    };
  }

  return { ok: true, emails: normalised };
};

/** Returns an error message, or null when the file can be uploaded. */
export const validateUploadFile = (file: {
  name?: string;
  size: number;
}): string | null => {
  if (!file.name || !file.name.trim()) return "File has no name";
  if (file.size <= 0) return "File is empty";
  if (file.size > MAX_FILE_SIZE)
    return `File is too large. Max file size is ${MAX_FILE_SIZE_LABEL}.`;
  return null;
};

/**
 * Makes an uploaded file name safe to store and display: drops any directory
 * components, control characters and surrounding whitespace, and caps the
 * length while keeping the extension.
 */
export const sanitizeUploadName = (name: string): string => {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  let clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();

  if (!clean || clean === "." || clean === "..") clean = "untitled";

  if (clean.length > 255) {
    const dot = clean.lastIndexOf(".");
    const ext = dot > 0 ? clean.slice(dot) : "";
    clean = clean.slice(0, 255 - ext.length) + (ext.length <= 20 ? ext : "");
  }

  return clean;
};
