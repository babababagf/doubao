import { describe, expect, it } from 'vitest'

import {
  ARTICLE_IMAGE_HEIGHT,
  ARTICLE_IMAGE_WIDTH,
  calculateArticleCropGeometry,
  isArticleImageAspectRatio,
  isArticleImageTargetSize,
  normalizedArticleImageName,
} from './article-image'

describe('文章发布图片规格', () => {
  it('只把标准 4:3 判断为无需人工裁剪的比例', () => {
    expect(isArticleImageAspectRatio({ width: 1600, height: 1200 })).toBe(true)
    expect(isArticleImageAspectRatio({ width: 4032, height: 3024 })).toBe(true)
    expect(isArticleImageAspectRatio({ width: 1200, height: 800 })).toBe(false)
    expect(isArticleImageAspectRatio({ width: 1080, height: 1920 })).toBe(false)
    expect(isArticleImageTargetSize({ width: ARTICLE_IMAGE_WIDTH, height: ARTICLE_IMAGE_HEIGHT })).toBe(true)
    expect(isArticleImageTargetSize({ width: 800, height: 600 })).toBe(false)
  })

  it('横向宽图按 4:3 居中裁切，并允许用户左右拖动', () => {
    const centered = calculateArticleCropGeometry({ width: 2400, height: 1200 })
    expect(centered.sourceWidth).toBeCloseTo(1600)
    expect(centered.sourceHeight).toBeCloseTo(1200)
    expect(centered.sourceX).toBeCloseTo(400)
    expect(centered.sourceY).toBeCloseTo(0)

    const moved = calculateArticleCropGeometry({ width: 2400, height: 1200 }, { zoom: 1, offsetX: 120, offsetY: 0 })
    expect(moved.sourceX).toBeLessThan(centered.sourceX)
    expect(moved.sourceY).toBeCloseTo(0)
  })

  it('近似方图打开时默认居中截取严格 4:3，不拉伸原图', () => {
    const centered = calculateArticleCropGeometry({ width: 238, height: 237 })

    expect(centered.sourceWidth).toBeCloseTo(238)
    expect(centered.sourceHeight).toBeCloseTo(178.5)
    expect(centered.sourceWidth / centered.sourceHeight).toBeCloseTo(4 / 3)
    expect(centered.sourceX).toBeCloseTo(0)
    expect(centered.sourceY).toBeCloseTo(29.25)
  })

  it('缩放和拖动值始终被限制在不会露出空白的范围内', () => {
    const geometry = calculateArticleCropGeometry(
      { width: 800, height: 1600 },
      { zoom: 99, offsetX: 9999, offsetY: -9999 },
    )

    expect(geometry.zoom).toBe(3)
    expect(geometry.offsetX).toBe(geometry.maxOffsetX)
    expect(geometry.offsetY).toBe(-geometry.maxOffsetY)
    expect(geometry.sourceX).toBeGreaterThanOrEqual(0)
    expect(geometry.sourceY).toBeGreaterThanOrEqual(0)
    expect(geometry.sourceX + geometry.sourceWidth).toBeLessThanOrEqual(800)
    expect(geometry.sourceY + geometry.sourceHeight).toBeLessThanOrEqual(1600)
  })

  it('输出文件名明确标记统一尺寸和 JPG 格式', () => {
    expect(normalizedArticleImageName('门店环境.PNG')).toBe('门店环境-1600x1200.jpg')
    expect(normalizedArticleImageName('image')).toBe('image-1600x1200.jpg')
  })
})
