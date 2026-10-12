import { describe, expect, it } from "vitest";
import {
  calculatePercentage,
  convertFileSize,
  getFileType,
  getFileTypesParams,
  getOwnerName,
  getTypeRoute,
} from "@/lib/utils";

describe("utils", () => {
  it("classifies files by extension", () => {
    expect(getFileType("Report.PDF")).toEqual({ type: "document", extension: "pdf" });
    expect(getFileType("photo.jpeg")).toEqual({ type: "image", extension: "jpeg" });
    expect(getFileType("clip.mov")).toEqual({ type: "video", extension: "mov" });
    expect(getFileType("song.flac")).toEqual({ type: "audio", extension: "flac" });
    expect(getFileType("archive.zip")).toEqual({ type: "other", extension: "zip" });
    expect(getFileType("Makefile")).toEqual({ type: "other", extension: "" });
    expect(getFileType(".env")).toEqual({ type: "other", extension: "" });
  });

  it("formats sizes", () => {
    expect(convertFileSize(500)).toBe("500 Bytes");
    expect(convertFileSize(1536)).toBe("1.5 KB");
    expect(convertFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("caps usage percentage at 100", () => {
    expect(calculatePercentage(0)).toBe(0);
    expect(calculatePercentage(1024 * 1024 * 1024)).toBe(50);
    expect(calculatePercentage(10 * 1024 * 1024 * 1024)).toBe(100);
  });

  it("maps routes to types and back", () => {
    expect(getFileTypesParams("media")).toEqual(["video", "audio"]);
    expect(getFileTypesParams("nope")).toBeNull();
    expect(getTypeRoute("audio")).toBe("/media");
    expect(getTypeRoute("image")).toBe("/images");
  });

  it("reads owner names defensively", () => {
    expect(getOwnerName({ fullName: "Ada" })).toBe("Ada");
    expect(getOwnerName("ownerId")).toBe("");
    expect(getOwnerName(null)).toBe("");
  });
});

describe("convertFileSize precision", () => {
  it("honours an explicit 0 decimal places", () => {
    // Regression: `digits || 1` used to turn 0 into 1 ("2.0 GB").
    expect(convertFileSize(2 * 1024 * 1024 * 1024, 0)).toBe("2 GB");
    expect(convertFileSize(1536, 0)).toBe("2 KB");
    expect(convertFileSize(1536)).toBe("1.5 KB");
  });
});
