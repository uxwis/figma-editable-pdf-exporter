import { strToU8, zipSync } from 'fflate'
import type { ExportWarning, FrameSummary } from '../shared'
import { sanitizeFileName } from '../shared'
import type { FontMapping } from './font'

interface PackageOptions {
  pdfBytes: Uint8Array
  pageName: string
  frames: FrameSummary[]
  mappings: Map<string, FontMapping>
  warnings: ExportWarning[]
}

export interface FontManifest {
  schemaVersion: 4
  pdf: 'editable.pdf'
  sourcePage: string
  generatedAt: string
  fonts: Array<{
    figmaFamily: string
    figmaStyle: string
    postScriptName: string
    embedded: boolean
    version: string | null
    sha256: string | null
    pages: number[]
    embeddingPermission: string
  }>
  pages: Array<{ pageNumber: number; frameName: string; width: number; height: number }>
  warnings: ExportWarning[]
}

function readme(options: PackageOptions, manifest: FontManifest): string {
  const warningLines = options.warnings.length
    ? options.warnings.map((warning) => `- [${warning.code}] ${warning.message}`).join('\n')
    : '- 无'
  const fontLines = manifest.fonts
    .map((font) => {
      const mode = font.embedded ? '已完整嵌入' : '系统字体引用，未嵌入'
      const identity = font.sha256
        ? ` · ${font.version ?? 'Unknown'} · SHA-256 ${font.sha256}`
        : ''
      return `- ${font.figmaFamily} ${font.figmaStyle}: ${font.postScriptName} · ${mode}${identity}`
    })
    .join('\n')
  const pageLines = manifest.pages
    .map((page) => `- 第 ${page.pageNumber} 页：${page.frameName} (${page.width} x ${page.height} Figma px)`)
    .join('\n')

  return `Figma 可编辑 PDF 交接说明
========================

1. 根据 font-manifest.json，在需要编辑 PDF 的电脑安装设计稿使用的同名字体。
2. 完全退出并重新打开 Adobe Acrobat Pro。
3. 打开 editable.pdf，使用“编辑 PDF”工具修改文本。
4. 若 Acrobat 提示字体不可用，请核对 Figma 字体名称和 PostScript 名称。

重要限制
--------
- “已完整嵌入”的字体可由 PDF 自身渲染，但 Acrobat 跨电脑编辑仍可能要求系统安装同版本字体。
- “系统字体引用，未嵌入”的字体必须安装在打开 PDF 的电脑上，否则阅读器会替换字体，视觉效果可能变化。
- 交接包不会包含或重新分发任何本机字体原文件。
- 渐变/图片文字、阴影、模糊、路径文字等复杂效果会按导出报告简化。

字体清单
--------
${fontLines || '- 本文档未使用文本字体'}

页面顺序
--------
${pageLines}

导出警告
--------
${warningLines}
`
}

export function buildDeliveryZip(options: PackageOptions): { bytes: Uint8Array; fileName: string; manifest: FontManifest } {
  const files: Record<string, Uint8Array> = { 'editable.pdf': options.pdfBytes }
  const manifestFonts: FontManifest['fonts'] = []

  for (const mapping of options.mappings.values()) {
    const embedded = mapping.kind === 'embedded'
    manifestFonts.push({
      figmaFamily: mapping.requirement.family,
      figmaStyle: mapping.requirement.style,
      postScriptName: embedded ? mapping.font.postScriptName : mapping.reference.postScriptName,
      embedded,
      version: embedded ? mapping.font.version : null,
      sha256: embedded ? mapping.font.sha256 : null,
      pages: mapping.requirement.pages,
      embeddingPermission: embedded ? mapping.font.embeddingPermission : 'not-embedded',
    })
  }

  const manifest: FontManifest = {
    schemaVersion: 4,
    pdf: 'editable.pdf',
    sourcePage: options.pageName,
    generatedAt: new Date().toISOString(),
    fonts: manifestFonts,
    pages: [...options.frames]
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .map((frame) => ({
        pageNumber: frame.pageNumber,
        frameName: frame.name,
        width: frame.width,
        height: frame.height,
      })),
    warnings: options.warnings,
  }
  files['font-manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  files['README.txt'] = strToU8(readme(options, manifest))

  return {
    bytes: zipSync(files, { level: 6 }),
    fileName: `${sanitizeFileName(options.pageName)}-editable-pdf.zip`,
    manifest,
  }
}
