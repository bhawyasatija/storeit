import { NextRequest, NextResponse } from "next/server";
import { AppwriteException } from "node-appwrite";
import { createAdminClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { CurrentUser, FileAccessError, getAccessibleFile } from "@/lib/server/files";
import {
  contentDisposition,
  isInlineSafeMimeType,
  normaliseMimeType,
} from "@/lib/file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorResponse = (status: number, message: string) =>
  NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );

/**
 * Streams a stored file to its owner or to users it was shared with.
 * `?download=1` forces a download; otherwise safe types are shown inline.
 * The bucket itself is private, so this is the only way to read a file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const user = (await getCurrentUser()) as CurrentUser | null;
    const file = await getAccessibleFile(id, user);

    const { storage } = await createAdminClient();
    const [meta, bytes] = await Promise.all([
      storage.getFile({ bucketId: appwriteConfig.bucketId, fileId: file.bucketFileId }),
      storage.getFileDownload({ bucketId: appwriteConfig.bucketId, fileId: file.bucketFileId }),
    ]);

    const mimeType = normaliseMimeType(meta.mimeType) || "application/octet-stream";
    const wantsDownload = request.nextUrl.searchParams.get("download") === "1";
    const inline = !wantsDownload && isInlineSafeMimeType(mimeType);

    const headers = new Headers({
      "Content-Type": inline ? mimeType : "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": contentDisposition(
        inline ? "inline" : "attachment",
        String(file.name || "download"),
      ),
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });

    // Defence in depth for user-supplied content served from our origin.
    // PDFs are excluded because a sandboxed document cannot load the
    // browser's PDF viewer.
    if (mimeType !== "application/pdf") {
      headers.set(
        "Content-Security-Policy",
        "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
      );
    }

    return new NextResponse(bytes, { status: 200, headers });
  } catch (error) {
    if (error instanceof FileAccessError) {
      return errorResponse(error.status, error.message);
    }
    if (error instanceof AppwriteException) {
      console.error(`[download] ${error.type} (${error.code})`);
      if (error.code === 404) return errorResponse(404, "File content is no longer available");
    } else {
      console.error("[download]", (error as Error)?.message ?? error);
    }
    return errorResponse(500, "Could not load the file");
  }
}
