import "server-only";

import { AppwriteException, ID, Models, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { createAdminClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { canAccessFile, isFileOwner } from "@/lib/file-access";
import { constructFileUrl, getFileType } from "@/lib/utils";
import {
  isValidAppwriteId,
  sanitizeUploadName,
  validateUploadFile,
} from "@/lib/validation";

export type CurrentUser = Models.DefaultRow & {
  email: string;
  fullName: string;
  accountId: string;
};

export type FileRow = Models.DefaultRow;

// Relationships are not loaded unless selected (Appwrite 1.8+).
export const FILE_SELECT = Query.select(["*", "owner.$id", "owner.fullName"]);

export class FileAccessError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 413 | 500,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Loads a file row and checks the user may access it. Files the user cannot
 * see are reported as "not found" so their existence is not leaked.
 */
export const getAccessibleFile = async (
  fileId: string,
  user: CurrentUser | null,
  { requireOwner = false } = {},
): Promise<FileRow> => {
  if (!user) throw new FileAccessError(401, "You need to sign in");
  if (!isValidAppwriteId(fileId)) throw new FileAccessError(404, "File not found");

  const { tablesDB } = await createAdminClient();

  let file: FileRow;
  try {
    file = await tablesDB.getRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.filesTableId,
      rowId: fileId,
      queries: [FILE_SELECT],
    });
  } catch (error) {
    if (error instanceof AppwriteException && error.code === 404) {
      throw new FileAccessError(404, "File not found");
    }
    throw error;
  }

  if (!canAccessFile(file, user)) throw new FileAccessError(404, "File not found");
  if (requireOwner && !isFileOwner(file, user)) {
    throw new FileAccessError(403, "Only the owner can do that");
  }

  return file;
};

/** Stores the bytes in the bucket and records the file row. */
export const storeUploadedFile = async (file: File, user: CurrentUser) => {
  const validationError = validateUploadFile(file);
  if (validationError) {
    throw new FileAccessError(
      validationError.startsWith("File is too large") ? 413 : 400,
      validationError,
    );
  }

  const name = sanitizeUploadName(file.name);
  const { type, extension } = getFileType(name);
  const { storage, tablesDB } = await createAdminClient();

  const bucketFile = await storage.createFile({
    bucketId: appwriteConfig.bucketId,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(new Uint8Array(await file.arrayBuffer()), name),
  });

  try {
    return await tablesDB.createRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.filesTableId,
      rowId: ID.unique(),
      data: {
        type,
        name,
        url: constructFileUrl(bucketFile.$id),
        extension,
        size: bucketFile.sizeOriginal,
        owner: user.$id,
        accountId: user.accountId,
        users: [],
        bucketFileId: bucketFile.$id,
      },
    });
  } catch (error) {
    // Do not leave an orphaned object in the bucket.
    await storage
      .deleteFile({ bucketId: appwriteConfig.bucketId, fileId: bucketFile.$id })
      .catch(() => undefined);
    throw error;
  }
};
