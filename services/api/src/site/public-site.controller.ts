import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'

import { StaticSiteService } from './static-site.service'

@Controller('public/sites')
export class PublicSiteController {
  constructor(private readonly sites: StaticSiteService) {}

  @Get(':tenantId')
  async index(@Param('tenantId') tenantId: string, @Res() reply: FastifyReply): Promise<void> {
    await this.reply(tenantId, 'index.html', reply)
  }

  @Get(':tenantId/index.html')
  async indexFile(@Param('tenantId') tenantId: string, @Res() reply: FastifyReply): Promise<void> {
    await this.reply(tenantId, 'index.html', reply)
  }

  @Get(':tenantId/robots.txt')
  async robots(@Param('tenantId') tenantId: string, @Res() reply: FastifyReply): Promise<void> {
    await this.reply(tenantId, 'robots.txt', reply)
  }

  @Get(':tenantId/sitemap.xml')
  async sitemap(@Param('tenantId') tenantId: string, @Res() reply: FastifyReply): Promise<void> {
    await this.reply(tenantId, 'sitemap.xml', reply)
  }

  @Get(':tenantId/articles/:articleId')
  async article(@Param('tenantId') tenantId: string, @Param('articleId') articleId: string, @Res() reply: FastifyReply): Promise<void> {
    const normalizedArticleId = articleId.endsWith('.html') ? articleId.slice(0, -'.html'.length) : articleId
    await this.reply(tenantId, `articles/${normalizedArticleId}.html`, reply)
  }

  @Get(':tenantId/:page')
  async page(@Param('tenantId') tenantId: string, @Param('page') page: string, @Res() reply: FastifyReply): Promise<void> {
    await this.reply(tenantId, page, reply)
  }

  @Post(':tenantId/events')
  @HttpCode(204)
  async event(@Param('tenantId') tenantId: string, @Body() body: { type?: unknown; page?: unknown; visitId?: unknown }): Promise<void> {
    await this.sites.recordPhoneEvent(tenantId, body)
  }

  private async reply(tenantId: string, path: string, reply: FastifyReply): Promise<void> {
    const file = await this.sites.getPreview(tenantId, path)
    const contentType = file.path.endsWith('.html') ? 'text/html; charset=utf-8' : file.path.endsWith('.xml') ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8'
    reply.header('cache-control', 'no-store').type(contentType).send(file.content)
  }
}
