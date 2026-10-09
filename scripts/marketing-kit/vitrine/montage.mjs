// Les commandes ffmpeg du montage (#9807, #9811) : arguments PURS (testés tels quels), exécutés par
// monter.mjs. Un aperçu = chaque plan recadré au format Apple, prolongé par son image finale, surmonté de
// sa légende (PNG transparent, fondu d'entrée), enchaîné au suivant par un fondu court, puis la carte de
// fin ; la piste audio est la musique synthétisée ou un silence stéréo, à la durée exacte de l'image.
import { FPS } from './filmer.mjs'
import { FONDU_IMAGES } from './apercus.mjs'

const s = (images) => (images / FPS).toFixed(6)

// Débit visé par Apple pour un aperçu : 10 à 12 Mb/s, H.264 High au plus niveau 4.0.
export const ENCODAGE_APERCU = ['-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
  '-b:v', '11M', '-maxrate', '12M', '-bufsize', '12M', '-r', String(FPS), '-g', String(FPS * 2)]
export const ENCODAGE_AUDIO = ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2']
// L'en-tête 3840×1646 dépasse le niveau 4.0 : niveau 5.1, qualité constante.
export const ENCODAGE_CREATIF = ['-c:v', 'libx264', '-profile:v', 'high', '-level:v', '5.1', '-pix_fmt', 'yuv420p',
  '-crf', '17', '-maxrate', '40M', '-bufsize', '80M', '-r', String(FPS), '-g', String(FPS * 2)]

const remplir = (largeur, hauteur) =>
  `scale=${largeur}:${hauteur}:force_original_aspect_ratio=increase:flags=lanczos,crop=${largeur}:${hauteur},setsar=1`

const image = (chemin, images) => ['-loop', '1', '-framerate', String(FPS), '-t', s(images + FPS), '-i', chemin]

// `segments` : le plan de montage (apercus.mjs) où chaque clip a reçu `cadre` (PNG opaque : bande de légende,
// fond, ombre de l'écran — surimpressions.mjs), `masque` (coins arrondis de l'écran), `voile` s'il est cadré
// (bords fondus dans le fond de l'app), `rognageHaut` (barre d'état, px du clip) et éventuellement `camera` (cadrages.mjs) ; l'écran se pose
// dans `disposition.ecran` (dispositionApercu),
// et la fin son `carte` (PNG plein cadre). `audio` : { wav, fondu? } (tout fichier que lit ffmpeg, complété
// de silence s'il est court, fondu d'entrée et de sortie si `fondu`) ou { silence: true }.
export const argumentsApercu = ({ segments, disposition, audio, sortie, preset = 'slow', fondu = FONDU_IMAGES }) => {
  const { largeur, hauteur, ecran } = disposition
  const entrees = []
  const filtres = []
  const ajouter = (args) => {
    entrees.push(...args)
    return entrees.filter((a) => a === '-i').length - 1
  }
  const fin = (n) => `trim=end_frame=${n},setpts=PTS-STARTPTS`
  segments.forEach((seg, i) => {
    const etiquette = `[s${i}]`
    if (seg.type === 'clip') {
      const v = ajouter(['-i', seg.chemin])
      const c = ajouter(image(seg.cadre, seg.images))
      const m = ajouter(image(seg.masque, seg.images))
      const w = seg.voile ? ajouter(image(seg.voile, seg.images)) : null
      const maintien = s(seg.images - seg.imagesClip + FPS)
      const rogne = seg.rognageHaut ? `crop=iw:ih-${seg.rognageHaut}:0:${seg.rognageHaut},` : ''
      const brut = seg.voile ? `[r${i}]` : `[v${i}]`
      filtres.push(
        `[${v}:v]fps=${FPS},${rogne}${seg.camera ? `${seg.camera},` : ''}scale=${ecran.largeur}:${ecran.hauteur}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=${maintien},${fin(seg.images)},format=rgba${brut}`,
        ...(seg.voile ? [`[${w}:v]format=rgba,${fin(seg.images)}[w${i}]`, `[r${i}][w${i}]overlay=0:0:format=auto,format=rgba[v${i}]`] : []),
        `[${m}:v]format=gray,scale=${ecran.largeur}:${ecran.hauteur},${fin(seg.images)}[m${i}]`,
        `[v${i}][m${i}]alphamerge[e${i}]`,
        `[${c}:v]fps=${FPS},${remplir(largeur, hauteur)},${fin(seg.images)}[c${i}]`,
        `[c${i}][e${i}]overlay=${ecran.x}:${ecran.y}:format=auto,format=yuv420p,${fin(seg.images)},settb=1/${FPS},fps=${FPS}${etiquette}`,
      )
      return
    }
    const c = ajouter(image(seg.carte, seg.images))
    filtres.push(`[${c}:v]fps=${FPS},${remplir(largeur, hauteur)},format=yuv420p,${fin(seg.images)},settb=1/${FPS},fps=${FPS}${etiquette}`)
  })
  let courant = '[s0]'
  let longueur = segments[0].images
  for (let i = 1; i < segments.length; i += 1) {
    const sortieFondu = i === segments.length - 1 ? '[vf]' : `[x${i}]`
    filtres.push(`${courant}[s${i}]xfade=transition=fade:duration=${s(fondu)}:offset=${s(longueur - fondu)}${sortieFondu}`)
    courant = sortieFondu
    longueur += segments[i].images - fondu
  }
  if (segments.length === 1) filtres.push('[s0]null[vf]')
  const a = audio.wav
    ? ajouter(['-i', audio.wav])
    : ajouter(['-f', 'lavfi', '-t', s(longueur + FPS), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'])
  const fondus = audio.fondu ? `,afade=t=in:d=0.5,afade=t=out:st=${s(longueur - 1.5 * FPS)}:d=1.5` : ''
  filtres.push(`[${a}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=end=${s(longueur)},asetpts=PTS-STARTPTS${fondus}[af]`)
  return {
    images: longueur,
    args: [
      '-y', '-v', 'error', ...entrees,
      '-filter_complex', filtres.join(';'),
      '-map', '[vf]', '-map', '[af]', '-frames:v', String(longueur),
      ...ENCODAGE_APERCU, '-preset', preset, ...ENCODAGE_AUDIO, '-movflags', '+faststart', sortie,
    ],
  }
}

// Masque d'un écran aux coins arrondis (niveaux de gris, antialiasé), calculé une fois par taille.
export const argumentsMasque = ({ largeur, hauteur, rayon, sortie }) => {
  const r = rayon
  const dx = `max(max(${r}-X\\,X-(W-1-${r}))\\,0)`
  const dy = `max(max(${r}-Y\\,Y-(H-1-${r}))\\,0)`
  return ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=${largeur}x${hauteur},format=gray`,
    '-vf', `geq=lum=255*clip(${r}+0.5-hypot(${dx}\\,${dy})\\,0\\,1)`, '-frames:v', '1', sortie]
}

// Voile de bord d'un écran ZOOMÉ : la couleur de fond de l'app (#F2F2F7, systemGroupedBackground clair), opaque
// au bord et nulle à `fondu` px vers l'intérieur. Le texte que la fenêtre tranche s'estompe dans le fond de
// l'app ; le cadre, lui, reste net.
export const COULEUR_FOND_APP = [242, 242, 247]
export const argumentsVoile = ({ largeur, hauteur, fondu, sortie, couleur = COULEUR_FOND_APP }) => {
  const [r, g, b] = couleur
  const bord = `min(min(X\\,W-1-X)\\,min(Y\\,H-1-Y))`
  return ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=${largeur}x${hauteur},format=rgba`,
    '-vf', `geq=r=${r}:g=${g}:b=${b}:a=255*(1-clip(${bord}/${fondu}\\,0\\,1))`, '-frames:v', '1', sortie]
}

// Un visuel créatif : le fond (PNG opaque : dégradé, titre, cadres des cartes) et, dans chaque carte, une
// image clé (image fixe) ou un clip (vidéo). En vidéo, chaque carte entre et sort en fondu sur le fond : la
// première et la dernière image sont le fond seul, la boucle d'Apple ne saute pas. Chaque carte montre l'écran
// ENTIER à la même échelle ; `decalage` (px de la carte) le fait défiler vers le haut (apercus.decalageCarte),
// `debutClipS` saute le début d'un clip (une capture qui démarre sur l'écran d'avant).
const defiler = (c) => (c.decalage ? `,crop=${c.largeur}:${c.hauteur - c.decalage}:0:${c.decalage},pad=${c.largeur}:${c.hauteur}:0:0` : '')
export const argumentsCreatif = ({ fond, largeur, hauteur, cartes, video = null, sortie, preset = 'slow' }) => {
  const total = video ? Math.round(video.dureeS * FPS) : 1
  const entrees = video ? image(fond, total) : ['-i', fond]
  const filtres = [video ? `[0:v]fps=${FPS},${remplir(largeur, hauteur)},format=rgba,trim=end_frame=${total},setpts=PTS-STARTPTS[b0]` : `[0:v]${remplir(largeur, hauteur)},format=rgba[b0]`]
  let n = 1
  cartes.forEach((c, i) => {
    const source = n
    const masque = n + 1
    n += 2
    if (video && c.clip) entrees.push(...(c.debutClipS ? ['-ss', c.debutClipS.toFixed(3)] : []), '-i', c.clip)
    else entrees.push(...(video ? image(c.image, total) : ['-i', c.image]))
    entrees.push(...(video ? image(c.masque, total) : ['-i', c.masque]))
    const tenue = video && c.clip
      ? `,tpad=start_mode=clone:start_duration=${(c.debutS ?? 0).toFixed(3)}:stop_mode=clone:stop_duration=${video.dureeS}`
      : ''
    const temps = video ? `,fps=${FPS}${tenue},trim=end_frame=${total},setpts=PTS-STARTPTS` : ''
    const fondus = video ? `,fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=${(video.dureeS - 0.6).toFixed(3)}:d=0.6:alpha=1` : ''
    filtres.push(
      `[${source}:v]${remplir(c.largeur, c.hauteur)}${defiler(c)}${temps},format=rgba[c${i}]`,
      `[${masque}:v]format=gray,scale=${c.largeur}:${c.hauteur}${video ? `,trim=end_frame=${total},setpts=PTS-STARTPTS` : ''}[m${i}]`,
      `[c${i}][m${i}]alphamerge${fondus}[a${i}]`,
      `[b${i}][a${i}]overlay=${c.x}:${c.y}:format=auto[b${i + 1}]`,
    )
  })
  const dernier = `[b${cartes.length}]`
  if (!video) {
    filtres.push(`${dernier}format=rgb24[out]`)
    return ['-y', '-v', 'error', ...entrees, '-filter_complex', filtres.join(';'), '-map', '[out]', '-frames:v', '1', '-pix_fmt', 'rgb24', sortie]
  }
  filtres.push(`${dernier}format=yuv420p[out]`)
  entrees.push('-f', 'lavfi', '-t', video.dureeS.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
  return ['-y', '-v', 'error', ...entrees, '-filter_complex', filtres.join(';'), '-map', '[out]', '-map', `${n}:a`,
    '-frames:v', String(total), ...ENCODAGE_CREATIF, '-preset', preset, ...ENCODAGE_AUDIO, '-shortest', '-movflags', '+faststart', sortie]
}
