import type { FrameUsageCatalog } from '../i18n-frame-usage-catalog';

/** LE LIBELLÉ D'USAGE D'UN CADRE, PORTUGAIS (#10146) — les clés du français. */
const pt = {
  'frame.usage.callAndCapture': 'Utilizável: videochamadas e capturas',
  'frame.usage.captureOnly': 'Apenas captura de foto e vídeo',
  'frame.usage.photoOnly': 'Apenas foto',
  'frame.usage.videoOnly': 'Apenas vídeo',
  'frame.usage.rankOnly': 'Apenas o rank {rank}',
  'frame.usage.rankDivisionOnly': 'Apenas o rank {rank} {division}',
  'frame.usage.prestigeOnly': 'Apenas prestígio',
  'frame.usage.achievementOnly': 'Apenas conquistas',
  'frame.usage.achievementRarityOnly': 'Apenas conquistas {rarity}',
  'frame.usage.momentOnly': 'Apenas momentos «{family}»',
  'frame.usage.avatarOnly': 'Somente contorno de perfil',
  'frame.usage.bannerFrameOnly': 'Somente moldura de banner',
} as const satisfies FrameUsageCatalog;

export default pt;
