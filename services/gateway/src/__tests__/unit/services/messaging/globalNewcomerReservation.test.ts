/**
 * Meeshy Global — le mode lent des nouveaux comptes tient sous des envois
 * SIMULTANÉS (#7740, relecture).
 *
 * La règle 4 lisait « ce compte a-t-il écrit dans les 30 dernières secondes ? »
 * alors que la ligne n'existe qu'après `saveMessage`, bien plus tard (détection
 * de langue comprise). Dix `message:send` dans le même tick lisaient tous
 * « rien » et passaient tous : ~60 messages/min au lieu de 2. La fenêtre se
 * RÉSERVE désormais atomiquement au moment de l'admission ; ces témoins font
 * courir plusieurs admissions en même temps, ce qu'aucun ne faisait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  admitConversationWriteFor,
  isConversationWriteRefused,
  type ConversationWriteAdmission
} from '../../../../services/messaging/conversationWriteAdmission';
import {
  cacheSendReservations,
  newcomerSendReservationKey,
  type ReservationCache
} from '../../../../services/messaging/newcomerSendReservations';

const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const SENDER = 'participant-newcomer';
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const hoursAgo = (hours: number) => new Date(NOW - hours * 3600 * 1000);

/** Le cache partagé, réduit à ce que la réservation emploie — `setnx` atomique comme Redis `SET NX`. */
function buildCache() {
  const entries = new Map<string, string>();
  const cache: ReservationCache = {
    setnx: jest.fn(async (key: string, value: string) => {
      if (entries.has(key)) return false;
      entries.set(key, value);
      return true;
    }),
    get: jest.fn(async (key: string) => entries.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      entries.delete(key);
    })
  };
  return { cache, entries };
}

/** Un expéditeur qui n'a encore RIEN persisté : c'est exactement l'état qu'une rafale lit. */
function buildReader(accountCreatedAt: Date) {
  return {
    participant: {
      findUnique: jest.fn<any>(async () => ({ role: 'member', user: { role: 'USER', createdAt: accountCreatedAt } }))
    },
    message: { findFirst: jest.fn<any>(async () => null) }
  };
}

const GLOBAL = {
  type: 'global',
  isActive: true,
  closedAt: null,
  isAnnouncementChannel: false,
  defaultWriteRole: 'everyone',
  slowModeSeconds: 0
} as const;

function admitter(accountCreatedAt: Date) {
  const { cache, entries } = buildCache();
  const reservations = cacheSendReservations(() => cache);
  const prisma = buildReader(accountCreatedAt);
  const admit = (params: { readonly sendId?: string; readonly now?: number } = {}) =>
    admitConversationWriteFor(prisma as never, {
      conversation: GLOBAL,
      conversationId: CONVERSATION_ID,
      senderParticipantId: SENDER,
      reservations,
      sendId: params.sendId,
      now: params.now ?? NOW
    });
  return { admit, cache, entries };
}

const releaseOf = (admission: ConversationWriteAdmission) => {
  if (isConversationWriteRefused(admission) || !admission.releaseReservation) throw new Error('réservation attendue');
  return admission.releaseReservation;
};

describe('Meeshy Global — mode lent des nouveaux comptes sous envois simultanés (#7740)', () => {
  it('n’admet qu’UN envoi sur dix lancés dans le même tick par un compte de 2 h', async () => {
    const { admit } = admitter(hoursAgo(2));

    const admissions = await Promise.all(
      Array.from({ length: 10 }, (_, i) => admit({ sendId: `send-${i}` }))
    );

    const refused = admissions.filter(isConversationWriteRefused);
    expect(admissions.length - refused.length).toBe(1);
    expect(refused).toHaveLength(9);
    refused.forEach((refusal) => {
      expect(refusal).toEqual({ admitted: false, reason: 'newcomer-slow-mode', retryAfterSeconds: 30 });
    });
  });

  it('chiffre l’attente depuis la réservation en cours, pas depuis la fenêtre entière', async () => {
    const { admit } = admitter(hoursAgo(2));
    await admit({ sendId: 'first' });

    const second = await admit({ sendId: 'second', now: NOW + 12_000 });

    expect(second).toEqual({ admitted: false, reason: 'newcomer-slow-mode', retryAfterSeconds: 18 });
  });

  it('rend la fenêtre quand l’envoi admis n’est finalement pas écrit', async () => {
    const { admit } = admitter(hoursAgo(2));
    const first = await admit({ sendId: 'first' });

    await releaseOf(first)();
    const retry = await admit({ sendId: 'retry' });

    expect(isConversationWriteRefused(retry)).toBe(false);
  });

  it('ne rend pas la fenêtre d’un AUTRE envoi : la libération ne vise que sa propre réservation', async () => {
    const { admit, entries } = admitter(hoursAgo(2));
    const first = await admit({ sendId: 'first' });
    entries.set(newcomerSendReservationKey(CONVERSATION_ID, SENDER), `${NOW + 31_000}|later`);

    await releaseOf(first)();

    expect(entries.get(newcomerSendReservationKey(CONVERSATION_ID, SENDER))).toBe(`${NOW + 31_000}|later`);
  });

  it('laisse passer le REJEU du même envoi (même clientMessageId), que la déduplication rattrapera', async () => {
    const { admit } = admitter(hoursAgo(2));

    const [original, replay] = await Promise.all([admit({ sendId: 'cmid-1' }), admit({ sendId: 'cmid-1' })]);

    expect(isConversationWriteRefused(original)).toBe(false);
    expect(isConversationWriteRefused(replay)).toBe(false);
  });

  it('réserve la fenêtre par conversation ET par expéditeur, pour la durée du mode lent', async () => {
    const { admit, cache } = admitter(hoursAgo(2));

    await admit({ sendId: 'first' });

    expect(cache.setnx).toHaveBeenCalledWith(
      newcomerSendReservationKey(CONVERSATION_ID, SENDER),
      expect.stringContaining('first'),
      30
    );
    expect(newcomerSendReservationKey(CONVERSATION_ID, SENDER)).toBe(
      `newcomer-slow:${CONVERSATION_ID}:${SENDER}`
    );
  });

  it('ne réserve rien pour un compte établi : la règle ne le concerne pas', async () => {
    const { admit, cache } = admitter(hoursAgo(25));

    const admissions = await Promise.all([admit({ sendId: 'a' }), admit({ sendId: 'b' })]);

    expect(admissions.every((a) => !isConversationWriteRefused(a))).toBe(true);
    expect(cache.setnx).not.toHaveBeenCalled();
  });
});
