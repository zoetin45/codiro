import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    wranglerConfigPath: './wrangler.jsonc',
    dbName: 'codiro-db',
  },
})
