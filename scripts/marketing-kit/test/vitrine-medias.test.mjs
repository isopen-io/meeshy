import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DOSSIER_PHOTOS, RACINE_MEDIAS, choisirVoix, dimensionsJpeg, dureeDepuisAfinfo, fichierVoix, lireVoix, photoMedia, segmenter, vocalMedia,
} from '../vitrine/medias.mjs'

describe('médias de la vitrine (#8855)', () => {
  test('les dimensions d’un JPEG sont lues dans son en-tête', () => {
    expect(dimensionsJpeg(readFileSync(resolve(DOSSIER_PHOTOS, 'pizza-ananas.jpg')))).toEqual({ width: 900, height: 1200 })
    expect(dimensionsJpeg(readFileSync(resolve(DOSSIER_PHOTOS, 'pizza-chocolat.jpg')))).toEqual({ width: 1200, height: 800 })
  })

  test('un fichier qui n’est pas un JPEG est refusé', () => {
    expect(() => dimensionsJpeg(Buffer.from('pas une image, vraiment pas'))).toThrow('JPEG sans dimensions')
  })

  test('une photo du kit devient un média relatif, à ses vraies dimensions', () => {
    const m = photoMedia('seoul-crepuscule')
    expect(m).toMatchObject({ url: `${RACINE_MEDIAS}/seoul-crepuscule.jpg`, fichier: 'seoul-crepuscule.jpg', genre: 'image', photo: 'seoul-crepuscule', width: 800, height: 1200 })
    expect(m.url.startsWith('/')).toBe(true)
    expect(m.taille).toBeGreaterThan(0)
  })

  test('un vocal est un média relatif qui dit ce qu’il faut synthétiser', () => {
    expect(vocalMedia({ cle: 'vocal-minjun.p-fr', texte: 'Bonjour', lang: 'fr' })).toEqual({
      url: `${RACINE_MEDIAS}/vocal-minjun.p-fr.m4a`, fichier: 'vocal-minjun.p-fr.m4a', genre: 'audio', texte: 'Bonjour', lang: 'fr',
    })
  })

  test('le karaoké suit chaque mot, bout à bout, du début à la fin de la piste', () => {
    const segments = segmenter('Plus que 12 jours', 4000)
    expect(segments.map((s) => s.text)).toEqual(['Plus', 'que', '12', 'jours'])
    expect(segments[0].startMs).toBe(0)
    expect(segments.at(-1).endMs).toBe(4000)
    segments.slice(1).forEach((s, i) => expect(s.startMs).toBe(segments[i].endMs))
  })

  test('le japonais, qui n’espace pas ses mots, se découpe par membre de phrase', () => {
    expect(segmenter('一日中、君の声が聞きたかった。', 1000).map((s) => s.text)).toEqual(['一日中、', '君の声が聞きたかった。'])
  })

  test('la voix d’une langue : la préférée si elle est installée, sinon la première de sa région', () => {
    const voix = lireVoix(['Yuna                ko_KR    # 안녕하세요.', 'Eddy (French (France)) fr_FR    # Bonjour.', 'Majed               ar_001   # مرحبًا!'].join('\n'))
    expect(voix).toEqual([{ nom: 'Yuna', locale: 'ko_KR' }, { nom: 'Eddy (French (France))', locale: 'fr_FR' }, { nom: 'Majed', locale: 'ar_001' }])
    expect(choisirVoix('ko', voix)).toBe('Yuna')
    expect(choisirVoix('fr', voix)).toBe('Eddy (French (France))')
    expect(choisirVoix('ar', voix)).toBe('Majed')
    expect(() => choisirVoix('ja', voix)).toThrow('aucune voix ja_JP')
  })

  test('la durée d’une piste se lit dans afinfo', () => {
    expect(dureeDepuisAfinfo('File: x.m4a\nFile type ID: m4af\nestimated duration: 7.345261 sec\n')).toBe(7345)
    expect(() => dureeDepuisAfinfo('rien')).toThrow('afinfo ne donne aucune durée')
  })

  test('un vocal se synthétise une fois : son fichier se nomme par sa langue et son texte', () => {
    const a = fichierVoix({ texte: 'Bonjour', lang: 'fr' })
    expect(a).toMatch(/out\/vitrine\/voix\/[0-9a-f]{16}\.m4a$/)
    expect(fichierVoix({ texte: 'Bonjour', lang: 'fr' })).toBe(a)
    expect(fichierVoix({ texte: 'Bonjour', lang: 'it' })).not.toBe(a)
  })
})
