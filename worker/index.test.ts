import { describe, it, expect } from 'vitest'
import { SELF } from 'cloudflare:test'

describe('Worker', () => {
  it('responds with test message for /api/test', async () => {
    const response = await SELF.fetch('http://localhost/api/test')
    expect(response.status).toBe(200)

    const json = await response.json()
    expect(json).toHaveProperty('message', 'Hello from Hono!')
    expect(json).toHaveProperty('timestamp')
  })

  it('responds with JSON for API routes', async () => {
    const response = await SELF.fetch('http://localhost/api/hello')
    expect(response.status).toBe(200)

    const json = await response.json()
    expect(json).toEqual({ name: 'Cloudflare' })
  })

  it('returns 404 for non-API routes', async () => {
    const response = await SELF.fetch('http://localhost/other')
    expect(response.status).toBe(404)
  })
})
