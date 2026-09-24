export const FORMATS = {
  'iphone-6.9': { width: 1320, height: 2868, scale: 3, device: 'iphone', usage: 'App Store iPhone 6,9"' },
  'ipad-13': { width: 2752, height: 2064, scale: 2, device: 'ipad', usage: 'App Store iPad 13" paysage' },
  'social-9x16': { width: 1080, height: 1920, scale: 2, device: 'iphone', usage: 'TikTok, Reels, Shorts, stories' },
  'social-4x5': { width: 1080, height: 1350, scale: 2, device: 'iphone', usage: 'carrousel Instagram' },
  'social-1x1': { width: 1080, height: 1080, scale: 2, device: 'iphone', usage: 'X, Threads' },
  'social-16x9': { width: 1920, height: 1080, scale: 2, device: 'ipad', usage: 'X, YouTube' },
}

export const formatOf = (name) => {
  const format = FORMATS[name]
  if (!format) throw new Error(`format inconnu : ${name} (connus : ${Object.keys(FORMATS).join(', ')})`)
  return format
}
