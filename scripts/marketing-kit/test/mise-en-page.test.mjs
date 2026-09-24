import { describe, expect, test } from 'bun:test'
import { typo } from '../lib/composants.mjs'
import { coupeLegende, page } from '../lib/gabarits.mjs'
import { SEQUENCES } from '../lib/sequences.mjs'
import { KIT_LANGS } from '../lib/locales.mjs'

describe('typographie', () => {
  test('le français prend une espace fine insécable avant ? ! : ;', () => {
    expect(typo('On se voit ? Oui !', 'fr')).toBe('On se voit ? Oui !')
    expect(typo('See you? Yes!', 'en')).toBe('See you? Yes!')
  })

  test('le deux-points français prend une espace insécable pleine, visible sur un titre', () => {
    expect(typo('Ton tour : dis bonjour', 'fr')).toBe('Ton tour\u00A0: dis bonjour')
  })

  test('un emoji final ne part jamais seul à la ligne', () => {
    expect(typo('Je fais les stickers ✨', 'fr')).toBe('Je fais les stickers ✨')
  })
})

describe('légende en deux temps', () => {
  test('coupe après la première phrase', () => {
    expect(coupeLegende('Ta voix. Leur langue.')).toEqual(['Ta voix.', 'Leur langue.'])
    expect(coupeLegende('صوتك. بلغتهم.')).toEqual(['صوتك.', 'بلغتهم.'])
  })
})

describe('pages rendues', () => {
  test('chaque gabarit de chaque format se compose dans les sept langues, sans ressource externe', () => {
    for (const [format, planches] of Object.entries(SEQUENCES)) {
      for (const lang of KIT_LANGS) {
        for (const { id } of planches) {
          const html = page({ format, lang, gabarit: id })
          expect(html).not.toMatch(/(src|href)=["']https?:/)
          expect(html).not.toMatch(/url\(["']?https?:/)
        }
      }
    }
  })

  test('l’arabe est rendu de droite à gauche', () => {
    expect(page({ format: 'iphone-6.9', lang: 'ar', gabarit: '03-global' })).toMatch(/<html lang="ar" dir="rtl">/)
  })
})
