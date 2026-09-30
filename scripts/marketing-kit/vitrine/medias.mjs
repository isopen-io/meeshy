// Les médias de la vitrine (#8855) : les photos du kit et des vocaux synthétisés. L'app les range
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
