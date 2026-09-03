import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { mockDashboard } from '@/mocks/fixtures'

import HomeGrowthCommand from './HomeGrowthCommand.vue'

describe('HomeGrowthCommand', () => {
  it('按选定参考图展示中央知识核心、五个业务节点和真实数据', () => {
    const wrapper = mount(HomeGrowthCommand, {
      props: {
        accountName: 'admin',
        overview: mockDashboard.overview,
        points: mockDashboard.dailyTrend,
      },
      global: {
        stubs: { RouterLink: RouterLinkStub },
      },
    })

    expect(wrapper.text()).toContain('客户在提问，品牌要在场')
    expect(wrapper.text()).toContain('企业知识核心')
    expect(wrapper.text()).toContain('客户真实问题')
    expect(wrapper.text()).toContain('内容主题生成')
    expect(wrapper.text()).toContain('品牌资料沉淀')
    expect(wrapper.text()).toContain('多平台发布')
    expect(wrapper.text()).toContain('结果反馈与优化')
    expect(wrapper.text()).toContain(String(mockDashboard.overview.expandedQuestionCount))
    expect(wrapper.findAll('.knowledge-node')).toHaveLength(5)
    expect(wrapper.findAll('.signal-card')).toHaveLength(4)
    expect(wrapper.findAll('.platform-logo')).toHaveLength(3)
    expect(wrapper.findAll('.node-detail')).toHaveLength(14)
    expect(wrapper.findAll('.flow-chevron')).toHaveLength(5)
    expect(wrapper.findAll('.orbit-runner')).toHaveLength(3)
    expect(wrapper.find('.orbit-art').attributes('src')).toContain('knowledge-orbit-light-v3.png')
    expect(wrapper.text()).toContain('品牌认知问题')
    expect(wrapper.text()).toContain('添加问题')
    expect(wrapper.text()).toContain('曝光')
    expect(wrapper.text()).toContain('咨询')
  })

  it('两个主操作进入创作和运营数据现有路由', () => {
    const wrapper = mount(HomeGrowthCommand, {
      props: {
        accountName: 'admin',
        overview: mockDashboard.overview,
        points: mockDashboard.dailyTrend,
      },
      global: {
        stubs: { RouterLink: RouterLinkStub },
      },
    })

    const links = wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'))

    expect(links).toContainEqual({ name: 'content-create' })
    expect(links).toContainEqual({ name: 'data-overview' })
  })

  it('将三指标趋势条集成在指挥舱底部', () => {
    const wrapper = mount(HomeGrowthCommand, {
      props: {
        accountName: 'admin',
        overview: mockDashboard.overview,
        points: mockDashboard.dailyTrend,
      },
      global: {
        stubs: { RouterLink: RouterLinkStub },
      },
    })

    expect(wrapper.find('.command-metrics').exists()).toBe(true)
    expect(wrapper.findAll('.growth-metric')).toHaveLength(3)
    expect(wrapper.text()).toContain('豆包收录数')
  })
})
