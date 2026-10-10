import { describe, expect, test } from 'bun:test';

import { copyPlainText } from './copy-text';

describe('copyPlainText — le presse-papiers, puis son repli (#8734)', () => {
  test('le presse-papiers asynchrone d’abord', async () => {
    const written: string[] = [];
    const outcome = await copyPlainText('Bonjour', {
      writeText: async (text) => {
        written.push(text);
      },
      legacyCopy: () => {
        throw new Error('le repli ne doit pas servir');
      },
    });
    expect(outcome).toBe('copied');
    expect(written).toEqual(['Bonjour']);
  });

  test('absent ou refusé, le repli prend le relais', async () => {
    const legacy: string[] = [];
    const legacyCopy = (text: string) => {
      legacy.push(text);
      return true;
    };
    expect(await copyPlainText('a', { writeText: undefined, legacyCopy })).toBe('copied');
    expect(
      await copyPlainText('b', {
        writeText: async () => {
          throw new Error('NotAllowedError');
        },
        legacyCopy,
      }),
    ).toBe('copied');
    expect(legacy).toEqual(['a', 'b']);
  });

  test('quand rien ne copie, l’issue le DIT — un geste sans effet ne se tait pas', async () => {
    expect(await copyPlainText('x', { writeText: undefined, legacyCopy: () => false })).toBe('failed');
    expect(
      await copyPlainText('x', {
        writeText: undefined,
        legacyCopy: () => {
          throw new Error('SecurityError');
        },
      }),
    ).toBe('failed');
  });
});
