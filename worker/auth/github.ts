import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import type { GitHubUser, GitHubTokenResponse } from '../types/auth'
import { generateStateToken, verifyStateToken } from './jwt'
import { getDB } from '../db'
import { users, githubIdentities } from '../../db/schema'

/**
 * Initiate GitHub OAuth flow
 */
export async function initiateGitHubOAuth(c: Context) {
  // Generate stateless signed state token for CSRF protection
  const state = await generateStateToken(c)

  const params = new URLSearchParams({
    client_id: c.env.GITHUB_APP_CLIENT_ID,
    redirect_uri: `${c.env.APP_URL}/api/auth/github/callback`,
    scope: 'user:email',
    state,
  })

  return c.redirect(`https://github.com/login/oauth/authorize?${params}`)
}

/**
 * Handle GitHub OAuth callback
 */
export async function handleGitHubCallback(c: Context) {
  const { code, state } = c.req.query()

  if (!code || !state) {
    return c.redirect('/?error=missing_params')
  }

  // Verify state token
  const statePayload = await verifyStateToken(c, state)
  if (!statePayload) {
    return c.redirect('/?error=invalid_state')
  }

  try {
    // Exchange code for GitHub access token
    const githubUser = await exchangeCodeForUser(c, code)

    // Create or update user in database
    const { userId, isNewUser } = await createOrUpdateUser(c, githubUser)

    return { userId, githubUser, isNewUser }
  } catch (error) {
    console.error('GitHub OAuth error:', error)
    return c.redirect('/?error=auth_failed')
  }
}

/**
 * Exchange authorization code for GitHub access token and fetch user
 */
async function exchangeCodeForUser(c: Context, code: string): Promise<GitHubUser> {
  // Step 1: Exchange code for access token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_APP_CLIENT_ID,
      client_secret: c.env.GITHUB_APP_CLIENT_SECRET,
      code,
    }),
  })

  if (!tokenResponse.ok) {
    throw new Error('Failed to exchange code for token')
  }

  const tokenData: GitHubTokenResponse = await tokenResponse.json()

  // Step 2: Fetch user data from GitHub
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'codiro-app',
    },
  })

  if (!userResponse.ok) {
    const errorText = await userResponse.text()
    console.error('GitHub API error:', userResponse.status, errorText)
    throw new Error(`Failed to fetch user from GitHub: ${userResponse.status}`)
  }

  const userData: GitHubUser = await userResponse.json()

  // Step 3: Fetch user email if not public
  if (!userData.email) {
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'codiro-app',
      },
    })

    if (emailResponse.ok) {
      const emails: Array<{ email: string; primary: boolean; verified: boolean }> =
        await emailResponse.json()
      const primaryEmail = emails.find((e) => e.primary && e.verified)
      if (primaryEmail) {
        userData.email = primaryEmail.email
      }
    }
  }

  return userData
}

/**
 * Create or update user in database
 */
async function createOrUpdateUser(
  c: Context,
  githubUser: GitHubUser
): Promise<{ userId: string; isNewUser: boolean }> {
  const db = getDB(c.env.DB)

  // Check if GitHub identity exists
  const existingIdentity = await db.query.githubIdentities.findFirst({
    where: eq(githubIdentities.githubId, githubUser.id),
  })

  if (existingIdentity) {
    // Update existing user
    const userId = existingIdentity.userId
    await db
      .update(users)
      .set({
        username: githubUser.login,
        email: githubUser.email,
        avatarUrl: githubUser.avatar_url,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId))

    return { userId, isNewUser: false }
  } else {
    // Create new user and identity
    const userId = crypto.randomUUID()

    // Create user
    await db.insert(users).values({
      id: userId,
      username: githubUser.login,
      email: githubUser.email,
      avatarUrl: githubUser.avatar_url,
    })

    // Create GitHub identity
    await db.insert(githubIdentities).values({
      userId,
      githubId: githubUser.id,
      githubUsername: githubUser.login,
      githubEmail: githubUser.email,
    })

    return { userId, isNewUser: true }
  }
}
