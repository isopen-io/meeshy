import { describe, expect, test } from 'bun:test'
import { createCatalog, loadAppCatalog } from '../lib/catalog.mjs'

const catalogue = (strings) => createCatalog([{ sourceLanguage: 'fr', strings }])

describe('catalogue de chaînes iOS (xcstrings)', () => {
  test('rend la chaîne de la langue demandée et substitue %lld', () => {
    const t = catalogue({
      'progression.level': {
        localizations: {
          fr: { stringUnit: { value: 'Niveau %lld' } },
          ar: { stringUnit: { value: 'المستوى %lld' } },
        },
      },
    })
    expect(t('progression.level', 'fr', 7)).toBe('Niveau 7')
    expect(t('progression.level', 'ar', 7)).toBe('المستوى 7')
  })

  test('choisit la forme plurielle de la langue, et retombe sur « other » quand la catégorie manque', () => {
    const t = catalogue({
      'streak.days': {
        localizations: {
          en: {
            variations: {
              plural: {
                one: { stringUnit: { value: '%lld day in a row' } },
                other: { stringUnit: { value: '%lld days in a row' } },
              },
            },
          },
          ar: {
            variations: {
              plural: {
                one: { stringUnit: { value: 'يوم واحد' } },
                other: { stringUnit: { value: '%lld أيام' } },
              },
            },
          },
        },
      },
    })
    expect(t('streak.days', 'en', 1)).toBe('1 day in a row')
    expect(t('streak.days', 'en', 12)).toBe('12 days in a row')
    expect(t('streak.days', 'ar', 12)).toBe('12 أيام')
  })

  test('substitue les arguments positionnels %1$@ / %2$@ et %@', () => {
    const t = catalogue({
      'a.b': { localizations: { fr: { stringUnit: { value: 'Traduit de %1$@ vers %2$@' } } } },
      'joined': { localizations: { fr: { stringUnit: { value: '%@ a rejoint la conversation' } } } },
    })
    expect(t('a.b', 'fr', 'coréen', 'français')).toBe('Traduit de coréen vers français')
    expect(t('joined', 'fr', 'Amara')).toBe('Amara a rejoint la conversation')
  })

  test('le portugais du kit lit la localisation pt-BR de l’app', () => {
    const t = catalogue({ k: { localizations: { 'pt-BR': { stringUnit: { value: 'Progresso' } } } } })
    expect(t('k', 'pt')).toBe('Progresso')
  })

  test('une clé absente ou non traduite FAIT ÉCHOUER le rendu — jamais de repli silencieux vers une autre langue', () => {
    const t = catalogue({ k: { localizations: { fr: { stringUnit: { value: 'Bonjour' } } } } })
    expect(() => t('inconnue', 'fr')).toThrow(/inconnue/)
    expect(() => t('k', 'de')).toThrow(/de/)
  })

  test('le catalogue réel de l’app sert les sept langues du kit', () => {
    const t = loadAppCatalog()
    for (const lang of ['fr', 'en', 'es', 'de', 'it', 'pt', 'ar']) {
      expect(t('progression.title', lang).length).toBeGreaterThan(0)
    }
    expect(t('progression.hero.streak', 'fr')).toBe('Série')
    expect(t('bubble.joinNotice.joined', 'fr', 'Amara')).toBe('Amara a rejoint la conversation')
  })
})
