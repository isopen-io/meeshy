import { describe, expect, test } from 'bun:test'
import { chromium } from '@playwright/test'
import { pngInfo } from '../../lib/png.mjs'
import { pageCapture } from '../appstore/composition.mjs'
import { rendre } from '../appstore/render-appstore.mjs'
import { VITRINE } from './plan.mjs'
import { perimees } from './render-vitrine.mjs'

// Un PNG RVB 1×1 : on teste l'HABILLAGE, pas l'écran.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')

describe('habillage des vraies captures (#8855)', () => {
  test('la vraie capture remplit l’écran du cadre, sous le titre de sa scène', () => {
    const html = pageCapture({ appareil: 'iphone', lang: 'fr', rang: 5, plan: VITRINE, ecranReel: PNG })
    expect(html).toContain(`<img class="ecran-reel" src="data:image/png;base64,${PNG.toString('base64')}"`)
    expect(html).toMatch(/class="device-screen"[\s\S]*class="ecran-reel"/)
    expect(html).toContain('Garde ta série')
  })

  test('l’habillage retire les captures d’un plan précédent, jamais celles de l’autre appareil', () => {
    const noms = ['iphone69_01_global.png', 'iphone69_01_amour.png', 'ipad13_01_global.png', 'lisez-moi.txt']
    expect(perimees(noms, { appareil: 'iphone', lang: 'fr' })).toEqual(['iphone69_01_global.png'])
  })

  test('Imagine a son titre, sur ses deux lignes', () => {
    const html = pageCapture({ appareil: 'iphone', lang: 'fr', rang: 6, plan: VITRINE, ecranReel: PNG })
    expect(html.replace(/<[^>]+>/g, '')).toContain('Un message. Une image. Sa langue.')
  })

  test('sans capture (mesure du corps de titre), la page se compose sans écran', () => {
    const html = pageCapture({ appareil: 'ipad', lang: 'ar', rang: 1, plan: VITRINE })
    expect(html).toContain('class="as-caption')
    expect(html).not.toContain('<img class="ecran-reel"')
  })

  test('le panorama suit la longueur de la vitrine, pas celle de l’ancien plan', () => {
    const html = pageCapture({ appareil: 'iphone', lang: 'fr', rang: 3, plan: VITRINE, ecranReel: PNG })
    expect(html).toContain('--pano-x:-880px')
    expect(html).toContain(`width:${440 * VITRINE.iphone.captures.length}px`)
  })

  test('une vraie capture habillée sort à la taille App Store, en RVB sans alpha', async () => {
    const browser = await chromium.launch()
    try {
      const a = VITRINE.iphone
      const html = pageCapture({ appareil: 'iphone', lang: 'fr', rang: 1, plan: VITRINE, ecranReel: PNG })
      const { png, mesure } = await rendre(browser, { html, width: a.width, height: a.height, scale: a.scale })
      expect(mesure.erreurs).toEqual([])
      expect(pngInfo(png)).toEqual({ width: 1320, height: 2868, colorType: 2, bitDepth: 8 })
    } finally {
      await browser.close()
    }
  }, 30_000)
})
