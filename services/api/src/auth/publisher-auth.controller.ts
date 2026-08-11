import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common'
import { z } from 'zod'

import { isValidAccountText } from '../common/password-policy'
import { AuthService } from './auth.service'

const loginSchema = z.object({ username: z.string().refine(isValidAccountText), password: z.string().refine(isValidAccountText), deviceRef: z.string().uuid() }).strict()

@Controller('publisher/auth')
export class PublisherAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: unknown): Promise<{ accessToken: string; expiresAt: string }> {
    const payload = loginSchema.safeParse(body)
    if (!payload.success) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '账号或密码错误' })
    const result = await this.authService.loginPublisherDesktop(payload.data.username, payload.data.password, payload.data.deviceRef)
    return { accessToken: result.token, expiresAt: result.expiresAt.toISOString() }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Headers('authorization') authorization: string | undefined): Promise<void> {
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{20,})$/)
    await this.authService.logoutPublisherDesktop(match?.[1])
  }
}
