import { describe, expect, test } from 'bun:test'
import { toString } from '../lib/html.mjs'
import { contexte, ecran } from '../lib/gabarits.mjs'
import { pageSociale } from '../templates/social/page.mjs'
import { pageCapture } from '../templates/appstore/composition.mjs'

const texteVisible = (page) => page.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

// L'arabe accorde le nom compté : 3 à 10 ⇒ « أيام » (pluriel), 11 à 99 ⇒ « يومًا » (singulier
// accusatif), 2 ⇒ duel « يومان ». « 12 أيام », « 21 أيام », « 2 أيام » sont des fautes.
const faussesJournees = (texte) =>
  [...texte.matchAll(/(\d+)\s*أيام/g)].map((m) => Number(m[1])).filter((n) => n < 3 || n > 10)

describe('accord du nombre en arabe — « أيام » seulement de 3 à 10', () => {
  test('l’écran Progression de démo', () => {
    expect(faussesJournees(toString(ecran('progression', contexte({ lang: 'ar', theme: 'light' }))))).toEqual([])
  })

  test('les captures App Store Progression (iPhone 7, iPad 5)', () => {
    expect(faussesJournees(texteVisible(pageCapture({ appareil: 'iphone', lang: 'ar', rang: 7 })))).toEqual([])
    expect(faussesJournees(texteVisible(pageCapture({ appareil: 'ipad', lang: 'ar', rang: 5 })))).toEqual([])
  })

  test('les visuels sociaux qui montrent une série (V3 « jour 30 », C2-5 « jour 1 », C4-2)', () => {
    for (const id of ['V3-0-couverture', 'V3-2', 'V3-3', 'C2-5', 'C4-2', 'X5']) {
      expect({ id, fautes: faussesJournees(texteVisible(pageSociale({ id, lang: 'ar' }))) }).toEqual({ id, fautes: [] })
    }
  })
})

describe('direction des bulles mêlant deux écritures', () => {
  test('miniature Y1 en arabe : la bulle coréenne se lit de gauche à droite, la bulle arabe de droite à gauche', () => {
    const page = pageSociale({ id: 'Y1', lang: 'ar' })
    expect(page).toMatch(/<div class="yt-b ko" lang="ko" dir="ltr">/)
    expect(page).toMatch(/<div class="yt-b moi" lang="ar" dir="rtl">/)
  })

  test('en français, la bulle « moi » porte sa langue et sa direction', () => {
    expect(pageSociale({ id: 'Y1', lang: 'fr' })).toMatch(/<div class="yt-b moi" lang="fr" dir="ltr">/)
  })
})
