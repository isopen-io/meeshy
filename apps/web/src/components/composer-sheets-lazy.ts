import { lazy } from 'react';

import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES FEUILLES DU COMPOSEUR, EN UN SEUL POINT D'IMPORT** (#9318) — le
 * composeur du fil (`composer.tsx`) et celui des commentaires
 * (`comment-composer-tools.tsx`) ouvrent la MÊME palette d'emojis et la MÊME
 * feuille de stickers : deux déclarations paresseuses auraient été deux
 * chargements à tenir d'accord (le catalogue des packs en est un).
 *
 * LA PALETTE D'EMOJIS, CHARGÉE À LA DEMANDE (#7280) — même discipline que
 * `LanguageSheet` et `EffectsSheet` : la grille des vingt (`EmojiGrid`,
 * SEULE liste du dépôt) et la feuille qui la porte n'entrent dans aucun
 * chunk tant qu'on n'a pas touché la tuile « Emoji ». La feuille de stickers
 * arrive AVEC les libellés de ses packs (`stickerPacks.*`), jamais au
 * démarrage.
 */
export const ComposerEmojiSheet = lazy(() =>
  import('./composer-emoji-sheet').then((m) => ({ default: m.ComposerEmojiSheet })),
);

export const ComposerStickerSheet = lazy(() =>
  Promise.all([
    import('./composer-sticker-sheet'),
    import('@/lib/i18n-sticker-packs-catalog').then((m) => m.loadStickerPacksCatalog(currentInterfaceLanguage())),
  ]).then(([m]) => ({ default: m.ComposerStickerSheet })),
);
