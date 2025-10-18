// User types
export interface User {
  id: string
  username: string
  email: string | null
  avatarUrl: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface GitHubIdentity {
  userId: string
  githubId: number
  githubUsername: string
  githubEmail: string | null
  createdAt: string | null
}

export interface Session {
  id: string
  userId: string
  expiresAt: string
  createdAt: string | null
}

// JWT payload types
export interface AccessTokenPayload {
  sub: string // user id
  username: string
  exp: number
  iat: number
  [key: string]: unknown
}

export interface RefreshTokenPayload {
  sub: string // user id
  sessionId: string
  exp: number
  iat: number
  [key: string]: unknown
}

export interface OAuthStatePayload {
  timestamp: number
  random: string
  [key: string]: unknown
}

// GitHub API response types
export interface GitHubUser {
  id: number
  login: string
  email: string | null
  avatar_url: string
  name: string | null
}

export interface GitHubTokenResponse {
  access_token: string
  token_type: string
  scope: string
}

// Authentication context
export interface AuthContext {
  user: User
  session: Session
}
