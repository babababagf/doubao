import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { mockDashboard } from '@/mocks/fixtures'

import HomeMetricStrip from './HomeMetricStrip.vue'
import componentSource from './HomeMetricStrip.vue?raw'

function uniquePathY(path: string | undefined): Set<string> {
  const values = path?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  return new Set(values.filter((_, index) => index % 2 === 1).map((value) => value.toFixed(1)))
}

describe('HomeMetricStrip', () => {
  it('只展示写作、发布和豆包收录三项真实累计指标', () => {
    const wrapper = mount(HomeMetricStrip, {
      props: {
        overview: mockDashboard.overview,
        points: mockDashboard.dailyTrend,
      },
    })

    expect(wrapper.findAll('.growth-metric')).toHaveLength(3)
    expect(wrapper.text()).toContain('写作数量')
    expect(wrapper.text()).toContain('发布数量')
    expect(wrapper.text()).toContain('豆包收录数')
    expect(wrapper.text()).toContain(String(mockDashboard.overview.aiWritingCount))
    expect(wrapper.text()).toContain(String(mockDashboard.overview.publishedCount))
    expect(wrapper.text()).toContain(String(mockDashboard.overview.doubaoIncludedCount))
    expect(wrapper.text()).not.toContain('电话曝光')
    expect(wrapper.text()).not.toContain('电话点击')
    expect(wrapper.text()).not.toContain('咨询量')
  })

  it('每项指标都绘制自己的真实迷你曲线，右侧主趋势包含渐变与发光层', () => {
    const wrapper = mount(HomeMetricStrip, {
      props: {
        overview: mockDashboard.overview,
        points: mockDashboard.dailyTrend,
      },
    })

    const recentPoints = mockDashboard.dailyTrend.slice(-7)
    const writingRecent = recentPoints.reduce((total, point) => total + point.aiWritingCount, 0)
    const publishRecent = recentPoints.reduce((total, point) => total + point.publishedCount, 0)
    const includedRecent = recentPoints.reduce((total, point) => total + point.doubaoIncludedCount, 0)

    expect(wrapper.findAll('.metric-sparkline')).toHaveLength(3)
    expect(wrapper.findAll('.metric-sparkline .sparkline-glow')).toHaveLength(3)
    expect(wrapper.findAll('.metric-sparkline .sparkline-line')).toHaveLength(3)
    expect(wrapper.find('.metrics-trend').exists()).toBe(true)
    expect(wrapper.findAll('.metrics-trend .trend-line')).toHaveLength(3)
    expect(wrapper.findAll('.metrics-trend .trend-glow')).toHaveLength(3)
    expect(wrapper.findAll('.metrics-trend .trend-area')).toHaveLength(3)
    expect(wrapper.findAll('linearGradient')).toHaveLength(6)
    expect(wrapper.text()).toContain(`近 7 天新增 ${writingRecent}`)
    expect(wrapper.text()).toContain(`近 7 天成功 ${publishRecent}`)
    expect(wrapper.text()).toContain(`近 7 天命中 ${includedRecent}`)
    expect(wrapper.text()).toContain('联网回答中的企业名称命中统计')
  })

  it('最近七天均为零时仍绘制真实零值时间轴', () => {
    const zeroPoints = mockDashboard.dailyTrend.slice(-7).map((point) => ({
      ...point,
      aiWritingCount: 0,
      publishedCount: 0,
      doubaoIncludedCount: 0,
    }))
    const wrapper = mount(HomeMetricStrip, {
      props: {
        overview: {
          ...mockDashboard.overview,
          aiWritingCount: 0,
          publishedCount: 0,
          doubaoIncludedCount: 0,
        },
        points: zeroPoints,
      },
    })

    expect(wrapper.findAll('.metric-sparkline[data-flat="true"]')).toHaveLength(3)
    expect(wrapper.findAll('.metrics-trend .trend-series[data-flat="true"]')).toHaveLength(3)
    expect(wrapper.findAll('.metrics-trend .trend-line')).toHaveLength(3)
    expect(wrapper.findAll('.trend-dates span')).toHaveLength(7)
    expect(wrapper.find('.trend-empty').exists()).toBe(false)
    expect(wrapper.findAll('.sparkline-line').every((line) => uniquePathY(line.attributes('d')).size === 1)).toBe(true)
    expect(wrapper.findAll('.trend-line').every((line) => uniquePathY(line.attributes('d')).size === 1)).toBe(true)
  })

  it('没有数据时真实显示零，并用发光平线表达零值状态', () => {
    const wrapper = mount(HomeMetricStrip, {
      props: {
        overview: {
          ...mockDashboard.overview,
          aiWritingCount: 0,
          publishedCount: 0,
          doubaoIncludedCount: 0,
        },
        points: [],
      },
    })

    expect(wrapper.findAll('.metric-value').map((item) => item.text())).toEqual(['0', '0', '0'])
    expect(wrapper.findAll('.metric-recent').map((item) => item.text())).toEqual([
      '近 7 天新增 0',
      '近 7 天成功 0',
      '近 7 天命中 0',
    ])
    expect(wrapper.findAll('.metric-sparkline[data-flat="true"]')).toHaveLength(3)
    expect(wrapper.findAll('.metrics-trend .trend-series[data-flat="true"]')).toHaveLength(3)
    expect(wrapper.findAll('.metrics-trend .trend-line')).toHaveLength(3)
    expect(wrapper.find('.trend-empty').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('增长 0%')
    expect(wrapper.findAll('.sparkline-line').every((line) => uniquePathY(line.attributes('d')).size === 1)).toBe(true)
    expect(wrapper.findAll('.trend-line').every((line) => uniquePathY(line.attributes('d')).size === 1)).toBe(true)
  })

  it('动效只使用允许的属性，并为减少动态效果提供静态呈现', () => {
    expect(componentSource).toContain('@media (prefers-reduced-motion: reduce)')
    expect(componentSource).not.toMatch(/transition\s*:\s*all/i)
    expect(componentSource).not.toContain('will-change')
    expect(componentSource).not.toMatch(/(?:from|to|\d+%)\s*\{[^}]*(?:width|height|top|left|right|bottom|box-shadow)\s*:/i)
  })
})
