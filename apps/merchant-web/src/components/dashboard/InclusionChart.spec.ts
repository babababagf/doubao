import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { mockDashboard } from '@/mocks/fixtures'

import InclusionChart from './InclusionChart.vue'

describe('InclusionChart', () => {
  it('使用产品名称并明确披露统计口径', () => {
    const wrapper = mount(InclusionChart, {
      props: {
        count: mockDashboard.effects.doubaoIncludedCount,
        points: mockDashboard.inclusionTrend,
        lastCheckedAt: mockDashboard.lastCheckedAt,
      },
    })

    expect(wrapper.text()).toContain('豆包收录数')
    expect(wrapper.text()).toContain('企业全称或简称命中统计')
    expect(wrapper.text()).toContain('不代表豆包官方索引收录')
    expect(wrapper.text()).not.toContain('豆包 API 命中量')
    expect(wrapper.findAll('.chart-point')).toHaveLength(mockDashboard.inclusionTrend.length)
  })
})
