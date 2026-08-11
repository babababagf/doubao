import { describe, expect, it, vi } from 'vitest'

import { PublisherAuthController } from './publisher-auth.controller'

describe('PublisherAuthController', () => {
  it('发布助手退出只向认证服务传递合法 Bearer 令牌', async () => {
    const logoutPublisherDesktop = vi.fn(async () => undefined)
    const controller = new PublisherAuthController({ logoutPublisherDesktop } as never)

    await controller.logout('Bearer abcdefghijklmnopqrstuvwxyz_123456')
    await controller.logout('Basic plaintext')

    expect(logoutPublisherDesktop).toHaveBeenNthCalledWith(1, 'abcdefghijklmnopqrstuvwxyz_123456')
    expect(logoutPublisherDesktop).toHaveBeenNthCalledWith(2, undefined)
  })
})
