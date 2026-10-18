import type { FrameUsageCatalog } from '../i18n-frame-usage-catalog';

/** LE LIBELLÉ D'USAGE D'UN CADRE, ESPAGNOL (#10146) — les clés du français. */
const es = {
  'frame.usage.callAndCapture': 'Utilizable: videollamadas y capturas',
  'frame.usage.captureOnly': 'Solo captura de foto y vídeo',
  'frame.usage.photoOnly': 'Solo foto',
  'frame.usage.videoOnly': 'Solo vídeo',
  'frame.usage.rankOnly': 'Solo rango {rank}',
  'frame.usage.rankDivisionOnly': 'Solo rango {rank} {division}',
  'frame.usage.prestigeOnly': 'Solo prestigio',
  'frame.usage.achievementOnly': 'Solo logros',
  'frame.usage.achievementRarityOnly': 'Solo logros {rarity}',
  'frame.usage.momentOnly': 'Solo momentos «{family}»',
  'frame.usage.avatarOnly': 'Solo contorno de perfil',
  'frame.usage.bannerFrameOnly': 'Solo marco de banner',
} as const satisfies FrameUsageCatalog;

export default es;
