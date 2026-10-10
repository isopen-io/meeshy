#!/usr/bin/env node
// L'en-tête ÉPIQUE de la fiche App Store (#9904) : 23 s de motion design sur une musique de bande-annonce, dans les sept
// langues, à partir des VRAIES prises de la vitrine (filmer.mjs).
//   node scripts/marketing-kit/vitrine/entete-epique.mjs --langue fr              # une langue
//   node scripts/marketing-kit/vitrine/entete-epique.mjs --langue all --deposer   # les sept, déposées pour andp
//   node scripts/marketing-kit/vitrine/entete-epique.mjs --langue fr --jusqua 4   # rendu partiel (essai)
//
// Le plan est déclaré dans entete-epique-plan.mjs ; chaque image est posée par la page entete-epique-page.mjs et rendue
// par Chromium (JPEG 95, 3840×1646) dans ffmpeg ; le son est la musique plus les effets, mixés à -16 LUFS. Sorties :
// out/appstore/<locale>/product_page_header/02-entete-epique-<locale>.mp4, contrôlée contre la spécification Apple.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { controler } from '../lib/conformite.mjs'
import { KIT_LANGS, appStoreLocale } from '../lib/locales.mjs'
import { FASTLANE_METADATA, SORTIE_APPSTORE } from './apercus.mjs'
import { FPS, SORTIE, cheminsDePrise, lireEmpreintes, premierMouvement } from './filmer.mjs'
import { empreinte } from './medias.mjs'
import { CSS_HAUTEUR, CSS_LARGEUR, FACTEUR, documentDeLEntete } from './entete-epique-page.mjs'
import {
  DUREE_S, HAUTEUR, IMAGES, LARGEUR, MUSIQUE, PLANS, SONS, argumentsDeMixage, lireMesure, modeleDeLaPage, planDeLEntete,
} from './entete-epique-plan.mjs'

export const CACHE_SONS = resolve(SORTIE, 'vitrine', 'sons')
export const nomDuFichier = (lang) => `02-entete-epique-${appStoreLocale(lang)}.mp4`
// Les en-têtes que ce dépôt remplace : l'ancien fondu de cartes, et toute version précédente de celui-ci.
export const ANCIENS_ENTETES = /^(01-entete(-[A-Za-z-]+)?|02-entete-epique-[A-Za-z-]+)\.(mp4|png)$/

const ffmpeg = (args) => execFileSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

// ── Les sources ────────────────────────────────────────────────────────────────────────────────────────────

const telecharger = (url, chemin) => execFileSync('curl', ['-fsSL', '--retry', '2', '-A', 'Mozilla/5.0', '-o', chemin, url])

// Un fichier sous licence, téléchargé une fois et vérifié par son empreinte.
export const sourceVerifiee = ({ source, fichier, sha256 }, { dossier = CACHE_SONS, prendre = telecharger } = {}) => {
  mkdirSync(dossier, { recursive: true })
  const chemin = resolve(dossier, fichier)
  if (!existsSync(chemin)) prendre(source, chemin)
  const recue = empreinte(readFileSync(chemin))
  if (recue !== sha256) {
    rmSync(chemin, { force: true })
    throw new Error(`${fichier} : le fichier téléchargé n’est pas celui du kit (empreinte ${recue}, attendue ${sha256})`)
  }
  return chemin
}

const derniereLivree = (rapport) => {
  const prise = [...rapport.prises].reverse().find((p) => p.statut === 'livree')
  if (!prise) throw new Error(`${rapport.scene} : aucune prise livrée`)
  return prise
}

// Les prises d'une langue : clip, rapport de la prise livrée et, pour le jeu, son premier mouvement lu dans le film.
export const prisesDeLaLangue = ({ lang, source = SORTIE }) => Object.fromEntries([...new Set(PLANS.filter((p) => p.prise).map((p) => JSON.stringify(p.prise)))]
  .map((j) => JSON.parse(j))
  .map(({ famille, scene }) => {
    const chemins = cheminsDePrise({ famille, appareil: 'iphone', langue: lang, scene, racine: source })
    if (!existsSync(chemins.clip) || !existsSync(chemins.rapport)) throw new Error(`${lang} : la prise ${scene} manque (${chemins.clip}) — la filmer d'abord`)
    const rapport = { scene, ...derniereLivree(JSON.parse(readFileSync(chemins.rapport, 'utf8'))) }
    const origineMs = Math.round((rapport.bornes.action.debutS - rapport.bornes.rognage.debutS) * 1000)
    const mouvementMs = famille === 'jeu'
      ? premierMouvement({ empreintes: lireEmpreintes(ffmpeg(['-v', 'error', '-i', chemins.clip, '-an', '-f', 'framemd5', '-'])), origineMs })
      : null
    const repereY = scene === 'interaction-vocal' ? boutonDuVocal({ image: chemins.image('traduction'), rtl: lang === 'ar' }) : null
    return [scene, { clip: chemins.clip, rapport, mouvementMs, repereY }]
  }))

// Le haut du bouton de lecture du vocal (indigo), lu dans une image clé de la prise : la conversation ne s'arrête pas au
// même défilement d'une langue à l'autre. Colonne de 80 px au bord de lecture.
export const boutonDuVocal = ({ image, rtl }) => {
  const x = rtl ? 1320 - 140 : 60
  const brut = execFileSync('ffmpeg', ['-v', 'error', '-i', image, '-vf', `crop=80:2868:${x}:0`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 })
  for (let y = 900; y < 2600; y += 1) {
    let n = 0
    for (let i = 0; i < 80; i += 1) {
      const o = (y * 80 + i) * 3
      if (brut[o + 2] > 180 && brut[o] > 80 && brut[o] < 170 && brut[o + 1] < 130) n += 1
    }
    if (n > 20) return y
  }
  throw new Error(`${image} : bouton du vocal introuvable`)
}

const nomDeFiche = (lang, metadata = FASTLANE_METADATA) => readFileSync(resolve(metadata, appStoreLocale(lang), 'name.txt'), 'utf8')

// ── Les images ─────────────────────────────────────────────────────────────────────────────────────────────

const extraireLesImages = ({ plan, dossier }) => Object.fromEntries(plan.plans.filter((p) => p.clip).map((p) => {
  const sortie = resolve(dossier, 'images', p.id)
  rmSync(sortie, { recursive: true, force: true })
  mkdirSync(sortie, { recursive: true })
  const nombre = Math.ceil((p.finS - p.debutS + 0.3) * FPS)
  ffmpeg(['-y', '-v', 'error', '-ss', p.entreeS.toFixed(3), '-i', p.clip, '-frames:v', String(nombre), '-q:v', '2', resolve(sortie, '%04d.jpg')])
  const extraites = readdirSync(sortie).filter((f) => f.endsWith('.jpg')).length
  if (!extraites) throw new Error(`${p.id} : aucune image extraite de ${p.clip} à ${p.entreeS} s`)
  return [p.id, { dossier: `images/${p.id}`, nombre: extraites }]
}))

// Chaque image posée par la page, capturée en JPEG et versée dans ffmpeg, qui l'encode en H.264 (High 5.1).
const rendreLaVideo = async ({ page, dossier, sortie, jusqua = DUREE_S }) => {
  const total = Math.min(IMAGES, Math.round(jusqua * FPS))
  const encodeur = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${LARGEUR}:${HAUTEUR}:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p`, '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '5.1',
    '-preset', 'slow', '-crf', '15', '-r', String(FPS), '-g', String(FPS), '-an', '-movflags', '+faststart', sortie], { stdio: ['pipe', 'inherit', 'inherit'] })
  const fini = new Promise((ok, ko) => encodeur.on('exit', (code) => (code === 0 ? ok() : ko(new Error(`ffmpeg a rendu ${code}`)))))
  for (let i = 0; i < total; i += 1) {
    await page.evaluate((t) => window.poser(t), i / FPS)
    const image = await page.screenshot({ type: 'jpeg', quality: 95 })
    if (!encodeur.stdin.write(image)) await new Promise((r) => encodeur.stdin.once('drain', r))
    if (i % 90 === 0) process.stdout.write(`  ${dossier.split('/').at(-2)} ${(i / FPS).toFixed(1)} s\n`)
  }
  encodeur.stdin.end()
  await fini
  return total
}

// ── Le son ─────────────────────────────────────────────────────────────────────────────────────────────────

export const mesurerLeSon = (fichier) => {
  const ebur = stderrDeFfmpeg(['-v', 'info', '-nostats', '-i', fichier, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'])
  const resume = ebur.slice(ebur.lastIndexOf('Summary:'))
  const vol = stderrDeFfmpeg(['-v', 'info', '-nostats', '-i', fichier, '-af', 'volumedetect', '-f', 'null', '-'])
  return {
    lufs: Number(resume.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]),
    creteVraieDbfs: Number(resume.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]),
    maxDb: Number(vol.match(/max_volume: (-?[\d.]+) dB/)?.[1]),
  }
}

const stderrDeFfmpeg = (args) => spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stderr

// ── Une langue ─────────────────────────────────────────────────────────────────────────────────────────────

export const monterLEntete = async ({ lang, navigateur, racine = SORTIE_APPSTORE, jusqua = DUREE_S }) => {
  const locale = appStoreLocale(lang)
  const dossier = resolve(racine, '.travail', locale, 'entete-epique')
  mkdirSync(dossier, { recursive: true })
  const plan = planDeLEntete({ lang, prises: prisesDeLaLangue({ lang }), nomDeFiche: nomDeFiche(lang) })
  writeFileSync(resolve(dossier, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
  const images = extraireLesImages({ plan, dossier })
  const modele = modeleDeLaPage({ plan, images })
  const html = resolve(dossier, 'page.html')
  writeFileSync(html, documentDeLEntete({ lang, dir: plan.dir, donnees: modele }))
  const contexte = await navigateur.newContext({ viewport: { width: CSS_LARGEUR, height: CSS_HAUTEUR }, deviceScaleFactor: FACTEUR })
  const page = await contexte.newPage()
  const video = resolve(dossier, 'video.mp4')
  try {
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await rendreLaVideo({ page, dossier, sortie: video, jusqua })
  } finally {
    await contexte.close()
  }
  const son = mixerLeSon({ plan, dossier })
  const sortie = resolve(racine, locale, 'product_page_header', nomDuFichier(lang))
  mkdirSync(resolve(racine, locale, 'product_page_header'), { recursive: true })
  ffmpeg(['-y', '-v', 'error', '-i', video, '-i', son, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
    '-shortest', '-movflags', '+faststart', sortie])
  return { lang, locale, chemin: sortie, plan, son: mesurerLeSon(sortie) }
}

export const mixerLeSon = ({ plan, dossier }) => {
  const musique = sourceVerifiee(MUSIQUE)
  const sons = Object.fromEntries(Object.entries(SONS).map(([nom, s]) => [nom, sourceVerifiee(s)]))
  const mesure = lireMesure(stderrDeFfmpeg(argumentsDeMixage({ musique, sons, reperes: plan.reperes })))
  const sortie = resolve(dossier, 'mixage.wav')
  ffmpeg(argumentsDeMixage({ musique, sons, reperes: plan.reperes, mesure, sortie }).map((a) => (a === 'info' ? 'error' : a)))
  return sortie
}

// ── Le dépôt ───────────────────────────────────────────────────────────────────────────────────────────────

// Le nouvel en-tête remplace l'ancien dans le dossier andp de sa langue ; rien d'autre du dossier n'est touché.
export const deposerLEntete = ({ chemin, lang, metadata = FASTLANE_METADATA }) => {
  const dossier = resolve(metadata, appStoreLocale(lang), 'product_page_header')
  mkdirSync(dossier, { recursive: true })
  const retires = readdirSync(dossier).filter((f) => ANCIENS_ENTETES.test(f) && f !== basename(chemin))
  for (const f of retires) rmSync(resolve(dossier, f))
  copyFileSync(chemin, resolve(dossier, basename(chemin)))
  return { depose: resolve(dossier, basename(chemin)), retires }
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      langue: { type: 'string', default: 'fr' },
      deposer: { type: 'boolean', default: false },
      jusqua: { type: 'string' },
    },
  })
  const langs = values.langue === 'all' ? KIT_LANGS : values.langue.split(',')
  const { chromium } = await import('@playwright/test')
  const navigateur = await chromium.launch()
  const bilan = []
  try {
    for (const lang of langs) {
      const r = await monterLEntete({ lang, navigateur, jusqua: values.jusqua ? Number(values.jusqua) : DUREE_S })
      const controle = values.jusqua ? { conforme: null, erreurs: [] } : controler(r.chemin, 'entete-video')
      console.log(`${controle.conforme === false ? '✗' : '✓'} ${r.chemin} — ${r.son.lufs} LUFS, crête ${r.son.creteVraieDbfs} dBFS${controle.erreurs.length ? ` : ${controle.erreurs.join(' ; ')}` : ''}`)
      if (controle.conforme === false) throw new Error(`${r.chemin} n'est pas conforme`)
      bilan.push({ lang, chemin: r.chemin, son: r.son, controle: controle.conforme })
      if (values.deposer) {
        const d = deposerLEntete({ chemin: r.chemin, lang })
        console.log(`→ ${d.depose}${d.retires.length ? ` (retiré : ${d.retires.join(', ')})` : ''}`)
      }
    }
  } finally {
    await navigateur.close()
  }
  writeFileSync(resolve(SORTIE_APPSTORE, 'entete-epique.json'), `${JSON.stringify({
    musique: `${MUSIQUE.titre} — ${MUSIQUE.auteur} (${MUSIQUE.source}) — ${MUSIQUE.licence}`,
    sons: Object.values(SONS).map((s) => `${s.titre} (${s.source}) — ${s.licence}`),
    bilan,
  }, null, 2)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erreur) => {
    console.error(`✗ ${erreur.stack ?? erreur.message}`)
    process.exit(1)
  })
}
