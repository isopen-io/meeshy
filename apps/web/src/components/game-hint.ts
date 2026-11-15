import { SETTINGS_GLYPHS } from '@/components/glyphs-settings';
import type { InfoHint } from '@/components/info-hint';
import type { GameCatalogKey } from '@/lib/i18n-game-catalog';
import { gameText } from '@/lib/view/game-copy';

/**
 * UN (i) DU JEU (épure #17584, règle 1) — la QUESTION nomme le bouton, la
 * réponse est la note : deux clés du catalogue du jeu, sans paramètre. La
 * note reste lue repliée ; le (i) ne porte que le détail secondaire, jamais
 * l'unique explication d'une feature (règle 7).
 */
export const gameHint = (question: GameCatalogKey, text: GameCatalogKey, extra?: string): InfoHint => ({
  label: gameText(question as never),
  text: extra === undefined ? gameText(text as never) : `${gameText(text as never)} ${extra}`,
  glyph: SETTINGS_GLYPHS.info,
});
