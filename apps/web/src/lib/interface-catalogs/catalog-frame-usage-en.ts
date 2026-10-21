import type { FrameUsageCatalog } from '../i18n-frame-usage-catalog';

/** LE LIBELLÉ D'USAGE D'UN CADRE, ANGLAIS (#10146) — les clés du français. */
const en = {
  'frame.usage.callAndCapture': 'Usable: video calls and captures',
  'frame.usage.captureOnly': 'Photo and video capture only',
  'frame.usage.photoOnly': 'Photo only',
  'frame.usage.videoOnly': 'Video only',
  'frame.usage.rankOnly': '{rank} rank only',
  'frame.usage.rankDivisionOnly': '{rank} {division} rank only',
  'frame.usage.prestigeOnly': 'Prestige only',
  'frame.usage.achievementOnly': 'Achievements only',
  'frame.usage.achievementRarityOnly': '{rarity} achievements only',
  'frame.usage.momentOnly': '“{family}” moments only',
  'frame.usage.avatarOnly': 'Profile ring only',
  'frame.usage.bannerFrameOnly': 'Banner frame only',
} as const satisfies FrameUsageCatalog;

export default en;
