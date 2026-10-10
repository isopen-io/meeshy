#!/usr/bin/env bun
// La vidéo de STATUT « Trouve ta moitié » (#9988) : 25 s en 9:16, dans les sept langues, à partir des VRAIES prises de
// la vitrine (filmer.mjs) et de deux écrans du kit, avec Mee et Meo dessinés par le web.
//   bun scripts/marketing-kit/vitrine/statut-amour.mjs --langue fr              # une langue
//   bun scripts/marketing-kit/vitrine/statut-amour.mjs --langue all             # les sept
//   bun scripts/marketing-kit/vitrine/statut-amour.mjs --langue fr --jusqua 6   # rendu partiel (essai)
//   bun scripts/marketing-kit/vitrine/statut-amour.mjs --langue all --son       # le mixage seul, sur l'image rendue
//
// Le plan est déclaré dans statut-amour-plan.mjs ; chaque image est posée par statut-amour-page.mjs, rendue par Chromium
// (JPEG 95, 1080×1920) et versée dans ffmpeg (maître à qualité constante), puis encodée en deux passes au débit qui tient
// le fichier sous 10 Mo. Sorties : ~/Movies/Meeshy-amour-25s/meeshy-amour-<locale>.mp4 et planche-<locale>.jpg (une image
// toutes les 0,5 s). Bun, pas node : les stickers de Mee et Meo sont importés de leur source TypeScript.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { KIT_LANGS, appStoreLocale } from '../lib/locales.mjs'
import { FPS, SORTIE, cheminsDePrise } from './filmer.mjs'
import { boutonDuVocal, mesurerLeSon, sourceVerifiee } from './entete-epique.mjs'
import { documentDeLEcran } from './statut-amour-ecrans.mjs'
import { CSS_HAUTEUR, CSS_LARGEUR, FACTEUR, documentDuStatut, modeleDeLaPage } from './statut-amour-page.mjs'
import {
  AMOUREUX, DUREE_S, GLOUTONS, HAUTEUR, IMAGES, LARGEUR, MUSIQUE, PLANS, POIDS_MAX_OCTETS, SONS, argumentsDeMixage, debitVideoKbps, planDuStatut,
} from './statut-amour-plan.mjs'

export const LIVRAISON = resolve(homedir(), 'Movies', 'Meeshy-amour-25s')
export const TRAVAIL = resolve(SORTIE, 'statut-amour')
export const CACHE_SONS = resolve(SORTIE, 'vitrine', 'sons')
export const nomDuFichier = (lang) => `meeshy-amour-${appStoreLocale(lang)}.mp4`
export const nomDeLaPlanche = (lang) => `planche-${appStoreLocale(lang)}.jpg`

const ffmpeg = (args) => execFileSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const stderrDeFfmpeg = (args) => spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stderr

const derniereLivree = (rapport) => {
  const prise = [...rapport.prises].reverse().find((p) => p.statut === 'livree')
  if (!prise) throw new Error(`${rapport.scene} : aucune prise livrée`)
  return prise
}

// Les prises d'une langue : clip et rapport de la prise livrée ; pour le vocal, le haut de son bouton lu dans l'image.
export const prisesDeLaLangue = ({ lang, source = SORTIE }) => Object.fromEntries(PLANS.filter((p) => p.prise).map(({ prise: { famille, scene } }) => {
  const chemins = cheminsDePrise({ famille, appareil: 'iphone', langue: lang, scene, racine: source })
  if (!existsSync(chemins.clip) || !existsSync(chemins.rapport)) throw new Error(`${lang} : la prise ${scene} manque (${chemins.clip}) — la filmer d'abord`)
  const rapport = { scene, ...derniereLivree(JSON.parse(readFileSync(chemins.rapport, 'utf8'))) }
  const repereY = scene === 'interaction-vocal' ? boutonDuVocal({ image: chemins.image('traduction'), rtl: lang === 'ar' }) : null
  return [scene, { clip: chemins.clip, rapport, repereY }]
}))

const extraireLesImages = ({ plan, dossier }) => Object.fromEntries(plan.plans.filter((p) => p.clip).map((p) => {
  const sortie = resolve(dossier, 'images', p.id)
  rmSync(sortie, { recursive: true, force: true })
  mkdirSync(sortie, { recursive: true })
  const nombre = Math.ceil((p.finS - p.debutS + 1) * FPS)
  ffmpeg(['-y', '-v', 'error', '-ss', p.entreeS.toFixed(3), '-i', p.clip, '-frames:v', String(nombre), '-q:v', '2', resolve(sortie, '%04d.jpg')])
  const extraites = readdirSync(sortie).filter((f) => f.endsWith('.jpg')).length
  if (!extraites) throw new Error(`${p.id} : aucune image extraite de ${p.clip} à ${p.entreeS} s`)
  return [p.id, { dossier: `images/${p.id}`, nombre: extraites }]
}))

// Les SVG de Mee et Meo, une apparition par identifiant (le module importe le TypeScript du web).
const svgsDuStatut = async () => {
  const { svgDesApparitions } = await import('./statut-amour-mee.mjs')
  return svgDesApparitions([
    ...AMOUREUX.map(({ id, sticker }) => ({ id, sticker })),
    { id: 'glouton-mee', sticker: GLOUTONS.mee },
    { id: 'glouton-meo', sticker: GLOUTONS.meo },
  ])
}

// Chaque image posée par la page, capturée en JPEG et versée dans ffmpeg : le MAÎTRE, à qualité quasi constante.
const rendreLeMaitre = async ({ page, sortie, jusqua }) => {
  const total = Math.min(IMAGES, Math.round(jusqua * FPS))
  const encodeur = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${LARGEUR}:${HAUTEUR}:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p`, '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-r', String(FPS), '-an', sortie], { stdio: ['pipe', 'inherit', 'inherit'] })
  const fini = new Promise((ok, ko) => encodeur.on('exit', (code) => (code === 0 ? ok() : ko(new Error(`ffmpeg a rendu ${code}`)))))
  for (let i = 0; i < total; i += 1) {
    await page.evaluate((t) => window.poser(t), i / FPS)
    const image = await page.screenshot({ type: 'jpeg', quality: 95 })
    if (!encodeur.stdin.write(image)) await new Promise((r) => encodeur.stdin.once('drain', r))
    if (i % 150 === 0) process.stdout.write(`  ${(i / FPS).toFixed(1)} s\n`)
  }
  encodeur.stdin.end()
  await fini
}

export const mixerLeSon = ({ plan, dossier }) => {
  const musique = sourceVerifiee(MUSIQUE, { dossier: CACHE_SONS })
  const sons = Object.fromEntries(Object.entries(SONS).map(([nom, s]) => [nom, sourceVerifiee(s, { dossier: CACHE_SONS })]))
  const journal = stderrDeFfmpeg(argumentsDeMixage({ musique, sons, reperes: plan.reperes }))
  const debut = journal.lastIndexOf('{')
  const mesure = JSON.parse(journal.slice(debut, journal.lastIndexOf('}') + 1))
  const sortie = resolve(dossier, 'mixage.wav')
  ffmpeg(argumentsDeMixage({ musique, sons, reperes: plan.reperes, mesure, sortie }).map((a) => (a === 'info' ? 'error' : a)))
  return sortie
}

// L'encodage livré : H.264 High en deux passes au débit qui tient le fichier sous 10 Mo, AAC 160 kb/s.
const encoderLaLivraison = ({ maitre, son, sortie, dossier }) => {
  const debit = debitVideoKbps()
  const commun = ['-i', maitre, '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', '4.2', '-pix_fmt', 'yuv420p',
    '-b:v', `${debit}k`, '-maxrate', `${Math.round(debit * 1.6)}k`, '-bufsize', `${debit * 2}k`, '-g', String(FPS * 2), '-passlogfile', resolve(dossier, 'passe')]
  ffmpeg(['-y', '-v', 'error', ...commun, '-pass', '1', '-an', '-f', 'mp4', '/dev/null'])
  ffmpeg(['-y', '-v', 'error', '-i', son, ...commun, '-pass', '2', '-map', '1:v', '-map', '0:a', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-t', String(DUREE_S), '-movflags', '+faststart', sortie])
  return sortie
}

// La planche : une image toutes les 0,5 s, cinquante vignettes en dix colonnes, l'instant inscrit sous chacune.
export const filtreDeLaPlanche = ({ colonnes = 10, largeur = 216 } = {}) => {
  const lignes = Math.ceil((DUREE_S * 2) / colonnes)
  return `fps=2,scale=${largeur}:-2,pad=iw:ih+30:0:0:white,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='%{eif\\:trunc(n/2)\\:d},%{eif\\:mod(n\\,2)*5\\:d} s':x=(w-tw)/2:y=h-24:fontsize=18:fontcolor=black,tile=${colonnes}x${lignes}:padding=4:color=white`
}

const rendreLaPlanche = ({ video, sortie }) => {
  ffmpeg(['-y', '-v', 'error', '-i', video, '-vf', filtreDeLaPlanche(), '-frames:v', '1', '-q:v', '3', sortie])
  return sortie
}

const preparer = ({ lang }) => {
  const dossier = resolve(TRAVAIL, appStoreLocale(lang))
  mkdirSync(dossier, { recursive: true })
  const plan = planDuStatut({ lang, prises: prisesDeLaLangue({ lang }) })
  writeFileSync(resolve(dossier, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
  return { dossier, plan }
}

const livrer = ({ lang, dossier, plan }) => {
  mkdirSync(LIVRAISON, { recursive: true })
  const son = mixerLeSon({ plan, dossier })
  const sortie = encoderLaLivraison({ maitre: resolve(dossier, 'maitre.mp4'), son, sortie: resolve(LIVRAISON, nomDuFichier(lang)), dossier })
  const planche = rendreLaPlanche({ video: sortie, sortie: resolve(LIVRAISON, nomDeLaPlanche(lang)) })
  return { lang, chemin: sortie, planche, poids: statSync(sortie).size, son: mesurerLeSon(sortie) }
}

export const monterLeStatut = async ({ lang, navigateur, jusqua = DUREE_S }) => {
  const { dossier, plan } = preparer({ lang })
  const images = extraireLesImages({ plan, dossier })
  const ecrans = Object.fromEntries(plan.plans.filter((p) => p.kit).map((p) => [p.id, documentDeLEcran({ ecran: p.kit, lang })]))
  const modele = modeleDeLaPage({ plan, images, ecrans })
  const html = resolve(dossier, 'page.html')
  writeFileSync(html, documentDuStatut({ lang, dir: plan.dir, modele, svgs: await svgsDuStatut() }))
  const contexte = await navigateur.newContext({ viewport: { width: CSS_LARGEUR, height: CSS_HAUTEUR }, deviceScaleFactor: FACTEUR })
  const page = await contexte.newPage()
  try {
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await rendreLeMaitre({ page, sortie: resolve(dossier, 'maitre.mp4'), jusqua })
  } finally {
    await contexte.close().catch(() => {})
    rmSync(resolve(dossier, 'images'), { recursive: true, force: true })
  }
  if (jusqua < DUREE_S) return { lang, chemin: resolve(dossier, 'maitre.mp4'), partiel: true }
  return livrer({ lang, dossier, plan })
}

const main = async () => {
  const { values } = parseArgs({ options: { langue: { type: 'string', default: 'fr' }, jusqua: { type: 'string' }, son: { type: 'boolean', default: false } } })
  const langs = values.langue === 'all' ? KIT_LANGS : values.langue.split(',')
  const { chromium } = await import('@playwright/test')
  for (const lang of langs) {
    if (values.son) {
      const { dossier, plan } = preparer({ lang })
      const r = livrer({ lang, dossier, plan })
      console.log(`✓ ${r.chemin} — ${(r.poids / 1e6).toFixed(2)} Mo, ${r.son.lufs} LUFS, crête ${r.son.creteVraieDbfs} dBFS`)
      continue
    }
    const navigateur = await chromium.launch()
    const r = await monterLeStatut({ lang, navigateur, jusqua: values.jusqua ? Number(values.jusqua) : DUREE_S }).finally(() => navigateur.close().catch(() => {}))
    if (r.partiel) { console.log(`✓ ${r.chemin} (partiel)`); continue }
    if (r.poids >= POIDS_MAX_OCTETS) throw new Error(`${r.chemin} pèse ${r.poids} octets, au-delà de 10 Mo`)
    console.log(`✓ ${r.chemin} — ${(r.poids / 1e6).toFixed(2)} Mo, ${r.son.lufs} LUFS, crête ${r.son.creteVraieDbfs} dBFS`)
  }
}

if (import.meta.main ?? import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erreur) => {
    console.error(`✗ ${erreur.stack ?? erreur.message}`)
    process.exit(1)
  })
}
