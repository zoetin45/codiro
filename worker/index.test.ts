import { describe, it, expect } from 'vitest'
import { SELF } from 'cloudflare:test'

describe('Worker', () => {
  it('responds with JSON for API routes', async () => {
    const response = await SELF.fetch('https://example.com/api/hello')
    expect(response.status).toBe(200)

    const json = await response.json()
    expect(json).toEqual({ name: 'Cloudflare' })
  })

  it('returns 404 for non-API routes', async () => {
    const response = await SELF.fetch('https://example.com/other')
    expect(response.status).toBe(404)
  })
})
