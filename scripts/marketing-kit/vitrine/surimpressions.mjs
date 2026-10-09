// Les images que le montage pose sur les prises (#9807, #9811), rendues par Chromium HORS RÉSEAU avec le
// socle du kit (jetons --ios-* générés depuis MeeshyColors.swift, polices du kit, arabe en RTL) :
// - la LÉGENDE d'un plan : PNG transparent au format de l'aperçu, un voile indigo en tête et le texte ;
// - la CARTE DE FIN : logo réel de l'app, devise, mention du compte requis ;
// - le FOND d'un visuel créatif : dégradé de la marque, titre, sous-titre et cadres des cartes, que
//   montage.mjs remplit des images clés ou des clips.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { typo } from '../lib/composants.mjs'
import { coupeLegende } from '../lib/gabarits.mjs'
import { html, raw, toString } from '../lib/html.mjs'
import { directionOf } from '../lib/locales.mjs'
import { pngInfo, stripAlpha } from '../lib/png.mjs'
import { kitCss } from '../lib/styles.mjs'

export const ECHELLE = 2

const LOGO_SVG = readFileSync(resolve(REPO_ROOT, 'apps/ios/logo_master.svg'), 'utf8')
  .replace(/<\?xml[^>]*>/, '')
  .replace(/id="gradient"/g, 'id="ap-logo-grad"')
  .replace(/url\(#gradient\)/g, 'url(#ap-logo-grad)')
  .replace(/width="1024" height="1024"/, 'width="100%" height="100%"')

const CSS = `
html, body { background: transparent; }
.ap { position: relative; overflow: hidden; color: #fff; font-family: var(--kit-font); }
[lang='ar'] .ap, .ap[lang='ar'] { font-family: var(--kit-font-arabic), var(--kit-font); }
.ap-voile { position: absolute; inset: 0 0 auto 0; height: 34%;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ios-indigo-950) 82%, transparent) 0%,
    color-mix(in srgb, var(--ios-indigo-950) 52%, transparent) 50%, transparent 100%); }
.ap-texte { position: absolute; inset-inline: 7%; top: var(--ap-haut); margin: 0; text-align: center;
  font-size: var(--ap-corps); font-weight: 850; line-height: 1.06; letter-spacing: -0.02em;
  text-wrap: balance; text-shadow: 0 2px 14px color-mix(in srgb, var(--ios-indigo-950) 55%, transparent); }
.ap[lang='ar'] .ap-texte, .ap[lang='ar'] .ap-titre { line-height: 1.3; font-weight: 800; letter-spacing: 0; }
.ap-texte .l1, .ap-titre .l1 { display: block; }
.ap-texte .l2, .ap-titre .l2 { display: block; color: var(--ios-indigo-100); }
.ap-fin { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4%;
  background: radial-gradient(120% 60% at 50% 0%, color-mix(in srgb, var(--ios-indigo-400) 70%, transparent), transparent 70%),
    linear-gradient(168deg, var(--ios-indigo-500) 0%, var(--ios-indigo-700) 48%, var(--ios-purple-700) 100%); }
.ap-logo { display: block; border-radius: 23%; overflow: hidden;
  box-shadow: 0 10px 30px color-mix(in srgb, var(--ios-indigo-950) 35%, transparent), 0 0 0 1px color-mix(in srgb, white 30%, transparent); }
.ap-marque { font-weight: 800; letter-spacing: -0.02em; }
.ap-devise { margin: 0; padding-inline: 9%; text-align: center; font-weight: 800; line-height: 1.12; text-wrap: balance; }
.ap-devise .l2 { display: block; color: var(--ios-indigo-100); }
.ap-mention { position: absolute; bottom: 6%; inset-inline: 8%; text-align: center; font-weight: 600; opacity: 0.86; }
.ap-creatif { background: radial-gradient(70% 90% at 50% 0%, color-mix(in srgb, var(--ios-indigo-400) 65%, transparent), transparent 70%),
    radial-gradient(60% 70% at 85% 100%, color-mix(in srgb, var(--ios-purple-500) 55%, transparent), transparent 70%),
    linear-gradient(160deg, var(--ios-indigo-600) 0%, var(--ios-indigo-800, #3730a3) 50%, var(--ios-indigo-950) 100%); }
.ap-tete { position: absolute; inset-inline: 6%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.35em; text-align: center; }
.ap-titre { margin: 0; font-weight: 850; line-height: 1.04; letter-spacing: -0.025em; text-wrap: balance; }
.ap-sous-titre { margin: 0; font-weight: 600; color: color-mix(in srgb, var(--ios-indigo-100) 92%, white); text-wrap: balance; }
.ap-cadre { position: absolute; background: color-mix(in srgb, white 12%, transparent);
  border: 1px solid color-mix(in srgb, white 28%, transparent);
  box-shadow: 0 30px 70px color-mix(in srgb, #0f0c29 55%, transparent); }
.ap-ecran { position: absolute; background: color-mix(in srgb, var(--ios-indigo-950) 35%, white 8%); }
`

// Réduit le corps jusqu'à ce que le texte tienne dans sa boîte : `[data-ajuste]` ne déborde ni en largeur
// ni au-delà de `data-max` px de haut.
const AJUSTER = `
window.apAjuster = () => {
  for (const el of document.querySelectorAll('[data-ajuste]')) {
    const max = Number(el.dataset.max)
    let corps = parseFloat(getComputedStyle(el).fontSize)
    while (corps > 8 && (el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().height > max)) {
      corps -= 1
      el.style.fontSize = corps + 'px'
    }
  }
}
`

const documentHtml = ({ lang, corps, largeur, hauteur }) =>
  `<!doctype html><html lang="${lang}" dir="${directionOf(lang)}"><head><meta charset="utf-8"><style>${kitCss()}\n${CSS}</style></head>` +
  `<body style="width:${largeur}px;height:${hauteur}px;margin:0">${toString(corps)}<script>${AJUSTER}</script></body></html>`

const lignes = (texte, lang) => {
  const [l1, l2] = coupeLegende(typo(texte, lang))
  return html`<span class="l1">${l1}</span>${l2 ? html` <span class="l2">${l2}</span>` : ''}`
}

const css = (n) => n / ECHELLE

// La légende d'un plan, au format de l'aperçu (pixels de sortie).
export const pageLegende = ({ texte, lang, largeur, hauteur }) => {
  const l = css(largeur)
  const h = css(hauteur)
  const corps = Math.round(l * 0.072)
  const corpsHtml = html`<div class="ap" lang="${lang}" dir="${directionOf(lang)}" style="width:${l}px;height:${h}px;--ap-corps:${corps}px;--ap-haut:${Math.round(h * 0.075)}px">
    <div class="ap-voile"></div>
    <h1 class="ap-texte" data-ajuste data-max="${Math.round(h * 0.2)}">${lignes(texte, lang)}</h1>
  </div>`
  return { html: documentHtml({ lang, corps: corpsHtml, largeur: l, hauteur: h }), largeur, hauteur, transparent: true }
}

// La carte de fin, plein cadre, opaque.
export const pageFin = ({ devise, mention, lang, largeur, hauteur }) => {
  const l = css(largeur)
  const h = css(hauteur)
  const logo = Math.round(Math.min(l, h) * 0.26)
  const corpsHtml = html`<div class="ap ap-fin" lang="${lang}" dir="${directionOf(lang)}" style="width:${l}px;height:${h}px">
    <span class="ap-logo" style="width:${logo}px;height:${logo}px">${raw(LOGO_SVG)}</span>
    <div class="ap-marque" style="font-size:${Math.round(l * 0.085)}px">Meeshy</div>
    <p class="ap-devise" data-ajuste data-max="${Math.round(h * 0.22)}" style="font-size:${Math.round(l * 0.066)}px">${lignes(devise, lang)}</p>
    ${mention ? html`<div class="ap-mention" style="font-size:${Math.round(l * 0.034)}px">${mention}</div>` : ''}
  </div>`
  return { html: documentHtml({ lang, corps: corpsHtml, largeur: l, hauteur: h }), largeur, hauteur, transparent: false }
}

// Le fond d'un visuel créatif : `disposition` vient de dispositionCreatif (pixels de sortie).
export const pageFondCreatif = ({ titre, sousTitre, lang, disposition }) => {
  const { largeur, hauteur, titre: zone, cartes } = disposition
  const l = css(largeur)
  const h = css(hauteur)
  const hautZone = css(zone.bas - zone.haut)
  const cadres = cartes.map((c) => {
    const marge = css(Math.round(c.largeur * 0.035))
    const r = css(c.rayon)
    return html`<div class="ap-cadre" style="left:${css(c.x) - marge}px;top:${css(c.y) - marge}px;width:${css(c.largeur) + 2 * marge}px;height:${css(c.hauteur) + 2 * marge}px;border-radius:${r + marge}px"></div>
      <div class="ap-ecran" style="left:${css(c.x)}px;top:${css(c.y)}px;width:${css(c.largeur)}px;height:${css(c.hauteur)}px;border-radius:${r}px"></div>`
  })
  const corpsHtml = html`<div class="ap ap-creatif" lang="${lang}" dir="${directionOf(lang)}" style="width:${l}px;height:${h}px">
    <div class="ap-tete" style="top:${css(zone.haut)}px;height:${hautZone}px">
      <h1 class="ap-titre" data-ajuste data-max="${Math.round(hautZone * 0.72)}" style="font-size:${css(zone.corps)}px;width:100%">${lignes(titre, lang)}</h1>
      <p class="ap-sous-titre" data-ajuste data-max="${Math.round(hautZone * 0.3)}" style="font-size:${css(zone.sousCorps)}px;width:100%">${typo(sousTitre, lang)}</p>
    </div>
    ${cadres}
  </div>`
  return { html: documentHtml({ lang, corps: corpsHtml, largeur: l, hauteur: h }), largeur, hauteur, transparent: false }
}

const horsReseau = async (context, reseau) => {
  context.on('request', (req) => {
    if (!/^(data|file|about):/.test(req.url())) reseau.push(req.url())
  })
  await context.route('**/*', (route) => (/^(data|file|about):/.test(route.request().url()) ? route.continue() : route.abort('blockedbyclient')))
}

// Rend une page en PNG à la taille de sortie exacte ; transparente = RVBA, sinon RVB sans alpha.
export const rendrePage = async (browser, { html: contenu, largeur, hauteur, transparent }) => {
  const reseau = []
  const context = await browser.newContext({ viewport: { width: css(largeur), height: css(hauteur) }, deviceScaleFactor: ECHELLE })
  await horsReseau(context, reseau)
  const page = await context.newPage()
  try {
    await page.setContent(contenu, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.apAjuster())
    const brut = await page.screenshot({ type: 'png', omitBackground: transparent })
    if (reseau.length) throw new Error(`surimpression : ${reseau.length} requête(s) réseau — ${reseau[0]}`)
    const png = transparent ? brut : stripAlpha(brut)
    const info = pngInfo(png)
    if (info.width !== largeur || info.height !== hauteur) throw new Error(`surimpression ${info.width}×${info.height}, attendu ${largeur}×${hauteur}`)
    return png
  } finally {
    await context.close()
  }
}
