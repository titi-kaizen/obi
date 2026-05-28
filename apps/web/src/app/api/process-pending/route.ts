import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST() {
  try {
    const db = createServerClient()

    const { count, error } = await db
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'failed'])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      enqueued: 0,
      pending:  count ?? 0,
      message:  `${count ?? 0} artículos serán procesados por el worker automáticamente`,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
