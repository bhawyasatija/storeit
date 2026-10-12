// Admin helpers for the live end-to-end suite. They talk to the real Appwrite
// project configured in .env.local, create throwaway users, and clean up.
import { existsSync } from "node:fs";
import { Client, ID, Query, Storage, TablesDB, Users } from "node-appwrite";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const env = process.env;

export const liveConfigured = Boolean(
  env.E2E_LIVE === "1" &&
    env.NEXT_PUBLIC_APPWRITE_ENDPOINT &&
    env.NEXT_PUBLIC_APPWRITE_PROJECT &&
    env.NEXT_APPWRITE_KEY &&
    env.NEXT_PUBLIC_APPWRITE_DATABASE &&
    env.NEXT_PUBLIC_APPWRITE_USERS_COLLECTION &&
    env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION &&
    env.NEXT_PUBLIC_APPWRITE_BUCKET,
);

const admin = () => {
  const client = new Client()
    .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT!)
    .setKey(env.NEXT_APPWRITE_KEY!);
  return {
    users: new Users(client),
    tablesDB: new TablesDB(client),
    storage: new Storage(client),
  };
};

const db = () => env.NEXT_PUBLIC_APPWRITE_DATABASE!;
const usersCol = () => env.NEXT_PUBLIC_APPWRITE_USERS_COLLECTION!;
const filesCol = () => env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION!;
const bucket = () => env.NEXT_PUBLIC_APPWRITE_BUCKET!;

export interface TestUser {
  accountId: string;
  profileId: string;
  email: string;
  name: string;
}

/** Creates an Appwrite account plus the StoreIt profile document. */
export const createTestUser = async (label: string): Promise<TestUser> => {
  const { users, tablesDB } = admin();
  const stamp = Date.now().toString(36);
  const email = `storeit-e2e-${label}-${stamp}@example.com`;
  const name = `E2E ${label.toUpperCase()}`;

  const account = await users.create({ userId: ID.unique(), email, name });
  const profile = await tablesDB.createRow({
    databaseId: db(),
    tableId: usersCol(),
    rowId: ID.unique(),
    data: {
      fullName: name,
      email,
      avatar: "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg",
      accountId: account.$id,
    },
  });

  return { accountId: account.$id, profileId: profile.$id, email, name };
};

/** A 6-digit sign-in token, i.e. what the user would receive by email. */
export const createOtp = async (user: TestUser) => {
  const token = await admin().users.createToken({ userId: user.accountId, length: 6, expire: 600 });
  return token.secret;
};

/** A session secret for the app's session cookie (skips the email step). */
export const createSessionSecret = async (user: TestUser) => {
  const session = await admin().users.createSession({ userId: user.accountId });
  return session.secret;
};

export const deleteTestUser = async (user: TestUser) => {
  const { users, tablesDB, storage } = admin();

  const files = await tablesDB.listRows({
    databaseId: db(),
    tableId: filesCol(),
    queries: [Query.equal("owner", [user.profileId]), Query.limit(100)],
  });
  for (const file of files.rows) {
    await storage
      .deleteFile({ bucketId: bucket(), fileId: file.bucketFileId })
      .catch(() => undefined);
    await tablesDB
      .deleteRow({ databaseId: db(), tableId: filesCol(), rowId: file.$id })
      .catch(() => undefined);
  }

  await tablesDB
    .deleteRow({ databaseId: db(), tableId: usersCol(), rowId: user.profileId })
    .catch(() => undefined);
  await users.delete({ userId: user.accountId }).catch(() => undefined);
};
