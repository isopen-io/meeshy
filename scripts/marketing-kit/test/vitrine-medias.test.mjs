import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  DOSSIER_PHOTOS, RACINE_MEDIAS, VIDEOS, VIDEOS_DES_REELS_DROLES, VIDEO_DU_REEL, afficheMedia, argumentsAffiche, argumentsExtrait, preparerAffiche, choisirVoix, dimensionsJpeg, dureeDepuisAfinfo, empreinte,
  fichierSourceVideo, fichierVideo, fichierVoix, lireVoix, photoMedia, preparerVideo, segmenter, videoMedia, vocalMedia,
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

  test('changer la voix ou le débit resynthétise : le nom du fichier suit aussi les réglages', () => {
    const m = { texte: 'Bonjour', lang: 'fr' }
    expect(fichierVoix(m, { voix: 'Thomas', debit: null })).not.toBe(fichierVoix(m, { voix: 'Amélie', debit: null }))
    expect(fichierVoix(m, { voix: 'Thomas', debit: null })).not.toBe(fichierVoix(m, { voix: 'Thomas', debit: 120 }))
  })

  test('un vocal se synthétise une fois : son fichier se nomme par sa langue et son texte', () => {
    const a = fichierVoix({ texte: 'Bonjour', lang: 'fr' })
    expect(a).toMatch(/out\/vitrine\/voix\/[0-9a-f]{16}\.m4a$/)
    expect(fichierVoix({ texte: 'Bonjour', lang: 'fr' })).toBe(a)
    expect(fichierVoix({ texte: 'Bonjour', lang: 'it' })).not.toBe(a)
  })
})

describe('la vidéo du réel (#9820)', () => {
  test('elle vient de Pexels, sous sa licence, sans personne à l’image, et sa source est épinglée par son empreinte', () => {
    const v = VIDEOS[VIDEO_DU_REEL]
    expect(v.licence).toBe('https://www.pexels.com/license/')
    expect(v.page).toMatch(/^https:\/\/www\.pexels\.com\/video\//)
    expect(v.source).toMatch(/^https:\/\/videos\.pexels\.com\/video-files\//)
    expect(v.auteur).toBeTruthy()
    expect(v.personnes).toBe(0)
    expect(v.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  test('elle devient un média relatif, vertical, au format de la scène', () => {
    expect(videoMedia(VIDEO_DU_REEL)).toEqual({
      url: `${RACINE_MEDIAS}/reel-coucher-ocean.mp4`, fichier: 'reel-coucher-ocean.mp4', genre: 'video', video: VIDEO_DU_REEL,
      width: 720, height: 1280, dureeMs: 6000,
    })
    expect(() => videoMedia('inconnue')).toThrow('vidéo inconnue')
  })

  test('l’extrait est rogné, sans son, en H.264 lisible partout, l’index en tête', () => {
    const args = argumentsExtrait({ source: '/s.mp4', sortie: '/o.mp4', video: VIDEO_DU_REEL })
    expect(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 6)).toEqual(['-ss', '2', '-t', '6', '-i', '/s.mp4'])
    expect(args).toContain('-an')
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=720:1280,fps=30')
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264')
    expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart')
    expect(args.at(-1)).toBe('/o.mp4')
  })

  test('une source qui n’est pas celle du kit est refusée, effacée, et rien n’est extrait', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'vitrine-video-'))
    let extrait = false
    const telecharger = (_url, chemin) => writeFileSync(chemin, 'pas la vidéo du kit')
    expect(() => preparerVideo(VIDEO_DU_REEL, { dossier, telecharger, extraire: () => { extrait = true } })).toThrow('n’est pas celle du kit')
    expect(existsSync(fichierSourceVideo(VIDEO_DU_REEL, dossier))).toBe(false)
    expect(extrait).toBe(false)
  })

  test('la bonne source est extraite une fois ; ensuite l’extrait est resservi sans réseau', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'vitrine-video-'))
    const octets = Buffer.from('octets de la vidéo')
    const video = { ...VIDEOS[VIDEO_DU_REEL] }
    VIDEOS.essai = { ...video, fichier: 'essai.mp4', sha256: empreinte(octets) }
    try {
      let telechargements = 0
      const telecharger = (_url, chemin) => { telechargements += 1; writeFileSync(chemin, octets) }
      const extraire = (args) => writeFileSync(args.at(-1), 'extrait')
      expect(preparerVideo('essai', { dossier, telecharger, extraire })).toBe(fichierVideo('essai', dossier))
      expect(preparerVideo('essai', { dossier, telecharger, extraire: () => { throw new Error('déjà extrait') } })).toBe(fichierVideo('essai', dossier))
      expect(telechargements).toBe(1)
    } finally {
      delete VIDEOS.essai
    }
  })
})


describe('les réels drôles de l’en-tête (#9904)', () => {
  test.each(VIDEOS_DES_REELS_DROLES)('%s vient de Mixkit, sous sa licence gratuite commerciale, et sa source est épinglée', (nom) => {
    const v = VIDEOS[nom]
    expect(v.licence).toBe('https://mixkit.co/license/#videoFree')
    expect(v.page).toMatch(/^https:\/\/mixkit\.co\/free-stock-video\/[a-z0-9-]+-\d+\/$/)
    expect(v.source).toMatch(/^https:\/\/assets\.mixkit\.co\//)
    expect(v.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect([v.width, v.height]).toEqual([720, 1280])
    expect(v.extrait.dureeS).toBeGreaterThanOrEqual(4)
  })

  test('quatre vidéos distinctes, chacune avec son fichier', () => {
    expect(new Set(VIDEOS_DES_REELS_DROLES.map((v) => VIDEOS[v].fichier)).size).toBe(4)
  })

  test('l’affiche d’une vidéo est une image relative, à ses dimensions, tirée de son extrait', () => {
    expect(afficheMedia('louche-micro')).toEqual({
      url: `${RACINE_MEDIAS}/reel-louche-micro.jpg`, fichier: 'reel-louche-micro.jpg', genre: 'image', affiche: 'louche-micro', width: 720, height: 1280,
    })
    const args = argumentsAffiche({ extrait: '/e.mp4', sortie: '/a.jpg' })
    expect(args.slice(args.indexOf('-i'), args.indexOf('-i') + 2)).toEqual(['-i', '/e.mp4'])
    expect(args[args.indexOf('-frames:v') + 1]).toBe('1')
    expect(args.at(-1)).toBe('/a.jpg')
  })

  test('l’affiche se tire une fois, puis se ressert', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'vitrine-affiche-'))
    let tirages = 0
    const tirer = (args) => { tirages += 1; writeFileSync(args.at(-1), 'jpeg') }
    const extraireVideo = () => '/e.mp4'
    const chemin = preparerAffiche('menage-danse', { dossier, tirer, extraireVideo })
    expect(chemin).toBe(join(dossier, 'reel-menage-danse.jpg'))
    expect(preparerAffiche('menage-danse', { dossier, tirer, extraireVideo })).toBe(chemin)
    expect(tirages).toBe(1)
  })
})
