import "server-only";

const required = (name: string, value: string | undefined) => {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and run "npm run setup:appwrite".`,
    );
  }
  return value;
};

// Read lazily so a missing value produces a clear error at the point of use
// instead of an opaque Appwrite "fetch failed" or 401.
export const appwriteConfig = {
  get endpointUrl() {
    return required(
      "NEXT_PUBLIC_APPWRITE_ENDPOINT",
      process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
    );
  },
  get projectId() {
    return required(
      "NEXT_PUBLIC_APPWRITE_PROJECT",
      process.env.NEXT_PUBLIC_APPWRITE_PROJECT,
    );
  },
  get databaseId() {
    return required(
      "NEXT_PUBLIC_APPWRITE_DATABASE",
      process.env.NEXT_PUBLIC_APPWRITE_DATABASE,
    );
  },
  get usersTableId() {
    return required(
      "NEXT_PUBLIC_APPWRITE_USERS_COLLECTION",
      process.env.NEXT_PUBLIC_APPWRITE_USERS_COLLECTION,
    );
  },
  get filesTableId() {
    return required(
      "NEXT_PUBLIC_APPWRITE_FILES_COLLECTION",
      process.env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION,
    );
  },
  get bucketId() {
    return required(
      "NEXT_PUBLIC_APPWRITE_BUCKET",
      process.env.NEXT_PUBLIC_APPWRITE_BUCKET,
    );
  },
  // Server-only secret: never prefix with NEXT_PUBLIC_.
  get secretKey() {
    return required("NEXT_APPWRITE_KEY", process.env.NEXT_APPWRITE_KEY);
  },
};

export const SESSION_COOKIE = "appwrite-session";
