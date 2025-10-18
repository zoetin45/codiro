import { sign, verify } from 'hono/jwt'
import type { Context } from 'hono'
import type { AccessTokenPayload, RefreshTokenPayload, OAuthStatePayload } from '../types/auth'

const ACCESS_TOKEN_EXPIRES_IN = 15 * 60 // 15 minutes
const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60 // 30 days
const STATE_TOKEN_EXPIRES_IN = 10 * 60 // 10 minutes

/**
 * Generate access token (short-lived, stateless)
 */
export async function generateAccessToken(
  c: Context,
  userId: string,
  username: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: AccessTokenPayload = {
    sub: userId,
    username,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRES_IN,
  }
  return await sign(payload, c.env.JWT_SECRET)
}

/**
 * Generate refresh token (long-lived, stored in DB)
 */
export async function generateRefreshToken(
  c: Context,
  userId: string,
  sessionId: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: RefreshTokenPayload = {
    sub: userId,
    sessionId,
    iat: now,
    exp: now + REFRESH_TOKEN_EXPIRES_IN,
  }
  return await sign(payload, c.env.JWT_SECRET)
}

/**
 * Generate OAuth state token (stateless, for CSRF protection)
 */
export async function generateStateToken(c: Context): Promise<string> {
  const payload: OAuthStatePayload = {
    timestamp: Date.now(),
    random: crypto.randomUUID(),
  }
  return await sign(payload, c.env.JWT_SECRET)
}

/**
 * Verify and decode OAuth state token
 */
export async function verifyStateToken(
  c: Context,
  token: string
): Promise<OAuthStatePayload | null> {
  try {
    const payload = (await verify(token, c.env.JWT_SECRET)) as OAuthStatePayload
    const age = Date.now() - payload.timestamp
    if (age > STATE_TOKEN_EXPIRES_IN * 1000) {
      return null // Expired
    }
    return payload
  } catch {
    return null
  }
}

/**
 * Verify access token
 */
export async function verifyAccessToken(
  c: Context,
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    return (await verify(token, c.env.JWT_SECRET)) as AccessTokenPayload
  } catch {
    return null
  }
}

/**
 * Verify refresh token
 */
export async function verifyRefreshToken(
  c: Context,
  token: string
): Promise<RefreshTokenPayload | null> {
  try {
    return (await verify(token, c.env.JWT_SECRET)) as RefreshTokenPayload
  } catch {
    return null
  }
}

/**
 * Set auth cookies (httpOnly, Secure in production)
 */
export function setAuthCookies(c: Context, accessToken: string, refreshToken: string) {
  const isProduction = c.env.APP_URL.startsWith('https://')
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax' as const,
    path: '/',
  }

  c.header(
    'Set-Cookie',
    `access_token=${accessToken}; ${Object.entries(cookieOptions)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')}; Max-Age=${ACCESS_TOKEN_EXPIRES_IN}`
  )
  c.header(
    'Set-Cookie',
    `refresh_token=${refreshToken}; ${Object.entries(cookieOptions)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')}; Max-Age=${REFRESH_TOKEN_EXPIRES_IN}`
  )
}

/**
 * Clear auth cookies (logout)
 */
export function clearAuthCookies(c: Context) {
  c.header('Set-Cookie', 'access_token=; HttpOnly; Path=/; Max-Age=0')
  c.header('Set-Cookie', 'refresh_token=; HttpOnly; Path=/; Max-Age=0')
}
