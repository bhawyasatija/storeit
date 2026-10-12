import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  fileDownloadUrl,
  fileViewUrl,
  isInlineSafeMimeType,
} from "@/lib/file-response";

describe("serving files", () => {
  it("only renders passive formats inline", () => {
    expect(isInlineSafeMimeType("image/png")).toBe(true);
    expect(isInlineSafeMimeType("application/pdf")).toBe(true);
    expect(isInlineSafeMimeType("text/plain; charset=utf-8")).toBe(true);
    expect(isInlineSafeMimeType("text/html")).toBe(false);
    expect(isInlineSafeMimeType("image/svg+xml")).toBe(false);
    expect(isInlineSafeMimeType("application/javascript")).toBe(false);
    expect(isInlineSafeMimeType("")).toBe(false);
  });

  it("builds a safe Content-Disposition with a UTF-8 name", () => {
    const value = contentDisposition("attachment", 'résumé "final".pdf');
    expect(value).toBe(
      `attachment; filename="r_sum_ _final_.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22final%22.pdf`,
    );
    expect(contentDisposition("inline", "a\r\nSet-Cookie: x")).not.toMatch(/[\r\n]/);
  });

  it("builds same-origin file URLs", () => {
    expect(fileViewUrl("abc")).toBe("/api/files/abc");
    expect(fileDownloadUrl("a/b")).toBe("/api/files/a%2Fb?download=1");
  });
});
