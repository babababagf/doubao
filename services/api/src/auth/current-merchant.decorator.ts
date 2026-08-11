import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import type { MerchantActor } from './auth.types'

export const CurrentMerchant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MerchantActor => {
    const request = context.switchToHttp().getRequest<FastifyRequest & { merchantActor?: MerchantActor }>()
    if (!request.merchantActor) {
      throw new Error('受保护路由未注入商户身份。')
    }

    return request.merchantActor
  },
)
