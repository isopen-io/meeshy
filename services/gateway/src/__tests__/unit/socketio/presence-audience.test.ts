/**
 * L'audience de `user:status` — la loi de la directive produit du 2026-08-25,
 * rendue PURE et donc réfutable.
 *
 * « Lorsqu'on n'est pas ami (aucune connexion) : je veux supprimer ma présence
 * en ligne […] et personne ne doit savoir ma dernière connexion sur
 * l'application si on n'est pas ami. Les utilisateurs avec le rôle ADMIN et
 * supérieur peuvent constamment avoir l'état de présence. »
 *
 * Ce que ces témoins gardent, et qu'aucun témoin de rendu ne peut garder à leur
 * place : l'audience est faite d'AMIS, d'ADMINISTRATEURS et de SOI — jamais
 * d'une room de conversation. Partager un fil n'est pas une relation : le
 * co-participant inconnu était, jusqu'à ce lot, le destinataire NOMINAL de
 * chaque transition de présence.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import {
  presenceStatusAudience,
  presenceStatusEmissions,
} from '../../../socketio/presence-audience';

const SEEN_AT = new Date('2026-08-25T10:00:00.000Z');

describe('presenceStatusAudience', () => {
  it('adresse les AMIS, les ADMIN+ et SOI — et aucune room de conversation', () => {
    const audience = presenceStatusAudience({
      subjectId: 'u_self',
      isAnonymous: false,
      friendIds: ['u_friend'],
      adminIds: ['u_admin'],
    });

    expect(audience.privilegedRooms).toEqual([ROOMS.user('u_admin'), ROOMS.user('u_self')]);
    expect(audience.friendRooms).toEqual([ROOMS.user('u_friend')]);
    const all = [...audience.privilegedRooms, ...audience.friendRooms];
    expect(all.some((room) => room.startsWith('conversation:'))).toBe(false);
  });

  it("n'adresse PAS un co-participant qui n'est ni ami ni administrateur", () => {
    const audience = presenceStatusAudience({
      subjectId: 'u_self',
      isAnonymous: false,
      friendIds: [],
      adminIds: [],
    });

    const all = [...audience.privilegedRooms, ...audience.friendRooms];
    expect(all).toEqual([ROOMS.user('u_self')]);
    expect(all).not.toContain(ROOMS.user('u_stranger'));
  });

  it('un invité de lien (anonyme) n\'a pas d\'amis : ADMIN+ SEULS, pas même lui-même', () => {
    const audience = presenceStatusAudience({
      subjectId: 'part_guest',
      isAnonymous: true,
      friendIds: ['u_friend'],
      adminIds: ['u_admin'],
    });

    expect(audience.privilegedRooms).toEqual([ROOMS.user('u_admin')]);
    expect(audience.friendRooms).toEqual([]);
  });

  it('un ami QUI EST aussi administrateur ne compte qu\'une fois, du côté privilégié', () => {
    const audience = presenceStatusAudience({
      subjectId: 'u_self',
      isAnonymous: false,
      friendIds: ['u_admin', 'u_friend'],
      adminIds: ['u_admin'],
    });

    expect(audience.privilegedRooms).toEqual([ROOMS.user('u_admin'), ROOMS.user('u_self')]);
    expect(audience.friendRooms).toEqual([ROOMS.user('u_friend')]);
  });

  it("le sujet n'apparaît jamais deux fois, même s'il est lui-même administrateur", () => {
    const audience = presenceStatusAudience({
      subjectId: 'u_admin_self',
      isAnonymous: false,
      friendIds: ['u_admin_self'],
      adminIds: ['u_admin_self'],
    });

    expect(audience.privilegedRooms).toEqual([ROOMS.user('u_admin_self')]);
    expect(audience.friendRooms).toEqual([]);
  });
});

describe('presenceStatusEmissions', () => {
  const base = {
    subjectId: 'u_self',
    isAnonymous: false,
    friendIds: ['u_friend'],
    adminIds: ['u_admin'],
    lastActiveAt: SEEN_AT,
  };

  it('sert la charge COMPLÈTE aux privilégiés et la charge des préférences aux amis', () => {
    const emissions = presenceStatusEmissions({
      ...base,
      showOnlineStatus: true,
      showLastSeen: true,
    });

    expect(emissions).toEqual([
      { rooms: [ROOMS.user('u_admin'), ROOMS.user('u_self')], lastActiveAt: SEEN_AT },
      { rooms: [ROOMS.user('u_friend')], lastActiveAt: SEEN_AT },
    ]);
  });

  it('showOnlineStatus=false coupe les AMIS — jamais les ADMIN+ ni les autres appareils', () => {
    const emissions = presenceStatusEmissions({
      ...base,
      showOnlineStatus: false,
      showLastSeen: true,
    });

    expect(emissions).toEqual([
      { rooms: [ROOMS.user('u_admin'), ROOMS.user('u_self')], lastActiveAt: SEEN_AT },
    ]);
  });

  it('showLastSeen=false efface la dernière connexion pour les AMIS et la garde pour les privilégiés', () => {
    const emissions = presenceStatusEmissions({
      ...base,
      showOnlineStatus: true,
      showLastSeen: false,
    });

    expect(emissions).toEqual([
      { rooms: [ROOMS.user('u_admin'), ROOMS.user('u_self')], lastActiveAt: SEEN_AT },
      { rooms: [ROOMS.user('u_friend')], lastActiveAt: null },
    ]);
  });

  it("n'émet rien du tout quand personne n'est autorisé (anonyme sans administrateur)", () => {
    expect(
      presenceStatusEmissions({
        subjectId: 'part_guest',
        isAnonymous: true,
        friendIds: ['u_friend'],
        adminIds: [],
        lastActiveAt: SEEN_AT,
        showOnlineStatus: true,
        showLastSeen: true,
      }),
    ).toEqual([]);
  });

  it('ne fabrique pas de charge pour un sous-ensemble vide', () => {
    const emissions = presenceStatusEmissions({
      subjectId: 'u_self',
      isAnonymous: false,
      friendIds: [],
      adminIds: [],
      lastActiveAt: null,
      showOnlineStatus: true,
      showLastSeen: true,
    });

    expect(emissions).toEqual([{ rooms: [ROOMS.user('u_self')], lastActiveAt: null }]);
  });
});
