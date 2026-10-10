// Le plan de la vidéo de STATUT « Trouve ta moitié » (#9988), déclaré en DONNÉES : 25 s en 9:16, quatre plans longs
// calés sur la mesure de la musique — on rigole (les réels drôles filmés), on devient amis (une conversation traduite),
// on devient complices (le vocal traduit de la conversation amoureuse filmée), puis l'amour (le grand départ) — et la
// signature. Chaque passage a SA transition : un éclair qui fend l'écran, des toiles qui emportent le cadre, un titre qui
// pousse le précédent hors de l'écran, Mee et Meo qui mangent tout. Mee et Meo tombent amoureux en contrepoint, avec
// leurs vrais stickers (apps/web/src/lib/mee). Tout est pur ici ; le rendu vit dans statut-amour.mjs.
import { TEXTES_STATUT } from '../textes/statut-amour.mjs'
import { AMOUR } from '../textes/amour.mjs'
import { partenaireDe } from '../textes/demo.mjs'
import { directionOf } from '../lib/locales.mjs'
import { serve } from '../lib/prism.mjs'

export const FPS = 30
export const LARGEUR = 1080
export const HAUTEUR = 1920
export const DUREE_S = 25
export const IMAGES = DUREE_S * FPS
export const POIDS_MAX_OCTETS = 10 * 1000 * 1000

// La musique : « Tears of Joy », Michael Ramir C., Mixkit (folk pop) — « Mixkit Stock Music Free License » (« Online
// marketing ads » permis, aucune attribution exigée), relevée le 2026-10-10 sur https://mixkit.co/license/#musicFree.
// 124 BPM mesurés sur ses attaques : un temps toutes les 0,4839 s, le premier à 0,25 s du fichier, où l'extrait part.
export const MUSIQUE = {
  titre: 'Tears of Joy',
  auteur: 'Michael Ramir C.',
  source: 'https://assets.mixkit.co/music/839/839.mp3',
  catalogue: 'https://mixkit.co/free-stock-music/tag/happy/',
  licence: 'https://mixkit.co/license/#musicFree',
  sha256: '30717c4e8d2a954a6163477b831e5b8981b406d2c34d72820fce4d40a8686ddc',
  fichier: 'musique-839-tears-of-joy.mp3',
  bpm: 124,
  debutS: 0.25,
}

export const TEMPS_S = 60 / MUSIQUE.bpm
export const enSecondes = (temps) => Number((temps * TEMPS_S).toFixed(3))
export const tempsDeLaVideo = () => Array.from({ length: 80 }, (_, k) => enSecondes(k)).filter((t) => t < DUREE_S)

// Les effets : Mixkit, « Mixkit Sound Effects Free License » (usage commercial, publicité en ligne, intégrés à une œuvre
// plus large), relevée le 2026-10-10 sur https://mixkit.co/license/#sfxFree. `picS` : l'instant du coup dans le fichier ;
// `dureeS` : ce qu'on en garde après le coup (le reste est fondu) ; `avantS` : ce qu'on garde avant (tout, par défaut).
const sfx = (id, titre, sha256, picS, dureeS = null, avantS = picS) => ({
  id, titre, sha256, picS, dureeS, avantS,
  source: `https://assets.mixkit.co/active_storage/sfx/${id}/${id}.wav`,
  fichier: `sfx-${id}.wav`,
  licence: 'https://mixkit.co/license/#sfxFree',
})

export const SONS = {
  tonnerre: sfx(1279, 'Fast thunder impact', 'b105f1706bf183232fd4d8b1b5ab6891542afe67c8484fbf4f2258fa5d400d5d', 0.96, 2.2),
  fouet: sfx(1508, 'Lightning whip', '6326cfd06e64e0b9b1a0da07327950c5a1325cf9e77bcca43b6b244528de3de2', 0.27),
  toile: sfx(1493, 'Swirling whoosh', 'b90a422ac769d50a00f9f12641deb5769fbca1a6eed4773a3a04d6163f0c97a0', 2.0, 0.5),
  fleche: sfx(1491, 'Arrow whoosh', 'c9aa08de97e5a1235f9b2b4eb7a1096f2fe09586995859e46aa83e9066badca2', 0.29),
  pousse: sfx(2151, 'Soft quick punch', 'd77ec3d56eabab9b0d5cf8e33bb17b098e15116b9cf33f49d720cfe889f3cf42', 0.15),
  souffle: sfx(1489, 'Air woosh', 'fdc4f87eb2c6d29ec3567b299fdc3b2aeea2432afe27801db80c496bda084499', 0.71),
  croque: sfx(120, 'Eating crunchy food with mouth open', 'f58ddd372dbf684b723d694ae2efe2e2048eb92413f5fa4c352016575c42436a', 6.12, 0.3, 0.06),
  bisou: sfx(2193, 'Quick funny kiss', '3ad050cb7bd561e8b43bb3c32377552a7812bd9d7bb0e9fef8b43c79cd534d55', 0.3),
  coeur: sfx(3082, 'Magic sparkle poof hit', 'cb2f7cf7107892a4a1e3f3402ad4234e2e4bd66ad55e7c144befec1af82d2ced', 0.09, 1.2),
  bulle: sfx(2357, 'Bubble pop up alert notification', '78040d4d9f09f878ee8f298942d03952373d1f890cd5903c4c521aa71eb9e2c2', 0.04),
  bague: sfx(2344, 'Magic notification ring', '739017d977684fc7255e1a6f26437b4a7b67266e1890c567d277bb6d3f22b8b5', 0.1),
  boing: sfx(2894, 'Boing hit sound', '9d0611005031292f357a89f7b7c2dfd2bf3e2e3896cbc0cb4c5d534a61fa9280', 0.11),
  magie: sfx(2638, 'Magic transition sweep presentation', '6d77a7509e4d6b00600a663a28c3a6c8b231886bd3e50f789e6604bc1ff84593', 1.3, 1.0, 0.7),
}

// Le croquement de Mee et Meo : trois attaques franches du même enregistrement, une par bouchée.
export const BOUCHEES_DANS_LE_FICHIER = [6.12, 8.31, 9.84]

// ── Les plans ──────────────────────────────────────────────────────────────────────────────────────────────

// L'écran natif de l'iPhone (px), sans sa barre d'état : ce que la carte montre. Une prise ou un écran du kit (rendu en
// 440×956 CSS, au facteur 3) partagent ces coordonnées.
export const ECRAN = { x: 0, y: 165, largeur: 1320, hauteur: 2703 }

const borner = (v, min, max) => Math.min(max, Math.max(min, v))
// La fenêtre d'un zoom centré sur (cx, cy), au rapport de l'écran, ramenée dans l'écran.
export const fenetre = (cx, cy, zoom) => {
  const largeur = ECRAN.largeur / zoom
  const hauteur = ECRAN.hauteur / zoom
  return {
    x: borner(cx - largeur / 2, ECRAN.x, ECRAN.x + ECRAN.largeur - largeur),
    y: borner(cy - hauteur / 2, ECRAN.y, ECRAN.y + ECRAN.hauteur - hauteur),
    largeur,
    hauteur,
  }
}

// `de`/`a` en TEMPS de la musique ; `sortie` : la transition qui l'emporte. `prise` : la scène filmée par la vitrine ;
// `kit` : l'écran du kit rendu en direct, ses bulles révélées une à une (`revelations`, secondes depuis le début du plan).
export const PLANS = [
  {
    id: 'rire', de: 0, a: 12, sortie: 'eclair',
    prise: { famille: 'interaction', scene: 'interaction-defilement' }, ancre: { etape: 'reel-1', decalageS: 0.15 },
    camera: { de: fenetre(660, 1516, 1), a: fenetre(660, 1530, 1.06) },
  },
  {
    id: 'amis', de: 12, a: 23, sortie: 'toiles',
    kit: 'amitie', revelations: [0.55, 1.25, 1.95, 2.65, 3.35],
    camera: { de: fenetre(660, 1880, 1.4), a: fenetre(660, 1990, 1.55) },
  },
  {
    id: 'complices', de: 23, a: 34, sortie: 'poussee',
    prise: { famille: 'interaction', scene: 'interaction-vocal' }, ancre: { etape: 'original', decalageS: -0.4 },
    camera: { de: fenetre(660, 1500, 1.1), a: fenetre(660, 1800, 1.55) }, repere: { y: 1562 },
  },
  {
    id: 'amour', de: 34, a: 43, sortie: 'festin',
    kit: 'amour-photos', revelations: [0.35, 1.2, 2.2],
    camera: { de: fenetre(660, 1400, 1.04), a: fenetre(660, 1700, 1.14) },
  },
  { id: 'signature', de: 46, a: null },
]

// Le festin de Mee et Meo occupe la fin du dernier plan jusqu'à la signature.
export const FESTIN = { de: 43, a: 46 }

// Mee et Meo, en contrepoint : ils se regardent, Cupidon tire, un cœur lancé, un bisou, des fleurs, un câlin — puis
// ils mangent tout, et la bague vient avec la signature. `de`/`a` en secondes de vidéo ; `x`/`y` : le centre, en px CSS
// de la page 540×960 (retourné en arabe) ; `taille` : le côté du sticker.
export const AMOUREUX = [
  { id: 'regard-mee', sticker: 'mee-amoureuse', de: 1.5, a: 5.8, x: 92, y: 862, taille: 165, depuis: 'bas' },
  { id: 'regard-meo', sticker: 'meo-love', de: 2.1, a: 5.8, x: 448, y: 862, taille: 165, depuis: 'bas' },
  { id: 'cupidon', sticker: 'duo-mee-cupidon', de: 7.4, a: 11.1, x: 400, y: 850, taille: 230, depuis: 'cote' },
  { id: 'coeur-lance', sticker: 'duo-mee-coeur-lance', de: 12.2, a: 14.3, x: 130, y: 852, taille: 230, depuis: 'cote' },
  { id: 'bisou', sticker: 'duo-meo-bisou', de: 14.3, a: 16.45, x: 410, y: 852, taille: 230, depuis: 'cote' },
  { id: 'fleurs', sticker: 'duo-mee-fleurs', de: 17.0, a: 18.9, x: 130, y: 852, taille: 230, depuis: 'cote' },
  { id: 'calin', sticker: 'duo-meo-calin', de: 18.9, a: 20.8, x: 410, y: 852, taille: 230, depuis: 'cote' },
  { id: 'bague', sticker: 'duo-mee-bague', de: 22.6, a: 25, x: 270, y: 760, taille: 300, depuis: 'bas' },
]

// Les deux gloutons du festin : Mee à gauche, Meo à droite (retournés en arabe).
export const GLOUTONS = { mee: 'mee-amoureuse', meo: 'meo-love' }

export const STICKERS = [...new Set([...AMOUREUX.map((m) => m.sticker), ...Object.values(GLOUTONS)])]

// ── Les prises ─────────────────────────────────────────────────────────────────────────────────────────────

export const origineDeLAction = (rapport) => Number((rapport.bornes.action.debutS - rapport.bornes.rognage.debutS).toFixed(3))

export const entreeDuPlan = ({ plan, rapport }) => {
  const etape = rapport.etapes?.[plan.ancre.etape]
  if (!Number.isFinite(etape)) throw new Error(`${plan.id} : la prise ${plan.prise.scene} n'a pas daté l'étape « ${plan.ancre.etape} »`)
  return Number(Math.max(0, origineDeLAction(rapport) + etape / 1000 + plan.ancre.decalageS).toFixed(3))
}

// Les étapes de la prise, en secondes depuis le début du plan.
export const etapesDuPlan = ({ plan, rapport }) => {
  const zero = rapport.etapes[plan.ancre.etape]
  return Object.fromEntries(Object.entries(rapport.etapes ?? {}).map(([nom, ms]) => [nom, Number(((ms - zero) / 1000 - plan.ancre.decalageS).toFixed(3))]))
}

// Le fil d'une conversation ne défile pas au même endroit d'une langue à l'autre : un plan qui déclare un `repere`
// suit l'élément lu dans la prise de cette langue (`repereY`).
const decaler = (f, dy) => ({ ...f, y: borner(f.y + dy, ECRAN.y, ECRAN.y + ECRAN.hauteur - f.hauteur) })
export const recaler = (p, prise) => {
  if (!p.repere || !Number.isFinite(prise?.repereY)) return p.camera
  const dy = prise.repereY - p.repere.y
  return { de: decaler(p.camera.de, dy), a: decaler(p.camera.a, dy) }
}

// En arabe, l'app est en miroir : la fenêtre se retourne avec elle.
const retournerRect = (f) => ({ ...f, x: ECRAN.x + ECRAN.largeur - (f.x - ECRAN.x) - f.largeur })
export const cameraDeLaLangue = (camera, dir) => (dir !== 'rtl' ? camera : { de: retournerRect(camera.de), a: retournerRect(camera.a) })

// ── Les langues ────────────────────────────────────────────────────────────────────────────────────────────

const nomDeLaLangue = (code, dans) => {
  const nom = new Intl.DisplayNames([dans], { type: 'language' }).of(code) ?? code
  return nom.charAt(0).toLocaleUpperCase(dans) + nom.slice(1)
}

export const paireDeLangues = ({ origine, lecteur }) => ({
  origine: { code: origine, nom: nomDeLaLangue(origine, origine) },
  lecteur: { code: lecteur, nom: nomDeLaLangue(lecteur, lecteur) },
})

const texte = (bloc, lang) => {
  const t = bloc?.[lang]
  if (!t) throw new Error(`texte du statut sans version ${lang}`)
  return t
}

// « Plus que 12 jours ❤️ », tel que le Prisme le sert au lecteur : la réplique du partenaire, traduite.
export const compteARebours = (lang) => serve(AMOUR.jours[partenaireDe(lang).lang], lang).text

// ── Le plan complet d'une langue ───────────────────────────────────────────────────────────────────────────

// `prises` : { [scene]: { clip, rapport, repereY? } }. Rend les plans en secondes, leurs textes, leurs langues, les
// moments de Mee et Meo, le festin et les repères sonores.
export const planDuStatut = ({ lang, prises }) => {
  const dir = directionOf(lang)
  const voix = partenaireDe(lang).lang
  const plans = PLANS.map((p) => {
    const debutS = enSecondes(p.de)
    const finS = p.a === null ? DUREE_S : enSecondes(p.a)
    if (p.id === 'signature') return { id: p.id, debutS, finS, devise: texte(TEXTES_STATUT.devise, lang), adresse: TEXTES_STATUT.adresse }
    const bloc = TEXTES_STATUT[p.id]
    const base = { ...p, debutS, finS, titre: texte(bloc.titre, lang), sousTitre: texte(bloc.sousTitre, lang) }
    if (p.kit) return { ...base, camera: cameraDeLaLangue(p.camera, dir), langues: p.id === 'amis' ? paireDeLangues({ origine: voix, lecteur: lang }) : null }
    const prise = prises[p.prise.scene]
    if (!prise) throw new Error(`${lang} : la prise ${p.prise.scene} manque — la filmer d'abord`)
    const etapesS = etapesDuPlan({ plan: p, rapport: prise.rapport })
    return {
      ...base, clip: prise.clip, camera: cameraDeLaLangue(recaler(p, prise), dir),
      entreeS: entreeDuPlan({ plan: p, rapport: prise.rapport }), etapesS,
      ...(p.id === 'complices' ? { langues: paireDeLangues({ origine: voix, lecteur: lang }), basculeS: Number((debutS + etapesS.traduction).toFixed(3)), compte: compteARebours(lang) } : {}),
    }
  })
  const plan = (id) => plans.find((p) => p.id === id)
  const festin = { debutS: enSecondes(FESTIN.de), finS: enSecondes(FESTIN.a) }
  const bouchees = [0.18, 0.55, 0.92].map((d) => Number((festin.debutS + d).toFixed(3)))
  const miroir = (x) => (dir === 'rtl' ? 540 - x : x)
  const amoureux = AMOUREUX.map((m) => ({ ...m, x: miroir(m.x) }))
  const reperes = [
    { son: 'bulle', instantS: plan('rire').debutS + 0.1, gainDb: -10 },
    { son: 'coeur', instantS: 1.6, gainDb: -12 },
    { son: 'souffle', instantS: plan('rire').debutS + plan('rire').etapesS['reel-2'], gainDb: -14 },
    { son: 'fouet', instantS: plan('amis').debutS - 0.12, gainDb: -6 },
    { son: 'tonnerre', instantS: plan('amis').debutS, gainDb: -3 },
    ...plan('amis').revelations.map((r) => ({ son: 'bulle', instantS: Number((plan('amis').debutS + r).toFixed(3)), gainDb: -9 })),
    { son: 'fleche', instantS: 8.0, gainDb: -8 },
    { son: 'coeur', instantS: 8.3, gainDb: -10 },
    { son: 'fleche', instantS: plan('complices').debutS - 0.75, gainDb: -10 },
    { son: 'toile', instantS: plan('complices').debutS - 0.2, gainDb: -6 },
    { son: 'coeur', instantS: 12.75, gainDb: -10 },
    { son: 'magie', instantS: plan('complices').basculeS, gainDb: -12 },
    { son: 'bisou', instantS: 14.75, gainDb: -6 },
    { son: 'souffle', instantS: plan('amour').debutS - 0.12, gainDb: -10 },
    { son: 'pousse', instantS: plan('amour').debutS + 0.12, gainDb: -4 },
    ...plan('amour').revelations.map((r) => ({ son: 'bulle', instantS: Number((plan('amour').debutS + r).toFixed(3)), gainDb: -9 })),
    { son: 'coeur', instantS: 17.4, gainDb: -10 },
    { son: 'boing', instantS: 19.25, gainDb: -12 },
    ...bouchees.map((instantS, i) => ({ son: 'croque', instantS, gainDb: -2, picS: BOUCHEES_DANS_LE_FICHIER[i] })),
    { son: 'bague', instantS: plan('signature').debutS + 0.15, gainDb: -6 },
    { son: 'coeur', instantS: 22.95, gainDb: -8 },
  ].map((r) => {
    const son = SONS[r.son]
    const pic = r.picS ?? son.picS
    // Le fichier part `avantS` avant son coup — jamais avant le début de la vidéo — et le coup tombe sur l'instant.
    const debutFichierS = Math.max(0, pic - son.avantS, pic - r.instantS)
    return { ...r, instantS: Number(r.instantS.toFixed(3)), picS: pic, debutFichierS: Number(debutFichierS.toFixed(3)), departS: Number((r.instantS - (pic - debutFichierS)).toFixed(3)) }
  })
  return { lang, dir, dureeS: DUREE_S, images: IMAGES, plans, festin: { ...festin, bouchees }, amoureux, gloutons: GLOUTONS, reperes, tempsS: TEMPS_S, temps: tempsDeLaVideo() }
}

// ── Le mixage ──────────────────────────────────────────────────────────────────────────────────────────────

export const CIBLE_LUFS = -16
export const CRETE_DBTP = -1.5

// Les coups brefs creusent la musique (sidechain) ; un souffle ou une toile durent et l'éteindraient.
export const SONS_DE_COUP = new Set(['tonnerre', 'pousse', 'croque', 'bague', 'bisou'])

export const filtreDeLaMusique = () => `[0:a]atrim=start=${MUSIQUE.debutS}:end=${(MUSIQUE.debutS + DUREE_S).toFixed(3)},asetpts=PTS-STARTPTS`

// La fenêtre gardée d'un effet : de `debutFichierS` jusqu'à `dureeS` après le coup, fondue en sortie.
export const fenetreDeLEffet = (r) => {
  const son = SONS[r.son]
  const debut = r.debutFichierS
  if (son.dureeS === null) return debut > 0 ? `atrim=start=${debut.toFixed(3)},asetpts=PTS-STARTPTS,` : ''
  const fin = r.picS + son.dureeS
  const fondu = Math.min(0.15, son.dureeS / 2)
  return `atrim=start=${debut.toFixed(3)}:end=${fin.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=out:st=${(fin - debut - fondu).toFixed(3)}:d=${fondu.toFixed(3)},`
}

export const filtreDeMixage = ({ reperes, musiqueGainDb = -5, effetsGainDb = 0 }) => {
  const parties = [
    `${filtreDeLaMusique()},aformat=sample_rates=48000:channel_layouts=stereo,volume=${musiqueGainDb}dB,afade=t=in:d=0.08,afade=t=out:st=${(DUREE_S - 1.2).toFixed(3)}:d=1.2[m]`,
  ]
  const coups = reperes.map((r, i) => [r, i]).filter(([r]) => SONS_DE_COUP.has(r.son)).map(([, i]) => i)
  reperes.forEach((r, i) => {
    const retard = Math.round(r.departS * 1000)
    const sortie = coups.includes(i) ? `asplit=2[s${i}][k${i}]` : `anull[s${i}]`
    parties.push(`[${i + 1}:a]${fenetreDeLEffet(r)}aformat=sample_rates=48000:channel_layouts=stereo,volume=${r.gainDb + effetsGainDb}dB,adelay=${retard}|${retard},apad=whole_dur=${DUREE_S},${sortie}`)
  })
  parties.push(`${reperes.map((_, i) => `[s${i}]`).join('')}amix=inputs=${reperes.length}:duration=longest:normalize=0[fx]`)
  parties.push(`${coups.map((i) => `[k${i}]`).join('')}amix=inputs=${coups.length}:duration=longest:normalize=0[cle]`)
  parties.push('[m][cle]sidechaincompress=threshold=0.08:ratio=4:attack=3:release=200:makeup=1[md]')
  parties.push(`[md][fx]amix=inputs=2:duration=first:normalize=0,atrim=end=${DUREE_S},asetpts=PTS-STARTPTS[mix]`)
  return parties.join(';')
}

export const filtreDeSonie = (mesure = null) => {
  const base = `loudnorm=I=${CIBLE_LUFS}:TP=${CRETE_DBTP}:LRA=11`
  if (!mesure) return `${base}:print_format=json`
  return `${base}:measured_I=${mesure.input_i}:measured_TP=${mesure.input_tp}:measured_LRA=${mesure.input_lra}:measured_thresh=${mesure.input_thresh}:offset=${mesure.target_offset}:linear=true:print_format=json`
}

export const argumentsDeMixage = ({ musique, sons, reperes, sortie, mesure = null }) => [
  '-y', '-v', 'info', '-i', musique, ...reperes.flatMap((r) => ['-i', sons[r.son]]),
  '-filter_complex', `${filtreDeMixage({ reperes })};[mix]${filtreDeSonie(mesure)},aresample=48000[out]`,
  '-map', '[out]', '-ac', '2', '-ar', '48000', ...(sortie ? ['-c:a', 'pcm_s16le', sortie] : ['-f', 'null', '-']),
]

// Le débit vidéo qui tient le fichier sous la limite, l'audio (160 kb/s) et le conteneur compris, avec 8 % de marge.
export const debitVideoKbps = ({ dureeS = DUREE_S, poidsMax = POIDS_MAX_OCTETS, audioKbps = 160 } = {}) =>
  Math.floor(((poidsMax * 8 * 0.92) / dureeS) / 1000 - audioKbps)
