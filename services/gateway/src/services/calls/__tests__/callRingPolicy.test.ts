/**
 * « Appels hors contacts » (#8073) — qui a le droit de faire SONNER qui.
 *
 * Réglage coupé : un non-contact ne fait plus sonner, un ami si. La garde est
 * fail-closed : une lecture qui échoue ne fait sonner personne de gardé.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import {
  assertDirectCalleeReachable,
  partitionRingableCallees,
} from '../callRingPolicy';
import { clearPrivacyPreferencesCache } from '../../preferences/privacy-cache';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../../../config/user-preferences-defaults';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const CALLER = '507f1f77bcf86cd799439001';
const FRIEND = '507f1f77bcf86cd799439002';
const STRANGER = '507f1f77bcf86cd799439003';
const OPEN_DOOR = '507f1f77bcf86cd799439004';
const SILENT = '507f1f77bcf86cd799439005';

type PrivacyDoc = { userId: string; privacy: Record<string, unknown> };

const fakePrisma = (opts: {
  documents?: ReadonlyArray<PrivacyDoc>;
  friendsOfCaller?: ReadonlyArray<string>;
  members?: ReadonlyArray<string>;
  failFriendship?: boolean;
}) => {
  const friendRequestFindMany = jest.fn(async () => {
    if (opts.failFriendship) throw new Error('db down');
    return (opts.friendsOfCaller ?? []).map((id) => ({ senderId: CALLER, receiverId: id }));
  });
  return {
    userPreferences: { findMany: jest.fn(async () => opts.documents ?? []) },
    userPreference: { findMany: jest.fn(async () => []) },
    friendRequest: { findMany: friendRequestFindMany },
    participant: {
      findMany: jest.fn(async () => (opts.members ?? []).map((userId) => ({ userId }))),
    },
  };
};

const refusing = (userId: string): PrivacyDoc => ({ userId, privacy: { allowCallsFromNonContacts: false } });
const allowing = (userId: string): PrivacyDoc => ({ userId, privacy: { allowCallsFromNonContacts: true } });

describe('partitionRingableCallees', () => {
  beforeEach(() => clearPrivacyPreferencesCache());

  it("ne fait pas sonner un non-contact qui a coupé le réglage", async () => {
    const prisma = fakePrisma({ documents: [refusing(STRANGER)] });

    const result = await partitionRingableCallees(prisma as never, {
      callerUserId: CALLER,
      calleeUserIds: [STRANGER],
    });

    expect(result).toEqual({ ringable: [], refused: [STRANGER] });
  });

  it('fait sonner un ami accepté malgré le réglage coupé', async () => {
    const prisma = fakePrisma({ documents: [refusing(FRIEND)], friendsOfCaller: [FRIEND] });

    const result = await partitionRingableCallees(prisma as never, {
      callerUserId: CALLER,
      calleeUserIds: [FRIEND],
    });

    expect(result).toEqual({ ringable: [FRIEND], refused: [] });
  });

  it('fait sonner tout le monde quand le réglage est ouvert, sans lire les amitiés', async () => {
    const prisma = fakePrisma({ documents: [allowing(OPEN_DOOR)] });

    const result = await partitionRingableCallees(prisma as never, {
      callerUserId: CALLER,
      calleeUserIds: [OPEN_DOOR],
    });

    expect(result).toEqual({ ringable: [OPEN_DOOR], refused: [] });
    expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
  });

  it("applique le défaut produit quand la préférence est absente", async () => {
    const prisma = fakePrisma({ documents: [] });

    const result = await partitionRingableCallees(prisma as never, {
      callerUserId: CALLER,
      calleeUserIds: [SILENT],
    });

    const expected = PRIVACY_PREFERENCES_DEFAULTS.allowCallsFromNonContacts
      ? { ringable: [SILENT], refused: [] }
      : { ringable: [], refused: [SILENT] };
    expect(result).toEqual(expected);
  });

  it('partage un groupe : seuls les non-contacts gardés sont retirés', async () => {
    const prisma = fakePrisma({
      documents: [refusing(FRIEND), refusing(STRANGER), allowing(OPEN_DOOR)],
      friendsOfCaller: [FRIEND],
    });

    const result = await partitionRingableCallees(prisma as never, {
      callerUserId: CALLER,
      calleeUserIds: [CALLER, FRIEND, STRANGER, OPEN_DOOR],
    });

    expect(result).toEqual({ ringable: [FRIEND, OPEN_DOOR], refused: [STRANGER] });
  });

  it('refuse tous les gardés quand la lecture des amitiés échoue (fail-closed)', async () => {
    const prisma = fakePrisma({
      documents: [refusing(FRIEND), allowing(OPEN_DOOR)],
      friendsOfCaller: [FRIEND],
      failFriendship: true,
    });

    const result = await partitionRingableCallees(prisma as never, {
      callerUserId: CALLER,
      calleeUserIds: [FRIEND, OPEN_DOOR],
    });

    expect(result).toEqual({ ringable: [], refused: [FRIEND, OPEN_DOOR] });
  });
});

describe('assertDirectCalleeReachable', () => {
  beforeEach(() => clearPrivacyPreferencesCache());

  it("rejette avec CALLEE_REFUSES_NON_CONTACTS quand l'interlocuteur refuse", async () => {
    const prisma = fakePrisma({ documents: [refusing(STRANGER)], members: [CALLER, STRANGER] });

    await expect(
      assertDirectCalleeReachable(prisma as never, { conversationId: 'conv', callerUserId: CALLER }),
    ).rejects.toThrow(`${CALL_ERROR_CODES.CALLEE_REFUSES_NON_CONTACTS}:`);
  });

  it('laisse passer un ami', async () => {
    const prisma = fakePrisma({ documents: [refusing(FRIEND)], members: [CALLER, FRIEND], friendsOfCaller: [FRIEND] });

    await expect(
      assertDirectCalleeReachable(prisma as never, { conversationId: 'conv', callerUserId: CALLER }),
    ).resolves.toBeUndefined();
  });
});
