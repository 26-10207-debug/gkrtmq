import { betterAuth } from "better-auth";
import { getRuntimeEnv } from "@/db/runtime";

export function getAuth() {
  const runtime = getRuntimeEnv();
  const baseURL = runtime.BETTER_AUTH_URL || "http://127.0.0.1:3000";
  const googleEnabled = Boolean(runtime.GOOGLE_CLIENT_ID && runtime.GOOGLE_CLIENT_SECRET);

  return betterAuth({
    appName: "학습 DB",
    database: runtime.DB,
    secret: runtime.BETTER_AUTH_SECRET || "local-development-secret-change-before-deploying",
    baseURL,
    trustedOrigins: [baseURL, "http://127.0.0.1:3000", "http://localhost:3000"],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders: googleEnabled ? {
      google: {
        clientId: runtime.GOOGLE_CLIENT_ID!,
        clientSecret: runtime.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account",
      },
    } : {},
    user: { modelName: "auth_user", fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" } },
    session: { modelName: "auth_session", fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at", ipAddress: "ip_address", userAgent: "user_agent", userId: "user_id" } },
    account: { modelName: "auth_account", fields: { accountId: "account_id", providerId: "provider_id", userId: "user_id", accessToken: "access_token", refreshToken: "refresh_token", idToken: "id_token", accessTokenExpiresAt: "access_token_expires_at", refreshTokenExpiresAt: "refresh_token_expires_at", createdAt: "created_at", updatedAt: "updated_at" } },
    verification: { modelName: "auth_verification", fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" } },
  });
}

export function enabledAuthProviders() {
  const runtime = getRuntimeEnv();
  return { email: true, google: Boolean(runtime.GOOGLE_CLIENT_ID && runtime.GOOGLE_CLIENT_SECRET) };
}
