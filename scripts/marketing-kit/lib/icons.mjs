import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { raw } from './html.mjs'
import { REPO_ROOT } from './catalog.mjs'

// Glyphes dessinés maison, au trait des SF Symbols que l'app emploie (aucune ressource externe).
const PATHS = {
  back: '<path d="M15 5l-7 7 7 7" stroke-width="2.6"/>',
  forward: '<path d="M9 5l7 7-7 7" stroke-width="2.4"/>',
  phone: '<path d="M6.6 3.5h2.6l1.6 4.2-2 1.4a11 11 0 0 0 6.1 6.1l1.4-2 4.2 1.6v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" fill="currentColor" stroke="none"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="3" fill="currentColor" stroke="none"/><path d="M16.5 10.2l5-3v9.6l-5-3z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke-width="2.4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke-width="2"/>',
  micOff: '<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16" stroke-width="2"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8z" fill="currentColor" stroke="none"/><circle cx="12" cy="13.3" r="3.3" fill="#000" fill-opacity=".35" stroke="none"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  checks: '<path d="M2.5 12.5l4 4 8-9M10 16.5l1 .5 8.5-9.5" stroke-width="2"/>',
  flame: '<path d="M12 1c1.1 4 7.5 6.6 7.5 13.2a7.5 7.5 0 0 1-15 0c0-3.3 1.7-5.4 3.5-7.2.3 2.2 1.2 3.6 2.6 4.4C10.2 7.4 10.6 4.4 12 1z" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="currentColor" stroke="none"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" stroke-width="1.8"/><path d="M10.5 13.5h3V17h-3z M8 17.5h8v3H8z" fill="currentColor" stroke="none"/>',
  rosette: '<circle cx="12" cy="9.5" r="6" fill="currentColor" stroke="none"/><path d="M8.5 14l-2 7 5.5-2.8 5.5 2.8-2-7" fill="currentColor" stroke="none"/><circle cx="12" cy="9.5" r="2.6" fill="#fff" fill-opacity=".45" stroke="none"/>',
  sparkles: '<path d="M4 20L14.5 9.5M13 5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1zM19 2.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7zM19.5 12l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" stroke-width="1.8"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" stroke-width="1.9"/>',
  heartFill: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="currentColor" stroke="none"/>',
  comment: '<path d="M4 5.5h16v10.5H9.5L5 20v-4H4z" stroke-width="1.9" stroke-linejoin="round"/>',
  repost: '<path d="M4 10V8a3 3 0 0 1 3-3h11M15 2l3 3-3 3M20 14v2a3 3 0 0 1-3 3H6M9 22l-3-3 3-3" stroke-width="1.9"/>',
  send: '<path d="M21 3L10 14M21 3l-6.5 18-4.5-7-7-4.5z" stroke-width="1.9" stroke-linejoin="round"/>',
  personPlus: '<circle cx="9" cy="8" r="4" fill="currentColor" stroke="none"/><path d="M2 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5z" fill="currentColor" stroke="none"/><path d="M19 7v6M16 10h6" stroke-width="2.2"/>',
  personCheck: '<circle cx="9" cy="8" r="4" fill="currentColor" stroke="none"/><path d="M2 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5z" fill="currentColor" stroke="none"/><path d="M16 10.5l2 2 4-4.5" stroke-width="2.2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5" stroke-width="2.2"/><path d="M15.5 15.5L21 21" stroke-width="2.4"/>',
  globe: '<circle cx="12" cy="12" r="9" stroke-width="1.8"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" stroke-width="1.6"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" stroke-width="2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18" stroke-width="2.4"/>',
  ellipsis: '<circle cx="5.5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
  speaker: '<path d="M4 9h3.5L12 5v14l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke-width="1.9"/>',
  captions: '<rect x="2.5" y="5" width="19" height="14" rx="3" stroke-width="1.9"/><path d="M10.5 10.3a2.3 2.3 0 1 0 0 3.4M17 10.3a2.3 2.3 0 1 0 0 3.4" stroke-width="1.8"/>',
  hangup: '<path d="M2.5 13.5c5.5-5 13.5-5 19 0l-1.8 2.8-3.9-1.3-.4-2.5a11 11 0 0 0-6.8 0l-.4 2.5-3.9 1.3z" fill="currentColor" stroke="none"/>',
  flip: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8z" stroke-width="1.8"/><path d="M9 12.5a3 3 0 0 1 5.2-1.5M15 14a3 3 0 0 1-5.2 1.5" stroke-width="1.7"/>',
  bookmark: '<path d="M6.5 3.5h11V21L12 17l-5.5 4z" stroke-width="1.9" stroke-linejoin="round"/>',
  lockOpen: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" fill="currentColor" stroke="none"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7" stroke-width="2"/>',
  bubbles: '<path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v5a2.5 2.5 0 0 1-2.5 2.5H9L5 16v-3h.5A2.5 2.5 0 0 1 3 10.5z" fill="currentColor" stroke="none"/><path d="M19 8.5h.5A1.5 1.5 0 0 1 21 10v5.5a1.5 1.5 0 0 1-1.5 1.5H19v3l-3.5-3H11a1.5 1.5 0 0 1-1.5-1.5V15" stroke-width="1.8"/>',
  house: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" fill="currentColor" stroke="none"/>',
  people: '<circle cx="9" cy="8" r="3.6" fill="currentColor" stroke="none"/><path d="M2.5 19.5c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6z" fill="currentColor" stroke="none"/><circle cx="17" cy="8.5" r="2.8" fill="currentColor" stroke="none"/><path d="M16.5 13.2c2.8 0 5 2 5 5.2h-4.3" fill="currentColor" stroke="none"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.8 2H4.2z" fill="currentColor" stroke="none"/><path d="M10 20.5a2 2 0 0 0 4 0" stroke-width="1.8"/>',
  arrowRight: '<path d="M4 12h15M13 6l6 6-6 6" stroke-width="2.6"/>',
  arrowLeft: '<path d="M20 12H5M11 6l-6 6 6 6" stroke-width="2.6"/>',
  translate: '<path d="M3 5.5h9M7.5 3.5v2M5 5.5c.8 3 3 5.4 6 6.5M10.5 5.5c-.8 3-3 5.4-6 6.5" stroke-width="1.7"/><path d="M12.5 20.5l4-10 4 10M14 17h5" stroke-width="1.8"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
}

export const icon = (name, { size = 20, className = '' } = {}) => {
  const body = PATHS[name]
  if (!body) throw new Error(`icône inconnue : ${name}`)
  return raw(
    `<svg class="ico ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`,
  )
}

// Glyphe de la pièce Meesh : lu dans l'asset de l'app, jamais recopié.
const MEESH_COIN_PATH = readFileSync(
  resolve(REPO_ROOT, 'apps/ios/Meeshy/Assets.xcassets/MeeshCoin.imageset/MeeshCoin.svg'),
  'utf8',
).match(/ d="([^"]+)"/)[1]

export const meeshCoin = (size = 20) =>
  raw(
    `<svg class="meesh-coin" width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="${MEESH_COIN_PATH}"/></svg>`,
  )

// Logo : apps/ios/logo_light.svg (trois traits empilés sur le dégradé indigo500 → indigo700).
export const logo = (size = 64, { radius = 0.23 } = {}) =>
  raw(
    `<svg class="meeshy-logo" width="${size}" height="${size}" viewBox="0 0 1024 1024" aria-hidden="true"><defs><linearGradient id="lg-${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs><rect width="1024" height="1024" rx="${1024 * radius}" fill="url(#lg-${size})"/><path d="M262 384H762M262 512H662M262 640H562" stroke="#fff" stroke-width="80" stroke-linecap="round"/></svg>`,
  )

// Marque seule (sans fond) — les trois traits, pour poser sur un dégradé.
export const logoMark = (size = 40, color = '#fff') =>
  raw(
    `<svg width="${size}" height="${size}" viewBox="200 320 624 384" aria-hidden="true"><path d="M262 384H762M262 512H662M262 640H562" stroke="${color}" stroke-width="80" stroke-linecap="round"/></svg>`,
  )
