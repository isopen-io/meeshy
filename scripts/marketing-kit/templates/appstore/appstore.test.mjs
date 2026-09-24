import { describe, expect, test } from 'bun:test'
import { KIT_LANGS } from '../../lib/locales.mjs'
import { LEGENDES } from '../../textes/legendes.mjs'
import { APPAREILS, POSTER, cheminFastlane, cheminPoster, graphemes } from './plan.mjs'
import { pageCapture, pagePoster } from './composition.mjs'

const theme = (sequence) => sequence.map((c) => (c.theme === 'dark' ? 'S' : 'C')).join('-')

describe('séquences App Store (captures-app-store.md § 2-3)', () => {
  test('iPhone : dix captures, légendes L1→L10, alternance S-C-S-C-S-S-C-S-S-C', () => {
    const { captures } = APPAREILS.iphone
    expect(captures.map((c) => c.legende)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'])
    expect(theme(captures)).toBe('S-C-S-C-S-S-C-S-S-C')
  })

  test('iPad : sept captures P1→P7 avec les légendes du § 3', () => {
    const { captures } = APPAREILS.ipad
    expect(captures.map((c) => c.legende)).toEqual(['L1', 'L3', 'L4', 'L2', 'L7', 'L9', 'L6'])
    expect(theme(captures)).toBe('S-C-S-C-C-S-S')
  })

  test('tailles exigées par App Store Connect', () => {
    expect([APPAREILS.iphone.width, APPAREILS.iphone.height]).toEqual([1320, 2868])
    expect([APPAREILS.ipad.width, APPAREILS.ipad.height]).toEqual([2752, 2064])
    expect([POSTER.width, POSTER.height]).toEqual([886, 1920])
  })
})

describe('fichiers fastlane', () => {
  test('les locales fastlane et le nommage iphone69_NN / ipad13_NN', () => {
    expect(cheminFastlane({ appareil: 'iphone', lang: 'fr', rang: 1 })).toMatch(/apps\/ios\/fastlane\/screenshots\/fr-FR\/iphone69_01\.png$/)
    expect(cheminFastlane({ appareil: 'iphone', lang: 'pt', rang: 10 })).toMatch(/screenshots\/pt-BR\/iphone69_10\.png$/)
    expect(cheminFastlane({ appareil: 'ipad', lang: 'it', rang: 7 })).toMatch(/screenshots\/it\/ipad13_07\.png$/)
    expect(cheminFastlane({ appareil: 'ipad', lang: 'ar', rang: 2 })).toMatch(/screenshots\/ar-SA\/ipad13_02\.png$/)
  })

  test('le poster ne va JAMAIS dans screenshots/ : deliver le téléverserait comme capture', () => {
    for (const lang of KIT_LANGS) expect(cheminPoster(lang)).not.toMatch(/fastlane\/screenshots/)
  })
})

describe('textes', () => {
  test('chaque légende tient en 40 caractères dans les sept langues', () => {
    for (const cle of Object.keys(LEGENDES)) {
      for (const lang of KIT_LANGS) expect(graphemes(LEGENDES[cle][lang])).toBeLessThanOrEqual(40)
    }
  })

  test('le poster d’App Preview a ses deux surimpressions dans les sept langues', () => {
    for (const lang of KIT_LANGS) {
      const { avant, apres } = POSTER.textes[lang]
      expect(avant.length).toBeGreaterThan(3)
      expect(apres.length).toBeGreaterThan(3)
      expect(graphemes(avant)).toBeLessThanOrEqual(40)
      expect(graphemes(apres)).toBeLessThanOrEqual(40)
    }
  })
})

describe('pages composées', () => {
  test('chaque capture de chaque appareil se compose dans les sept langues, sans ressource externe', () => {
    for (const appareil of Object.keys(APPAREILS)) {
      for (const lang of KIT_LANGS) {
        APPAREILS[appareil].captures.forEach((capture, i) => {
          const html = pageCapture({ appareil, lang, rang: i + 1 })
          expect(html).not.toMatch(/(src|href)=["']https?:/)
          expect(html).not.toMatch(/url\(["']?https?:/)
          expect(html).toContain('class="as-caption')
        })
      }
    }
  })

  test('l’arabe est composé de droite à gauche, légende et gabarit compris', () => {
    const html = pageCapture({ appareil: 'iphone', lang: 'ar', rang: 3 })
    expect(html).toMatch(/<html lang="ar" dir="rtl">/)
    expect(html).toMatch(/class="as-canvas[^"]*" dir="rtl"/)
  })

  test('le décor est un panorama : la capture N le décale de N-1 largeurs', () => {
    expect(pageCapture({ appareil: 'iphone', lang: 'fr', rang: 1 })).toContain('--pano-x:0px')
    expect(pageCapture({ appareil: 'iphone', lang: 'fr', rang: 4 })).toContain('--pano-x:-1320px')
  })

  test('le poster montre l’écran seul, sans cadre d’appareil (2.3.4)', () => {
    for (const lang of KIT_LANGS) {
      const html = pagePoster({ lang })
      expect(html).not.toContain('class="device ')
      expect(html).toContain(POSTER.textes[lang].apres.replace(/'/g, '&#39;'))
    }
  })
})
