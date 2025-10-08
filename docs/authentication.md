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
   - Set up GitHub OAuth App (get Client ID and Secret)
   - Configure environment variables (see section below)
   - No KV namespace needed (using D1 only)

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

### Design Decision: D1-Only (No KV)

We use **D1 (SQLite) only** instead of Cloudflare KV because:

- ✅ **Immediate consistency** - Logout invalidates sessions immediately (KV has ~60s propagation delay)
- ✅ **Simpler architecture** - One storage system instead of two
- ✅ **Already have it** - No additional infrastructure needed
- ✅ **Relational data** - Sessions naturally relate to users

**OAuth State** is handled via stateless signed JWT tokens (no storage needed).

### Libraries Used

- **Hono JWT Middleware** (`hono/jwt`) - For JWT creation and validation
- **Native Crypto API** - For generating secure random values
- **Fetch API** - For GitHub OAuth API calls

### Token Strategy

**Dual Token Approach:**

- **Access Token**: Short-lived (15 minutes), stateless JWT with user claims
- **Refresh Token**: Long-lived (30 days), stored in D1 sessions table for invalidation

### Storage

1. **Cookies** (httpOnly, Secure, SameSite=Lax)
   - `access_token`: JWT access token
   - `refresh_token`: JWT refresh token

2. **Database (D1)** - Single source of truth
   - `users` table: User profiles
   - `github_identities` table: GitHub OAuth data
   - `sessions` table: Refresh token sessions (for logout invalidation)

3. **OAuth State**: Stateless signed token (no storage needed)
   - State parameter signed with JWT_SECRET + timestamp
   - Validated on callback (signature + 10 min expiry check)

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

- [x] Create database schema (D1 only, no KV needed)
- [ ] Set up environment variables
- [ ] Create GitHub OAuth App

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

#### GitHub OAuth App Setup

1. Go to GitHub Settings → Developer Settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Codiro (or your app name)
   - **Homepage URL**: Your app URL (e.g., `http://localhost:5173` for dev)
   - **Authorization callback URL**: `{APP_URL}/api/auth/github/callback`
4. Save and copy the Client ID
5. Generate a new Client Secret and copy it

#### Set Environment Variables

```bash
# Generate JWT secret
openssl rand -base64 32

# For local development, create .dev.vars file:
JWT_SECRET=your-generated-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
APP_URL=http://localhost:5173

# For production, use wrangler secrets:
pnpm wrangler secret put JWT_SECRET
pnpm wrangler secret put GITHUB_CLIENT_ID
pnpm wrangler secret put GITHUB_CLIENT_SECRET
```

#### Update wrangler.jsonc

```json
{
  "vars": {
    "APP_URL": "https://your-production-url.com"
  }
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
import { sign, verify } from 'hono/jwt'

export async function initiateGitHubOAuth(c: Context) {
  // Create signed state token (stateless, no storage needed)
  const state = await sign(
    {
      timestamp: Date.now(),
      random: crypto.randomUUID(),
    },
    c.env.JWT_SECRET
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

  // Verify state signature and expiry
  try {
    const payload = await verify(state, c.env.JWT_SECRET)
    const age = Date.now() - payload.timestamp
    if (age > 10 * 60 * 1000) {
      // 10 minutes
      return c.redirect('/?error=state_expired')
    }
  } catch {
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

```bash
# Required secrets (use .dev.vars for local, wrangler secret for production)
JWT_SECRET           # Generate with: openssl rand -base64 32
GITHUB_CLIENT_ID     # From GitHub OAuth App
GITHUB_CLIENT_SECRET # From GitHub OAuth App

# Configuration (wrangler.jsonc vars)
APP_URL             # e.g., https://codiro.example.com for production
                     # http://localhost:5173 for local development
```

## Security Considerations

1. **State Parameter**: Signed JWT with timestamp, validated on callback (10 min expiry)
2. **Token Storage**: httpOnly cookies prevent XSS access
3. **Session Management**: Sessions stored in D1 for immediate invalidation on logout
4. **Token Rotation**: New refresh token on each use (optional enhancement)
5. **HTTPS Only**: Secure cookie flag in production

## Error Handling

- Invalid state: 400 Bad Request
- Invalid tokens: 401 Unauthorized
- Expired tokens: Attempt refresh, then 401
- OAuth errors: Redirect to homepage with error
- Network errors: 503 Service Unavailable
