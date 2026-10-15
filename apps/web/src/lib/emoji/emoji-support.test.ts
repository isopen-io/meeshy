import { describe, expect, test } from 'bun:test';

import { loadEmojiIndex } from './emoji-catalogue';
import { ALWAYS_SHOWN_EMOJI_LEVEL, EMOJI_BASELINE_PROBE, EMOJI_LEVEL_PROBES, resolveEmojiLevel, supportedEmojiLevel } from './emoji-support';

/**
 * CE QUE L'APPAREIL SAIT PEINDRE (#10531) — une coque Android 7 à 10 n'a pas
 * les emojis récents : la feuille ne propose pas des carrés vides. Un emoji
 * témoin par version d'Unicode Emoji donne le palier de l'appareil.
 */
const paintsUpTo = (level: number) => (emoji: string) =>
  emoji === EMOJI_BASELINE_PROBE || (EMOJI_LEVEL_PROBES.find(([, probe]) => probe === emoji)?.[0] ?? 99) <= level;

describe('le palier d’emojis de l’appareil', () => {
  test('le témoin le plus récent que l’appareil peint donne le palier', () => {
    expect(resolveEmojiLevel(paintsUpTo(16))).toBe(16);
    expect(resolveEmojiLevel(paintsUpTo(14))).toBe(14);
    expect(resolveEmojiLevel(paintsUpTo(12))).toBe(12);
  });

  test('aucun témoin récent peint : seuls les emojis d’avant la version 11 restent', () => {
    expect(resolveEmojiLevel(paintsUpTo(5))).toBe(ALWAYS_SHOWN_EMOJI_LEVEL);
    expect(ALWAYS_SHOWN_EMOJI_LEVEL).toBe(5);
  });

  test('une mesure qui ne voit même pas 😀 n’est pas fiable : rien n’est retiré', () => {
    expect(resolveEmojiLevel(() => false)).toBe(Number.POSITIVE_INFINITY);
  });

  test('sans canevas mesurable, rien n’est retiré', () => {
    expect(supportedEmojiLevel()).toBe(Number.POSITIVE_INFINITY);
  });

  test('chaque témoin est dans la table, à son palier, du plus récent au plus ancien', async () => {
    const levels = new Map((await loadEmojiIndex()).all.map((entry) => [entry.emoji, entry.level] as const));
    expect(EMOJI_LEVEL_PROBES.map(([, emoji]) => ({ emoji, level: levels.get(emoji) }))).toEqual(
      EMOJI_LEVEL_PROBES.map(([level, emoji]) => ({ emoji, level })),
    );
    expect(EMOJI_LEVEL_PROBES.map(([level]) => level)).toEqual([16, 15, 14, 13, 12, 11]);
    const tableLevels = new Set(levels.values());
    expect([...tableLevels].filter((level) => level > ALWAYS_SHOWN_EMOJI_LEVEL).sort((a, b) => b - a)).toEqual([16, 15, 14, 13, 12, 11]);
  });
});
