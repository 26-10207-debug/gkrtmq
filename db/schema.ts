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
