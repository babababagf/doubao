import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { mockDashboard } from '@/mocks/fixtures'

import CoreMetricsPanel from './CoreMetricsPanel.vue'

describe('CoreMetricsPanel', () => {
  it('只展示三个非收录核心效果指标，避免重复主指标', () => {
    const wrapper = mount(CoreMetricsPanel, {
      props: { effects: mockDashboard.effects },
    })

    expect(wrapper.text()).toContain('问题总量')
    expect(wrapper.text()).toContain('电话曝光量')
    expect(wrapper.text()).toContain('电话点击量')
    expect(wrapper.text()).not.toContain('豆包收录数')
    expect(wrapper.findAll('.metric-item')).toHaveLength(3)
  })
})
