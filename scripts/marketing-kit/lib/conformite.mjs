// Conformité des fichiers App Store (#9807, #9811) : chaque sortie est sondée (ffprobe pour une vidéo,
// en-tête PNG pour une image) et confrontée à la spécification Apple de son emplacement. Une sortie non
// conforme bloque le dépôt.
//
// Sources (relevé du 2026-10-09) :
// - App Store Connect Help › App preview specifications : H.264 progressif jusqu'à High Profile niveau 4.0,
//   10–12 Mb/s visés, 30 i/s au plus, 15 à 30 s, 500 Mo au plus, AAC stéréo 256 kb/s à 44,1 ou 48 kHz,
//   toutes pistes audio actives ; iPhone 6,9" 886×1920, iPad 13" 1200×1600 (portrait).
// - andp 1.17.0 `appAssetLibraryRefData` (issue #9807) : 23 à 30 i/s.
// - App Store Connect Help › Creative assets specifications : en-tête 3840×1646 (image ou vidéo) ou
//   5244×2950 (image PNG) ; résultats de recherche 3:2 de 1920×1280 à 3840×2560 ou 5244×2950 (PNG) ;
//   vidéo 5 à 30 s, 30 ou 60 i/s, .mov/.m4v/.mp4 ; images sans canal alpha.
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { pngInfo } from './png.mjs'

const MO = 1024 * 1024
const PROFILS_H264 = ['Baseline', 'Constrained Baseline', 'Main', 'High']

const AUDIO_APERCU = { codec: 'aac', canaux: 2, frequences: [44100, 48000], debitKbps: [224, 288] }

const apercu = (largeur, hauteur) => ({
  type: 'video',
  conteneurs: ['.mp4', '.mov', '.m4v'],
  tailles: [[largeur, hauteur]],
  dureeS: [15, 30],
  cadences: { min: 23, max: 30 },
  codecs: ['h264'],
  profils: PROFILS_H264,
  niveauMax: 40,
  debitVideoMaxKbps: 12_500,
  tailleMaxOctets: 500 * MO,
  audio: AUDIO_APERCU,
})

export const SPECS = {
  'apercu-iphone': apercu(886, 1920),
  'apercu-ipad': apercu(1200, 1600),
  'entete-video': {
    type: 'video',
    conteneurs: ['.mp4', '.mov', '.m4v'],
    tailles: [[3840, 1646]],
    dureeS: [5, 30],
    cadences: { exactes: [30, 60] },
    codecs: ['h264', 'hevc'],
    tailleMaxOctets: 500 * MO,
  },
  'entete-image': { type: 'image', extensions: ['.png'], tailles: [[3840, 1646], [5244, 2950]] },
  'recherche-image': {
    type: 'image',
    extensions: ['.png'],
    tailles: [[5244, 2950]],
    plage: { largeur: [1920, 3840], hauteur: [1280, 2560], ratio: 3 / 2 },
  },
  'recherche-video': {
    type: 'video',
    conteneurs: ['.mp4', '.mov', '.m4v'],
    plage: { largeur: [1920, 3840], hauteur: [1280, 2560], ratio: 3 / 2 },
    dureeS: [5, 30],
    cadences: { exactes: [30, 60] },
    codecs: ['h264', 'hevc'],
    tailleMaxOctets: 500 * MO,
  },
}

export const specDe = (nom) => {
  const spec = SPECS[nom]
  if (!spec) throw new Error(`spécification inconnue « ${nom} » — connues : ${Object.keys(SPECS).join(', ')}`)
  return spec
}

const fraction = (texte) => {
  const [n, d] = String(texte ?? '0/1').split('/').map(Number)
  return d ? n / d : 0
}

const nombre = (v) => (v === undefined || v === 'N/A' ? null : Number(v))

// La sortie JSON de ffprobe ramenée à ce que les spécifications regardent.
export const lireSonde = ({ ffprobe, octets, extension }) => {
  const video = ffprobe.streams.find((s) => s.codec_type === 'video')
  const audios = ffprobe.streams.filter((s) => s.codec_type === 'audio')
  return {
    extension,
    octets,
    dureeS: nombre(ffprobe.format?.duration),
    debitKbps: ffprobe.format?.bit_rate ? Number(ffprobe.format.bit_rate) / 1000 : null,
    video: video && {
      codec: video.codec_name,
      profil: video.profile,
      niveau: nombre(video.level),
      largeur: video.width,
      hauteur: video.height,
      cadence: fraction(video.r_frame_rate),
      cadenceMoyenne: fraction(video.avg_frame_rate),
      pixels: video.pix_fmt,
      balayage: video.field_order ?? 'progressive',
      images: nombre(video.nb_read_frames ?? video.nb_frames),
      dureeS: nombre(video.duration),
      debitKbps: video.bit_rate ? Number(video.bit_rate) / 1000 : null,
    },
    audios: audios.map((a) => ({
      codec: a.codec_name,
      canaux: a.channels,
      frequence: nombre(a.sample_rate),
      debitKbps: a.bit_rate ? Number(a.bit_rate) / 1000 : null,
      active: a.disposition ? a.disposition.default !== 0 || audios.length === 1 : true,
    })),
  }
}

export const sonderVideo = (fichier) => {
  const sortie = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_format', '-show_streams', '-of', 'json', fichier], {
    encoding: 'utf8',
    maxBuffer: 16 * MO,
  })
  return lireSonde({ ffprobe: JSON.parse(sortie), octets: statSync(fichier).size, extension: extname(fichier).toLowerCase() })
}

const presque = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance

const dansLaPlage = (spec, largeur, hauteur) => {
  if (spec.tailles?.some(([l, h]) => l === largeur && h === hauteur)) return true
  const p = spec.plage
  if (!p) return false
  return largeur >= p.largeur[0] && largeur <= p.largeur[1] && hauteur >= p.hauteur[0] && hauteur <= p.hauteur[1] && presque(largeur / hauteur, p.ratio)
}

const tailleAttendue = (spec) =>
  [...(spec.tailles ?? []).map(([l, h]) => `${l}×${h}`), ...(spec.plage ? [`${spec.plage.largeur.join('–')} × ${spec.plage.hauteur.join('–')} en 3:2`] : [])].join(' ou ')

const erreursCadence = (spec, v) => {
  const { cadence, cadenceMoyenne } = v
  if (!presque(cadence, cadenceMoyenne, 0.05)) return [`cadence variable (${cadence.toFixed(3)} déclarée, ${cadenceMoyenne.toFixed(3)} moyenne)`]
  if (spec.cadences.exactes && !spec.cadences.exactes.some((c) => presque(cadence, c))) {
    return [`cadence ${cadence.toFixed(3)} i/s, attendu ${spec.cadences.exactes.join(' ou ')}`]
  }
  if (spec.cadences.min !== undefined && (cadence < spec.cadences.min - 0.01 || cadence > spec.cadences.max + 0.01)) {
    return [`cadence ${cadence.toFixed(3)} i/s, attendu ${spec.cadences.min} à ${spec.cadences.max}`]
  }
  return []
}

const erreursAudio = (attendu, audios) => {
  if (!attendu) return []
  if (!audios.length) return ['aucune piste audio (un aperçu en porte une, stéréo)']
  return audios.flatMap((a, i) => {
    const nom = `piste audio ${i + 1}`
    return [
      a.codec !== attendu.codec && `${nom} : codec ${a.codec}, attendu ${attendu.codec}`,
      a.canaux !== attendu.canaux && `${nom} : ${a.canaux} canal(aux), attendu stéréo`,
      !attendu.frequences.includes(a.frequence) && `${nom} : ${a.frequence} Hz, attendu ${attendu.frequences.join(' ou ')}`,
      a.debitKbps !== null && (a.debitKbps < attendu.debitKbps[0] || a.debitKbps > attendu.debitKbps[1]) && `${nom} : ${Math.round(a.debitKbps)} kb/s, attendu 256`,
      !a.active && `${nom} : désactivée (toutes les pistes doivent être actives)`,
    ].filter(Boolean)
  })
}

// Rend la liste des écarts à la spécification ; vide = conforme.
export const verifierVideo = (sonde, spec) => {
  const v = sonde.video
  if (!v) return ['aucune piste vidéo']
  const [dMin, dMax] = spec.dureeS
  const durees = [sonde.dureeS, v.dureeS].filter((d) => d !== null)
  return [
    !spec.conteneurs.includes(sonde.extension) && `conteneur ${sonde.extension}, attendu ${spec.conteneurs.join(', ')}`,
    !dansLaPlage(spec, v.largeur, v.hauteur) && `taille ${v.largeur}×${v.hauteur}, attendu ${tailleAttendue(spec)}`,
    !durees.length && 'durée illisible',
    ...durees.filter((d) => d < dMin || d > dMax).map((d) => `durée ${d.toFixed(3)} s, attendu ${dMin} à ${dMax} s`),
    !spec.codecs.includes(v.codec) && `codec ${v.codec}, attendu ${spec.codecs.join(' ou ')}`,
    spec.profils && v.codec === 'h264' && !spec.profils.includes(v.profil) && `profil H.264 ${v.profil}, attendu ${spec.profils.join(', ')}`,
    spec.niveauMax && v.codec === 'h264' && v.niveau > spec.niveauMax && `niveau H.264 ${v.niveau / 10}, ${spec.niveauMax / 10} au plus`,
    v.pixels !== 'yuv420p' && `format de pixel ${v.pixels}, attendu yuv420p`,
    v.balayage !== 'progressive' && v.balayage !== 'unknown' && `balayage ${v.balayage}, attendu progressif`,
    ...erreursCadence(spec, v),
    spec.debitVideoMaxKbps && v.debitKbps !== null && v.debitKbps > spec.debitVideoMaxKbps && `débit vidéo ${Math.round(v.debitKbps)} kb/s, ${spec.debitVideoMaxKbps} au plus`,
    spec.tailleMaxOctets && sonde.octets > spec.tailleMaxOctets && `fichier de ${(sonde.octets / MO).toFixed(1)} Mo, ${spec.tailleMaxOctets / MO} Mo au plus`,
    ...erreursAudio(spec.audio, sonde.audios),
  ].filter(Boolean)
}

export const verifierImage = ({ png, extension }, spec) => {
  const info = pngInfo(png)
  return [
    !spec.extensions.includes(extension) && `extension ${extension}, attendu ${spec.extensions.join(', ')}`,
    !dansLaPlage(spec, info.width, info.height) && `taille ${info.width}×${info.height}, attendu ${tailleAttendue(spec)}`,
    info.colorType !== 2 && `type de couleur ${info.colorType} : une image App Store est RVB sans canal alpha`,
  ].filter(Boolean)
}

// Le contrôle d'un fichier sur disque contre la spécification nommée.
export const controler = (fichier, nomSpec) => {
  const spec = specDe(nomSpec)
  const extension = extname(fichier).toLowerCase()
  const erreurs = spec.type === 'image'
    ? verifierImage({ png: readFileSync(fichier), extension }, spec)
    : verifierVideo(sonderVideo(fichier), spec)
  return { fichier, spec: nomSpec, conforme: erreurs.length === 0, erreurs }
}
