// Ce que la fiche App Store reçoit des prises de la vitrine (#9807, #9811) : les aperçus vidéo (plans,
// légendes, durées) et les visuels créatifs (cartes, images clés), décrits en DONNÉES, et le calcul pur de
// leur montage. Les fichiers eux-mêmes se fabriquent dans montage.mjs ; ce module ne touche à rien.
import { resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { appStoreLocale } from '../lib/locales.mjs'
import { COMPTE_REQUIS, LEGENDES_APERCUS } from '../textes/apercus.mjs'
import { LEGENDES } from '../textes/legendes.mjs'
import { FPS, SORTIE } from './filmer.mjs'
import { SCENES_FILMEES } from './scenes-filmees.mjs'

export const FASTLANE_METADATA = resolve(REPO_ROOT, 'apps/ios/fastlane/metadata')
export const SORTIE_APPSTORE = resolve(SORTIE, 'appstore')

// Dossiers andp (appAssetLibraryRefData, andp 1.17.0) et formats Apple des aperçus.
export const APPAREILS_APERCU = {
  iphone: { dossier: 'IPHONE_67', largeur: 886, hauteur: 1920, spec: 'apercu-iphone' },
  ipad: { dossier: 'IPAD_PRO_3GEN_129', largeur: 1200, hauteur: 1600, spec: 'apercu-ipad' },
}

// Durées en IMAGES à 30 i/s : le montage compte des images, jamais des secondes arrondies.
export const FONDU_IMAGES = 12
export const CARTE_DE_FIN_IMAGES = 75
// Apple : 15 à 30 s. La cible garde une demi-seconde de marge de chaque côté (piste audio AAC, conteneur).
export const BORNES_APERCU = { minImages: 15 * FPS, maxImages: 30 * FPS, cibleMinImages: 15.5 * FPS, cibleMaxImages: 29.5 * FPS }

// Un plan est une scène filmée surmontée de sa légende. Un plan `facultatif` saute si son clip manque ou si
// l'aperçu dépasse 30 s — les plus faibles `priorite` d'abord. Un aperçu `facultatif` n'est fabriqué que si
// ses plans requis ont été tournés.
export const APERCUS = [
  {
    id: 'jeu',
    fichier: '01-jeu.mp4',
    mention: 'compte',
    plans: [
      { scene: 'jeu-frappe' },
      { scene: 'jeu-coffre' },
      { scene: 'jeu-rang' },
      { scene: 'jeu-niveau', facultatif: true, priorite: 2 },
      { scene: 'jeu-badge', facultatif: true, priorite: 1 },
    ],
  },
  {
    id: 'interactions',
    fichier: '02-interactions.mp4',
    mention: 'compte',
    plans: [
      { scene: 'interaction-emoji' },
      { scene: 'interaction-emoji-post', facultatif: true, priorite: 1 },
      { scene: 'interaction-sticker' },
      { scene: 'interaction-commentaire-audio' },
      { scene: 'interaction-reel', famille: 'interaction', facultatif: true, priorite: 3 },
    ],
  },
  {
    id: 'conversation',
    fichier: '03-conversation.mp4',
    facultatif: true,
    mention: null,
    plans: [{ scene: 'conversation-traduite', famille: 'conversation' }],
  },
]

export const apercuDe = (id) => {
  const a = APERCUS.find((x) => x.id === id)
  if (!a) throw new Error(`aperçu inconnu « ${id} » — connus : ${APERCUS.map((x) => x.id).join(', ')}`)
  return a
}

export const familleDe = (plan) => {
  const famille = SCENES_FILMEES[plan.scene]?.famille ?? plan.famille
  if (!famille) throw new Error(`${plan.scene} : famille inconnue (ni scène filmée, ni famille déclarée)`)
  return famille
}

export const legendeDe = ({ scene, lang }) => {
  const texte = LEGENDES_APERCUS[scene]?.[lang]
  if (!texte) throw new Error(`légende absente : ${scene}/${lang}`)
  return texte
}

export const carteDeFin = ({ apercu, lang }) => ({
  devise: LEGENDES.L2[lang],
  mention: apercu.mention === 'compte' ? COMPTE_REQUIS[lang] : null,
})

const graphemes = (texte) => [...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(texte)].length

// Une légende reste à l'écran le temps d'être lue (Apple : « remains on the screen long enough for people
// to read ») : 1 s + 70 ms par caractère, jamais moins de 3 s.
export const imagesDeLecture = (texte) => Math.ceil(FPS * Math.max(3, 1 + 0.07 * graphemes(texte)))

export const dureeImages = (segments, fondu = FONDU_IMAGES) =>
  segments.reduce((total, s) => total + s.images, 0) - Math.max(0, segments.length - 1) * fondu

const segmentDuPlan = ({ plan, lang, clips }) => {
  const legende = legendeDe({ scene: plan.scene, lang })
  const clip = clips[plan.scene]
  const images = Math.max(clip.images, imagesDeLecture(legende))
  return { type: 'clip', scene: plan.scene, famille: familleDe(plan), chemin: clip.chemin, imagesClip: clip.images, images, legende, plan }
}

const avecFin = (segments) => [...segments, { type: 'fin', images: CARTE_DE_FIN_IMAGES }]

// Plus long que la cible : on retire les plans facultatifs (priorité la plus faible d'abord), puis on
// rend le maintien ajouté pour la lecture, jamais en deçà du clip lui-même.
const raccourcir = (segments, bornes) => {
  const total = dureeImages(avecFin(segments))
  if (total <= bornes.cibleMaxImages) return segments
  const facultatifs = segments.filter((s) => s.plan.facultatif)
  if (facultatifs.length) {
    const retire = facultatifs.reduce((a, b) => ((b.plan.priorite ?? 0) < (a.plan.priorite ?? 0) ? b : a))
    return raccourcir(segments.filter((s) => s !== retire), bornes)
  }
  const exces = total - bornes.cibleMaxImages
  const maintiens = segments.reduce((n, s) => n + (s.images - s.imagesClip), 0)
  if (maintiens < exces) {
    throw new Error(`aperçu trop long : ${(total / FPS).toFixed(2)} s avec les seuls plans requis, ${bornes.maxImages / FPS} s au plus`)
  }
  let reste = exces
  return segments.map((s) => {
    const retrait = Math.min(reste, s.images - s.imagesClip)
    reste -= retrait
    return { ...s, images: s.images - retrait }
  })
}

// Plus court que la cible : on prolonge l'image finale de chaque plan, à parts égales — jamais de ralenti.
const rallonger = (segments, bornes) => {
  const manque = bornes.cibleMinImages - dureeImages(avecFin(segments))
  if (manque <= 0) return segments
  const part = Math.floor(manque / segments.length)
  const reste = manque - part * segments.length
  return segments.map((s, i) => ({ ...s, images: s.images + part + (i === segments.length - 1 ? reste : 0) }))
}

// `clips` : { [scene]: { chemin, images } } pour les clips tournés. Rend le plan de montage ou ce qui manque.
export const planDeMontage = ({ apercu, lang, clips, bornes = BORNES_APERCU }) => {
  const manquants = apercu.plans.filter((p) => !p.facultatif && !clips[p.scene]).map((p) => p.scene)
  if (manquants.length) return { statut: 'incomplet', apercu: apercu.id, manquants }
  const tournes = apercu.plans.filter((p) => clips[p.scene]).map((plan) => segmentDuPlan({ plan, lang, clips }))
  const segments = avecFin(rallonger(raccourcir(tournes, bornes), bornes))
  const images = dureeImages(segments)
  if (images < bornes.minImages || images > bornes.maxImages) throw new Error(`aperçu ${apercu.id} : ${images} images hors de [${bornes.minImages}, ${bornes.maxImages}]`)
  const ecartes = apercu.plans.filter((p) => !segments.some((s) => s.scene === p.scene)).map((p) => p.scene)
  return { statut: 'pret', apercu: apercu.id, segments, images, dureeS: images / FPS, ecartes, fin: carteDeFin({ apercu, lang }) }
}

// ── Visuels créatifs (#9811) ──────────────────────────────────────────────────────────────────

// Les cartes, dans l'ordre de lecture : une conversation traduite, puis la pièce frappée, le coffre ouvert
// et le rang révélé. Chaque carte cherche ses sources dans l'ordre ; la conversation est facultative tant
// qu'aucune prise ne la montre.
export const CARTES_CREATIVES = [
  {
    id: 'conversation',
    facultative: true,
    sources: [
      { famille: 'conversation', scene: 'conversation-traduite', image: 'traduction' },
      { famille: 'interaction', scene: 'interaction-emoji', image: 'reaction' },
    ],
  },
  { id: 'frappe', sources: [{ famille: 'jeu', scene: 'jeu-frappe', image: 'piece-retournee' }] },
  // `recompenses` : le coffre ouvert ET ce qu'il donne (`coffre-ouvert`, à 0,45 s, montre encore le couvercle).
  { id: 'coffre', sources: [{ famille: 'jeu', scene: 'jeu-coffre', image: 'recompenses' }] },
  { id: 'rang', sources: [{ famille: 'jeu', scene: 'jeu-rang', image: 'rang-revele' }] },
]

// Rapport largeur / hauteur de l'écran filmé (iPhone 6,9" : 1320 × 2868).
export const RAPPORT_ECRAN = 1320 / 2868

// Un visuel de 3840 px s'affiche sur environ 400 points de large : un corps de 170 px y fait ~18 pt.
// Titre et sous-titre sont donc grands et courts, centrés comme le demande Apple (« focal point … within
// the center ») ; les cartes de l'en-tête filent sous le bord bas, celles de la recherche tiennent entières.
export const CREATIFS = {
  entete: { largeur: 3840, hauteur: 1646, carteHaut: 680, carteHauteur: 1200, ecart: 110, titre: { haut: 90, bas: 600, corps: 170, sousCorps: 96 } },
  recherche: { largeur: 3840, hauteur: 2560, carteHaut: 860, carteHauteur: 1600, ecart: 110, titre: { haut: 120, bas: 760, corps: 190, sousCorps: 108 } },
}

const pair = (n) => 2 * Math.round(n / 2)

// Les rectangles des cartes, centrés ; en arabe, la lecture part de la droite.
export const dispositionCreatif = ({ format, nombre, dir = 'ltr' }) => {
  const f = CREATIFS[format]
  if (!f) throw new Error(`visuel créatif inconnu « ${format} » — connus : ${Object.keys(CREATIFS).join(', ')}`)
  const largeur = pair(f.carteHauteur * RAPPORT_ECRAN)
  const total = nombre * largeur + (nombre - 1) * f.ecart
  if (total > f.largeur) throw new Error(`${format} : ${nombre} cartes ne tiennent pas (${total} px pour ${f.largeur})`)
  const gauche = Math.round((f.largeur - total) / 2)
  const rects = Array.from({ length: nombre }, (_, i) => ({
    x: gauche + i * (largeur + f.ecart),
    y: f.carteHaut,
    largeur,
    hauteur: f.carteHauteur,
    rayon: Math.round(largeur * 0.11),
  }))
  return { ...f, cartes: dir === 'rtl' ? rects.reverse() : rects }
}

// Chemins de sortie, à l'image de l'arborescence andp : le dépôt est une copie à l'identique.
export const cheminsAppStore = ({ lang, racine = SORTIE_APPSTORE }) => {
  const locale = appStoreLocale(lang)
  const base = resolve(racine, locale)
  return {
    base,
    apercu: (appareil, fichier) => resolve(base, 'previews', APPAREILS_APERCU[appareil].dossier, fichier),
    enteteVideo: resolve(base, 'product_page_header', '01-entete.mp4'),
    enteteImage: resolve(base, 'product_page_header', '01-entete.png'),
    recherche: resolve(base, 'search_results', '01-recherche.png'),
    travail: resolve(racine, '.travail', locale),
  }
}
