import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const authUser = sqliteTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const authSession = sqliteTable("auth_session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
});

export const authAccount = sqliteTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const authVerification = sqliteTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

export const referenceLibrary = sqliteTable("reference_library", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  topic: text("topic").notNull(),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url").notNull(),
  licenseNote: text("license_note").notNull(),
  accessMode: text("access_mode").notNull(),
  tagsJson: text("tags_json").notNull().default("[]"),
  subject: text("subject").notNull().default("분류 없음"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const contributions = sqliteTable("contributions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  objectKey: text("object_key").notNull(),
  sourceNote: text("source_note").notNull().default(""),
  status: text("status").notNull().default("uploaded"),
  aiModel: text("ai_model"),
  learningJson: text("learning_json"),
  errorMessage: text("error_message"),
  ownerId: text("owner_id"),
  ownerEmail: text("owner_email"),
  ownerDisplayName: text("owner_display_name"),
  viewCount: integer("view_count").notNull().default(0),
  publishMode: text("publish_mode").notNull().default("instant"),
  creditsAwarded: integer("credits_awarded").notNull().default(0),
  reviewedAt: text("reviewed_at"),
  mechanicalOptions: text("mechanical_options").notNull().default("{}"),
  mechanicalStatus: text("mechanical_status").notNull().default("none"),
  extractedText: text("extracted_text"),
  questionsJson: text("questions_json"),
  recallJson: text("recall_json"),
  textOnly: integer("text_only", { mode: "boolean" }).notNull().default(false),
  mechanicalError: text("mechanical_error"),
  customMaterialsJson: text("custom_materials_json").notNull().default("{}"),
  attachmentsJson: text("attachments_json").notNull().default("[]"),
  subject: text("subject").notNull().default("분류 없음"),
  tagsJson: text("tags_json").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  creditBalance: integer("credit_balance").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const creditLedger = sqliteTable("credit_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  contributionId: text("contribution_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const learningProgress = sqliteTable("learning_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  learnerId: text("learner_id").notNull(),
  assetId: text("asset_id").notNull(),
  mode: text("mode").notNull(),
  completedItems: integer("completed_items").notNull().default(0),
  score: integer("score").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const publicFolders = sqliteTable("public_folders", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), ownerDisplayName: text("owner_display_name").notNull(),
  title: text("title").notNull(), description: text("description").notNull().default(""), subject: text("subject").notNull().default("분류 없음"),
  tagsJson: text("tags_json").notNull().default("[]"), folderType: text("folder_type").notNull().default("regular"), visibilityState: text("visibility_state").notNull().default("draft"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const publicFolderItems = sqliteTable("public_folder_items", {
  folderId: text("folder_id").notNull(), contributionId: text("contribution_id").notNull(), position: integer("position").notNull().default(0), pageStart: integer("page_start"), pageEnd: integer("page_end"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const contributionDrafts = sqliteTable("contribution_drafts", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), sourceContributionId: text("source_contribution_id"), title: text("title").notNull().default(""), sourceNote: text("source_note").notNull().default(""), subject: text("subject").notNull().default("분류 없음"), tagsJson: text("tags_json").notNull().default("[]"), customMaterialsJson: text("custom_materials_json").notNull().default("{}"), mechanicalOptions: text("mechanical_options").notNull().default("{}"), attachmentsJson: text("attachments_json").notNull().default("[]"), extractedTextsJson: text("extracted_texts_json").notNull().default("[]"), folderId: text("folder_id"), regularFolderIdsJson: text("regular_folder_ids_json").notNull().default("[]"), pageStart: integer("page_start"), pageEnd: integer("page_end"), publishMode: text("publish_mode").notNull().default("instant"), aiConversationJson: text("ai_conversation_json").notNull().default("[]"), sourceDigest: text("source_digest").notNull().default(""), aiReviewLocked: integer("ai_review_locked", { mode: "boolean" }).notNull().default(false), aiAppliedCount: integer("ai_applied_count").notNull().default(0), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const apiUsageLedger = sqliteTable("api_usage_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }), userId: text("user_id").notNull(), draftId: text("draft_id"), kind: text("kind").notNull(), model: text("model"), inputTokens: integer("input_tokens").notNull().default(0), outputTokens: integer("output_tokens").notNull().default(0), pages: integer("pages").notNull().default(0), estimatedUsdMicros: integer("estimated_usd_micros").notNull().default(0), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
