#!/usr/bin/env node
// Monte les aperçus vidéo App Store (#9807) et les visuels créatifs de la fiche (#9811) à partir des prises
// de la vitrine (filmer.mjs, #9806 / #9810).
//   node scripts/marketing-kit/vitrine/monter.mjs                         # tout : 7 langues, iPhone et iPad
//   node scripts/marketing-kit/vitrine/monter.mjs --langue fr --appareil iphone --quoi apercus --apercu jeu
//   node scripts/marketing-kit/vitrine/monter.mjs --musique silence       # ou --musique <fichier> --licence "…"
//   node scripts/marketing-kit/vitrine/monter.mjs --deposer               # + copie dans apps/ios/fastlane/metadata
//   node scripts/marketing-kit/vitrine/monter.mjs --verifier              # relit les sorties existantes
//
// Sorties : scripts/marketing-kit/out/appstore/<locale>/previews/<IPHONE_67|IPAD_PRO_3GEN_129>/0n-….mp4,
// …/product_page_header/01-entete.{mp4,png}, …/search_results/01-recherche.png, et rapport.json. Chaque
// fichier est contrôlé par ffprobe contre la spécification Apple de son emplacement ; un écart fait échouer
// la commande et bloque --deposer.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { controler } from '../lib/conformite.mjs'
import { KIT_LANGS, directionOf } from '../lib/locales.mjs'
import { LICENCE_MUSIQUE, synthetiser, wav } from '../lib/musique.mjs'
import { SOUS_TITRES_CREATIFS } from '../textes/apercus.mjs'
import { LEGENDES } from '../textes/legendes.mjs'
import {
  APERCUS, APPAREILS_APERCU, CARTES_CREATIVES, FASTLANE_METADATA, SORTIE_APPSTORE, apercuDe, cheminsAppStore, decalageCarte, dispositionApercu, dispositionCreatif, familleDe, planDeMontage,
} from './apercus.mjs'
import { FPS, SORTIE, cheminsDePrise } from './filmer.mjs'
import { ROGNAGE_HAUT, ZOOM_MS, cadrageDe, fenetreCible, filtreCamera, largeurMinimale, rectAuClip } from './cadrages.mjs'
import { TAILLES_NATIVES } from './capturer.mjs'
import { argumentsApercu, argumentsCreatif, argumentsMasque, argumentsVoile } from './montage.mjs'
import { SCENES_FILMEES } from './scenes-filmees.mjs'
import { deposer } from './monter-depot.mjs'
import { pageCadreApercu, pageFin, pageFondCreatif } from './surimpressions.mjs'

const ffmpeg = (args) => execFileSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

// Images (comptées, pas déduites de la durée) et taille d'un clip.
export const sonderClip = (chemin) => {
  const sortie = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames,width,height', '-of', 'json', chemin], { encoding: 'utf8' })
  const { nb_read_frames: images, width: largeur, height: hauteur } = JSON.parse(sortie).streams[0]
  return { images: Number(images), largeur, hauteur }
}

export const imagesDuClip = (chemin) => sonderClip(chemin).images

// Les clips tournés d'un aperçu, pour un appareil et une langue : { [scene]: { chemin, images, largeur, hauteur } }.
export const clipsTournes = ({ apercu, appareil, lang, source = SORTIE, sonder = sonderClip }) =>
  Object.fromEntries(apercu.plans.flatMap((plan) => {
    const { clip } = cheminsDePrise({ famille: familleDe(plan), appareil, langue: lang, scene: plan.scene, racine: source })
    return existsSync(clip) ? [[plan.scene, { chemin: clip, ...sonder(clip) }]] : []
  }))

// Le mouvement de caméra d'un plan dont la scène a un cadrage : plein écran pendant la marge d'avant
// l'action, puis zoom vers la fenêtre qui contient le rectangle d'intérêt — dans l'image rognée de sa barre
// d'état, au rapport de cette image.
export const cameraDuPlan = ({ scene, appareil, langue, clip, rognageHaut }) => {
  const rect = cadrageDe({ scene, appareil, langue })
  if (!rect) return null
  const natif = [clip.largeur, clip.hauteur - rognageHaut]
  const arrivee = fenetreCible({
    rect: rectAuClip({ rect, appareil, largeurClip: clip.largeur, rognageHaut: ROGNAGE_HAUT[appareil] }),
    natif,
    rapport: natif[0] / natif[1],
    largeurMin: largeurMinimale({ largeurClip: clip.largeur }),
  })
  return filtreCamera({ arrivee, natif, debutS: (SCENES_FILMEES[scene]?.marges.avantMs ?? 600) / 1000, dureeS: ZOOM_MS / 1000, fps: FPS })
}

// La barre d'état rognée, en px du clip, paire (yuv420p).
export const rognageDuClip = ({ appareil, largeurClip }) =>
  2 * Math.round((ROGNAGE_HAUT[appareil] * largeurClip) / TAILLES_NATIVES[appareil][0] / 2)

const ecrire = (chemin, contenu) => {
  mkdirSync(dirname(chemin), { recursive: true })
  writeFileSync(chemin, contenu)
  return chemin
}

// `musique` : 'generee' | 'silence' | chemin d'un fichier audio (dont la licence est notée au rapport).
const pisteAudio = ({ musique, images, dossier }) => {
  if (musique === 'silence') return { silence: true }
  if (musique === 'generee') return { wav: ecrire(resolve(dossier, 'musique.wav'), wav(synthetiser({ dureeS: images / FPS + 0.2 }))) }
  return { wav: musique, fondu: true }
}

export const monterApercu = async ({ apercu, appareil, lang, source, racine, rendre, musique = 'generee', preset = 'slow', sonder = sonderClip }) => {
  const clips = clipsTournes({ apercu, appareil, lang, source, sonder })
  const plan = planDeMontage({ apercu, lang, clips })
  const base = { type: 'apercu', lang, appareil, apercu: apercu.id, spec: APPAREILS_APERCU[appareil].spec }
  if (plan.statut !== 'pret') return { ...base, statut: 'incomplet', manquants: plan.manquants }
  const chemins = cheminsAppStore({ lang, racine })
  const dossier = resolve(chemins.travail, appareil, apercu.id)
  const premier = Object.values(clips)[0]
  const disposition = dispositionApercu({ appareil, natif: [premier.largeur, premier.hauteur], rognageHaut: rognageDuClip({ appareil, largeurClip: premier.largeur }) })
  const { largeur, hauteur, ecran } = disposition
  // Le masque des coins arrondis, et le voile de bord d'un écran zoomé (le texte tranché s'estompe).
  const masque = resolve(dossier, 'masque.png')
  const voile = resolve(dossier, 'voile.png')
  mkdirSync(dossier, { recursive: true })
  ffmpeg(argumentsMasque({ largeur: ecran.largeur, hauteur: ecran.hauteur, rayon: ecran.rayon, sortie: masque }))
  ffmpeg(argumentsVoile({ largeur: ecran.largeur, hauteur: ecran.hauteur, fondu: Math.round(ecran.largeur * 0.06), sortie: voile }))
  const segments = await Promise.all(plan.segments.map(async (seg, i) => {
    if (seg.type !== 'clip') return { ...seg, carte: ecrire(resolve(dossier, 'fin.png'), await rendre(pageFin({ ...plan.fin, lang, largeur, hauteur }))) }
    const clip = clips[seg.scene]
    const rognageHaut = rognageDuClip({ appareil, largeurClip: clip.largeur })
    const camera = cameraDuPlan({ scene: seg.scene, appareil, langue: lang, clip, rognageHaut })
    const cadre = ecrire(resolve(dossier, `cadre-${i}.png`), await rendre(pageCadreApercu({ texte: seg.legende, lang, disposition })))
    return { ...seg, camera, rognageHaut, cadre, masque, voile: camera ? voile : null }
  }))
  const chemin = chemins.apercu(appareil, apercu.fichier)
  mkdirSync(dirname(chemin), { recursive: true })
  const audio = pisteAudio({ musique, images: plan.images, dossier })
  ffmpeg(argumentsApercu({ segments, disposition, audio, sortie: chemin, preset }).args)
  return {
    ...base,
    statut: 'pret',
    chemin,
    dureeS: plan.dureeS,
    plans: segments.map((s) => (s.type === 'clip' ? { scene: s.scene, legende: s.legende, secondes: s.images / FPS, cadre: Boolean(s.camera) } : { fin: plan.fin, secondes: s.images / FPS })),
    ecartes: plan.ecartes,
  }
}

// Chaque carte prend sa première source présente : une prise de la vitrine (image clé iPhone et, s'il existe,
// son clip) ou une capture d'écran filmée (`capture`, une image tirée à `instantS`, le clip lu dès `debutClipS`),
// cherchée sous `racineCaptures` (Marketing/ n'est pas dans le dépôt : elle vit sur le poste du tournage).
export const cartesTournees = ({ lang, source = SORTIE, racineCaptures = REPO_ROOT }) => {
  const resolues = CARTES_CREATIVES.map((carte) => {
    const trouvee = carte.sources.map((s) => {
      if (s.capture) {
        const capture = resolve(racineCaptures, s.capture.replace('{lang}', lang))
        return { ...s, present: existsSync(capture), image: null, clip: capture }
      }
      const c = cheminsDePrise({ famille: s.famille, appareil: 'iphone', langue: lang, scene: s.scene, racine: source })
      return { ...s, present: existsSync(c.image(s.image)), image: c.image(s.image), clip: existsSync(c.clip) ? c.clip : null }
    }).find((s) => s.present)
    return { carte, trouvee }
  })
  const manquants = resolues.filter((r) => !r.trouvee && !r.carte.facultative).map((r) => r.carte.sources[0])
  return {
    manquants: manquants.map((s) => `${s.scene}/${s.image}.png`),
    cartes: resolues.filter((r) => r.trouvee).map(({ carte, trouvee }) => ({
      id: carte.id, ancre: carte.ancre ?? 'haut', image: trouvee.image, clip: trouvee.clip,
      ...(trouvee.capture ? { instantS: trouvee.instantS, debutClipS: trouvee.debutClipS } : {}),
    })),
  }
}

export const monterCreatifs = async ({ lang, source, racine, rendre, preset = 'slow', compter = imagesDuClip, racineCaptures = REPO_ROOT }) => {
  const trouvees = cartesTournees({ lang, source, racineCaptures })
  const base = [{ type: 'entete', forme: 'image', spec: 'entete-image' }, { type: 'entete', forme: 'video', spec: 'entete-video' }, { type: 'recherche', forme: 'image', spec: 'recherche-image' }]
    .map((b) => ({ ...b, lang }))
  if (trouvees.manquants.length) return base.map((b) => ({ ...b, statut: 'incomplet', manquants: trouvees.manquants }))
  const chemins = cheminsAppStore({ lang, racine })
  const dossier = resolve(chemins.travail, 'creatifs')
  mkdirSync(dossier, { recursive: true })
  // L'image d'une capture filmée est tirée à son instant, plein cadre.
  const cartes = trouvees.cartes.map((c) => {
    if (c.image) return c
    const image = resolve(dossier, `${c.id}.png`)
    ffmpeg(['-y', '-v', 'error', '-ss', c.instantS.toFixed(3), '-i', c.clip, '-frames:v', '1', image])
    return { ...c, image }
  })
  const dir = directionOf(lang)
  const fabriquer = async (format) => {
    const disposition = dispositionCreatif({ format, nombre: cartes.length, dir })
    const fond = ecrire(resolve(dossier, `${format}-fond.png`), await rendre(pageFondCreatif({ titre: LEGENDES.L2[lang], sousTitre: SOUS_TITRES_CREATIFS[format][lang], lang, disposition })))
    const c0 = disposition.cartes[0]
    const masque = resolve(dossier, `${format}-masque.png`)
    ffmpeg(argumentsMasque({ largeur: c0.largeur, hauteur: c0.hauteur, rayon: c0.rayon, sortie: masque }))
    const placees = disposition.cartes.map((rect, i) => ({
      ...rect, ...cartes[i], masque, decalage: decalageCarte({ carte: rect, hauteurVisuel: disposition.hauteur, ancre: cartes[i].ancre }),
    }))
    return { disposition, fond, placees }
  }
  const entete = await fabriquer('entete')
  mkdirSync(dirname(chemins.enteteImage), { recursive: true })
  ffmpeg(argumentsCreatif({ fond: entete.fond, largeur: entete.disposition.largeur, hauteur: entete.disposition.hauteur, cartes: entete.placees, sortie: chemins.enteteImage }))
  // En-tête animé : les clips entrent l'un après l'autre (0,45 s d'écart), tiennent leur image finale, puis
  // tout revient au fond — la boucle d'Apple reprend sans saut. Une capture filmée joue jusqu'à la fin.
  const animees = entete.placees.map((c, i) => (c.clip ? { ...c, debutS: 0.3 + i * 0.45 } : c))
  const dureeClip = (c) => (c.debutClipS ? 0 : compter(c.clip) / FPS)
  const finS = Math.max(...animees.map((c) => (c.clip ? c.debutS + dureeClip(c) : 0)))
  const dureeS = Math.min(15, Math.max(6, Math.ceil(finS + 1.5)))
  ffmpeg(argumentsCreatif({ fond: entete.fond, largeur: entete.disposition.largeur, hauteur: entete.disposition.hauteur, cartes: animees, video: { dureeS }, sortie: chemins.enteteVideo, preset }))
  const recherche = await fabriquer('recherche')
  mkdirSync(dirname(chemins.recherche), { recursive: true })
  ffmpeg(argumentsCreatif({ fond: recherche.fond, largeur: recherche.disposition.largeur, hauteur: recherche.disposition.hauteur, cartes: recherche.placees, sortie: chemins.recherche }))
  const fichiers = { 'entete-image': chemins.enteteImage, 'entete-video': chemins.enteteVideo, 'recherche-image': chemins.recherche }
  return base.map((b) => ({ ...b, statut: 'pret', chemin: fichiers[b.spec], cartes: cartes.map((c) => c.id), ...(b.spec === 'entete-video' ? { dureeS } : {}) }))
}

// Le contrôle de chaque sortie prête : un écart la fait passer « non-conforme ».
export const controlerSorties = (sorties, controle = controler) => sorties.map((s) => {
  if (s.statut !== 'pret') return s
  const { conforme, erreurs } = controle(s.chemin, s.spec)
  return conforme ? { ...s, controle: 'conforme' } : { ...s, statut: 'non-conforme', erreurs }
})

const liste = (v) => v.split(',').map((x) => x.trim()).filter(Boolean)

export const choisir = (values) => {
  const langs = !values.langue || values.langue === 'all' ? KIT_LANGS : liste(values.langue)
  const appareils = values.appareil ? liste(values.appareil) : Object.keys(APPAREILS_APERCU)
  const quoi = liste(values.quoi ?? 'apercus,creatifs')
  const apercus = values.apercu ? liste(values.apercu).map(apercuDe) : APERCUS
  for (const l of langs) if (!KIT_LANGS.includes(l)) throw new Error(`langue inconnue « ${l} » — connues : ${KIT_LANGS.join(', ')}`)
  for (const a of appareils) if (!APPAREILS_APERCU[a]) throw new Error(`appareil inconnu « ${a} »`)
  for (const q of quoi) if (!['apercus', 'creatifs'].includes(q)) throw new Error(`--quoi : apercus et/ou creatifs, pas « ${q} »`)
  if (!['generee', 'silence'].includes(values.musique) && !values.licence) throw new Error('--musique <fichier> exige --licence "<source et licence>" : on ne publie que ce qu’on a le droit de diffuser')
  if (!['video', 'image'].includes(values.entete)) throw new Error('--entete : video ou image')
  return { langs, appareils, apercus, apercusChoisis: quoi.includes('apercus'), creatifsChoisis: quoi.includes('creatifs') }
}

// --verifier : relit ce qui est déjà sur disque, sans rien fabriquer.
const verifierExistant = (choix, racine) => {
  const fichiers = choix.langs.flatMap((lang) => {
    const c = cheminsAppStore({ lang, racine })
    return [
      ...choix.appareils.flatMap((appareil) => choix.apercus.map((a) => [c.apercu(appareil, a.fichier), APPAREILS_APERCU[appareil].spec])),
      [c.enteteImage, 'entete-image'], [c.enteteVideo, 'entete-video'], [c.recherche, 'recherche-image'],
    ]
  }).filter(([chemin]) => existsSync(chemin))
  const controles = fichiers.map(([chemin, spec]) => controler(chemin, spec))
  for (const c of controles) console.log(`${c.conforme ? '✓' : '✗'} ${c.fichier}${c.conforme ? '' : ` : ${c.erreurs.join(' ; ')}`}`)
  console.log(`${controles.length} fichier(s) relu(s)`)
  if (controles.some((c) => !c.conforme)) throw new Error('des sorties ne sont pas conformes')
}

const ouvrirRendu = async () => {
  const { chromium } = await import('@playwright/test')
  const { rendrePage } = await import('./surimpressions.mjs')
  const navigateur = await chromium.launch()
  return { rendre: (page) => rendrePage(navigateur, page), fermer: () => navigateur.close() }
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      langue: { type: 'string' },
      appareil: { type: 'string' },
      quoi: { type: 'string' },
      apercu: { type: 'string' },
      musique: { type: 'string', default: 'generee' },
      licence: { type: 'string' },
      entete: { type: 'string', default: 'video' },
      source: { type: 'string', default: SORTIE },
      sortie: { type: 'string', default: SORTIE_APPSTORE },
      metadata: { type: 'string', default: FASTLANE_METADATA },
      preset: { type: 'string', default: 'slow' },
      deposer: { type: 'boolean', default: false },
      verifier: { type: 'boolean', default: false },
    },
  })
  if (values.verifier) return verifierExistant(choisir(values), values.sortie)
  for (const outil of ['ffmpeg', 'ffprobe']) if (spawnSync('which', [outil]).status !== 0) throw new Error(`${outil} est introuvable (brew install ffmpeg)`)
  const choix = choisir(values)
  const { rendre, fermer } = await ouvrirRendu()
  const produites = []
  try {
    for (const lang of choix.langs) {
      if (choix.apercusChoisis) {
        for (const appareil of choix.appareils) {
          for (const apercu of choix.apercus) {
            const s = await monterApercu({ apercu, appareil, lang, source: values.source, racine: values.sortie, rendre, musique: values.musique, preset: values.preset })
            produites.push(s)
            console.log(s.statut === 'pret' ? `✓ ${s.chemin} (${s.dureeS.toFixed(2)} s)` : `· ${lang}/${appareil}/${apercu.id} : non tourné — ${s.manquants.join(', ')}`)
          }
        }
      }
      if (choix.creatifsChoisis) {
        const s = await monterCreatifs({ lang, source: values.source, racine: values.sortie, rendre, preset: values.preset })
        produites.push(...s)
        console.log(s[0].statut === 'pret' ? `✓ ${lang} : en-tête (image, vidéo) et visuel de recherche` : `· ${lang} : créatifs non tournés — ${s[0].manquants.join(', ')}`)
      }
    }
  } finally {
    await fermer()
  }
  const sorties = controlerSorties(produites)
  const musique = values.musique === 'silence' ? 'silence stéréo' : values.musique === 'generee' ? LICENCE_MUSIQUE : `${values.musique} — ${values.licence}`
  ecrire(resolve(values.sortie, 'rapport.json'), `${JSON.stringify({ musique, sorties }, null, 2)}\n`)
  const fautives = sorties.filter((s) => s.statut === 'non-conforme')
  for (const f of fautives) console.error(`✗ ${f.chemin} : ${f.erreurs.join(' ; ')}`)
  if (fautives.length) throw new Error(`${fautives.length} sortie(s) non conforme(s) — rien n'est déposé`)
  if (!values.deposer) return
  const copies = deposer({
    sorties, langs: choix.langs, appareils: choix.apercusChoisis ? choix.appareils : [], apercus: choix.apercus,
    creatifs: choix.creatifsChoisis, entete: values.entete, metadata: values.metadata,
  })
  for (const c of copies) console.log(`→ ${c.relatif}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erreur) => {
    console.error(`✗ ${erreur.message}`)
    process.exit(1)
  })
}
