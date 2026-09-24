// X / Threads (1:1 540 × 540, 16:9 800 × 450) et miniatures YouTube (640 × 360) —
// contenu-par-format.md § 3 et § 4.
import { html, raw } from '../../lib/html.mjs'
import { icon } from '../../lib/icons.mjs'
import { avatar, flagChip, typo } from '../../lib/composants.mjs'
import { contexte, ecran } from '../../lib/gabarits.mjs'
import { langue } from '../../lib/langues.mjs'
import { waveformHeights } from '../../screens/audio.mjs'
import { serve } from '../../lib/prism.mjs'
import { DEMO, profilDe } from '../../textes/demo.mjs'
import { loupe, marqueDiscrete, puce, scene, signature, telephone, texte, titre } from './decor.mjs'
import { LANGUES_TRADUISIBLES } from './langues-traduisibles.mjs'
import { MESSAGE_VOYAGE } from './textes/demo-social.mjs'
import { ANNONCES, YOUTUBE } from './textes/annonces.mjs'

const sc = (ctx, theme) => contexte({ lang: ctx.lang, theme })
const langsQuatre = (lang) => [lang, ...['es', 'ar', 'de', 'fr', 'pt', 'it', 'en'].filter((l) => l !== lang)].slice(0, 4)

const ondeDecor = (n = 64) =>
  html`<div class="onde-decor">${waveformHeights(n).map((h, i) => html`<i style="height:${(h * 3.2).toFixed(1)}px;--k:${i}"></i>`)}</div>`

// Globe pointillé (projection orthographique, centré sur l'Afrique et l'Europe) et les arcs
// entre les villes des profils et des langues citées — aucune carte réelle, aucune donnée externe.
const VILLES = [
  ['Lyon', 4.8, 45.8], ['Dakar', -17.4, 14.7], ['Amman', 35.9, 31.9], ['Berlin', 13.4, 52.5], ['Bologna', 11.3, 44.5],
  ['Accra', -0.2, 5.6], ['Bangalore', 77.6, 12.97], ['Kinshasa', 15.3, -4.3], ['Bamako', -8, 12.6], ['Nairobi', 36.8, -1.3],
  ['São Paulo', -46.6, -23.5], ['Madrid', -3.7, 40.4], ['Istanbul', 29, 41], ['Cairo', 31.2, 30], ['Johannesburg', 28, -26.2],
]
const GLOBE = { cx: 590, cy: 232, r: 196, lon0: 12, lat0: 14 }
const rad = (d) => (d * Math.PI) / 180

const orthographique = (lon, lat) => {
  const { cx, cy, r, lon0, lat0 } = GLOBE
  const [l, p, p0] = [rad(lon - lon0), rad(lat), rad(lat0)]
  const visible = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l)
  return {
    x: cx + r * Math.cos(p) * Math.sin(l),
    y: cy - r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)),
    profondeur: visible,
  }
}

const constellation = () => {
  const points = []
  for (let lat = -80; lat <= 80; lat += 8) {
    for (let lon = -180; lon < 180; lon += 8) {
      const p = orthographique(lon, lat)
      if (p.profondeur > 0.05) points.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(0.8 + p.profondeur * 1.2).toFixed(2)}" fill-opacity="${(0.08 + p.profondeur * 0.22).toFixed(2)}"/>`)
    }
  }
  const villes = VILLES.map(([, lon, lat]) => orthographique(lon, lat))
  const arcs = [[0, 1], [0, 2], [3, 6], [4, 7], [5, 9], [8, 0], [10, 11], [12, 14], [13, 1], [9, 6], [7, 10], [2, 5]]
  const courbe = ([a, b]) => {
    const [p, q] = [villes[a], villes[b]]
    const mx = (p.x + q.x) / 2
    const my = (p.y + q.y) / 2
    const dx = mx - GLOBE.cx
    const dy = my - GLOBE.cy
    const n = Math.hypot(dx, dy) || 1
    const levee = 0.28 * Math.hypot(q.x - p.x, q.y - p.y)
    return `<path d="M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${(mx + (dx / n) * levee).toFixed(1)} ${(my + (dy / n) * levee).toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}"/>`
  }
  return raw(`<svg class="constellation" viewBox="0 0 800 450" aria-hidden="true">
    <defs><linearGradient id="arc-g" x1="0" x2="1"><stop offset="0" stop-color="#a5b4fc"/><stop offset="1" stop-color="#e879f9"/></linearGradient>
    <radialGradient id="globe-g" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#6366f1" stop-opacity=".35"/><stop offset="1" stop-color="#1e1b4b" stop-opacity="0"/></radialGradient>
    <radialGradient id="pt-g"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#c7d2fe"/><stop offset="1" stop-color="#818cf8" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${GLOBE.cx}" cy="${GLOBE.cy}" r="${GLOBE.r + 30}" fill="url(#globe-g)"/>
    <circle cx="${GLOBE.cx}" cy="${GLOBE.cy}" r="${GLOBE.r}" fill="none" stroke="#a5b4fc" stroke-opacity=".18"/>
    <g fill="#c7d2fe">${points.join('')}</g>
    <g fill="none" stroke="url(#arc-g)" stroke-width="1.8" stroke-linecap="round" stroke-opacity=".9">${arcs.map(courbe).join('')}</g>
    ${villes.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="10" fill="url(#pt-g)"/><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.8" fill="#fff"/>`).join('')}
  </svg>`)
}

const CITEES = ['ln', 'wo', 'bm', 'tw', 'sw']

export const ANNONCES_X = {
  X1: (ctx) =>
    scene({
      format: '1x1', ctx, fond: 'vif', classe: 'annonce',
      contenu: html`${marqueDiscrete(ctx, { x: 32, y: 30 })}
        ${titre(ANNONCES.X1.titre[ctx.lang], ctx, { x: 40, y: 120, largeur: 460, hauteur: 230, taille: 76, centre: true })}
        ${ondeDecor()}
        <div class="x1-langues" data-sur><span>${langue(ctx.lang).drapeau}</span>${icon(ctx.dir === 'rtl' ? 'arrowLeft' : 'arrowRight', { size: 22 })}<span>${langue('ko').drapeau}</span></div>`,
    }),
  X2: (ctx) =>
    scene({
      format: '16x9', ctx, fond: 'nuit', classe: 'annonce',
      contenu: html`${titre(ANNONCES.X2.titre[ctx.lang], ctx, { x: 40, y: 28, largeur: 600, hauteur: 70, taille: 36 })}
        <div class="marque-coin">${marqueDiscrete(ctx, { x: 0, y: 0 })}</div>
        ${langsQuatre(ctx.lang).map((l, i) => html`${puce(html`${langue(l).drapeau}<span>${langue(l).nom}</span>`, { x: 50 + i * 180, y: 112, classe: 'lang-tete', z: 6 })}${telephone(ecran('groupe', contexte({ lang: l, theme: 'light' })), { largeur: 170, x: 50 + i * 180, y: 128, rotation: [-2, 1, -1, 2][i] })}`)}`,
    }),
  X3: (ctx) =>
    scene({
      format: '1x1', ctx, fond: 'vif', classe: 'annonce',
      contenu: html`${marqueDiscrete(ctx, { x: 32, y: 30 })}
        ${titre(ANNONCES.X3.titre[ctx.lang], ctx, { x: 32, y: 96, largeur: 236, hauteur: 300, taille: 44 })}
        ${telephone(ecran('global', sc(ctx, 'dark')), { largeur: 244, x: 272, y: 56, rotation: 3 })}`,
    }),
  X4: (ctx) =>
    scene({
      format: '16x9', ctx, fond: 'nuit', classe: 'annonce',
      contenu: html`${constellation()}
        <div class="x4-bloc" data-sur><b class="x4-76">76</b></div>
        ${titre(ANNONCES.X4.titre[ctx.lang].replace(/^76\s*/, ''), ctx, { x: 48, y: 214, largeur: 380, hauteur: 70, taille: 34 })}
        ${texte(ANNONCES.X4.sous[ctx.lang], ctx, { x: 48, y: 284, largeur: 380, hauteur: 34, taille: 20, classe: 'doux' })}
        <div class="x4-langues" data-sur>${CITEES.map((code) => {
          const l = LANGUES_TRADUISIBLES.find((x) => x.code === code)
          return html`<span>${l.drapeau} ${l.nom}</span>`
        })}</div>
        <div class="marque-coin">${marqueDiscrete(ctx, { x: 0, y: 0 })}</div>`,
    }),
  X5: (ctx) =>
    scene({
      format: '1x1', ctx, fond: 'vif', classe: 'annonce',
      contenu: html`${marqueDiscrete(ctx, { x: 32, y: 30 })}
        ${titre(ANNONCES.X5.titre[ctx.lang], ctx, { x: 32, y: 70, largeur: 476, hauteur: 70, taille: 46 })}
        ${telephone(ecran('progression', sc(ctx, 'light')), { largeur: 236, x: 34, y: 162, rotation: -3 })}
        ${loupe(ecran('progression', sc(ctx, 'light')), { cible: '.p-card.flamme', x: 206, y: 200, largeur: 310, hauteur: 170, rotation: 2 })}
        ${loupe(ecran('progression', sc(ctx, 'light')), { cible: '.p-link', x: 226, y: 400, largeur: 290, hauteur: 80, rotation: -1 })}`,
    }),
  X6: (ctx) =>
    scene({
      format: '16x9', ctx, fond: 'nuit', classe: 'annonce',
      contenu: html`${titre(ANNONCES.X6.titre[ctx.lang], ctx, { x: 44, y: 60, largeur: 330, hauteur: 170, taille: 44 })}
        <div class="marque-bas">${marqueDiscrete(ctx, { x: 0, y: 0 })}</div>
        ${telephone(ecran('appel', sc(ctx, 'dark')), { largeur: 196, x: 560, y: 24, rotation: 3, classe: 'sans-sous-titres' })}
        ${loupe(ecran('appel', sc(ctx, 'dark')), { cible: '.call-captions', x: 270, y: 250, largeur: 440, hauteur: 160, rotation: -2 })}`,
    }),
}

const MOSAIQUE = ['minjun.p', 'sofi.romero', 'amara.d', 'jonas.wb', 'aiko.t', 'lucas.olv']

export const MINIATURES_YT = {
  Y1: (ctx) =>
    scene({
      format: 'yt', ctx, fond: 'vif', classe: 'miniature',
      contenu: html`<div class="yt-visage">${avatar(profilDe(DEMO.lecteurs[ctx.lang]), 176)}<div class="yt-visage-ami">${avatar(profilDe('minjun.p'), 84)}</div></div>
        <div class="yt-bulles" data-sur>
          <div class="yt-b ko" lang="ko" dir="ltr">안녕!</div>
          <div class="yt-fleche">${icon('arrowRight', { size: 26, className: 'vers-bas' })}</div>
          <div class="yt-b moi" lang="${ctx.lang}" dir="${ctx.dir}">${typo(YOUTUBE.Y1.salut[ctx.lang], ctx.lang)}</div>
        </div>
        ${texte(YOUTUBE.Y1.jours[ctx.lang], ctx, { x: 392, y: 34, largeur: 230, hauteur: 150, taille: 78, classe: 'yt-gros' })}
        <div class="yt-drapeaux" data-sur><span>${langue(ctx.lang).drapeau}</span><span>${langue('ko').drapeau}</span></div>
        ${marqueDiscrete(ctx, { x: 26, y: 310, taille: 30 })}`,
    }),
  Y2: (ctx) => {
    const servi = serve(MESSAGE_VOYAGE, ctx.lang)
    return scene({
      format: 'yt', ctx, fond: 'nuit', classe: 'miniature',
      contenu: html`<div class="yt-mosaique">${MOSAIQUE.map((p) => html`<div class="yt-tuile">${avatar(profilDe(p), 104)}<span>${profilDe(p).drapeau}</span></div>`)}</div>
        <div class="yt-groupe" data-sur><span class="t">${typo(servi.text, ctx.lang)}</span><span class="fl">${icon('translate', { size: 13 })}${flagChip(servi.originalLang)}${flagChip(ctx.lang, { active: true })}</span></div>
        ${titre(YOUTUBE.Y2.accroche[ctx.lang], ctx, { x: 390, y: 36, largeur: 226, hauteur: 200, taille: 50 })}
        ${signature(ctx, { x: 390, y: 252, largeur: 226, taille: 40, classe: 'yt-signature' })}`,
    })
  },
}
