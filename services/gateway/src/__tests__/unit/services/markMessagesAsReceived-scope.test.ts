/**
 * `markMessagesAsReceived` fige ce qu'on lui NOMME, ou la fenêtre si on ne lui
 * nomme rien (#18614).
 *
 * C'est la seconde moitié du lot, et celle que l'issue réclame explicitement :
 * « un témoin qui traverse `freezeMessageStatus` pour de vrai — le mock de
 * `_emitDeliveryForDrainedMessages` est précisément là où la garantie se
 * rompt ». Les témoins du drain prouvent que l'appelant PASSE les bons ids ;
 * ceux-ci prouvent que la chaîne les HONORE jusqu'au `where` remis à Prisma.
 *
 * ## Pourquoi le paramètre est OPTIONNEL, et doit le rester
 *
 * Quatre autres sites de production appellent cette méthode, et pour eux la
 * FENÊTRE est la sémantique juste — ils disent « tout ce qui précède est
 * arrivé », parce que le lecteur est en ligne et dans le fil :
 * `receipts.ts` (deux portes REST), `messages-list.ts` (remise automatique à
 * la lecture) et `MessageHandler.autoDeliverToOnlineRecipients`.
 *
 * Seul le REJEU sait qu'il a livré un sous-ensemble STRICT de la fenêtre. Le
 * paramètre nomme donc ce savoir-là, et son absence garde le comportement
 * d'origine à l'octet près.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

function oid(seed: string): string {
  const hex = Buffer.from(seed).toString('hex');
  return (hex + '0'.repeat(24)).slice(0, 24);
}

const PARTICIPANT = oid('p-reader');
const CONV = oid('conv-scope');
const M1 = oid('m-one');
const M2 = oid('m-two');

describe('markMessagesAsReceived — le périmètre du gel', () => {
  let prisma: any;
  /** Les `where` que `freezeMessageStatus` a remis à Prisma. */
  let messageWheres: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    messageWheres = [];
    prisma = {
      message: {
        findFirst: jest.fn(async () => ({ id: M2 })),
        findMany: jest.fn(async (args: any) => {
          messageWheres.push(args?.where);
          return [{ id: M2 }];
        }),
      },
      conversationReadCursor: {
        findUnique: jest.fn(async () => ({ lastDeliveredAt: new Date('2026-11-15T10:00:00Z') })),
        upsert: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      messageStatusEntry: {
        findMany: jest.fn(async () => []),
        createMany: jest.fn(async () => ({ count: 1 })),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      participant: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (ops: any) => (typeof ops === 'function' ? ops(prisma) : [])),
    };
  });

  /** Chaque témoin a SA conversation : le cache de déduplication est statique. */
  const service = () => new MessageReadStatusService(prisma as any);

  /**
   * LE témoin de cette moitié : les ids nommés deviennent un `id: { in: … }`,
   * et la PLAGE `createdAt` disparaît. Sous le défaut, la plage survivait et
   * emportait tout message de la conversation créé depuis le curseur.
   */
  it('fige exactement les ids nommés, et n’ouvre AUCUNE plage de dates', async () => {
    const conv = oid('conv-named');
    await service().markMessagesAsReceived(PARTICIPANT, conv, M2, { messageIds: [M2] });

    const freeze = messageWheres.find((w) => w?.conversationId === conv && w?.senderId);
    expect(freeze).toBeDefined();
    expect(freeze.id).toEqual({ in: [M2] });
    expect(freeze.createdAt).toBeUndefined();
  });

  /**
   * NON-RÉGRESSION, et c'est la moitié qui protège les quatre autres
   * appelants : sans ids, la fenêtre reste exactement ce qu'elle était.
   */
  it('garde la FENÊTRE quand aucun id n’est nommé', async () => {
    const conv = oid('conv-window');
    await service().markMessagesAsReceived(PARTICIPANT, conv, M2);

    const freeze = messageWheres.find((w) => w?.conversationId === conv && w?.senderId);
    expect(freeze).toBeDefined();
    expect(freeze.id).toBeUndefined();
    expect(freeze.createdAt).toMatchObject({ gt: new Date('2026-11-15T10:00:00Z') });
  });

  /**
   * Une liste VIDE n'est pas une absence : elle dit « j'ai livré, et rien ».
   * La traiter comme « je n'ai rien calculé » rouvrirait la fenêtre sur le
   * chemin exact que ce lot ferme — c'est la distinction
   * `bridgeComputed` / `bridgeNotComputed` du dépôt, un étage plus bas.
   */
  it('une liste VIDE ne rouvre PAS la fenêtre', async () => {
    const conv = oid('conv-empty');
    await service().markMessagesAsReceived(PARTICIPANT, conv, M2, { messageIds: [] });

    const freeze = messageWheres.find((w) => w?.conversationId === conv && w?.senderId);
    // INCONDITIONNEL. Sous un `if (freeze)`, une mutation qui fait SAUTER le
    // gel au lieu de le rouvrir — `if (messageIds.length === 0) return 0;` en
    // tête de `freezeMessageStatus` — laissait `freeze` indéfini et le témoin
    // VERT, zéro assertion exécutée. Il gardait la clause que le lot met le
    // plus en avant, et ne pouvait pas tomber sur la moitié de son espace.
    expect(freeze).toBeDefined();
    expect(freeze.createdAt).toBeUndefined();
    expect(freeze.id).toEqual({ in: [] });
  });

  /**
   * Les trois gardes de `freezeMessageStatus` survivent au mode « ids » : une
   * liste ne permet pas de marquer reçu un message d'une autre conversation,
   * supprimé, ou émis par le participant lui-même. Elles tiennent dans les
   * deux modes, et le fichier le dit — ce témoin le prouve.
   */
  it('garde conversation, suppression et auto-envoi même en mode ids', async () => {
    const conv = oid('conv-guards');
    await service().markMessagesAsReceived(PARTICIPANT, conv, M2, { messageIds: [M1, M2] });

    const freeze = messageWheres.find((w) => w?.conversationId === conv && w?.senderId);
    expect(freeze).toMatchObject({
      conversationId: conv,
      deletedAt: null,
      senderId: { not: PARTICIPANT },
    });
  });
});
