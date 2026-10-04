import { describe, expect, test } from 'bun:test';

import type { SafeStorage } from './storage';
import {
  EMOJI_USAGE_KEY,
  EMOJI_USAGE_LIMIT,
  parseEmojiUsage,
  rankEmojis,
  readEmojiUsage,
  recordEmoji,
  recordEmojiUsage,
  serializeEmojiUsage,
  topEmojis,
} from './emoji-usage';

const DEFAULTS = ['😂', '❤️', '👍', '😮', '😢', '🔥'] as const;

const memoryStorage = (initial: Readonly<Record<string, string>> = {}): SafeStorage & { readonly dump: () => Record<string, string> } => {
  const memory = new Map(Object.entries(initial));
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
    },
    removeItem: (key) => {
      memory.delete(key);
    },
    dump: () => Object.fromEntries(memory),
  };
};

const failingStorage = (): SafeStorage => ({
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
});

const usageOf = (...emojis: readonly string[]) => emojis.reduce(recordEmoji, parseEmojiUsage(null));

describe('rankEmojis — la règle de classement d’EmojiUsageTracker.topEmojis (iOS)', () => {
  test('sans historique, les défauts dans leur ordre, bornés au compte demandé', () => {
    expect(rankEmojis(new Map(), { count: 3, defaults: DEFAULTS })).toEqual(['😂', '❤️', '👍']);
  });

  test('l’emoji le plus employé passe en tête, les défauts complètent sans doublon', () => {
    expect(rankEmojis(usageOf('🔥', '🔥', '👍'), { count: 3, defaults: DEFAULTS })).toEqual(['🔥', '👍', '😂']);
  });

  test('à usage égal, le rang dans les défauts départage — jamais l’ordre d’emploi', () => {
    expect(rankEmojis(usageOf('🔥', '❤️'), { count: 2, defaults: DEFAULTS })).toEqual(['❤️', '🔥']);
  });

  test('à usage égal, un emoji hors défauts passe après ceux des défauts, puis par ordre du texte', () => {
    expect(rankEmojis(usageOf('🦄', '🎉', '😢'), { count: 3, defaults: DEFAULTS })).toEqual(['😢', '🎉', '🦄']);
  });

  test('un emoji employé hors des défauts entre dans la liste', () => {
    expect(rankEmojis(usageOf('🦄', '🦄'), { count: 3, defaults: DEFAULTS })).toEqual(['🦄', '😂', '❤️']);
  });

  test('le classement est stable : deux lectures de la même table rendent le même ordre', () => {
    const usage = usageOf('🎉', '🦄', '🔥', '😮');
    expect(rankEmojis(usage, { count: 6, defaults: DEFAULTS })).toEqual(rankEmojis(usage, { count: 6, defaults: DEFAULTS }));
  });
});

describe('recordEmoji — une table bornée', () => {
  test('chaque emploi compte, sans toucher la table d’origine', () => {
    const before = usageOf('🔥');
    const after = recordEmoji(before, '🔥');
    expect(before.get('🔥')).toBe(1);
    expect(after.get('🔥')).toBe(2);
  });

  test('une chaîne vide n’est pas un emoji et ne s’enregistre pas', () => {
    expect(recordEmoji(new Map(), '').size).toBe(0);
  });

  test(`au-delà de ${EMOJI_USAGE_LIMIT} emojis, le moins employé — le plus ancien d’abord — part, jamais celui qu’on vient d’employer`, () => {
    const filler = Array.from({ length: EMOJI_USAGE_LIMIT - 1 }, (_, index) => String.fromCodePoint(0x1f400 + index));
    const usage = recordEmoji(usageOf('🔥', ...filler, filler[0]!), '🦄');
    expect(usage.size).toBe(EMOJI_USAGE_LIMIT);
    expect(usage.has('🦄')).toBe(true);
    expect(usage.has(filler[0]!)).toBe(true);
    expect(usage.has('🔥')).toBe(false);
  });
});

describe('persistance par appareil — stockage enveloppé, rendu correct sans lui', () => {
  test('un emploi enregistré se relit au classement suivant', () => {
    const storage = memoryStorage();
    recordEmojiUsage('🔥', storage);
    recordEmojiUsage('🦄', storage);
    recordEmojiUsage('🦄', storage);
    expect(topEmojis({ count: 3, defaults: DEFAULTS }, storage)).toEqual(['🦄', '🔥', '😂']);
    expect(JSON.parse(storage.dump()[EMOJI_USAGE_KEY]!)).toEqual([
      ['🔥', 1],
      ['🦄', 2],
    ]);
  });

  test('un stockage qui lève rend les défauts et n’interrompt pas l’emploi', () => {
    const storage = failingStorage();
    expect(() => recordEmojiUsage('🔥', storage)).not.toThrow();
    expect(topEmojis({ count: 3, defaults: DEFAULTS }, storage)).toEqual(['😂', '❤️', '👍']);
  });

  test('une valeur corrompue ou hors forme est ignorée, entrée par entrée', () => {
    expect(readEmojiUsage(memoryStorage({ [EMOJI_USAGE_KEY]: '{oops' })).size).toBe(0);
    expect(readEmojiUsage(memoryStorage({ [EMOJI_USAGE_KEY]: '{"🔥":3}' })).size).toBe(0);
    const mixed = JSON.stringify([['🔥', 3], ['', 2], ['👍', -1], ['😮', 1.5], 'x', ['❤️', 2]]);
    expect([...readEmojiUsage(memoryStorage({ [EMOJI_USAGE_KEY]: mixed })).entries()]).toEqual([
      ['🔥', 3],
      ['❤️', 2],
    ]);
  });

  test('une table relue plus longue que la borne n’en garde que les plus récentes', () => {
    const entries = Array.from({ length: EMOJI_USAGE_LIMIT + 5 }, (_, index) => [String.fromCodePoint(0x1f400 + index), 1]);
    const usage = parseEmojiUsage(JSON.stringify(entries));
    expect(usage.size).toBe(EMOJI_USAGE_LIMIT);
    expect(usage.has(String.fromCodePoint(0x1f400))).toBe(false);
  });

  test('la forme sérialisée se relit à l’identique', () => {
    const usage = usageOf('🔥', '🦄', '🔥');
    expect([...parseEmojiUsage(serializeEmojiUsage(usage)).entries()]).toEqual([...usage.entries()]);
  });
});
