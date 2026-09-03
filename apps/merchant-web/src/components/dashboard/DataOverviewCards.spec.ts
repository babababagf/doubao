import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { mockDashboard } from '@/mocks/fixtures'

import DataOverviewCards from './DataOverviewCards.vue'

describe('DataOverviewCards', () => {
  it('展示七项业务累计数据', () => {
    const wrapper = mount(DataOverviewCards, { props: { overview: mockDashboard.overview } })

    expect(wrapper.findAll('.metric-card')).toHaveLength(7)
    expect(wrapper.text()).toContain('关键词数量')
    expect(wrapper.text()).toContain('拓展问题数量')
    expect(wrapper.text()).toContain('豆包收录数')
    expect(wrapper.text()).toContain('286')
  })
})
