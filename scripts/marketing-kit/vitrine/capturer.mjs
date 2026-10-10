#!/usr/bin/env node
// Capture des VRAIS écrans en mode vitrine (#8855) — simulateurs dédiés, serveur injoignable.
//   node scripts/marketing-kit/vitrine/capturer.mjs --lang fr --appareil iphone,ipad --construire
//   node scripts/marketing-kit/vitrine/capturer.mjs --lang all --scene global
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { KIT_LANGS } from '../lib/locales.mjs'
import { CREDITS } from '../lib/photos.mjs'
import { pngInfo } from '../lib/png.mjs'
import { VITRINE } from '../templates/vitrine/plan.mjs'
import { exporterVitrine } from './fixtures.mjs'
import { DOSSIER_PHOTOS, fichierVoix, lireVoix, preparerAffiche, preparerVideo, synthetiser } from './medias.mjs'
import { SIMULATEURS, assurerSimulateur, barreDEtat, demarrer } from './simulateurs.mjs'

export const BUNDLE = 'me.meeshy.app'
export const HOTE_INJOIGNABLE = 'http://127.0.0.1:9'
export const DERIVED_DATA = '/Users/smpceo/Documents/Build-vitrine'
export const SORTIE_BRUTE = resolve(REPO_ROOT, 'scripts/marketing-kit/out/vitrine/brut')
export const TAILLES_NATIVES = { iphone: [1320, 2868], ipad: [2064, 2752] }

const LOCALES = { fr: 'fr_FR', en: 'en_US', es: 'es_ES', de: 'de_DE', it: 'it_IT', pt: 'pt_BR', ar: 'ar_SA' }
const LANGUES_APPLE = { pt: 'pt-BR' }

export const argumentsDeLancement = ({ scene, lang }) => [
  '-MeeshyVitrine', scene,
  '-AppleLanguages', `(${LANGUES_APPLE[lang] ?? lang})`,
  '-AppleLocale', LOCALES[lang],
  '-meeshy_selected_environment', 'custom',
  '-meeshy_custom_host', HOTE_INJOIGNABLE,
  // La demande d'autorisation des notifications attend le premier message envoyé : aucune alerte système à l'image.
  '-auth.signup.deferPushPermissionUntilFirstMessage', 'YES',
]

export const cheminBrut = ({ appareil, lang, scene }) => resolve(SORTIE_BRUTE, appareil, lang, `${scene}.png`)

// Les fixtures d'une langue, chaque vocal portant la durée et la taille MESURÉES de sa piste.
export const fixturesMesurees = ({ lang, maintenant, mesurer }) => {
  const provisoires = exporterVitrine({ lang, maintenant })
  const mesures = Object.fromEntries(provisoires.medias.filter((m) => m.genre === 'audio').map((m) => [m.url, mesurer(m)]))
  return exporterVitrine({ lang, maintenant, mesures })
}

// Les scènes qui montrent un fil daté : bulles, séparateurs de jour, liste de l'iPad.
const SANS_FIL = new Set(['lien', 'progression'])
export const montreUnFil = (scene) => !SANS_FIL.has(scene)

// Un fil qui traverse minuit se coupe en « Hier » et « Aujourd'hui », liste de l'iPad comprise ; l'app
// datant tout depuis son horloge, décaler les fixtures n'y peut rien. Rend le plus ancien instant
// montré qui tombe la veille, ou `null`.
export const veilleMontree = (f, maintenant) => {
  const jour = maintenant.toDateString()
  return [...f.conversations.map((c) => c.lastMessageAt), ...Object.values(f.messages).flat().map((m) => m.createdAt)]
    .map((iso) => new Date(iso))
    .filter((instant) => instant.toDateString() !== jour)
    .sort((a, b) => a - b)[0] ?? null
}

const heure = (instant) => instant.toTimeString().slice(0, 5)

// La scène « amour » annonce « prêt » après 1 s de lecture, et la photo tombe environ 3 s plus tard :
// une piste plus courte serait déjà finie, karaoké éteint.
export const DUREE_MIN_VOCAL_MS = 7000

// La piste que le Prisme joue au lecteur, si elle est trop courte pour tenir jusqu'à la photo.
export const vocalTropCourt = (f, lang) => {
  const { conversationId, messageId, attachmentId } = f.scenes.amour
  const piece = f.messages[conversationId].find((m) => m.id === messageId).attachments.find((a) => a.id === attachmentId)
  const dureeMs = piece.translations[lang]?.durationMs ?? piece.duration
  return dureeMs < DUREE_MIN_VOCAL_MS ? { lang, dureeMs } : null
}

// La source d'un média sur le Mac : la photo du kit, la vidéo du réel (téléchargée et réduite une fois), ou le vocal
// synthétisé. `video` est injectable : un test n'a rien à télécharger.
export const sourceDuMedia = (media, { video = preparerVideo, affiche = preparerAffiche } = {}) => {
  switch (media.genre) {
    case 'image': return media.affiche ? affiche(media.affiche) : resolve(DOSSIER_PHOTOS, CREDITS[media.photo].fichier)
    case 'video': return video(media.video)
    default: return fichierVoix(media)
  }
}

// Le fond d'une story se résout par `StoryBackgroundLayer.directURLIfAny` : face à l'hôte injoignable, une adresse
// relative n'y donne rien (`resolveMediaURL` refuse 127.0.0.1) et la story tourne sur sa roue d'attente. La photo de la
// story est donc servie à son fichier déposé dans le conteneur — la forme `file://` que le lecteur lit telle quelle, celle
// d'une story que son auteur vient de composer (#9904).
export const storiesServiesEnLocal = (fixtures, dossier) => ({
  ...fixtures,
  stories: (fixtures.stories ?? []).map((story) => ({
    ...story,
    media: story.media.map((m) => ({ ...m, fileUrl: pathToFileURL(resolve(dossier, 'medias', m.fileName)).href })),
  })),
})

const deposer = (fixtures, dossier) => {
  const medias = resolve(dossier, 'medias')
  rmSync(medias, { recursive: true, force: true })
  mkdirSync(medias, { recursive: true })
  for (const media of fixtures.medias) copyFileSync(sourceDuMedia(media), resolve(medias, media.fichier))
  writeFileSync(resolve(dossier, 'fixtures.json'), JSON.stringify(fixtures))
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

export const attendreLeSignal = async ({ existe, delaiMs = 120_000, pasMs = 500, maintenant = Date.now, dormir = pause, etiquette, signal = 'prêt' }) => {
  const limite = maintenant() + delaiMs
  while (!existe()) {
    if (maintenant() > limite) throw new Error(`${etiquette} : aucun signal « ${signal} » en ${delaiMs / 1000} s — l’app a-t-elle planté ?`)
    await dormir(pasMs)
  }
}

export const simctl = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' })

export const arreter = (udid) => {
  try {
    simctl('terminate', udid, BUNDLE)
  } catch {
    // l'app ne tournait pas
  }
}

export const construire = (udid) => {
  const r = spawnSync('./meeshy.sh', ['build'], {
    cwd: resolve(REPO_ROOT, 'apps/ios'),
    env: { ...process.env, MEESHY_DEVICE_ID: udid, MEESHY_DERIVED_DATA: DERIVED_DATA },
    stdio: 'inherit',
  })
  if (r.status !== 0) throw new Error('la construction de l’app a échoué')
  return resolve(DERIVED_DATA, 'Products/Debug-iphonesimulator/Meeshy.app')
}

// Prépare une scène : thème, app arrêtée, fixtures de la langue déposées, signal « prêt » effacé.
// Rend le dossier vitrine du conteneur, où l'app pose ses marqueurs.
export const preparerScene = ({ udid, lang, scene, theme, voix, etiquette, fil = montreUnFil(scene) }) => {
  simctl('ui', udid, 'appearance', theme === 'dark' ? 'dark' : 'light')
  arreter(udid)
  const dossier = resolve(simctl('get_app_container', udid, BUNDLE, 'data').trim(), 'Documents/vitrine')
  mkdirSync(dossier, { recursive: true })
  rmSync(resolve(dossier, 'pret.txt'), { force: true })
  const maintenant = new Date()
  const fixtures = fixturesMesurees({ lang, maintenant, mesurer: (media) => synthetiser(media, voix) })
  const veille = fil ? veilleMontree(fixtures, maintenant) : null
  if (veille) {
    const minuit = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
    const des = new Date(minuit.getTime() + (maintenant - veille) + 60_000)
    throw new Error(`${etiquette} : le fil traverserait minuit (un message de la veille à ${heure(veille)}) et se couperait en « Hier » et « Aujourd’hui » — capturer après ${heure(des)}`)
  }
  const court = scene === 'amour' ? vocalTropCourt(fixtures, lang) : null
  if (court) throw new Error(`${etiquette} : la piste ${court.lang} dure ${court.dureeMs} ms — elle serait finie avant la photo (minimum ${DUREE_MIN_VOCAL_MS} ms)`)
  deposer(storiesServiesEnLocal(fixtures, dossier), dossier)
  return dossier
}

const capturer = async ({ udid, appareil, lang, capture, voix }) => {
  const { scene, theme } = capture
  const etiquette = `${appareil}/${lang}/${scene}`
  const dossier = preparerScene({ udid, lang, scene, theme, voix, etiquette })
  simctl('launch', udid, BUNDLE, ...argumentsDeLancement({ scene, lang }))
  await attendreLeSignal({ existe: () => existsSync(resolve(dossier, 'pret.txt')), etiquette })
  await pause(1500)
  const sortie = cheminBrut({ appareil, lang, scene })
  mkdirSync(dirname(sortie), { recursive: true })
  simctl('io', udid, 'screenshot', '--type=png', sortie)
  arreter(udid)
  const { width, height } = pngInfo(readFileSync(sortie))
  const [w, h] = TAILLES_NATIVES[appareil]
  if (width !== w || height !== h) throw new Error(`${etiquette} : ${width}×${height}, attendu ${w}×${h}`)
  return sortie
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      lang: { type: 'string', default: 'fr' },
      appareil: { type: 'string', default: 'iphone,ipad' },
      scene: { type: 'string' },
      construire: { type: 'boolean', default: false },
    },
  })
  const langs = values.lang === 'all' ? KIT_LANGS : values.lang.split(',')
  const appareils = values.appareil.split(',')
  const udids = Object.fromEntries(appareils.map((a) => [a, assurerSimulateur(SIMULATEURS[a])]))
  for (const udid of Object.values(udids)) {
    demarrer(udid)
    barreDEtat(udid)
  }
  if (values.construire) {
    const app = construire(Object.values(udids)[0])
    for (const udid of Object.values(udids)) simctl('install', udid, app)
  }
  const scenes = values.scene?.split(',')
  const voix = lireVoix(execFileSync('say', ['-v', '?'], { encoding: 'utf8' }))
  for (const appareil of appareils) {
    for (const lang of langs) {
      for (const capture of VITRINE[appareil].captures.filter((c) => !scenes || scenes.includes(c.scene))) {
        console.log(`✓ ${await capturer({ udid: udids[appareil], appareil, lang, capture, voix })}`)
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erreur) => {
    console.error(`✗ ${erreur.message}`)
    process.exit(1)
  })
}
