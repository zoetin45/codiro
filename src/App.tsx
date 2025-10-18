import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import cloudflareLogo from './assets/Cloudflare_Logo.svg'
import './App.css'

interface User {
  id: string
  username: string
  email: string | null
  avatarUrl: string | null
}

function App() {
  const [count, setCount] = useState(0)
  const [name, setName] = useState('unknown')
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Check authentication status on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) return res.json()
        throw new Error('Not authenticated')
      })
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false))
  }, [])

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(() => setUser(null))
      .catch((err) => console.error('Logout failed:', err))
  }

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
        <a href="https://workers.cloudflare.com/" target="_blank">
          <img src={cloudflareLogo} className="logo cloudflare" alt="Cloudflare logo" />
        </a>
      </div>
      <h1>Vite + React + Cloudflare + GitHub Actions</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)} aria-label="increment">
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <div className="card">
        <button
          onClick={() => {
            fetch('/api/test')
              .then((res) => res.json() as Promise<{ name: string }>)
              .then((data) => setName(data.name))
          }}
          aria-label="get name"
        >
          Name from API is: {name}
        </button>
        <p>
          Edit <code>worker/index.ts</code> to change the name
        </p>
      </div>
      <div className="card">
        {authLoading ? (
          <p>Loading...</p>
        ) : user ? (
          <div>
            <p>
              Signed in as: <strong>{user.username}</strong>
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    marginLeft: 8,
                    verticalAlign: 'middle',
                  }}
                />
              )}
            </p>
            <button onClick={handleLogout} aria-label="logout">
              Logout
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={() => {
                window.location.href = '/api/auth/github'
              }}
              aria-label="login with github"
            >
              Login with GitHub
            </button>
            <p>Sign in to get started</p>
          </div>
        )}
      </div>
      <p className="read-the-docs">Click on the Vite and React logos to learn more</p>
    </>
  )
}

export default App
