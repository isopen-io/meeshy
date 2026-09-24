/**
 * Meeshy Global tient une vague d'arrivées (#7740) — le MODE LENT DES
 * NOUVEAUX COMPTES.
 *
 * Tout compte neuf entre dans le salon global, et la campagne l'y invite à
 * saluer. Aucun plafond n'existait par compte : un compte créé à l'instant
 * pouvait inonder le salon au rythme de son client. La règle : dans la
 * conversation GLOBALE, un compte de moins de 24 h n'écrit qu'un message
 * toutes les 30 s. Les comptes établis, les modérateurs du salon et le staff
 * plateforme ne la subissent pas, et aucune autre conversation n'est touchée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  admitConversationWriteFor,
  describeConversationWriteRefusal,
  isConversationWriteRefused,
  GLOBAL_NEWCOMER_SLOW_MODE_SECONDS,
  GLOBAL_NEWCOMER_WINDOW_HOURS
} from '../../../../services/messaging/conversationWriteAdmission';
import { cacheSendReservations } from '../../../../services/messaging/newcomerSendReservations';

/** Une réservation neuve par admission : ces témoins portent sur la LECTURE de la base (cf. `globalNewcomerReservation.test.ts`). */
const freshReservations = () => {
  const entries = new Map<string, string>();
  return cacheSendReservations(() => ({
    setnx: async (key: string, value: string) => (entries.has(key) ? false : (entries.set(key, value), true)),
    get: async (key: string) => entries.get(key) ?? null,
    del: async (key: string) => { entries.delete(key); }
  }));
};

const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const SENDER = 'participant-newcomer';
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const secondsAgo = (seconds: number) => new Date(NOW - seconds * 1000);
const hoursAgo = (hours: number) => new Date(NOW - hours * 3600 * 1000);

type Sender = {
  readonly participantRole?: string | null;
  readonly platformRole?: string | null;
  readonly accountCreatedAt?: Date | null;
  readonly lastUserMessageAt?: Date | null;
};

function buildReader(sender: Sender) {
  const findUnique = jest.fn<any>(async () => ({
    role: sender.participantRole ?? 'member',
    user: {
      role: sender.platformRole ?? 'USER',
      createdAt: sender.accountCreatedAt ?? null
    }
  }));
  const findFirst = jest.fn<any>(async (args: any) => {
    const last = sender.lastUserMessageAt;
    if (!last) return null;
    const after = args?.where?.createdAt?.gt as Date | undefined;
    if (after && last.getTime() <= after.getTime()) return null;
    return { createdAt: last };
  });
  return { participant: { findUnique }, message: { findFirst } };
}

const admit = (conversationType: string, sender: Sender) => {
  const prisma = buildReader(sender);
  return {
    prisma,
    result: admitConversationWriteFor(prisma as never, {
      conversation: {
        type: conversationType,
        isActive: true,
        closedAt: null,
        isAnnouncementChannel: false,
        defaultWriteRole: 'everyone',
        slowModeSeconds: 0
      },
      conversationId: CONVERSATION_ID,
      senderParticipantId: SENDER,
      reservations: freshReservations(),
      now: NOW
    })
  };
};

describe('Meeshy Global — mode lent des nouveaux comptes (#7740)', () => {
  it('fixe la règle à un message toutes les 30 s pendant les 24 premières heures', () => {
    expect(GLOBAL_NEWCOMER_SLOW_MODE_SECONDS).toBe(30);
    expect(GLOBAL_NEWCOMER_WINDOW_HOURS).toBe(24);
  });

  it('refuse un second message d’un compte de 2 h envoyé 10 s après le premier, avec 20 s à attendre', async () => {
    const { result } = admit('global', { accountCreatedAt: hoursAgo(2), lastUserMessageAt: secondsAgo(10) });

    expect(await result).toEqual({
      admitted: false,
      reason: 'newcomer-slow-mode',
      retryAfterSeconds: 20
    });
  });

  it('admet le premier message d’un compte neuf', async () => {
    const { result } = admit('global', { accountCreatedAt: hoursAgo(1), lastUserMessageAt: null });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it('admet un compte neuf dont le dernier message a plus de 30 s', async () => {
    const { result } = admit('global', { accountCreatedAt: hoursAgo(1), lastUserMessageAt: secondsAgo(31) });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it('cherche le dernier envoi dans une fenêtre de 30 s, et seulement parmi ce que l’utilisateur a tapé', async () => {
    const { prisma, result } = admit('global', { accountCreatedAt: hoursAgo(1), lastUserMessageAt: secondsAgo(3) });
    await result;

    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: CONVERSATION_ID,
          senderId: SENDER,
          messageSource: 'user',
          createdAt: { gt: secondsAgo(30) }
        })
      })
    );
  });

  it('ne ralentit plus un compte qui a dépassé ses 24 premières heures', async () => {
    const { prisma, result } = admit('global', { accountCreatedAt: hoursAgo(25), lastUserMessageAt: secondsAgo(2) });

    expect(isConversationWriteRefused(await result)).toBe(false);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('n’invente pas un compte neuf quand la date de création est inconnue', async () => {
    const { result } = admit('global', { accountCreatedAt: null, lastUserMessageAt: secondsAgo(2) });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it.each(['ADMIN', 'BIGBOSS', 'MODERATOR'])('dispense le staff plateforme %s, même au compte neuf', async (platformRole) => {
    const { result } = admit('global', {
      platformRole,
      accountCreatedAt: hoursAgo(1),
      lastUserMessageAt: secondsAgo(2)
    });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it.each(['moderator', 'admin', 'creator'])('dispense un %s du salon global', async (participantRole) => {
    const { result } = admit('global', {
      participantRole,
      accountCreatedAt: hoursAgo(1),
      lastUserMessageAt: secondsAgo(2)
    });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it.each(['group', 'direct', 'public', 'community'])(
    'ne touche aucune autre conversation (%s) qu’un compte neuf rejoint',
    async (conversationType) => {
      const { result } = admit(conversationType, {
        accountCreatedAt: hoursAgo(1),
        lastUserMessageAt: secondsAgo(2)
      });

      expect(isConversationWriteRefused(await result)).toBe(false);
    }
  );

  it('dit à l’expéditeur combien de secondes attendre', async () => {
    const refusal = await admit('global', { accountCreatedAt: hoursAgo(1), lastUserMessageAt: secondsAgo(12) }).result;
    if (!isConversationWriteRefused(refusal)) throw new Error('refus attendu');

    expect(describeConversationWriteRefusal(refusal)).toMatch(/18 s/);
  });
});
