import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AuthService } from './auth.service'
import type { AdminActor } from './auth.types'

@Injectable()
export class SuperAdminSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { adminActor?: AdminActor }>()
    const actor = await this.authService.resolveSuperAdminSession(request.cookies.doubaohk_super_admin_session)
    if (!actor) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '登录已失效，请重新登录' })
    request.adminActor = actor
    return true
  }
}
