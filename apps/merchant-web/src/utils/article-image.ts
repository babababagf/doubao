export const ARTICLE_IMAGE_WIDTH = 1600
export const ARTICLE_IMAGE_HEIGHT = 1200
export const ARTICLE_IMAGE_ASPECT_RATIO = ARTICLE_IMAGE_WIDTH / ARTICLE_IMAGE_HEIGHT
export const ARTICLE_IMAGE_PREVIEW_WIDTH = 640
export const ARTICLE_IMAGE_PREVIEW_HEIGHT = 480
export const ARTICLE_IMAGE_MAX_ZOOM = 3

export type ImageDimensions = {
  width: number
  height: number
}

export type ArticleCropSelection = {
  zoom: number
  offsetX: number
  offsetY: number
}

export type ArticleCropGeometry = ArticleCropSelection & {
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  renderedWidth: number
  renderedHeight: number
  maxOffsetX: number
  maxOffsetY: number
}

export const CENTERED_ARTICLE_CROP: ArticleCropSelection = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function isArticleImageAspectRatio(dimensions: ImageDimensions): boolean {
  return dimensions.width * ARTICLE_IMAGE_HEIGHT === dimensions.height * ARTICLE_IMAGE_WIDTH
}

export function isArticleImageTargetSize(dimensions: ImageDimensions): boolean {
  return dimensions.width === ARTICLE_IMAGE_WIDTH && dimensions.height === ARTICLE_IMAGE_HEIGHT
}

export function calculateArticleCropGeometry(
  dimensions: ImageDimensions,
  selection: ArticleCropSelection = CENTERED_ARTICLE_CROP,
): ArticleCropGeometry {
  if (dimensions.width <= 0 || dimensions.height <= 0) throw new Error('图片尺寸无效')

  const zoom = clamp(Number.isFinite(selection.zoom) ? selection.zoom : 1, 1, ARTICLE_IMAGE_MAX_ZOOM)
  const baseScale = Math.max(
    ARTICLE_IMAGE_PREVIEW_WIDTH / dimensions.width,
    ARTICLE_IMAGE_PREVIEW_HEIGHT / dimensions.height,
  )
  const renderScale = baseScale * zoom
  const renderedWidth = dimensions.width * renderScale
  const renderedHeight = dimensions.height * renderScale
  const maxOffsetX = Math.max(0, (renderedWidth - ARTICLE_IMAGE_PREVIEW_WIDTH) / 2)
  const maxOffsetY = Math.max(0, (renderedHeight - ARTICLE_IMAGE_PREVIEW_HEIGHT) / 2)
  const offsetX = clamp(Number.isFinite(selection.offsetX) ? selection.offsetX : 0, -maxOffsetX, maxOffsetX)
  const offsetY = clamp(Number.isFinite(selection.offsetY) ? selection.offsetY : 0, -maxOffsetY, maxOffsetY)
  const sourceWidth = ARTICLE_IMAGE_PREVIEW_WIDTH / renderScale
  const sourceHeight = ARTICLE_IMAGE_PREVIEW_HEIGHT / renderScale
  const sourceX = clamp(((renderedWidth - ARTICLE_IMAGE_PREVIEW_WIDTH) / 2 - offsetX) / renderScale, 0, dimensions.width - sourceWidth)
  const sourceY = clamp(((renderedHeight - ARTICLE_IMAGE_PREVIEW_HEIGHT) / 2 - offsetY) / renderScale, 0, dimensions.height - sourceHeight)

  return {
    zoom,
    offsetX,
    offsetY,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    renderedWidth,
    renderedHeight,
    maxOffsetX,
    maxOffsetY,
  }
}

export async function inspectArticleImage(file: File): Promise<ImageDimensions> {
  const bitmap = await createImageBitmap(file)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

export function normalizedArticleImageName(fileName: string): string {
  const stem = fileName.replace(/\.(?:jpe?g|png)$/i, '').trim() || '文章配图'
  return `${stem}-1600x1200.jpg`
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('图片处理失败，请重新选择图片'))
    }, 'image/jpeg', 0.9)
  })
}

export async function normalizeArticleImage(
  file: File,
  dimensions: ImageDimensions,
  selection: ArticleCropSelection = CENTERED_ARTICLE_CROP,
): Promise<File> {
  if (isArticleImageTargetSize(dimensions) && selection.zoom === 1 && selection.offsetX === 0 && selection.offsetY === 0) {
    return file
  }

  const bitmap = await createImageBitmap(file)
  try {
    const geometry = calculateArticleCropGeometry(dimensions, selection)
    const canvas = document.createElement('canvas')
    canvas.width = ARTICLE_IMAGE_WIDTH
    canvas.height = ARTICLE_IMAGE_HEIGHT
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器不支持图片裁剪，请升级浏览器后重试')

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, ARTICLE_IMAGE_WIDTH, ARTICLE_IMAGE_HEIGHT)
    context.drawImage(
      bitmap,
      geometry.sourceX,
      geometry.sourceY,
      geometry.sourceWidth,
      geometry.sourceHeight,
      0,
      0,
      ARTICLE_IMAGE_WIDTH,
      ARTICLE_IMAGE_HEIGHT,
    )
    const blob = await canvasToJpeg(canvas)
    return new File([blob], normalizedArticleImageName(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } finally {
    bitmap.close()
  }
}
