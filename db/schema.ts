import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const validations = sqliteTable("validations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  stage: text("stage").notNull().default("problem-discovery"),
  targetResponses: integer("target_responses").notNull().default(100),
  rewardPoints: integer("reward_points").notNull().default(50),
  visibility: text("visibility").notNull().default("public"),
  signalScore: real("signal_score"),
  status: text("status").notNull().default("draft"),
  creatorEmail: text("creator_email"),
  studyType: text("study_type").notNull().default("idea"),
  requestedData: text("requested_data").notNull().default("[]"),
  surveyJson: text("survey_json").notNull().default("[]"),
  attachmentKey: text("attachment_key").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  authId: text("auth_id").unique(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  memberTier: text("member_tier").notNull().default("free"),
  reputationScore: real("reputation_score").notNull().default(500),
  interests: text("interests").notNull().default("[]"),
  headline: text("headline").notNull().default(""),
  bio: text("bio").notNull().default(""),
  location: text("location").notNull().default(""),
  website: text("website").notNull().default(""),
  avatarKey: text("avatar_key").notNull().default(""),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const presence = sqliteTable("presence", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  currentView: text("current_view").notNull().default("home"),
  firstSeen: integer("first_seen").notNull(),
  lastSeen: integer("last_seen").notNull(),
});

export const responses = sqliteTable("responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  validationId: integer("validation_id").notNull().references(() => validations.id),
  body: text("body").notNull(),
  sentiment: real("sentiment"),
  specificity: real("specificity"),
  constructiveness: real("constructiveness"),
  integrityScore: real("integrity_score"),
  rewardGranted: integer("reward_granted").notNull().default(0),
  contributorEmail: text("contributor_email"),
  rating: integer("rating"),
  category: text("category"),
  modelWeight: real("model_weight"),
  contributionType: text("contribution_type").notNull().default("comment"),
  answerJson: text("answer_json").notNull().default("{}"),
  baseReward: integer("base_reward").notNull().default(35),
  reputationAfter: real("reputation_after"),
  createdAt: text("created_at").notNull(),
});

export const studyFiles = sqliteTable("study_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull(),
});

export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  validationId: integer("validation_id").notNull().references(() => validations.id),
  responseCount: integer("response_count").notNull(),
  signalScore: real("signal_score").notNull(),
  confidence: real("confidence").notNull(),
  weightedSentiment: real("weighted_sentiment").notNull(),
  resultJson: text("result_json").notNull(),
  modelVersion: text("model_version").notNull().default("insight-v1.2"),
  createdAt: text("created_at").notNull(),
});
