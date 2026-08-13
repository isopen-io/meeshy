import { describe, it, expect } from 'vitest';
import {
  notificationMatchesReadBulkScope,
  type NotificationReadBulkCandidate,
} from '../utils/notification-read-bulk';
import type { NotificationReadBulkScope } from '../types/notification';

// `notification:read-bulk` annonce le PRÉDICAT qu'un marquage en masse vient
// d'appliquer côté serveur — pas la liste des lignes touchées (les chemins bulk
// passent par un `updateMany`/`$runCommandRaw` qui ne renvoie aucun id). Chaque
// client rejoue donc le prédicat sur son propre cache : ce module est l'énoncé
// UNIQUE de ce prédicat, pour que web et iOS ne marquent jamais des lignes
// différentes de celles que le serveur a marquées.

const candidate = (
  overrides: Partial<NotificationReadBulkCandidate> = {}
): NotificationReadBulkCandidate => ({
  type: 'new_message',
  context: { conversationId: 'conv-1' },
  ...overrides,
});

describe('notificationMatchesReadBulkScope', () => {
  describe("scope 'all'", () => {
    it('matche toute notification', () => {
      const scope: NotificationReadBulkScope = { kind: 'all' };

      expect(notificationMatchesReadBulkScope(scope, candidate())).toBe(true);
      expect(
        notificationMatchesReadBulkScope(scope, candidate({ type: 'post_like', context: {} }))
      ).toBe(true);
    });
  });

  describe("scope 'context'", () => {
    it('matche sur la valeur exacte de la clé de contexte annoncée', () => {
      const scope: NotificationReadBulkScope = {
        kind: 'context',
        contextKey: 'conversationId',
        contextValue: 'conv-1',
      };

      expect(notificationMatchesReadBulkScope(scope, candidate())).toBe(true);
      expect(
        notificationMatchesReadBulkScope(
          scope,
          candidate({ context: { conversationId: 'conv-2' } })
        )
      ).toBe(false);
    });

    it('ne matche pas une autre clé portant la même valeur', () => {
      const scope: NotificationReadBulkScope = {
        kind: 'context',
        contextKey: 'postId',
        contextValue: 'shared-id',
      };

      expect(
        notificationMatchesReadBulkScope(
          scope,
          candidate({ context: { conversationId: 'shared-id' } })
        )
      ).toBe(false);
    });

    it('couvre friendRequestId — la 3e clé de contexte marquée en masse par la gateway', () => {
      const scope: NotificationReadBulkScope = {
        kind: 'context',
        contextKey: 'friendRequestId',
        contextValue: 'fr-9',
      };

      expect(
        notificationMatchesReadBulkScope(scope, candidate({ context: { friendRequestId: 'fr-9' } }))
      ).toBe(true);
    });

    it('ne matche pas quand le contexte est absent ou vide', () => {
      const scope: NotificationReadBulkScope = {
        kind: 'context',
        contextKey: 'conversationId',
        contextValue: 'conv-1',
      };

      expect(notificationMatchesReadBulkScope(scope, candidate({ context: {} }))).toBe(false);
      expect(notificationMatchesReadBulkScope(scope, candidate({ context: undefined }))).toBe(false);
      expect(notificationMatchesReadBulkScope(scope, candidate({ context: null }))).toBe(false);
    });
  });

  describe("scope 'types'", () => {
    it("matche quand le type de la ligne est dans la liste annoncée", () => {
      const scope: NotificationReadBulkScope = {
        kind: 'types',
        types: ['friend_request', 'friend_accepted'],
      };

      expect(notificationMatchesReadBulkScope(scope, candidate({ type: 'friend_accepted' }))).toBe(
        true
      );
      expect(notificationMatchesReadBulkScope(scope, candidate({ type: 'new_message' }))).toBe(
        false
      );
    });

    it('ne matche rien sur une liste vide', () => {
      expect(notificationMatchesReadBulkScope({ kind: 'types', types: [] }, candidate())).toBe(
        false
      );
    });

    it("ne matche pas une ligne sans type", () => {
      const scope: NotificationReadBulkScope = { kind: 'types', types: ['new_message'] };

      expect(notificationMatchesReadBulkScope(scope, candidate({ type: undefined }))).toBe(false);
      expect(notificationMatchesReadBulkScope(scope, candidate({ type: null }))).toBe(false);
    });
  });

  describe('compatibilité ascendante', () => {
    it("ne matche RIEN quand le scope porte un kind que ce client ne connaît pas", () => {
      // Un serveur plus récent peut annoncer un scope inconnu. Ne rien marquer
      // est le seul repli sûr : marquer trop retirerait de la cloche des lignes
      // encore non lues, et `notification:counts` — émis juste après — recale
      // de toute façon le badge, le refetch suivant recalant les lignes.
      const unknownScope = { kind: 'severity', severity: 'high' } as unknown as NotificationReadBulkScope;

      expect(notificationMatchesReadBulkScope(unknownScope, candidate())).toBe(false);
    });
  });
});
