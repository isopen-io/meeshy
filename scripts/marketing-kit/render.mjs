#!/usr/bin/env node
// Moteur de rendu du kit marketing (#7727, #7728).
//
// Ses rendus iPhone 6,9" / iPad 13" sont des BROUILLONS de mise en scène (out/brouillons/) :
// le SEUL livrable App Store est templates/appstore/render-appstore.mjs → fastlane/screenshots.
//
//   node scripts/marketing-kit/render.mjs --format iphone-6.9 --lang fr --gabarit 01-vocal
//   node scripts/marketing-kit/render.mjs --format iphone-6.9,ipad-13 --lang all --gabarit all
//   node scripts/marketing-kit/render.mjs --planches
//
// Chromium (Playwright) rend chaque page HORS RÉSEAU : toute requête sortante fait échouer le
// rendu. Chaque PNG est aplati en RVB (aucun canal alpha, exigence App Store Connect) et sa
// taille vérifiée au pixel près.
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { REPO_ROOT } from './lib/catalog.mjs'
import { FORMATS, formatOf } from './lib/formats.mjs'
import { KIT_LANGS } from './lib/locales.mjs'
import { page as pageHtml, planchesDuFormat } from './lib/gabarits.mjs'
import { pngInfo, stripAlpha } from './lib/png.mjs'
import { SEQUENCES } from './lib/sequences.mjs'

export const OUT_DIR = resolve(REPO_ROOT, 'scripts/marketing-kit/out')
export const OUT_BROUILLONS = resolve(OUT_DIR, 'brouillons')

const liste = (valeur, tout) => (valeur === 'all' ? tout : valeur.split(','))

const horsReseau = async (context) => {
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('data:') || url.startsWith('file:') || url === 'about:blank') return route.continue()
    return route.abort('blockedbyclient')
  })
}

export const ouvrirNavigateur = () => chromium.launch()

export const renderPng = async (browser, { format, lang, gabarit }) => {
  const f = formatOf(format)
  const context = await browser.newContext({
    viewport: { width: f.width / f.scale, height: f.height / f.scale },
    deviceScaleFactor: f.scale,
    locale: lang,
  })
  const reseau = []
  context.on('request', (req) => {
    if (!/^(data|file|about):/.test(req.url())) reseau.push(req.url())
  })
  await horsReseau(context)
  const page = await context.newPage()
  try {
    await page.setContent(pageHtml({ format, lang, gabarit }), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const png = stripAlpha(await page.screenshot({ type: 'png', omitBackground: false }))
    if (reseau.length) throw new Error(`rendu : ${reseau.length} requête(s) réseau — ${reseau[0]}`)
    const info = pngInfo(png)
    if (info.width !== f.width || info.height !== f.height || info.colorType !== 2) {
      throw new Error(`rendu : ${gabarit} fait ${info.width}×${info.height} (type ${info.colorType}), attendu ${f.width}×${f.height} RVB`)
    }
    return png
  } finally {
    await context.close()
  }
}

export const cheminSortie = ({ format, lang, gabarit }) => resolve(OUT_BROUILLONS, format, lang, `${gabarit}.png`)

const rendre = async ({ formats, langs, gabarits }) => {
  const browser = await ouvrirNavigateur()
  const produits = []
  try {
    for (const format of formats) {
      const ids = gabarits === 'all' ? planchesDuFormat(format).map((p) => p.id) : gabarits.split(',')
      for (const lang of langs) {
        for (const gabarit of ids) {
          const sortie = cheminSortie({ format, lang, gabarit })
          mkdirSync(resolve(sortie, '..'), { recursive: true })
          writeFileSync(sortie, await renderPng(browser, { format, lang, gabarit }))
          produits.push(sortie)
          console.log(`✓ ${relative(REPO_ROOT, sortie)}`)
        }
      }
    }
  } finally {
    await browser.close()
  }
  return produits
}

export const nomPlanche = (format, { brut }) => `brouillon-${format}${brut ? '-ecrans' : ''}`

// Planche contact : une ligne par langue, une colonne par gabarit, vignettes réduites.
const planche = async (browser, format, { brut }) => {
  const dossier = resolve(OUT_BROUILLONS, format)
  if (!existsSync(dossier)) return null
  const ids = planchesDuFormat(format)
    .filter((p) => (p.gabarit === 'ecran') === brut)
    .map((p) => p.id)
  const langs = KIT_LANGS.filter((l) => ids.some((id) => existsSync(cheminSortie({ format, lang: l, gabarit: id }))))
  const colonnes = ids.filter((id) => langs.some((l) => existsSync(cheminSortie({ format, lang: l, gabarit: id }))))
  if (!langs.length || !colonnes.length) return null
  const f = formatOf(format)
  const largeur = f.width > f.height ? 360 : 200
  const hauteur = Math.round((largeur * f.height) / f.width)
  const cellules = langs
    .map(
      (l) =>
        `<div class="lang">${l}</div>` +
        colonnes
          .map((id) => {
            const png = cheminSortie({ format, lang: l, gabarit: id })
            return existsSync(png) ? `<img src="${pathToFileURL(png)}" width="${largeur}" height="${hauteur}">` : '<div class="vide"></div>'
          })
          .join(''),
    )
    .join('')
  const entete = `<div></div>${colonnes.map((id) => `<div class="col">${id}</div>`).join('')}`
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#0f0c29;color:#e0e7ff;font:600 14px -apple-system,system-ui,sans-serif}
    h1{margin:0;padding:28px 32px 8px;font-size:26px;color:#fff} p{margin:0 32px 18px;color:#a5b4fc;font-weight:500}
    .grille{display:grid;grid-template-columns:48px repeat(${colonnes.length},${largeur}px);gap:14px;padding:0 32px 32px;align-items:center}
    .col{font-size:12px;color:#a5b4fc;text-align:center}.lang{font-size:18px;color:#fff;text-transform:uppercase}
    img{display:block;border-radius:10px;box-shadow:0 8px 24px #0008}.vide{width:${largeur}px;height:${hauteur}px;border:1px dashed #4338ca;border-radius:10px}
  </style><h1>BROUILLON — Meeshy — ${format}${brut ? ' — écrans bruts' : ''}</h1><p>Non livrable : les captures App Store viennent de render-appstore.mjs (fastlane/screenshots). · ${f.usage} · ${f.width}×${f.height} · ${langs.length} langues × ${colonnes.length} gabarits</p><div class="grille">${entete}${cellules}</div>`
  const tmp = resolve(OUT_DIR, 'planches', `.${nomPlanche(format, { brut })}.html`)
  mkdirSync(resolve(tmp, '..'), { recursive: true })
  writeFileSync(tmp, html)
  const context = await browser.newContext({ viewport: { width: 64 + 48 + colonnes.length * (largeur + 14), height: 400 }, deviceScaleFactor: 1 })
  await horsReseau(context)
  const page = await context.newPage()
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' })
  const sortie = resolve(OUT_DIR, 'planches', `${nomPlanche(format, { brut })}.png`)
  writeFileSync(sortie, stripAlpha(await page.screenshot({ type: 'png', fullPage: true })))
  await context.close()
  console.log(`▦ ${relative(REPO_ROOT, sortie)}`)
  return sortie
}

const planches = async (formats) => {
  const browser = await ouvrirNavigateur()
  try {
    for (const format of formats) {
      await planche(browser, format, { brut: false })
      await planche(browser, format, { brut: true })
    }
  } finally {
    await browser.close()
  }
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      format: { type: 'string' },
      lang: { type: 'string', default: 'fr' },
      gabarit: { type: 'string', default: 'all' },
      planches: { type: 'boolean', default: false },
    },
  })
  if (values.planches) {
    const avecRendus = existsSync(OUT_BROUILLONS)
      ? readdirSync(OUT_BROUILLONS, { withFileTypes: true }).filter((d) => d.isDirectory() && FORMATS[d.name]).map((d) => d.name)
      : []
    return planches(values.format ? liste(values.format, avecRendus) : avecRendus)
  }
  const formats = liste(values.format ?? 'iphone-6.9', Object.keys(SEQUENCES))
  return rendre({ formats, langs: liste(values.lang, KIT_LANGS), gabarits: values.gabarit })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  })
}
