import type { PlaybackTextKey } from '@/lib/interface-catalogs/admin/analytics-playback-fr';

import { lazyTabTexts, type TabTexts } from './tab-texts';

/**
 * **LES TEXTES DE L'ONGLET LECTURE, À LA DEMANDE** (#11280) — sortis du catalogue
 * d'administration : seul l'onglet « Lecture » des statistiques les lit.
 */
export type PlaybackTexts = TabTexts<PlaybackTextKey>;

const playback = lazyTabTexts<PlaybackTextKey>({
  fr: () => import('@/lib/interface-catalogs/admin/analytics-playback-fr'),
  en: () => import('@/lib/interface-catalogs/admin/analytics-playback-en'),
  es: () => import('@/lib/interface-catalogs/admin/analytics-playback-es'),
  pt: () => import('@/lib/interface-catalogs/admin/analytics-playback-pt'),
});

export const loadPlaybackTexts = playback.load;
export const usePlaybackTexts = playback.use;
export const playbackText = playback.text;
