const path = require('node:path')

process.chdir(path.resolve(__dirname, '..'))
process.loadEnvFile('.env.local')

const database = new URL(process.env.DATABASE_URL)
database.pathname = '/doubaohk_isolated_test'
process.env.DATABASE_URL = database.toString()

// 隔离验收任务不能与 3010 演示环境共用 BullMQ 队列；固定使用本机 Redis DB 14。
const redis = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6470')
redis.pathname = '/14'
process.env.REDIS_URL = redis.toString()
process.env.AI_WORKER_ENABLED = 'true'

require('../dist/src/worker.js')
