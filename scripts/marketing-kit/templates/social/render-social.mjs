#!/usr/bin/env node
// Kit réseaux sociaux (#7728) — rend chaque visuel dans les sept langues.
//
//   node scripts/marketing-kit/templates/social/render-social.mjs                 # tout
//   node scripts/marketing-kit/templates/social/render-social.mjs --lang fr --id V1,C1-3
//   node scripts/marketing-kit/templates/social/render-social.mjs --planches      # planches seules
//
// Sorties : out/social/<langue>/<id>.png (RVB sans alpha, taille vérifiée au pixel),
// out/social/manifest.json, out/social/publications-meeshy.md, out/social/verification.json,
// out/planches/social-<format>-<langue>.png. Hors réseau : toute requête fait échouer le rendu.
// Le vérificateur relève tout texte qui déborde ; le code de sortie est 1 s'il en trouve.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { REPO_ROOT } from '../../lib/catalog.mjs'
import { KIT_LANGS, directionOf } from '../../lib/locales.mjs'
import { pngInfo, stripAlpha } from '../../lib/png.mjs'
import { SOCIAL_FORMATS, socialFormat } from './formats.mjs'
import { VISUELS, manifeste } from './catalogue.mjs'
import { pageSociale } from './page.mjs'
import { publicationsMarkdown } from './publications-md.mjs'
import { preparer, verifier, zoneSure } from './rendu.mjs'

const OUT = resolve(REPO_ROOT, 'scripts/marketing-kit/out')
const SOCIAL = resolve(OUT, 'social')
const PLANCHES = resolve(OUT, 'planches')

const cheminPng = (lang, id) => resolve(SOCIAL, lang, `${id}.png`)

const horsReseau = async (context, bloquees) => {
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (/^(data|file|about):/.test(url)) return route.continue()
    bloquees.push(url)
    return route.abort('blockedbyclient')
  })
}

const selection = (filtre) => {
  if (!filtre) return VISUELS
  const motifs = filtre.split(',')
  return VISUELS.filter((v) => motifs.some((m) => v.id === m || v.id.startsWith(`${m}-`) || v.concept === m))
}

const rendre = async ({ langs, visuels }) => {
  const browser = await chromium.launch()
  const problemes = []
  try {
    for (const lang of langs) {
      mkdirSync(resolve(SOCIAL, lang), { recursive: true })
      for (const format of Object.keys(SOCIAL_FORMATS)) {
        const lot = visuels.filter((v) => v.format === format)
        if (!lot.length) continue
        const f = socialFormat(format)
        const bloquees = []
        const context = await browser.newContext({ viewport: { width: f.width / f.scale, height: f.height / f.scale }, deviceScaleFactor: f.scale, locale: lang })
        await horsReseau(context, bloquees)
        const page = await context.newPage()
        for (const v of lot) {
          await page.setContent(pageSociale({ id: v.id, lang }), { waitUntil: 'load' })
          await preparer(page)
          const releves = await verifier(page, zoneSure({ format, role: v.role, dir: directionOf(lang) }))
          releves.forEach((p) => problemes.push(`${lang}/${v.id} — ${p}`))
          const png = stripAlpha(await page.screenshot({ type: 'png' }))
          if (bloquees.length) throw new Error(`${lang}/${v.id} : requête réseau — ${bloquees[0]}`)
          const info = pngInfo(png)
          if (info.width !== f.width || info.height !== f.height || info.colorType !== 2) {
            throw new Error(`${lang}/${v.id} : ${info.width}×${info.height} (type ${info.colorType}), attendu ${f.width}×${f.height} RVB`)
          }
          writeFileSync(cheminPng(lang, v.id), png)
          console.log(`${releves.length ? '⚠' : '✓'} ${relative(REPO_ROOT, cheminPng(lang, v.id))}${releves.length ? ` — ${releves.length} relevé(s)` : ''}`)
        }
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
  return problemes
}

// Planche contact d'un format et d'une langue : une ligne par concept, vignette + étiquette.
const planche = async (browser, format, lang) => {
  const f = socialFormat(format)
  const lot = VISUELS.filter((v) => v.format === format && existsSync(cheminPng(lang, v.id)))
  if (!lot.length) return null
  const largeur = { '9x16': 230, '4x5': 250, '1x1': 360, '16x9': 480, yt: 480 }[format]
  const hauteur = Math.round((largeur * f.height) / f.width)
  const lignes = [...new Set(lot.map((v) => v.concept))].map((c) => lot.filter((v) => v.concept === c))
  const colonnes = Math.max(...lignes.map((l) => l.length))
  const unique = lignes.every((l) => l.length === 1)
  const rangs = unique ? [lot] : lignes
  const cols = unique ? lot.length : colonnes
  const cellule = (v) => `<figure><img src="${pathToFileURL(cheminPng(lang, v.id))}" width="${largeur}" height="${hauteur}"><figcaption>${v.id} <b class="n-${v.nature}">[${v.nature}]</b></figcaption></figure>`
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#0f0c29;color:#e0e7ff;font:600 14px -apple-system,system-ui,sans-serif}
    h1{margin:0;padding:28px 32px 4px;font-size:26px;color:#fff} p{margin:0 32px 20px;color:#a5b4fc;font-weight:500}
    .rang{display:grid;grid-template-columns:repeat(${cols},${largeur}px);gap:18px;padding:0 32px 22px}
    figure{margin:0} img{display:block;border-radius:12px;box-shadow:0 10px 28px #0009}
    figcaption{margin-top:7px;font-size:12.5px;color:#c7d2fe} b{font-weight:800} .n-R{color:#34d399} .n-MS{color:#fbbf24} .n-F{color:#f472b6}
  </style><h1>Meeshy — kit social ${format} — ${lang}</h1><p>${f.usage} · ${f.width}×${f.height} · ${lot.length} visuels · [R] réel · [MS] mis en scène · [F] maquette</p>
  ${rangs.map((r) => `<div class="rang">${r.map(cellule).join('')}</div>`).join('')}`
  const tmp = resolve(PLANCHES, `.social-${format}-${lang}.html`)
  writeFileSync(tmp, html)
  const context = await browser.newContext({ viewport: { width: 64 + cols * (largeur + 18), height: 400 }, deviceScaleFactor: 1 })
  await horsReseau(context, [])
  const page = await context.newPage()
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' })
  const sortie = resolve(PLANCHES, `social-${format}-${lang}.png`)
  writeFileSync(sortie, stripAlpha(await page.screenshot({ type: 'png', fullPage: true })))
  await context.close()
  console.log(`▦ ${relative(REPO_ROOT, sortie)}`)
  return sortie
}

const planches = async (langs) => {
  mkdirSync(PLANCHES, { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const lang of langs) for (const format of Object.keys(SOCIAL_FORMATS)) await planche(browser, format, lang)
  } finally {
    await browser.close()
  }
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      lang: { type: 'string', default: 'all' },
      id: { type: 'string' },
      planches: { type: 'boolean', default: false },
    },
  })
  const langs = values.lang === 'all' ? KIT_LANGS : values.lang.split(',')
  mkdirSync(SOCIAL, { recursive: true })
  if (values.planches) return planches(langs)
  const problemes = await rendre({ langs, visuels: selection(values.id) })
  writeFileSync(resolve(SOCIAL, 'manifest.json'), `${JSON.stringify({ source: 'docs/marketing/campagne-2026-09/contenu-par-format.md', issue: '#7728', natures: { R: 'écran réel de l’app', MS: 'écran réel mis en scène', F: 'maquette, jamais présentée comme un écran' }, fabrication: 'écrans reproduits en HTML/CSS depuis les vues SwiftUI (scripts/marketing-kit) ; les [R] et [MS] se remplacent par les captures simulateur des comptes de démo quand elles existent', visuels: manifeste(KIT_LANGS) }, null, 2)}\n`)
  writeFileSync(resolve(SOCIAL, 'publications-meeshy.md'), `${publicationsMarkdown()}\n`)
  writeFileSync(resolve(SOCIAL, 'verification.json'), `${JSON.stringify({ problemes }, null, 2)}\n`)
  await planches(langs)
  if (problemes.length) {
    console.error(`✗ ${problemes.length} débordement(s) :\n${problemes.map((p) => `  ${p}`).join('\n')}`)
    process.exitCode = 1
    return
  }
  console.log('✓ aucun débordement')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  })
}
