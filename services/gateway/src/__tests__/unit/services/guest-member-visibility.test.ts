/**
 * CE QU'UN INVITÉ NE VOIT PAS (#10205, directive porteur du 2026-10-11) :
 * « si on est pas utilisateur Meeshy, ne pas afficher le nombre de
 * participants ni les détails de la conversation, il ne faut pas permettre
 * d'afficher les profils utilisateurs non plus sauf les utilisateurs membres
 * de meeshy ».
 *
 * La loi qui reconnaît le lecteur sans compte, et ce qu'on lui sert des
 * membres : sa propre ligne, jamais celle des autres, jamais l'effectif.
 */

import { describe, it, expect } from '@jest/globals';

import {
  ACCOUNT_REQUIRED_CODE,
  isGuestViewer,
  membersServedToViewer,
  memberCountServedToViewer,
} from '../../../services/guests/guestMemberVisibility';

const registered = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: 'u1' } as const;
const guest = { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'p-guest', participantId: 'p-guest' } as const;
const nobody = { type: 'anonymous', isAuthenticated: false, isAnonymous: true, userId: 'anonymous' } as const;

describe('isGuestViewer', () => {
  it('un compte Meeshy n’est pas un invité', () => {
    expect(isGuestViewer(registered)).toBe(false);
  });

  it('une session d’invité par lien est un invité', () => {
    expect(isGuestViewer(guest)).toBe(true);
  });

  it('une requête sans session ni compte est un invité', () => {
    expect(isGuestViewer(nobody)).toBe(true);
  });

  it('un contexte absent ou incohérent échoue fermé', () => {
    expect(isGuestViewer(undefined)).toBe(true);
    expect(isGuestViewer(null)).toBe(true);
    expect(isGuestViewer({ type: 'user', isAuthenticated: false, isAnonymous: false })).toBe(true);
    expect(isGuestViewer({ type: 'user', isAuthenticated: true, isAnonymous: true })).toBe(true);
    expect(isGuestViewer({ type: 'bot', isAuthenticated: true, isAnonymous: false })).toBe(true);
    expect(isGuestViewer({ isAuthenticated: true, isAnonymous: false })).toBe(true);
    expect(isGuestViewer({ type: 'anonymous', isAuthenticated: true, isAnonymous: false, registeredUser: { id: 'u1' } })).toBe(true);
  });

  it('un contexte authentifié qui porte sa ligne User est un compte', () => {
    expect(isGuestViewer({ isAuthenticated: true, isAnonymous: false, registeredUser: { id: 'u1' } })).toBe(false);
  });
});

describe('membersServedToViewer', () => {
  const rows = [{ id: 'p-owner', userId: 'u-owner' }, { id: 'p-guest', userId: null }, { id: 'p-other', userId: null }];

  it('un compte reçoit la liste entière', () => {
    expect(membersServedToViewer(rows, registered)).toEqual(rows);
  });

  it('un invité ne reçoit que SA ligne', () => {
    expect(membersServedToViewer(rows, guest)).toEqual([{ id: 'p-guest', userId: null }]);
  });

  it('une requête sans session ne reçoit aucune ligne', () => {
    expect(membersServedToViewer(rows, nobody)).toEqual([]);
  });
});

describe('memberCountServedToViewer', () => {
  it('un compte reçoit l’effectif présenté', () => {
    expect(memberCountServedToViewer({ memberCount: 12 }, registered)).toEqual({ memberCount: 12 });
    expect(memberCountServedToViewer({ memberCount: 199, memberCountCapped: true }, registered)).toEqual({
      memberCount: 199,
      memberCountCapped: true,
    });
  });

  it('un invité ne reçoit AUCUNE clé d’effectif', () => {
    expect(memberCountServedToViewer({ memberCount: 12 }, guest)).toEqual({});
    expect(memberCountServedToViewer({ memberCount: 199, memberCountCapped: true }, nobody)).toEqual({});
  });
});

describe('ACCOUNT_REQUIRED_CODE', () => {
  it('est le code machine du refus servi à un invité', () => {
    expect(ACCOUNT_REQUIRED_CODE).toBe('ACCOUNT_REQUIRED');
  });
});
