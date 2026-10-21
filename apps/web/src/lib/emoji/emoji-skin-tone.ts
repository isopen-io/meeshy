/**
 * LES TEINTES DE PEAU (#10533) — une variante se CALCULE, elle ne se stocke
 * pas : l'emoji de base, puis l'un des cinq modificateurs de Fitzpatrick à la
 * place de son sélecteur de présentation. La table (`emoji-table.ts`) ne porte
 * qu'un drapeau par emoji qui en accepte une, posé par le générateur après
 * avoir vérifié les cinq variantes contre la liste d'Unicode.
 *
 * UNE teinte pour tous les emojis, dans le vocabulaire de la préférence
 * partagée `message.emojiSkinTone` (`@meeshy/shared`, que porte aussi
 * `EmojiSkinTone` côté iOS). Elle est retenue sur l'appareil ; sans stockage,
 * elle vaut « par défaut ».
 */
import type { MessagePreference } from '@meeshy/shared/types/preferences/message';

import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

export type EmojiSkinTone = MessagePreference['emojiSkinTone'];

export const EMOJI_SKIN_TONES = ['default', 'light', 'medium-light', 'medium', 'medium-dark', 'dark'] as const satisfies readonly EmojiSkinTone[];

export const EMOJI_SKIN_TONE_KEY = 'meeshy.emoji.skinTone';

const MODIFIERS: Readonly<Record<EmojiSkinTone, string>> = {
  default: '',
  light: '\u{1F3FB}',
  'medium-light': '\u{1F3FC}',
  medium: '\u{1F3FD}',
  'medium-dark': '\u{1F3FE}',
  dark: '\u{1F3FF}',
};

const PRESENTATION_SELECTOR = '️';

export function withSkinTone(base: string, tone: EmojiSkinTone): string {
  const modifier = MODIFIERS[tone];
  if (modifier === '') return base;
  const [head = '', ...rest] = [...base];
  return [head, modifier, ...(rest[0] === PRESENTATION_SELECTOR ? rest.slice(1) : rest)].join('');
}

export const skinToneVariants = (base: string): ReadonlyArray<{ readonly tone: EmojiSkinTone; readonly emoji: string }> =>
  EMOJI_SKIN_TONES.map((tone) => ({ tone, emoji: withSkinTone(base, tone) }));

/** Ce qu'un emoji de base et ses variantes ont en commun : ni teinte, ni sélecteur de présentation. */
export const skinToneKey = (emoji: string): string => emoji.replace(/[️\u{1F3FB}-\u{1F3FF}]/gu, '');

/** La teinte que porte une variante — « par défaut » pour un emoji sans modificateur. */
export const skinToneOf = (emoji: string): EmojiSkinTone => EMOJI_SKIN_TONES.find((tone) => tone !== 'default' && emoji.includes(MODIFIERS[tone])) ?? 'default';

const isSkinTone = (value: unknown): value is EmojiSkinTone => EMOJI_SKIN_TONES.some((tone) => tone === value);

export function readEmojiSkinTone(storage: SafeStorage = safeLocalStorage()): EmojiSkinTone {
  try {
    const known = storage.getItem(EMOJI_SKIN_TONE_KEY);
    return isSkinTone(known) ? known : 'default';
  } catch {
    return 'default';
  }
}

export function recordEmojiSkinTone(tone: EmojiSkinTone, storage: SafeStorage = safeLocalStorage()): void {
  try {
    storage.setItem(EMOJI_SKIN_TONE_KEY, tone);
  } catch {
    return;
  }
}
