# Figma Community Publishing Kit

This document contains ready-to-use listing copy, image specifications, screenshot direction, and security disclosure answers for Editable PDF Exporter.

Before submission, replace every `TODO` placeholder and publish `PRIVACY.md` at a public URL.

## Upload assets

| Asset | Recommended size | Quantity | Suggested content |
| --- | ---: | ---: | --- |
| Plugin icon | 128 × 128 px | 1 | A simple `E` or editable-text/PDF symbol that remains legible at small sizes. |
| Thumbnail / cover | 1920 × 1080 px, 16:9 | 1 | Show Figma frames flowing into a PDF with editable text; use one short headline. |
| Carousel images | 1920 × 1080 px, 16:9 | Up to 9 additional items | Product workflow, Acrobat editing proof, font behavior, privacy, and compatibility notes. |
| Carousel video | 1920 × 1080 preferred | Optional, counts as carousel media | A short silent demonstration from clicking Export PDF to editing text in Acrobat. |
| Playground file | Figma file | Optional | A small test page with Chinese, English, mixed styles, multiline text, and rotation. |

Static assets should be exported as high-quality PNG files. Keep important text away from the outer edges because Community surfaces may crop previews.

Figma's current publishing guide recommends a 128 × 128 px icon and a 1920 × 1080 px thumbnail, and allows up to nine additional carousel images or videos:

- https://help.figma.com/hc/en-us/articles/360042293394-Publish-plugins-to-the-Figma-Community
- https://help.figma.com/hc/en-us/articles/22166943560983-Grow-your-audience-on-Community

## Visual direction

### Icon

- Background: solid Figma-blue or deep indigo rounded square.
- Foreground: a white `E` combined with a text cursor or PDF page corner.
- Avoid small words such as “PDF”; they will become unreadable in the editor.
- Check legibility at 32 × 32 px before exporting the 128 × 128 px master.

### Thumbnail / cover

Recommended headline:

> Editable text. Real PDF.

Supporting line:

> Export Figma frames for editing in Adobe Acrobat.

Composition:

1. Left: three simplified Figma frames.
2. Center: export arrow or plugin panel.
3. Right: a PDF page with selected text and a visible text cursor.
4. Bottom badge: `Local processing · No uploads`.

Do not imply pixel-perfect support for every text effect. The listing and visuals should consistently disclose that unsupported effects may be simplified.

## Carousel plan

### Image 1 — One-click workflow

Headline:

> From Figma frames to editable PDF

Caption:

> Export every top-level frame on the current page as a multi-page PDF.

Visual: Figma canvas on the left, compact plugin panel in the center, PDF result on the right.

### Image 2 — Editable text proof

Headline:

> Select, search, copy, and edit text

Caption:

> Text is rebuilt as real PDF text objects for Adobe Acrobat.

Visual: Acrobat with one Chinese paragraph and one English heading selected or edited.

### Image 3 — Original font matching

Headline:

> Uses your installed original fonts

Caption:

> Fonts are handled automatically. No font picker and no bundled substitute font.

Visual: Figma font styles mapped to either “Fully embedded” or “Uses installed system font”.

### Image 4 — Local processing

Headline:

> Your design stays on your device

Caption:

> No backend, no account, no analytics, and no external network requests.

Visual: device outline containing the Figma frame, font, and PDF icons; no cloud arrow.

### Image 5 — Honest compatibility guidance

Headline:

> Clear warnings before handoff

Caption:

> Complex text effects may be simplified. Cross-device editing requires the same font version.

Visual: compatibility warning list plus the handoff package contents: PDF, manifest, and README.

## Community listing copy

### Name

`Editable PDF Exporter`

### Tagline — recommended

`Export Figma frames to PDF with selectable, editable text.`

### Category

Recommended: `Design tools`

If the publishing form asks for a subcategory, choose the closest available option to productivity, export, or document workflow.

### English description — recommended

Editable PDF Exporter turns every top-level frame on the current Figma page into a page of a multi-page PDF, while rebuilding supported text as selectable, searchable, and editable PDF text.

What it does:

- Exports all top-level frames on the current page in canvas order.
- Preserves supported Chinese, English, and mixed-style text as real PDF text objects.
- Supports multiline text, mixed sizes, letter spacing, rotation, opacity, solid fills, and solid strokes.
- Automatically embeds readable static TTF/OTF fonts, or references the installed Figma font by name when local font-file access is unavailable—there is no font picker and no bundled substitute font.
- Provides a direct PDF export and an optional handoff package containing the PDF, font manifest, compatibility report, and editing instructions.
- Runs locally with no account, backend, analytics, uploads, or external network requests.

How to use:

1. Open the Figma page you want to export.
2. Run Editable PDF Exporter.
3. Review any compatibility notices.
4. Click Export PDF.

Font requirements:

The original fonts used by the design must be available in Figma. When Figma does not expose the raw font file, the PDF references that system font by name instead of blocking export. In that mode, the same font must be installed on every computer that opens or edits the PDF; otherwise the PDF viewer may substitute it.

Compatibility notes:

Gradient or image text fills, shadows, blur, blend modes, and path text may be simplified to keep text editable. SVG text export is provided by Figma and visual differences can occur in unsupported cases.

Privacy:

All processing happens on your device. The plugin declares no network access and does not collect or store document content, fonts, personal data, or telemetry.

### Chinese description

Editable PDF Exporter 会将当前 Figma Page 的全部顶层 Frame 按画布顺序生成多页 PDF，并把支持的文字重建为可选择、搜索、复制和编辑的 PDF 文本对象。

主要功能：

- 当前页全部顶层 Frame 自动生成多页 PDF。
- 支持中文、英文、混排、多行、混合字号、字距、旋转、透明度、纯色填充和纯色描边。
- 字体文件可读取时自动完整嵌入；Figma 未开放字体文件读取时自动改用同名字体引用，无需逐项选择字体，也不使用预置替代字体。
- 可直接导出 PDF，或生成包含 PDF、字体清单、兼容性报告和编辑说明的交接包。
- 完全本地处理，无账号、无服务器、无分析统计、无上传、无外部网络请求。

使用方法：打开需要导出的 Figma 页面，运行插件，检查兼容性提示，然后点击“导出 PDF”。

字体要求：设计稿字体必须能在 Figma 中正常显示。字体文件无法读取时不会再阻止导出，而是写入未嵌入的系统字体引用；打开和编辑 PDF 的电脑需要安装同名字体，否则阅读器可能替换字体。

兼容性说明：渐变或图片文字、阴影、模糊、特殊混合模式和路径文字可能会被简化，以保留文字可编辑性。

### Search keywords

If the form provides a tags or keywords field, use the most relevant available terms:

`PDF`, `export`, `editable text`, `Acrobat`, `typography`, `document`, `handoff`, `print`, `fonts`, `Chinese`, `local processing`, `productivity`

## Support contact

Figma requires a public support contact. Use one of the following and keep it monitored:

- Email: `TODO: support@example.com`
- Support page: `TODO: https://example.com/editable-pdf-exporter/support`

Suggested support response scope:

- Figma Desktop version and operating system.
- A screenshot of the plugin error message.
- Font family and style shown by Figma; do not ask users to send licensed font files.
- Whether the issue occurs in direct PDF export, handoff package export, or Acrobat editing.

## Privacy and security disclosure

Publish `PRIVACY.md` at a stable public URL and use that URL wherever the form requests a privacy policy.

Recommended security disclosure answers:

| Question | Answer |
| --- | --- |
| Do you host a backend service? | No. |
| Does the plugin make network requests? | No. `allowedDomains` is set to `["none"]`. |
| Does the plugin require authentication? | No. |
| Do you collect analytics or telemetry? | No. |
| Do you store data read or derived from Figma? | No. Processing data remains in memory only while the plugin runs. |
| Do you send Figma or font data to third parties? | No. |
| How are updates managed? | Updates are built, tested, and distributed through the Figma Community publishing process. |

Figma currently describes the security disclosure as optional but encourages plugin creators to complete it:

- https://help.figma.com/hc/en-us/articles/16354660649495-Security-disclosure-principles
- https://help.figma.com/hc/en-us/articles/360039958914-Plugin-and-widget-review-guidelines

## Final submission checklist

- [ ] Replace the support contact placeholders.
- [ ] Publish the privacy notice at a public HTTPS URL.
- [ ] Confirm the manifest plugin ID belongs to the publishing account.
- [ ] Enable two-factor authentication on the Figma account.
- [ ] Export the 128 × 128 px icon.
- [ ] Export the 1920 × 1080 px thumbnail.
- [ ] Export 4–5 carousel images at 1920 × 1080 px.
- [ ] Run the final production build and complete Windows/macOS Figma Desktop testing.
- [ ] Test selection, search, copy, replacement, insertion, and deletion in Adobe Acrobat.
- [ ] Enter the support contact and verify the Community listing shows no network access.
- [ ] Complete the optional security disclosure.
- [ ] Submit from Figma Desktop and monitor the Figma account email for review feedback.
