import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { eq, lt } from 'drizzle-orm'
import { initiateGitHubOAuth, handleGitHubCallback } from '../auth/github'
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} from '../auth/jwt'
import { authMiddleware } from '../auth/middleware'
import type { User } from '../types/auth'
import { getDB } from '../db'
import { sessions, users } from '../../db/schema'

const auth = new Hono<{ Bindings: Env; Variables: { user: User } }>()

/**
 * GET /api/auth/github
 * Initiate GitHub OAuth flow
 */
auth.get('/github', async (c) => {
  return initiateGitHubOAuth(c)
})

/**
 * GET /api/auth/github/callback
 * Handle GitHub OAuth callback
 */
auth.get('/github/callback', async (c) => {
  const result = await handleGitHubCallback(c)

  // If result is a redirect (error case), return it
  if (result instanceof Response) {
    return result
  }

  const { userId, githubUser } = result
  const db = getDB(c.env.DB)

  // Create session
  const sessionId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt: expiresAt.toISOString(),
  })

  // Generate tokens
  const accessToken = await generateAccessToken(c, userId, githubUser.login)
  const refreshToken = await generateRefreshToken(c, userId, sessionId)

  // Set cookies
  setAuthCookies(c, accessToken, refreshToken)

  // Redirect to homepage
  return c.redirect('/')
})

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
auth.post('/refresh', async (c) => {
  const refreshToken = getCookie(c, 'refresh_token')

  if (!refreshToken) {
    return c.json({ error: 'No refresh token' }, 401)
  }

  const payload = await verifyRefreshToken(c, refreshToken)

  if (!payload) {
    return c.json({ error: 'Invalid refresh token' }, 401)
  }

  const db = getDB(c.env.DB)

  // Verify session exists and is valid
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, payload.sessionId),
  })

  if (!session) {
    return c.json({ error: 'Session not found' }, 401)
  }

  if (new Date(session.expiresAt) < new Date()) {
    // Session expired, clean up
    await db.delete(sessions).where(eq(sessions.id, session.id))
    return c.json({ error: 'Session expired' }, 401)
  }

  // Get user info
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: { username: true },
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 401)
  }

  // Generate new access token
  const newAccessToken = await generateAccessToken(c, session.userId, user.username)

  // Optionally: Generate new refresh token (token rotation)
  // For now, we'll reuse the same refresh token

  // Set new access token cookie
  setAuthCookies(c, newAccessToken, refreshToken)

  return c.json({ success: true })
})

/**
 * POST /api/auth/logout
 * Logout user and invalidate session
 */
auth.post('/logout', async (c) => {
  const refreshToken = getCookie(c, 'refresh_token')
  const db = getDB(c.env.DB)

  if (refreshToken) {
    const payload = await verifyRefreshToken(c, refreshToken)

    if (payload) {
      // Delete current session from database
      await db.delete(sessions).where(eq(sessions.id, payload.sessionId))
    }
  }

  // Lazy cleanup: delete all expired sessions
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString()))

  // Clear cookies
  clearAuthCookies(c)

  return c.json({ success: true })
})

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user')
  return c.json({ user })
})

export default auth
