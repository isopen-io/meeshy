import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { contexte, ecran } from '../lib/gabarits.mjs'
import { toString } from '../lib/html.mjs'
import { langue } from '../lib/langues.mjs'
import { KIT_LANGS } from '../lib/locales.mjs'
import { CREDITS, photoUrl } from '../lib/photos.mjs'
import { DEMO, lecteurDe, partenaireDe, profilDe } from '../textes/demo.mjs'
import { LEGENDES } from '../textes/legendes.mjs'
import { pageCapture } from '../templates/appstore/composition.mjs'
import { APPAREILS } from '../templates/appstore/plan.mjs'

const rendu = (nom, lang, theme = 'dark') => toString(ecran(nom, contexte({ lang, theme })))
const photosDe = (page) => Object.keys(CREDITS).filter((nom) => page.includes(photoUrl(nom)))
const graphemes = (s) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length

describe('photos réelles (#8825)', () => {
  test('chaque photo existe, est un JPEG, vient de Pexels sous sa licence et ne montre personne', () => {
    for (const [nom, credit] of Object.entries(CREDITS)) {
      const fichier = resolve(REPO_ROOT, 'scripts/marketing-kit/photos', credit.fichier)
      expect({ nom, existe: existsSync(fichier) }).toEqual({ nom, existe: true })
      expect([...readFileSync(fichier).subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
      expect(credit.source).toMatch(/^https:\/\/www\.pexels\.com\/photo\/\d+\/$/)
      expect(credit.licence).toBe('https://www.pexels.com/license/')
      expect(credit.auteur.length).toBeGreaterThan(1)
      expect(credit.personnes).toBe(0)
    }
  })

  test('une photo inconnue fait échouer le rendu', () => {
    expect(() => photoUrl('inexistante')).toThrow(/photo inconnue/)
  })
})

describe('le couple de chaque vitrine', () => {
  test('une lectrice écrit à Min-jun (Séoul), un lecteur à Aiko (Osaka)', () => {
    for (const lang of KIT_LANGS) {
      const attendu = lecteurDe(lang).genre === 'f' ? 'minjun.p' : 'aiko.t'
      expect({ lang, partenaire: partenaireDe(lang).pseudo }).toEqual({ lang, partenaire: attendu })
    }
  })

  test('chaque réplique du couple existe en coréen ET en japonais', () => {
    for (const replique of DEMO.amour.repliques) {
      expect({ id: replique.id, ko: Boolean(replique.ko), ja: Boolean(replique.ja) }).toEqual({ id: replique.id, ko: true, ja: true })
    }
  })
})

describe('capture 1 — la conversation amoureuse, le vocal entendu dans SA langue', () => {
  test.each(KIT_LANGS)('%s : la vue du soir est une vraie photo, le vocal du lecteur joue dans la langue du partenaire', (lang) => {
    const page = rendu('amour', lang)
    const partenaire = partenaireDe(lang)
    expect(photosDe(page)).toEqual([partenaire.lang === 'ko' ? 'seoul-crepuscule' : 'osaka-nuit'])
    expect(page).toContain(`${partenaire.prenom} ${partenaire.nom}`)
    const vocal = page.match(/<div class="bubble mine audio"[\s\S]*?<div class="audio-transcript" lang="([a-z]+)"/)
    expect(vocal?.[1]).toBe(partenaire.lang)
    expect(page).toContain(DEMO.amour.vocal.transcription[partenaire.lang])
  })
})

describe('capture 2 — les photos échangées', () => {
  test.each(KIT_LANGS)('%s : hublot, table et bouquet, dont deux photos côte à côte', (lang) => {
    const page = rendu('amour-photos', lang, 'light')
    expect(photosDe(page).sort()).toEqual(['bouquet-roses', 'diner-chandelle', 'hublot-rose'])
    expect(page).toMatch(/class="media-grid n2"/)
    expect(page).toMatch(/class="media-grid n1"/)
  })

  test('la légende détourne le proverbe dans les sept langues', () => {
    expect(LEGENDES.L11.fr).toBe('Loin des yeux. Près du cœur.')
    for (const lang of KIT_LANGS) expect(graphemes(LEGENDES.L11[lang])).toBeLessThanOrEqual(40)
  })
})

describe('capture 3 — la conversation drôle', () => {
  test.each(KIT_LANGS)('%s : le chat dans la valise, et un vocal coréen écouté dans la langue du lecteur', (lang) => {
    const page = rendu('drole', lang)
    expect(photosDe(page)).toEqual(['chat-valise'])
    const vocal = page.match(/<div class="bubble theirs audio"[\s\S]*?<div class="audio-transcript" lang="([a-z]+)"/)
    expect(vocal?.[1]).toBe(lang)
    expect(page).toContain(DEMO.drole.vocal.translations[lang])
  })
})

describe('capture 4 — le débat acharné', () => {
  test.each(KIT_LANGS)('%s : la pizza à l’ananas déclenche le débat', (lang) => {
    const page = rendu('debat', lang, 'light')
    expect(photosDe(page)).toEqual(['pizza-ananas'])
  })

  test('Giulia lit son propre débat : ses messages sont les siens, en italien', () => {
    const page = rendu('debat', 'it', 'light')
    const miens = [...page.matchAll(/<div class="bubble mine"[^>]*>\s*<div class="bubble-body">([^<]+)</g)].map((m) => m[1])
    expect(miens).toContain('NO. L’ananas sulla pizza è un crimine 😤🇮🇹')
  })

  test('la légende dit la chaleur du débat dans les sept langues', () => {
    expect(LEGENDES.L12.fr).toBe('Ça chauffe. Tout le monde suit.')
    for (const lang of KIT_LANGS) expect(graphemes(LEGENDES.L12[lang])).toBeLessThanOrEqual(40)
  })
})

describe('capture 5 — l’appel amoureux sous-titré', () => {
  test.each(KIT_LANGS)('%s : la caméra du partenaire filme la pluie, le sous-titre est traduit', (lang) => {
    const page = rendu('appel-amour', lang)
    const partenaire = partenaireDe(lang)
    expect(photosDe(page)).toEqual(['pluie-vitre'])
    expect(page).toContain(`${partenaire.prenom} ${partenaire.nom}`)
    expect(page).toContain(`${langue(partenaire.lang).drapeau} → ${langue(lang).drapeau}`)
    expect(page).toContain(`<p class="cc-orig" lang="${partenaire.lang}">`)
  })

  test('la légende nomme la ville du partenaire', () => {
    for (const lang of KIT_LANGS) {
      const ville = DEMO.villes[partenaireDe(lang).ville][lang]
      expect({ lang, cite: LEGENDES.L9[lang].includes(ville) }).toEqual({ lang, cite: true })
    }
  })
})

describe('iPad — la hauteur du portrait montre plus de photos échangées', () => {
  test.each(KIT_LANGS)('%s : ramen et vue, café et hublot, chien, pizza au chocolat', (lang) => {
    const vue = partenaireDe(lang).lang === 'ko' ? 'seoul-crepuscule' : 'osaka-nuit'
    expect(photosDe(rendu('ipad-amour', lang)).sort()).toEqual(['bol-ramen', vue].sort())
    expect(photosDe(rendu('ipad-amour-photos', lang, 'light')).sort()).toEqual(['bouquet-roses', 'cafe-coeur', 'diner-chandelle', 'hublot-rose'])
    expect(photosDe(rendu('ipad-drole', lang)).sort()).toEqual(['chat-valise', 'chien-sac'])
    expect(photosDe(rendu('ipad-debat', lang, 'light')).sort()).toEqual(['pizza-ananas', 'pizza-chocolat'])
  })
})

describe('fil et story passent aux photos réelles', () => {
  test.each(KIT_LANGS)('%s : aucune illustration vectorielle dans le fil ni dans la story', (lang) => {
    for (const nom of ['fil', 'story', 'ipad-fil', 'ipad-story']) {
      const page = rendu(nom, lang)
      expect({ nom, illustration: /class="illu /.test(page) }).toEqual({ nom, illustration: false })
      expect(photosDe(page).length).toBeGreaterThan(0)
    }
  })

  test('la story montrée est celle d’un autre que le lecteur, sur sa ville', () => {
    expect(photosDe(rendu('story', 'fr'))).toEqual(['sao-paulo-coucher'])
    expect(photosDe(rendu('story', 'pt'))).toEqual(['madrid-coucher'])
  })
})

describe('vitrine App Store', () => {
  test('iPhone : les conversations d’abord — amour, photos, rire, débat, appel', () => {
    expect(APPAREILS.iphone.captures.map((c) => c.ecran)).toEqual([
      'amour', 'amour-photos', 'drole', 'debat', 'appel-amour', 'global', 'fil', 'story', 'progression', 'invitation',
    ])
  })

  test('iPad : le même récit, en portrait', () => {
    expect(APPAREILS.ipad.captures.map((c) => c.ecran)).toEqual([
      'ipad-amour', 'ipad-amour-photos', 'ipad-drole', 'ipad-debat', 'ipad-appel-amour', 'ipad-global', 'ipad-fil', 'ipad-story', 'ipad-progression',
    ])
  })

  test('la flèche de la capture 1 va de la langue du lecteur à celle de son partenaire', () => {
    for (const lang of KIT_LANGS) {
      const page = pageCapture({ appareil: 'iphone', lang, rang: 1 })
      const fleche = page.match(/<div class="as-fleche"[^>]*>([\s\S]*?)<\/div>/)[1]
      const drapeaux = [...fleche.matchAll(/<span class="as-flag">([^<]+)<\/span>/g)].map((m) => m[1])
      expect({ lang, drapeaux }).toEqual({ lang, drapeaux: [langue(lang).drapeau, langue(partenaireDe(lang).lang).drapeau] })
    }
  })

  test('la capture 2 unit les deux langues du couple par un cœur', () => {
    for (const lang of KIT_LANGS) {
      const page = pageCapture({ appareil: 'iphone', lang, rang: 2 })
      expect(page).toContain(`<span class="as-flag">${langue(lang).drapeau}</span><span class="as-coeur">❤️</span><span class="as-flag">${langue(partenaireDe(lang).lang).drapeau}</span>`)
    }
  })

  test('aucune capture ne montre de personne réelle : les avatars restent des initiales', () => {
    for (const lang of ['fr', 'ar']) {
      for (const appareil of Object.keys(APPAREILS)) {
        APPAREILS[appareil].captures.forEach((_, i) => {
          const page = pageCapture({ appareil, lang, rang: i + 1 })
          const images = [...page.matchAll(/<img [^>]*src="(data:image\/jpeg;base64,[^"]{0,40})/g)].length
          const photos = photosDe(page).length
          expect(images).toBeGreaterThanOrEqual(photos)
          expect(page).not.toMatch(/<img [^>]*class="[^"]*avatar/)
        })
      }
    }
  })

  test('les profils qui jouent le couple ont le bon genre', () => {
    expect(profilDe('minjun.p').genre).toBe('m')
    expect(profilDe('aiko.t').genre).toBe('f')
  })
})
