import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './catalog.mjs'

const STYLES_DIR = resolve(REPO_ROOT, 'scripts/marketing-kit/styles')

// La palette et les métriques viennent de packages/design-tokens/ios.css, GÉNÉRÉ depuis
// MeeshyColors.swift et DesignTokens.swift (#5445) : le kit n'a aucune table de couleurs à lui.
// Ce fichier pose ses schémas sur `:root` ; le kit les rattache à `.dark` / `.light` pour qu'un
// même rendu puisse montrer un écran clair à côté d'un écran sombre (iPad, planches).
const scopedIosTokens = () => {
  const css = readFileSync(resolve(REPO_ROOT, 'packages/design-tokens/ios.css'), 'utf8')
  const dark = ':root,\n:root.dark {'
  const light = ':root.light {'
  if (!css.includes(dark) || !css.includes(light)) {
    throw new Error('ios.css : sélecteurs de schéma introuvables — le générateur a changé, adapter lib/styles.mjs')
  }
  return css.replace(dark, ':root,\n.dark {').replace(light, '.light {')
}

const sheet = (name) => readFileSync(resolve(STYLES_DIR, name), 'utf8')

export const kitCss = () =>
  [scopedIosTokens(), sheet('base.css'), sheet('ecrans.css'), sheet('ecrans-2.css'), sheet('gabarits.css')].join('\n')
