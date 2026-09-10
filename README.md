# Editable PDF Exporter for Figma

一个本地运行的 Figma 插件：把当前 Page 的全部顶层 Frame 按画布位置生成多页 PDF，并把普通文字重建为 Adobe Acrobat 可选择、搜索和编辑的 PDF 文本对象。

## 本地安装

1. 安装 [Node.js](https://nodejs.org/) 20 或更高版本。
2. 在本目录运行：

   ```powershell
   npm install
   npm run build
   ```

3. 打开 Figma Desktop，进入 `Plugins > Development > Import plugin from manifest...`。
4. 选择本目录的 `manifest.json`。

`manifest.json` 中的 ID 仅用于本地开发。准备发布或创建团队私有插件时，应使用 Figma 分配的新 ID 替换它。

## 使用流程

1. 在 Figma 中打开要导出的 Page，再运行 **Editable PDF Exporter**。
2. 插件自动读取当前 Page 的全部顶层 Frame。排序依据画板位置和完整高度：纵向分离时从上到下，纵向重叠时从左到右，不使用固定像素分行容差或画板名称。PDF 和交接包使用同一份页序。
3. 点击 **导出 PDF** 直接获得可编辑 PDF，无需选择字体或勾选字体授权确认。
4. 需要发给另一台电脑继续编辑时，点击 **交接包**，ZIP 会额外包含安装说明和字体清单。
5. 插件优先读取并完整嵌入系统中的原字体；Figma 未开放字体文件读取时，会自动改用系统字体引用，不再阻止导出。

面板仅显示当前页面、画板与字体数量、兼容性提示和导出操作，不再显示画板顺序列表。点击「刷新」可重新扫描页面；每次导出也会重新读取最新画板位置。面板颜色跟随 Figma 的浅色 / 深色主题。

字体文件可读取且许可允许时，PDF 会完整嵌入字体。否则 PDF 会按 Figma 字体名称引用系统字体；这种 PDF 仍包含真实文本对象，但打开和编辑电脑必须安装同名字体，否则阅读器可能替换字体。Acrobat 若要增删文字，编辑电脑通常仍需安装 PDF 使用的同版本字体。

可选交接包 ZIP 包含：

- `editable.pdf`：多页可编辑 PDF。
- `font-manifest.json`：字体映射、PostScript 名称、是否嵌入、版本、哈希、页码、许可结果和警告。
- `README.txt`：给 PDF 接收方的字体安装及 Acrobat 操作说明。

交接包不会包含或重新分发本机字体原文件。接收方需要根据字体清单从合法来源安装相同版本字体，完全退出并重新打开 Acrobat Pro，再使用“编辑 PDF”工具。Adobe 说明，编辑电脑缺少相同字体或字体版本不同时，PDF 文字可能无法增删。

## 实现方式

- Figma 主线程只负责扫描文件和逐页产生资源；字体解析、PDF 合并和 ZIP 打包全部在插件 UI iframe 内本地完成。
- 每页创建临时 Frame 克隆，先识别需转曲的文字，再导出 `SVG_STRING` 并由 UI 校验文字能否完整重建。仅对通过校验的文字设置透明度为 0（保留 Auto Layout 占位），其余文字保留在 Figma 原生 PDF 中，以字形轮廓输出。
- SVG 导出、定位或完整性检查失败时，自动保留相关文字的原生转曲结果，不再忽略文字或猜测黑色文字位置。
- SVG 的 `<text>/<tspan>` 提供文字基线、字距、颜色和变换；`pdf-lib` 使用完整嵌入字体或带 ToUnicode 的系统字体引用，通过 PDF 文本矩阵把真实文字写到背景页上。
- 临时克隆在成功、失败和取消路径中都会删除，原 Figma 文件不保留修改。
- 插件声明 `allowedDomains: ["none"]`，不会上传 Figma 内容或字体。

## 支持与降级

普通中文/英文、可解析的混排、多行、字距、旋转、透明度和纯色填充文字保持可编辑。插件不提供字体选择或逐项映射界面，也不预置替代字体。Local Font Access API 可用时，插件会读取并完整嵌入允许嵌入的静态 TTF/OTF；该接口不可用、被拒绝或无法匹配时，会自动生成系统字体引用 PDF，并在交接报告中提示接收方安装同名字体。

以下文字自动转曲，保留 Figma 原生导出外观，并写入导出报告：

- 描边文字（包括只有描边、没有填充的文字）。
- 渐变、图片、多重填充，带阴影、模糊或混合模式的文字。
- 路径文字、装饰线、截断文字，以及受蒙版或裁剪影响的文字。
- Figma 缺失字体，或未生成完整、可可靠重建的 SVG 文本的文字。

转曲文字不再支持文本编辑或搜索，普通文字仍保持可编辑。处理只发生在临时克隆上，原始设计稿不会被修改。字体清单只包含最终保留为文本的字体。

完整嵌入路径不支持 TTC、WOFF、可变字体和远程字体，也不会绕过字体的 OS/2 嵌入许可位；这些字体仍可走未嵌入的系统字体引用路径。

## 开发与验证

```powershell
npm run check
npm test
npm run build
# 或一次执行全部检查
npm run verify
```

测试会生成未嵌入字体引用的 `tmp/pdfs/smoke-system-reference.pdf`；Windows 且存在 Arial 时还会生成完整嵌入测试文件。可以使用 Poppler 渲染，并用 `pypdf` 或 `pdfplumber` 确认文字仍可提取。

排序回归样本来自用户确认的 Figma 原生 PDF（2026-09-10，Page 8，6 个 595 × 842 画板）：`A4 - 43 → A4 - 40 → A4 - 42 → A4 - 41 → A4 - 39 → A4 - 44`。测试覆盖该顺序从扫描到 PDF 合并的完整链路。Figma 未公开完整排序算法或提供原生多页排序 API；当前实现是根据实测结果对齐的兼容实现，任意复杂布局的完全一致性仍需原生样本验证。

在真实文件上至少检查：

- PDF 页数、尺寸和 Frame 排序正确。
- 普通中文、英文、混合样式和旋转文字位置正确。
- Acrobat Pro 可以选择、搜索、替换、插入和删除文字。
- 在另一台电脑根据字体清单安装相同版本字体后重复 Acrobat 编辑测试。
- 取消或报错后 Figma Page 没有额外克隆或内容修改。

## 参考

- [Figma ExportSettings](https://developers.figma.com/docs/plugins/api/ExportSettings/)
- [Figma Plugin Manifest](https://developers.figma.com/docs/plugins/manifest/)
- [Adobe：编辑 PDF 时没有可用系统字体](https://helpx.adobe.com/acrobat/kb/error-no-available-system-font.html)
