/**
 * Meeshy Global tient une vague d'arrivées (#7740) — les ARRIVÉES REGROUPÉES.
 *
 * Chaque inscription postait « X a rejoint la conversation » dans le salon
 * global : une vague d'inscriptions le noyait sous les avis. Les arrivées d'une
 * même fenêtre de dix minutes partagent désormais UNE ligne système, mise à
 * jour (et rediffusée en `message:edited`) plutôt que multipliée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ARRIVALS_NOTICE_KIND, parseArrivalsNotice } from '@meeshy/shared/utils/arrivals-notice';
import { postGlobalArrival } from '../../../../services/conversations/globalArrivalsNotice';
import { systemEventFromMessage } from '../../../../routes/conversations/utils/last-message-nature';

const CONV = 'conv-global';
const NOW = new Date('2026-09-24T10:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

type Row = { id: string; createdAt: Date; metadata: unknown; content: string; senderId: string; messageSource: string };

function openLine(overrides: { names?: readonly string[]; openedMinutesAgo?: number; count?: number } = {}): Row {
  const names = overrides.names ?? ['Aïcha'];
  const openedAt = minutesAgo(overrides.openedMinutesAgo ?? 3);
  return {
    id: 'msg-line',
    createdAt: openedAt,
    content: 'repli',
    senderId: 'p-aicha',
    messageSource: 'system',
    metadata: {
      kind: ARRIVALS_NOTICE_KIND,
      arrivals: names.map((displayName, i) => ({ participantId: `p-${i}`, displayName })),
      count: overrides.count ?? names.length,
      windowStartedAt: openedAt.toISOString(),
    },
  };
}

function harness(rows: readonly Row[] = []) {
  const findMany = jest.fn<any>(async (args: any) => {
    const since = args?.where?.createdAt?.gte as Date | undefined;
    return rows.filter((row) => !since || row.createdAt.getTime() >= since.getTime());
  });
  const create = jest.fn<any>(async ({ data }: any) => ({ id: 'msg-new', createdAt: NOW, ...data }));
  const update = jest.fn<any>(async ({ where, data }: any) => ({
    ...rows.find((row) => row.id === where.id),
    ...data,
  }));
  const conversationUpdate = jest.fn<any>(async () => ({}));
  const broadcast = jest.fn<any>(async () => undefined);
  const broadcastUpdate = jest.fn<any>(async () => undefined);
  const prisma = { message: { findMany, create, update }, conversation: { update: conversationUpdate } };
  return { prisma, broadcast, broadcastUpdate, deps: { prisma: prisma as never, broadcast, broadcastUpdate, now: () => NOW } };
}

const arrival = (participantId: string, displayName: string) => ({ conversationId: CONV, participantId, displayName });

describe('postGlobalArrival — une ligne par fenêtre de 10 minutes (#7740)', () => {
  it('ouvre une ligne quand aucune n’est ouverte, signée du premier arrivant', async () => {
    const h = harness();

    await postGlobalArrival(h.deps, arrival('p-aicha', 'Aïcha'));

    expect(h.prisma.message.create).toHaveBeenCalledTimes(1);
    const { data } = h.prisma.message.create.mock.calls[0][0] as any;
    expect(data).toMatchObject({
      conversationId: CONV,
      senderId: 'p-aicha',
      messageType: 'system',
      messageSource: 'system',
      content: 'Aïcha vient d’arriver — dis-lui salut',
    });
    expect(parseArrivalsNotice(data.metadata)).toMatchObject({ count: 1, arrivals: [{ displayName: 'Aïcha' }] });
    expect(h.broadcast).toHaveBeenCalledTimes(1);
  });

  it('met À JOUR la ligne ouverte au lieu d’en poster une autre', async () => {
    const h = harness([openLine({ names: ['Aïcha'] })]);

    await postGlobalArrival(h.deps, arrival('p-tom', 'Tom'));

    expect(h.prisma.message.create).not.toHaveBeenCalled();
    expect(h.prisma.message.update).toHaveBeenCalledTimes(1);
    const { where, data } = h.prisma.message.update.mock.calls[0][0] as any;
    expect(where).toEqual({ id: 'msg-line' });
    expect(data.content).toBe('Tom et Aïcha viennent d’arriver — dis-leur salut');
    expect(parseArrivalsNotice(data.metadata)?.count).toBe(2);
    expect(h.broadcast).not.toHaveBeenCalled();
    expect(h.broadcastUpdate).toHaveBeenCalledTimes(1);
  });

  it('dit « Aïcha, Tom et 12 autres » au quinzième arrivant de la fenêtre', async () => {
    const h = harness([openLine({ names: ['Tom', 'Léa'], count: 13 })]);

    await postGlobalArrival(h.deps, arrival('p-aicha', 'Aïcha'));

    const { data } = h.prisma.message.update.mock.calls[0][0] as any;
    expect(data.content).toBe('Aïcha, Tom et 12 autres viennent d’arriver — dis-leur salut');
  });

  it('ne cherche la ligne ouverte que dans les 10 dernières minutes', async () => {
    const h = harness([openLine({ openedMinutesAgo: 11 })]);

    await postGlobalArrival(h.deps, arrival('p-tom', 'Tom'));

    const { where } = h.prisma.message.findMany.mock.calls[0][0] as any;
    expect(where).toMatchObject({ conversationId: CONV, messageSource: 'system', createdAt: { gte: minutesAgo(10) } });
    expect(h.prisma.message.create).toHaveBeenCalledTimes(1);
    expect(h.prisma.message.update).not.toHaveBeenCalled();
  });

  it('ignore un autre message système de la fenêtre — seule une ligne d’arrivées se met à jour', async () => {
    const other: Row = { ...openLine(), id: 'msg-other', metadata: { kind: 'member-left', actor: { participantId: 'x', displayName: 'X' } } };
    const h = harness([other]);

    await postGlobalArrival(h.deps, arrival('p-tom', 'Tom'));

    expect(h.prisma.message.update).not.toHaveBeenCalled();
    expect(h.prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('sérialise une rafale d’arrivées simultanées : une seule ligne, tous comptés', async () => {
    const rows: Row[] = [];
    const h = harness(rows);
    h.prisma.message.create.mockImplementation(async ({ data }: any) => {
      const row = { id: 'msg-burst', createdAt: NOW, ...data };
      rows.push(row);
      return row;
    });
    h.prisma.message.update.mockImplementation(async ({ where, data }: any) => {
      const index = rows.findIndex((row) => row.id === where.id);
      rows[index] = { ...rows[index], ...data };
      return rows[index];
    });

    await Promise.all(
      ['Aïcha', 'Tom', 'Léa', 'Omar', 'Zoé'].map((name) => postGlobalArrival(h.deps, arrival(`p-${name}`, name))),
    );

    expect(h.prisma.message.create).toHaveBeenCalledTimes(1);
    expect(parseArrivalsNotice(rows[0]?.metadata)?.count).toBe(5);
  });

  it('ne rejette jamais : une lecture en panne retombe sur une ligne neuve', async () => {
    const h = harness();
    h.prisma.message.findMany.mockRejectedValue(new Error('mongo down'));

    await expect(postGlobalArrival(h.deps, arrival('p-tom', 'Tom'))).resolves.not.toBeNull();
    expect(h.prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('ne rejette jamais : une mise à jour en panne rend null', async () => {
    const h = harness([openLine()]);
    h.prisma.message.update.mockRejectedValue(new Error('mongo down'));

    await expect(postGlobalArrival(h.deps, arrival('p-tom', 'Tom'))).resolves.toBeNull();
  });
});

describe('la ligne de liste de Global lit la ligne d’arrivées', () => {
  it('rend la clé `system.members-arrived` avec les noms et le total', () => {
    const line = openLine({ names: ['Omar', 'Léa', 'Tom', 'Aïcha'] });

    expect(systemEventFromMessage({ messageType: 'system', messageSource: 'system', metadata: line.metadata })).toEqual({
      key: 'system.members-arrived',
      params: { first: 'Omar', second: 'Léa', third: '', others: 2, count: 4 },
    });
  });
});
