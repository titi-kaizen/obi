import type { NextConfig } from 'next'
import { config } from 'dotenv'
import { join } from 'path'

// Load root .env for local dev; on Vercel env vars are injected, this is a no-op
config({ path: join(__dirname, '../../.env') })

const nextConfig: NextConfig = {
  turbopack: {
    root: join(__dirname, '../..'),
  },
}

export default nextConfig
