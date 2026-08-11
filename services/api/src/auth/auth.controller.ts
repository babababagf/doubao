import { Body, Controller, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { isValidAccountText } from '../common/password-policy'
import { AuthService } from './auth.service'

const loginSchema = z.object({
  username: z.string().refine(isValidAccountText),
  password: z.string().refine(isValidAccountText),
}).strict()

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ sessionId: string; expiresAt: string }> {
    const payload = loginSchema.safeParse(body)
    if (!payload.success) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '账号或密码错误' })
    }

    const result = await this.authService.loginMerchant(payload.data.username, payload.data.password)
    reply.setCookie(AuthService.cookieName(), result.token, {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE', 'false') === 'true',
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    })
    return { sessionId: result.sessionId, expiresAt: result.expiresAt.toISOString() }
  }

  @Post('logout')
  async logout(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.authService.logoutMerchant(request.cookies?.[AuthService.cookieName()])
    expireCookie(reply, AuthService.cookieName(), this.config)
    reply.status(204).send()
  }
}

function expireCookie(reply: FastifyReply, name: string, config: ConfigService): void {
  const secure = config.get<string>('COOKIE_SECURE', 'false') === 'true' ? '; Secure' : ''
  reply.header('set-cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`)
}
