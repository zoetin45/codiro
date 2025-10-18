import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'

/**
 * Get Drizzle ORM instance for the given D1 database
 */
export function getDB(d1: D1Database) {
  return drizzle(d1, { schema })
}
