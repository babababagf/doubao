import { Body, Controller, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { isValidAccountText } from '../common/password-policy'
import { AuthService } from './auth.service'

const loginSchema = z.object({ username: z.string().refine(isValidAccountText), password: z.string().refine(isValidAccountText) }).strict()

@Controller()
export class AdminAuthController {
  constructor(private readonly authService: AuthService, private readonly config: ConfigService) {}

  @Post('super/auth/login')
  loginSuper(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply): Promise<{ sessionId: string; expiresAt: string }> { return this.login(body, reply, 'super') }
  @Post('tenant/auth/login')
  loginTenant(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply): Promise<{ sessionId: string; expiresAt: string }> { return this.login(body, reply, 'tenant') }
  @Post('super/auth/logout')
  async logoutSuper(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> { await this.authService.logoutSuperAdmin(request.cookies?.[AuthService.superCookieName()]); expireCookie(reply, AuthService.superCookieName(), this.config); reply.status(204).send() }
  @Post('tenant/auth/logout')
  async logoutTenant(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> { await this.authService.logoutTenantAdmin(request.cookies?.[AuthService.tenantCookieName()]); expireCookie(reply, AuthService.tenantCookieName(), this.config); reply.status(204).send() }

  private async login(body: unknown, reply: FastifyReply, target: 'super' | 'tenant'): Promise<{ sessionId: string; expiresAt: string }> {
    const payload = loginSchema.safeParse(body)
    if (!payload.success) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '账号或密码错误' })
    const result = target === 'super' ? await this.authService.loginSuperAdmin(payload.data.username, payload.data.password) : await this.authService.loginTenantAdmin(payload.data.username, payload.data.password)
    reply.setCookie(target === 'super' ? AuthService.superCookieName() : AuthService.tenantCookieName(), result.token, { httpOnly: true, secure: this.config.get<string>('COOKIE_SECURE', 'false') === 'true', sameSite: 'lax', path: '/', expires: result.expiresAt })
    return { sessionId: result.sessionId, expiresAt: result.expiresAt.toISOString() }
  }
}

function expireCookie(reply: FastifyReply, name: string, config: ConfigService): void {
  const secure = config.get<string>('COOKIE_SECURE', 'false') === 'true' ? '; Secure' : ''
  reply.header('set-cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`)
}
