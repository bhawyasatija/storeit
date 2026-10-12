// Provisions the Appwrite resources StoreIt needs (TablesDB database, tables,
// columns, indexes and a private storage bucket) and records their IDs in
// .env.local. Safe to re-run: existing resources are left as they are.
//
//   npm run setup:appwrite
//
// Requires NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT and
// NEXT_APPWRITE_KEY in .env.local. Secret values are never printed.

import { readFileSync, writeFileSync } from "node:fs";
import {
  AppwriteException,
  Client,
  Compression,
  RelationMutate,
  RelationshipType,
  Storage,
  TablesDB,
  TablesDBIndexType,
} from "node-appwrite";

const ENV_FILE = ".env.local";
const MAX_FILE_SIZE = 50_000_000; // keep in sync with constants/index.ts

const env = process.env;
for (const key of [
  "NEXT_PUBLIC_APPWRITE_ENDPOINT",
  "NEXT_PUBLIC_APPWRITE_PROJECT",
  "NEXT_APPWRITE_KEY",
]) {
  if (!env[key]) {
    console.error(`Missing ${key} in ${ENV_FILE}. See README "Configure Appwrite".`);
    process.exit(1);
  }
}

const ids = {
  database: env.NEXT_PUBLIC_APPWRITE_DATABASE || "storeit",
  users: env.NEXT_PUBLIC_APPWRITE_USERS_COLLECTION || "users",
  files: env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION || "files",
  bucket: env.NEXT_PUBLIC_APPWRITE_BUCKET || "storeit-files",
};

const client = new Client()
  .setEndpoint(env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT)
  .setKey(env.NEXT_APPWRITE_KEY);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);
const databaseId = ids.database;

const isNotFound = (e) => e instanceof AppwriteException && e.code === 404;
const isConflict = (e) => e instanceof AppwriteException && e.code === 409;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ensure = async (label, get, create) => {
  try {
    await get();
    console.log(`✓ ${label} already exists`);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    await create();
    console.log(`+ created ${label}`);
  }
};

const ensureColumn = async (tableId, key, create) => {
  try {
    await create({ databaseId, tableId, key });
    console.log(`  + column ${tableId}.${key}`);
  } catch (e) {
    if (!isConflict(e)) throw e;
  }
};

const waitForColumns = async (tableId) => {
  for (let i = 0; i < 90; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId, tableId });
    const failed = columns.filter((c) => c.status === "failed");
    if (failed.length) {
      throw new Error(`Columns failed in ${tableId}: ${failed.map((c) => c.key).join(", ")}`);
    }
    if (columns.every((c) => c.status === "available")) return;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for columns in ${tableId}`);
};

const ensureIndex = async (tableId, key, columns) => {
  try {
    await tablesDB.createIndex({ databaseId, tableId, key, type: TablesDBIndexType.Key, columns });
    console.log(`  + index ${tableId}.${key}`);
  } catch (e) {
    if (!isConflict(e)) throw e;
  }
};

const main = async () => {
  console.log(`Appwrite endpoint: ${new URL(env.NEXT_PUBLIC_APPWRITE_ENDPOINT).host}`);

  await ensure(
    `database "${databaseId}"`,
    () => tablesDB.get({ databaseId }),
    () => tablesDB.create({ databaseId, name: "StoreIt" }),
  );

  // Tables grant no client permissions: every read and write goes through
  // the Next.js server with the API key, which enforces the access rules.
  for (const [tableId, name] of [[ids.users, "users"], [ids.files, "files"]]) {
    await ensure(
      `table "${tableId}"`,
      () => tablesDB.getTable({ databaseId, tableId }),
      () => tablesDB.createTable({ databaseId, tableId, name, permissions: [], rowSecurity: false }),
    );
  }

  const u = ids.users;
  const f = ids.files;

  await ensureColumn(u, "fullName", (p) => tablesDB.createVarcharColumn({ ...p, size: 100, required: true }));
  await ensureColumn(u, "email", (p) => tablesDB.createEmailColumn({ ...p, required: true }));
  await ensureColumn(u, "avatar", (p) => tablesDB.createUrlColumn({ ...p, required: false }));
  await ensureColumn(u, "accountId", (p) => tablesDB.createVarcharColumn({ ...p, size: 36, required: true }));

  await ensureColumn(f, "type", (p) => tablesDB.createVarcharColumn({ ...p, size: 20, required: true }));
  await ensureColumn(f, "name", (p) => tablesDB.createVarcharColumn({ ...p, size: 255, required: true }));
  await ensureColumn(f, "url", (p) => tablesDB.createUrlColumn({ ...p, required: true }));
  await ensureColumn(f, "extension", (p) => tablesDB.createVarcharColumn({ ...p, size: 50, required: false }));
  await ensureColumn(f, "size", (p) => tablesDB.createIntegerColumn({ ...p, required: true, min: 0 }));
  await ensureColumn(f, "accountId", (p) => tablesDB.createVarcharColumn({ ...p, size: 36, required: true }));
  await ensureColumn(f, "users", (p) => tablesDB.createVarcharColumn({ ...p, size: 254, required: false, array: true }));
  await ensureColumn(f, "bucketFileId", (p) => tablesDB.createVarcharColumn({ ...p, size: 36, required: true }));

  await waitForColumns(u);
  await waitForColumns(f);

  await ensureColumn(f, "owner", (p) =>
    tablesDB.createRelationshipColumn({
      databaseId: p.databaseId,
      tableId: p.tableId,
      key: p.key,
      relatedTableId: u,
      type: RelationshipType.ManyToOne,
      twoWay: false,
      onDelete: RelationMutate.SetNull,
    }),
  );
  await waitForColumns(f);

  await ensureIndex(u, "email_idx", ["email"]);
  await ensureIndex(u, "accountId_idx", ["accountId"]);
  await ensureIndex(f, "type_idx", ["type"]);

  // Private bucket: no read permission for "any" or "users". Files are only
  // served through the authenticated /api/files/[id] route.
  await ensure(
    `bucket "${ids.bucket}"`,
    () => storage.getBucket({ bucketId: ids.bucket }),
    async () => {
      const create = (maximumFileSize) =>
        storage.createBucket({
          bucketId: ids.bucket,
          name: "StoreIt files",
          permissions: [],
          fileSecurity: false,
          enabled: true,
          maximumFileSize,
          allowedFileExtensions: [],
          compression: Compression.None,
          encryption: true,
          antivirus: true,
        });
      await create(MAX_FILE_SIZE);
    },
  );

  const bucket = await storage.getBucket({ bucketId: ids.bucket });
  const publicRead = bucket.$permissions.filter((p) => /^read\("(any|users|guests)"\)$/.test(p));
  if (publicRead.length) {
    console.warn(
      `! Bucket "${ids.bucket}" allows ${publicRead.join(", ")}. Remove these in the Appwrite console so files are only reachable through the app.`,
    );
  }
  console.log(`  bucket max file size: ${bucket.maximumFileSize} bytes`);

  // Record the IDs in .env.local without touching other lines.
  const values = {
    NEXT_PUBLIC_APPWRITE_DATABASE: ids.database,
    NEXT_PUBLIC_APPWRITE_USERS_COLLECTION: ids.users,
    NEXT_PUBLIC_APPWRITE_FILES_COLLECTION: ids.files,
    NEXT_PUBLIC_APPWRITE_BUCKET: ids.bucket,
  };
  let text = readFileSync(ENV_FILE, "utf8");
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}="${value}"`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(ENV_FILE, text);
  console.log(`✓ wrote database/table/bucket IDs to ${ENV_FILE}`);
};

main().catch((e) => {
  if (e instanceof AppwriteException) {
    console.error(`Setup failed: ${e.type} (${e.code}): ${e.message}`);
    if (e.code === 401) console.error("Check the API key and its scopes (see README).");
  } else {
    console.error("Setup failed:", e.message);
  }
  process.exit(1);
});
