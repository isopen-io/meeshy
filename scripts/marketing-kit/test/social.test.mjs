import { describe, expect, test } from 'bun:test'
import { KIT_LANGS } from '../lib/locales.mjs'
import { SOCIAL_FORMATS } from '../templates/social/formats.mjs'
import { VISUELS, manifeste } from '../templates/social/catalogue.mjs'
import { pageSociale } from '../templates/social/page.mjs'
import { LANGUES_TRADUISIBLES } from '../templates/social/langues-traduisibles.mjs'
import { publicationsMarkdown } from '../templates/social/publications-md.mjs'
import { VIDEOS, STORIES } from '../templates/social/textes/videos.mjs'
import { ANNONCES, CARROUSELS, CARROUSEL_TITRES, LIBELLES, THREADS_QUESTION, YOUTUBE } from '../templates/social/textes/annonces.mjs'
import { PUBLICATIONS } from '../templates/social/textes/publications.mjs'
import { CONTENUS_SOCIAUX, MA_VILLE, MON_BONJOUR } from '../templates/social/textes/demo-social.mjs'
import { HASHTAG } from '../templates/social/textes/langues.mjs'
import { AMI_C1 } from '../templates/social/carrousels.mjs'
import { DEMO, profilDe } from '../textes/demo.mjs'

const ids = (format) => VISUELS.filter((v) => v.format === format).map((v) => v.id)
const nature = (id) => VISUELS.find((v) => v.id === id)?.nature

const chaines = (valeur) => {
  if (typeof valeur === 'string') return [valeur]
  if (Array.isArray(valeur)) return valeur.flatMap(chaines)
  if (valeur && typeof valeur === 'object') return Object.values(valeur).flatMap(chaines)
  return []
}

describe('catalogue du kit social (contenu-par-format.md)', () => {
  test('9:16 : couverture + 3 images-clés pour chacun des 8 concepts, et 4 stories Meeshy', () => {
    const attendus = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8'].flatMap((v) => [`${v}-0-couverture`, `${v}-1`, `${v}-2`, `${v}-3`])
    expect(ids('9x16')).toEqual([...attendus, 'S1-story', 'S2-story', 'S3-story', 'S4-story'])
  })

  test('4:5 : les quatre carrousels et toutes leurs slides (6, 6, 7, 6)', () => {
    const slides = (c, n) => Array.from({ length: n }, (_, i) => `${c}-${i + 1}`)
    expect(ids('4x5')).toEqual([...slides('C1', 6), ...slides('C2', 6), ...slides('C3', 7), ...slides('C4', 6)])
  })

  test('X / Threads : six visuels au format du plan, YouTube : deux miniatures', () => {
    expect(VISUELS.filter((v) => v.concept.startsWith('X')).map((v) => [v.id, v.format])).toEqual([
      ['X1', '1x1'], ['X2', '16x9'], ['X3', '1x1'], ['X4', '16x9'], ['X5', '1x1'], ['X6', '16x9'],
    ])
    expect(ids('yt')).toEqual(['Y1', 'Y2'])
  })

  test('chaque visuel porte la nature du plan : [R], [MS] ou [F]', () => {
    expect(['X1', 'X2', 'X3', 'X4', 'X5', 'X6'].map(nature)).toEqual(['F', 'MS', 'R', 'F', 'R', 'MS'])
    expect(ids('4x5').filter((id) => id.startsWith('C1')).map(nature)).toEqual(['R', 'MS', 'MS', 'R', 'F', 'F'])
    expect(ids('4x5').filter((id) => id.startsWith('C2')).map(nature)).toEqual(['R', 'MS', 'MS', 'R', 'R', 'F'])
    expect(ids('4x5').filter((id) => id.startsWith('C3')).map(nature)).toEqual(['F', 'R', 'MS', 'MS', 'MS', 'R', 'F'])
    expect(ids('4x5').filter((id) => id.startsWith('C4')).map(nature)).toEqual(['F', 'R', 'R', 'R', 'R', 'F'])
    expect(['Y1', 'Y2', 'S1-story', 'S2-story', 'S3-story', 'S4-story'].map(nature)).toEqual(Array(6).fill('F'))
    expect(VISUELS.every((v) => ['R', 'MS', 'F'].includes(v.nature))).toBe(true)
  })

  test('les identifiants sont uniques', () => {
    expect(new Set(VISUELS.map((v) => v.id)).size).toBe(VISUELS.length)
  })
})

describe('pages rendues', () => {
  test('chaque visuel se compose dans les sept langues, à la taille du format, sans ressource externe', () => {
    for (const visuel of VISUELS) {
      const f = SOCIAL_FORMATS[visuel.format]
      for (const lang of KIT_LANGS) {
        const html = pageSociale({ id: visuel.id, lang })
        expect(html).toContain(`width:${f.width / f.scale}px;height:${f.height / f.scale}px`)
        expect(html).not.toMatch(/(src|href)=["']https?:/)
        expect(html).not.toMatch(/url\(["']?https?:/)
      }
    }
  })

  test('l’arabe est composé de droite à gauche', () => {
    expect(pageSociale({ id: 'V1-0-couverture', lang: 'ar' })).toMatch(/<html lang="ar" dir="rtl">/)
    expect(pageSociale({ id: 'C1-1', lang: 'fr' })).toMatch(/<html lang="fr" dir="ltr">/)
  })

  test('un identifiant inconnu fait échouer la composition', () => {
    expect(() => pageSociale({ id: 'V9-1', lang: 'fr' })).toThrow(/visuel inconnu/)
  })
})

describe('manifeste', () => {
  test('une entrée par visuel et par langue, étiquetée format, concept, langue, nature', () => {
    const m = manifeste(KIT_LANGS)
    expect(m).toHaveLength(VISUELS.length * KIT_LANGS.length)
    for (const e of m) {
      const f = SOCIAL_FORMATS[e.format]
      expect(e.fichier).toBe(`social/${e.langue}/${e.id}.png`)
      expect([e.largeur, e.hauteur]).toEqual([f.width, f.height])
      expect(['R', 'MS', 'F']).toContain(e.nature)
      expect(e.concept).toMatch(/^(V[1-8]|S[1-4]|C[1-4]|X[1-6]|Y[12])$/)
      expect(KIT_LANGS).toContain(e.langue)
    }
  })

  test('les visuels X / Threads portent le texte du post dans leur langue', () => {
    const x1 = manifeste(['en']).find((e) => e.id === 'X1')
    expect(x1.post).toBe(ANNONCES.X1.post.en)
    expect(x1.threads).toBe(THREADS_QUESTION.en)
  })
})

describe('textes du kit social', () => {
  const blocs = { VIDEOS, STORIES, CARROUSELS, CARROUSEL_TITRES, ANNONCES, THREADS_QUESTION, YOUTUBE, LIBELLES, HASHTAG, MA_VILLE, MON_BONJOUR }

  test('chaque libellé existe dans les sept langues', () => {
    const feuilles = (v, chemin) => {
      if (v && typeof v === 'object' && !Array.isArray(v) && 'fr' in v) return [[chemin, v]]
      if (Array.isArray(v)) return v.flatMap((x, i) => feuilles(x, `${chemin}[${i}]`))
      if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => feuilles(x, `${chemin}.${k}`))
      return []
    }
    const manquants = [...Object.entries(blocs).flatMap(([k, v]) => feuilles(v, k)), ...PUBLICATIONS.map((p) => [`pub${p.n}`, p.texte])]
      .flatMap(([chemin, parLangue]) => KIT_LANGS.filter((l) => !parLangue[l]).map((l) => `${chemin}/${l}`))
    expect(manquants).toEqual([])
  })

  test('chaque contenu de démo social porte ses sept langues de lecture', () => {
    const manquants = CONTENUS_SOCIAUX().flatMap((c) => KIT_LANGS.filter((l) => l !== c.lang && !c.translations[l]).map((l) => `${c.id}/${l}`))
    expect(manquants).toEqual([])
  })

  test('dix publications de lancement, le hashtag décliné dans chaque langue', () => {
    expect(PUBLICATIONS.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (const lang of KIT_LANGS) expect(PUBLICATIONS[9].texte[lang]).toContain(HASHTAG[lang])
  })
})

describe('claims (campagne-virale-2026-09.md § 2) sur tout texte social', () => {
  const corpus = chaines([VIDEOS, STORIES, CARROUSELS, CARROUSEL_TITRES, ANNONCES, THREADS_QUESTION, YOUTUBE, LIBELLES, PUBLICATIONS.map((p) => p.texte), CONTENUS_SOCIAUX(), MA_VILLE, MON_BONJOUR])
  const DEFI = /\bd[ée]fis?\b|\bchallenges?\b|\bretos?\b|\bsfid[ae]\b|\bdesafios?\b|تحد[ٍّي]/i
  const campagne = chaines([PUBLICATIONS[9].texte])

  test('« 76 langues traduisibles » seulement — jamais 80+ ni 200', () => {
    expect(corpus.filter((s) => /\b80\s*\+|\b200\b|plus de 80|more than 80/i.test(s))).toEqual([])
  })

  test('la voix : jamais « avec ta voix », et « qui ressemble à la tienne » toujours « si tu l’actives »', () => {
    expect(corpus.filter((s) => /avec ta voix|ta voix exacte|with your (own )?voice|your exact voice|in your voice/i.test(s))).toEqual([])
    const fr = chaines([VIDEOS, CARROUSELS, ANNONCES]).filter((s) => s.includes('ressemble à la tienne'))
    expect(fr.length).toBeGreaterThan(0)
    expect(fr.filter((s) => !/l’actives/.test(s))).toEqual([])
  })

  test('Meesh frappées avec les points : jamais offertes, jamais d’argent', () => {
    expect(corpus.filter((s) => /offr(e|ez|ir)\s+(tes|vos|des)?\s*meesh|gift(ed)?\s+meesh|argent|money|€|\$\s?\d|gratuit/i.test(s))).toEqual([])
  })

  test('aucune marque tierce', () => {
    expect(corpus.filter((s) => /k-?pop|\bbts\b|blackpink|anime|naruto|one piece|fortnite|minecraft|real madrid|tiktok|instagram|marvel|pok[ée]mon/i.test(s))).toEqual([])
  })

  test('le mot « défi » n’appartient qu’à la LÉGENDE de publication du défi de campagne, jamais à un visuel', () => {
    expect(corpus.filter((s) => DEFI.test(s) && !campagne.includes(s))).toEqual([])
  })

  test('aucune promesse « parler à des inconnus » (sécurité de marque, 16-25 ans)', () => {
    expect(corpus.filter((s) => /inconnu|stranger|desconocid|fremde|sconosciut|desconhecid|غرباء/i.test(s))).toEqual([])
  })

  test('V8 : l’invitation de campagne se dit « Ton tour », avec le hashtag à côté', () => {
    expect(VIDEOS.V8.hook.fr).toStartWith('Ton tour : ')
    for (const lang of KIT_LANGS) expect(pageSociale({ id: 'V8-0-couverture', lang })).toContain(HASHTAG[lang])
  })
})

describe('personnages', () => {
  const FEMININ = { fr: /\bElle\b|\belle\b/, en: /\b(She|she|her|hers)\b/, es: /\bElla\b|\bella\b/, de: /\b(Sie|sie) (hört|liest)|hört sie\b|\bihrer\b/, it: /\bLei\b|\blei\b/, pt: /\bEla\b|\bela\b|\bdela\b/, ar: /وهي|تسمعني|تسمعك|تقرأ بلغتها|تسمعها/ }
  const MASCULIN = { fr: /\bIl\b|\bil\b/, en: /\b(He|he|his)\b/, es: /(^|\s)[Éé]l\s/u, de: /\b(Er|er) (hört|liest)|hört er\b|\bseiner\b/, it: /\bLui\b|\blui\b/, pt: /\bEle\b|\bele\b|\bdele\b/, ar: /وهو|يسمعني|يسمعك|يقرأ بلغته|يسمعها/ }
  const accord = (textes, genre) => KIT_LANGS.flatMap((lang) => textes.map((t) => t[lang]).filter((s) => !(genre === 'm' ? MASCULIN : FEMININ)[lang].test(s)).map((s) => `${lang} : ${s}`))

  test('Min-jun Park (Séoul) est un garçon : la copie qui le désigne (V1, C1-3) est au masculin', () => {
    expect(profilDe('minjun.p').genre).toBe('m')
    expect(accord([VIDEOS.V1.hook, VIDEOS.V1.sous[1], CARROUSELS.C1[2]], 'm')).toEqual([])
  })

  test('C1-2 : l’amie qui lit dans sa langue est, dans chaque langue, un profil féminin', () => {
    for (const lang of KIT_LANGS) expect({ lang, genre: profilDe(DEMO.lecteurs[AMI_C1[lang]]).genre }).toEqual({ lang, genre: 'f' })
    expect(accord([CARROUSELS.C1[1]], 'f')).toEqual([])
  })
})

describe('miniatures YouTube', () => {
  test('Y2 : « aucune langue commune » s’écrit sans « 0 » quand la langue ne le permet pas', () => {
    expect(YOUTUBE.Y2.accroche.en).toBe('6 COUNTRIES. NO SHARED LANGUAGE.')
    expect(YOUTUBE.Y2.accroche.de).toBe('6 LÄNDER. KEINE GEMEINSAME SPRACHE.')
    expect(YOUTUBE.Y2.accroche.es).toBe('6 PAÍSES. NINGÚN IDIOMA EN COMÚN.')
    expect(YOUTUBE.Y2.accroche.pt).toBe('6 PAÍSES. NENHUMA LÍNGUA EM COMUM.')
  })

  test('Y2 : la moitié droite signe la marque et « 76 langues traduisibles »', () => {
    for (const lang of KIT_LANGS) {
      const page = pageSociale({ id: 'Y2', lang })
      expect(page).toContain('class="signature')
      expect(page).toContain(LIBELLES.langues76[lang])
    }
  })
})

describe('76 langues traduisibles', () => {
  test('lues dans packages/shared/utils/languages.ts : exactement 76, dont lingala, wolof, bambara, twi, swahili', () => {
    expect(LANGUES_TRADUISIBLES).toHaveLength(76)
    const codes = LANGUES_TRADUISIBLES.map((l) => l.code)
    for (const code of ['ln', 'wo', 'bm', 'tw', 'sw']) expect(codes).toContain(code)
  })
})

describe('publications-meeshy.md', () => {
  test('les dix publications dans les sept langues, prêtes à copier', () => {
    const md = publicationsMarkdown()
    expect(md.match(/^## /gm)).toHaveLength(10)
    for (const p of PUBLICATIONS) for (const lang of KIT_LANGS) expect(md).toContain(p.texte[lang])
  })
})
