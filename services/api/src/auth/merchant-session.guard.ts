import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import { AuthService } from './auth.service'
import type { MerchantActor } from './auth.types'

@Injectable()
export class MerchantSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { merchantActor?: MerchantActor }>()
    const actor = await this.authService.resolveMerchantSession(request.cookies.doubaohk_merchant_session)
    if (!actor) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '登录已失效，请重新登录' })
    }

    request.merchantActor = actor
    return true
  }
}
