import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ArticleImageCropper from './ArticleImageCropper.vue'

describe('ArticleImageCropper 固定 4:3 裁剪窗', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:article-crop-source'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('方图默认使用固定 4:3 视口，原图保持自身比例而不设置拉伸高度', () => {
    const file = new File(['square-image'], 'square.png', { type: 'image/png' })
    const wrapper = mount(ArticleImageCropper, {
      props: {
        file,
        dimensions: { width: 238, height: 237 },
      },
      global: {
        stubs: { Teleport: true },
      },
    })

    expect(wrapper.get('.crop-frame').attributes('data-crop-ratio')).toBe('4:3')
    expect(wrapper.text()).toContain('固定 4:3')

    const style = wrapper.get('.crop-frame img').attributes('style')
    expect(style).toContain('width: 100%')
    expect(style).toContain('aspect-ratio: 238 / 237')
    expect(style).not.toContain('height:')
  })
})
