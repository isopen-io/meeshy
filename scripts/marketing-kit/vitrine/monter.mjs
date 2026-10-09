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
import { controler } from '../lib/conformite.mjs'
import { KIT_LANGS, directionOf } from '../lib/locales.mjs'
import { LICENCE_MUSIQUE, synthetiser, wav } from '../lib/musique.mjs'
import { SOUS_TITRES_CREATIFS } from '../textes/apercus.mjs'
import { LEGENDES } from '../textes/legendes.mjs'
import {
  APERCUS, APPAREILS_APERCU, CARTES_CREATIVES, FASTLANE_METADATA, SORTIE_APPSTORE, apercuDe, cheminsAppStore, dispositionCreatif, familleDe, planDeMontage,
} from './apercus.mjs'
import { FPS, SORTIE, cheminsDePrise } from './filmer.mjs'
import { argumentsApercu, argumentsCreatif, argumentsMasque } from './montage.mjs'
import { deposer } from './monter-depot.mjs'
import { pageFin, pageFondCreatif, pageLegende } from './surimpressions.mjs'

const ffmpeg = (args) => execFileSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

export const imagesDuClip = (chemin) => {
  const sortie = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', chemin], { encoding: 'utf8' })
  return Number(sortie.trim())
}

// Les clips tournés d'un aperçu, pour un appareil et une langue : { [scene]: { chemin, images } }.
export const clipsTournes = ({ apercu, appareil, lang, source = SORTIE, compter = imagesDuClip }) =>
  Object.fromEntries(apercu.plans.flatMap((plan) => {
    const { clip } = cheminsDePrise({ famille: familleDe(plan), appareil, langue: lang, scene: plan.scene, racine: source })
    return existsSync(clip) ? [[plan.scene, { chemin: clip, images: compter(clip) }]] : []
  }))

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

export const monterApercu = async ({ apercu, appareil, lang, source, racine, rendre, musique = 'generee', preset = 'slow', compter }) => {
  const plan = planDeMontage({ apercu, lang, clips: clipsTournes({ apercu, appareil, lang, source, compter }) })
  const base = { type: 'apercu', lang, appareil, apercu: apercu.id, spec: APPAREILS_APERCU[appareil].spec }
  if (plan.statut !== 'pret') return { ...base, statut: 'incomplet', manquants: plan.manquants }
  const chemins = cheminsAppStore({ lang, racine })
  const { largeur, hauteur } = APPAREILS_APERCU[appareil]
  const dossier = resolve(chemins.travail, appareil, apercu.id)
  const segments = await Promise.all(plan.segments.map(async (seg, i) => (seg.type === 'clip'
    ? { ...seg, surimpression: ecrire(resolve(dossier, `legende-${i}.png`), await rendre(pageLegende({ texte: seg.legende, lang, largeur, hauteur }))) }
    : { ...seg, carte: ecrire(resolve(dossier, 'fin.png'), await rendre(pageFin({ ...plan.fin, lang, largeur, hauteur }))) })))
  const chemin = chemins.apercu(appareil, apercu.fichier)
  mkdirSync(dirname(chemin), { recursive: true })
  const audio = pisteAudio({ musique, images: plan.images, dossier })
  ffmpeg(argumentsApercu({ segments, largeur, hauteur, audio, sortie: chemin, preset }).args)
  return {
    ...base,
    statut: 'pret',
    chemin,
    dureeS: plan.dureeS,
    plans: plan.segments.map((s) => (s.type === 'clip' ? { scene: s.scene, legende: s.legende, secondes: s.images / FPS } : { fin: plan.fin, secondes: s.images / FPS })),
    ecartes: plan.ecartes,
  }
}

// Chaque carte prend sa première source tournée : l'image clé (iPhone) et, s'il existe, son clip.
export const cartesTournees = ({ lang, source = SORTIE }) => {
  const resolues = CARTES_CREATIVES.map((carte) => {
    const trouvee = carte.sources.map((s) => {
      const c = cheminsDePrise({ famille: s.famille, appareil: 'iphone', langue: lang, scene: s.scene, racine: source })
      return { ...s, image: c.image(s.image), clip: c.clip }
    }).find((s) => existsSync(s.image))
    return { carte, trouvee }
  })
  const manquants = resolues.filter((r) => !r.trouvee && !r.carte.facultative).map((r) => r.carte.sources[0])
  return {
    manquants: manquants.map((s) => `${s.scene}/${s.image}.png`),
    cartes: resolues.filter((r) => r.trouvee).map(({ carte, trouvee }) => ({ id: carte.id, image: trouvee.image, clip: existsSync(trouvee.clip) ? trouvee.clip : null })),
  }
}

export const monterCreatifs = async ({ lang, source, racine, rendre, preset = 'slow', compter = imagesDuClip }) => {
  const { cartes, manquants } = cartesTournees({ lang, source })
  const base = [{ type: 'entete', forme: 'image', spec: 'entete-image' }, { type: 'entete', forme: 'video', spec: 'entete-video' }, { type: 'recherche', forme: 'image', spec: 'recherche-image' }]
    .map((b) => ({ ...b, lang }))
  if (manquants.length) return base.map((b) => ({ ...b, statut: 'incomplet', manquants }))
  const chemins = cheminsAppStore({ lang, racine })
  const dossier = resolve(chemins.travail, 'creatifs')
  const dir = directionOf(lang)
  const fabriquer = async (format) => {
    const disposition = dispositionCreatif({ format, nombre: cartes.length, dir })
    const fond = ecrire(resolve(dossier, `${format}-fond.png`), await rendre(pageFondCreatif({ titre: LEGENDES.L2[lang], sousTitre: SOUS_TITRES_CREATIFS[format][lang], lang, disposition })))
    const c0 = disposition.cartes[0]
    const masque = resolve(dossier, `${format}-masque.png`)
    ffmpeg(argumentsMasque({ largeur: c0.largeur, hauteur: c0.hauteur, rayon: c0.rayon, sortie: masque }))
    const placees = disposition.cartes.map((rect, i) => ({ ...rect, ...cartes[i], masque }))
    return { disposition, fond, placees }
  }
  const entete = await fabriquer('entete')
  mkdirSync(dirname(chemins.enteteImage), { recursive: true })
  ffmpeg(argumentsCreatif({ fond: entete.fond, largeur: entete.disposition.largeur, hauteur: entete.disposition.hauteur, cartes: entete.placees, sortie: chemins.enteteImage }))
  // En-tête animé : les clips entrent l'un après l'autre (0,45 s d'écart), tiennent leur image finale, puis
  // tout revient au fond — la boucle d'Apple reprend sans saut.
  const animees = entete.placees.map((c, i) => (c.clip ? { ...c, debutS: 0.3 + i * 0.45 } : { ...c, clip: null }))
  const finS = Math.max(...animees.map((c) => (c.clip ? c.debutS + compter(c.clip) / FPS : 0)))
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
