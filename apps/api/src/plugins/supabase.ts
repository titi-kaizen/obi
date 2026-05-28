import fp from 'fastify-plugin'
import { createClient } from '@supabase/supabase-js'

export const supabasePlugin = fp(async (fastify) => {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  })

  fastify.decorate('supabase', supabase)
  fastify.log.info('Supabase client initialized')
}, { name: 'supabase' })
