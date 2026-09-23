/**
 * Le décompte part de la RÉCEPTION, et de la première seulement (#7451).
 *
 * Directive porteur 2026-09-22 : « les messages avec temps décompté ne doivent
 * décompter que lorsque l'utilisateur l'a reçu ! Le serveur rend le message
 * indisponible après le temps imparti + 1 h ».
 *
 * ─── CES TÉMOINS S'ÉCRIVENT SUR UNE RÉCEPTION TARDIVE ───────────────────────
 *
 * Sur un destinataire qui reçoit à l'instant de l'envoi, l'ancienne règle
 * (échéance posée par le client) et la nouvelle rendent le même verdict. Chacun
 * de ceux-ci écarte donc la réception de l'envoi — c'est le seul rang où la
 * règle peut tomber.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';

import { startEphemeralCountdowns } from '../ephemeralCountdown';
import { setEphemeralCountdownIOResolver } from '../../../socketio/ephemeralCountdownAnnouncer';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const RECIPIENT_PARTICIPANT = '507f1f77bcf86cd799439013';
const RECIPIENT_USER = '507f1f77bcf86cd799439014';
const SENDER_PARTICIPANT = '507f1f77bcf86cd799439015';
const SENDER_USER = '507f1f77bcf86cd799439016';

const SENT_AT = new Date('2026-09-22T10:00:00.000Z');
/** Une heure APRÈS l'envoi : l'écart qui distingue les deux règles. */
const RECEIVED_AT = new Date('2026-09-22T11:00:00.000Z');
const DURATION = 30;
const D_RECIPIENT = new Date(RECEIVED_AT.getTime() + DURATION * 1000);

const messageFindMany = jest.fn<any>();
const messageUpdateMany = jest.fn<any>();
const entryUpdateMany = jest.fn<any>();
const entryFindMany = jest.fn<any>();
const participantFindUnique = jest.fn<any>();

const prisma = {
  message: { findMany: messageFindMany, updateMany: messageUpdateMany },
  messageStatusEntry: { updateMany: entryUpdateMany, findMany: entryFindMany },
  participant: { findUnique: participantFindUnique },
} as any;

const emitted: Array<{ room: string; event: string; data: any }> = [];
const io = {
  to: (room: string) => ({
    emit: (event: string, data: any) => {
      emitted.push({ room, event, data });
    },
  }),
};

const ephemeralMessage = (over: Record<string, unknown> = {}) => ({
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  createdAt: SENT_AT,
  ephemeralDuration: DURATION,
  isViewOnce: false,
  senderId: SENDER_PARTICIPANT,
  sender: { id: SENDER_PARTICIPANT, userId: SENDER_USER },
  ...over,
});

const start = () =>
  startEphemeralCountdowns(prisma, {
    participantId: RECIPIENT_PARTICIPANT,
    conversationId: CONVERSATION_ID,
    messageIds: [MESSAGE_ID],
    at: RECEIVED_AT,
  });

beforeEach(() => {
  emitted.length = 0;
  for (const fn of [messageFindMany, messageUpdateMany, entryUpdateMany, entryFindMany, participantFindUnique]) {
    fn.mockReset();
  }
  messageFindMany.mockResolvedValue([ephemeralMessage()]);
  messageUpdateMany.mockResolvedValue({ count: 1 });
  entryUpdateMany.mockResolvedValue({ count: 1 });
  entryFindMany.mockResolvedValue([{ ephemeralExpiresAt: D_RECIPIENT }]);
  participantFindUnique.mockResolvedValue({ id: RECIPIENT_PARTICIPANT, userId: RECIPIENT_USER });
  setEphemeralCountdownIOResolver(() => io);
});

describe('startEphemeralCountdowns', () => {
  it("grave D(u) = RÉCEPTION + durée, et non envoi + durée", async () => {
    await start();

    expect(entryUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ephemeralExpiresAt: D_RECIPIENT } }),
    );
    // La preuve que la règle a changé : l'ancienne aurait gravé 10:00:30.
    expect(D_RECIPIENT.toISOString()).toBe('2026-09-22T11:00:30.000Z');
  });

  it("n'écrit l'échéance que si la colonne est encore vide — write-once", async () => {
    await start();

    const [{ where }] = entryUpdateMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ messageId: MESSAGE_ID, participantId: RECIPIENT_PARTICIPANT });
    // Les DEUX états « pas d'échéance » : absente du document, ou présente-et-nulle.
    expect(where.OR).toEqual([
      { ephemeralExpiresAt: null },
      { ephemeralExpiresAt: { isSet: false } },
    ]);
  });

  it("ne rejoue RIEN quand le décompte était déjà démarré — second appareil, seconde ouverture", async () => {
    entryUpdateMany.mockResolvedValue({ count: 0 });

    const started = await start();

    expect(started).toEqual([]);
    expect(emitted).toEqual([]);
    expect(messageUpdateMany).not.toHaveBeenCalled();
  });

  it('ignore un message qui n\'est pas éphémère', async () => {
    messageFindMany.mockResolvedValue([]);

    expect(await start()).toEqual([]);
    expect(entryUpdateMany).not.toHaveBeenCalled();
  });

  it("recalcule l'heure de DESTRUCTION au plus tardif des décomptes connus, plus une heure", async () => {
    const dAutre = new Date(RECEIVED_AT.getTime() + 10 * 60 * 1000);
    entryFindMany.mockResolvedValue([
      { ephemeralExpiresAt: D_RECIPIENT },
      { ephemeralExpiresAt: dAutre },
    ]);

    await start();

    expect(messageUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { expiresAt: new Date(dAutre.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS) },
      }),
    );
  });

  it("ne REPOUSSE jamais l'échéance d'une vue unique — la promesse la plus forte gagne", async () => {
    messageFindMany.mockResolvedValue([ephemeralMessage({ isViewOnce: true })]);

    await start();

    const [{ where }] = messageUpdateMany.mock.calls[0] as [{ where: { OR: unknown[] } }];
    // Rapprocher reste permis ; repousser (`lt`) est absent de la disjonction.
    expect(where.OR).toEqual([
      { expiresAt: null },
      { expiresAt: { isSet: false } },
      { expiresAt: { gt: expect.any(Date) } },
    ]);
  });

  it('autorise le report sur un éphémère ordinaire — sinon un destinataire tardif perd son décompte', async () => {
    await start();

    const [{ where }] = messageUpdateMany.mock.calls[0] as [{ where: { OR: unknown[] } }];
    expect(where.OR).toContainEqual({ expiresAt: { lt: expect.any(Date) } });
  });

  it("annonce vers les DEUX rooms personnelles, avec des valeurs différentes", async () => {
    const dAutre = new Date(RECEIVED_AT.getTime() + 10 * 60 * 1000);
    entryFindMany.mockResolvedValue([
      { ephemeralExpiresAt: D_RECIPIENT },
      { ephemeralExpiresAt: dAutre },
    ]);

    await start();

    expect(emitted).toEqual([
      {
        room: `user:${RECIPIENT_USER}`,
        event: 'message:countdown-started',
        data: {
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          expiresAt: D_RECIPIENT.toISOString(),
        },
      },
      {
        // L'expéditeur voit la plus TARDIVE : sur son écran, le message vit
        // tant qu'il vit pour quelqu'un.
        room: `user:${SENDER_USER}`,
        event: 'message:countdown-started',
        data: {
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          expiresAt: dAutre.toISOString(),
        },
      },
    ]);
  });

  it("adresse un invité de lien partagé par son `Participant.id` — il n'a pas de ligne User", async () => {
    participantFindUnique.mockResolvedValue({ id: RECIPIENT_PARTICIPANT, userId: null });

    await start();

    expect(emitted[0].room).toBe(`user:${RECIPIENT_PARTICIPANT}`);
  });

  it("pose l'échéance même sans `io` — l'écriture est durable, l'annonce ne l'est pas", async () => {
    setEphemeralCountdownIOResolver(() => null);

    const started = await start();

    expect(started).toHaveLength(1);
    expect(entryUpdateMany).toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });
});
