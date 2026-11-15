import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './catalog.mjs'

// Drapeau, nom natif et couleur de chaque langue : lus dans LanguageDisplay.swift (MeeshyUI),
// la table que LanguageFlagChip et les pastilles audio de l'app emploient.
const SOURCE = 'packages/MeeshySDK/Sources/MeeshyUI/Utilities/LanguageDisplay.swift'

const LANGUES = Object.fromEntries(
  [...readFileSync(resolve(REPO_ROOT, SOURCE), 'utf8').matchAll(/"([a-z]{2,3})": \("([^"]+)", "([^"]+)", "([0-9A-F]{6})"\)/g)].map(
    ([, code, drapeau, nom, couleur]) => [code, { code, drapeau, nom, couleur: `#${couleur}` }],
  ),
)

export const langue = (code) => {
  const l = LANGUES[code]
  if (!l) throw new Error(`langue absente de ${SOURCE} : ${code}`)
  return l
}
