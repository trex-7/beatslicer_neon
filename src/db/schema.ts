import { pgTable, text, boolean, timestamp, jsonb, serial, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table mapped to Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  username: text('username'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const samples = pgTable('samples', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  title: text('title').notNull(),
  url: text('url').notNull(),
  audioData: text('audio_data'),
  isPublic: boolean('is_public').default(false).notNull(),
  isFactory: boolean('is_factory').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const kits = pgTable('kits', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  description: text('description'),
  coverImageUrl: text('cover_image_url'),
  isPublic: boolean('is_public').default(false).notNull(),
  isFactory: boolean('is_factory').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const kitSamples = pgTable('kit_samples', {
  id: serial('id').primaryKey(),
  kitId: text('kit_id').notNull().references(() => kits.id, { onDelete: 'cascade' }),
  sampleId: text('sample_id').notNull().references(() => samples.id, { onDelete: 'cascade' }),
});

export const presets = pgTable('presets', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  parameters: jsonb('parameters').notNull(),
  sequencerData: jsonb('sequencer_data').notNull(),
  slicesData: jsonb('slices_data').notNull(),
  sampleId: text('sample_id'),
  isPublic: boolean('is_public').default(false).notNull(),
  isFactory: boolean('is_factory').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  message: text('message').notNull(),
  category: text('category').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  presets: many(presets),
  samples: many(samples),
  kits: many(kits),
  feedback: many(feedback),
}));

export const kitsRelations = relations(kits, ({ many }) => ({
  kitSamples: many(kitSamples),
}));

export const kitSamplesRelations = relations(kitSamples, ({ one }) => ({
  kit: one(kits, {
    fields: [kitSamples.kitId],
    references: [kits.id],
  }),
  sample: one(samples, {
    fields: [kitSamples.sampleId],
    references: [samples.id],
  }),
}));
