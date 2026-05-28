import type { SupabaseClient } from '@supabase/supabase-js'
import type { Queue } from 'bullmq'
import type { AuthUser } from '@ogasci/shared'
import type { QueueName } from '@ogasci/shared'

declare module 'fastify' {
  interface FastifyInstance {
    supabase: SupabaseClient
    queues: Record<QueueName, Queue>
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    user: AuthUser
  }
}
