#!/usr/bin/env node
// Captures App Store (#7727) — rendu, dépôt fastlane, affiches, planches, vérification.
//
//   node scripts/marketing-kit/templates/appstore/render-appstore.mjs                 # tout, 7 langues
//   node scripts/marketing-kit/templates/appstore/render-appstore.mjs --lang fr --appareil iphone --rang 1,3
//   node scripts/marketing-kit/templates/appstore/render-appstore.mjs --verifier       # relit les PNG écrits
//
// Chaque page est rendue HORS RÉSEAU, aplatie en RVB (aucun alpha), mesurée en navigateur
// (légende dans sa boîte, texte dans l'image) puis relue sur disque (taille au pixel près).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { REPO_ROOT } from '../../lib/catalog.mjs'
import { KIT_LANGS, appStoreLocale } from '../../lib/locales.mjs'
import { pngInfo, stripAlpha } from '../../lib/png.mjs'
import { LEGENDES } from '../../textes/legendes.mjs'
import { APPAREILS, OUT_APPSTORE, POSTER, cheminFastlane, cheminPlanche, cheminPoster, graphemes } from './plan.mjs'
import { pageCapture, pagePoster } from './composition.mjs'

const RAPPORT = resolve(OUT_APPSTORE, 'appstore-verification.json')

const horsReseau = async (context, reseau) => {
  context.on('request', (req) => {
    if (!/^(data|file|about):/.test(req.url())) reseau.push(req.url())
  })
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (/^(data|file|about):/.test(url)) return route.continue()
    return route.abort('blockedbyclient')
  })
}

const verifierPng = (png, { width, height }) => {
  const info = pngInfo(png)
  const erreurs = []
  if (info.width !== width || info.height !== height) erreurs.push(`taille ${info.width}×${info.height}, attendu ${width}×${height}`)
  if (info.colorType !== 2) erreurs.push(`type de couleur ${info.colorType} (attendu 2 : RVB sans alpha)`)
  return erreurs
}

const rendre = async (browser, { html, width, height, scale }) => {
  const reseau = []
  const context = await browser.newContext({ viewport: { width: width / scale, height: height / scale }, deviceScaleFactor: scale })
  await horsReseau(context, reseau)
  const page = await context.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.asMiseEnPage())
    const mesure = await page.evaluate(() => window.asVerifier())
    const png = stripAlpha(await page.screenshot({ type: 'png', omitBackground: false }))
    if (reseau.length) mesure.erreurs.push(`${reseau.length} requête(s) réseau — ${reseau[0]}`)
    return { png, mesure }
  } finally {
    await context.close()
  }
}

const ecrire = (chemin, png) => {
  mkdirSync(dirname(chemin), { recursive: true })
  writeFileSync(chemin, png)
}

const liste = (valeur, tout) => (!valeur || valeur === 'all' ? tout : valeur.split(','))

const produire = async ({ langs, appareils, rangs }) => {
  const browser = await chromium.launch()
  const entrees = []
  try {
    for (const lang of langs) {
      for (const appareil of appareils) {
        if (appareil === 'poster') {
          const { png, mesure } = await rendre(browser, { html: pagePoster({ lang }), ...POSTER })
          const chemin = cheminPoster(lang)
          ecrire(chemin, png)
          entrees.push({ lang, appareil, rang: 1, chemin, texte: `${POSTER.textes[lang].avant} ${POSTER.textes[lang].apres}`, ...mesure })
          console.log(`${mesure.erreurs.length ? '✗' : '✓'} ${relative(REPO_ROOT, chemin)}`)
          continue
        }
        const a = APPAREILS[appareil]
        const numeros = rangs ?? a.captures.map((_, i) => i + 1)
        for (const rang of numeros.filter((r) => r <= a.captures.length)) {
          const { png, mesure } = await rendre(browser, { html: pageCapture({ appareil, lang, rang }), ...a })
          const chemin = cheminFastlane({ appareil, lang, rang })
          ecrire(chemin, png)
          const legende = LEGENDES[a.captures[rang - 1].legende][lang]
          entrees.push({ lang, appareil, rang, chemin, texte: legende, ...mesure })
          console.log(`${mesure.erreurs.length ? '✗' : '✓'} ${relative(REPO_ROOT, chemin)}${mesure.avertissements.length ? `  (${mesure.avertissements.length} avert.)` : ''}`)
        }
      }
    }
  } finally {
    await browser.close()
  }
  return entrees
}

// Relit chaque fichier attendu : existence, taille, RVB, légende ≤ 40 caractères.
const controleDisque = (langs) =>
  langs.flatMap((lang) => [
    ...Object.entries(APPAREILS).flatMap(([appareil, a]) =>
      a.captures.map((c, i) => {
        const chemin = cheminFastlane({ appareil, lang, rang: i + 1 })
        const texte = LEGENDES[c.legende][lang]
        const erreurs = existsSync(chemin) ? verifierPng(readFileSync(chemin), a) : ['fichier absent']
        if (graphemes(texte) > 40) erreurs.push(`légende de ${graphemes(texte)} caractères (> 40)`)
        return { lang, appareil, rang: i + 1, chemin, erreurs }
      }),
    ),
    (() => {
      const chemin = cheminPoster(lang)
      return { lang, appareil: 'poster', rang: 1, chemin, erreurs: existsSync(chemin) ? verifierPng(readFileSync(chemin), POSTER) : ['fichier absent'] }
    })(),
  ])

// Planche contact d'une locale : les dix iPhone, puis les sept iPad et l'affiche.
const planche = async (browser, lang) => {
  const url = (chemin) => pathToFileURL(chemin).href
  const iphones = APPAREILS.iphone.captures.map((_, i) => cheminFastlane({ appareil: 'iphone', lang, rang: i + 1 }))
  const ipads = APPAREILS.ipad.captures.map((_, i) => cheminFastlane({ appareil: 'ipad', lang, rang: i + 1 }))
  const vignette = (chemin, cls, legende) =>
    existsSync(chemin) ? `<figure class="${cls}"><img src="${url(chemin)}"><figcaption>${legende}</figcaption></figure>` : `<figure class="${cls} vide"></figure>`
  const locale = appStoreLocale(lang)
  const doc = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#0f0c29;color:#e0e7ff;font:600 15px -apple-system,system-ui,sans-serif;width:2400px}
    header{padding:36px 40px 12px;display:flex;align-items:baseline;gap:18px}
    h1{margin:0;font-size:34px;color:#fff;letter-spacing:-.5px} header span{color:#a5b4fc;font-weight:500}
    h2{margin:26px 40px 12px;font-size:17px;color:#c7d2fe;letter-spacing:.3px;text-transform:uppercase}
    .rang{display:grid;gap:16px;padding:0 40px}
    .iphone{grid-template-columns:repeat(10,1fr)} .ipad{grid-template-columns:repeat(4,1fr)}
    figure{margin:0} img{display:block;width:100%;border-radius:12px;box-shadow:0 10px 28px #0009}
    figcaption{margin-top:8px;font-size:12px;color:#a5b4fc;font-weight:500}
    .poster{display:flex;flex-direction:column;align-items:center} .poster img{width:auto;height:420px}
    .vide{aspect-ratio:1320/2868;border:1px dashed #4338ca;border-radius:12px}
    footer{height:40px}
  </style>
  <header><h1>Meeshy — App Store — ${locale}</h1><span>iPhone 6,9" 1320×2868 · iPad 13" 2752×2064 · affiche App Preview 886×1920</span></header>
  <h2>iPhone 6,9"</h2><div class="rang iphone">${iphones.map((c, i) => vignette(c, '', `iphone69_${String(i + 1).padStart(2, '0')}`)).join('')}</div>
  <h2>iPad 13" · affiche d’App Preview</h2><div class="rang ipad">${ipads.map((c, i) => vignette(c, '', `ipad13_${String(i + 1).padStart(2, '0')}`)).join('')}${vignette(cheminPoster(lang), 'poster', 'affiche App Preview (seconde 5)')}</div>
  <footer></footer>`
  const tmp = resolve(OUT_APPSTORE, 'planches', `.appstore-${locale}.html`)
  mkdirSync(dirname(tmp), { recursive: true })
  writeFileSync(tmp, doc)
  const reseau = []
  const context = await browser.newContext({ viewport: { width: 2400, height: 800 }, deviceScaleFactor: 1 })
  await horsReseau(context, reseau)
  const page = await context.newPage()
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' })
  const sortie = cheminPlanche(lang)
  writeFileSync(sortie, stripAlpha(await page.screenshot({ type: 'png', fullPage: true })))
  await context.close()
  console.log(`▦ ${relative(REPO_ROOT, sortie)}`)
}

const planches = async (langs) => {
  const browser = await chromium.launch()
  try {
    for (const lang of langs) await planche(browser, lang)
  } finally {
    await browser.close()
  }
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      lang: { type: 'string', default: 'all' },
      appareil: { type: 'string', default: 'all' },
      rang: { type: 'string' },
      verifier: { type: 'boolean', default: false },
      'sans-planches': { type: 'boolean', default: false },
    },
  })
  const langs = liste(values.lang, KIT_LANGS)
  const rendus = values.verifier
    ? []
    : await produire({
        langs,
        appareils: liste(values.appareil, ['iphone', 'ipad', 'poster']),
        rangs: values.rang ? values.rang.split(',').map(Number) : undefined,
      })
  if (!values.verifier && !values['sans-planches']) await planches(langs)
  const disque = controleDisque(langs)
  const precedent = existsSync(RAPPORT) ? JSON.parse(readFileSync(RAPPORT, 'utf8')) : { mesures: [] }
  const cle = (e) => `${e.lang}/${e.appareil}/${e.rang}`
  const nouvelles = new Map(rendus.map((e) => [cle(e), { ...e, chemin: relative(REPO_ROOT, e.chemin) }]))
  const mesures = [...precedent.mesures.filter((e) => !nouvelles.has(cle(e))), ...nouvelles.values()]
  const rapport = { date: new Date().toISOString(), mesures, disque: disque.map((e) => ({ ...e, chemin: relative(REPO_ROOT, e.chemin) })) }
  mkdirSync(dirname(RAPPORT), { recursive: true })
  writeFileSync(RAPPORT, JSON.stringify(rapport, null, 2))
  const erreursMesure = mesures.filter((e) => e.erreurs.length)
  const erreursDisque = rapport.disque.filter((e) => e.erreurs.length && (values.verifier || langs.includes(e.lang)))
  const avert = mesures.reduce((n, e) => n + e.avertissements.length, 0)
  for (const e of [...erreursMesure, ...erreursDisque]) console.error(`✗ ${e.chemin} — ${e.erreurs.join(' ; ')}`)
  console.log(`\nvérification : ${rapport.disque.length} fichiers relus, ${erreursDisque.length} en erreur ; ${mesures.length} pages mesurées, ${erreursMesure.length} en erreur, ${avert} avertissement(s) — ${relative(REPO_ROOT, RAPPORT)}`)
  if (erreursMesure.length || erreursDisque.length) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`✗ ${error.stack ?? error.message}`)
    process.exit(1)
  })
}
