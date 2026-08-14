import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
