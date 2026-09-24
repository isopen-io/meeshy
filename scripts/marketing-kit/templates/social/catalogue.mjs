// Le catalogue du kit social : chaque visuel, son format, son concept et sa NATURE —
// [R] écran réel, [MS] écran réel mis en scène, [F] maquette (jamais présentée comme un écran).
import { KIT_LANGS } from '../../lib/locales.mjs'
import { socialFormat } from './formats.mjs'
import { VIDEOS_9x16 } from './videos.mjs'
import { STORIES_9x16 } from './stories.mjs'
import { CARROUSELS_4x5 } from './carrousels.mjs'
import { ANNONCES_X, MINIATURES_YT } from './annonces.mjs'
import { ANNONCES, CARROUSEL_TITRES, THREADS_QUESTION, YOUTUBE } from './textes/annonces.mjs'
import { VIDEOS } from './textes/videos.mjs'

const NATURES_VIDEO = {
  V1: ['MS', 'MS', 'MS', 'MS'],
  V2: ['MS', 'MS', 'MS', 'MS'],
  V3: ['F', 'R', 'F', 'MS'],
  V4: ['MS', 'MS', 'MS', 'MS'],
  V5: ['MS', 'MS', 'MS', 'MS'],
  V6: ['MS', 'MS', 'MS', 'MS'],
  V7: ['F', 'F', 'R', 'MS'],
  V8: ['MS', 'MS', 'MS', 'MS'],
}
const ROLES_VIDEO = ['couverture', 'plan clé 1', 'plan clé 2', 'carte de fin']

const NATURES_CARROUSEL = {
  C1: ['R', 'MS', 'MS', 'R', 'F', 'F'],
  C2: ['R', 'MS', 'MS', 'R', 'R', 'F'],
  C3: ['F', 'R', 'MS', 'MS', 'MS', 'R', 'F'],
  C4: ['F', 'R', 'R', 'R', 'R', 'F'],
}

const X = [
  ['X1', '1x1', 'F'], ['X2', '16x9', 'MS'], ['X3', '1x1', 'R'], ['X4', '16x9', 'F'], ['X5', '1x1', 'R'], ['X6', '16x9', 'MS'],
]

const PLATEFORMES = {
  '9x16': ['TikTok', 'Reels', 'Shorts'],
  '4x5': ['Instagram'],
  '1x1': ['X', 'Threads'],
  '16x9': ['X', 'Threads'],
  yt: ['YouTube'],
}

export const VISUELS = [
  ...Object.entries(VIDEOS_9x16).flatMap(([code, rendus]) =>
    rendus.map((rendu, i) => ({
      id: i === 0 ? `${code}-0-couverture` : `${code}-${i}`,
      format: '9x16', concept: code, nature: NATURES_VIDEO[code][i], role: ROLES_VIDEO[i], rendu,
      titre: VIDEOS[code].titre,
    })),
  ),
  ...Object.entries(STORIES_9x16).map(([code, rendu]) => ({ id: `${code}-story`, format: '9x16', concept: code, nature: 'F', role: 'story Meeshy', rendu, plateformes: ['Meeshy'] })),
  ...Object.entries(CARROUSELS_4x5).flatMap(([code, rendus]) =>
    rendus.map((rendu, i) => ({ id: `${code}-${i + 1}`, format: '4x5', concept: code, nature: NATURES_CARROUSEL[code][i], role: `slide ${i + 1}/${rendus.length}`, rendu, titre: CARROUSEL_TITRES[code] })),
  ),
  ...X.map(([code, format, nature]) => ({ id: code, format, concept: code, nature, role: 'visuel d’annonce', rendu: ANNONCES_X[code], post: ANNONCES[code].post })),
  ...Object.entries(MINIATURES_YT).map(([code, rendu]) => ({ id: code, format: 'yt', concept: code, nature: 'F', role: 'miniature', rendu, titre: YOUTUBE[code].titre })),
]

export const visuel = (id) => {
  const v = VISUELS.find((x) => x.id === id)
  if (!v) throw new Error(`visuel inconnu : ${id}`)
  return v
}

const A_VERIFIER = {
  V5: 'le chiffre « 12 personnes de 9 pays » doit être le vrai chiffre du tournage',
}

export const manifeste = (langs = KIT_LANGS) =>
  VISUELS.flatMap((v) =>
    langs.map((langue) => {
      const f = socialFormat(v.format)
      return {
        id: v.id,
        fichier: `social/${langue}/${v.id}.png`,
        format: v.format,
        largeur: f.width,
        hauteur: f.height,
        concept: v.concept,
        role: v.role,
        langue,
        nature: v.nature,
        plateformes: v.plateformes ?? PLATEFORMES[v.format],
        ...(v.titre ? { titre: v.titre[langue] } : {}),
        ...(v.post ? { post: v.post[langue], threads: THREADS_QUESTION[langue] } : {}),
        ...(A_VERIFIER[v.concept] && v.role === 'couverture' ? { aVerifier: A_VERIFIER[v.concept] } : {}),
      }
    }),
  )
