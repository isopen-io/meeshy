import { describe, expect, test } from 'bun:test'
import { lireSonde, specDe, verifierImage, verifierVideo } from '../lib/conformite.mjs'
import { FREQUENCE, LICENCE_MUSIQUE, synthetiser, wav } from '../lib/musique.mjs'

// Une sonde ffprobe d'aperçu iPhone conforme, à varier champ par champ.
const ffprobeApercu = ({ video = {}, audio = {}, format = {}, sansAudio = false } = {}) => ({
  format: { duration: '20.000000', bit_rate: '11000000', ...format },
  streams: [
    { codec_type: 'video', codec_name: 'h264', profile: 'High', level: 40, width: 886, height: 1920, r_frame_rate: '30/1', avg_frame_rate: '30/1',
      pix_fmt: 'yuv420p', field_order: 'progressive', nb_read_frames: '600', duration: '20.000000', bit_rate: '10800000', ...video },
    ...(sansAudio ? [] : [{ codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '48000', bit_rate: '256000', disposition: { default: 1 }, ...audio }]),
  ],
})

const sonde = (variation, { octets = 30_000_000, extension = '.mp4' } = {}) => lireSonde({ ffprobe: ffprobeApercu(variation), octets, extension })
const ecarts = (variation, spec = 'apercu-iphone', options) => verifierVideo(sonde(variation, options), specDe(spec))

describe('aperçu App Store : la sortie est confrontée à la spécification Apple', () => {
  test('un aperçu iPhone conforme ne rend aucun écart', () => {
    expect(ecarts()).toEqual([])
  })

  test('taille, durée, cadence et format de pixel', () => {
    expect(ecarts({ video: { width: 1320, height: 2868 } })).toContain('taille 1320×2868, attendu 886×1920')
    expect(ecarts({ format: { duration: '14.900000' }, video: { duration: '14.900000' } })).toContain('durée 14.900 s, attendu 15 à 30 s')
    expect(ecarts({ format: { duration: '30.100000' } })).toContain('durée 30.100 s, attendu 15 à 30 s')
    expect(ecarts({ video: { r_frame_rate: '60/1', avg_frame_rate: '60/1' } })).toContain('cadence 60.000 i/s, attendu 23 à 30')
    expect(ecarts({ video: { avg_frame_rate: '2731/100' } })[0]).toMatch(/^cadence variable/)
    expect(ecarts({ video: { pix_fmt: 'yuv444p' } })).toContain('format de pixel yuv444p, attendu yuv420p')
  })

  test('H.264 au plus High niveau 4.0, progressif, 12,5 Mb/s au plus', () => {
    expect(ecarts({ video: { level: 41 } })).toContain('niveau H.264 4.1, 4 au plus')
    expect(ecarts({ video: { profile: 'High 4:4:4 Predictive' } })[0]).toMatch(/^profil H.264/)
    expect(ecarts({ video: { codec_name: 'vp9' } })).toContain('codec vp9, attendu h264')
    expect(ecarts({ video: { field_order: 'tt' } })).toContain('balayage tt, attendu progressif')
    expect(ecarts({ video: { bit_rate: '20000000' } })).toContain('débit vidéo 20000 kb/s, 12500 au plus')
  })

  test('une piste audio stéréo AAC à 44,1 ou 48 kHz, active', () => {
    expect(ecarts({ sansAudio: true })).toEqual(['aucune piste audio (un aperçu en porte une, stéréo)'])
    expect(ecarts({ audio: { channels: 1 } })).toContain('piste audio 1 : 1 canal(aux), attendu stéréo')
    expect(ecarts({ audio: { codec_name: 'mp3' } })).toContain('piste audio 1 : codec mp3, attendu aac')
    expect(ecarts({ audio: { sample_rate: '22050' } })).toContain('piste audio 1 : 22050 Hz, attendu 44100 ou 48000')
    expect(ecarts({ audio: { sample_rate: '44100' } })).toEqual([])
  })

  test('un silence encodé à 256 kb/s mesure bien moins : ce n’est pas un écart', () => {
    expect(ecarts({ audio: { bit_rate: '2300' } })).toEqual([])
  })

  test('conteneur et poids : .mp4/.mov/.m4v, 500 Mo au plus', () => {
    expect(ecarts({}, 'apercu-iphone', { extension: '.webm' })[0]).toMatch(/^conteneur \.webm/)
    expect(ecarts({}, 'apercu-iphone', { octets: 600 * 1024 * 1024 })[0]).toMatch(/^fichier de 600\.0 Mo/)
  })

  test('l’iPad 13" attend 1200×1600', () => {
    expect(ecarts({}, 'apercu-ipad')).toContain('taille 886×1920, attendu 1200×1600')
    expect(ecarts({ video: { width: 1200, height: 1600 } }, 'apercu-ipad')).toEqual([])
  })
})

describe('visuels créatifs : en-tête et résultats de recherche', () => {
  test('en-tête vidéo : 3840×1646, 5 à 30 s, 30 ou 60 i/s exactement', () => {
    const entete = (variation) => verifierVideo(sonde(variation), specDe('entete-video'))
    expect(entete({ video: { width: 3840, height: 1646, level: 51 }, format: { duration: '7' } })).toEqual([])
    expect(entete({ video: { width: 3840, height: 1646, r_frame_rate: '25/1', avg_frame_rate: '25/1' }, format: { duration: '7' } })).toContain('cadence 25.000 i/s, attendu 30 ou 60')
    expect(entete({ video: { width: 3840, height: 1646 }, format: { duration: '4.5' } })).toContain('durée 4.500 s, attendu 5 à 30 s')
  })

  const png = (largeur, hauteur, typeCouleur = 2) => {
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(largeur, 0)
    ihdr.writeUInt32BE(hauteur, 4)
    ihdr[8] = 8
    ihdr[9] = typeCouleur
    const longueur = Buffer.alloc(4)
    longueur.writeUInt32BE(13)
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), longueur, Buffer.from('IHDR'), ihdr, Buffer.alloc(4)])
  }

  test('en-tête image : 3840×1646 ou 5244×2950, RVB sans alpha', () => {
    const spec = specDe('entete-image')
    expect(verifierImage({ png: png(3840, 1646), extension: '.png' }, spec)).toEqual([])
    expect(verifierImage({ png: png(5244, 2950), extension: '.png' }, spec)).toEqual([])
    expect(verifierImage({ png: png(3840, 1646, 6), extension: '.png' }, spec)).toEqual(['type de couleur 6 : une image App Store est RVB sans canal alpha'])
    expect(verifierImage({ png: png(3840, 2160), extension: '.png' }, spec)[0]).toMatch(/^taille 3840×2160/)
  })

  test('recherche : 3:2 entre 1920×1280 et 3840×2560, ou 5244×2950', () => {
    const spec = specDe('recherche-image')
    for (const [l, h] of [[1920, 1280], [3840, 2560], [3000, 2000], [5244, 2950]]) expect(verifierImage({ png: png(l, h), extension: '.png' }, spec)).toEqual([])
    for (const [l, h] of [[1800, 1200], [3840, 2160], [4200, 2800]]) expect(verifierImage({ png: png(l, h), extension: '.png' }, spec)).not.toEqual([])
  })

  test('une spécification inconnue est nommée', () => {
    expect(() => specDe('apercu-mac')).toThrow('spécification inconnue « apercu-mac »')
  })
})

describe('musique synthétisée : originale, douce, à la durée exacte', () => {
  const m = synthetiser({ dureeS: 16 })

  test('stéréo, à la durée demandée, à 48 kHz', () => {
    expect(m.frequence).toBe(FREQUENCE)
    expect(m.gauche.length).toBe(16 * FREQUENCE)
    expect(m.droite.length).toBe(16 * FREQUENCE)
  })

  test('crête sous -9 dBFS, aucun canal muet', () => {
    const crete = (canal) => canal.reduce((c, v) => Math.max(c, Math.abs(v)), 0)
    expect(crete(m.gauche)).toBeLessThanOrEqual(10 ** (-9 / 20) + 1e-6)
    expect(crete(m.gauche)).toBeGreaterThan(0.1)
    expect(crete(m.droite)).toBeGreaterThan(0.1)
  })

  test('entre et sort en fondu : premier et dernier échantillons au silence', () => {
    expect(Math.abs(m.gauche[0])).toBeLessThan(1e-6)
    expect(Math.abs(m.droite.at(-1))).toBeLessThan(1e-6)
  })

  test('déterministe : la même durée rend les mêmes échantillons', () => {
    const autre = synthetiser({ dureeS: 16 })
    expect(Buffer.from(autre.gauche.buffer).equals(Buffer.from(m.gauche.buffer))).toBe(true)
  })

  test('WAV PCM 16 bits stéréo lisible', () => {
    const fichier = wav(synthetiser({ dureeS: 1 }))
    expect(fichier.toString('ascii', 0, 4)).toBe('RIFF')
    expect(fichier.readUInt16LE(22)).toBe(2)
    expect(fichier.readUInt32LE(24)).toBe(FREQUENCE)
    expect(fichier.length).toBe(44 + FREQUENCE * 4)
  })

  test('sa licence est dite : aucune œuvre tierce', () => {
    expect(LICENCE_MUSIQUE).toMatch(/originale/)
  })
})

