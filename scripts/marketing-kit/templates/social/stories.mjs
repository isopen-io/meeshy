// Stories à publier DANS Meeshy par le compte officiel (1080 × 1920) — § 5 publications 4
// et 5, V2 et V8 recoupés. Ce sont des CONTENUS de story (le lecteur de l'app pose ses barres
// en haut et son champ de réponse en bas) : tout le texte tient entre 14 % et 84 % de la hauteur.
import { html, raw } from '../../lib/html.mjs'
import { icon, logo } from '../../lib/icons.mjs'
import { typo } from '../../lib/composants.mjs'
import { puce, scene, texte, titre } from './decor.mjs'
import { BONJOURS } from './textes/demo-social.mjs'
import { HASHTAG } from './textes/langues.mjs'
import { STORIES } from './textes/videos.mjs'

const F = '9x16'

// Paris la nuit : ciel, lune, toits et fenêtres allumées — dessin maison, aucune photo.
const nuitParis = () => {
  const toits = Array.from({ length: 16 }, (_, i) => {
    const h = 110 + ((i * 53) % 7) * 26
    return `<rect x="${i * 34}" y="${960 - h}" width="32" height="${h}" rx="2"/>`
  }).join('')
  const fenetres = Array.from({ length: 70 }, (_, k) => {
    const i = k % 16
    const h = 110 + ((i * 53) % 7) * 26
    const y = 960 - h + 16 + Math.floor(k / 16) * 26
    return (k * 7) % 3 === 0 ? `<rect x="${i * 34 + 8 + (k % 2) * 10}" y="${y}" width="7" height="10" rx="1.5"/>` : ''
  }).join('')
  const etoiles = Array.from({ length: 40 }, (_, k) => `<circle cx="${(k * 97) % 540}" cy="${(k * 61) % 520}" r="${k % 5 === 0 ? 1.6 : 0.9}"/>`).join('')
  return raw(`<svg class="fond-illu" viewBox="0 0 540 960" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="np" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f0c29"/><stop offset=".55" stop-color="#312e81"/><stop offset="1" stop-color="#6d28d9"/></linearGradient>
    <radialGradient id="npl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fef3c7"/><stop offset=".5" stop-color="#fde68a" stop-opacity=".35"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></radialGradient></defs>
    <rect width="540" height="960" fill="url(#np)"/><g fill="#fff" fill-opacity=".7">${etoiles}</g>
    <circle cx="440" cy="96" r="110" fill="url(#npl)"/><circle cx="440" cy="96" r="38" fill="#fef9c3"/><circle cx="456" cy="86" r="34" fill="#1f1b4d"/>
    <path d="M250 960 L262 700 L270 560 L276 470 L280 470 L286 560 L294 700 L306 960z" fill="#1e1b4b"/><path d="M262 700h44M270 600h28" stroke="#1e1b4b" stroke-width="6"/>
    <g fill="#1e1b4b">${toits}</g><g fill="#fcd34d" fill-opacity=".85">${fenetres}</g>
  </svg>`)
}

const septJours = (courant) =>
  html`<div class="sept-jours" data-sur>${Array.from({ length: 7 }, (_, i) => html`<span class="${i < courant ? 'fait' : ''}">${i < courant ? icon('flame', { size: 22 }) : i + 1}</span>`)}</div>`

const ARABE = /[\u0600-\u06ff]/

// Le nuage des bonjours : quinze mots en trois colonnes décalées, un sur trois en verre.
const nuage = () =>
  html`<div class="nuage-story">${BONJOURS.slice(0, 15).map((mot, i) => {
    const rang = Math.floor(i / 3)
    const x = [22, 190, 350][i % 3] + (rang % 2 ? 30 : -6)
    const classes = [ARABE.test(mot) ? 'ar' : '', (i + rang) % 3 === 1 ? 'doux' : ''].join(' ')
    return html`<span style="inset-inline-start:${x}px;top:${rang * 58}px;--r:${((i * 7) % 9) - 4}deg" class="${classes}">${mot}</span>`
  })}</div>`

export const STORIES_9x16 = {
  S1: (ctx) =>
    scene({
      format: F, ctx, fond: 'nuit', classe: 'story-meeshy',
      contenu: html`${nuitParis()}
        ${texte(STORIES.S1.ligne[ctx.lang], ctx, { x: 40, y: 196, largeur: 460, hauteur: 90, taille: 34, classe: 'story-ligne' })}
        <div class="sticker-question" data-sur>
          <div class="sq-tete">${logo(30, { radius: 0.3 })}<span class="autofit" data-sur>${typo(STORIES.S1.question[ctx.lang], ctx.lang)}</span></div>
          <div class="sq-champ">${STORIES.S1.champ[ctx.lang]}</div>
        </div>`,
    }),
  S2: (ctx) =>
    scene({
      format: F, ctx, fond: 'vif', classe: 'story-meeshy',
      contenu: html`${puce(html`<div class="flamme-embleme" style="width:230px;height:230px"><span class="fl-ico">${icon('flame', { size: 142 })}</span><b>1</b></div>`, { x: 155, y: 190, classe: 'flamme-bloc' })}
        ${titre(STORIES.S2.jour[ctx.lang], ctx, { x: 40, y: 470, largeur: 460, hauteur: 80, taille: 44, centre: true })}
        ${texte(STORIES.S2.question[ctx.lang], ctx, { x: 40, y: 560, largeur: 460, hauteur: 90, taille: 32, classe: 'centre fort' })}
        ${septJours(1)}`,
    }),
  S3: (ctx) =>
    scene({
      format: F, ctx, fond: 'nuit', classe: 'story-meeshy',
      contenu: html`${nuage()}
        <div class="global-rond">${logo(92, { radius: 0.5 })}</div>
        ${titre(STORIES.S3.titre[ctx.lang], ctx, { x: 40, y: 560, largeur: 460, hauteur: 150, taille: 38, centre: true })}
        ${texte(STORIES.S3.ligne[ctx.lang], ctx, { x: 40, y: 718, largeur: 460, hauteur: 60, taille: 22, classe: 'centre doux' })}`,
    }),
  S4: (ctx) =>
    scene({
      format: F, ctx, fond: 'vif', classe: 'story-meeshy',
      contenu: html`${texte(STORIES.S4.surtitre[ctx.lang], ctx, { x: 40, y: 150, largeur: 460, hauteur: 44, taille: 20, classe: 'surtitre centre' })}
        ${texte(HASHTAG[ctx.lang], ctx, { x: 30, y: 206, largeur: 480, hauteur: 80, taille: 46, classe: 'hashtag centre' })}
        <ol class="etapes" data-sur>${STORIES.S4.etapes.map((e, i) => html`<li><b>${i + 1}</b><span>${typo(e[ctx.lang], ctx.lang)}</span></li>`)}</ol>`,
    }),
}
