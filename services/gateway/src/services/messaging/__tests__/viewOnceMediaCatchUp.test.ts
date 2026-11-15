/**
 * #11269 — le RATTRAPAGE des médias à vue unique déjà lus par tous avant que
 * la purge ne sache les effacer.
 *
 * Deux populations restent hors de portée du balayage, qui ne lit que les
 * échéances posées : les vues uniques lues par tous dont l'échéance n'a jamais
 * été rapprochée (ouvertes avant #7578, programmation en échec, dernier
 * non-lecteur parti), et les vues uniques déjà purgées dont une pièce a
 * résisté (l'ancienne purge remettait l'échéance à `null`).
 *
 * Le rattrapage ne détruit rien lui-même : il RÉARME l'échéance, et c'est le
 * balayage — le seul chemin d'effacement — qui efface. À sec par défaut.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { catchUpConsumedViewOnceMedia } from '../viewOnceMediaCatchUp';
import { VIEW_ONCE_BURN_GRACE_MS } from '../scheduleViewOnceBurn';

const NOW = new Date('2026-11-01T10:00:00.000Z');
const AUTHOR = 'p-author';
const BOB = 'p-bob';
const CAROL = 'p-carol';

type Row = {
  id: string;
  conversationId: string;
  senderId: string;
  isViewOnce: boolean;
  viewOnceBurnAt: Date | null;
  viewOnceBurnedAt: Date | null;
  attachments: Array<{ id: string }>;
};

function viewOnce(overrides: Partial<Row> = {}): Row {
  return {
    id: 'm1',
    conversationId: 'conv-1',
    senderId: AUTHOR,
    isViewOnce: true,
    viewOnceBurnAt: null,
    viewOnceBurnedAt: null,
    attachments: [{ id: 'att-1' }],
    ...overrides,
  };
}

type FindManyArgs = { where: { id?: { gt: string } }; take: number };

function buildPrisma(rows: Row[], openings: Array<{ messageId: string; participantId: string }>, members = [AUTHOR, BOB]) {
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return {
    message: {
      findMany: jest.fn<(args: FindManyArgs) => Promise<Row[]>>().mockImplementation(async (args) => {
        const after = args.where.id?.gt;
        return sorted.filter((row) => after === undefined || row.id > after).slice(0, args.take);
      }),
      update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
      updateMany: jest.fn<(args: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },
    messageStatusEntry: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue(openings),
    },
    participant: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue(members.map((id) => ({ id }))),
      count: jest.fn<(args: unknown) => Promise<number>>().mockResolvedValue(members.length),
    },
  };
}

const openedByBob = [{ messageId: 'm1', participantId: BOB }];

describe('catchUpConsumedViewOnceMedia — à sec par défaut', () => {
  it("compte une vue unique lue par tous dont l'échéance n'a jamais été rapprochée, SANS rien écrire", async () => {
    const prisma = buildPrisma([viewOnce()], openedByBob);

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW });

    expect(report).toMatchObject({ apply: false, scanned: 1, consumedUnscheduled: 1, attachments: 1, rearmed: 0 });
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('compte une vue unique déjà purgée qui porte encore des pièces, SANS rien écrire', async () => {
    const prisma = buildPrisma([viewOnce({ viewOnceBurnedAt: new Date('2026-10-01T00:00:00.000Z') })], []);

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW });

    expect(report).toMatchObject({ burnedWithMedia: 1, attachments: 1, rearmed: 0 });
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it("n'applique que si on le demande EXPLICITEMENT — `apply: false` reste à sec", async () => {
    const prisma = buildPrisma([viewOnce()], openedByBob);

    await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, apply: false });

    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });
});

describe('catchUpConsumedViewOnceMedia — appliqué', () => {
  it("lue par tous : rapproche l'échéance comme la consommation l'aurait fait (dernière ouverture = maintenant, plus le sursis)", async () => {
    const prisma = buildPrisma([viewOnce()], openedByBob);

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, apply: true });

    expect(report.rearmed).toBe(1);
    const { where, data } = prisma.message.updateMany.mock.calls[0][0] as {
      where: { id: string };
      data: { viewOnceBurnAt: Date };
    };
    expect(where.id).toBe('m1');
    expect(data.viewOnceBurnAt).toEqual(new Date(NOW.getTime() + VIEW_ONCE_BURN_GRACE_MS));
  });

  it("déjà purgée avec des pièces restantes : réarme l'échéance À MAINTENANT, pour que le balayage reprenne les fichiers", async () => {
    const prisma = buildPrisma([viewOnce({ viewOnceBurnedAt: new Date('2026-10-01T00:00:00.000Z') })], []);

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, apply: true });

    expect(report.rearmed).toBe(1);
    expect(prisma.message.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { viewOnceBurnAt: NOW } });
  });
});

describe('catchUpConsumedViewOnceMedia — jamais un média encore à lire', () => {
  it("un destinataire n'a pas ouvert : ni compté, ni écrit", async () => {
    const prisma = buildPrisma([viewOnce()], openedByBob, [AUTHOR, BOB, CAROL]);

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, apply: true });

    expect(report).toMatchObject({ consumedUnscheduled: 0, rearmed: 0 });
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it("seul l'auteur a ouvert : l'audience n'est pas complète", async () => {
    const prisma = buildPrisma([viewOnce()], [{ messageId: 'm1', participantId: AUTHOR }]);

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, apply: true });

    expect(report.consumedUnscheduled).toBe(0);
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it("une lecture de l'audience qui échoue arrête le rattrapage sans rien écrire", async () => {
    const prisma = buildPrisma([viewOnce()], openedByBob);
    prisma.messageStatusEntry.findMany.mockRejectedValue(new Error('mongo down'));

    await expect(catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, apply: true })).rejects.toThrow('mongo down');
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });
});

describe('catchUpConsumedViewOnceMedia — ce que le balayage couvre déjà', () => {
  it('une échéance déjà proche (au plus le sursis) est laissée au balayage', async () => {
    const soon = new Date(NOW.getTime() + VIEW_ONCE_BURN_GRACE_MS);
    const prisma = buildPrisma([viewOnce({ viewOnceBurnAt: soon })], openedByBob);

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, apply: true });

    expect(report).toMatchObject({ consumedUnscheduled: 0, burnedWithMedia: 0, rearmed: 0 });
  });

  it('une purge déjà en reprise (échéance passée) est laissée au balayage', async () => {
    const prisma = buildPrisma(
      [viewOnce({ viewOnceBurnedAt: new Date('2026-10-01T00:00:00.000Z'), viewOnceBurnAt: new Date('2026-10-31T00:00:00.000Z') })],
      [],
    );

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, apply: true });

    expect(report.burnedWithMedia).toBe(0);
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('une vue unique sans pièce jointe ne relève pas de ce rattrapage', async () => {
    const prisma = buildPrisma([viewOnce({ attachments: [] })], openedByBob);

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, apply: true });

    expect(report).toMatchObject({ scanned: 1, consumedUnscheduled: 0, rearmed: 0 });
  });

  it("un plafond de rétention lointain n'empêche pas le rattrapage : la lecture par tous le rapproche", async () => {
    const prisma = buildPrisma([viewOnce({ viewOnceBurnAt: new Date('2026-11-08T00:00:00.000Z') })], openedByBob);

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, apply: true });

    expect(report.consumedUnscheduled).toBe(1);
  });
});

describe('catchUpConsumedViewOnceMedia — balayage borné', () => {
  it('ne lit que les vues uniques non supprimées', async () => {
    const prisma = buildPrisma([], []);

    await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW });

    const query = JSON.stringify(prisma.message.findMany.mock.calls[0][0]);
    expect(query).toContain('"isViewOnce":true');
    expect(query).toContain('deletedAt');
  });

  it("parcourt toute la collection par lots, à curseur d'identifiant", async () => {
    const rows = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => viewOnce({ id, attachments: [] }));
    const prisma = buildPrisma(rows, []);

    const report = await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, batchSize: 2 });

    expect(report.scanned).toBe(5);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(3);
  });

  it('rapporte chaque trouvaille au journal', async () => {
    const prisma = buildPrisma([viewOnce()], openedByBob);
    const onFinding = jest.fn();

    await catchUpConsumedViewOnceMedia(prisma as any, { now: NOW, onFinding });

    expect(onFinding).toHaveBeenCalledWith({
      messageId: 'm1',
      conversationId: 'conv-1',
      kind: 'consumed-unscheduled',
      attachments: 1,
    });
  });
});

/**
 * #11269 (audit adversarial, F4) — le rattrapage écrit ses réarmements UN PAR
 * UN, et dit ce qu'il a écrit avant une erreur : un `Promise.all` lançait
 * toutes les écritures à la fois, et une erreur laissait l'opérateur sans
 * savoir lesquelles avaient pris — donc lesquelles le balayage allait effacer.
 */
describe('catchUpConsumedViewOnceMedia — écritures une à une, journal de ce qui a pris (F4)', () => {
  const burned = (id: string) => viewOnce({ id, viewOnceBurnedAt: new Date('2026-10-01T00:00:00.000Z') });

  it('une écriture qui lève arrête la suite, et le journal nomme celles qui ont pris avant elle', async () => {
    const prisma = buildPrisma([burned('m1'), burned('m2'), burned('m3')], []);
    prisma.message.update.mockImplementation(async (args: unknown) => {
      if ((args as { where: { id: string } }).where.id === 'm2') throw new Error('mongo down');
      return {};
    });
    const rearmed: Array<{ messageId: string; kind: string }> = [];

    await expect(
      catchUpConsumedViewOnceMedia(prisma as any, {
        now: NOW,
        apply: true,
        onRearmed: (entry) => rearmed.push({ messageId: entry.messageId, kind: entry.kind }),
      }),
    ).rejects.toThrow('mongo down');

    expect(rearmed).toEqual([{ messageId: 'm1', kind: 'burned-with-media' }]);
    const written = prisma.message.update.mock.calls.map((call) => (call[0] as { where: { id: string } }).where.id);
    expect(written).toEqual(['m1', 'm2']);
  });

  it('chaque réarmement réussi est journalisé, y compris la programmation d’une vue unique lue par tous', async () => {
    const prisma = buildPrisma([viewOnce(), burned('m2')], openedByBob);
    const rearmed: string[] = [];

    await catchUpConsumedViewOnceMedia(prisma as any, {
      now: NOW,
      apply: true,
      onRearmed: (entry) => rearmed.push(`${entry.kind}:${entry.messageId}`),
    });

    expect(rearmed).toEqual(['consumed-unscheduled:m1', 'burned-with-media:m2']);
  });
});
