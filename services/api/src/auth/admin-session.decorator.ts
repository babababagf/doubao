import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import type { AdminActor } from './auth.types'

export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext): AdminActor => {
  const request = context.switchToHttp().getRequest<FastifyRequest & { adminActor?: AdminActor }>()
  if (!request.adminActor) throw new Error('受保护路由未注入管理端身份。')
  return request.adminActor
})
