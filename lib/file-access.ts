// Pure access rules for files, shared by server actions and route handlers.
// Inputs are typed loosely because Appwrite documents are untyped records.

export interface AccessUser {
  $id: string;
  email: string;
}

type FileLike = { owner?: unknown; users?: unknown; [key: string]: unknown };

export const getOwnerId = (file: FileLike): string | null => {
  const owner = file.owner;
  if (typeof owner === "string") return owner || null;
  if (owner && typeof owner === "object" && "$id" in owner) {
    const id = (owner as { $id: unknown }).$id;
    return typeof id === "string" ? id : null;
  }
  return null;
};

export const isFileOwner = (
  file: FileLike,
  user: AccessUser | null | undefined,
): boolean => !!user && getOwnerId(file) === user.$id;

/** Owners and people the file was shared with (by email) can read it. */
export const canAccessFile = (
  file: FileLike,
  user: AccessUser | null | undefined,
): boolean => {
  if (!user) return false;
  if (isFileOwner(file, user)) return true;

  const email = user.email?.toLowerCase();
  const users = Array.isArray(file.users) ? file.users : [];
  return (
    !!email &&
    users.some((u) => typeof u === "string" && u.toLowerCase() === email)
  );
};
