import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import { AuthService } from './auth.service'
import type { PublisherActor } from './auth.types'

function bearerToken(value: string | undefined): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(value ?? '')
  return match?.[1]
}

@Injectable()
export class PublisherSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { publisherActor?: PublisherActor }>()
    const actor = await this.authService.resolvePublisherDesktopSession(bearerToken(request.headers.authorization))
    if (!actor) throw new UnauthorizedException({ code: 'PUBLISHER_AUTH_REQUIRED', message: '发布助手登录已失效，请重新登录' })
    request.publisherActor = actor
    return true
  }
}
