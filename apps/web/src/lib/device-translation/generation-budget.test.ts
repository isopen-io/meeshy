import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATION_CEILING, GENERATION_FLOOR, TOKEN_MARGIN, TOKENS_PER_SOURCE_TOKEN, generationBudget } from './generation-budget';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), '../../../../../services/translator/src/utils/generation_guard.py');

const serverConstant = (name: string): number => {
  const match = readFileSync(GUARD, 'utf8').match(new RegExp(`^${name} = ([0-9.]+)$`, 'm'));
  if (match?.[1] === undefined) throw new Error(`${name} absent de generation_guard.py`);
  return Number(match[1]);
};

describe('generationBudget — la borne du serveur (#9309), reprise sur l’appareil (#9898)', () => {
  test('les quatre constantes sont celles du translator', () => {
    expect(GENERATION_CEILING).toBe(serverConstant('GENERATION_CEILING'));
    expect(GENERATION_FLOOR).toBe(serverConstant('GENERATION_FLOOR'));
    expect(TOKENS_PER_SOURCE_TOKEN).toBe(serverConstant('TOKENS_PER_SOURCE_TOKEN'));
    expect(TOKEN_MARGIN).toBe(serverConstant('TOKEN_MARGIN'));
  });

  test('un message court reçoit le plancher, un long le plafond, entre les deux la proportion', () => {
    expect(generationBudget(1)).toBe(16);
    expect(generationBudget(20)).toBe(60);
    expect(generationBudget(400)).toBe(256);
  });
});
