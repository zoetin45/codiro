import { Hono } from 'hono'
import auth from './routes/auth'

const app = new Hono<{ Bindings: Env }>()

// Auth routes
app.route('/api/auth', auth)

// Test endpoint
app.get('/api/test', (c) => {
  return c.json({
    name: 'Hono!',
    timestamp: new Date().toISOString(),
  })
})

// Default API response
app.get('/api/*', (c) => {
  return c.json({
    name: 'Cloudflare',
  })
})

// 404 for non-API routes
app.all('*', (c) => {
  return c.notFound()
})

export default app
