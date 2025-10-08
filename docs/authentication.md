# Authentication Architecture

## Overview

Codiro uses JWT-based authentication with GitHub OAuth as the identity provider. We leverage Hono's built-in JWT middleware for token handling and implement OAuth flow with state parameter for security.

## Current Status

### ✅ Completed

- **Database Schema**: Users, github_identities, and sessions tables created
  - Migration: `db/migrations/0000_premium_guardsmen.sql`
  - Applied to local database
  - Schema files: `db/schema/users.ts`, `db/schema/github-identities.ts`, `db/schema/sessions.ts`

### 🔲 TODO (Next Steps)

1. **Environment Setup**
   - Create Cloudflare KV namespace for AUTH_STORE
   - Set up GitHub OAuth App (get Client ID and Secret)
   - Configure environment variables (see section below)
   - Update wrangler.jsonc with KV binding

2. **Backend Implementation**
   - Create type definitions (`worker/types/auth.ts`)
   - Implement OAuth flow handlers
   - Set up JWT middleware
   - Create auth routes

3. **Frontend Integration**
   - Add login/logout UI
   - Handle auth state
   - Protected routes

## Requirements

### Functional Requirements

1. **Authentication Provider**
   - GitHub OAuth only (initially)
   - Extensible architecture for future providers
   - No password-based authentication

2. **User Information**
   - GitHub username
   - Email address
   - Avatar URL
   - No profile editing functionality (initially)

3. **User Flow**
   - Login redirects to GitHub OAuth
   - After authentication, redirect to homepage
   - Logout clears session and redirects to homepage
   - Unauthenticated users can access homepage

### Non-Functional Requirements

1. **Security**
   - All tokens stored in httpOnly cookies
   - OAuth state parameter validation
   - XSS protection via httpOnly flag
   - Secure token invalidation on logout

2. **Performance**
   - Stateless JWT for edge computing
   - Minimal database queries
   - Token refresh without re-authentication

## Technical Architecture

### Libraries Used

- **Hono JWT Middleware** (`hono/jwt`) - For JWT creation and validation
- **Native Crypto API** - For generating secure random values
- **Fetch API** - For GitHub OAuth API calls

### Token Strategy

**Dual Token Approach:**

- **Access Token**: Short-lived (15 minutes), contains user claims
- **Refresh Token**: Long-lived (30 days), stored in KV for invalidation

### Storage

1. **Cookies** (httpOnly, Secure, SameSite=Lax)
   - `access_token`: JWT access token
   - `refresh_token`: JWT refresh token

2. **Cloudflare KV**
   - OAuth State: `oauth_state:{state}` (TTL: 10 minutes)
   - Refresh Token: `refresh_token:{token_id}` (TTL: 30 days)

3. **Database (D1)**
   - Users table: Persistent user information

### API Endpoints

```
GET    /api/auth/github          - Initiate GitHub OAuth
GET    /api/auth/github/callback - OAuth callback handler
POST   /api/auth/refresh         - Refresh access token
POST   /api/auth/logout          - Logout user
GET    /api/auth/me              - Get current user info
```

## Implementation Steps

### Phase 1: Environment Setup ✅ PARTIALLY DONE

- [x] Create database schema
- [ ] Create Cloudflare KV namespace
- [ ] Set up environment variables
- [ ] Configure wrangler.jsonc

### Phase 2: OAuth Flow Implementation

1. Create auth routes in Hono
2. Implement GitHub OAuth initiation with state
3. Handle OAuth callback
4. Create/update user in database

### Phase 3: JWT Implementation

1. Generate access and refresh tokens
2. Set up Hono JWT middleware
3. Create token refresh endpoint
4. Implement logout functionality

### Phase 4: Protected Routes

1. Apply JWT middleware to protected routes
2. Add user context to requests
3. Create /api/auth/me endpoint

## Detailed Implementation

### 1. Environment Setup

#### KV Namespace Creation

```bash
# Create KV namespace for auth
wrangler kv:namespace create "AUTH_STORE"
```

#### Update wrangler.jsonc

```json
{
  "kv_namespaces": [
    {
      "binding": "AUTH_STORE",
      "id": "your-kv-namespace-id"
    }
  ]
}
```

### 2. Database Schema ✅ DONE

The schema has been created using Drizzle ORM:

- Location: `db/schema/`
- Migration: `db/migrations/0000_premium_guardsmen.sql`

**Resetting Database** (if needed):

```bash
# Local database
./scripts/reset-db.sh local

# Production database
./scripts/reset-db.sh remote
```

**Schema Structure:**

```sql
-- Core users table (provider-agnostic)
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- GitHub-specific identity information
CREATE TABLE github_identities (
  user_id TEXT PRIMARY KEY,
  github_id INTEGER UNIQUE NOT NULL,
  github_username TEXT NOT NULL,
  github_email TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX github_identities_github_id_unique ON github_identities(github_id);
```

### 3. Type Definitions

```typescript
// worker/types/auth.ts
export interface User {
  id: string
  username: string
  email: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface GitHubIdentity {
  user_id: string
  github_id: number
  github_username: string
  github_email: string | null
  created_at: string
}

export interface JWTPayload {
  sub: string // user id
  username: string
  exp: number
  iat: number
}

export interface GitHubUser {
  id: number
  login: string
  email: string | null
  avatar_url: string
}
```

### 4. OAuth Implementation

```typescript
// worker/auth/github.ts
export async function initiateGitHubOAuth(c: Context) {
  const state = crypto.randomUUID()

  // Store state in KV for verification
  await c.env.AUTH_STORE.put(
    `oauth_state:${state}`,
    JSON.stringify({ timestamp: Date.now() }),
    { expirationTtl: 600 } // 10 minutes
  )

  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: `${c.env.APP_URL}/api/auth/github/callback`,
    scope: 'read:user user:email',
    state,
  })

  return c.redirect(`https://github.com/login/oauth/authorize?${params}`)
}

// Handle GitHub callback and create/update user
export async function handleGitHubCallback(c: Context) {
  const { code, state } = c.req.query()

  // Verify state
  const storedState = await c.env.AUTH_STORE.get(`oauth_state:${state}`)
  if (!storedState) {
    return c.redirect('/?error=invalid_state')
  }

  // Exchange code for access token
  const githubUser = await exchangeCodeForUser(code, c.env)

  // Create or update user
  const db = c.env.DB

  // Check if GitHub identity exists
  const existingIdentity = await db
    .prepare('SELECT user_id FROM github_identities WHERE github_id = ?')
    .bind(githubUser.id)
    .first()

  let userId: string

  if (existingIdentity) {
    // Update existing user
    userId = existingIdentity.user_id
    await db
      .prepare('UPDATE users SET username = ?, email = ?, avatar_url = ? WHERE id = ?')
      .bind(githubUser.login, githubUser.email, githubUser.avatar_url, userId)
      .run()
  } else {
    // Create new user and identity
    userId = crypto.randomUUID()

    // Create user
    await db
      .prepare('INSERT INTO users (id, username, email, avatar_url) VALUES (?, ?, ?, ?)')
      .bind(userId, githubUser.login, githubUser.email, githubUser.avatar_url)
      .run()

    // Create GitHub identity
    await db
      .prepare(
        'INSERT INTO github_identities (user_id, github_id, github_username, github_email) VALUES (?, ?, ?, ?)'
      )
      .bind(userId, githubUser.id, githubUser.login, githubUser.email)
      .run()
  }

  // Generate tokens and redirect
  // ... (token generation logic)
}
```

### 5. JWT Middleware Setup

```typescript
// worker/auth/middleware.ts
import { jwt } from 'hono/jwt'

export const jwtAuth = (c: Context, next: Next) => {
  return jwt({
    secret: c.env.JWT_SECRET,
    cookie: 'access_token',
  })(c, next)
}
```

## Environment Variables

```
# Required secrets
JWT_SECRET           # Generate with: openssl rand -base64 32
GITHUB_CLIENT_ID     # From GitHub OAuth App
GITHUB_CLIENT_SECRET # From GitHub OAuth App

# Configuration
APP_URL             # e.g., https://codiro.example.com
```

## Security Considerations

1. **State Parameter**: Random UUID for each OAuth request
2. **Token Storage**: httpOnly cookies prevent XSS access
3. **Token Rotation**: New refresh token on each use
4. **Logout**: Invalidate refresh token in KV
5. **HTTPS Only**: Secure cookie flag

## Error Handling

- Invalid state: 400 Bad Request
- Invalid tokens: 401 Unauthorized
- Expired tokens: Attempt refresh, then 401
- OAuth errors: Redirect to homepage with error
- Network errors: 503 Service Unavailable
