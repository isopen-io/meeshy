import type { GameStatsTextKey } from '@/lib/interface-catalogs/admin/analytics-game-fr';

import { lazyTabTexts, type TabTexts } from './tab-texts';

/**
 * **LES TEXTES DE L'ONGLET JEU, À LA DEMANDE** (#20618) — hors du catalogue
 * d'administration : seul l'onglet « Jeu » des statistiques les lit.
 */
export type GameStatsTexts = TabTexts<GameStatsTextKey>;

const game = lazyTabTexts<GameStatsTextKey>({
  fr: () => import('@/lib/interface-catalogs/admin/analytics-game-fr'),
  en: () => import('@/lib/interface-catalogs/admin/analytics-game-en'),
  es: () => import('@/lib/interface-catalogs/admin/analytics-game-es'),
  pt: () => import('@/lib/interface-catalogs/admin/analytics-game-pt'),
});

export const loadGameStatsTexts = game.load;
export const useGameStatsTexts = game.use;
export const gameStatsText = game.text;
