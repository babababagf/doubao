import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import RichTextEditor from './RichTextEditor.vue'

describe('RichTextEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('加载已有 HTML 并在编辑时同步安全富文本值', async () => {
    const wrapper = mount(RichTextEditor, { props: { modelValue: '<h2>已有标题</h2><p>已有正文内容。</p>' } })
    const canvas = wrapper.get('[role="textbox"]')

    expect(canvas.attributes('contenteditable')).toBe('true')
    expect(canvas.attributes('tabindex')).toBe('0')
    expect(canvas.attributes('aria-disabled')).toBe('false')
    expect(canvas.html()).toContain('<h2>已有标题</h2>')
    canvas.element.innerHTML = '<h2>更新标题</h2><p>更新后的正文内容足够清晰。</p>'
    await canvas.trigger('input')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['<h2>更新标题</h2><p>更新后的正文内容足够清晰。</p>'])
  })

  it('展示纯文本字数和 HTML 长度', () => {
    const value = '<p>正文内容</p>'
    const wrapper = mount(RichTextEditor, { props: { modelValue: value } })

    expect(wrapper.text()).toContain('正文 4 字')
    expect(wrapper.text()).toContain(`HTML ${value.length} / 30000`)
  })

  it('禁用时关闭正文编辑并同步禁用语义', () => {
    const wrapper = mount(RichTextEditor, { props: { modelValue: '<p>正文内容</p>', disabled: true } })
    const canvas = wrapper.get('[role="textbox"]')

    expect(canvas.attributes('contenteditable')).toBe('false')
    expect(canvas.attributes('aria-disabled')).toBe('true')
    expect(wrapper.get('[title="加粗"]').attributes('disabled')).toBeDefined()
  })

  it('识别剪贴板图片文件并交给文章页上传', async () => {
    const wrapper = mount(RichTextEditor, { props: { modelValue: '<p>已有正文</p>' } })
    const canvas = wrapper.get('[role="textbox"]')
    const file = new File(['image-content'], 'clipboard.png', { type: 'image/png' })

    await canvas.trigger('paste', {
      clipboardData: {
        getData: vi.fn(() => ''),
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
      },
    })

    expect(wrapper.emitted('paste-images')).toEqual([[[file]]])
    expect(wrapper.emitted('image-paste-blocked')).toBeUndefined()
    expect(canvas.html()).toContain('<p>已有正文</p>')
  })

  it('点击图片按钮可选择本地图片并交给文章页处理', async () => {
    const wrapper = mount(RichTextEditor, { props: { modelValue: '<p>已有正文</p>' } })
    const input = wrapper.get<HTMLInputElement>('input[type="file"]')
    const inputClick = vi.spyOn(input.element, 'click').mockImplementation(() => undefined)
    const file = new File(['image-content'], 'local.jpg', { type: 'image/jpeg' })

    await wrapper.get('[title="插入图片"]').trigger('mousedown')
    expect(inputClick).toHaveBeenCalledOnce()

    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')

    expect(wrapper.emitted('select-images')).toEqual([[[file]]])
    expect(input.element.value).toBe('')
  })

  it('允许把本地图片直接拖入正文编辑区', async () => {
    const wrapper = mount(RichTextEditor, { props: { modelValue: '<p>已有正文</p>' } })
    const canvas = wrapper.get('[role="textbox"]')
    const file = new File(['image-content'], 'dragged.png', { type: 'image/png' })

    await canvas.trigger('drop', {
      clientX: 10,
      clientY: 10,
      dataTransfer: {
        types: ['Files'],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
      },
    })

    expect(wrapper.emitted('select-images')).toEqual([[[file]]])
  })

  it('上传完成后把 HTTPS 图片插入正文并同步 HTML', async () => {
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) })
    const wrapper = mount(RichTextEditor, { props: { modelValue: '<p>已有正文</p>', disabled: true } })

    ;(wrapper.vm as unknown as { insertUploadedImages: (images: Array<{ url: string; alt: string }>) => void }).insertUploadedImages([
      { url: 'https://cdn.example.com/article.png', alt: '正文配图' },
    ])
    await wrapper.vm.$nextTick()

    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0]
    expect(emitted).toContain('<img src="https://cdn.example.com/article.png" alt="正文配图">')
  })

  it('网页 HTML 粘贴时移除图片和网页结构，只写入可编辑文字', async () => {
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    const wrapper = mount(RichTextEditor, { props: { modelValue: '<p>已有正文</p>' } })
    const canvas = wrapper.get('[role="textbox"]')
    const clipboard = new Map([
      ['text/plain', '网页标题\n网页正文'],
      ['text/html', '<section><h1>网页标题</h1><img src="https://example.com/a.png"><p>网页正文</p></section>'],
    ])

    await canvas.trigger('paste', {
      clipboardData: {
        getData: vi.fn((type: string) => clipboard.get(type) ?? ''),
        items: [],
        files: [],
      },
    })

    expect(wrapper.emitted('image-paste-blocked')).toHaveLength(1)
    expect(execCommand).toHaveBeenCalledWith('insertHTML', false, '网页标题<br>网页正文')
  })
})
