import { describe, expect, it } from "vitest";
import { canAccessFile, getOwnerId, isFileOwner } from "@/lib/file-access";

const owner = { $id: "owner1", email: "owner@x.com" };
const friend = { $id: "friend1", email: "friend@x.com" };
const stranger = { $id: "stranger1", email: "stranger@x.com" };

const file = { owner: { $id: "owner1" }, users: ["Friend@x.com"] };

describe("file access rules", () => {
  it("reads the owner id from an expanded or plain relationship", () => {
    expect(getOwnerId(file)).toBe("owner1");
    expect(getOwnerId({ owner: "owner1" })).toBe("owner1");
    expect(getOwnerId({ owner: null })).toBeNull();
  });

  it("lets the owner do everything", () => {
    expect(isFileOwner(file, owner)).toBe(true);
    expect(canAccessFile(file, owner)).toBe(true);
  });

  it("lets recipients read but not manage (case-insensitive email match)", () => {
    expect(canAccessFile(file, friend)).toBe(true);
    expect(isFileOwner(file, friend)).toBe(false);
  });

  it("denies everyone else", () => {
    expect(canAccessFile(file, stranger)).toBe(false);
    expect(canAccessFile(file, null)).toBe(false);
    expect(canAccessFile({ owner: null, users: [] }, owner)).toBe(false);
  });
});
