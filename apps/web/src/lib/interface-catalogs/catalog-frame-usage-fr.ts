import type { FrameUsageLabelKey } from '@meeshy/shared/types/frame-usage';

/**
 * LE LIBELLÉ D'USAGE D'UN CADRE, FRANÇAIS (#10146) — la SOURCE des clés, qui
 * sont celles de la loi partagée (`FRAME_USAGE_LABEL_KEYS`,
 * `packages/shared/types/frame-usage.ts`). `{rank}`, `{rarity}` et `{family}`
 * reçoivent le nom que l'hôte traduit ; `{division}` arrive en chiffres romains.
 */
const fr = {
  'frame.usage.callAndCapture': 'Utilisable : appels vidéo et captures',
  'frame.usage.captureOnly': 'Capture photo et vidéo uniquement',
  'frame.usage.photoOnly': 'Photo uniquement',
  'frame.usage.videoOnly': 'Vidéo uniquement',
  'frame.usage.rankOnly': 'Rang {rank} uniquement',
  'frame.usage.rankDivisionOnly': 'Rang {rank} {division} uniquement',
  'frame.usage.prestigeOnly': 'Prestige uniquement',
  'frame.usage.achievementOnly': 'Succès uniquement',
  'frame.usage.achievementRarityOnly': 'Succès {rarity} uniquement',
  'frame.usage.momentOnly': 'Moment « {family} » uniquement',
  'frame.usage.avatarOnly': 'Contour de profil uniquement',
  'frame.usage.bannerFrameOnly': 'Cadre de bannière uniquement',
} as const satisfies Readonly<Record<FrameUsageLabelKey, string>>;

export default fr;
