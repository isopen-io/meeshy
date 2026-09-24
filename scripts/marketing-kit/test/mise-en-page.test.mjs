import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium } from '@playwright/test'
import { pageCapture } from '../templates/appstore/composition.mjs'
import { pageSociale } from '../templates/social/page.mjs'
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

describe('révélation d’un badge (AchievementRevealView)', () => {
  let browser
  let navigateur

  beforeAll(async () => {
    browser = await chromium.launch()
    navigateur = await browser.newPage({ viewport: { width: 540, height: 960 } })
  })

  afterAll(async () => {
    await browser?.close()
  })

  const croisements = () =>
    navigateur.evaluate(() => {
      const redresser = (el) => {
        if (!el) return
        el.style.transform = 'none'
        el.style.rotate = 'none'
        redresser(el.parentElement)
      }
      redresser(document.querySelector('.reveal')?.parentElement)
      const boite = (el) => el.getBoundingClientRect()
      const croise = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const textes = [...document.querySelectorAll('.reveal-eyebrow, .reveal-title')]
      const rayons = [...document.querySelectorAll('.reveal-rays i')]
      if (rayons.length !== 12 || textes.length !== 2) return [`structure inattendue : ${rayons.length} rayons, ${textes.length} textes`]
      return rayons.flatMap((r, i) =>
        textes.filter((t) => croise(boite(r), boite(t))).map((t) => `rayon ${i} × ${t.className} « ${t.textContent.trim()} »`),
      )
    })

  test('aucun rayon ne barre le surtitre ni le titre, dans la capture App Store 8 et les visuels sociaux, en sept langues', async () => {
    const fautes = []
    for (const lang of KIT_LANGS) {
      await navigateur.setContent(pageCapture({ appareil: 'iphone', lang, rang: 8 }))
      ;(await croisements()).forEach((f) => fautes.push(`${lang}/iphone69_08 — ${f}`))
      for (const id of ['V3-3', 'V8-3', 'C2-4', 'C4-4']) {
        await navigateur.setContent(pageSociale({ id, lang }))
        ;(await croisements()).forEach((f) => fautes.push(`${lang}/${id} — ${f}`))
      }
    }
    expect(fautes).toEqual([])
  })
})
