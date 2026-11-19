/**
 * LA PLUS RÉCEMMENT ACTIVE SE LIT PAR DEUX FLUX BORNÉS (#19835).
 *
 * Le moteur de ce témoin ÉVALUE l'ordre demandé contre des documents en
 * mémoire, et honore `take` : c'est la seule façon pour qu'une lecture d'un
 * SEUL flux, ou d'une fenêtre trop étroite, puisse FAIRE TOMBER le témoin. Un
 * double qui rend la même ligne quel que soit l'`orderBy` rendrait vertes les
 * trois mutations que ce fichier nomme.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  highestRankedConversation,
  highestRankedConversations,
  outranks,
  rankStreamOrders,
  type RankStreamOrder,
  type RankedConversationRow,
} from '../../../../services/conversations/highestRanked';

const at = (iso: string): Date => new Date(iso);

const row = (id: string, lastMessageAt: Date | null, lastActivityAt: Date | null = null): RankedConversationRow => ({
  id,
  lastMessageAt,
  lastActivityAt,
});

/** Le moteur : il trie DANS l'ordre demandé (colonne puis `id`), comme MongoDB, et borne par `take`. */
function engine(rows: readonly RankedConversationRow[]) {
  const weight = (value: Date | null | undefined): number => (value instanceof Date ? value.getTime() : Number.NEGATIVE_INFINITY);
  return (orderBy: RankStreamOrder, take: number): readonly RankedConversationRow[] => {
    const [first] = orderBy;
    const column = 'lastMessageAt' in first ? 'lastMessageAt' : 'lastActivityAt';
    return [...rows]
      .sort((a, b) => weight(b[column]) - weight(a[column]) || (a.id > b.id ? -1 : a.id < b.id ? 1 : 0))
      .slice(0, take);
  };
}

const firstOf = (rows: readonly RankedConversationRow[]) => {
  const read = engine(rows);
  return highestRankedConversation((orderBy) => Promise.resolve(read(orderBy, 1)[0] ?? null));
};

const topOf = (rows: readonly RankedConversationRow[], take: number) => {
  const read = engine(rows);
  return highestRankedConversations((orderBy) => Promise.resolve(read(orderBy, take)), take);
};

describe('la gagnante est celle du plus haut RANG, jamais du dernier message', () => {
  it('une conversation REMONTÉE par une activité passe devant une conversation au message plus récent', async () => {
    const lifted = row('aaa', at('2026-11-01T10:00:00Z'), at('2026-11-18T10:00:00Z'));
    const spoken = row('bbb', at('2026-11-10T10:00:00Z'));
    expect(await firstOf([spoken, lifted])).toMatchObject({ id: 'aaa' });
  });

  it('sans aucune activité, la plus récemment parlée gagne — le comportement d’avant #19800', async () => {
    const older = row('aaa', at('2026-11-01T10:00:00Z'));
    const newer = row('bbb', at('2026-11-10T10:00:00Z'));
    expect(await firstOf([older, newer])).toMatchObject({ id: 'bbb' });
  });

  it('une activité ANTÉRIEURE au dernier message ne rétrograde rien : le rang est un max', async () => {
    const spoken = row('aaa', at('2026-11-10T10:00:00Z'), at('2026-11-02T10:00:00Z'));
    const quieter = row('bbb', at('2026-11-05T10:00:00Z'));
    expect(await firstOf([spoken, quieter])).toMatchObject({ id: 'aaa' });
  });

  it('une conversation sans message NI activité ne gagne jamais contre une conversation vivante', async () => {
    expect(await firstOf([row('zzz', null), row('aaa', at('2026-11-01T10:00:00Z'))])).toMatchObject({ id: 'aaa' });
  });

  it('deux conversations muettes se départagent sans `NaN` : le comparateur ne soustrait pas deux rangs', async () => {
    expect(await firstOf([row('aaa', null), row('zzz', null)])).toMatchObject({ id: 'zzz' });
  });

  it('rien à lire ⇒ `null`', async () => {
    expect(await firstOf([])).toBeNull();
  });
});

describe('deux lignes de rang IDENTIQUE se départagent, et toujours de la même façon (#19881)', () => {
  it('le même gagnant quel que soit l’ordre dans lequel les lignes arrivent', async () => {
    const même = at('2026-11-20T10:00:00Z');
    const [a, b] = [row('aaa', même), row('bbb', même)];
    expect(await firstOf([a, b])).toMatchObject({ id: 'bbb' });
    expect(await firstOf([b, a])).toMatchObject({ id: 'bbb' });
  });

  it('l’égalité entre un rang REMONTÉ et un dernier message se départage aussi — la porte ouverte par #19800', async () => {
    const même = at('2026-11-20T10:00:00Z');
    const lifted = row('aaa', at('2026-11-01T10:00:00Z'), même);
    const spoken = row('bbb', même);
    expect(await firstOf([lifted, spoken])).toMatchObject({ id: 'bbb' });
    expect(outranks(spoken, lifted)).toBe(true);
    expect(outranks(lifted, spoken)).toBe(false);
  });
});

describe('les deux flux, et la fenêtre que la preuve du top-K exige', () => {
  it('les deux ordres sont lus, chacun départagé sur `id`', () => {
    expect(rankStreamOrders()).toEqual([
      [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    ]);
  });

  it('un seul flux ne suffit pas : lire `lastMessageAt` seul rate la remontée, lire `lastActivityAt` seul rate la muette', async () => {
    const lifted = row('aaa', at('2026-11-01T10:00:00Z'), at('2026-11-18T10:00:00Z'));
    const spoken = row('bbb', at('2026-11-10T10:00:00Z'));
    const read = engine([spoken, lifted]);
    const parMessage = read([{ lastMessageAt: 'desc' }, { id: 'desc' }], 1)[0];
    const parActivite = read([{ lastActivityAt: 'desc' }, { id: 'desc' }], 1)[0];
    expect(parMessage).toMatchObject({ id: 'bbb' });
    expect(parActivite).toMatchObject({ id: 'aaa' });
    expect(await firstOf([spoken, lifted])).toMatchObject({ id: 'aaa' });
  });

  it('le top-K du rang sort des deux flux, dans l’ordre, sans doublon', async () => {
    const rows = [
      row('a1', at('2026-11-01T10:00:00Z'), at('2026-11-19T10:00:00Z')),
      row('b2', at('2026-11-18T10:00:00Z')),
      row('c3', at('2026-11-02T10:00:00Z'), at('2026-11-17T10:00:00Z')),
      row('d4', at('2026-11-03T10:00:00Z')),
    ];
    expect((await topOf(rows, 3)).map((r) => r.id)).toEqual(['a1', 'b2', 'c3']);
  });

  it('une fenêtre plus étroite que K perdrait une remontée : chaque flux lit K lignes', async () => {
    const rows = [
      row('a1', at('2026-11-01T10:00:00Z'), at('2026-11-19T10:00:00Z')),
      row('b2', at('2026-11-18T10:00:00Z')),
      row('c3', at('2026-11-17T10:00:00Z')),
    ];
    const read = engine(rows);
    const etroit = await highestRankedConversations((orderBy) => Promise.resolve(read(orderBy, 1)), 2);
    expect(etroit.map((r) => r.id)).toEqual(['a1', 'b2']);
    expect((await topOf(rows, 2)).map((r) => r.id)).toEqual(['a1', 'b2']);
    expect((await topOf(rows, 3)).map((r) => r.id)).toEqual(['a1', 'b2', 'c3']);
  });
});
