/**
 * À `D(u)`, le message disparaît de l'écran de `u` — et de LUI SEUL (#7451).
 *
 * C'est la moitié de la directive que le balayage historique ne pouvait pas
 * porter : `ExpiredMessagesCleanupService` détruit LE message pour toute la
 * room, une fois. Une échéance par destinataire demande l'inverse — une mise
 * hors de vue, par lecteur, à l'heure de chacun, sans toucher au contenu que
 * les autres décomptent encore.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { EphemeralRecipientExpiryService } from '../EphemeralRecipientExpiryService';

const ENTRY_ID = '507f1f77bcf86cd799439010';
const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = '507f1f77bcf86cd799439013';
const USER_ID = '507f1f77bcf86cd799439014';
const AUTRE_USER = '507f1f77bcf86cd799439015';

const NOW = new Date('2026-09-22T12:00:00.000Z');
const D = new Date('2026-09-22T11:59:30.000Z');

const entryFindMany = jest.fn<any>();
const entryUpdateMany = jest.fn<any>();
const participantFindUnique = jest.fn<any>();
const notificationFindMany = jest.fn<any>();
const notificationDeleteMany = jest.fn<any>();
const messageFindMany = jest.fn<any>();

const prisma = {
  message: { findMany: messageFindMany },
  messageStatusEntry: { findMany: entryFindMany, updateMany: entryUpdateMany },
  participant: { findUnique: participantFindUnique },
  notification: { findMany: notificationFindMany, deleteMany: notificationDeleteMany },
} as any;

const emitted: Array<{ room: string; event: string; data: any }> = [];
const io = {
  to: (room: string) => ({
    emit: (event: string, data: any) => {
      emitted.push({ room, event, data });
    },
  }),
};

const service = () =>
  new EphemeralRecipientExpiryService(prisma, { now: () => NOW, resolveIO: () => io });

const dueEntry = (over: Record<string, unknown> = {}) => ({
  id: ENTRY_ID,
  messageId: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  participantId: PARTICIPANT_ID,
  ephemeralExpiresAt: D,
  ...over,
});

beforeEach(() => {
  emitted.length = 0;
  for (const fn of [entryFindMany, entryUpdateMany, participantFindUnique, notificationFindMany, notificationDeleteMany, messageFindMany]) {
    fn.mockReset();
  }
  entryFindMany.mockResolvedValue([dueEntry()]);
  entryUpdateMany.mockResolvedValue({ count: 1 });
  participantFindUnique.mockResolvedValue({ id: PARTICIPANT_ID, userId: USER_ID });
  notificationFindMany.mockResolvedValue([]);
  notificationDeleteMany.mockResolvedValue({ count: 0 });
  messageFindMany.mockResolvedValue([]);
});

/**
 * #8630 — la mort d'un éphémère pour `u` entraîne, POUR `u`, celle des
 * réponses qui le citent, transitivement : chacune reçoit son
 * `message:expired` sur la room de `u` seul, et ses bannières chez `u` partent.
 */
describe('EphemeralRecipientExpiryService — les réponses partent avec ce qu\'elles citent (#8630)', () => {
  const REPONSE = '507f1f77bcf86cd799439021';
  const PETITE_REPONSE = '507f1f77bcf86cd799439022';

  beforeEach(() => {
    messageFindMany.mockImplementation(async ({ where }: any) => {
      const parents: string[] = where?.replyToId?.in ?? [];
      if (parents.includes(MESSAGE_ID)) return [{ id: REPONSE, conversationId: CONVERSATION_ID }];
      if (parents.includes(REPONSE)) return [{ id: PETITE_REPONSE, conversationId: CONVERSATION_ID }];
      return [];
    });
  });

  it('annonce la mort de chaque réponse, transitivement, au seul lecteur échu', async () => {
    await service().sweep(undefined);

    expect(emitted).toEqual([
      { room: `user:${USER_ID}`, event: 'message:expired', data: { messageId: MESSAGE_ID, conversationId: CONVERSATION_ID } },
      { room: `user:${USER_ID}`, event: 'message:expired', data: { messageId: REPONSE, conversationId: CONVERSATION_ID } },
      { room: `user:${USER_ID}`, event: 'message:expired', data: { messageId: PETITE_REPONSE, conversationId: CONVERSATION_ID } },
    ]);
  });

  it('retire chez ce lecteur les bannières déjà servies des réponses', async () => {
    notificationFindMany.mockResolvedValue([{ id: 'n1', userId: USER_ID, type: 'message', context: {}, delivery: {} }]);

    await service().sweep(undefined);

    expect(notificationDeleteMany).toHaveBeenCalledWith({ where: { messageId: REPONSE, userId: USER_ID } });
    expect(notificationDeleteMany).toHaveBeenCalledWith({ where: { messageId: PETITE_REPONSE, userId: USER_ID } });
  });

  it('ne cherche aucune réponse quand l\'annonce a déjà été réclamée', async () => {
    entryUpdateMany.mockResolvedValue({ count: 0 });

    await service().sweep(undefined);

    expect(messageFindMany).not.toHaveBeenCalled();
  });
});

describe('EphemeralRecipientExpiryService.sweep', () => {
  it("émet `message:expired` vers la room personnelle du destinataire, et NULLE PART ailleurs", async () => {
    await service().sweep(undefined);

    expect(emitted).toEqual([
      {
        room: `user:${USER_ID}`,
        event: 'message:expired',
        data: { messageId: MESSAGE_ID, conversationId: CONVERSATION_ID },
      },
    ]);
  });

  it("retire les bannières de CE destinataire seulement", async () => {
    // Deux destinataires ont reçu la notification ; seule celle de `u` part.
    notificationFindMany.mockResolvedValue([
      { id: 'n1', userId: USER_ID, type: 'message', context: {}, delivery: {} },
    ]);

    await service().sweep(undefined);

    expect(notificationDeleteMany).toHaveBeenCalledWith({
      where: { messageId: MESSAGE_ID, userId: USER_ID },
    });
    expect(notificationDeleteMany).not.toHaveBeenCalledWith({ where: { messageId: MESSAGE_ID } });
    expect(AUTRE_USER).not.toBe(USER_ID);
  });

  it('marque l\'annonce comme faite, et ne la rejoue jamais', async () => {
    await service().sweep(undefined);

    const [{ where, data }] = entryUpdateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ];
    expect(data).toEqual({ ephemeralExpiredAt: NOW });
    expect(where.OR).toEqual([
      { ephemeralExpiredAt: null },
      { ephemeralExpiredAt: { isSet: false } },
    ]);
  });

  it("n'annonce rien quand une autre passe a réclamé l'entrée entre-temps", async () => {
    entryUpdateMany.mockResolvedValue({ count: 0 });

    expect(await service().sweep(undefined)).toEqual({ expired: 0 });
    expect(emitted).toEqual([]);
    expect(notificationDeleteMany).not.toHaveBeenCalled();
  });

  it("RÉCLAME avant d'annoncer — l'ordre inverse rejouerait l'annonce à chaque passe", async () => {
    const ordre: string[] = [];
    entryUpdateMany.mockImplementation(async () => {
      ordre.push('claim');
      return { count: 1 };
    });
    const tracing = new EphemeralRecipientExpiryService(prisma, {
      now: () => NOW,
      resolveIO: () => ({
        to: (room: string) => ({
          emit: () => {
            ordre.push(`emit:${room}`);
          },
        }),
      }),
    });

    await tracing.sweep(undefined);

    expect(ordre).toEqual(['claim', `emit:user:${USER_ID}`]);
  });

  it("refuse une ligne dont l'échéance n'est pas une date passée — le filet, pas le prédicat", async () => {
    // Le bracketing par type de `lte` n'est pas un invariant du connecteur
    // MongoDB : une ligne sans échéance ne doit JAMAIS disparaître d'un écran.
    entryFindMany.mockResolvedValue([dueEntry({ ephemeralExpiresAt: null })]);

    expect(await service().sweep(undefined)).toEqual({ expired: 0 });
    expect(emitted).toEqual([]);
  });

  it("ne touche à AUCUN contenu — la destruction appartient à l'autre balayage", async () => {
    await service().sweep(undefined);

    // Une seule écriture, et c'est le marqueur d'annonce.
    expect(entryUpdateMany).toHaveBeenCalledTimes(1);
    // #8630 — elle LIT les réponses à annoncer, et n'écrit jamais un message.
    expect(Object.keys((prisma as { message: object }).message)).toEqual(['findMany']);
  });

  it("adresse un invité de lien partagé sans chercher à retirer des notifications qu'il n'a pas", async () => {
    participantFindUnique.mockResolvedValue({ id: PARTICIPANT_ID, userId: null });

    await service().sweep(undefined);

    expect(emitted[0].room).toBe(`user:${PARTICIPANT_ID}`);
    expect(notificationFindMany).not.toHaveBeenCalled();
  });
});

describe('EphemeralRecipientExpiryService.expireNow — la flamme-œil consommée (#8302)', () => {
  it("expire TOUT DE SUITE les entrées remises, sans attendre la passe à la minute", async () => {
    const result = await service().expireNow([dueEntry({ ephemeralExpiresAt: NOW })], undefined);

    expect(result).toEqual({ expired: 1 });
    expect(entryFindMany).not.toHaveBeenCalled();
    expect(emitted).toEqual([
      {
        room: `user:${USER_ID}`,
        event: 'message:expired',
        data: { messageId: MESSAGE_ID, conversationId: CONVERSATION_ID },
      },
    ]);
  });

  it("n'annonce pas deux fois une entrée déjà réclamée — la consommation est idempotente", async () => {
    entryUpdateMany.mockResolvedValue({ count: 0 });

    expect(await service().expireNow([dueEntry({ ephemeralExpiresAt: NOW })], undefined)).toEqual({ expired: 0 });
    expect(emitted).toEqual([]);
  });

  it("refuse une entrée dont l'échéance n'est pas encore échue", async () => {
    const later = new Date(NOW.getTime() + 60_000);

    expect(await service().expireNow([dueEntry({ ephemeralExpiresAt: later })], undefined)).toEqual({ expired: 0 });
    expect(entryUpdateMany).not.toHaveBeenCalled();
  });
});
