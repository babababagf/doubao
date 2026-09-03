import type { GalleryImage, MerchantGallery } from '@doubaohk/api-contract'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listGalleries: vi.fn(),
  listGalleryImages: vi.fn(),
  routerReplace: vi.fn(),
  routeQuery: { galleryId: 'gallery-1' } as Record<string, string>,
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mocks.routeQuery }),
  useRouter: () => ({ replace: mocks.routerReplace }),
}))

vi.mock('@/services/merchant.service', () => ({
  addGalleryImageMetadata: vi.fn(),
  completeGalleryImageUpload: vi.fn(),
  createGalleryImageUpload: vi.fn(),
  createGallery: vi.fn(),
  deleteGallery: vi.fn(),
  deleteGalleryImage: vi.fn(),
  listGalleries: mocks.listGalleries,
  listGalleryImages: mocks.listGalleryImages,
  updateGallery: vi.fn(),
}))

import GalleryView from './GalleryView.vue'

const gallery: MerchantGallery = {
  id: 'gallery-1',
  name: '门店与产品',
  description: '企业发布图片',
  imageCount: 2,
  createdAt: '2026-08-22T09:00:00+08:00',
  updatedAt: '2026-08-22T10:00:00+08:00',
}

const images: GalleryImage[] = [
  {
    id: 'image-2',
    galleryId: gallery.id,
    fileName: '门店外景-1600x1200.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 238_000,
    formattedSize: '232.4 KB',
    url: 'https://cdn.example.com/store.jpg',
    usageCount: 2,
    createdAt: '2026-08-22T10:00:00+08:00',
  },
  {
    id: 'image-1',
    galleryId: gallery.id,
    fileName: '产品展示-1600x1200.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 196_000,
    formattedSize: '191.4 KB',
    url: null,
    usageCount: 0,
    createdAt: '2026-08-22T09:30:00+08:00',
  },
]

function mountView() {
  return mount(GalleryView, {
    global: {
      stubs: {
        'el-dialog': true,
        'el-icon': true,
        ArticleImageCropper: true,
      },
    },
  })
}

describe('GalleryView 图库图片列表', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: vi.fn(async () => ({ width: 1600, height: 1200, close: vi.fn() })),
    })
    mocks.routeQuery.galleryId = gallery.id
    mocks.routerReplace.mockReset().mockResolvedValue(undefined)
    mocks.listGalleries.mockReset().mockResolvedValue([gallery])
    mocks.listGalleryImages.mockReset().mockResolvedValue(images)
  })

  it('进入分组后加载并展示所有已上传图片', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.listGalleryImages).toHaveBeenCalledWith(gallery.id)
    expect(wrapper.get('#uploaded-images-title').text()).toBe('已上传图片')
    expect(wrapper.findAll('[data-testid="gallery-image-item"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('门店外景-1600x1200.jpg')
    expect(wrapper.text()).toContain('产品展示-1600x1200.jpg')
    expect(wrapper.text()).toContain('已用于 2 篇文章')
    expect(wrapper.get('[data-testid="gallery-image-list"] img').attributes('src')).toBe('https://cdn.example.com/store.jpg')
  })

  it('空分组仍保留已上传图片列表标题和明确空状态', async () => {
    mocks.listGalleries.mockResolvedValue([{ ...gallery, imageCount: 0 }])
    mocks.listGalleryImages.mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('#uploaded-images-title').text()).toBe('已上传图片')
    expect(wrapper.findAll('[data-testid="gallery-image-item"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('0 张')
    expect(wrapper.text()).toContain('当前分组还没有上传图片')
    expect(wrapper.text()).toContain('裁剪并上传成功后会立即出现在此列表')
  })

  it('选择并处理图片后明确显示待上传，不把裁剪完成误报为已经上传', async () => {
    const wrapper = mountView()
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    const file = new File(['standard-image'], '门店图片-1600x1200.jpg', { type: 'image/jpeg' })

    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.text()).toContain('待确认上传')
    expect(wrapper.text()).toContain('待上传：门店图片-1600x1200.jpg')
    expect(wrapper.text()).toContain('尚未上传 · 已通过规格校验')
    expect(wrapper.findAll('[data-testid="gallery-image-item"]')).toHaveLength(2)
    const confirmUpload = wrapper.findAll('button').find((button) => button.text() === '确认上传')
    expect(confirmUpload?.attributes('disabled')).toBeUndefined()
  })
})
