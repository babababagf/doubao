import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RichTextEditor from './RichTextEditor.vue'

describe('RichTextEditor', () => {
  it('加载已有 HTML 并在编辑时同步安全富文本值', async () => {
    const wrapper = mount(RichTextEditor, { props: { modelValue: '<h2>已有标题</h2><p>已有正文内容。</p>' } })
    const canvas = wrapper.get('[role="textbox"]')

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
})
