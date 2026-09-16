/**
 * #6501 — l'auto-réparation à la LECTURE : si, et seulement si, Prisma rejette
 * une lecture parce qu'un expéditeur manque, la conversation est réparée et la
 * lecture rejouée UNE fois.
 *
 * La réparation qui tourne est la VRAIE, sur la base en mémoire
 * (`helpers/orphaned-sender-db.ts`) : ce fichier ne mocke aucun module. Sous
 * `bun test`, un module mocké le reste pour tous les fichiers suivants du même
 * processus — un `jest.mock` de la réparation ici éteignait son propre témoin
 * exhaustif et celui de la route.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  discoverConversationIdsByMessageIds,
  isOrphanedSenderError,
  withOrphanedSenderRepair,
} from '../../../../services/messaging/withOrphanedSenderRepair';
import { makeOrphanedSenderDb, orphanedSenderPrismaError } from '../../../helpers/orphaned-sender-db';

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const OTHER_CONV = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const GHOST = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const GHOST_ELSEWHERE = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const AT = new Date('2026-09-14T04:00:00.000Z');

const withOrphans = () =>
  makeOrphanedSenderDb({
    conversations: [CONV, OTHER_CONV].map((id) => ({ id, lastMessageAt: AT, createdAt: new Date('2026-01-01') })),
    messages: [
      { id: 'm1', conversationId: CONV, senderId: GHOST, messageSource: 'user', createdAt: AT },
      { id: 'm2', conversationId: OTHER_CONV, senderId: GHOST_ELSEWHERE, messageSource: 'user', createdAt: AT },
    ],
  });

const scopeOf = (db: ReturnType<typeof withOrphans>) => ({ prisma: db.prisma as never, conversationIds: [CONV] });

const hasTombstone = (db: ReturnType<typeof withOrphans>, id: string) =>
  db.state.participants.some((participant) => participant.id === id);

describe('isOrphanedSenderError', () => {
  it("reconnaît l'erreur exacte de Prisma, préfixe d'invocation compris", () => {
    expect(isOrphanedSenderError(orphanedSenderPrismaError())).toBe(true);
  });

  it("ne reconnaît pas la jumelle d'une AUTRE relation requise", () => {
    const conversationManquante = new Error(
      'Inconsistent query result: Field conversation is required to return data, got `null` instead.'
    );

    expect(isOrphanedSenderError(conversationManquante)).toBe(false);
  });

  it('ne reconnaît ni une erreur étrangère, ni une valeur qui n’est pas une erreur', () => {
    expect(isOrphanedSenderError(new Error('connection reset'))).toBe(false);
    expect(isOrphanedSenderError('Field sender is required to return data, got `null` instead.')).toBe(false);
    expect(isOrphanedSenderError(undefined)).toBe(false);
  });
});

describe('withOrphanedSenderRepair', () => {
  it('une lecture qui réussit ne déclenche aucune réparation', async () => {
    const db = withOrphans();
    const read = jest.fn<any>().mockResolvedValue('page');

    await expect(withOrphanedSenderRepair(scopeOf(db), read)).resolves.toBe('page');
    expect(read).toHaveBeenCalledTimes(1);
    expect(db.prisma.message.aggregateRaw).not.toHaveBeenCalled();
  });

  it('répare LA PORTÉE de la lecture, puis la rejoue UNE fois', async () => {
    const db = withOrphans();
    const read = jest.fn<any>().mockRejectedValueOnce(orphanedSenderPrismaError()).mockResolvedValueOnce('page');

    await expect(withOrphanedSenderRepair(scopeOf(db), read)).resolves.toBe('page');
    expect(read).toHaveBeenCalledTimes(2);
    expect(hasTombstone(db, GHOST)).toBe(true);
    expect(hasTombstone(db, GHOST_ELSEWHERE)).toBe(false);
  });

  it('relance TELLE QUELLE une erreur étrangère, sans réparer ni rejouer', async () => {
    const db = withOrphans();
    const etrangere = new Error('connection reset');
    const read = jest.fn<any>().mockRejectedValue(etrangere);

    await expect(withOrphanedSenderRepair(scopeOf(db), read)).rejects.toBe(etrangere);
    expect(read).toHaveBeenCalledTimes(1);
    expect(db.prisma.message.aggregateRaw).not.toHaveBeenCalled();
  });

  it('ne boucle pas : une lecture qui échoue encore après réparation remonte son erreur', async () => {
    const db = withOrphans();
    const persistante = orphanedSenderPrismaError();
    const read = jest.fn<any>().mockRejectedValue(persistante);

    await expect(withOrphanedSenderRepair(scopeOf(db), read)).rejects.toBe(persistante);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("une réparation qui échoue rend l'erreur d'ORIGINE, sans rejouer la lecture", async () => {
    const db = withOrphans();
    db.prisma.message.aggregateRaw.mockRejectedValueOnce(new Error('aggregate refused'));
    const origine = orphanedSenderPrismaError();
    const read = jest.fn<any>().mockRejectedValue(origine);

    await expect(withOrphanedSenderRepair(scopeOf(db), read)).rejects.toBe(origine);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('withOrphanedSenderRepair — portée par RÉSOLVEUR (#6516)', () => {
  it("appelle le résolveur APRÈS l'échec, jamais avant, et répare ce qu'il rend", async () => {
    const db = withOrphans();
    const discover = jest.fn<any>().mockResolvedValue([CONV]);
    const read = jest.fn<any>().mockRejectedValueOnce(orphanedSenderPrismaError()).mockResolvedValueOnce('page');

    const scope = { prisma: db.prisma as never, conversationIds: discover };
    await expect(withOrphanedSenderRepair(scope, read)).resolves.toBe('page');

    expect(discover).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(hasTombstone(db, GHOST)).toBe(true);
    expect(hasTombstone(db, GHOST_ELSEWHERE)).toBe(false);
  });

  it('une lecture qui réussit du premier coup n’appelle jamais le résolveur', async () => {
    const db = withOrphans();
    const discover = jest.fn<any>().mockResolvedValue([CONV]);
    const read = jest.fn<any>().mockResolvedValue('page');

    await expect(withOrphanedSenderRepair({ prisma: db.prisma as never, conversationIds: discover }, read)).resolves.toBe(
      'page'
    );
    expect(discover).not.toHaveBeenCalled();
  });

  it('un résolveur qui ne trouve RIEN ne répare rien, et le rejeu échoue sans boucler', async () => {
    const db = withOrphans();
    const discover = jest.fn<any>().mockResolvedValue([]);
    const persistante = orphanedSenderPrismaError();
    const read = jest.fn<any>().mockRejectedValue(persistante);

    await expect(withOrphanedSenderRepair({ prisma: db.prisma as never, conversationIds: discover }, read)).rejects.toBe(
      persistante
    );
    expect(read).toHaveBeenCalledTimes(2);
    expect(db.prisma.message.aggregateRaw).not.toHaveBeenCalled();
  });

  it('un résolveur qui échoue rend l’erreur d’ORIGINE, sans rejouer la lecture', async () => {
    const db = withOrphans();
    const discover = jest.fn<any>().mockRejectedValue(new Error('discovery refused'));
    const origine = orphanedSenderPrismaError();
    const read = jest.fn<any>().mockRejectedValue(origine);

    await expect(withOrphanedSenderRepair({ prisma: db.prisma as never, conversationIds: discover }, read)).rejects.toBe(
      origine
    );
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('discoverConversationIdsByMessageIds (#6516)', () => {
  it('lit la seule conversation d’un message trouvé par id seul, sans jamais sélectionner `sender`', async () => {
    const db = withOrphans();

    const discover = discoverConversationIdsByMessageIds(db.prisma as never, ['m1']);
    await expect(discover()).resolves.toEqual([CONV]);
  });

  it('déduplique les conversations de PLUSIEURS messages', async () => {
    const db = withOrphans();

    const discover = discoverConversationIdsByMessageIds(db.prisma as never, ['m1', 'm2']);
    const found = await discover();
    expect([...found].sort()).toEqual([CONV, OTHER_CONV].sort());
  });

  it('ne lit RIEN pour une liste d’ids vide — jamais une passe globale par accident', async () => {
    const db = withOrphans();
    const discover = discoverConversationIdsByMessageIds(db.prisma as never, []);

    await expect(discover()).resolves.toEqual([]);
    expect(db.prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('un id déjà purgé (message introuvable) n’apporte aucune conversation', async () => {
    const db = withOrphans();
    const discover = discoverConversationIdsByMessageIds(db.prisma as never, ['ghost-message-id']);

    await expect(discover()).resolves.toEqual([]);
  });

  it('branché bout en bout : une lecture par id seul se répare et se rejoue', async () => {
    const db = withOrphans();
    const read = jest.fn<any>().mockRejectedValueOnce(orphanedSenderPrismaError()).mockResolvedValueOnce('message');

    const scope = { prisma: db.prisma as never, conversationIds: discoverConversationIdsByMessageIds(db.prisma as never, ['m1']) };
    await expect(withOrphanedSenderRepair(scope, read)).resolves.toBe('message');

    expect(read).toHaveBeenCalledTimes(2);
    expect(hasTombstone(db, GHOST)).toBe(true);
  });
});
