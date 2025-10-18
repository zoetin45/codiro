import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { verifyAccessToken } from './jwt'
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

  // Fetch user from database
  const user = await c.env.DB.prepare(
    'SELECT id, username, email, avatar_url as avatarUrl, created_at as createdAt, updated_at as updatedAt FROM users WHERE id = ?'
  )
    .bind(payload.sub)
    .first<User>()

  if (!user) {
    return c.json({ error: 'User not found' }, 401)
  }

  // Attach user to context
  c.set('user', user)

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
      const user = await c.env.DB.prepare(
        'SELECT id, username, email, avatar_url as avatarUrl, created_at as createdAt, updated_at as updatedAt FROM users WHERE id = ?'
      )
        .bind(payload.sub)
        .first<User>()

      if (user) {
        c.set('user', user)
      }
    }
  }

  await next()
}
