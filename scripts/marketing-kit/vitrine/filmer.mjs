#!/usr/bin/env node
// Filme les scènes animées de la vitrine au simulateur (#9806) : célébrations du jeu, puis interactions.
//   node scripts/marketing-kit/vitrine/filmer.mjs --scene jeu-rang --langue fr --appareil iphone
//   node scripts/marketing-kit/vitrine/filmer.mjs --tout                       # toutes les scènes, 7 langues, iPhone puis iPad
//   node scripts/marketing-kit/vitrine/filmer.mjs --scene jeu-coffre --langue all --format appstore
//
// Une prise : la scène est lancée, l'enregistreur démarre dès « prêt » (il démarre en retard : la scène
// doit laisser au moins la marge avant entre « prêt » et l'action), les gestes éventuels se jouent, les
// marqueurs de l'app bornent l'action. La vidéo du simulateur est à cadence VARIABLE : elle est
// ré-échantillonnée à 30 i/s, rognée aux bornes (+ marges), et chaque image de la fenêtre de mouvement
// est comparée à la précédente — une image répétée est une image perdue, la prise est refaite.
// Sorties : out/<famille>/<appareil>/<langue>/<scene>.mp4, <scene>/<image clé>.png, <scene>.rapport.json.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { KIT_LANGS } from '../lib/locales.mjs'
import { pngInfo } from '../lib/png.mjs'
import { BUNDLE, TAILLES_NATIVES, argumentsDeLancement, arreter, attendreLeSignal, construire, preparerScene, simctl } from './capturer.mjs'
import { lireVoix } from './medias.mjs'
import { SCENES_FILMEES } from './scenes-filmees.mjs'
import { SIMULATEURS, assurerSimulateur, barreDEtat, demarrer } from './simulateurs.mjs'

export const FPS = 30
// Entre « Recording started » et le premier geste : l'enregistreur rate sinon le début du mouvement.
export const AVANCE_MS = 2500
export const TAILLES_APPSTORE = { iphone: [886, 1920], ipad: [1200, 1600] }
export const SORTIE = resolve(REPO_ROOT, 'scripts/marketing-kit/out')
export const APPAREILS = ['iphone', 'ipad']

const TYPES_DE_GESTE = new Set(['tap', 'swipe', 'attendre', 'fichier'])
const entier = (v) => Number.isInteger(v)

// ── Plan de prise ─────────────────────────────────────────────────────────────────────────────

const verifierGeste = (scene, geste) => {
  if (!TYPES_DE_GESTE.has(geste.type)) throw new Error(`${scene} : geste inconnu « ${geste.type} »`)
  const points = geste.type === 'tap' ? [geste.x, geste.y] : geste.type === 'swipe' ? [...geste.de, ...geste.a] : []
  if (!points.every(entier)) throw new Error(`${scene} : un geste ${geste.type} exige des coordonnées ENTIÈRES en points (idb les refuse sinon)`)
}

export const planDePrise = ({ scene, appareil, scenes = SCENES_FILMEES }) => {
  const decl = scenes[scene]
  if (!decl) throw new Error(`scène filmée inconnue « ${scene} » — connues : ${Object.keys(scenes).join(', ')}`)
  if (!APPAREILS.includes(appareil)) throw new Error(`appareil inconnu « ${appareil} »`)
  if (!decl.debut?.marqueur && !Number.isFinite(decl.debut?.apresGestesMs)) throw new Error(`${scene} : le début se déclare par un marqueur ou par apresGestesMs`)
  if (!decl.fin?.marqueur && !(decl.dureeMs > 0)) throw new Error(`${scene} : sans marqueur de fin, la durée (dureeMs) borne l'action`)
  for (const fenetre of decl.mouvement) {
    const [debut, fin] = Array.isArray(fenetre) ? fenetre : [fenetre.de, fenetre.a]
    if (!Array.isArray(fenetre) && !(typeof fenetre.etape === 'string' && fenetre.etape)) {
      throw new Error(`${scene} : une fenêtre ancrée nomme son étape ({ etape, de, a })`)
    }
    if (!(debut < fin)) throw new Error(`${scene} : fenêtre de mouvement vide [${debut}, ${fin}]`)
  }
  const gestes = decl.gestes?.[appareil] ?? []
  for (const geste of gestes) verifierGeste(scene, geste)
  return { ...decl, gestes }
}

export const marqueursDe = (plan) => [plan.debut.marqueur, plan.fin?.marqueur].filter(Boolean)

// Les étapes que l'app date en cours d'action (`etape-<nom>.txt`, #9810) : une fenêtre de mouvement s'y ancre quand
// l'instant de son animation dépend du rendu d'un écran — le choix d'un émoji une fois le menu montré, par exemple.
export const ETAPE = (nom) => `etape-${nom}.txt`
// L'étape VIRTUELLE « mouvement » : la première image qui change après le début de l'action, lue dans le film même. Une
// célébration du jeu part quand l'état servi est RENDU, et ce rendu tarde avec la charge de la machine (0,05 s au repos,
// 0,5 s pendant un build voisin) : ancrée sur son premier mouvement, sa fenêtre ne dépend plus de cette latence.
export const MOUVEMENT = 'mouvement'
const etapesNommees = (plan) => [...new Set([
  ...plan.mouvement.filter((f) => !Array.isArray(f)).map((f) => f.etape),
  ...plan.imagesCles.filter((i) => i.etape).map((i) => i.etape),
])]
export const etapesDe = (plan) => etapesNommees(plan).filter((nom) => nom !== MOUVEMENT)
export const ancreSurLeMouvement = (plan) => etapesNommees(plan).includes(MOUVEMENT)

// En ms d'action, l'instant de la première image qui diffère de la précédente, à partir du début de l'action.
export const premierMouvement = ({ empreintes, origineMs, fps = FPS }) => {
  const i = empreintes.findIndex((e, k) => k > 0 && (k * 1000) / fps >= origineMs && e !== empreintes[k - 1])
  return i < 0 ? null : Math.round((i * 1000) / fps - origineMs)
}

// L'instant d'une image clé en ms d'action : depuis le début de l'action, ou depuis son étape (`etapes` en ms d'action).
export const instantDeLImage = ({ image, etapes }) => {
  if (!image.etape) return image.instantMs
  if (!Number.isFinite(etapes[image.etape])) throw new Error(`l'app n'a pas daté l'étape « ${image.etape} » de l'image clé ${image.nom}`)
  return etapes[image.etape] + image.instantMs
}

// Les fenêtres en ms depuis le début de l'action : une fenêtre ancrée se décale de l'instant de son étape.
export const fenetresDeMouvement = ({ mouvement, etapesMs, debutActionMs }) => mouvement.map((fenetre) => {
  if (Array.isArray(fenetre)) return fenetre
  const instant = etapesMs[fenetre.etape]
  if (!Number.isFinite(instant)) {
    throw new Error(fenetre.etape === MOUVEMENT
      ? 'aucune image ne bouge après le début de l’action : la scène ne joue pas, ou hors du film'
      : `l'app n'a pas daté l'étape « ${fenetre.etape} » (${ETAPE(fenetre.etape)})`)
  }
  const decalage = Math.round(instant - debutActionMs)
  return [decalage + fenetre.de, decalage + fenetre.a]
})

export const commandeDeGeste = ({ geste, udid }) => {
  switch (geste.type) {
    case 'tap':
      return { idb: ['ui', 'tap', '--udid', udid, String(geste.x), String(geste.y)] }
    case 'swipe':
      return { idb: ['ui', 'swipe', '--udid', udid, ...[...geste.de, ...geste.a].map(String), '--duration', String(geste.dureeS ?? 0.3)] }
    case 'attendre':
      return { attendreMs: geste.ms }
    case 'fichier':
      return { fichier: geste.nom }
    default:
      throw new Error(`geste inconnu « ${geste.type} »`)
  }
}

// ── Chemins ───────────────────────────────────────────────────────────────────────────────────

export const cheminsDePrise = ({ famille, appareil, langue, scene, racine = SORTIE }) => {
  const dossier = resolve(racine, famille, appareil, langue)
  return {
    dossier,
    source: resolve(racine, famille, 'brut', appareil, langue, `${scene}.mov`),
    clip: resolve(dossier, `${scene}.mp4`),
    appstore: resolve(dossier, `${scene}.appstore.mp4`),
    images: resolve(dossier, scene),
    image: (nom) => resolve(dossier, scene, `${nom}.png`),
    rapport: resolve(dossier, `${scene}.rapport.json`),
  }
}

// ── Bornes et rognage ─────────────────────────────────────────────────────────────────────────

const secondes = (ms) => Math.round(ms) / 1000

// Les instants sont des horloges murales (ms) : le « Recording started » de l'enregistreur et la date
// d'écriture des marqueurs. Rend l'action et le rognage en secondes de la vidéo source.
export const bornesDeLaPrise = ({ debutEnregistrementMs, debutActionMs, finActionMs, marges }) => {
  const avance = debutActionMs - debutEnregistrementMs
  if (avance < marges.avantMs) {
    throw new Error(`l'action a démarré ${Math.round(avance)} ms après l'enregistreur, il en faut au moins ${marges.avantMs} — la scène doit attendre davantage après « prêt »`)
  }
  if (!(finActionMs > debutActionMs)) throw new Error('la fin de l’action précède son début')
  const debutS = secondes(avance)
  const finS = secondes(finActionMs - debutEnregistrementMs)
  return {
    action: { debutS, finS },
    rognage: { debutS: secondes(avance - marges.avantMs), finS: secondes(finActionMs - debutEnregistrementMs + marges.apresMs) },
  }
}

// Cadence fixe AVANT le rognage : la source commence à 0, donc chaque instant du rognage a son image,
// même quand l'écran ne changeait pas (la capture n'émet une image qu'à chaque changement). `tpad`
// prolonge la dernière image pour que la marge après existe encore si l'écran s'est figé.
export const filtreCadenceFixe = ({ debutS, finS, fps = FPS }) =>
  `fps=${fps},tpad=stop_mode=clone:stop_duration=${finS},trim=start=${debutS}:end=${finS},setpts=PTS-STARTPTS`

export const argumentsEmpreintes = ({ source, rognage }) =>
  ['-v', 'error', '-i', source, '-vf', filtreCadenceFixe(rognage), '-an', '-f', 'framemd5', '-']

export const argumentsClip = ({ source, rognage, sortie }) => [
  '-y', '-v', 'error', '-i', source, '-vf', filtreCadenceFixe(rognage), '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', sortie,
]

export const argumentsImage = ({ source, instantS, sortie }) =>
  ['-y', '-v', 'error', '-i', source, '-vf', filtreCadenceFixe({ debutS: instantS, finS: instantS + 2 / FPS }), '-frames:v', '1', sortie]

// Le format des aperçus App Store depuis le clip natif : remplir puis rogner au centre (iPhone 1320×2868
// → 886×1920 rogne 6 px de large ; iPad 2064×2752 → 1200×1600 est homothétique). Piste stéréo muette :
// un aperçu App Store porte une piste audio.
export const argumentsAppStore = ({ clip, appareil, sortie }) => {
  const [w, h] = TAILLES_APPSTORE[appareil]
  return [
    '-y', '-v', 'error', '-i', clip, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', sortie,
  ]
}

// ── Vérification image par image ──────────────────────────────────────────────────────────────

export const lireEmpreintes = (texte) =>
  texte.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').at(-1).trim())

// Une image identique à la précédente, dans une fenêtre où la chorégraphie bouge, est une image perdue.
// `origineMs` : instant du début de l'action dans le clip. Rend les séquences figées, en ms d'action.
export const imagesFigees = ({ empreintes, origineMs, fenetres, fps = FPS }) => {
  const dansLeMouvement = (ms) => fenetres.some(([debut, fin]) => ms >= debut && ms <= fin)
  const repetees = empreintes
    .map((e, i) => ({ i, ms: Math.round((i * 1000) / fps - origineMs), repetee: i > 0 && e === empreintes[i - 1] }))
    .filter(({ ms, repetee }) => repetee && dansLeMouvement(ms))
  return repetees.reduce((sequences, { i, ms }) => {
    const derniere = sequences.at(-1)
    if (derniere && derniere.derniereImage === i - 1) {
      return [...sequences.slice(0, -1), { ...derniere, finMs: ms, images: derniere.images + 1, derniereImage: i }]
    }
    return [...sequences, { debutMs: ms, finMs: ms, images: 1, derniereImage: i }]
  }, []).map(({ debutMs, finMs, images }) => ({ debutMs, finMs, images }))
}

// ── Sélection ─────────────────────────────────────────────────────────────────────────────────

const liste = (valeur) => valeur.split(',').map((v) => v.trim()).filter(Boolean)

export const selectionner = ({ tout = false, scene, langue, appareil, scenes = SCENES_FILMEES }) => {
  if (!tout && !scene) throw new Error('préciser --scene <nom> ou --tout')
  const choisies = tout && !scene ? Object.keys(scenes) : liste(scene)
  const langues = (tout && !langue) || langue === 'all' ? KIT_LANGS : liste(langue ?? 'fr')
  const appareils = tout && !appareil ? APPAREILS : liste(appareil ?? 'iphone')
  for (const s of choisies) if (!scenes[s]) throw new Error(`scène filmée inconnue « ${s} » — connues : ${Object.keys(scenes).join(', ')}`)
  for (const l of langues) if (!KIT_LANGS.includes(l)) throw new Error(`langue inconnue « ${l} » — connues : ${KIT_LANGS.join(', ')}`)
  for (const a of appareils) if (!APPAREILS.includes(a)) throw new Error(`appareil inconnu « ${a} »`)
  return { scenes: choisies, langues, appareils }
}

// ── Prise réelle ──────────────────────────────────────────────────────────────────────────────

const pause = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)))

const ffmpeg = (args) => execFileSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const sonde = (fichier) => {
  const sortie = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'json', fichier], { encoding: 'utf8' })
  const { width, height, r_frame_rate: cadence, nb_read_frames: images } = JSON.parse(sortie).streams[0]
  return { width, height, cadence, images: Number(images) }
}

const demarrerEnregistrement = ({ udid, sortie }) => new Promise((resoudre, rejeter) => {
  mkdirSync(dirname(sortie), { recursive: true })
  const p = spawn('xcrun', ['simctl', 'io', udid, 'recordVideo', '--codec=h264', '--force', sortie])
  const fin = new Promise((r) => p.on('exit', r))
  const delai = setTimeout(() => { p.kill('SIGINT'); rejeter(new Error('l’enregistreur n’a pas démarré en 15 s')) }, 15_000)
  p.stderr.on('data', (d) => {
    if (!String(d).includes('Recording started')) return
    clearTimeout(delai)
    resoudre({ debutMs: Date.now(), arreter: async () => { p.kill('SIGINT'); await fin } })
  })
  p.on('error', rejeter)
})

const attendreMarqueur = async ({ dossier, nom, delaiMs, etiquette }) => {
  const chemin = resolve(dossier, nom)
  await attendreLeSignal({ existe: () => existsSync(chemin), delaiMs, pasMs: 50, etiquette, signal: nom })
  return statSync(chemin).mtimeMs
}

const jouerGeste = async ({ geste, udid, dossier }) => {
  const commande = commandeDeGeste({ geste, udid })
  if (commande.idb) execFileSync('idb', commande.idb)
  if (commande.attendreMs) await pause(commande.attendreMs)
  if (commande.fichier) writeFileSync(resolve(dossier, commande.fichier), String(Date.now()))
}

const tourner = async ({ udid, appareil, langue, plan, voix, chemins, etiquette }) => {
  const dossier = preparerScene({ udid, lang: langue, scene: plan.scene, theme: plan.theme, voix, etiquette, fil: plan.montreUnFil })
  for (const nom of [...marqueursDe(plan), ...etapesDe(plan).map(ETAPE)]) rmSync(resolve(dossier, nom), { force: true })
  simctl('launch', udid, BUNDLE, ...argumentsDeLancement({ scene: plan.scene, lang: langue }))
  await attendreLeSignal({ existe: () => existsSync(resolve(dossier, 'pret.txt')), pasMs: 100, etiquette })
  const enregistreur = await demarrerEnregistrement({ udid, sortie: chemins.source })
  try {
    if (plan.gestes.length) await pause(AVANCE_MS)
    for (const geste of plan.gestes) await jouerGeste({ geste, udid, dossier })
    const debutActionMs = plan.debut.marqueur
      ? await attendreMarqueur({ dossier, nom: plan.debut.marqueur, delaiMs: 30_000, etiquette })
      : Date.now() + plan.debut.apresGestesMs
    const finActionMs = plan.fin?.marqueur
      ? await attendreMarqueur({ dossier, nom: plan.fin.marqueur, delaiMs: (plan.dureeMs ?? 0) + 30_000, etiquette })
      : debutActionMs + plan.dureeMs
    await pause(finActionMs + plan.marges.apresMs + 300 - Date.now())
    const etapesMs = Object.fromEntries(etapesDe(plan)
      .map((nom) => [nom, resolve(dossier, ETAPE(nom))])
      .filter(([, chemin]) => existsSync(chemin))
      .map(([nom, chemin]) => [nom, statSync(chemin).mtimeMs]))
    return { debutEnregistrementMs: enregistreur.debutMs, debutActionMs, finActionMs, etapesMs }
  } finally {
    await enregistreur.arreter()
    arreter(udid)
  }
}

const livrer = ({ appareil, plan, chemins, bornes, formats, etapes }) => {
  mkdirSync(chemins.images, { recursive: true })
  ffmpeg(argumentsClip({ source: chemins.source, rognage: bornes.rognage, sortie: chemins.clip }))
  const clip = sonde(chemins.clip)
  const [w, h] = TAILLES_NATIVES[appareil]
  if (clip.width !== w || clip.height !== h) throw new Error(`clip ${clip.width}×${clip.height}, attendu ${w}×${h}`)
  const images = plan.imagesCles.map((image) => {
    const sortie = chemins.image(image.nom)
    const instantMs = instantDeLImage({ image, etapes })
    ffmpeg(argumentsImage({ source: chemins.source, instantS: bornes.action.debutS + instantMs / 1000, sortie }))
    const { width, height } = pngInfo(readFileSync(sortie))
    if (width !== w || height !== h) throw new Error(`image clé ${image.nom} : ${width}×${height}, attendu ${w}×${h}`)
    return sortie
  })
  if (formats.includes('appstore')) ffmpeg(argumentsAppStore({ clip: chemins.clip, appareil, sortie: chemins.appstore }))
  return { clip: chemins.clip, sonde: clip, images, appstore: formats.includes('appstore') ? chemins.appstore : null }
}

export const filmer = async ({ udid, appareil, langue, scene, voix, essais = 3, formats = [] }) => {
  const plan = planDePrise({ scene, appareil })
  const chemins = cheminsDePrise({ famille: plan.famille, appareil, langue, scene })
  mkdirSync(chemins.dossier, { recursive: true })
  const prises = []
  const consigner = (prise) => {
    prises.push(prise)
    writeFileSync(chemins.rapport, `${JSON.stringify({ scene, appareil, langue, prises }, null, 2)}\n`)
  }
  for (let essai = 1; essai <= essais; essai += 1) {
    const etiquette = `${appareil}/${langue}/${scene} (prise ${essai})`
    const { etapesMs: datees, ...horloges } = await tourner({ udid, appareil, langue, plan, voix, chemins, etiquette })
    const bornes = bornesDeLaPrise({ ...horloges, marges: plan.marges })
    const empreintes = lireEmpreintes(ffmpeg(argumentsEmpreintes({ source: chemins.source, rognage: bornes.rognage })))
    const origineMs = Math.round((bornes.action.debutS - bornes.rognage.debutS) * 1000)
    const mouvementMs = ancreSurLeMouvement(plan) ? premierMouvement({ empreintes, origineMs }) : null
    const etapesMs = mouvementMs === null ? datees : { ...datees, [MOUVEMENT]: horloges.debutActionMs + mouvementMs }
    const fenetres = fenetresDeMouvement({ mouvement: plan.mouvement, etapesMs, debutActionMs: horloges.debutActionMs })
    const etapes = Object.fromEntries(Object.entries(etapesMs).map(([nom, ms]) => [nom, Math.round(ms - horloges.debutActionMs)]))
    const figees = imagesFigees({ empreintes, origineMs, fenetres })
    const mesure = { essai, horloges, bornes, etapes, fenetres, images: empreintes.length, dureeActionMs: Math.round(horloges.finActionMs - horloges.debutActionMs), figees }
    if (figees.length) {
      consigner({ ...mesure, statut: 'refaite' })
      console.log(`↻ ${etiquette} : ${figees.reduce((n, f) => n + f.images, 0)} image(s) perdue(s) — prise refaite`)
      continue
    }
    const livraison = livrer({ appareil, plan, chemins, bornes, formats, etapes })
    consigner({ ...mesure, statut: 'livree', ...livraison })
    return livraison
  }
  throw new Error(`${appareil}/${langue}/${scene} : ${essais} prises saccadées — rien n'est livré (rapport : ${chemins.rapport})`)
}

const simulateursDemarres = () =>
  Object.values(JSON.parse(simctl('list', 'devices', 'booted', '-j')).devices).flat().map((d) => ({ udid: d.udid, nom: d.name }))

const main = async () => {
  const { values } = parseArgs({
    options: {
      scene: { type: 'string' },
      langue: { type: 'string' },
      appareil: { type: 'string' },
      tout: { type: 'boolean', default: false },
      format: { type: 'string', default: 'natif' },
      essais: { type: 'string', default: '3' },
      construire: { type: 'boolean', default: false },
    },
  })
  for (const outil of ['ffmpeg', 'ffprobe', 'idb']) {
    if (spawnSync('which', [outil]).status !== 0) throw new Error(`${outil} est introuvable (brew install ${outil === 'idb' ? 'facebook/fb/idb-companion' : 'ffmpeg'})`)
  }
  const { scenes, langues, appareils } = selectionner(values)
  const formats = liste(values.format)
  const voix = lireVoix(execFileSync('say', ['-v', '?'], { encoding: 'utf8' }))
  for (const appareil of appareils) {
    const udid = assurerSimulateur(SIMULATEURS[appareil])
    const autres = simulateursDemarres().filter((s) => s.udid !== udid)
    if (autres.length) console.warn(`⚠ d'autres simulateurs tournent (${autres.map((s) => s.nom).join(', ')}) : une prise partage le processeur avec eux`)
    const dejaDemarre = simulateursDemarres().some((s) => s.udid === udid)
    demarrer(udid)
    barreDEtat(udid)
    if (values.construire) {
      if (spawnSync('pgrep', ['-x', 'xcodebuild']).status === 0) throw new Error('un autre build xcodebuild tourne : attendre sa fin (builds en série)')
      simctl('install', udid, construire(udid))
    }
    try {
      for (const langue of langues) {
        for (const scene of scenes) {
          const { clip, images } = await filmer({ udid, appareil, langue, scene, voix, essais: Number(values.essais), formats })
          console.log(`✓ ${clip} (+ ${images.length} image(s) clé(s))`)
        }
      }
    } finally {
      if (!dejaDemarre) simctl('shutdown', udid)
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erreur) => {
    console.error(`✗ ${erreur.message}`)
    process.exit(1)
  })
}
