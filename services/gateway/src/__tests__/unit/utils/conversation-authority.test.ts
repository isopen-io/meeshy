import { describe, it, expect } from '@jest/globals';
import {
  actorRoleLevel,
  actorHasMinimumRole,
  actsWithCreatorRights,
  effectiveConversationRole,
} from '../../../utils/conversation-authority';

/**
 * **L'autorité d'un acteur DANS une conversation** (issue #3941).
 *
 * Décision porteur du 2026-08-27, en tranchant #3892 : « un administrateur ou
 * grand boss, de la plateforme, une fois dans n'importe quelle conversation, a
 * toute la visibilité de la conversation et peut agir avec les droits du
 * créateur de la conversation ».
 *
 * Trois mots de cette phrase gouvernent la loi :
 *
 * - **« une fois dans »** — le bypass suppose une APPARTENANCE. On ne le
 *   confond pas avec un passe-partout : chaque route continue de charger la
 *   ligne de participation de l'appelant avant de consulter cette loi.
 * - **« avec les droits DU CRÉATEUR »** — au niveau du créateur, jamais
 *   au-dessus. Un administrateur de la plateforme n'hérite donc pas d'un rang
 *   qui lui permettrait de bannir ou de rétrograder le créateur : la règle
 *   « rang strictement supérieur » continue de les départager, dans les deux
 *   sens. C'est la lecture CONSERVATRICE, et elle est explicite parce que
 *   `getEffectiveRole` (échelle unifiée du paquet partagé) rendrait l'inverse :
 *   elle place ADMIN (80) AU-DESSUS de CREATOR (70).
 * - **« de la plateforme »** — ADMIN et BIGBOSS seulement. MODERATOR, AUDIT et
 *   ANALYST sont des utilisateurs ordinaires dans une conversation, comme le
 *   dit déjà la loi de visibilité de la présence.
 */
describe('L’autorité d’un acteur dans une conversation (#3941)', () => {
  describe('actsWithCreatorRights', () => {
    it.each(['ADMIN', 'BIGBOSS'])('%s de la plateforme agit avec les droits du créateur', (platformRole) => {
      expect(actsWithCreatorRights({ conversationRole: 'member', platformRole })).toBe(true);
    });

    it.each(['USER', 'MODERATOR', 'AUDIT', 'ANALYST', 'AGENT'])(
      '%s est un participant ordinaire — aucun bypass',
      (platformRole) => {
        expect(actsWithCreatorRights({ conversationRole: 'member', platformRole })).toBe(false);
      },
    );

    it('un rôle de plateforme absent ne donne rien', () => {
      expect(actsWithCreatorRights({ conversationRole: 'member', platformRole: null })).toBe(false);
      expect(actsWithCreatorRights({ conversationRole: 'member' })).toBe(false);
    });
  });

  describe('effectiveConversationRole', () => {
    it('élève un simple membre ADMIN de plateforme au rang de créateur', () => {
      expect(effectiveConversationRole({ conversationRole: 'member', platformRole: 'ADMIN' })).toBe('creator');
    });

    it('laisse intact le rang d’un utilisateur ordinaire', () => {
      expect(effectiveConversationRole({ conversationRole: 'moderator', platformRole: 'USER' })).toBe('moderator');
    });

    it('replie la casse du rang de conversation (#4008)', () => {
      expect(effectiveConversationRole({ conversationRole: 'ADMIN', platformRole: 'USER' })).toBe('admin');
    });

    it('un rang absent ne vaut RIEN — pas même membre', () => {
      expect(effectiveConversationRole({ conversationRole: null, platformRole: 'USER' })).toBeNull();
    });

    // `MEMBER_ROLE_HIERARCHY` place `member` à 10 et rend 0 pour l'inconnu : un
    // rang illisible vaut donc MOINS qu'un simple membre. Le replier sur
    // `member` aurait PROMU les lignes corrompues — un repli « fail-closed »
    // mal choisi accorde ce qu'il croyait refuser, et c'est la garde voisine
    // `ban uses ?? 0 for both roles` qui l'a attrapé.
    it('un rang inconnu ne vaut RIEN — il ne se replie pas sur membre', () => {
      expect(effectiveConversationRole({ conversationRole: 'owner', platformRole: 'USER' })).toBeNull();
      expect(actorRoleLevel({ conversationRole: 'owner', platformRole: 'USER' })).toBe(0);
      expect(actorHasMinimumRole({ conversationRole: 'owner', platformRole: 'USER' }, 'member')).toBe(false);
    });
  });

  describe('actorHasMinimumRole', () => {
    it('ouvre au simple membre ADMIN de plateforme ce qui est réservé au créateur', () => {
      expect(actorHasMinimumRole({ conversationRole: 'member', platformRole: 'ADMIN' }, 'creator')).toBe(true);
    });

    it('ferme au simple membre ordinaire ce qui est réservé au modérateur', () => {
      expect(actorHasMinimumRole({ conversationRole: 'member', platformRole: 'USER' }, 'moderator')).toBe(false);
    });

    it('un modérateur de conversation reste sous le rang d’admin', () => {
      expect(actorHasMinimumRole({ conversationRole: 'moderator', platformRole: 'USER' }, 'admin')).toBe(false);
    });
  });

  describe('actorRoleLevel — comparer DEUX rangs entre eux', () => {
    it('n’élève PAS l’administrateur de plateforme AU-DESSUS du créateur', () => {
      const platformAdmin = actorRoleLevel({ conversationRole: 'member', platformRole: 'ADMIN' });
      const creator = actorRoleLevel({ conversationRole: 'creator', platformRole: 'USER' });

      expect(platformAdmin).toBe(creator);
    });

    it('place l’administrateur de plateforme au-dessus d’un admin de conversation', () => {
      expect(actorRoleLevel({ conversationRole: 'member', platformRole: 'BIGBOSS' }))
        .toBeGreaterThan(actorRoleLevel({ conversationRole: 'admin', platformRole: 'USER' }));
    });
  });
});
