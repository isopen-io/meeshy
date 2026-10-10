/**
 * Un mineur lit Global sans pouvoir y écrire (#9927) — RÈGLE 5 de
 * `conversationWriteAdmission`.
 *
 * Décision porteur 2026-10-10 : l'âge se demande à l'onboarding, facultatif.
 * De 13 à 17 ans révolus, Meeshy Global est en lecture seule ; la règle est
 * CALCULÉE depuis `User.birthDate` et tombe d'elle-même le jour des 18 ans.
 * Un âge non déclaré ne restreint rien, et aucune autre conversation n'est
 * touchée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  admitConversationWriteFor,
  describeConversationWriteRefusal,
  isConversationWriteRefused,
  writeRefusalHttpResponse
} from '../../../../services/messaging/conversationWriteAdmission';
import { cacheSendReservations } from '../../../../services/messaging/newcomerSendReservations';

const freshReservations = () => {
  const entries = new Map<string, string>();
  return cacheSendReservations(() => ({
    setnx: async (key: string, value: string) => (entries.has(key) ? false : (entries.set(key, value), true)),
    get: async (key: string) => entries.get(key) ?? null,
    del: async (key: string) => { entries.delete(key); }
  }));
};

const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const SENDER = 'participant-teen';
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ESTABLISHED = new Date(Date.UTC(2025, 0, 1));

type Sender = {
  readonly birthDate?: Date | null;
  readonly platformRole?: string | null;
  readonly participantRole?: string | null;
  readonly accountCreatedAt?: Date | null;
};

function buildReader(sender: Sender) {
  const findUnique = jest.fn(async (args: { select: { user: { select: Record<string, boolean> } } }) => ({
    role: sender.participantRole ?? 'member',
    user: {
      role: sender.platformRole ?? 'USER',
      createdAt: sender.accountCreatedAt ?? ESTABLISHED,
      ...(args.select.user.select.birthDate ? { birthDate: sender.birthDate ?? null } : {})
    }
  }));
  const findFirst = jest.fn(async () => null);
  return { participant: { findUnique }, message: { findFirst } };
}

const admit = (conversationType: string, sender: Sender) =>
  admitConversationWriteFor(buildReader(sender) as never, {
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
  });

describe('Meeshy Global — un mineur déclaré ne l’écrit pas (#9927)', () => {
  it('13 ans le jour même : refusé, motif minor-global', async () => {
    const admission = await admit('global', { birthDate: day('2013-10-10') });
    expect(isConversationWriteRefused(admission)).toBe(true);
    expect(isConversationWriteRefused(admission) && admission.reason).toBe('minor-global');
  });

  it('17 ans et 364 jours : refusé', async () => {
    const admission = await admit('global', { birthDate: day('2008-10-11') });
    expect(isConversationWriteRefused(admission) && admission.reason).toBe('minor-global');
  });

  it('18 ans le jour de l’anniversaire : admis', async () => {
    const admission = await admit('global', { birthDate: day('2008-10-10') });
    expect(admission.admitted).toBe(true);
  });

  it('âge non déclaré : admis', async () => {
    const admission = await admit('global', { birthDate: null });
    expect(admission.admitted).toBe(true);
  });

  it('le staff plateforme mineur n’existe pas : aucun rôle ne dispense de la règle', async () => {
    const admission = await admit('global', { birthDate: day('2010-01-01'), platformRole: 'ADMIN', participantRole: 'moderator' });
    expect(isConversationWriteRefused(admission) && admission.reason).toBe('minor-global');
  });

  it('le refus passe AVANT le mode lent des nouveaux comptes : un « jamais » ne s’annonce pas comme un « pas encore »', async () => {
    const admission = await admit('global', { birthDate: day('2011-05-05'), accountCreatedAt: new Date(NOW - 3600 * 1000) });
    expect(isConversationWriteRefused(admission) && admission.reason).toBe('minor-global');
    expect(isConversationWriteRefused(admission) && admission.retryAfterSeconds).toBeUndefined();
  });

  it.each(['group', 'direct', 'public'])('une conversation %s d’un mineur reste intacte', async (type) => {
    const admission = await admit(type, { birthDate: day('2011-05-05') });
    expect(admission.admitted).toBe(true);
  });

  it('dit le refus en mots lisibles et répond 403 GLOBAL_ADULTS_ONLY', async () => {
    const admission = await admit('global', { birthDate: day('2011-05-05') });
    if (!isConversationWriteRefused(admission)) throw new Error('admis à tort');
    expect(describeConversationWriteRefusal(admission)).toMatch(/18 ans/);
    expect(writeRefusalHttpResponse(admission)).toEqual({ status: 403, code: 'GLOBAL_ADULTS_ONLY' });
  });
});
