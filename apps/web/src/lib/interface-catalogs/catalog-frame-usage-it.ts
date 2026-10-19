import type { FrameUsageCatalog } from '../i18n-frame-usage-catalog';

/** LE LIBELLÉ D'USAGE D'UN CADRE, ITALIEN (#10146) — les clés du français. */
const it = {
  'frame.usage.callAndCapture': 'Utilizzabile: videochiamate e acquisizioni',
  'frame.usage.captureOnly': 'Solo acquisizione foto e video',
  'frame.usage.photoOnly': 'Solo foto',
  'frame.usage.videoOnly': 'Solo video',
  'frame.usage.rankOnly': 'Solo rango {rank}',
  'frame.usage.rankDivisionOnly': 'Solo rango {rank} {division}',
  'frame.usage.prestigeOnly': 'Solo prestigio',
  'frame.usage.achievementOnly': 'Solo traguardi',
  'frame.usage.achievementRarityOnly': 'Solo traguardi {rarity}',
  'frame.usage.momentOnly': 'Solo momenti «{family}»',
  'frame.usage.avatarOnly': 'Solo contorno del profilo',
  'frame.usage.bannerFrameOnly': 'Solo cornice del banner',
} as const satisfies FrameUsageCatalog;

export default it;
