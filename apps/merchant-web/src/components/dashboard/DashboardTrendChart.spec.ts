import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { mockDashboard } from '@/mocks/fixtures'

import DashboardTrendChart from './DashboardTrendChart.vue'

describe('DashboardTrendChart', () => {
  it('只绘制最近 7 天写作和发布双系列柱状图', () => {
    const wrapper = mount(DashboardTrendChart, { props: { points: mockDashboard.dailyTrend } })
    const recentPoints = mockDashboard.dailyTrend.slice(-7)
    const writingTotal = recentPoints.reduce((total, point) => total + point.aiWritingCount, 0)
    const publishedTotal = recentPoints.reduce((total, point) => total + point.publishedCount, 0)

    expect(wrapper.text()).toContain('最近 7 天内容产出')
    expect(wrapper.findAll('.activity-bar.is-writing')).toHaveLength(recentPoints.length)
    expect(wrapper.findAll('.activity-bar.is-published')).toHaveLength(recentPoints.length)
    expect(wrapper.findAll('.chart-legend span')).toHaveLength(2)
    expect(wrapper.findAll('.summary-item strong')[0]?.text()).toBe(String(writingTotal))
    expect(wrapper.findAll('.summary-item strong')[1]?.text()).toBe(String(publishedTotal))
    expect(wrapper.find('svg').attributes('aria-label')).toBe('最近7天AI写作与平台发布柱状图')
    expect(wrapper.text()).not.toContain('电话曝光')
    expect(wrapper.text()).not.toContain('豆包收录')
  })
})
