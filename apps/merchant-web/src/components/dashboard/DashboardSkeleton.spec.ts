import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DashboardSkeleton from './DashboardSkeleton.vue'

describe('DashboardSkeleton', () => {
  it('首页加载态覆盖浅色知识星图、增长信号和三指标，减少数据返回后的布局跳动', () => {
    const wrapper = mount(DashboardSkeleton, { props: { variant: 'home' } })

    expect(wrapper.attributes('aria-label')).toBe('首页数据加载中')
    expect(wrapper.find('.skeleton-command').exists()).toBe(true)
    expect(wrapper.find('.skeleton-orbit').exists()).toBe(true)
    expect(wrapper.find('.skeleton-signals').exists()).toBe(true)
    expect(wrapper.findAll('.skeleton-metric')).toHaveLength(3)
  })
})
