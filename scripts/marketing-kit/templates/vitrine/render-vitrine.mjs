#!/usr/bin/env node
// Habille les VRAIES captures de la vitrine (#8855) : fond, titre, cadre — et la planche contact.
//   node scripts/marketing-kit/templates/vitrine/render-vitrine.mjs --lang fr --appareil iphone,ipad --planche
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { REPO_ROOT } from '../../lib/catalog.mjs'
import { KIT_LANGS, appStoreLocale } from '../../lib/locales.mjs'
import { pngInfo, stripAlpha } from '../../lib/png.mjs'
import { pageCapture } from '../appstore/composition.mjs'
import { corpsDeSerie, rendre } from '../appstore/render-appstore.mjs'
import { cheminBrut } from '../../vitrine/capturer.mjs'
import { VITRINE } from './plan.mjs'

export const SORTIE_FINALE = resolve(REPO_ROOT, 'scripts/marketing-kit/out/vitrine/final')

export const cheminFinal = ({ appareil, lang, rang }) => {
  const a = VITRINE[appareil]
  return resolve(SORTIE_FINALE, appStoreLocale(lang), `${a.prefixe}_${String(rang).padStart(2, '0')}_${a.captures[rang - 1].scene}.png`)
}

// Les captures qu'un plan précédent a rangées là (le lot 1 avait trois scènes, dans un autre ordre) :
// un envoi qui lirait le dossier les publierait à côté du jeu courant.
export const perimees = (noms, { appareil, lang }) => {
  const a = VITRINE[appareil]
  const attendues = new Set(a.captures.map((_, i) => basename(cheminFinal({ appareil, lang, rang: i + 1 }))))
  return noms.filter((nom) => nom.startsWith(`${a.prefixe}_`) && !attendues.has(nom))
}

const habiller = async (browser, { lang, appareil }) => {
  const a = VITRINE[appareil]
  const dossier = resolve(SORTIE_FINALE, appStoreLocale(lang))
  if (existsSync(dossier)) for (const nom of perimees(readdirSync(dossier), { appareil, lang })) rmSync(resolve(dossier, nom))
  const corps = await corpsDeSerie(browser, { appareil, lang, plan: VITRINE })
  for (const [i, capture] of a.captures.entries()) {
    const brut = cheminBrut({ appareil, lang, scene: capture.scene })
    if (!existsSync(brut)) throw new Error(`capture brute absente : ${brut} — lancer vitrine/capturer.mjs`)
    const html = pageCapture({ appareil, lang, rang: i + 1, corps, plan: VITRINE, ecranReel: readFileSync(brut) })
    const { png, mesure } = await rendre(browser, { html, width: a.width, height: a.height, scale: a.scale })
    if (mesure.erreurs.length) throw new Error(`${appareil}/${lang}/${capture.scene} : ${mesure.erreurs.join(' ; ')}`)
    const info = pngInfo(png)
    if (info.width !== a.width || info.height !== a.height || info.colorType !== 2) {
      throw new Error(`${appareil}/${lang}/${capture.scene} : ${info.width}×${info.height} (type ${info.colorType}), attendu ${a.width}×${a.height} RVB`)
    }
    const sortie = cheminFinal({ appareil, lang, rang: i + 1 })
    mkdirSync(dirname(sortie), { recursive: true })
    writeFileSync(sortie, png)
    console.log(`✓ ${sortie}`)
  }
}

const planche = async (browser, lang) => {
  const cellules = Object.entries(VITRINE)
    .flatMap(([appareil, a]) => a.captures.map((_, i) => cheminFinal({ appareil, lang, rang: i + 1 })))
    .filter(existsSync)
    .map((chemin) => `<img src="${pathToFileURL(chemin).href}">`)
    .join('')
  const tmp = resolve(REPO_ROOT, 'scripts/marketing-kit/out/vitrine/planches', `.${appStoreLocale(lang)}.html`)
  mkdirSync(dirname(tmp), { recursive: true })
  writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#0f0c29;display:flex;gap:16px;align-items:flex-start}img{height:900px;border-radius:12px}</style>${cellules}`)
  const page = await browser.newPage({ viewport: { width: 2400, height: 950 } })
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' })
  const sortie = resolve(dirname(tmp), `${appStoreLocale(lang)}.png`)
  writeFileSync(sortie, stripAlpha(await page.screenshot({ type: 'png', fullPage: true })))
  await page.close()
  console.log(`▦ ${sortie}`)
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      lang: { type: 'string', default: 'fr' },
      appareil: { type: 'string', default: 'iphone,ipad' },
      planche: { type: 'boolean', default: false },
    },
  })
  const langs = values.lang === 'all' ? KIT_LANGS : values.lang.split(',')
  const browser = await chromium.launch()
  try {
    for (const lang of langs) {
      for (const appareil of values.appareil.split(',')) await habiller(browser, { lang, appareil })
      if (values.planche) await planche(browser, lang)
    }
  } finally {
    await browser.close()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erreur) => {
    console.error(`✗ ${erreur.message}`)
    process.exit(1)
  })
}
