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
import type { RelationLevel } from '@meeshy/shared/types/relation';
import {
  presenceStatusAudience,
  presenceStatusEmissions,
  TEAM_COLLEAGUES_WHERE,
} from '../../../socketio/presence-audience';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const SEEN_AT = new Date('2026-08-25T10:00:00.000Z');

const levels = (entries: Record<string, RelationLevel>): ReadonlyMap<string, RelationLevel> =>
  new Map(Object.entries(entries));

describe('presenceStatusAudience', () => {
  it('adresse les AMIS, les ADMIN+ et SOI — et aucune room de conversation', () => {
    const audience = presenceStatusAudience({
      subjectId: 'u_self',
      isAnonymous: false,
      friendLevels: levels({ u_friend: 'FRIEND' }),
      adminIds: ['u_admin'],
    });

    expect(audience.privilegedRooms).toEqual([ROOMS.user('u_admin'), ROOMS.user('u_self')]);
    expect(audience.friendRooms).toEqual([ROOMS.user('u_friend')]);
    const all = [...audience.privilegedRooms, ...audience.friendRooms, ...audience.closeRooms];
    expect(all.some((room) => room.startsWith('conversation:'))).toBe(false);
  });

  it("n'adresse PAS un co-participant qui n'est ni ami ni administrateur", () => {
    const audience = presenceStatusAudience({
      subjectId: 'u_self',
      isAnonymous: false,
      friendLevels: levels({}),
      adminIds: [],
    });

    const all = [...audience.privilegedRooms, ...audience.friendRooms, ...audience.closeRooms];
    expect(all).toEqual([ROOMS.user('u_self')]);
    expect(all).not.toContain(ROOMS.user('u_stranger'));
  });

  it('un invité de lien (anonyme) n\'a pas d\'amis : ADMIN+ SEULS, pas même lui-même', () => {
    const audience = presenceStatusAudience({
      subjectId: 'part_guest',
      isAnonymous: true,
      friendLevels: levels({ u_friend: 'FRIEND' }),
      adminIds: ['u_admin'],
    });

    expect(audience.privilegedRooms).toEqual([ROOMS.user('u_admin')]);
    expect(audience.friendRooms).toEqual([]);
    expect(audience.closeRooms).toEqual([]);
  });

  it('un ami QUI EST aussi administrateur ne compte qu\'une fois, du côté privilégié', () => {
    const audience = presenceStatusAudience({
      subjectId: 'u_self',
      isAnonymous: false,
      friendLevels: levels({ u_admin: 'FRIEND', u_friend: 'FRIEND' }),
      adminIds: ['u_admin'],
    });

    expect(audience.privilegedRooms).toEqual([ROOMS.user('u_admin'), ROOMS.user('u_self')]);
    expect(audience.friendRooms).toEqual([ROOMS.user('u_friend')]);
  });

  it("le sujet n'apparaît jamais deux fois, même s'il est lui-même administrateur", () => {
    const audience = presenceStatusAudience({
      subjectId: 'u_admin_self',
      isAnonymous: false,
      friendLevels: levels({ u_admin_self: 'FRIEND' }),
      adminIds: ['u_admin_self'],
    });

    expect(audience.privilegedRooms).toEqual([ROOMS.user('u_admin_self')]);
    expect(audience.friendRooms).toEqual([]);
  });
});

describe('presenceStatusEmissions — l\'équipe (#16623)', () => {
  const base = {
    subjectId: 'u_admin_subject',
    subjectRole: 'ADMIN',
    isAnonymous: false,
    friendLevels: levels({ u_friend: 'FRIEND' }),
    adminIds: ['u_admin'],
    moderatorIds: ['u_mod'],
    lastActiveAt: SEEN_AT,
    showOnlineStatus: true,
    showLastSeen: true,
  };

  it('un modérateur reçoit la transition d\'un collègue, avec la date d\'un Sang, sans lien', () => {
    expect(presenceStatusEmissions(base)).toEqual([
      { rooms: [ROOMS.user('u_admin'), ROOMS.user('u_admin_subject')], lastActiveAt: SEEN_AT },
      { rooms: [ROOMS.user('u_mod')], lastActiveAt: SEEN_AT },
      { rooms: [ROOMS.user('u_friend')], lastActiveAt: null },
    ]);
  });

  it('un lien réel d\'Ami ne rabat pas un collègue à « en ligne » seulement', () => {
    const emissions = presenceStatusEmissions({ ...base, friendLevels: levels({ u_mod: 'FRIEND' }) });
    expect(emissions).toContainEqual({ rooms: [ROOMS.user('u_mod')], lastActiveAt: SEEN_AT });
  });

  it('il suit les préférences du collègue : masqué, il ne reçoit rien ; sans dernière vue, pas de date', () => {
    const rooms = (over: Partial<typeof base>) => presenceStatusEmissions({ ...base, ...over }).flatMap((e) => e.rooms);
    expect(rooms({ showOnlineStatus: false })).not.toContain(ROOMS.user('u_mod'));
    expect(presenceStatusEmissions({ ...base, showLastSeen: false })).toContainEqual({
      rooms: [ROOMS.user('u_mod'), ROOMS.user('u_friend')],
      lastActiveAt: null,
    });
  });

  it.each(['ANALYST', 'AUDIT'])('la transition d\'un sujet %s part chez ses collègues', (subjectRole) => {
    const rooms = presenceStatusEmissions({ ...base, subjectRole }).flatMap((e) => e.rooms);
    expect(rooms).toContain(ROOMS.user('u_mod'));
  });

  it.each(['USER', 'AGENT', null, undefined])('la transition d\'un sujet %s ne part chez aucun modérateur', (subjectRole) => {
    const rooms = presenceStatusEmissions({ ...base, subjectRole }).flatMap((e) => e.rooms);
    expect(rooms).not.toContain(ROOMS.user('u_mod'));
  });

  it('la transition d\'un collègue mineur déclaré ne part chez aucun modérateur', () => {
    const rooms = presenceStatusEmissions({ ...base, subjectMinor: 'minor' }).flatMap((e) => e.rooms);
    expect(rooms).not.toContain(ROOMS.user('u_mod'));
    expect(rooms).toContain(ROOMS.user('u_admin'));
  });

  it('un invité de lien n\'a pas de collègues', () => {
    const rooms = presenceStatusEmissions({ ...base, isAnonymous: true }).flatMap((e) => e.rooms);
    expect(rooms).toEqual([ROOMS.user('u_admin')]);
  });
});

describe('presenceStatusEmissions', () => {
  const base = {
    subjectId: 'u_self',
    isAnonymous: false,
    friendLevels: levels({ u_friend: 'FRIEND', u_close: 'CLOSE', u_blood: 'BLOOD' }),
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
      { rooms: [ROOMS.user('u_close'), ROOMS.user('u_blood')], lastActiveAt: SEEN_AT },
      { rooms: [ROOMS.user('u_friend')], lastActiveAt: null },
    ]);
  });

  it("un AMI ne reçoit JAMAIS lastActiveAt : sa charge porte null même quand la cible l'autorise (#13928)", () => {
    const emissions = presenceStatusEmissions({ ...base, showOnlineStatus: true, showLastSeen: true });

    const friend = emissions.find((e) => e.rooms.includes(ROOMS.user('u_friend')));
    expect(friend?.lastActiveAt).toBeNull();
    const detailed = emissions.filter((e) => e.lastActiveAt !== null).flatMap((e) => e.rooms);
    expect(detailed).not.toContain(ROOMS.user('u_friend'));
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

  it('showLastSeen=false efface la dernière connexion pour les AMIS, PROCHES et SANG (une seule charge nulle) et la garde pour les privilégiés', () => {
    const emissions = presenceStatusEmissions({
      ...base,
      showOnlineStatus: true,
      showLastSeen: false,
    });

    expect(emissions).toEqual([
      { rooms: [ROOMS.user('u_admin'), ROOMS.user('u_self')], lastActiveAt: SEEN_AT },
      { rooms: [ROOMS.user('u_close'), ROOMS.user('u_blood'), ROOMS.user('u_friend')], lastActiveAt: null },
    ]);
  });

  it("n'émet rien du tout quand personne n'est autorisé (anonyme sans administrateur)", () => {
    expect(
      presenceStatusEmissions({
        subjectId: 'part_guest',
        isAnonymous: true,
        friendLevels: levels({ u_friend: 'FRIEND' }),
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
      friendLevels: levels({}),
      adminIds: [],
      lastActiveAt: null,
      showOnlineStatus: true,
      showLastSeen: true,
    });

    expect(emissions).toEqual([{ rooms: [ROOMS.user('u_self')], lastActiveAt: null }]);
  });
});

describe('TEAM_COLLEAGUES_WHERE — les collègues de l\'équipe destinataires de `user:status` (#16623)', () => {
  it('retient ANALYST, AUDIT et MODERATOR actifs, jamais un utilisateur ordinaire ni un administrateur (déjà servi)', () => {
    const comptes = [
      { id: 'analyst', role: 'ANALYST', isActive: true, deletedAt: null, deactivatedAt: null },
      { id: 'audit', role: 'AUDIT', isActive: true, deletedAt: null, deactivatedAt: null },
      { id: 'moderator', role: 'MODERATOR', isActive: true, deletedAt: null, deactivatedAt: null },
      { id: 'user', role: 'USER', isActive: true, deletedAt: null, deactivatedAt: null },
      { id: 'agent', role: 'AGENT', isActive: true, deletedAt: null, deactivatedAt: null },
      { id: 'bigboss', role: 'BIGBOSS', isActive: true, deletedAt: null, deactivatedAt: null },
    ];
    const retenus = comptes.filter((c) => matchesMongoWhere(c as unknown as MongoDocument, TEAM_COLLEAGUES_WHERE as unknown as MongoDocument));
    expect(retenus.map((c) => c.id)).toEqual(['analyst', 'audit', 'moderator']);
  });

  it('ne retient que les collègues actifs, ni supprimés ni désactivés', () => {
    const passe = new Date('2026-10-01T00:00:00Z');
    const comptes = [
      { id: 'actif', role: 'MODERATOR', isActive: true, deletedAt: null, deactivatedAt: null },
      { id: 'inactif', role: 'MODERATOR', isActive: false, deletedAt: null, deactivatedAt: null },
      { id: 'supprime', role: 'MODERATOR', isActive: true, deletedAt: passe, deactivatedAt: null },
      { id: 'desactive', role: 'MODERATOR', isActive: true, deletedAt: null, deactivatedAt: passe },
      { id: 'admin', role: 'ADMIN', isActive: true, deletedAt: null, deactivatedAt: null },
    ];
    const retenus = comptes.filter((c) => matchesMongoWhere(c as unknown as MongoDocument, TEAM_COLLEAGUES_WHERE as unknown as MongoDocument));
    expect(retenus.map((c) => c.id)).toEqual(['actif']);
  });
});
