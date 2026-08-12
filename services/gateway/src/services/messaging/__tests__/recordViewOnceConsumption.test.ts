/**
 * Le budget d'un message à vue unique se dépense par SPECTATEUR, pas par
 * ouverture.
 *
 * `POST /conversations/:id/messages/:messageId/consume` incrémentait
 * `Message.viewOnceCount` à CHAQUE appel. Deux conséquences, et la seconde est
 * celle que l'utilisateur voit :
 *
 *  1. **Un renvoi de la requête compte deux fois.** La route est une mutation
 *     nue, sans clé d'idempotence : un rejeu (file hors-ligne, double tap,
 *     retry réseau) dépense une unité de plus.
 *  2. **Un seul destinataire peut consommer le budget de tous.** Dans un
 *     groupe où l'émetteur a posé `maxViewOnceCount: 3`, le premier qui rouvre
 *     la photo trois fois porte `isFullyConsumed` à vrai, et la route ANNONCE
 *     cet état à toute la room. Les deux autres perdent un média qu'ils n'ont
 *     jamais ouvert.
 *
 * Or la donnée qui rend le compte exact est écrite par ce même gestionnaire,
 * deux instructions plus bas : `MessageStatusEntry.viewedOnceAt`, par
 * participant. Elle était écrite et jamais relue.
 *
 * La revendication est GARDÉE côté base plutôt que décidée après une lecture :
 * deux ouvertures simultanées du même spectateur liraient toutes deux « pas
 * encore vu ». C'est l'`updateMany` filtré qui tranche, et son prédicat doit
 * apparier les deux états possibles du champ — ABSENT (l'entrée créée par la
 * livraison n'écrit pas cette colonne) autant que présent-et-nul (l'entrée
 * qu'une consommation antérieure a estampillée). Sur le connecteur MongoDB de
 * Prisma, `{ viewedOnceAt: null }` seul n'apparie que le second.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { recordViewOnceConsumption } from '../recordViewOnceConsumption';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const VIEWER_ID = '507f1f77bcf86cd799439013';
const OTHER_VIEWER_ID = '507f1f77bcf86cd799439014';

const AT = new Date('2026-08-10T12:00:00.000Z');

const statusUpdateMany = jest.fn<any>();
const statusCreate = jest.fn<any>();
const messageUpdate = jest.fn<any>();

const prisma = {
  messageStatusEntry: { updateMany: statusUpdateMany, create: statusCreate },
  message: { update: messageUpdate },
} as any;

function uniqueViolation(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

beforeEach(() => {
  statusUpdateMany.mockReset();
  statusCreate.mockReset();
  messageUpdate.mockReset();
});

describe('recordViewOnceConsumption — une unité par spectateur', () => {
  it('la première ouverture d’un spectateur dépense exactement une unité', async () => {
    statusUpdateMany.mockResolvedValue({ count: 1 });
    messageUpdate.mockResolvedValue({ viewOnceCount: 2 });

    const result = await recordViewOnceConsumption(prisma, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      participantId: VIEWER_ID,
      currentViewOnceCount: 1,
      at: AT,
    });

    expect(result).toEqual({ viewOnceCount: 2, firstConsumption: true });
    expect(messageUpdate).toHaveBeenCalledTimes(1);
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: MESSAGE_ID },
      data: { viewOnceCount: { increment: 1 } },
    });
    expect(statusCreate).not.toHaveBeenCalled();
  });

  it('une seconde ouverture du MÊME spectateur ne dépense plus rien', async () => {
    // L'entrée porte déjà `viewedOnceAt` : le prédicat gardé n'apparie plus,
    // et la création se heurte à la contrainte d'unicité (messageId, participantId).
    statusUpdateMany.mockResolvedValue({ count: 0 });
    statusCreate.mockRejectedValue(uniqueViolation());

    const result = await recordViewOnceConsumption(prisma, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      participantId: VIEWER_ID,
      currentViewOnceCount: 2,
      at: AT,
    });

    expect(result).toEqual({ viewOnceCount: 2, firstConsumption: false });
    expect(messageUpdate).not.toHaveBeenCalled();
  });

  it('un spectateur sans entrée de statut dépense une unité, pas zéro', async () => {
    // Le message n'a jamais été marqué livré/lu pour ce participant : aucune
    // ligne à estampiller. La consommation la CRÉE — sans quoi la garde
    // n'apparierait jamais et le correctif se retournerait en régression.
    statusUpdateMany.mockResolvedValue({ count: 0 });
    statusCreate.mockResolvedValue({ id: 'entry_1' });
    messageUpdate.mockResolvedValue({ viewOnceCount: 1 });

    const result = await recordViewOnceConsumption(prisma, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      participantId: VIEWER_ID,
      currentViewOnceCount: 0,
      at: AT,
    });

    expect(result).toEqual({ viewOnceCount: 1, firstConsumption: true });
    expect(statusCreate).toHaveBeenCalledWith({
      data: {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        participantId: VIEWER_ID,
        viewedOnceAt: AT,
        revealedAt: AT,
      },
    });
    expect(messageUpdate).toHaveBeenCalledTimes(1);
  });

  it('chaque spectateur distinct dépense sa propre unité', async () => {
    statusUpdateMany.mockResolvedValue({ count: 1 });
    messageUpdate
      .mockResolvedValueOnce({ viewOnceCount: 1 })
      .mockResolvedValueOnce({ viewOnceCount: 2 });

    const first = await recordViewOnceConsumption(prisma, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      participantId: VIEWER_ID,
      currentViewOnceCount: 0,
      at: AT,
    });
    const second = await recordViewOnceConsumption(prisma, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      participantId: OTHER_VIEWER_ID,
      currentViewOnceCount: 1,
      at: AT,
    });

    expect(first.firstConsumption).toBe(true);
    expect(second.firstConsumption).toBe(true);
    expect(messageUpdate).toHaveBeenCalledTimes(2);
  });

  it('la revendication apparie une colonne ABSENTE autant que présente-et-nulle', async () => {
    // Une entrée créée par la livraison (`deliveredAt`/`readAt` seuls) n'écrit
    // jamais `viewedOnceAt` : sur MongoDB le champ est ABSENT du document, et
    // `{ viewedOnceAt: null }` seul ne l'apparie pas. Même piège que le
    // `deletedAt: null` qui avait rendu inerte le balayage éphémère.
    statusUpdateMany.mockResolvedValue({ count: 1 });
    messageUpdate.mockResolvedValue({ viewOnceCount: 1 });

    await recordViewOnceConsumption(prisma, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      participantId: VIEWER_ID,
      currentViewOnceCount: 0,
      at: AT,
    });

    expect(statusUpdateMany).toHaveBeenCalledWith({
      where: {
        messageId: MESSAGE_ID,
        participantId: VIEWER_ID,
        OR: [{ viewedOnceAt: null }, { viewedOnceAt: { isSet: false } }],
      },
      data: { viewedOnceAt: AT, revealedAt: AT },
    });
  });

  it('une création concurrente perdante ne dépense pas de seconde unité', async () => {
    // Deux ouvertures simultanées du même spectateur sans entrée préalable :
    // la contrainte d'unicité désigne un seul gagnant, et c'est lui seul qui
    // doit dépenser.
    statusUpdateMany.mockResolvedValue({ count: 0 });
    statusCreate.mockRejectedValue(uniqueViolation());

    const result = await recordViewOnceConsumption(prisma, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      participantId: VIEWER_ID,
      currentViewOnceCount: 1,
      at: AT,
    });

    expect(result.firstConsumption).toBe(false);
    expect(messageUpdate).not.toHaveBeenCalled();
  });

  it('une panne d’écriture qui n’est PAS un conflit d’unicité remonte', async () => {
    // Un échec de base ne doit pas se lire « déjà vu » : le silence
    // transformerait une panne en consommation fantôme.
    statusUpdateMany.mockResolvedValue({ count: 0 });
    statusCreate.mockRejectedValue(new Error('connection reset'));

    await expect(
      recordViewOnceConsumption(prisma, {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        participantId: VIEWER_ID,
        currentViewOnceCount: 1,
        at: AT,
      })
    ).rejects.toThrow('connection reset');
    expect(messageUpdate).not.toHaveBeenCalled();
  });

  it('un compteur absent en retour d’incrément se déduit du compte connu', async () => {
    // `viewOnceCount` est nullable en base : le retour peut être `null` sur une
    // ligne écrite avant que la colonne existe. Le compte annoncé reste alors
    // exact plutôt que de retomber à zéro.
    statusUpdateMany.mockResolvedValue({ count: 1 });
    messageUpdate.mockResolvedValue({ viewOnceCount: null });

    const result = await recordViewOnceConsumption(prisma, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      participantId: VIEWER_ID,
      currentViewOnceCount: 4,
      at: AT,
    });

    expect(result).toEqual({ viewOnceCount: 5, firstConsumption: true });
  });
});
