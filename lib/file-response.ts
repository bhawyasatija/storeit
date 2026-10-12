// Helpers for serving stored files back to the browser safely.

// Types that browsers render without executing script in our origin.
// Everything else (HTML, SVG, XML, JS, unknown) is forced to download.
const INLINE_SAFE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
  "audio/mp4",
  "application/pdf",
  "text/plain",
]);

export const normaliseMimeType = (mime: string | null | undefined) =>
  (mime ?? "").split(";")[0].trim().toLowerCase();

export const isInlineSafeMimeType = (mime: string | null | undefined) =>
  INLINE_SAFE_MIME_TYPES.has(normaliseMimeType(mime));

/** RFC 6266 / RFC 5987 Content-Disposition value with a UTF-8 file name. */
export const contentDisposition = (
  type: "inline" | "attachment",
  fileName: string,
) => {
  const fallback =
    fileName
      // eslint-disable-next-line no-control-regex
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "download";

  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};

export const fileViewUrl = (fileId: string) =>
  `/api/files/${encodeURIComponent(fileId)}`;

export const fileDownloadUrl = (fileId: string) =>
  `${fileViewUrl(fileId)}?download=1`;
