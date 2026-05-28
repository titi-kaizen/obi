import { createClient } from '@supabase/supabase-js'

export function createServerClient() {
  const url = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? ''
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

export function createBrowserClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? ''
  const key = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ?? ''
  return createClient(url, key)
}
