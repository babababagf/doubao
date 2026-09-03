import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/merchant.service', () => ({
  getMerchantProfile: vi.fn(),
  updateMerchantProfile: vi.fn(),
}))

import ProfileView from './ProfileView.vue'

const PreviewStub = defineComponent({
  emits: ['section-select'],
  template: '<button data-testid="preview-showcase" type="button" @click="$emit(\'section-select\', \'showcase\')">定位官网图片</button>',
})

function rect(top: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    right: 100,
    bottom: top + 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  }
}

describe('ProfileView 官网预览定位', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('点击右侧预览时只滚动弹窗内容区，不拖动外层页面', async () => {
    const dialogBody = document.createElement('div')
    dialogBody.className = 'el-dialog__body'
    document.body.append(dialogBody)
    Object.defineProperties(dialogBody, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 2_000 },
      scrollTop: { configurable: true, value: 120, writable: true },
    })
    dialogBody.getBoundingClientRect = () => rect(100)
    const scrollTo = vi.fn()
    dialogBody.scrollTo = scrollTo

    const wrapper = mount(ProfileView, {
      attachTo: dialogBody,
      props: { embedded: true, loadExisting: false },
      global: {
        plugins: [createPinia()],
        stubs: {
          WebsiteLivePreview: PreviewStub,
          'el-icon': true,
        },
      },
    })
    await flushPromises()

    const showcase = wrapper.get<HTMLElement>('[data-form-section="showcase"]')
    showcase.element.getBoundingClientRect = () => rect(780)
    await wrapper.get('[data-testid="preview-showcase"]').trigger('click')
    await flushPromises()

    expect(scrollTo).toHaveBeenCalledWith({ top: 788, behavior: 'smooth' })
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
  })
})
