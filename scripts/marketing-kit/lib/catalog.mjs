import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { catalogLocale } from './locales.mjs'

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')

const APP_CATALOGS = [
  'apps/ios/Meeshy/Localizable.xcstrings',
  'packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings',
]

const pluralCategory = (lang, count) => new Intl.PluralRules(lang).select(count)

const resolveUnit = (localization, lang, args) => {
  if (localization?.stringUnit?.value !== undefined) return localization.stringUnit.value
  const plural = localization?.variations?.plural
  if (!plural) return undefined
  const count = args.find((a) => typeof a === 'number') ?? 0
  const forme = plural[pluralCategory(lang, count)] ?? plural.other
  return forme?.stringUnit?.value
}

const substitute = (template, args) => {
  let next = 0
  return template.replace(/%(?:(\d+)\$)?(lld|ld|d|@|%)/g, (match, position, kind) => {
    if (kind === '%') return '%'
    const index = position ? Number(position) - 1 : next++
    if (index >= args.length) throw new Error(`catalogue : argument ${index + 1} manquant pour « ${template} »`)
    return String(args[index])
  })
}

export const createCatalog = (catalogs) => {
  const strings = Object.assign({}, ...catalogs.map((c) => c.strings))
  return (key, lang, ...args) => {
    const entry = strings[key]
    if (!entry) throw new Error(`catalogue : clé inconnue « ${key} »`)
    const localizations = entry.localizations ?? {}
    const template = resolveUnit(localizations[catalogLocale(lang)] ?? localizations[lang], lang, args)
    if (template === undefined) throw new Error(`catalogue : « ${key} » n’est pas traduite en ${lang}`)
    return substitute(template, args)
  }
}

let appCatalog

export const loadAppCatalog = () => {
  appCatalog ??= createCatalog(APP_CATALOGS.map((path) => JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'))))
  return appCatalog
}
