/**
 * #14107 (audit M2) — l'expéditeur d'une demande de message en attente ne fait pas
 * sonner son destinataire, même quand celui-ci accepte les appels hors contacts ;
 * le destinataire, lui, peut l'appeler.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { assertDirectCalleeReachable } from '../../../../services/calls/callRingPolicy';
import { openCallRingTables } from '../../../helpers/call-ring-policy-tables';
import { clearPrivacyPreferencesCache } from '../../../../services/preferences/privacy-cache';

jest.mock('../../../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const EXPEDITEUR = '6900000000000000000000a1';
const DESTINATAIRE = '6900000000000000000000a2';
const CONV = '6900000000000000000000d1';

const prisma = () => {
  clearPrivacyPreferencesCache();
  return {
    ...openCallRingTables(),
    participant: {
      findMany: jest.fn(async () => [
        { userId: EXPEDITEUR, messageRequestAt: null },
        { userId: DESTINATAIRE, messageRequestAt: new Date('2026-11-02T08:00:00Z') },
      ]),
    },
  } as never;
};

describe('assertDirectCalleeReachable — une demande en attente ne sonne pas', () => {
  it('refuse l\'appel de l\'expéditeur avec le code d\'un non-contact', async () => {
    await expect(assertDirectCalleeReachable(prisma(), { conversationId: CONV, callerUserId: EXPEDITEUR })).rejects.toThrow('CALLEE_REFUSES_NON_CONTACTS');
  });

  it('laisse le destinataire appeler', async () => {
    await expect(assertDirectCalleeReachable(prisma(), { conversationId: CONV, callerUserId: DESTINATAIRE })).resolves.toBeUndefined();
  });
});
