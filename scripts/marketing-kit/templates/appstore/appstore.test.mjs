import { describe, expect, test } from 'bun:test'
import { KIT_LANGS } from '../../lib/locales.mjs'
import { LEGENDES } from '../../textes/legendes.mjs'
import { APPAREILS, POSTER, cheminFastlane, cheminPoster, graphemes } from './plan.mjs'
import { pageCapture, pagePoster } from './composition.mjs'
import { imageReelle } from './ecran-reel.mjs'

const theme = (sequence) => sequence.map((c) => (c.theme === 'dark' ? 'S' : 'C')).join('-')

describe('séquences App Store (captures-app-store.md § 2-3, #8825)', () => {
  test('iPhone : dix captures, les conversations d’abord, alternance S-C-S-C-S-C-S-S-C-C', () => {
    const { captures } = APPAREILS.iphone
    expect(captures.map((c) => c.legende)).toEqual(['L1', 'L11', 'L2', 'L12', 'L9', 'L3', 'L4', 'L6', 'L7', 'L10'])
    expect(theme(captures)).toBe('S-C-S-C-S-C-S-S-C-C')
  })

  test('iPad : neuf captures, le même récit que l’iPhone', () => {
    const { captures } = APPAREILS.ipad
    expect(captures.map((c) => c.legende)).toEqual(['L1', 'L11', 'L2', 'L12', 'L9', 'L3', 'L4', 'L6', 'L7'])
    expect(theme(captures)).toBe('S-C-S-C-S-C-S-S-C')
  })

  test('tailles par défaut d’App Store Connect : iPhone 6,9" et iPad 13", en portrait', () => {
    expect([APPAREILS.iphone.width, APPAREILS.iphone.height]).toEqual([1320, 2868])
    expect([APPAREILS.ipad.width, APPAREILS.ipad.height]).toEqual([2064, 2752])
    expect([POSTER.width, POSTER.height]).toEqual([886, 1920])
  })
})

describe('fichiers fastlane', () => {
  test('les locales fastlane et le nommage iphone69_NN / ipad13_NN', () => {
    expect(cheminFastlane({ appareil: 'iphone', lang: 'fr', rang: 1 })).toMatch(/apps\/ios\/fastlane\/screenshots\/fr-FR\/iphone69_01\.png$/)
    expect(cheminFastlane({ appareil: 'iphone', lang: 'pt', rang: 10 })).toMatch(/screenshots\/pt-BR\/iphone69_10\.png$/)
    expect(cheminFastlane({ appareil: 'ipad', lang: 'it', rang: 9 })).toMatch(/screenshots\/it\/ipad13_09\.png$/)
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

describe('légende des badges (hors vitrine depuis #8825)', () => {
  test('la légende dit « badges », comme l’écran (« Badge gagné »)', () => {
    expect(LEGENDES.L8.fr).toStartWith('Débloque des badges.')
    expect(LEGENDES.L8.en).toStartWith('Unlock badges.')
  })
})

describe('écran réel de l’invitation (lien.mov, 1.1.3)', () => {
  const invitation = APPAREILS.iphone.captures[9]
  const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

  test('la capture 10 de l’iPhone prend en français l’image de lien.mov, une fois la page posée', () => {
    expect(invitation.ecran).toBe('invitation')
    expect(invitation.ecranReel).toEqual({ fr: { video: 'Marketing/02-captures/iphone/fr/lien.mov', instant: 3.5 } })
  })

  test('l’image se tire de la vidéo déclarée, à son instant ; une langue sans vidéo garde la maquette', () => {
    const appels = []
    const extraire = (video, instant) => (appels.push([video, instant]), PNG)
    expect(imageReelle({ capture: invitation, lang: 'fr', extraire, existe: () => true })).toBe(PNG)
    expect(appels).toHaveLength(1)
    expect(appels[0][0]).toMatch(/\/Marketing\/02-captures\/iphone\/fr\/lien\.mov$/)
    expect(appels[0][1]).toBe(3.5)
    expect(imageReelle({ capture: invitation, lang: 'en', extraire, existe: () => true })).toBeNull()
    expect(appels).toHaveLength(1)
  })

  test('une vidéo déclarée mais absente arrête le rendu au lieu de retomber sur la maquette', () => {
    expect(() => imageReelle({ capture: invitation, lang: 'fr', extraire: () => PNG, existe: () => false })).toThrow(/lien\.mov/)
  })

  test('posée dans le cadre, l’image réelle remplace la maquette, sous la même légende', () => {
    const html = pageCapture({ appareil: 'iphone', lang: 'fr', rang: 10, ecranReel: PNG })
    expect(html).toMatch(/class="device-screen"[\s\S]*class="ecran-reel"/)
    expect(html).not.toContain('class="inv-card"')
    expect(html).toContain('class="as-caption')
  })

  test('la maquette de l’invitation montre un lien /chat/, et aucune capture un lien /l/', () => {
    for (const appareil of Object.keys(APPAREILS)) {
      for (const lang of KIT_LANGS) {
        APPAREILS[appareil].captures.forEach((_, i) => expect(pageCapture({ appareil, lang, rang: i + 1 })).not.toMatch(/meeshy\.me\/l\//))
      }
    }
    expect(pageCapture({ appareil: 'iphone', lang: 'en', rang: 10 })).toContain('meeshy.me/chat/')
  })
})
