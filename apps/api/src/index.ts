import { config } from 'dotenv'
import { join } from 'path'
config({ path: join(__dirname, '../../../.env') })

import { buildServer } from './server'

const PORT = parseInt(process.env['PORT'] ?? '3001', 10)
const HOST = process.env['HOST'] ?? '0.0.0.0'

async function main() {
  const app = await buildServer()

  try {
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`API running at http://localhost:${PORT}`)
    app.log.info(`Swagger docs at http://localhost:${PORT}/docs`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
