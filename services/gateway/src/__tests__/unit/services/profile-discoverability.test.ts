/**
 * « Ne pas être trouvé » est UNE loi (#8104).
 *
 * `hideProfileFromSearch` était écrit par les trois clients, relu par l'écran
 * Confidentialité, et lu par AUCUNE porte de la passerelle : un compte qui
 * demandait à ne pas être trouvé l'était par numéro, par e-mail, par carnet et
 * par nom. `undiscoverableAmong` est la loi unique que toutes ces portes
 * appellent : caché ⇒ introuvable, sauf pour soi-même et ses amis ACCEPTÉS.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

import {
  undiscoverableAmong,
  isDiscoverableBy,
} from '../../../services/profile-discoverability';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

const MOI = '507f1f77bcf86cd799439011';
const CACHE = '507f1f77bcf86cd799439022';
const PUBLIC = '507f1f77bcf86cd799439033';
const AMI_CACHE = '507f1f77bcf86cd799439044';

function prismaDouble(options: {
  hiding?: readonly string[];
  friendsOfMe?: readonly string[];
  preferencesFail?: boolean;
} = {}) {
  const { hiding = [], friendsOfMe = [], preferencesFail = false } = options;
  return {
    userPreferences: {
      findMany: jest.fn<any>(async (args: any) => {
        if (preferencesFail) throw new Error('mongo indisponible');
        const ids: string[] = args.where.userId.in;
        return ids.map((userId) => ({ userId, privacy: { hideProfileFromSearch: hiding.includes(userId) } }));
      }),
    },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    friendRequest: {
      findMany: jest.fn<any>(async () =>
        friendsOfMe.map((id) => ({ senderId: MOI, receiverId: id }))
      ),
    },
  } as any;
}

beforeEach(() => clearPrivacyPreferencesCache());

describe('isDiscoverableBy — la loi pure', () => {
  it('un compte qui se cache est introuvable pour un inconnu', () => {
    expect(isDiscoverableBy({ hidesFromSearch: true, isSelf: false, areFriends: false })).toBe(false);
  });

  it('il reste trouvable par soi-même et par ses amis acceptés', () => {
    expect(isDiscoverableBy({ hidesFromSearch: true, isSelf: true, areFriends: false })).toBe(true);
    expect(isDiscoverableBy({ hidesFromSearch: true, isSelf: false, areFriends: true })).toBe(true);
  });

  it('un compte qui ne se cache pas est trouvable par tous', () => {
    expect(isDiscoverableBy({ hidesFromSearch: false, isSelf: false, areFriends: false })).toBe(true);
  });
});

describe('undiscoverableAmong — la loi appliquée à des candidats', () => {
  it('écarte un compte caché, garde un compte public', async () => {
    const prisma = prismaDouble({ hiding: [CACHE] });

    const caches = await undiscoverableAmong(prisma, MOI, [CACHE, PUBLIC]);

    expect([...caches]).toEqual([CACHE]);
  });

  it('un ami ACCEPTÉ qui se cache reste trouvable', async () => {
    const prisma = prismaDouble({ hiding: [CACHE, AMI_CACHE], friendsOfMe: [AMI_CACHE] });

    const caches = await undiscoverableAmong(prisma, MOI, [CACHE, AMI_CACHE]);

    expect([...caches]).toEqual([CACHE]);
    const amitie = prisma.friendRequest.findMany.mock.calls[0][0];
    expect(amitie.where.status).toBe('accepted');
  });

  it('soi-même n’est jamais écarté', async () => {
    const prisma = prismaDouble({ hiding: [MOI] });

    expect((await undiscoverableAmong(prisma, MOI, [MOI])).size).toBe(0);
  });

  it('un lecteur anonyme n’a pas d’amis : tout compte caché lui échappe', async () => {
    const prisma = prismaDouble({ hiding: [CACHE] });

    const caches = await undiscoverableAmong(prisma, '', [CACHE, PUBLIC]);

    expect([...caches]).toEqual([CACHE]);
    expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
  });

  it('personne ne se cache ⇒ aucune question d’amitié posée', async () => {
    const prisma = prismaDouble();

    await undiscoverableAmong(prisma, MOI, [CACHE, PUBLIC]);

    expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
  });

  it('FAIL-CLOSED : préférences illisibles ⇒ tous les autres candidats sont écartés', async () => {
    const prisma = prismaDouble({ preferencesFail: true });

    const caches = await undiscoverableAmong(prisma, MOI, [MOI, CACHE, PUBLIC]);

    expect([...caches].sort()).toEqual([CACHE, PUBLIC].sort());
  });

  it('lit le réglage là où l’application l’ÉCRIT : le document UserPreferences.privacy', async () => {
    const prisma = prismaDouble({ hiding: [CACHE] });

    await undiscoverableAmong(prisma, MOI, [CACHE]);

    expect(prisma.userPreferences.findMany).toHaveBeenCalled();
  });
});
