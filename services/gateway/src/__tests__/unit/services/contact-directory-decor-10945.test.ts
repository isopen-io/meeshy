/**
 * #10945 — un contact RAPPROCHÉ (carnet d'adresses → compte Meeshy) porte son
 * contour équipé : `toPublicProfile`, le site unique de sortie du profil
 * rapproché, le résout en `profileDecor` depuis la colonne lue dans le même
 * `select` ; le schéma `matchedUserSchema` le déclare. Jamais la colonne brute.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { ContactDirectoryService } from '../../../services/ContactDirectoryService';
import { matchedUserSchema } from '../../../routes/users/contacts-schemas';
import { normalizeContacts } from '../../../utils/contact-identifiers';

const RING = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };
const OWNER = '507f1f77bcf86cd799439011';

const user = (equippedAvatarRing: string | null) => ({
  id: '507f1f77bcf86cd799439022', username: 'awa', firstName: 'Awa', lastName: 'D', displayName: 'Awa', avatar: null,
  isOnline: true, lastActiveAt: null, phoneNumber: '+221771234567', email: 'awa@test.com', equippedAvatarRing,
});

const prismaWith = (users: unknown[]) => ({
  userPreferences: { findMany: jest.fn<any>(async () => []) },
  userPreference: { findMany: jest.fn<any>(async () => []) },
  user: {
    findMany: jest.fn<any>(async (args: any) => (args?.where?.blockedUserIds ? [] : users)),
    findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
  },
  userContact: { findMany: jest.fn<any>(async () => []) },
}) as any;

const matched = async (equippedAvatarRing: string | null) => {
  const prisma = prismaWith([user(equippedAvatarRing)]);
  const contacts = normalizeContacts([{ phoneNumbers: ['+221771234567'] }]);
  const match = (await new ContactDirectoryService(prisma).match({ contacts, excludeUserId: OWNER })).get(contacts[0]!.contactKey);
  return { prisma, profile: match?.user as unknown as Record<string, unknown> };
};

describe('#10945 — le profil rapproché porte son contour', () => {
  it('sert profileDecor et jamais la colonne', async () => {
    const { profile } = await matched('contours-essentiels/filet');
    expect(profile.profileDecor).toEqual({ avatarRing: RING });
    expect(JSON.stringify(profile)).not.toContain('equippedAvatarRing');
  });

  it('aucune clé sans contour', async () => {
    const { profile } = await matched(null);
    expect(profile).not.toHaveProperty('profileDecor');
  });

  it('la colonne vient des deux select du carnet', async () => {
    const { prisma } = await matched('contours-essentiels/filet');
    const candidates = (prisma.user.findMany.mock.calls as any[]).filter((c) => !c[0]?.where?.blockedUserIds).at(-1)![0];
    expect(candidates.select).toMatchObject({ equippedAvatarRing: true });
    await new ContactDirectoryService(prisma).page({ ownerId: OWNER, viewer: { userId: OWNER, role: 'USER' } as never, limit: 10 });
    expect(prisma.userContact.findMany.mock.calls[0][0].select.matchedUser.select).toMatchObject({ equippedAvatarRing: true });
  });

  it('le schéma du profil rapproché déclare profileDecor', () => {
    const out = JSON.parse(fastJsonStringify(matchedUserSchema as never)({ id: 'u', username: 'awa', profileDecor: { avatarRing: RING } }));
    expect(out.profileDecor).toEqual({ avatarRing: RING });
  });
});
