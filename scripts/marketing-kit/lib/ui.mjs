import { loadAppCatalog } from './catalog.mjs'
import { KIT_TEXTES } from '../textes/kit.mjs'

const substitute = (template, args) => template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]))

// Les libellés d'interface viennent du catalogue RÉEL de l'app (Localizable.xcstrings) :
// un écran reproduit dit ce que l'app dit. `KIT_TEXTES` ne porte que ce que l'app
// n'a pas en catalogue ; une clé absente des deux fait échouer le rendu.
export const createUi = (lang, catalog = loadAppCatalog()) => {
  const ui = (key, ...args) => {
    const kit = KIT_TEXTES[key]
    if (kit) {
      const template = kit[lang]
      if (template === undefined) throw new Error(`kit : « ${key} » n’est pas traduite en ${lang}`)
      return substitute(template, args)
    }
    return catalog(key, lang, ...args)
  }
  ui.lang = lang
  return ui
}
