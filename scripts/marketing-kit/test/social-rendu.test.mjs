import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium } from '@playwright/test'
import { preparer, verifier, zoneSure } from '../templates/social/rendu.mjs'
import { pageSociale } from '../templates/social/page.mjs'

let browser
let page

beforeAll(async () => {
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 540, height: 960 } })
})

afterAll(async () => {
  await browser?.close()
})

const scene = (corps) =>
  `<!doctype html><html lang="fr" dir="ltr"><body style="margin:0"><div class="canvas social" style="position:relative;overflow:hidden;width:540px;height:960px">${corps}</div></body></html>`

describe('zone sûre', () => {
  test('les vidéos verticales gardent 5 % en haut, 16 % en bas et 11 % en fin de ligne', () => {
    expect(zoneSure({ format: '9x16', role: 'couverture', dir: 'ltr' })).toEqual({ haut: 48, bas: 806.4, gauche: 32.4, droite: 480.6 })
    expect(zoneSure({ format: '9x16', role: 'couverture', dir: 'rtl' })).toEqual({ haut: 48, bas: 806.4, gauche: 59.4, droite: 507.6 })
  })

  test('une story Meeshy laisse les barres et le champ de réponse du lecteur', () => {
    expect(zoneSure({ format: '9x16', role: 'story Meeshy', dir: 'ltr' })).toMatchObject({ haut: 134.4, bas: 806.4 })
  })
})

describe('mise en page dans le navigateur', () => {
  test('un titre trop grand est réduit jusqu’à tenir dans sa boîte', async () => {
    await page.setContent(scene('<h1 class="autofit" data-sur style="position:absolute;left:40px;top:100px;width:200px;height:80px;margin:0;font-size:40px;overflow:hidden">Un titre beaucoup trop long</h1>'))
    await preparer(page)
    const taille = await page.$eval('h1', (el) => parseFloat(el.style.fontSize))
    expect(taille).toBeLessThan(40)
    expect(await verifier(page, { haut: 0, bas: 960, gauche: 0, droite: 540 })).toEqual([])
  })

  test('le vérificateur signale un texte hors du cadre et un texte hors zone sûre', async () => {
    await page.setContent(scene('<p data-sur style="position:absolute;left:500px;top:40px;margin:0;font-size:20px;white-space:nowrap">Dépasse à droite</p><p data-sur style="position:absolute;left:40px;top:900px;margin:0;font-size:20px">Trop bas</p>'))
    await preparer(page)
    const problemes = await verifier(page, zoneSure({ format: '9x16', role: 'couverture', dir: 'ltr' }))
    expect(problemes.some((p) => p.includes('hors du cadre') && p.includes('Dépasse'))).toBe(true)
    expect(problemes.some((p) => p.includes('hors zone sûre') && p.includes('Trop bas'))).toBe(true)
  })

  test('une boîte qui déborde encore au plancher de réduction est signalée', async () => {
    await page.setContent(scene('<p class="autofit" data-sur style="position:absolute;left:40px;top:100px;width:60px;height:20px;margin:0;font-size:20px;white-space:nowrap;overflow:hidden">Impossible à caser</p>'))
    await preparer(page)
    expect((await verifier(page, { haut: 0, bas: 960, gauche: 0, droite: 540 })).some((p) => p.includes('déborde'))).toBe(true)
  })

  test('une loupe se cadre sur sa cible dans l’écran reproduit', async () => {
    await page.setContent(pageSociale({ id: 'V1-2', lang: 'fr' }))
    await preparer(page)
    const transform = await page.$eval('.loupe .loupe-vue', (el) => el.style.transform)
    expect(transform).toMatch(/scale\([\d.]+\) translate\(-?[\d.]+px, -?[\d.]+px\)/)
  })
})
