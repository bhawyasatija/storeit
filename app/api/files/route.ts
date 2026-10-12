import { NextRequest, NextResponse } from "next/server";
import { AppwriteException } from "node-appwrite";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { CurrentUser, FileAccessError, storeUploadedFile } from "@/lib/server/files";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from "@/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Room for multipart boundaries and headers around a max-size file.
const MAX_REQUEST_BYTES = MAX_FILE_SIZE + 1024 * 1024;

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Upload a single file (multipart/form-data, field "file").
 * The browser uploads with XMLHttpRequest so it can show real progress.
 */
export async function POST(request: NextRequest) {
  const user = (await getCurrentUser()) as CurrentUser | null;
  if (!user) return json(401, { error: "You need to sign in" });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return json(413, {
      error: `File is too large. Max file size is ${MAX_FILE_SIZE_LABEL}.`,
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: "Expected a multipart form upload" });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return json(400, { error: "No file provided" });

  try {
    const document = await storeUploadedFile(file, user);
    revalidatePath("/", "layout");

    return json(201, {
      file: { $id: document.$id, name: document.name, type: document.type },
    });
  } catch (error) {
    if (error instanceof FileAccessError) {
      return json(error.status, { error: error.message });
    }
    if (error instanceof AppwriteException) {
      console.error(`[upload] ${error.type} (${error.code})`);
      if (error.type === "storage_invalid_file_size") {
        return json(413, {
          error: `File is too large. Max file size is ${MAX_FILE_SIZE_LABEL}.`,
        });
      }
      if (error.type === "storage_file_type_unsupported") {
        return json(400, { error: "This file type is not allowed" });
      }
    } else {
      console.error("[upload]", (error as Error)?.message ?? error);
    }
    return json(500, { error: "Upload failed. Please try again." });
  }
}
