import { safeLocalStorage } from '@/lib/storage';
import type { SafeStorage } from '@/lib/storage';

/**
 * LE SUIVI D'USAGE DES EMOJIS (#7983) — la jumelle web d'`EmojiUsageTracker`
 * (`apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`).
 *
 * Source UNIQUE du « plus utilisé » : le rail du menu d'un message et le cadre
 * des emojis rapides du composeur la lisent, les réactions et les envois
 * rapides l'alimentent. Gardée sur l'appareil, comme iOS dans ses réglages
 * locaux ; sans stockage, le classement retombe sur les défauts.
 *
 * Classement d'iOS, à l'identique : usage décroissant, puis rang dans les
 * défauts (inconnus en dernier), puis l'emoji lui-même ; les défauts
 * complètent. Le web BORNE la table (`EMOJI_USAGE_LIMIT`) : au-delà, l'entrée
 * la moins employée part, la plus ancienne d'abord, jamais celle qu'on vient
 * d'employer.
 */

export type EmojiUsage = ReadonlyMap<string, number>;

export const EMOJI_USAGE_KEY = 'meeshy.emoji.usage';
export const EMOJI_USAGE_LIMIT = 48;
const EMOJI_MAX_LENGTH = 32;

const isEmoji = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= EMOJI_MAX_LENGTH;

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

const isEntry = (candidate: unknown): candidate is readonly [string, number] =>
  Array.isArray(candidate) && candidate.length === 2 && isEmoji(candidate[0]) && isCount(candidate[1]);

export function parseEmojiUsage(raw: string | null): EmojiUsage {
  if (raw === null) return new Map();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Map();
    const entries = parsed.filter(isEntry).slice(-EMOJI_USAGE_LIMIT);
    return new Map(entries.map(([emoji, count]) => [emoji, count] as const));
  } catch {
    return new Map();
  }
}

export const serializeEmojiUsage = (usage: EmojiUsage): string => JSON.stringify([...usage.entries()]);

function evictionCandidate(usage: EmojiUsage, kept: string): string | null {
  return [...usage.entries()]
    .filter(([emoji]) => emoji !== kept)
    .reduce<readonly [string, number] | null>((least, entry) => (least === null || entry[1] < least[1] ? entry : least), null)?.[0] ?? null;
}

export function recordEmoji(usage: EmojiUsage, emoji: string): EmojiUsage {
  if (!isEmoji(emoji)) return usage;
  const next = new Map([...usage.entries()].filter(([key]) => key !== emoji));
  next.set(emoji, Math.min((usage.get(emoji) ?? 0) + 1, Number.MAX_SAFE_INTEGER));
  if (next.size <= EMOJI_USAGE_LIMIT) return next;
  const evicted = evictionCandidate(next, emoji);
  if (evicted !== null) next.delete(evicted);
  return next;
}

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function rankEmojis(
  usage: EmojiUsage,
  options: { readonly count: number; readonly defaults: readonly string[] },
): readonly string[] {
  const canonical = new Map(options.defaults.map((emoji, index) => [emoji, index] as const));
  const rank = (emoji: string) => canonical.get(emoji) ?? Number.MAX_SAFE_INTEGER;
  const tracked = [...usage.keys()].sort(
    (a, b) => (usage.get(b) ?? 0) - (usage.get(a) ?? 0) || rank(a) - rank(b) || compareStrings(a, b),
  );
  return [...new Set([...tracked, ...options.defaults])].slice(0, Math.max(0, options.count));
}

export function readEmojiUsage(storage: SafeStorage = safeLocalStorage()): EmojiUsage {
  try {
    return parseEmojiUsage(storage.getItem(EMOJI_USAGE_KEY));
  } catch {
    return new Map();
  }
}

export function recordEmojiUsage(emoji: string, storage: SafeStorage = safeLocalStorage()): void {
  try {
    storage.setItem(EMOJI_USAGE_KEY, serializeEmojiUsage(recordEmoji(readEmojiUsage(storage), emoji)));
  } catch {
    return;
  }
}

export const topEmojis = (
  options: { readonly count: number; readonly defaults: readonly string[] },
  storage: SafeStorage = safeLocalStorage(),
): readonly string[] => rankEmojis(readEmojiUsage(storage), options);
