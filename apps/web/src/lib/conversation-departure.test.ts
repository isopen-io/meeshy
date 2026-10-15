import { describe, expect, test } from 'bun:test';

import {
  cancelDeparture,
  departureKindsOf,
  departureStore,
  dismissDepartureFailure,
  failDeparture,
  requestDeparture,
} from './conversation-departure';

/**
 * QUI PEUT PARTIR, ET COMMENT (#7285, #7837) — la loi d'iOS
 * (`ConversationPreferencesTab.swift` : « Quitter le groupe » hors direct,
 * « Supprimer pour moi » partout) et la demande en cours, que l'hôte de la
 * coquille confirme.
 */
describe('departureKindsOf', () => {
  test('un groupe se quitte ou se supprime', () => {
    expect(departureKindsOf({ type: 'group' })).toEqual(['leave', 'delete']);
    expect(departureKindsOf({ type: 'public' })).toEqual(['leave', 'delete']);
  });

  test('une conversation directe ne se quitte pas : elle se supprime pour soi', () => {
    expect(departureKindsOf({ type: 'direct' })).toEqual(['delete']);
  });
});

describe('departureStore', () => {
  test('une demande remplace l’échec affiché, l’annulation la retire', () => {
    failDeparture({ kind: 'leave', offline: true });
    requestDeparture({ conversationId: 'c1', kind: 'delete', returnToList: false });
    expect(departureStore.getState()).toEqual({ request: { conversationId: 'c1', kind: 'delete', returnToList: false }, failure: null });

    cancelDeparture();
    expect(departureStore.getState().request).toBeNull();
  });

  test('un échec se ferme', () => {
    failDeparture({ kind: 'delete', offline: false });
    expect(departureStore.getState().failure).toEqual({ kind: 'delete', offline: false });
    dismissDepartureFailure();
    expect(departureStore.getState().failure).toBeNull();
  });
});
