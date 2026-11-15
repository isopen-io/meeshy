// La piste musicale des aperçus (#9807) : une nappe douce et un arpège de cloches, SYNTHÉTISÉS ici, note
// par note. Aucun enregistrement tiers n'entre dans le fichier : la musique est une œuvre originale du kit
// Meeshy, sans licence à tenir ni territoire à vérifier (App Store « App Previews » : « Show only material
// you have the legal right to display »). Déterministe : la même durée rend les mêmes échantillons.
//
// Harmonie : I – vi – IV – V en ré majeur (Dmaj9, Bm7, Gmaj7, A6sus), quatre secondes par accord. Nappe :
// trois sinus désaccordés par note, attaque et extinction en cosinus surélevé, enchaînées sur une seconde.
// Cloches : une note de l'accord, à l'octave, toutes les 0,5 s, enveloppe exponentielle, légèrement
// panoramiquée. Écho stéréo croisé de 375 ms. Fondu d'entrée 1 s, de sortie 1,5 s, crête à -9 dBFS.

export const FREQUENCE = 48000
export const LICENCE_MUSIQUE = 'Œuvre originale synthétisée par scripts/marketing-kit/lib/musique.mjs (aucun échantillon tiers) — libre de droits, propriété du projet Meeshy.'

const LA = 440
const midi = (n) => LA * 2 ** ((n - 69) / 12)

const ACCORDS = [
  { nappe: [50, 57, 62, 64, 66], cloches: [74, 78, 81, 76] },
  { nappe: [47, 54, 59, 62, 66], cloches: [71, 74, 78, 73] },
  { nappe: [43, 55, 59, 62, 66], cloches: [71, 74, 79, 78] },
  { nappe: [45, 52, 57, 61, 62], cloches: [69, 73, 76, 74] },
]
const ACCORD_S = 4
const RECOUVREMENT_S = 1
const PAS_CLOCHE_S = 0.5
const ECHO_S = 0.375
const CRETE = 10 ** (-9 / 20)

const DEUX_PI = 2 * Math.PI

const fenetreAccord = (t) => {
  if (t < 0 || t > ACCORD_S + RECOUVREMENT_S) return 0
  if (t < RECOUVREMENT_S) return 0.5 - 0.5 * Math.cos((Math.PI * t) / RECOUVREMENT_S)
  if (t > ACCORD_S) return 0.5 + 0.5 * Math.cos((Math.PI * (t - ACCORD_S)) / RECOUVREMENT_S)
  return 1
}

// L'accord k sonne de k·4 - 1 à k·4 + 4 s : il entre pendant la sortie du précédent.
const nappe = (t) => {
  const premier = Math.max(0, Math.ceil((t - ACCORD_S) / ACCORD_S))
  let somme = 0
  for (let k = premier; k <= Math.floor((t + RECOUVREMENT_S) / ACCORD_S); k += 1) {
    const g = fenetreAccord(t - k * ACCORD_S + RECOUVREMENT_S)
    if (!g) continue
    for (const n of ACCORDS[k % ACCORDS.length].nappe) {
      const f = midi(n)
      somme += g * (Math.sin(DEUX_PI * f * t) + 0.6 * Math.sin(DEUX_PI * f * 1.0017 * t) + 0.6 * Math.sin(DEUX_PI * f * 0.9983 * t))
    }
  }
  return somme * 0.018
}

// Rend [gauche, droite] de la cloche au temps t (les cloches précédentes résonnent encore).
const cloches = (t) => {
  const derniere = Math.floor(t / PAS_CLOCHE_S)
  let g = 0
  let d = 0
  for (let k = Math.max(0, derniere - 5); k <= derniere; k += 1) {
    const age = t - k * PAS_CLOCHE_S
    const accord = ACCORDS[Math.floor((k * PAS_CLOCHE_S) / ACCORD_S) % ACCORDS.length]
    const f = midi(accord.cloches[k % accord.cloches.length])
    const enveloppe = Math.min(1, age / 0.006) * Math.exp(-age / 0.55)
    const son = enveloppe * (Math.sin(DEUX_PI * f * age) + 0.25 * Math.sin(DEUX_PI * f * 2 * age) * Math.exp(-age / 0.2))
    const pan = k % 2 === 0 ? 0.35 : 0.65
    g += son * (1 - pan)
    d += son * pan
  }
  return [g * 0.09, d * 0.09]
}

// Rend { gauche, droite } (Float32Array) de `dureeS` secondes.
export const synthetiser = ({ dureeS, frequence = FREQUENCE }) => {
  if (!(dureeS > 0)) throw new Error('musique : durée positive attendue')
  const n = Math.round(dureeS * frequence)
  const gauche = new Float32Array(n)
  const droite = new Float32Array(n)
  const echo = Math.round(ECHO_S * frequence)
  for (let i = 0; i < n; i += 1) {
    const t = i / frequence
    const fond = nappe(t)
    const [cg, cd] = cloches(t)
    const retourG = i >= echo ? droite[i - echo] * 0.32 : 0
    const retourD = i >= echo ? gauche[i - echo] * 0.32 : 0
    gauche[i] = fond + cg + retourG
    droite[i] = fond + cd + retourD
  }
  const entree = frequence
  const sortie = Math.round(1.5 * frequence)
  let crete = 0
  for (let i = 0; i < n; i += 1) crete = Math.max(crete, Math.abs(gauche[i]), Math.abs(droite[i]))
  const gain = crete ? CRETE / crete : 0
  for (let i = 0; i < n; i += 1) {
    const fondu = Math.min(1, i / entree, (n - 1 - i) / sortie)
    const f = Math.max(0, fondu) ** 2
    gauche[i] *= gain * f
    droite[i] *= gain * f
  }
  return { gauche, droite, frequence }
}

// WAV PCM 16 bits stéréo.
export const wav = ({ gauche, droite, frequence }) => {
  const n = gauche.length
  const donnees = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i += 1) {
    donnees.writeInt16LE(Math.round(Math.max(-1, Math.min(1, gauche[i])) * 32767), i * 4)
    donnees.writeInt16LE(Math.round(Math.max(-1, Math.min(1, droite[i])) * 32767), i * 4 + 2)
  }
  const tete = Buffer.alloc(44)
  tete.write('RIFF', 0, 'ascii')
  tete.writeUInt32LE(36 + donnees.length, 4)
  tete.write('WAVEfmt ', 8, 'ascii')
  tete.writeUInt32LE(16, 16)
  tete.writeUInt16LE(1, 20)
  tete.writeUInt16LE(2, 22)
  tete.writeUInt32LE(frequence, 24)
  tete.writeUInt32LE(frequence * 4, 28)
  tete.writeUInt16LE(4, 32)
  tete.writeUInt16LE(16, 34)
  tete.write('data', 36, 'ascii')
  tete.writeUInt32LE(donnees.length, 40)
  return Buffer.concat([tete, donnees])
}
