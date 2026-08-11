const path = require('node:path')

process.chdir(path.resolve(__dirname, '..'))
process.loadEnvFile('.env.local')

const database = new URL(process.env.DATABASE_URL)
database.pathname = '/doubaohk_isolated_test'
process.env.DATABASE_URL = database.toString()
const redis = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6470')
redis.pathname = '/14'
process.env.REDIS_URL = redis.toString()
process.env.API_PORT = '3011'

require('../dist/src/main.js')
