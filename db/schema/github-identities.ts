import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

export const githubIdentities = sqliteTable('github_identities', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  githubId: integer('github_id').notNull().unique(),
  githubUsername: text('github_username').notNull(),
  githubEmail: text('github_email'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export type GitHubIdentity = typeof githubIdentities.$inferSelect
export type NewGitHubIdentity = typeof githubIdentities.$inferInsert
