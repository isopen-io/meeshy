import { html, raw, toString } from './html.mjs'
import { icon, logo } from './icons.mjs'
import { cadre, tailleCadre } from './cadres.mjs'
import { directionOf } from './locales.mjs'
import { formatOf } from './formats.mjs'
import { langue } from './langues.mjs'
import { typo } from './composants.mjs'
import { createUi } from './ui.mjs'
import { kitCss } from './styles.mjs'
import { LEGENDES } from '../textes/legendes.mjs'
import { ECRANS } from '../screens/index.mjs'
import { SEQUENCES } from './sequences.mjs'

export const contexte = ({ lang, theme }) => ({ lang, theme, dir: directionOf(lang), ui: createUi(lang) })

export const ecran = (nom, ctx) => {
  const rendu = ECRANS[nom]
  if (!rendu) throw new Error(`écran inconnu : ${nom} (connus : ${Object.keys(ECRANS).join(', ')})`)
  return rendu(ctx)
}

// « Ta voix. Leur langue. » → deux lignes : la première blanche, la seconde en dégradé.
export const coupeLegende = (texte) => {
  const [premiere, ...suite] = texte.split(/(?<=[.!?。؟])\s+/)
  return [premiere, suite.join(' ')].filter(Boolean)
}

const surimpressions = {
  'fleche-langues': (ctx) => {
    const fleche = ctx.dir === 'rtl' ? 'arrowLeft' : 'arrowRight'
    return html`<div class="gab-overlay fleche-langues"><span>${langue(ctx.lang).drapeau}</span>${icon(fleche, { size: 22 })}<span>${langue('ko').drapeau}</span></div>`
  },
}

const fondDecor = () =>
  html`<div class="gab-bg"><i class="o1"></i><i class="o2"></i><i class="o3"></i><i class="grain"></i></div>`

const legendeHtml = (texte, lang) => {
  const [l1, l2] = coupeLegende(typo(texte, lang))
  return html`<h1 class="gab-caption${[...texte].length > 30 ? ' long' : ''}"><span class="l1">${l1}</span>${l2 ? html`<span class="l2">${l2}</span>` : ''}</h1>`
}

// Gabarit App Store : fond de marque, légende en haut, appareil qui déborde en bas.
const appStore = ({ format, lang, planche }) => {
  const f = formatOf(format)
  const ctx = contexte({ lang, theme: planche.theme })
  const device = f.device
  const { width, height } = tailleCadre(device)
  const scene = { width: f.width / f.scale, height: f.height / f.scale }
  const echelle = device === 'iphone' ? 0.82 : 0.74
  const texte = LEGENDES[planche.legende][lang]
  const surimpression = planche.surimpression ? surimpressions[planche.surimpression](ctx) : ''
  return html`<div class="canvas appstore ${device} fond-${planche.theme === 'dark' ? 'vif' : 'nuit'}" dir="${ctx.dir}" lang="${lang}" style="width:${scene.width}px;height:${scene.height}px">
    ${fondDecor()}
    <div class="gab-brand">${logo(device === 'iphone' ? 26 : 30, { radius: 0.28 })}<span>Meeshy</span></div>
    ${legendeHtml(texte, lang)}
    <div class="gab-device" style="width:${width}px;height:${height}px;transform:translateX(-50%) scale(${echelle})">
      ${cadre(device, ecran(planche.ecran, ctx))}
      ${surimpression}
    </div>
  </div>`
}

// Écran seul, à la taille native du format (la capture « brute » d'un simulateur).
const ecranSeul = ({ format, lang, planche }) => {
  const f = formatOf(format)
  const ctx = contexte({ lang, theme: planche.theme })
  return html`<div class="canvas brut" style="width:${f.width / f.scale}px;height:${f.height / f.scale}px">${ecran(planche.ecran, ctx)}</div>`
}

const GABARITS = { appstore: appStore, ecran: ecranSeul }

export const planchesDuFormat = (format) => {
  const sequence = SEQUENCES[format]
  if (!sequence) throw new Error(`aucune séquence pour le format ${format}`)
  return sequence
}

export const page = ({ format, lang, gabarit }) => {
  const planche = planchesDuFormat(format).find((p) => p.id === gabarit)
  if (!planche) {
    throw new Error(`gabarit inconnu pour ${format} : ${gabarit} (connus : ${planchesDuFormat(format).map((p) => p.id).join(', ')})`)
  }
  const corps = GABARITS[planche.gabarit]({ format, lang, planche })
  return `<!doctype html><html lang="${lang}" dir="${directionOf(lang)}"><head><meta charset="utf-8"><style>${kitCss()}</style></head><body>${toString(corps)}</body></html>`
}

export { raw }
