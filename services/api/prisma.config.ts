import { defineConfig, env } from 'prisma/config'
import { existsSync } from 'node:fs'

if (!process.env.DATABASE_URL && existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
