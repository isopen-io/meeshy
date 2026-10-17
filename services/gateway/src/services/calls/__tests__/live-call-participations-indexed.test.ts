import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { accountParticipantIds, LIVE_CALL_PARTICIPATION } from '../liveCallParticipations';

const GATEWAY_SRC = join(__dirname, '..', '..', '..');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });

const balancedFrom = (text: string, open: number): string => {
  const end = [...text.slice(open)].reduce<{ depth: number; at: number }>(
    (acc, char, index) => {
      if (acc.at >= 0) return acc;
      const depth = acc.depth + (char === '{' ? 1 : char === '}' ? -1 : 0);
      return { depth, at: depth === 0 && char === '}' ? open + index : -1 };
    },
    { depth: 0, at: -1 }
  ).at;
  return text.slice(open, end + 1);
};

const callParticipantWhereClauses = (text: string): string[] =>
  [...text.matchAll(/callParticipant\.(?:findMany|findFirst|findUnique|count|updateMany)\(\{/g)].flatMap((call) => {
    const body = balancedFrom(text, (call.index ?? 0) + call[0].length - 1);
    const where = body.indexOf('where:');
    if (where < 0) return [];
    const open = body.indexOf('{', where);
    return open < 0 ? [] : [balancedFrom(body, open)];
  });

describe('les participations d’appel se lisent par une clé indexée (#10831)', () => {
  it('aucune requête CallParticipant ne filtre sur la relation participant sans clé scalaire indexée', () => {
    const offenders = sourceFiles(GATEWAY_SRC).flatMap((file) =>
      callParticipantWhereClauses(readFileSync(file, 'utf8'))
        .filter((where) => /\bparticipant:\s*\{/.test(where))
        .filter((where) => !/\b(participantId|callSessionId|id):/.test(where.replace(/\bparticipant:\s*\{[^{}]*\}/g, '')))
        .map(() => relative(GATEWAY_SRC, file))
    );

    expect(offenders).toEqual([]);
  });

  it('les identités d’un compte se lisent par Participant.userId', async () => {
    const findMany = jest.fn<any>().mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }]);

    const ids = await accountParticipantIds({ participant: { findMany } } as any, 'user-1');

    expect(ids).toEqual(['p-1', 'p-2']);
    expect(findMany).toHaveBeenCalledWith({ where: { userId: 'user-1' }, select: { id: true } });
  });

  it('une participation vivante a un leftAt nul ou absent', () => {
    expect(LIVE_CALL_PARTICIPATION).toEqual({ OR: [{ leftAt: null }, { leftAt: { isSet: false } }] });
  });
});
