import { describe, expect, test } from 'bun:test'
import { FORMATS } from '../lib/formats.mjs'
import { KIT_LANGS, directionOf, appStoreLocale } from '../lib/locales.mjs'

describe('formats de sortie', () => {
  test('App Store : iPhone 6,9" 1320×2868 portrait, iPad 13" 2752×2064 paysage', () => {
    expect(FORMATS['iphone-6.9']).toMatchObject({ width: 1320, height: 2868 })
    expect(FORMATS['ipad-13']).toMatchObject({ width: 2752, height: 2064 })
  })

  test('réseaux sociaux : 9:16, 4:5, 1:1, 16:9', () => {
    expect(FORMATS['social-9x16']).toMatchObject({ width: 1080, height: 1920 })
    expect(FORMATS['social-4x5']).toMatchObject({ width: 1080, height: 1350 })
    expect(FORMATS['social-1x1']).toMatchObject({ width: 1080, height: 1080 })
    expect(FORMATS['social-16x9']).toMatchObject({ width: 1920, height: 1080 })
  })
})

describe('langues du kit', () => {
  test('les sept langues de l’app', () => {
    expect(KIT_LANGS).toEqual(['fr', 'en', 'es', 'de', 'it', 'pt', 'ar'])
  })

  test('l’arabe se lit de droite à gauche, les autres de gauche à droite', () => {
    expect(directionOf('ar')).toBe('rtl')
    expect(KIT_LANGS.filter((l) => l !== 'ar').map(directionOf)).toEqual(Array(6).fill('ltr'))
  })

  test('chaque langue a son dossier de locale fastlane', () => {
    expect(KIT_LANGS.map(appStoreLocale)).toEqual(['fr-FR', 'en-US', 'es-ES', 'de-DE', 'it', 'pt-BR', 'ar-SA'])
  })
})

describe('dates', () => {
  test('l’arabe date en calendrier grégorien, chiffres occidentaux (comme la métadonnée ar-SA)', async () => {
    const { formatDate } = await import('../lib/locales.mjs')
    const date = formatDate('ar', '2026-09-23')
    expect(date).toContain('2026')
    expect(date).not.toContain('هـ')
  })
})
