import { describe, expect, test } from 'bun:test'
import { serve } from '../lib/prism.mjs'

const message = (overrides = {}) => ({
  lang: 'es',
  text: '¡Yo! Llevo la pancarta 🙌',
  translations: { fr: 'Moi ! J’apporte la banderole 🙌', en: 'Me! I’ll bring the banner 🙌' },
  ...overrides,
})

describe('Prisme Linguistique du kit — le lecteur lit dans sa langue', () => {
  test('un message dans une autre langue est servi traduit, avec sa langue d’origine', () => {
    expect(serve(message(), 'fr')).toEqual({
      text: 'Moi ! J’apporte la banderole 🙌',
      lang: 'fr',
      originalLang: 'es',
      translated: true,
    })
  })

  test('un message déjà dans la langue du lecteur est servi tel quel, sans badge de traduction', () => {
    expect(serve(message(), 'es')).toEqual({
      text: '¡Yo! Llevo la pancarta 🙌',
      lang: 'es',
      originalLang: 'es',
      translated: false,
    })
  })

  test('une traduction manquante FAIT ÉCHOUER le rendu — une capture ne montre jamais l’original à la place', () => {
    expect(() => serve(message(), 'de')).toThrow(/de/)
  })
})
