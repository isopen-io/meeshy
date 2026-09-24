// Gabarits App Store (#7727) : la scène autour de l'écran reproduit. Les écrans eux-mêmes
// viennent du socle (screens/) ; ce fichier ne compose que le fond, la légende, l'appareil et
// les surimpressions autorisées par la guideline 2.3.3 (texte, flèche, halo, drapeaux).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { html, raw, toString } from '../../lib/html.mjs'
import { REPO_ROOT } from '../../lib/catalog.mjs'
import { cadre, tailleCadre } from '../../lib/cadres.mjs'
import { directionOf } from '../../lib/locales.mjs'
import { langue } from '../../lib/langues.mjs'
import { typo } from '../../lib/composants.mjs'
import { icon } from '../../lib/icons.mjs'
import { meeshEntry } from '../../screens/progression.mjs'
import { DEMO } from '../../textes/demo.mjs'
import { kitCss } from '../../lib/styles.mjs'
import { contexte, coupeLegende, ecran } from '../../lib/gabarits.mjs'
import { LEGENDES } from '../../textes/legendes.mjs'
import { APPAREILS, BONJOURS, POSTER } from './plan.mjs'
import { MISE_EN_PAGE } from './mise-en-page.mjs'

const CSS_APPSTORE = readFileSync(resolve(REPO_ROOT, 'scripts/marketing-kit/templates/appstore/appstore.css'), 'utf8')

// Le logo RÉEL de l'app (apps/ios/logo_master.svg), son identifiant de dégradé rendu unique.
const LOGO_SVG = readFileSync(resolve(REPO_ROOT, 'apps/ios/logo_master.svg'), 'utf8')
  .replace(/<\?xml[^>]*>/, '')
  .replace(/id="gradient"/g, 'id="as-logo-grad"')
  .replace(/url\(#gradient\)/g, 'url(#as-logo-grad)')
  .replace(/width="1024" height="1024"/, 'width="100%" height="100%"')

const logo = (taille) => html`<span class="as-logo" style="width:${taille}px;height:${taille}px">${raw(LOGO_SVG)}</span>`

// Géométrie en points CSS : la scène iPhone fait 440 × 956, l'iPad 1376 × 1032.
const SCENES = {
  iphone: { echelle: 0.82, deviceTop: 246 },
  ipad: { echelle: 0.84, deviceTop: 214 },
}

const scene = (appareil) => {
  const a = APPAREILS[appareil]
  return { width: a.width / a.scale, height: a.height / a.scale }
}

// Panorama : un ruban et des halos dessinés sur la largeur de TOUTE la séquence, chaque
// capture en montrant sa tranche — la rangée de l'App Store se lit comme une seule fresque.
const panorama = (appareil) => {
  const { width, height } = scene(appareil)
  const n = APPAREILS[appareil].captures.length
  const total = width * n
  const onde = (phase, amplitude, milieu) =>
    Array.from({ length: Math.ceil(total / 12) + 1 }, (_, i) => {
      const x = i * 12
      const y = milieu + amplitude * Math.sin((2 * Math.PI * x) / (width * 2.3) + phase)
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    }).join('')
  const m = appareil === 'iphone' ? { a: height * 0.26, y: height * 0.56, w: 86 } : { a: height * 0.2, y: height * 0.55, w: 120 }
  const halos = Array.from({ length: n + 1 }, (_, k) => {
    const haut = k % 2 === 0
    const r = appareil === 'iphone' ? 190 : 300
    return html`<i class="as-halo ${haut ? 'h' : 'b'}" style="left:${k * width - r}px;top:${(haut ? height * 0.1 : height * 0.78) - r}px;width:${r * 2}px;height:${r * 2}px"></i>`
  })
  return html`<div class="as-pano" style="width:${total}px">
    ${halos}
    ${raw(`<svg class="as-ruban" width="${total}" height="${height}" viewBox="0 0 ${total} ${height}" aria-hidden="true">
      <defs><linearGradient id="as-rub" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width * 2}" y2="0" spreadMethod="reflect">
        <stop offset="0" style="stop-color:var(--rub-a)"/><stop offset="1" style="stop-color:var(--rub-b)"/></linearGradient></defs>
      <path d="${onde(0, m.a, m.y)}" fill="none" stroke="url(#as-rub)" stroke-width="${m.w}" stroke-linecap="round" class="r1"/>
      <path d="${onde(1.9, m.a * 0.8, m.y - 40)}" fill="none" stroke="url(#as-rub)" stroke-width="${m.w * 0.22}" stroke-linecap="round" class="r2"/>
    </svg>`)}
  </div>`
}

const legende = ({ lang, cle }) => {
  const texte = LEGENDES[cle][lang]
  const [l1, l2] = coupeLegende(typo(texte, lang))
  return html`<h1 class="as-caption" data-fit><span class="l1">${l1}</span>${l2 ? html` <span class="l2">${l2}</span>` : ''}</h1>`
}

const pastilleDrapeau = (code) => html`<span class="as-flag">${langue(code).drapeau}</span>`

const DECORS = {
  // Surimpression du § 5 : 🇫🇷 → 🇰🇷, ancrée au vocal par la mise en page (data-ancre).
  fleche: (ctx) =>
    html`<div class="as-fleche" data-ancre=".bubble.audio">${pastilleDrapeau(ctx.lang)}${icon(ctx.dir === 'rtl' ? 'arrowLeft' : 'arrowRight', { size: 18 })}${pastilleDrapeau('ko')}</div>`,
  'drapeaux-groupe': (ctx) =>
    html`<div class="as-rangee as-pile">${['ko', 'es', 'ja', ctx.lang === 'ja' ? 'fr' : ctx.lang].map(pastilleDrapeau)}</div>`,
  'drapeaux-monde': () =>
    html`<div class="as-rangee as-pile">${['en', 'it', 'pt', 'hi', 'de'].map(pastilleDrapeau)}</div>`,
  bonjours: (ctx, appareil) =>
    html`<div class="as-rangee as-bonjours">${BONJOURS.filter((b) => b.lang !== ctx.lang).slice(0, appareil === 'iphone' ? 3 : 6).map(
      (b) => html`<span class="as-bonjour" lang="${b.lang}" dir="${directionOf(b.lang)}"><span>${langue(b.lang).drapeau}</span>${b.texte}</span>`,
    )}</div>`,
  // Loupe sur le solde (ProgressionMeeshEntry) : un zoom de l'interface, pas une promesse.
  meesh: () =>
    html`<span class="as-anneau" data-anneau=".reveal-top .meesh-entry"></span><div class="as-loupe dark" data-loupe=".reveal-top .meesh-entry">${meeshEntry(DEMO.progression.meesh)}</div>`,
}

const rangeeDecor = (decor) => decor === 'drapeaux-groupe' || decor === 'drapeaux-monde' || decor === 'bonjours'

const documentHtml = ({ lang, corps, largeur, hauteur }) =>
  `<!doctype html><html lang="${lang}" dir="${directionOf(lang)}"><head><meta charset="utf-8"><style>${kitCss()}\n${CSS_APPSTORE}</style></head><body style="width:${largeur}px;height:${hauteur}px">${toString(corps)}<script>${MISE_EN_PAGE}</script></body></html>`

export const captureDe = ({ appareil, rang }) => {
  const capture = APPAREILS[appareil]?.captures[rang - 1]
  if (!capture) throw new Error(`capture inconnue : ${appareil} n°${rang}`)
  return capture
}

export const pageCapture = ({ appareil, lang, rang }) => {
  const capture = captureDe({ appareil, rang })
  const ctx = contexte({ lang, theme: capture.theme })
  const { width, height } = scene(appareil)
  const { echelle, deviceTop } = SCENES[appareil]
  const device = tailleCadre(appareil)
  const decor = capture.decor ? DECORS[capture.decor](ctx, appareil) : ''
  const ton = capture.theme === 'dark' ? 'as-sombre' : 'as-clair'
  const corps = html`<div class="as-canvas as-${appareil} ${ton}" dir="${ctx.dir}" lang="${lang}" style="width:${width}px;height:${height}px;--pano-x:${-(rang - 1) * width}px;--device-top:${deviceTop}px">
    ${panorama(appareil)}
    <header class="as-head">
      ${rang === 1 ? html`<div class="as-brand">${logo(appareil === 'iphone' ? 30 : 36)}<span>Meeshy</span></div>` : ''}
      ${legende({ lang, cle: capture.legende })}
      ${rangeeDecor(capture.decor) ? decor : ''}
    </header>
    <div class="as-device" style="width:${device.width}px;height:${device.height}px;transform:translateX(-50%) scale(${echelle})">
      ${cadre(appareil, ecran(capture.ecran, ctx))}
    </div>
    ${rangeeDecor(capture.decor) ? '' : decor}
  </div>`
  return documentHtml({ lang, corps, largeur: width, hauteur: height })
}

// Affiche de l'App Preview : l'écran plein cadre (la vidéo EST l'écran), un projecteur sur le
// vocal et les deux surimpressions du storyboard — rien d'autre (2.3.4).
export const pagePoster = ({ lang }) => {
  const ctx = contexte({ lang, theme: 'dark' })
  const largeur = POSTER.width / POSTER.scale
  const hauteur = POSTER.height / POSTER.scale
  const { avant, apres } = POSTER.textes[lang]
  const corps = html`<div class="as-poster" dir="${ctx.dir}" lang="${lang}" style="width:${largeur}px;height:${hauteur}px;--poster-k:${largeur / 440}">
    <div class="as-poster-ecran">${ecran('dm', ctx)}</div>
    <div class="as-spot" data-spot=".bubble.audio"></div>
    <div class="as-poster-textes" data-fit>
      <span class="avant">${typo(avant, lang)}</span>
      <span class="apres">${typo(apres, lang)}</span>
    </div>
    <div class="as-fleche poster" data-ancre=".bubble.audio">${pastilleDrapeau(ctx.lang)}${icon(ctx.dir === 'rtl' ? 'arrowLeft' : 'arrowRight', { size: 18 })}${pastilleDrapeau('ko')}</div>
  </div>`
  return documentHtml({ lang, corps, largeur, hauteur })
}
