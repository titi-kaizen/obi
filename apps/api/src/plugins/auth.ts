import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthUser, UserRole } from '@ogasci/shared'

export const authPlugin = fp(async (fastify) => {
  const jwtSecret = process.env['SUPABASE_JWT_SECRET']
  if (!jwtSecret) throw new Error('Missing SUPABASE_JWT_SECRET env var')

  await fastify.register(jwt, { secret: jwtSecret })

  // Middleware: verify JWT and attach user to request
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()

      const payload = request.user as Record<string, unknown>
      const appMeta = (payload['app_metadata'] as Record<string, unknown>) ?? {}
      const role = (appMeta['role'] as UserRole) ?? 'viewer'

      request.user = {
        id: payload['sub'] as string,
        email: payload['email'] as string,
        role,
      } satisfies AuthUser
    } catch {
      reply.status(401).send({ error: 'Unauthorized', statusCode: 401 })
    }
  })

  // Middleware factory: check role
  fastify.decorate('requireRole', (roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await fastify.authenticate(request, reply)
      if (!reply.sent && !roles.includes(request.user.role)) {
        reply.status(403).send({ error: 'Forbidden', statusCode: 403 })
      }
    }
  })
}, { name: 'auth', dependencies: ['supabase'] })
