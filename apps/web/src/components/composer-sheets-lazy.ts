import { lazy } from 'react';

import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES FEUILLES DU COMPOSEUR, EN UN SEUL POINT D'IMPORT** (#9318) — le
 * composeur du fil (`composer.tsx`) et celui des commentaires
 * (`comment-composer-tools.tsx`) ouvrent la MÊME palette d'emojis et la MÊME
 * feuille de stickers : deux déclarations paresseuses auraient été deux
 * chargements à tenir d'accord (le catalogue des packs en est un).
 *
 * LA PALETTE D'EMOJIS, CHARGÉE À LA DEMANDE (#7280, #10531) — même discipline
 * que `LanguageSheet` et `EffectsSheet` : la feuille d'emojis
 * (`EmojiPickerSheet`) n'entre dans aucun chunk tant qu'on n'a pas touché la
 * tuile « Emoji », et elle arrive AVEC ses libellés (`emojiPicker.*`,
 * `prepareEmojiPickerSheet`), jamais au démarrage. La feuille de stickers arrive de même AVEC les libellés de ses
 * packs (`stickerPacks.*`).
 */
export const ComposerEmojiSheet = lazy(() =>
  import('./composer-emoji-sheet').then((m) => m.prepareEmojiPickerSheet().then(() => ({ default: m.ComposerEmojiSheet }))),
);

export const ComposerStickerSheet = lazy(() =>
  Promise.all([
    import('./composer-sticker-sheet'),
    import('@/lib/i18n-sticker-packs-catalog').then((m) => m.loadStickerPacksCatalog(currentInterfaceLanguage())),
  ]).then(([m]) => ({ default: m.ComposerStickerSheet })),
);
