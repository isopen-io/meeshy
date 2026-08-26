/**
 * Unit tests for the pure helpers of the presence gate :
 * - viewerFromAuthContext — mapping from authContext to the presence viewer ;
 * - presenceMissingEntryPolicy / presenceFor — the ONE fallback for an entry
 *   ABSENT from the `resolveForTargets` map (accountless target, or an
 *   unresolved registered id) : hidden, unless the viewer is ADMIN/BIGBOSS.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import type { PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceViewer } from '../../services/PresenceVisibilityService';
import { presenceFor, presenceMissingEntryPolicy, viewerFromAuthContext } from '../../routes/users/presence-gate';

const viewerOf = (role: GlobalUserRoleType): PresenceViewer => ({ userId: 'viewer', role });
const PRIVILEGED: readonly GlobalUserRoleType[] = ['ADMIN', 'BIGBOSS'];
const ORDINARY: readonly GlobalUserRoleType[] = ['MODERATOR', 'AUDIT', 'ANALYST', 'USER', 'AGENT'];

describe('viewerFromAuthContext', () => {
  it('maps a registered user with a role to a viewer', () => {
    expect(
      viewerFromAuthContext({ type: 'user', userId: 'u1', registeredUser: { role: 'MODERATOR' } }),
    ).toEqual({ userId: 'u1', role: 'MODERATOR' });
  });

  it('returns null for an anonymous context', () => {
    expect(viewerFromAuthContext({ type: 'anonymous', userId: 'sess' })).toBeNull();
  });

  it('returns null when there is no auth context', () => {
    expect(viewerFromAuthContext(undefined)).toBeNull();
  });

  it('returns null for a registered context without a role', () => {
    expect(viewerFromAuthContext({ type: 'user', userId: 'u1', registeredUser: null })).toBeNull();
  });
});

// Le résolveur rend UNE entrée par id passé ; une entrée absente désigne une
// cible SANS COMPTE (participant anonyme, pas de `userId`) ou une anomalie (id
// inscrit non résolu). Les deux reçoivent la MÊME réponse — c'est le site
// unique que trois copies divergentes (core / participants / messages)
// remplaçaient : masquée, sauf pour un viewer ADMIN/BIGBOSS.
describe('presenceMissingEntryPolicy', () => {
  it.each(PRIVILEGED)('%s ⇒ reveal', (role) => {
    expect(presenceMissingEntryPolicy(viewerOf(role))).toBe('reveal');
  });

  it.each(ORDINARY)('%s ⇒ hide — un rang ordinaire, MODERATOR compris', (role) => {
    expect(presenceMissingEntryPolicy(viewerOf(role))).toBe('hide');
  });

  it('viewer absent (anonyme / non authentifié) ⇒ hide', () => {
    expect(presenceMissingEntryPolicy(null)).toBe('hide');
  });
});

describe('presenceFor', () => {
  const FRIEND_ENTRY: PresenceVisibility = { showOnline: true, showLastSeenTimestamp: false };
  const HIDDEN: PresenceVisibility = { showOnline: false, showLastSeenTimestamp: false };
  const REVEALED: PresenceVisibility = { showOnline: true, showLastSeenTimestamp: true };
  const map = new Map<string, PresenceVisibility>([['friend', FRIEND_ENTRY]]);

  it("rend l'entrée de la carte telle quelle quand elle existe — la loi a déjà parlé", () => {
    expect(presenceFor(viewerOf('USER'), map, 'friend')).toEqual(FRIEND_ENTRY);
  });

  it('cible sans compte (userId null) ⇒ masquée pour un USER', () => {
    expect(presenceFor(viewerOf('USER'), map, null)).toEqual(HIDDEN);
  });

  it('id inscrit ABSENT de la carte ⇒ masqué pour un USER — jamais `undefined`', () => {
    expect(presenceFor(viewerOf('USER'), map, 'stranger')).toEqual(HIDDEN);
  });

  it('id inscrit ABSENT de la carte ⇒ révélé à un ADMIN, comme une cible sans compte', () => {
    expect(presenceFor(viewerOf('ADMIN'), map, 'stranger')).toEqual(REVEALED);
    expect(presenceFor(viewerOf('ADMIN'), map, null)).toEqual(REVEALED);
  });

  it('viewer absent ⇒ masqué, carte vide ou non', () => {
    expect(presenceFor(null, map, 'stranger')).toEqual(HIDDEN);
    expect(presenceFor(null, new Map(), null)).toEqual(HIDDEN);
  });

  // Les deux expressions du repli — la politique remise au helper partagé
  // (`onMissingEntry`) et la visibilité rendue aux sites qui lisent les deux
  // drapeaux — sont UNE règle : elles doivent dire la même chose à chaque rang.
  it.each([...PRIVILEGED, ...ORDINARY])('le repli de presenceFor et presenceMissingEntryPolicy concordent pour %s', (role) => {
    const viewer = viewerOf(role);
    const fallback = presenceFor(viewer, new Map(), null);
    const revealed = presenceMissingEntryPolicy(viewer) === 'reveal';
    expect(fallback).toEqual(revealed ? REVEALED : HIDDEN);
  });
});
