// X / Threads (1:1 540 × 540, 16:9 800 × 450) et miniatures YouTube (640 × 360) —
// contenu-par-format.md § 3 et § 4.
import { html, raw } from '../../lib/html.mjs'
import { icon } from '../../lib/icons.mjs'
import { avatar, flagChip, typo } from '../../lib/composants.mjs'
import { contexte, ecran } from '../../lib/gabarits.mjs'
import { langue } from '../../lib/langues.mjs'
import { waveformHeights } from '../../screens/audio.mjs'
import { serve } from '../../lib/prism.mjs'
import { profilDe } from '../../textes/demo.mjs'
import { loupe, marqueDiscrete, puce, scene, telephone, texte, titre } from './decor.mjs'
import { LANGUES_TRADUISIBLES } from './langues-traduisibles.mjs'
import { MESSAGE_VOYAGE } from './textes/demo-social.mjs'
import { ANNONCES, YOUTUBE } from './textes/annonces.mjs'

const sc = (ctx, theme) => contexte({ lang: ctx.lang, theme })
const langsQuatre = (lang) => [lang, ...['es', 'ar', 'de', 'fr', 'pt', 'it', 'en'].filter((l) => l !== lang)].slice(0, 4)

const ondeDecor = (n = 64) =>
  html`<div class="onde-decor">${waveformHeights(n).map((h, i) => html`<i style="height:${(h * 3.2).toFixed(1)}px;--k:${i}"></i>`)}</div>`

// Villes des profils et des langues africaines citées (lon, lat) — projection équirectangulaire.
const VILLES = [
  ['Lyon', 4.8, 45.8], ['Seoul', 127, 37.6], ['Madrid', -3.7, 40.4], ['Osaka', 135.5, 34.7], ['São Paulo', -46.6, -23.5],
  ['Dakar', -17.4, 14.7], ['Amman', 35.9, 31.9], ['Berlin', 13.4, 52.5], ['Bologna', 11.3, 44.5], ['Accra', -0.2, 5.6],
  ['Bangalore', 77.6, 12.97], ['Toronto', -79.4, 43.7], ['Kinshasa', 15.3, -4.3], ['Bamako', -8, 12.6], ['Nairobi', 36.8, -1.3],
  ['Mexico', -99.1, 19.4], ['Jakarta', 106.8, -6.2], ['Istanbul', 29, 41], ['Hanoi', 105.8, 21], ['Cairo', 31.2, 30],
]
const projete = ([, lon, lat]) => [330 + ((lon + 125) / 270) * 440, 40 + ((62 - lat) / 95) * 380]

const constellation = () => {
  const pts = VILLES.map(projete)
  const arcs = [[0, 1], [0, 5], [2, 4], [7, 3], [9, 12], [13, 5], [14, 10], [11, 8], [6, 17], [16, 18], [15, 2], [19, 12], [1, 3], [4, 9], [10, 16]]
  const courbe = ([a, b]) => {
    const [x1, y1] = pts[a]
    const [x2, y2] = pts[b]
    const mx = (x1 + x2) / 2
    const my = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.22
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`
  }
  const grille = Array.from({ length: 23 }, (_, i) => Array.from({ length: 24 }, (_, j) => `<circle cx="${330 + j * 20}" cy="${i * 20 + 5}" r="1"/>`).join('')).join('')
  return raw(`<svg class="constellation" viewBox="0 0 800 450" aria-hidden="true">
    <g fill="#fff" fill-opacity=".07">${grille}</g>
    <g fill="none" stroke="url(#arc-g)" stroke-width="1.6" stroke-linecap="round">${arcs.map(courbe).join('')}</g>
    <defs><linearGradient id="arc-g" x1="0" x2="1"><stop offset="0" stop-color="#a5b4fc"/><stop offset="1" stop-color="#c084fc"/></linearGradient>
    <radialGradient id="pt-g"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#c7d2fe"/><stop offset="1" stop-color="#818cf8" stop-opacity="0"/></radialGradient></defs>
    ${pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="url(#pt-g)"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#fff"/>`).join('')}
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
        ${loupe(ecran('progression', sc(ctx, 'light')), { cible: '.p-card.flamme', x: 216, y: 206, largeur: 300, hauteur: 150, rotation: 2 })}
        ${loupe(ecran('progression', sc(ctx, 'light')), { cible: '.p-link', x: 236, y: 380, largeur: 280, hauteur: 70, rotation: -1 })}`,
    }),
  X6: (ctx) =>
    scene({
      format: '16x9', ctx, fond: 'nuit', classe: 'annonce',
      contenu: html`${titre(ANNONCES.X6.titre[ctx.lang], ctx, { x: 44, y: 60, largeur: 330, hauteur: 170, taille: 44 })}
        <div class="marque-bas">${marqueDiscrete(ctx, { x: 0, y: 0 })}</div>
        ${telephone(ecran('appel', sc(ctx, 'dark')), { largeur: 196, x: 560, y: 24, rotation: 3 })}
        ${loupe(ecran('appel', sc(ctx, 'dark')), { cible: '.call-captions', x: 270, y: 250, largeur: 440, hauteur: 160, rotation: -2 })}`,
    }),
}

const MOSAIQUE = ['minjun.p', 'sofi.romero', 'amara.d', 'jonas.wb', 'aiko.t', 'lucas.olv']

export const MINIATURES_YT = {
  Y1: (ctx) =>
    scene({
      format: 'yt', ctx, fond: 'vif', classe: 'miniature',
      contenu: html`<div class="yt-visage">😮</div>
        <div class="yt-bulles" data-sur>
          <div class="yt-b ko" lang="ko">안녕!</div>
          <div class="yt-fleche">${icon('arrowRight', { size: 26, className: 'vers-bas' })}</div>
          <div class="yt-b moi">${typo(YOUTUBE.Y1.salut[ctx.lang], ctx.lang)}</div>
        </div>
        ${texte(YOUTUBE.Y1.jours[ctx.lang], ctx, { x: 392, y: 34, largeur: 230, hauteur: 150, taille: 78, classe: 'yt-gros' })}
        <div class="yt-drapeaux" data-sur><span>${langue(ctx.lang).drapeau}</span><span>${langue('ko').drapeau}</span></div>`,
    }),
  Y2: (ctx) => {
    const servi = serve(MESSAGE_VOYAGE, ctx.lang)
    return scene({
      format: 'yt', ctx, fond: 'nuit', classe: 'miniature',
      contenu: html`<div class="yt-mosaique">${MOSAIQUE.map((p) => html`<div class="yt-tuile">${avatar(profilDe(p), 104)}<span>${profilDe(p).drapeau}</span></div>`)}</div>
        <div class="yt-groupe" data-sur><span class="t">${typo(servi.text, ctx.lang)}</span><span class="fl">${icon('translate', { size: 13 })}${flagChip(servi.originalLang)}${flagChip(ctx.lang, { active: true })}</span></div>
        ${titre(YOUTUBE.Y2.accroche[ctx.lang], ctx, { x: 390, y: 40, largeur: 226, hauteur: 280, taille: 50 })}`,
    })
  },
}
