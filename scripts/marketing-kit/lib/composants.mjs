import { html, raw } from './html.mjs'
import { icon } from './icons.mjs'
import { langue } from './langues.mjs'

const mix = (hex, pct, other = '#ffffff') => `color-mix(in srgb, #${hex} ${pct}%, ${other})`

// Avatar illustré maison : initiales sur un dégradé de la teinte du profil, et un motif
// géométrique propre à chaque profil (jamais une photo, jamais une vraie personne).
export const avatar = (profil, size, { presence = false, ring = false, storyRing = false } = {}) => {
  const graine = [...profil.pseudo].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 997, 7)
  const angle = graine % 360
  const grad = `linear-gradient(${angle}deg, ${mix(profil.teinte, 78, '#ffffff')}, #${profil.teinte} 55%, ${mix(profil.teinte, 70, '#1e1b4b')})`
  const cx = 20 + (graine % 60)
  const cy = 15 + ((graine * 7) % 50)
  const initiales = size < 30 ? profil.prenom[0] : `${profil.prenom[0]}${profil.nom[0]}`
  const classes = ['avatar', ring && 'ring', storyRing && 'story-ring'].filter(Boolean).join(' ')
  return html`<div class="${classes}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;--av-grad:${grad}">
    ${raw(`<svg class="motif" viewBox="0 0 100 100" preserveAspectRatio="none"><circle cx="${cx}" cy="${cy}" r="${30 + (graine % 25)}" fill="#fff" fill-opacity=".16"/><circle cx="${100 - cx}" cy="${100 - cy / 2}" r="${18 + (graine % 14)}" fill="#fff" fill-opacity=".10"/></svg>`)}
    <span class="initiales">${initiales}</span>
    ${presence ? raw('<span class="presence"></span>') : ''}
  </div>`
}

export const statusBar = ({ onMedia = false } = {}) =>
  html`<div class="status-bar${onMedia ? ' on-media' : ''}">
    <span>9:41</span>
    <span class="right">
      ${raw('<svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3.2" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3.2" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3.2" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3.2" height="12" rx="1" fill="currentColor"/></svg>')}
      ${raw('<svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.3c2.4 0 4.6.9 6.2 2.5l1.2-1.2A10.4 10.4 0 0 0 8.5.6 10.4 10.4 0 0 0 1.1 3.6l1.2 1.2a8.7 8.7 0 0 1 6.2-2.5zm0 3.4c1.5 0 2.8.6 3.8 1.5l1.2-1.2a7 7 0 0 0-10 0l1.2 1.2c1-.9 2.3-1.5 3.8-1.5zm0 3.4c.6 0 1.1.2 1.5.6L8.5 11.2 7 9.7c.4-.4.9-.6 1.5-.6z" fill="currentColor"/></svg>')}
      ${raw('<svg width="28" height="13" viewBox="0 0 28 13"><rect x=".5" y=".5" width="24" height="12" rx="3.8" fill="none" stroke="currentColor" stroke-opacity=".4"/><rect x="2.2" y="2.2" width="20.6" height="8.6" rx="2.3" fill="currentColor"/><path d="M26 4.5v4a2 2 0 0 0 0-4z" fill="currentColor" fill-opacity=".45"/></svg>')}
    </span>
  </div>`

// Les douze rayons d'AchievementRevealView : 3 × 18 pt, offset(y: -78) autour de la médaille de 128 pt.
export const revealRays = () =>
  html`<div class="reveal-rays">${Array.from({ length: 12 }, (_, i) => html`<i style="transform:rotate(${i * 30}deg) translateY(-78px)"></i>`)}</div>`

export const homeIndicator = ({ onMedia = false } = {}) =>
  html`<div class="home-indicator${onMedia ? ' on-media' : ''}"></div>`

export const flagChip = (code, { active = false } = {}) => {
  const l = langue(code)
  return html`<span class="flag-chip${active ? ' active' : ''}" style="--lang-color:${l.couleur}">
    <span>${l.drapeau}</span>${active ? raw('<span class="underline"></span>') : ''}
  </span>`
}

export const roundButton = (name, { size = 44, iconSize = 18, tint, className = '' } = {}) =>
  html`<div class="round-btn glass ${className}" style="width:${size}px;height:${size}px;${tint ? `color:${tint}` : ''}">${icon(name, { size: iconSize })}</div>`

export const nomComplet = (profil) => `${profil.prenom} ${profil.nom}`

// Typographie : espace fine insécable avant ? ! ; en français, espace insécable pleine avant
// le deux-points, et un emoji final ne part jamais seul à la ligne.
export const typo = (texte, lang) => {
  const fine = lang === 'fr' ? texte.replace(/ :/g, '\u00A0:').replace(/ ([?!;»])/g, '\u202F$1').replace(/« /g, '«\u202F') : texte
  return fine.replace(/ (\p{Extended_Pictographic}[\p{Extended_Pictographic}\u200d\uFE0F]*)$/u, '\u00A0$1')
}
