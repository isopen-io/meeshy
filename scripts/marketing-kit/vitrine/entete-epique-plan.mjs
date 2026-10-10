// Le plan de montage de l'en-tête ÉPIQUE de la fiche App Store (#9904), déclaré en DONNÉES : quatre actes calés sur la
// mesure de la musique — des réels drôles en quatre langues, une story, un vocal qui passe de sa langue à celle du
// lecteur, puis le jeu (frappe, coffre, niveau, rang) et la signature. Tout est pur ici : temps, points d'entrée dans les
// prises, caméras, typographie, effets sonores et commandes de mixage. Le rendu vit dans entete-epique.mjs.
//
// Spécification Apple (lib/conformite.mjs, `entete-video`) : 3840×1646, 5 à 30 s, 30 ou 60 i/s.
import { DEMO, partenaireDe } from '../textes/demo.mjs'
import { REELS_DROLES } from '../textes/reels.mjs'
import { TEXTES_ENTETE } from '../textes/entete-epique.mjs'
import { directionOf } from '../lib/locales.mjs'
import { auteurDuReel, storyDeLEntete } from './fixtures.mjs'

export const FPS = 30
export const LARGEUR = 3840
export const HAUTEUR = 1646
// 30 s : la limite d'Apple. L'acte du LIEN y prend 10,4 s (#9904, « bien 10-12 s » selon le porteur) : trois réels au lieu
// de quatre, une story, un vocal et un jeu resserrés à la mesure.
export const DUREE_S = 30
export const IMAGES = DUREE_S * FPS

// La musique : « Games Music », Grigoriy Nuzhny, Mixkit — « Mixkit Stock Music Free License » (« Online marketing ads »
// permis, aucune attribution exigée ; interdits : CD/DVD, jeux vidéo, radio et télévision, remix en piste musicale seule,
// dépôt sur un service de gestion de droits), relevée le 2026-10-10 sur https://mixkit.co/license/#musicFree. 139 BPM :
// la mesure tombe toutes les 1,7266 s ; l'extrait part sur un temps (48,54 s) et le jeu tombe, 49 temps plus loin, sur
// l'entrée du sommet du morceau (69,69 s). Toutes les coupes tombent sur un temps.
export const MUSIQUE = {
  titre: 'Games Music',
  auteur: 'Grigoriy Nuzhny',
  source: 'https://assets.mixkit.co/music/706/706.mp3',
  catalogue: 'https://mixkit.co/free-stock-music/tag/trailer/',
  licence: 'https://mixkit.co/license/#musicFree',
  sha256: 'c1129accbe28650b96f19e065b229ac5769d77fd09a184a9f628e2c87571a9ab',
  fichier: 'musique-706-games-music.mp3',
  bpm: 139,
  debutS: 48.54,
}

export const TEMPS_S = 60 / MUSIQUE.bpm
export const enSecondes = (temps) => temps * TEMPS_S
// Chaque temps de la musique, en secondes de vidéo : la page y cale la respiration du fond.
export const tempsDeLaVideo = () => Array.from({ length: 200 }, (_, k) => enSecondes(k)).filter((t) => t < DUREE_S)
export const enImages = (secondes) => Math.round(secondes * FPS)

// Les effets sonores : Mixkit, « Mixkit Sound Effects Free License » (usage commercial, publicité en ligne, intégrés à
// une œuvre plus large ; jamais redistribués seuls), relevée le 2026-10-10 sur https://mixkit.co/license/#sfxFree.
// `picS` : l'instant du coup dans le fichier, posé sur l'instant voulu.
const sfx = (id, titre, sha256, picS, extension = 'wav') => ({
  id, titre, sha256, picS,
  source: `https://assets.mixkit.co/active_storage/sfx/${id}/${id}.${extension}`,
  fichier: `sfx-${id}.${extension}`,
  licence: 'https://mixkit.co/license/#sfxFree',
})

export const SONS = {
  balayage: sfx(166, 'Fast small sweep transition', 'ca5a0206a7e6b12893a5727cb98a9d43ab02893153465eb21d43fb7b9e6616c3', 0.33),
  souffle: sfx(1492, 'Cinematic whoosh fast transition', '02b8cd40b3761288d54f4d6706983a2f8c110182b669ae2cdf9aab02935a4e7a', 1.07),
  scintille: sfx(2350, 'Magic sparkle whoosh', '321d550c25ec93fa49e7c2a03bbbe99f2a483575109700e589dd3eb4d2e781c6', 0.97),
  frappe: sfx(3057, 'Apocalyptic stomp impact', '48ccce0ec93e37ed0b962a567ff7bac27863d06b35e7d69771d9bc5778862bea', 0.38),
  souffleImpact: sfx(2919, 'Movie trailer whoosh hit', 'bc39d296c5b26f6ede180c2d03f94ed1cc484b685826700d6ef07b6eda54ba7b', 3.16),
  impact: sfx(2908, 'Movie trailer epic impact', 'dd0afbaffa7837c2eb0ec50191e9dcceb09da51e07b8bc565a87afe616d36ad6', 0.98),
  piece: sfx(1999, 'Gold coin prize', 'ef9e8681a327b0d1d693038c417f5530915fedb25cee8c291d3910128ae28c19', 0.17),
  coffre: sfx(2066, 'Video game treasure', '655d1d38b88be9b96ccb37a41b4b95fc88b16c142fae2fd64490dc1112b8d834', 0.27),
  niveau: sfx(2062, 'Game experience level increased', '0b04e35cb9491bb2d57f66899d04752a377518071c8e190ee617b3825898457e', 0.74),
  rang: sfx(257, 'Magic sweep game trophy', 'd84cc325aaef3409ee5bda6ace1ccaa772ce37fce213ff31e1330a4b25762b00', 0.09),
}

// Les plans, en TEMPS de la musique. `prise` : la scène filmée qu'il montre ; `ancre` : où y entrer — une étape datée
// par l'app (`etape`), ou le premier mouvement lu dans le film (`mouvement`), plus un décalage en secondes ; `camera` :
// la fenêtre de l'écran natif (px, iPhone 1320×2868) au début et à la fin du plan, `null` = l'écran entier.
// `cote` : où l'écran se pose (le texte occupe l'autre moitié) ; l'arabe retourne tout.
const ECRAN = { x: 0, y: 165, largeur: 1320, hauteur: 2703 }
// La fenêtre d'un zoom centré sur (cx, cy), ramenée dans l'écran sans sa barre d'état.
export const fenetre = (cx, cy, zoom) => {
  const largeur = ECRAN.largeur / zoom
  const hauteur = ECRAN.hauteur / zoom
  const borner = (v, min, max) => Math.min(max, Math.max(min, v))
  return {
    x: borner(cx - largeur / 2, ECRAN.x, ECRAN.x + ECRAN.largeur - largeur),
    y: borner(cy - hauteur / 2, ECRAN.y, ECRAN.y + ECRAN.hauteur - hauteur),
    largeur,
    hauteur,
  }
}

export const PLANS = [
  ...[1, 2, 3].map((n) => ({
    id: `reel-${n}`, acte: 'reels', de: (n - 1) * 3, a: n * 3, cote: 'droite',
    prise: { famille: 'interaction', scene: 'interaction-defilement' }, ancre: { etape: `reel-${n}`, decalageS: 0.05 },
    camera: { de: fenetre(660, 1435, 1.2), a: fenetre(640, 1450, 1.26) },
  })),
  {
    id: 'story', acte: 'story', de: 9, a: 15, cote: 'gauche',
    prise: { famille: 'interaction', scene: 'interaction-story' }, ancre: { etape: 'ouverture', decalageS: -0.35 },
    camera: { de: fenetre(660, 1516, 1), a: fenetre(660, 1600, 1.12) },
  },
  {
    id: 'vocal', acte: 'vocal', de: 15, a: 25, cote: 'droite',
    prise: { famille: 'interaction', scene: 'interaction-vocal' }, ancre: { etape: 'original', decalageS: -0.3 },
    camera: { de: fenetre(660, 1700, 1.05), a: fenetre(620, 1780, 1.18) },
    loupe: { x: 30, y: 1545, largeur: 940, hauteur: 480 }, repere: { y: 1562 },
  },
  {
    id: 'sonde', acte: 'lien', de: 25, a: 31, cote: 'gauche',
    prise: { famille: 'interaction', scene: 'interaction-sonde' }, ancre: { etape: 'ecran', decalageS: -0.6 },
    camera: { de: fenetre(660, 1350, 1.05), a: fenetre(660, 1300, 1.12) },
    loupe: { x: 30, y: 500, largeur: 1080, hauteur: 1060 },
  },
  {
    id: 'sav', acte: 'lien', de: 31, a: 36, cote: 'droite',
    prise: { famille: 'interaction', scene: 'interaction-sav' }, ancre: { etape: 'ecran', decalageS: 0 },
    camera: { de: fenetre(660, 1400, 1), a: fenetre(660, 1300, 1.1) },
    loupe: { x: 30, y: 860, largeur: 1280, hauteur: 1000 },
  },
  {
    id: 'invite', acte: 'lien', de: 36, a: 42, cote: 'gauche',
    prise: { famille: 'interaction', scene: 'interaction-invite' }, ancre: { etape: 'invitation', decalageS: 0.4 },
    camera: { de: fenetre(660, 1500, 1), a: fenetre(660, 1560, 1.08) },
  },
  {
    id: 'liens', acte: 'lien', de: 42, a: 49, cote: 'droite',
    prise: { famille: 'interaction', scene: 'interaction-liens' }, ancre: { etape: 'hub', decalageS: -0.1 },
    camera: { de: fenetre(660, 1100, 1.25), a: fenetre(660, 1050, 1.35) },
  },
  {
    id: 'frappe', acte: 'jeu', de: 49, a: 53, cote: 'gauche',
    prise: { famille: 'jeu', scene: 'jeu-frappe' }, ancre: { mouvement: true, decalageS: -0.25 },
    camera: { de: fenetre(660, 1100, 1.1), a: fenetre(560, 1000, 1.25) },
    loupe: { x: 70, y: 455, largeur: 560, hauteur: 270 },
  },
  {
    id: 'coffre', acte: 'jeu', de: 53, a: 57, cote: 'droite',
    prise: { famille: 'jeu', scene: 'jeu-coffre' }, ancre: { mouvement: true, decalageS: -0.2 },
    camera: { de: fenetre(660, 1900, 1.1), a: fenetre(660, 2000, 1.25) },
    loupe: { x: 300, y: 1930, largeur: 720, hauteur: 560 },
  },
  {
    id: 'niveau', acte: 'jeu', de: 57, a: 59, cote: 'gauche',
    prise: { famille: 'jeu', scene: 'jeu-niveau' }, ancre: { mouvement: true, decalageS: -0.15 },
    camera: { de: fenetre(660, 1100, 1.1), a: fenetre(600, 1050, 1.2) },
    loupe: { x: 20, y: 470, largeur: 740, hauteur: 300 },
  },
  {
    id: 'rang', acte: 'jeu', de: 59, a: 64, cote: 'gauche',
    prise: { famille: 'jeu', scene: 'jeu-rang' }, ancre: { mouvement: true, decalageS: -0.15 },
    camera: { de: fenetre(600, 1100, 1.15), a: fenetre(560, 1050, 1.25) },
    loupe: { x: 80, y: 760, largeur: 640, hauteur: 250 },
  },
  { id: 'signature', acte: 'signature', de: 64, a: null },
]

// Les effets sonores, posés par leur COUP sur un instant du plan (en temps de musique) ; `retardS` décale d'un instant
// lu dans la prise (le coup du marteau, le coffre qui s'ouvre). `gainDb` relatif au fichier, dont la crête est à 0 dBFS
// (le scintillement à -6) : aucun effet ne dépasse la pleine échelle avant la sonie.
export const REPERES = [
  { son: 'impact', temps: 0, gainDb: -6 },
  ...[3, 6].map((temps) => ({ son: 'balayage', temps, gainDb: -6 })),
  { son: 'souffle', temps: 9, gainDb: -4 },
  { son: 'scintille', plan: 'story', etape: 'story', gainDb: -6 },
  { son: 'souffle', temps: 15, gainDb: -4 },
  { son: 'scintille', plan: 'vocal', etape: 'traduction', gainDb: -6 },
  { son: 'souffle', temps: 25, gainDb: -4 },
  ...[31, 36, 42].map((temps) => ({ son: 'balayage', temps, gainDb: -6 })),
  { son: 'frappe', plan: 'frappe', retardS: 0.52, gainDb: 0 },
  { son: 'piece', plan: 'frappe', retardS: 1.0, gainDb: -2 },
  { son: 'balayage', temps: 53, gainDb: -6 },
  { son: 'coffre', plan: 'coffre', retardS: 0.15, gainDb: -2 },
  { son: 'niveau', plan: 'niveau', retardS: 0.05, gainDb: -3 },
  { son: 'rang', plan: 'rang', retardS: 0.55, gainDb: -3 },
  { son: 'souffleImpact', temps: 64, gainDb: -4 },
  { son: 'impact', temps: 64, gainDb: -2 },
]

// ── Les prises ─────────────────────────────────────────────────────────────────────────────────────────────

// L'instant, en secondes de clip, où l'action commence : la prise est rognée `avant` la marge avant l'action.
export const origineDeLAction = (rapport) => Number((rapport.bornes.action.debutS - rapport.bornes.rognage.debutS).toFixed(3))

// Le point d'entrée d'un plan dans son clip (secondes). `mouvementMs` : le premier mouvement lu dans le film, en ms
// d'action (les scènes du jeu).
export const entreeDuPlan = ({ plan, rapport, mouvementMs = null }) => {
  const origine = origineDeLAction(rapport)
  if (plan.ancre.mouvement) {
    if (!Number.isFinite(mouvementMs)) throw new Error(`${plan.id} : aucun mouvement lu dans la prise ${plan.prise.scene}`)
    return Math.max(0, origine + mouvementMs / 1000 + plan.ancre.decalageS)
  }
  const etape = rapport.etapes?.[plan.ancre.etape]
  if (!Number.isFinite(etape)) throw new Error(`${plan.id} : la prise ${plan.prise.scene} n'a pas daté l'étape « ${plan.ancre.etape} »`)
  return Math.max(0, origine + etape / 1000 + plan.ancre.decalageS)
}

// Les étapes datées d'un plan ancré sur une étape, en secondes depuis le début du plan.
export const etapesDuPlan = ({ plan, rapport }) => {
  if (!plan.ancre.etape) return {}
  const zero = rapport.etapes[plan.ancre.etape]
  return Object.fromEntries(Object.entries(rapport.etapes ?? {}).map(([nom, ms]) => [nom, Number(((ms - zero) / 1000 - plan.ancre.decalageS).toFixed(3))]))
}

// ── La typographie et les langues ──────────────────────────────────────────────────────────────────────────

const nomDeLaLangue = (code, dans) => {
  const nom = new Intl.DisplayNames([dans], { type: 'language' }).of(code) ?? code
  return nom.charAt(0).toLocaleUpperCase(dans) + nom.slice(1)
}

// « 한국어 → Français » : la langue d'origine dans sa propre écriture, celle du lecteur dans la sienne.
export const paireDeLangues = ({ origine, lecteur }) => ({
  origine: { code: origine, nom: nomDeLaLangue(origine, origine) },
  lecteur: { code: lecteur, nom: nomDeLaLangue(lecteur, lecteur) },
})

// La signature : le nom de l'app dans la fiche de la langue (« Meeshy : Parle au monde entier »), sans la marque.
export const titreDeSignature = (nom) => {
  const titre = nom.trim().replace(/^Meeshy\s*[:：]\s*/u, '')
  if (!titre || titre === nom.trim()) throw new Error(`nom de fiche inattendu : « ${nom} »`)
  return titre.charAt(0).toLocaleUpperCase() + titre.slice(1)
}

const texte = (bloc, lang) => {
  const t = bloc?.[lang]
  if (!t) throw new Error(`texte de l'en-tête sans version ${lang}`)
  return t
}

// La légende d'un réel, telle que le lecteur la lit (traduite) et telle que son auteur l'a écrite.
export const legendeDuReel = (n, lang) => {
  const reel = REELS_DROLES[n - 1]
  const auteur = auteurDuReel(reel, lang)
  return { original: reel.textes[auteur.lang], traduction: reel.textes[lang], langues: paireDeLangues({ origine: auteur.lang, lecteur: lang }) }
}

// La langue d'origine de chaque acte, pour ce lecteur.
export const languesDesActes = (lang) => ({
  story: paireDeLangues({ origine: storyDeLEntete(lang).lang, lecteur: lang }),
  vocal: paireDeLangues({ origine: DEMO.amour.vocalRecu[partenaireDe(lang).lang].lang, lecteur: lang }),
})

// En arabe, l'app se met en miroir : l'action se joue de l'autre côté de l'écran, la fenêtre se retourne avec elle.
const retournerRect = (f) => ({ ...f, x: ECRAN.x + ECRAN.largeur - (f.x - ECRAN.x) - f.largeur })
export const cameraDeLaLangue = (camera, dir) => (dir !== 'rtl' ? camera : { de: retournerRect(camera.de), a: retournerRect(camera.a) })
export const loupeDeLaLangue = (loupe, dir) => (!loupe || dir !== 'rtl' ? loupe ?? null : retournerRect(loupe))

// Un plan qui déclare un `repere` (l'ordonnée native d'un élément sur la prise française) suit cet élément s'il a bougé
// dans la prise de cette langue (`prise.repereY`, lu dans l'image) : le fil d'une conversation ne défile pas au même
// endroit d'une langue à l'autre.
const decaler = (f, dy) => ({ ...f, y: Math.min(ECRAN.y + ECRAN.hauteur - f.hauteur, Math.max(ECRAN.y, f.y + dy)) })
export const recaler = (p, prise) => {
  if (!p.repere || !Number.isFinite(prise.repereY)) return { camera: p.camera, loupe: p.loupe }
  const dy = prise.repereY - p.repere.y
  return { camera: { de: decaler(p.camera.de, dy), a: decaler(p.camera.a, dy) }, loupe: p.loupe && { ...p.loupe, y: p.loupe.y + dy } }
}

// ── Le plan complet d'une langue ───────────────────────────────────────────────────────────────────────────

// `prises` : { [scene]: { clip, rapport, mouvementMs? } }. Rend les plans en secondes, avec leur entrée dans le clip,
// leurs textes et leur côté (retourné en arabe), les repères sonores en secondes, et la signature.
export const planDeLEntete = ({ lang, prises, nomDeFiche }) => {
  const dir = directionOf(lang)
  const retourne = (cote) => (dir === 'rtl' ? (cote === 'droite' ? 'gauche' : 'droite') : cote)
  const langues = languesDesActes(lang)
  const plans = PLANS.map((p) => {
    const debutS = enSecondes(p.de)
    const finS = p.a === null ? DUREE_S : enSecondes(p.a)
    if (p.acte === 'signature') return { ...p, debutS, finS, titre: titreDeSignature(nomDeFiche) }
    const prise = prises[p.prise.scene]
    if (!prise) throw new Error(`${lang} : la prise ${p.prise.scene} manque — la filmer d'abord`)
    const bloc = TEXTES_ENTETE[p.id.startsWith('reel-') ? 'reels' : p.id]
    const decale = recaler(p, prise)
    const base = {
      ...p, debutS, finS, cote: retourne(p.cote), clip: prise.clip, camera: cameraDeLaLangue(decale.camera, dir), loupe: loupeDeLaLangue(decale.loupe, dir),
      entreeS: entreeDuPlan({ plan: p, rapport: prise.rapport, mouvementMs: prise.mouvementMs }),
      etapesS: etapesDuPlan({ plan: p, rapport: prise.rapport }),
      titre: texte(bloc.titre, lang), sousTitre: bloc.sousTitre ? texte(bloc.sousTitre, lang) : null,
    }
    if (p.id.startsWith('reel-')) return { ...base, legende: legendeDuReel(Number(p.id.slice(5)), lang) }
    if (p.id === 'story') return { ...base, langues: langues.story }
    if (p.id === 'vocal') return { ...base, langues: langues.vocal, basculeS: base.etapesS.traduction }
    return base
  })
  const planNomme = (id) => plans.find((p) => p.id === id)
  const reperes = REPERES.map((r) => {
    const son = SONS[r.son]
    let instant
    if (r.plan && r.etape) instant = planNomme(r.plan).debutS + planNomme(r.plan).etapesS[r.etape]
    else if (r.plan) instant = planNomme(r.plan).debutS - planNomme(r.plan).ancre.decalageS + r.retardS
    else instant = enSecondes(r.temps)
    return { ...r, instantS: Number(instant.toFixed(3)), departS: Number(Math.max(0, instant - son.picS).toFixed(3)), coupeS: Math.max(0, son.picS - instant) }
  })
  return { lang, dir, dureeS: DUREE_S, images: IMAGES, plans, reperes }
}

// ── Le mixage ──────────────────────────────────────────────────────────────────────────────────────────────

export const CIBLE_LUFS = -16
export const CRETE_DBTP = -1.5

// La musique : un seul extrait du fichier, à la mesure, de DUREE_S.
export const filtreDeLaMusique = () =>
  `[0:a]atrim=start=${MUSIQUE.debutS}:end=${(MUSIQUE.debutS + DUREE_S).toFixed(3)},asetpts=PTS-STARTPTS`

// Les sons qui CREUSENT la musique : les coups brefs. Un souffle ou un scintillement dure des secondes, et la musique
// s'éteindrait sous lui.
export const SONS_DE_COUP = new Set(['impact', 'frappe', 'piece', 'coffre', 'niveau', 'rang'])

// La musique (extrait de DUREE_S, fondu d'entrée court sous le premier impact, fondu de sortie pour la boucle d'Apple) et
// chaque effet posé à son départ. Les effets forment un bus qui COMPRIME la musique (sidechain) : chaque coup se creuse
// sa place au lieu de se noyer dans une piste déjà dense. Tout est sommé SANS normalisation par entrée (normalize=0),
// puis porté à la cible de sonie par loudnorm (deux passes : la mesure de la première est appliquée, en linéaire).
export const filtreDeMixage = ({ reperes, musiqueGainDb = -4, effetsGainDb = 0 }) => {
  const parties = [
    `${filtreDeLaMusique()},aformat=sample_rates=48000:channel_layouts=stereo,volume=${musiqueGainDb}dB,afade=t=in:d=0.12,afade=t=out:st=${(DUREE_S - 0.9).toFixed(3)}:d=0.9[m]`,
  ]
  const coups = reperes.map((r, i) => [r, i]).filter(([r]) => SONS_DE_COUP.has(r.son)).map(([, i]) => i)
  reperes.forEach((r, i) => {
    const retard = Math.round(r.departS * 1000)
    const coupe = r.coupeS > 0 ? `atrim=start=${r.coupeS.toFixed(3)},asetpts=PTS-STARTPTS,` : ''
    const sortie = coups.includes(i) ? `asplit=2[s${i}][k${i}]` : `anull[s${i}]`
    parties.push(`[${i + 1}:a]${coupe}aformat=sample_rates=48000:channel_layouts=stereo,volume=${r.gainDb + effetsGainDb}dB,adelay=${retard}|${retard},apad=whole_dur=${DUREE_S},${sortie}`)
  })
  parties.push(`${reperes.map((_, i) => `[s${i}]`).join('')}amix=inputs=${reperes.length}:duration=longest:normalize=0[fx]`)
  parties.push(`${coups.map((i) => `[k${i}]`).join('')}amix=inputs=${coups.length}:duration=longest:normalize=0[cle]`)
  parties.push('[m][cle]sidechaincompress=threshold=0.1:ratio=3:attack=3:release=180:makeup=1[md]')
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

// La dernière sortie JSON de loudnorm dans le journal de ffmpeg.
export const lireMesure = (journal) => {
  const debut = journal.lastIndexOf('{')
  const fin = journal.lastIndexOf('}')
  if (debut < 0 || fin < debut) throw new Error('loudnorm n’a rendu aucune mesure')
  return JSON.parse(journal.slice(debut, fin + 1))
}

// ── Le modèle de la page ───────────────────────────────────────────────────────────────────────────────────

// L'écran en px CSS de la page (1920×823, rendue ×2) : 712 de haut, au rapport de l'écran natif sans sa barre d'état.
export const ECRAN_CSS = { hauteur: 712, largeur: Math.round((712 * ECRAN.largeur) / ECRAN.hauteur) }
const W_CSS = 1920
const H_CSS = 823
// La disposition d'un plan dans la largeur : l'écran au tiers et le texte en face ; avec une loupe, l'écran au bord, la
// loupe au centre et le texte, plus étroit, de l'autre côté.
export const dispositionDuPlan = ({ cote, loupe }) => {
  const d = cote === 'droite'
  if (!loupe) return { ecranX: W_CSS * (d ? 0.7 : 0.3), loupeX: null, colonneX: W_CSS * (d ? 0.27 : 0.73), colonneLargeur: 900 }
  return { ecranX: W_CSS * (d ? 0.85 : 0.15), loupeX: W_CSS * (d ? 0.57 : 0.43), colonneX: W_CSS * (d ? 0.215 : 0.785), colonneLargeur: 640 }
}

const COUPS = { frappe: 1.4, piece: 0.6, coffre: 1, niveau: 0.9, rang: 1, impact: 2 }
const FLASHS = { story: 0.45, vocal: 0.45, sonde: 0.45, frappe: 0.55 }

// `images` : { [planId]: { dossier, nombre } } — les images extraites de chaque plan.
export const modeleDeLaPage = ({ plan, images }) => {
  const videos = plan.plans.filter((p) => p.acte !== 'signature')
  const signature = plan.plans.find((p) => p.acte === 'signature')
  const suivant = (p) => plan.plans[plan.plans.indexOf(p) + 1]
  const planDuRepere = (r) => (r.plan ? plan.plans.find((p) => p.id === r.plan) : plan.plans.find((p) => r.instantS >= p.debutS && r.instantS < p.finS))
  const secousses = (p) => plan.reperes
    .filter((r) => ['frappe', 'coffre', 'niveau', 'rang'].includes(r.son) && r.instantS >= p.debutS && r.instantS < p.finS)
    .map((r) => ({ instantS: r.instantS, force: r.son === 'frappe' ? 1 : 0.55 }))
  const plans = videos.map((p, i) => ({
    id: p.id, debutS: p.debutS, finS: p.finS, cote: p.cote, camera: p.camera, loupe: p.loupe ?? null, ecran: ECRAN_CSS,
    images: images[p.id], pose: dispositionDuPlan(p),
    entree: i > 0 && videos[i - 1].acte === p.acte && p.acte === 'reels' ? 'poing' : 'fouet',
    sortie: suivant(p)?.acte !== p.acte || p.acte === 'jeu',
    secousses: secousses(p),
  }))
  const premier = (acte) => videos.find((p) => p.acte === acte)
  const dernier = (acte) => videos.filter((p) => p.acte === acte).at(-1)
  const reels = videos.filter((p) => p.acte === 'reels')
  const story = premier('story')
  const vocal = premier('vocal')
  const niveau = videos.find((p) => p.id === 'niveau')
  const rang = videos.find((p) => p.id === 'rang')
  const avecPose = (b, p) => ({ ...b, pose: dispositionDuPlan(p) })
  const blocs = [
    avecPose({
      id: 'reels', debutS: reels[0].debutS, finS: dernier('reels').finS, cote: reels[0].cote, titre: reels[0].titre, sousTitre: reels[0].sousTitre,
      citations: reels.map((r) => ({ id: r.id, debutS: r.debutS, finS: r.finS, ...r.legende })),
    }, reels[0]),
    avecPose({ id: 'story', debutS: story.debutS, finS: story.finS, cote: story.cote, titre: story.titre, sousTitre: story.sousTitre, langues: story.langues, puceS: story.etapesS.story }, story),
    avecPose({ id: 'vocal', debutS: vocal.debutS, finS: vocal.finS, cote: vocal.cote, titre: vocal.titre, sousTitre: vocal.sousTitre, langues: vocal.langues, puceS: 0.25, basculeS: Number((vocal.debutS + vocal.basculeS).toFixed(3)) }, vocal),
    ...['sonde', 'sav', 'invite', 'liens'].map((id) => { const p = videos.find((v) => v.id === id); return avecPose({ id, debutS: p.debutS, finS: p.finS, cote: p.cote, titre: p.titre, sousTitre: p.sousTitre }, p) }),
    ...['frappe', 'coffre'].map((id) => { const p = videos.find((v) => v.id === id); return avecPose({ id, debutS: p.debutS, finS: p.finS, cote: p.cote, titre: p.titre, slam: true }, p) }),
    avecPose({ id: 'niveau', debutS: niveau.debutS, finS: rang.finS, cote: niveau.cote, titre: niveau.titre, slam: true, sousTitre: rang.sousTitre, sousTitreS: Number((rang.debutS - niveau.debutS + 0.25).toFixed(3)) }, niveau),
  ]
  const coups = plan.reperes.filter((r) => COUPS[r.son] && (r.son !== 'impact' || r.instantS >= signature.debutS - 0.01)).map((r) => {
    const p = planDuRepere(r)
    const centre = r.son === 'impact' || !p || p.acte === 'signature'
    const pose = p && !centre ? dispositionDuPlan(p) : null
    return { instantS: r.instantS, force: COUPS[r.son], x: centre ? W_CSS / 2 : pose.loupeX ?? pose.ecranX, y: centre ? H_CSS / 2 : H_CSS * 0.45 }
  })
  const flashs = [
    ...Object.entries(FLASHS).map(([id, force]) => ({ instantS: plan.plans.find((p) => p.id === id).debutS, force })),
    ...plan.reperes.filter((r) => r.son === 'frappe').map((r) => ({ instantS: r.instantS, force: 0.35 })),
    { instantS: signature.debutS, force: 0.8 },
  ]
  return {
    dir: plan.dir, dureeS: plan.dureeS, tempsS: TEMPS_S, temps: tempsDeLaVideo().map((x) => Number(x.toFixed(4))), jeuS: premier('jeu').debutS,
    plans, blocs, citations: blocs[0].citations.map(({ id, debutS, finS }) => ({ id, debutS, finS })),
    coups, flashs,
    halos: [
      { x: 380, y: 160, r: 520, vx: 0.21, vy: 0.17, a: 0.55, couleur: 'radial-gradient(circle, rgba(129,140,248,0.9), transparent 70%)' },
      { x: 1540, y: 700, r: 600, vx: 0.15, vy: 0.23, a: 0.5, couleur: 'radial-gradient(circle, rgba(168,85,247,0.75), transparent 70%)' },
      { x: 960, y: 420, r: 420, vx: 0.27, vy: 0.11, a: 0.35, couleur: 'radial-gradient(circle, rgba(199,210,254,0.8), transparent 70%)' },
    ],
    signature: { debutS: signature.debutS, titre: signature.titre },
  }
}
