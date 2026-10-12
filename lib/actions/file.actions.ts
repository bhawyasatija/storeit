"use server";

import { createAdminClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { AppwriteException, Models, Query } from "node-appwrite";
import { parseStringify, TotalSpace } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { STORAGE_LIMIT } from "@/constants";
import {
  fileBaseNameSchema,
  parseSort,
  sanitizeFileTypes,
  validateRecipients,
} from "@/lib/validation";
import {
  CurrentUser,
  FILE_SELECT,
  FileAccessError,
  FileRow,
  getAccessibleFile,
} from "@/lib/server/files";

type ActionResult = { success: true } | { success: false; error: string };

export type FileList = { total: number; rows: FileRow[] };

const toActionError = (context: string, error: unknown): ActionResult => {
  if (error instanceof FileAccessError) {
    return { success: false, error: error.message };
  }
  if (error instanceof AppwriteException) {
    console.error(`[files] ${context}: ${error.type} (${error.code})`);
  } else {
    console.error(`[files] ${context}:`, (error as Error)?.message ?? error);
  }
  return { success: false, error: `Failed to ${context}. Please try again.` };
};

const refresh = () => revalidatePath("/", "layout");

const createQueries = (
  currentUser: Models.DefaultRow,
  types: FileType[],
  searchText: string,
  sort: string | undefined,
  limit: number,
) => {
  const queries = [
    FILE_SELECT,
    Query.or([
      Query.equal("owner", [currentUser.$id]),
      Query.contains("users", [currentUser.email]),
    ]),
    Query.limit(limit),
  ];

  if (types.length > 0) queries.push(Query.equal("type", types));
  if (searchText) queries.push(Query.contains("name", searchText));

  const { field, order } = parseSort(sort);
  queries.push(order === "asc" ? Query.orderAsc(field) : Query.orderDesc(field));

  return queries;
};

/** Files the current user owns or that were shared with them. */
export const getFiles = async ({
  types = [],
  searchText = "",
  sort = "$createdAt-desc",
  limit = 200,
}: GetFilesProps): Promise<FileList> => {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Not signed in");

  const { tablesDB } = await createAdminClient();

  const result = await tablesDB.listRows({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.filesTableId,
    queries: createQueries(
      currentUser,
      sanitizeFileTypes(types),
      String(searchText).trim().slice(0, 100),
      sort,
      Math.min(Math.max(Number(limit) || 200, 1), 200),
    ),
  });

  return parseStringify({ total: result.total, rows: result.rows });
};

export const renameFile = async ({
  fileId,
  name,
}: RenameFileProps): Promise<ActionResult> => {
  try {
    const parsed = fileBaseNameSchema.safeParse(name);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const user = (await getCurrentUser()) as CurrentUser | null;
    const file = await getAccessibleFile(fileId, user, { requireOwner: true });

    // The extension comes from the stored row, not from the client.
    const newName = file.extension
      ? `${parsed.data}.${file.extension}`
      : parsed.data;

    const { tablesDB } = await createAdminClient();
    await tablesDB.updateRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.filesTableId,
      rowId: file.$id,
      data: { name: newName },
    });

    refresh();
    return { success: true };
  } catch (error) {
    return toActionError("rename file", error);
  }
};

export const updateFileUsers = async ({
  fileId,
  emails,
}: UpdateFileUsersProps): Promise<ActionResult> => {
  try {
    const user = (await getCurrentUser()) as CurrentUser | null;
    const file = await getAccessibleFile(fileId, user, { requireOwner: true });

    const recipients = validateRecipients(emails, user?.email);
    if (!recipients.ok) return { success: false, error: recipients.error };

    const { tablesDB } = await createAdminClient();
    await tablesDB.updateRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.filesTableId,
      rowId: file.$id,
      data: { users: recipients.emails },
    });

    refresh();
    return { success: true };
  } catch (error) {
    return toActionError("update sharing", error);
  }
};

export const deleteFile = async ({
  fileId,
}: DeleteFileProps): Promise<ActionResult> => {
  try {
    const user = (await getCurrentUser()) as CurrentUser | null;
    const file = await getAccessibleFile(fileId, user, { requireOwner: true });

    const { tablesDB, storage } = await createAdminClient();

    // Remove the stored object first; tolerate it already being gone so a
    // half-deleted file can still be cleaned up.
    await storage
      .deleteFile({ bucketId: appwriteConfig.bucketId, fileId: file.bucketFileId })
      .catch((error: unknown) => {
        if (!(error instanceof AppwriteException && error.code === 404)) throw error;
      });

    await tablesDB.deleteRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.filesTableId,
      rowId: file.$id,
    });

    refresh();
    return { success: true };
  } catch (error) {
    return toActionError("delete file", error);
  }
};

// ============================== TOTAL FILE SPACE USED
export async function getTotalSpaceUsed(): Promise<TotalSpace> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Not signed in");

  const { tablesDB } = await createAdminClient();

  const totalSpace: TotalSpace = {
    image: { size: 0, latestDate: "" },
    document: { size: 0, latestDate: "" },
    video: { size: 0, latestDate: "" },
    audio: { size: 0, latestDate: "" },
    other: { size: 0, latestDate: "" },
    used: 0,
    all: STORAGE_LIMIT,
  };

  // Page through every file the user owns (a single list call returns 25 by
  // default, which previously under-counted usage).
  let cursor: string | undefined;
  for (;;) {
    const page = await tablesDB.listRows({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.filesTableId,
      queries: [
        Query.select(["$id", "$updatedAt", "type", "size"]),
        Query.equal("owner", [currentUser.$id]),
        Query.orderAsc("$id"),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    });

    for (const file of page.rows) {
      const fileType = (
        file.type in totalSpace ? file.type : "other"
      ) as FileType;
      const size = Number(file.size) || 0;

      totalSpace[fileType].size += size;
      totalSpace.used += size;

      if (
        !totalSpace[fileType].latestDate ||
        new Date(file.$updatedAt) > new Date(totalSpace[fileType].latestDate)
      ) {
        totalSpace[fileType].latestDate = file.$updatedAt;
      }
    }

    if (page.rows.length < 100) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }

  return totalSpace;
}
