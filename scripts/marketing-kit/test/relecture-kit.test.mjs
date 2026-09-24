import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { typo } from '../lib/composants.mjs'
import { contexte, ecran } from '../lib/gabarits.mjs'
import { toString } from '../lib/html.mjs'
import { KIT_LANGS } from '../lib/locales.mjs'
import { suggestionsDecouverte } from '../screens/social.mjs'
import { profilDe } from '../textes/demo.mjs'
import { pageCapture, pagePoster } from '../templates/appstore/composition.mjs'
import { corpsDeSerie } from '../templates/appstore/render-appstore.mjs'
import { APPAREILS } from '../templates/appstore/plan.mjs'
import { pageSociale } from '../templates/social/page.mjs'
import { LIBELLES } from '../templates/social/textes/annonces.mjs'
import { STORIES } from '../templates/social/textes/videos.mjs'
import { OUT_DIR, cheminSortie, nomPlanche } from '../render.mjs'

const LENT = 120_000
const sansStyle = (page) => page.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, '')

describe('typographie', () => {
  test('un nombre ne se sépare jamais de son unité : « à 19 h », « 5 min », « 12 km »', () => {
    expect(typo('On se retrouve à 19 h devant la salle', 'fr')).toContain('19 h')
    expect(typo('Encore 5 min et 12 km', 'fr')).toContain('5 min')
    expect(typo('Encore 5 min et 12 km', 'fr')).toContain('12 km')
    expect(typo('10 heures', 'fr')).toBe('10 heures')
  })
})

describe('révélation en allemand', () => {
  test('après le numéral, seul l’adjectif passe en minuscule : « 10 geknüpfte Freundschaften »', () => {
    const page = toString(ecran('succes', contexte({ lang: 'de', theme: 'dark' })))
    expect(page).toContain('10 geknüpfte Freundschaften')
  })
})

describe('capture 05 — les drapeaux sont les PAYS des amis affichés', () => {
  test.each(KIT_LANGS)('%s : la rangée reprend les drapeaux des suggestions de l’écran Découvrir', (lang) => {
    const page = pageCapture({ appareil: 'iphone', lang, rang: 5 })
    const rangee = page.match(/<div class="as-rangee as-pile">([\s\S]*?)<\/div>/)[1]
    const drapeaux = [...rangee.matchAll(/<span class="as-flag">([^<]+)<\/span>/g)].map((m) => m[1])
    expect(drapeaux).toEqual(suggestionsDecouverte(lang).map((p) => profilDe(p).drapeau))
  })
})

describe('appel à télécharger — aucune marque tierce', () => {
  test('le libellé ne nomme l’App Store dans aucune langue', () => {
    for (const lang of KIT_LANGS) expect(LIBELLES.telecharger[lang]).not.toMatch(/App\s*Store/i)
  })

  test.each(['C1-6', 'C2-6', 'C3-7', 'C4-6'])('%s : la pastille est neutre et localisée', (id) => {
    for (const lang of KIT_LANGS) {
      const page = sansStyle(pageSociale({ id, lang }))
      expect(page).not.toMatch(/App\s*Store/i)
      expect(page).toContain(LIBELLES.telecharger[lang])
    }
  })
})

describe('miniature Y1', () => {
  test.each(KIT_LANGS)('%s : aucun émoji dessiné, le logotype Meeshy signe la miniature', (lang) => {
    const page = sansStyle(pageSociale({ id: 'Y1', lang }))
    expect(page).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(page).toMatch(/class="marque-discrete[^"]*"[\s\S]*?<span>Meeshy<\/span>/)
  })
})

describe('story S4', () => {
  test('la troisième étape ne suppose aucun genre (fr, it)', () => {
    const [, , trois] = STORIES.S4.etapes
    expect(trois.fr).not.toMatch(/allé\b/)
    expect(trois.it).not.toMatch(/stato\b/)
  })

  test.each(KIT_LANGS)('%s : le bas porte le logotype et « lien en bio »', (lang) => {
    const page = sansStyle(pageSociale({ id: 'S4-story', lang }))
    expect(page).toContain(LIBELLES.lienBio[lang])
    expect(page).toMatch(/<span[^>]*>Meeshy<\/span>/)
  })
})

describe('jeu du moteur de gabarits', () => {
  test('les rendus iPhone 6,9" et iPad 13" de render.mjs sont des BROUILLONS, jamais un livrable App Store', () => {
    expect(cheminSortie({ format: 'iphone-6.9', lang: 'fr', gabarit: '01-vocal' }).startsWith(resolve(OUT_DIR, 'brouillons'))).toBe(true)
    expect(cheminSortie({ format: 'ipad-13', lang: 'fr', gabarit: '01-vocal' }).startsWith(resolve(OUT_DIR, 'brouillons'))).toBe(true)
    expect(nomPlanche('iphone-6.9', { brut: false })).toMatch(/^brouillon-/)
  })
})

describe('mesures en navigateur', () => {
  let browser

  beforeAll(async () => {
    browser = await chromium.launch()
  }, LENT)

  afterAll(async () => {
    await browser?.close()
  })

  const ouvrir = async (html, viewport = { width: 540, height: 960 }) => {
    const page = await browser.newPage({ viewport })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    return page
  }

  test('X6 : sous la loupe, le téléphone ne montre plus la carte de sous-titres d’origine', async () => {
    for (const lang of KIT_LANGS) {
      const page = await ouvrir(pageSociale({ id: 'X6', lang }), { width: 800, height: 450 })
      const etat = await page.evaluate(() => ({
        tel: [...document.querySelectorAll('.tel .call-captions')].map((e) => getComputedStyle(e).visibility),
        loupe: [...document.querySelectorAll('.loupe .call-captions')].map((e) => getComputedStyle(e).visibility),
      }))
      await page.close()
      expect({ lang, ...etat }).toEqual({ lang, tel: ['hidden'], loupe: ['visible'] })
    }
  }, LENT)

  test('affiche d’App Preview : aucune bulle visible sous les deux pastilles de légende', async () => {
    for (const lang of KIT_LANGS) {
      const page = await ouvrir(pagePoster({ lang }), { width: 443, height: 960 })
      const recouvertes = await page.evaluate(() => {
        window.asMiseEnPage()
        const t = document.querySelector('.as-poster-textes').getBoundingClientRect()
        const croise = (b) => b.left < t.right && t.left < b.right && b.top < t.bottom && t.top < b.bottom
        return [...document.querySelectorAll('.bubble')]
          .filter((b) => getComputedStyle(b).visibility !== 'hidden' && croise(b.getBoundingClientRect()))
          .map((b) => b.textContent.replace(/\s+/g, ' ').trim().slice(0, 40))
      })
      await page.close()
      expect({ lang, recouvertes }).toEqual({ lang, recouvertes: [] })
    }
  }, LENT)

  test('capture 03 : la première bulle de Meeshy Global n’est pas coupée sous l’en-tête', async () => {
    for (const lang of KIT_LANGS) {
      const page = await ouvrir(pageCapture({ appareil: 'iphone', lang, rang: 3 }), { width: 440, height: 956 })
      const coupe = await page.evaluate(() => {
        window.asMiseEnPage()
        const liste = document.querySelector('.messages')
        const haut = liste.getBoundingClientRect().top
        const premier = liste.firstElementChild.getBoundingClientRect()
        return premier.top < haut - 0.5 ? `${liste.firstElementChild.textContent.trim().slice(0, 40)} (${(haut - premier.top).toFixed(1)} px)` : null
      })
      await page.close()
      expect({ lang, coupe }).toEqual({ lang, coupe: null })
    }
  }, LENT)

  test('capture 08 : la carte Meesh flottante ne recouvre pas l’explication du badge', async () => {
    for (const lang of KIT_LANGS) {
      const page = await ouvrir(pageCapture({ appareil: 'iphone', lang, rang: 8 }), { width: 440, height: 956 })
      const chevauche = await page.evaluate(() => {
        window.asMiseEnPage()
        const carte = document.querySelector('.as-carte-flottante').getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(document.querySelector('.reveal-sub'))
        return [...range.getClientRects()].some((r) => r.bottom > carte.top && r.top < carte.bottom)
      })
      await page.close()
      expect({ lang, chevauche }).toEqual({ lang, chevauche: false })
    }
  }, LENT)

  test('iPad 05 : le panneau Progression est rempli jusqu’au bas de l’image (grille des badges)', async () => {
    for (const lang of KIT_LANGS) {
      const page = await ouvrir(pageCapture({ appareil: 'ipad', lang, rang: 5 }), { width: 1376, height: 1032 })
      const bas = await page.evaluate(() => {
        window.asMiseEnPage()
        const grille = document.querySelector('.progression-panel .badge-grille')
        const canvas = document.querySelector('.as-canvas').getBoundingClientRect()
        return grille ? grille.getBoundingClientRect().bottom / canvas.height : 0
      })
      await page.close()
      expect({ lang, rempli: bas >= 0.82 }).toEqual({ lang, rempli: true })
    }
  }, LENT)

  test('une vitrine garde un corps de légende UNIQUE par langue et par appareil', async () => {
    for (const [appareil, lang] of [['iphone', 'de'], ['iphone', 'pt'], ['iphone', 'ar'], ['ipad', 'de']]) {
      const corps = await corpsDeSerie(browser, { appareil, lang })
      const { width, height, scale } = APPAREILS[appareil]
      const tailles = []
      for (const [i] of APPAREILS[appareil].captures.entries()) {
        const page = await ouvrir(pageCapture({ appareil, lang, rang: i + 1, corps }), { width: width / scale, height: height / scale })
        const mesure = await page.evaluate(() => {
          window.asMiseEnPage()
          return { taille: parseFloat(getComputedStyle(document.querySelector('.as-caption')).fontSize), erreurs: window.asVerifier().erreurs }
        })
        await page.close()
        tailles.push(mesure.taille)
        expect(mesure.erreurs).toEqual([])
      }
      expect({ appareil, lang, tailles: [...new Set(tailles)] }).toEqual({ appareil, lang, tailles: [corps] })
    }
  }, LENT * 2)
})
