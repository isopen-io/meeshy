import { safeLocalStorage } from '@/lib/storage';
import type { SafeStorage } from '@/lib/storage';

/**
 * LES EMOJIS RÉCENTS (#10531) — la jumelle web de `frequentEmojis`
 * (`EmojiPickerView.selectEmoji`, `EmojiPickerSheet.swift`) : l'emoji choisi
 * dans la feuille passe en tête, la liste garde les vingt-quatre derniers.
 * Gardée sur l'appareil ; sans stockage, la feuille n'a pas de récents.
 *
 * Distincte du suivi d'USAGE (`emoji-usage.ts`), qui COMPTE les emplois pour
 * classer le rail des réactions et le cadre des emojis rapides.
 */
export const EMOJI_RECENTS_KEY = 'meeshy.emoji.recents';
export const EMOJI_RECENTS_LIMIT = 24;
const EMOJI_MAX_LENGTH = 32;

const isEmoji = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= EMOJI_MAX_LENGTH;

export function parseEmojiRecents(raw: string | null): readonly string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter(isEmoji))].slice(0, EMOJI_RECENTS_LIMIT);
  } catch {
    return [];
  }
}

export function pushEmojiRecent(recents: readonly string[], emoji: string): readonly string[] {
  if (!isEmoji(emoji)) return recents;
  return [emoji, ...recents.filter((known) => known !== emoji)].slice(0, EMOJI_RECENTS_LIMIT);
}

export function readEmojiRecents(storage: SafeStorage = safeLocalStorage()): readonly string[] {
  try {
    return parseEmojiRecents(storage.getItem(EMOJI_RECENTS_KEY));
  } catch {
    return [];
  }
}

export function recordEmojiRecent(emoji: string, storage: SafeStorage = safeLocalStorage()): void {
  try {
    storage.setItem(EMOJI_RECENTS_KEY, JSON.stringify(pushEmojiRecent(readEmojiRecents(storage), emoji)));
  } catch {
    return;
  }
}
