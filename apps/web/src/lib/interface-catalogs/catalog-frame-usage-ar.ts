import type { FrameUsageCatalog } from '../i18n-frame-usage-catalog';

/** LE LIBELLÉ D'USAGE D'UN CADRE, ARABE (#10146) — les clés du français. */
const ar = {
  'frame.usage.callAndCapture': 'قابل للاستخدام: مكالمات الفيديو والالتقاط',
  'frame.usage.captureOnly': 'التقاط الصور والفيديو فقط',
  'frame.usage.photoOnly': 'الصور فقط',
  'frame.usage.videoOnly': 'الفيديو فقط',
  'frame.usage.rankOnly': 'رتبة {rank} فقط',
  'frame.usage.rankDivisionOnly': 'رتبة {rank} {division} فقط',
  'frame.usage.prestigeOnly': 'الهيبة فقط',
  'frame.usage.achievementOnly': 'الإنجازات فقط',
  'frame.usage.achievementRarityOnly': 'إنجازات {rarity} فقط',
  'frame.usage.momentOnly': 'لحظات «{family}» فقط',
  'frame.usage.avatarOnly': 'إطار الملف الشخصي فقط',
  'frame.usage.bannerFrameOnly': 'إطار اللافتة فقط',
} as const satisfies FrameUsageCatalog;

export default ar;
