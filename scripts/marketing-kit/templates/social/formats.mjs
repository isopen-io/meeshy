// Formats du kit réseaux sociaux (#7728) — contenu-par-format.md § 1-4.
// `scale` = densité de rendu : la scène CSS fait width/scale × height/scale.
export const SOCIAL_FORMATS = {
  '9x16': { width: 1080, height: 1920, scale: 2, usage: 'TikTok, Reels, Shorts, stories Meeshy' },
  '4x5': { width: 1080, height: 1350, scale: 2, usage: 'carrousel Instagram' },
  '1x1': { width: 1080, height: 1080, scale: 2, usage: 'X, Threads' },
  '16x9': { width: 1600, height: 900, scale: 2, usage: 'X, Threads' },
  yt: { width: 1280, height: 720, scale: 2, usage: 'miniature YouTube' },
}

export const socialFormat = (nom) => {
  const format = SOCIAL_FORMATS[nom]
  if (!format) throw new Error(`format social inconnu : ${nom} (connus : ${Object.keys(SOCIAL_FORMATS).join(', ')})`)
  return format
}
