import { describe, expect, test } from 'bun:test'
import { LEGENDES } from '../textes/legendes.mjs'
import { KIT_TEXTES } from '../textes/kit.mjs'
import { DEMO } from '../textes/demo.mjs'
import { KIT_LANGS } from '../lib/locales.mjs'
import { AMOUR } from '../textes/amour.mjs'

const graphemes = (s) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length

const toutesLesChaines = (valeur) => {
  if (typeof valeur === 'string') return [valeur]
  if (Array.isArray(valeur)) return valeur.flatMap(toutesLesChaines)
  if (valeur && typeof valeur === 'object') return Object.values(valeur).flatMap(toutesLesChaines)
  return []
}

describe('légendes App Store L1-L12 (captures-app-store.md § 4, #8825)', () => {
  test('treize légendes, chacune dans les sept langues du kit', () => {
    expect(Object.keys(LEGENDES)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12', 'L13'])
    for (const legende of Object.values(LEGENDES)) {
      expect(Object.keys(legende).sort()).toEqual([...KIT_LANGS].sort())
    }
  })

  test('aucune légende ne dépasse 40 caractères', () => {
    const tropLongues = Object.entries(LEGENDES).flatMap(([cle, parLangue]) =>
      Object.entries(parLangue)
        .filter(([, texte]) => graphemes(texte) > 40)
        .map(([lang, texte]) => `${cle}/${lang} (${graphemes(texte)}) ${texte}`),
    )
    expect(tropLongues).toEqual([])
  })
})

describe('claims de la campagne (campagne-virale-2026-09.md § 2) — sur TOUT texte du kit', () => {
  const INTERDITS = [
    [/\b80\s*\+|\b200\s+langues|\bplus de 80\b/i, '« 80+ » / « 200 » : seul 76 est prouvé'],
    [/avec ta voix|ta voix exacte|with your (own )?voice|your exact voice/i, 'la voix clonée : « une voix qui ressemble à la tienne »'],
    [/comprends tout|understand everything/i, 'invérifiable : « Lis chaque mot »'],
    [/\bd[ée]fis?\b|\bchallenges?\b|\bretos?\b|\bsfide\b|\bdesafios?\b|herausforderung/i, 'aucun « défi » sur un écran iOS'],
    [/offr(e|ez|ir)\s+(tes|vos|des)?\s*meesh|gift(ed)?\s+meesh|gagne(r)? de l'argent|earn money|€|\$\s?\d/i, 'Meesh frappées avec les points, jamais offertes, jamais d’argent'],
    [/k-?pop|\bbts\b|blackpink|naruto|one piece|fortnite|minecraft|real madrid|taylor swift|marvel|pok[ée]mon/i, 'aucune marque tierce : fandom fictif « Nova Club »'],
  ]

  const corpus = [
    ...toutesLesChaines(LEGENDES),
    ...toutesLesChaines(KIT_TEXTES),
    ...toutesLesChaines(DEMO),
  ]

  for (const [motif, raison] of INTERDITS) {
    test(raison, () => {
      expect(corpus.filter((texte) => motif.test(texte))).toEqual([])
    })
  }

  test('le fandom de démo est le « Nova Club »', () => {
    expect(corpus.some((texte) => texte.includes('Nova Club'))).toBe(true)
  })
})

describe('contenus de démo (captures-app-store.md § 6)', () => {
  test('douze profils fictifs de 18 à 24 ans', () => {
    expect(DEMO.profils).toHaveLength(12)
    for (const profil of DEMO.profils) {
      expect(profil.age).toBeGreaterThanOrEqual(18)
      expect(profil.age).toBeLessThanOrEqual(24)
    }
  })

  test('chaque langue de lecture a son lecteur', () => {
    for (const lang of KIT_LANGS) {
      expect(DEMO.profils.some((p) => p.pseudo === DEMO.lecteurs[lang])).toBe(true)
    }
  })

  test('chaque texte montré porte une traduction pour chacune des sept langues de lecture', () => {
    const manquants = DEMO.contenus().flatMap((contenu) =>
      KIT_LANGS.filter((lang) => lang !== contenu.lang && !contenu.translations?.[lang]).map(
        (lang) => `${contenu.id} → ${lang}`,
      ),
    )
    expect(manquants).toEqual([])
  })

  test('les textes du kit hors catalogue iOS existent dans les sept langues', () => {
    const manquants = Object.entries(KIT_TEXTES).flatMap(([cle, parLangue]) =>
      KIT_LANGS.filter((lang) => !parLangue[lang]).map((lang) => `${cle}/${lang}`),
    )
    expect(manquants).toEqual([])
  })
})

describe('vitrine #8855, lot 2 — le vocal reçu et la légende d’Imagine', () => {
  test('le vocal que reçoit le lecteur existe dans les deux langues du partenaire, traduit dans les sept', () => {
    expect(AMOUR.repliques).toContain(AMOUR.vocalRecu)
    for (const lang of ['ko', 'ja']) {
      expect(AMOUR.vocalRecu[lang].lang).toBe(lang)
      expect(Object.keys(AMOUR.vocalRecu[lang].translations).sort()).toEqual([...KIT_LANGS].sort())
    }
  })

  test('Imagine a sa légende', () => {
    expect(LEGENDES.L13.fr).toBe('Un message. Une image. Sa langue.')
  })
})
