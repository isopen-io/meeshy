// Les médias de la vitrine (#8855) : les photos du kit, des vocaux synthétisés et la vidéo du réel (#9820). L'app les range
// dans ses caches sous l'URL EXACTE que portent leurs messages et leurs posts : face à l'hôte
// injoignable (127.0.0.1), `MeeshyConfig.resolveMediaURL` ne résout rien, et cette URL relative
// est la clé que lisent les vues. Aucun média ne part vers le réseau.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { CREDITS } from '../lib/photos.mjs'

export const RACINE_MEDIAS = '/api/v1/attachments/file/vitrine'
export const DOSSIER_PHOTOS = resolve(REPO_ROOT, 'scripts/marketing-kit/photos')
export const CACHE_VOIX = resolve(REPO_ROOT, 'scripts/marketing-kit/out/vitrine/voix')
export const CACHE_VIDEOS = resolve(REPO_ROOT, 'scripts/marketing-kit/out/vitrine/videos')

export const urlMedia = (fichier) => `${RACINE_MEDIAS}/${fichier}`

// Largeur et hauteur d'un JPEG, lues dans son segment SOF (0xC0–0xCF, hors DHT, JPG et DAC).
export const dimensionsJpeg = (octets) => {
  const lire = (i) => {
    if (i + 9 > octets.length || octets[i] !== 0xff) throw new Error('JPEG sans dimensions')
    const marqueur = octets[i + 1]
    if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) {
      return { width: octets.readUInt16BE(i + 7), height: octets.readUInt16BE(i + 5) }
    }
    return lire(i + 2 + octets.readUInt16BE(i + 2))
  }
  return lire(2)
}

export const photoMedia = (photo) => {
  const credit = CREDITS[photo]
  if (!credit) throw new Error(`photo inconnue : ${photo}`)
  const octets = readFileSync(resolve(DOSSIER_PHOTOS, credit.fichier))
  return { url: urlMedia(credit.fichier), fichier: credit.fichier, genre: 'image', photo, taille: octets.length, ...dimensionsJpeg(octets) }
}

export const vocalMedia = ({ cle, texte, lang }) => ({ url: urlMedia(`${cle}.m4a`), fichier: `${cle}.m4a`, genre: 'audio', texte, lang })

// Le karaoké d'une piste : un segment par mot (par membre de phrase pour le japonais, qui
// n'espace pas), réparti au prorata de sa longueur sur la durée mesurée.
const morceaux = (texte) => (/\s/.test(texte.trim()) ? texte.trim().split(/\s+/) : (texte.match(/[^、。！？]+[、。！？]*/gu) ?? [texte]))

export const segmenter = (texte, dureeMs) => {
  const parts = morceaux(texte)
  const bornes = parts.reduce((acc, part) => [...acc, acc.at(-1) + [...part].length], [0])
  const total = bornes.at(-1)
  return parts.map((text, i) => ({
    text,
    startMs: Math.round((bornes[i] / total) * dureeMs),
    endMs: Math.round((bornes[i + 1] / total) * dureeMs),
  }))
}

const LOCALES_VOIX = { ko: 'ko_KR', ja: 'ja_JP', fr: 'fr_FR', en: 'en_US', es: 'es_ES', de: 'de_DE', it: 'it_IT', pt: 'pt_BR', ar: 'ar_001' }
const VOIX_PREFEREES = { ko: 'Yuna', ja: 'Kyoko', fr: 'Thomas', en: 'Samantha', es: 'Mónica', de: 'Anna', it: 'Alice', pt: 'Luciana', ar: 'Majed' }

// `say -v '?'` : « Nom (variante)   fr_FR    # phrase d'exemple ».
export const lireVoix = (sortie) =>
  sortie.split('\n').flatMap((ligne) => {
    const m = ligne.match(/^(.+?)\s+([a-z]{2,3}_[A-Z0-9]{2,3})\s+#/)
    return m ? [{ nom: m[1].trim(), locale: m[2] }] : []
  })

export const choisirVoix = (lang, voix) => {
  const locale = LOCALES_VOIX[lang]
  const candidates = voix.filter((v) => v.locale === locale)
  const choisie = candidates.find((v) => v.nom === VOIX_PREFEREES[lang]) ?? candidates[0]
  if (!choisie) throw new Error(`aucune voix ${locale ?? lang} installée (Réglages › Accessibilité › Contenu énoncé)`)
  return choisie.nom
}

export const dureeDepuisAfinfo = (sortie) => {
  const m = sortie.match(/estimated duration: ([\d.]+) sec/)
  if (!m) throw new Error('afinfo ne donne aucune durée')
  return Math.round(Number(m[1]) * 1000)
}

// Les réglages d'une synthèse (`debit` : mots par minute, `null` = celui de la voix). Ils nomment le
// fichier : une autre voix ou un autre débit resynthétise au lieu de resservir l'ancienne piste.
export const reglagesVoix = (lang) => ({ voix: VOIX_PREFEREES[lang] ?? null, debit: null })

// Un vocal synthétisé une fois pour toutes : le cache se nomme par la langue, le texte et les réglages.
export const fichierVoix = ({ texte, lang }, reglages = reglagesVoix(lang)) =>
  resolve(CACHE_VOIX, `${createHash('sha1').update(JSON.stringify({ lang, texte, ...reglages })).digest('hex').slice(0, 16)}.m4a`)

export const synthetiser = (media, voix) => {
  const sortie = fichierVoix(media)
  if (!existsSync(sortie)) {
    mkdirSync(dirname(sortie), { recursive: true })
    const aiff = `${sortie}.aiff`
    const { debit } = reglagesVoix(media.lang)
    execFileSync('say', ['-v', choisirVoix(media.lang, voix), ...(debit ? ['-r', String(debit)] : []), '-o', aiff, media.texte])
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', aiff, sortie])
    rmSync(aiff)
  }
  return { dureeMs: dureeDepuisAfinfo(execFileSync('afinfo', [sortie], { encoding: 'utf8' })), taille: statSync(sortie).size }
}

// Les vidéos du kit (#9820) : Pexels, libres pour un usage commercial et modifiables, sans attribution exigée
// (https://www.pexels.com/license/), sans personne à l'image. La source pèse 21 Mo : elle n'est PAS versionnée. Elle
// se télécharge une fois, se vérifie par son empreinte — un fichier changé sous la même adresse refuse de servir —, puis
// ffmpeg en tire l'extrait vertical que l'app reçoit (720×1280, 30 i/s, sans piste son, ~3 Mo).
export const VIDEOS = {
  'coucher-ocean': {
    fichier: 'reel-coucher-ocean.mp4',
    sujet: 'Le soleil se couche sur la mer, reflets d’or sur les vagues — le réel que publie le lecteur',
    titre: 'Beautiful Sunset Over Calm Ocean Waves',
    auteur: 'Efrem Efre',
    page: 'https://www.pexels.com/video/beautiful-sunset-over-calm-ocean-waves-32523863/',
    source: 'https://videos.pexels.com/video-files/32523863/13869625_1080_1920_25fps.mp4',
    sha256: 'dbab64282ccb06906ab64086870ff3e3a23f0070289d827339b9d1eba3a11d39',
    licence: 'https://www.pexels.com/license/',
    personnes: 0,
    extrait: { debutS: 2, dureeS: 6 },
    width: 720,
    height: 1280,
  },
  // Les réels drôles de l'en-tête (#9904) : Mixkit, « Mixkit Stock Video Free License » relevée sur la page de chaque
  // vidéo le 2026-10-10 (« for commercial or personal use », « Online marketing ads », modification permise, sans
  // attribution exigée — https://mixkit.co/license/#videoFree). Des personnes s'y amusent d'elles-mêmes, aucune n'est
  // montrée en mauvaise posture ; le visage du réel « réunion » est caché par un émoji.
  'miroir-brosse': {
    fichier: 'reel-miroir-brosse.mp4',
    sujet: 'Un homme chante dans sa salle de bain, une brosse à dents en guise de micro',
    titre: 'Man Dancing in the Mirror',
    auteur: 'Mixkit',
    page: 'https://mixkit.co/free-stock-video/man-dancing-in-the-mirror-101308/',
    source: 'https://assets.mixkit.co/83tgdssraio4axz74ddb0rv5n7pb',
    sha256: 'c8fbb941873bc08c36fecb2f380958fd1aaeebd563eb58500e24e05da5afb666',
    licence: 'https://mixkit.co/license/#videoFree',
    personnes: 1,
    extrait: { debutS: 3, dureeS: 5 },
    width: 720,
    height: 1280,
  },
  'louche-micro': {
    fichier: 'reel-louche-micro.mp4',
    sujet: 'Une femme en pyjama chante à pleine voix dans une louche',
    titre: 'Inspired Singing With Ladle Mic',
    auteur: 'Mixkit',
    page: 'https://mixkit.co/free-stock-video/inspired-singing-with-ladle-mic-101073/',
    source: 'https://assets.mixkit.co/wtdt6olnzx6dtmqg6x1tihwxa8ar',
    sha256: '7daf2f13d89293177a2eff971ac89733ef52b4ab2b3ac82a689e958f7079c369',
    licence: 'https://mixkit.co/license/#videoFree',
    personnes: 1,
    extrait: { debutS: 0, dureeS: 5 },
    width: 720,
    height: 1280,
  },
  'emoji-reunion': {
    fichier: 'reel-emoji-reunion.mp4',
    sujet: 'Un employé de bureau, le visage caché par un émoji qui pleure de rire, montre la caméra du doigt',
    titre: 'Corporate Employee With Laughing Emoji Face',
    auteur: 'Mixkit',
    page: 'https://mixkit.co/free-stock-video/corporate-employee-with-laughing-emoji-face-100848/',
    source: 'https://assets.mixkit.co/t575rbq231um3wymatacfxblkh1d',
    sha256: '239b7f640ee7bdd3515064655da3da131b3167f1466629c6219162785dfb9c2a',
    licence: 'https://mixkit.co/license/#videoFree',
    personnes: 0,
    extrait: { debutS: 3.4, dureeS: 5 },
    width: 720,
    height: 1280,
  },
  'menage-danse': {
    fichier: 'reel-menage-danse.mp4',
    sujet: 'Une femme danse avec sa serpillière au lieu de faire le ménage',
    titre: 'Woman Sassy Dancing While Mopping',
    auteur: 'Mixkit',
    page: 'https://mixkit.co/free-stock-video/woman-sassy-dancing-while-mopping-101068/',
    source: 'https://assets.mixkit.co/rj4z0vmvda777jwor8vkxh4xdsj9',
    sha256: '44a62340ea6f0d5353306f912f2b50c463acb9fb381a2e3b1080bf43a222de44',
    licence: 'https://mixkit.co/license/#videoFree',
    personnes: 1,
    extrait: { debutS: 1, dureeS: 5 },
    width: 720,
    height: 1280,
  },
}

// Les vidéos des réels drôles que la scène `interaction-defilement` fait défiler (#9904), dans l'ordre du fil.
export const VIDEOS_DES_REELS_DROLES = ['miroir-brosse', 'louche-micro', 'emoji-reunion', 'menage-danse']

// La vidéo que publie la scène `interaction-reel`.
export const VIDEO_DU_REEL = 'coucher-ocean'

export const videoMedia = (video) => {
  const v = VIDEOS[video]
  if (!v) throw new Error(`vidéo inconnue : ${video}`)
  return { url: urlMedia(v.fichier), fichier: v.fichier, genre: 'video', video, width: v.width, height: v.height, dureeMs: v.extrait.dureeS * 1000 }
}

// L'affiche d'une vidéo (#9904), comme la passerelle la tire : une image JPEG de la première seconde, aux dimensions de
// l'extrait. Sans elle, la page d'un réel peint sa couleur d'attente tant que la première image n'est pas décodée.
export const fichierAffiche = (video) => VIDEOS[video].fichier.replace(/\.mp4$/, '.jpg')

export const afficheMedia = (video) => {
  const v = VIDEOS[video]
  if (!v) throw new Error(`vidéo inconnue : ${video}`)
  return { url: urlMedia(fichierAffiche(video)), fichier: fichierAffiche(video), genre: 'image', affiche: video, width: v.width, height: v.height }
}

export const argumentsAffiche = ({ extrait, sortie }) =>
  ['-v', 'error', '-y', '-ss', '0.3', '-i', extrait, '-frames:v', '1', '-q:v', '3', sortie]

export const empreinte = (octets) => createHash('sha256').update(octets).digest('hex')

// L'extrait que l'app reçoit : rogné, ramené au format de la scène, en H.264 lisible partout, l'index en tête.
export const argumentsExtrait = ({ source, sortie, video }) => {
  const { extrait, width, height } = VIDEOS[video]
  return [
    '-v', 'error', '-y', '-ss', String(extrait.debutS), '-t', String(extrait.dureeS), '-i', source, '-an',
    '-vf', `scale=${width}:${height},fps=30`, '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', sortie,
  ]
}

export const fichierVideo = (video, dossier = CACHE_VIDEOS) => resolve(dossier, VIDEOS[video].fichier)
export const fichierSourceVideo = (video, dossier = CACHE_VIDEOS) => resolve(dossier, `${video}.source.mp4`)

const curl = (url, chemin) => execFileSync('curl', ['-fsSL', '--retry', '2', '-o', chemin, url])

// La source téléchargée une fois, vérifiée, puis l'extrait tiré une fois : les prises suivantes resservent le fichier.
export const preparerVideo = (video, { telecharger = curl, extraire = (args) => execFileSync('ffmpeg', args), dossier = CACHE_VIDEOS } = {}) => {
  const v = VIDEOS[video]
  if (!v) throw new Error(`vidéo inconnue : ${video}`)
  const sortie = fichierVideo(video, dossier)
  if (existsSync(sortie)) return sortie
  mkdirSync(dossier, { recursive: true })
  const source = fichierSourceVideo(video, dossier)
  if (!existsSync(source)) telecharger(v.source, source)
  const recue = empreinte(readFileSync(source))
  if (recue !== v.sha256) {
    rmSync(source, { force: true })
    throw new Error(`${video} : la source téléchargée n’est pas celle du kit (empreinte ${recue}, attendue ${v.sha256})`)
  }
  extraire(argumentsExtrait({ source, sortie, video }))
  return sortie
}

// L'affiche tirée une fois de l'extrait, à côté de lui.
export const preparerAffiche = (video, { extraireVideo = preparerVideo, tirer = (args) => execFileSync('ffmpeg', args), dossier = CACHE_VIDEOS } = {}) => {
  const sortie = resolve(dossier, fichierAffiche(video))
  if (existsSync(sortie)) return sortie
  tirer(argumentsAffiche({ extrait: extraireVideo(video, { dossier }), sortie }))
  return sortie
}
