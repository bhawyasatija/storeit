"use server";

import { createAdminClient, createSessionClient } from "@/lib/appwrite";
import { appwriteConfig, SESSION_COOKIE } from "@/lib/appwrite/config";
import { Query, ID, AppwriteException } from "node-appwrite";
import { parseStringify } from "@/lib/utils";
import { cookies } from "next/headers";
import { avatarPlaceholderUrl } from "@/constants";
import { redirect } from "next/navigation";
import {
  appwriteIdSchema,
  emailSchema,
  fullNameSchema,
  otpSchema,
} from "@/lib/validation";

type AuthResult =
  | { accountId: string; error?: undefined }
  | { accountId: null; error: string };

const logError = (context: string, error: unknown) => {
  // Log the type/code only: Appwrite errors can echo request data.
  if (error instanceof AppwriteException) {
    console.error(`[auth] ${context}: ${error.type} (${error.code})`);
  } else {
    console.error(`[auth] ${context}:`, (error as Error)?.message ?? error);
  }
};

const isRateLimited = (error: unknown) =>
  error instanceof AppwriteException && error.code === 429;

const getUserByEmail = async (email: string) => {
  const { tablesDB } = await createAdminClient();

  const result = await tablesDB.listRows({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.usersTableId,
    queries: [Query.equal("email", [email]), Query.limit(1)],
  });

  return result.rows[0] ?? null;
};

/** Sends a 6-digit email OTP via Appwrite. Returns the Appwrite user id. */
const sendOtp = async (email: string) => {
  const { account } = await createAdminClient();
  const token = await account.createEmailToken({ userId: ID.unique(), email });
  return token.userId;
};

export const sendEmailOTP = async ({
  email,
}: {
  email: string;
}): Promise<{ ok: boolean; error?: string }> => {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address" };

  try {
    await sendOtp(parsed.data);
    return { ok: true };
  } catch (error) {
    logError("send OTP", error);
    return {
      ok: false,
      error: isRateLimited(error)
        ? "Too many attempts. Please wait a minute and try again."
        : "Could not send the code. Please try again.",
    };
  }
};

export const createAccount = async ({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}): Promise<AuthResult> => {
  const name = fullNameSchema.safeParse(fullName);
  const mail = emailSchema.safeParse(email);
  if (!name.success) return { accountId: null, error: name.error.issues[0].message };
  if (!mail.success) return { accountId: null, error: mail.error.issues[0].message };

  try {
    const existingUser = await getUserByEmail(mail.data);
    const accountId = await sendOtp(mail.data);

    if (!existingUser) {
      const { tablesDB } = await createAdminClient();

      await tablesDB.createRow({
        databaseId: appwriteConfig.databaseId,
        tableId: appwriteConfig.usersTableId,
        rowId: ID.unique(),
        data: {
          fullName: name.data,
          email: mail.data,
          avatar: avatarPlaceholderUrl,
          accountId,
        },
      });
    }

    return { accountId };
  } catch (error) {
    logError("create account", error);
    return {
      accountId: null,
      error: isRateLimited(error)
        ? "Too many attempts. Please wait a minute and try again."
        : "Failed to create account. Please try again.",
    };
  }
};

export const signInUser = async ({
  email,
}: {
  email: string;
}): Promise<AuthResult> => {
  const mail = emailSchema.safeParse(email);
  if (!mail.success) return { accountId: null, error: mail.error.issues[0].message };

  try {
    const existingUser = await getUserByEmail(mail.data);

    if (!existingUser) {
      return {
        accountId: null,
        error: "No account found for this email. Please sign up first.",
      };
    }

    await sendOtp(mail.data);
    return { accountId: existingUser.accountId as string };
  } catch (error) {
    logError("sign in", error);
    return {
      accountId: null,
      error: isRateLimited(error)
        ? "Too many attempts. Please wait a minute and try again."
        : "Failed to sign in. Please try again.",
    };
  }
};

export const verifySecret = async ({
  accountId,
  password,
}: {
  accountId: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (!appwriteIdSchema.safeParse(accountId).success) {
    return { ok: false, error: "Invalid sign-in request. Please start again." };
  }
  if (!otpSchema.safeParse(password).success) {
    return { ok: false, error: "Enter the 6-character code from your email." };
  }

  try {
    const { account } = await createAdminClient();

    // Appwrite validates the token, enforces its expiry and invalidates it
    // after use, and rate-limits attempts.
    const session = await account.createSession({ userId: accountId, secret: password });

    (await cookies()).set(SESSION_COOKIE, session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(session.expire),
    });

    return { ok: true };
  } catch (error) {
    logError("verify OTP", error);
    if (isRateLimited(error)) {
      return {
        ok: false,
        error: "Too many attempts. Please wait a minute and try again.",
      };
    }
    return {
      ok: false,
      error: "That code is invalid or has expired. Request a new code.",
    };
  }
};

export const getCurrentUser = async () => {
  // 1. The session client proves who the caller is. No cookie, or an
  //    expired/invalid session (401), is the normal signed-out state.
  let accountId: string;
  try {
    const { account } = await createSessionClient();
    accountId = (await account.get()).$id;
  } catch (error) {
    const signedOut =
      (error as Error)?.message === "No session" ||
      (error instanceof AppwriteException && error.code === 401);
    if (!signedOut) logError("get session", error);
    return null;
  }

  // 2. The profile lookup uses the admin client so the collections can stay
  //    closed to direct client access. Failures here are real errors.
  try {
    const { tablesDB } = await createAdminClient();
    const user = await tablesDB.listRows({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.usersTableId,
      queries: [Query.equal("accountId", [accountId]), Query.limit(1)],
    });

    if (user.rows.length === 0) return null;

    return parseStringify(user.rows[0]);
  } catch (error) {
    logError("load user profile", error);
    return null;
  }
};

export const signOutUser = async () => {
  try {
    const { account } = await createSessionClient();
    await account.deleteSession({ sessionId: "current" });
  } catch (error) {
    // The session may already be expired; still clear the cookie below.
    if ((error as Error)?.message !== "No session") {
      logError("sign out", error);
    }
  } finally {
    (await cookies()).delete(SESSION_COOKIE);
  }

  redirect("/sign-in");
};
