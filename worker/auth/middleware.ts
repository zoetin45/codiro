import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { verifyAccessToken } from './jwt'
import { getDB } from '../db'
import { users } from '../../db/schema'
import type { User } from '../types/auth'

/**
 * Auth middleware - protects routes requiring authentication
 * Adds user to context if authenticated
 */
export async function authMiddleware(c: Context, next: Next) {
  const accessToken = getCookie(c, 'access_token')

  if (!accessToken) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const payload = await verifyAccessToken(c, accessToken)

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  // Fetch user from database using Drizzle ORM
  const db = getDB(c.env.DB)
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub),
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 401)
  }

  // Attach user to context
  c.set('user', user as User)

  await next()
}

/**
 * Optional auth middleware - adds user to context if authenticated, but doesn't require it
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const accessToken = getCookie(c, 'access_token')

  if (accessToken) {
    const payload = await verifyAccessToken(c, accessToken)

    if (payload) {
      const db = getDB(c.env.DB)
      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.sub),
      })

      if (user) {
        c.set('user', user as User)
      }
    }
  }

  await next()
}
