import type { ExportWarning, FontRequirement } from '../shared'
import type { FontMapping, FontResolution } from './font'
import { resolveLocalFonts, supportsLocalFontAccess } from './local-fonts'
import { createSystemFontMapping } from './system-font'

function systemReferenceWarning(requirement: FontRequirement): ExportWarning {
  return {
    code: 'FONT_REFERENCED_NOT_EMBEDDED',
    severity: 'warning',
    message: `${requirement.family} ${requirement.style} 将作为系统字体引用写入 PDF；在其他电脑编辑前需安装同名字体。`,
  }
}

function systemResolution(
  requirements: readonly FontRequirement[],
  existingMappings: Map<string, FontMapping> = new Map(),
  warnings: ExportWarning[] = [],
): FontResolution {
  const mappings = new Map(existingMappings)
  const resultWarnings = [...warnings]
  for (const requirement of requirements) {
    mappings.set(requirement.key, createSystemFontMapping(requirement))
    resultWarnings.push(systemReferenceWarning(requirement))
  }
  return { mappings, warnings: resultWarnings }
}

export async function resolveFonts(
  requirements: readonly FontRequirement[],
): Promise<FontResolution> {
  if (requirements.length === 0) return { mappings: new Map(), warnings: [] }

  // Figma's plugin iframe does not consistently expose the experimental
  // Local Font Access API. A PDF can still reference an installed system font
  // by name, so lack of raw TTF/OTF access must not block export.
  if (!supportsLocalFontAccess()) return systemResolution(requirements)

  try {
    const local = await resolveLocalFonts(requirements)
    if (local.unresolved.length === 0) return local
    return systemResolution(local.unresolved, local.mappings, local.warnings)
  } catch {
    return systemResolution(requirements)
  }
}
