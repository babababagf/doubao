import sanitizeHtml from 'sanitize-html'

const allowedTags = ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'br', 'a', 'img']

export function sanitizeArticleContent(content: string): string {
  return sanitizeHtml(content, {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'title', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https'] },
  }).trim()
}
