import type { FrameUsageCatalog } from '../i18n-frame-usage-catalog';

/** LE LIBELLÉ D'USAGE D'UN CADRE, ALLEMAND (#10146) — les clés du français. */
const de = {
  'frame.usage.callAndCapture': 'Verwendbar: Videoanrufe und Aufnahmen',
  'frame.usage.captureOnly': 'Nur Foto- und Videoaufnahme',
  'frame.usage.photoOnly': 'Nur Foto',
  'frame.usage.videoOnly': 'Nur Video',
  'frame.usage.rankOnly': 'Nur Rang {rank}',
  'frame.usage.rankDivisionOnly': 'Nur Rang {rank} {division}',
  'frame.usage.prestigeOnly': 'Nur Prestige',
  'frame.usage.achievementOnly': 'Nur Erfolge',
  'frame.usage.achievementRarityOnly': 'Nur Erfolge: {rarity}',
  'frame.usage.momentOnly': 'Nur Momente „{family}“',
  'frame.usage.avatarOnly': 'Nur Profilrahmen',
  'frame.usage.bannerFrameOnly': 'Nur Bannerrahmen',
} as const satisfies FrameUsageCatalog;

export default de;
