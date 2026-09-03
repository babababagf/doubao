import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { mockDashboard } from '@/mocks/fixtures'

import ResourceStrip from './ResourceStrip.vue'

describe('ResourceStrip', () => {
  it('完整展示普通商户六项账户资源', () => {
    const wrapper = mount(ResourceStrip, {
      props: { resources: mockDashboard.resources },
    })

    for (const label of ['关键词', '算力点数', '写作篇数', '文章数量', '发布篇数', '图片空间']) {
      expect(wrapper.text()).toContain(label)
    }

    expect(wrapper.findAll('.resource-item')).toHaveLength(6)
    expect(wrapper.text()).toContain('1.8 GB')
  })

  it('所属贴牌 OSS 不可用时明确显示不可用，不伪造空间状态', () => {
    const wrapper = mount(ResourceStrip, {
      props: { resources: { ...mockDashboard.resources, imageStorage: { ...mockDashboard.resources.imageStorage, available: false } } },
    })

    expect(wrapper.text()).toContain('图片空间')
    expect(wrapper.text()).toContain('不可用')
  })
})
