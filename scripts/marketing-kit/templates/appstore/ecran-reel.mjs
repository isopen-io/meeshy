// Un écran RÉEL dans une capture recomposée (1.1.3) : la capture déclare, par langue, la vidéo
// d'écran tournée (Marketing/02-captures/, hors dépôt) et l'instant où la page est posée. L'image
// en est tirée par ffmpeg et prend la place de la maquette dans le même cadre, sous la même légende.
// Une langue sans vidéo garde la maquette ; une vidéo déclarée mais absente arrête le rendu.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../../lib/catalog.mjs'

export const imageDeVideo = (video, instant) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(instant), '-i', video, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0 || !r.stdout?.length) throw new Error(`ffmpeg n'a pas tiré l'image ${instant} s de ${video} : ${r.stderr?.toString() || r.error?.message}`)
  return r.stdout
}

export const imageReelle = ({ capture, lang, extraire = imageDeVideo, existe = existsSync }) => {
  const source = capture.ecranReel?.[lang]
  if (!source) return null
  const video = resolve(REPO_ROOT, source.video)
  if (!existe(video)) throw new Error(`écran réel absent : ${video} — la capture « ${capture.ecran} » l'exige en ${lang}`)
  return extraire(video, source.instant)
}
