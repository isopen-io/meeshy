import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../../lib/catalog.mjs'
import { toString } from '../../lib/html.mjs'
import { contexte } from '../../lib/gabarits.mjs'
import { directionOf } from '../../lib/locales.mjs'
import { kitCss } from '../../lib/styles.mjs'
import { visuel } from './catalogue.mjs'

const DOSSIER = resolve(REPO_ROOT, 'scripts/marketing-kit/templates/social')

let css
const socialCss = () => {
  css ??= ['social.css', 'social-2.css'].map((f) => readFileSync(resolve(DOSSIER, f), 'utf8')).join('\n')
  return css
}

export const pageSociale = ({ id, lang }) => {
  const v = visuel(id)
  const corps = v.rendu(contexte({ lang, theme: 'dark' }))
  return `<!doctype html><html lang="${lang}" dir="${directionOf(lang)}"><head><meta charset="utf-8"><style>${kitCss()}\n${socialCss()}</style></head><body>${toString(corps)}</body></html>`
}
