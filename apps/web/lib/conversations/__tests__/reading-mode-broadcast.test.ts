/**
 * D-4 / R5-6, point 3(c) — consommation du broadcast versionné
 * `USER_PREFERENCES_UPDATED` (scope conversation) pour la préférence de mode
 * de lecture. Pendant web de `MeeshyApp.swift:onReadingModePreferenceChanged`
 * (iOS), même garde de drapeau, même refus de fabriquer une préférence
 * depuis une chaîne inconnue.
 *
 * Témoin (v) du mandat D-4 : « broadcast reçu ⇒ magasin scopé mis à jour,
 * gardé par le drapeau. »
 */
import { AUTH_STORAGE_KEYS } from '@/constants/auth';
import { useReadingModePreferenceStore } from '@/stores/reading-mode-preference-store';
import { applyReadingModePreferenceBroadcast } from '../reading-mode-broadcast';
import type { UserPreferencesConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events';

const CONVERSATION_A = '507f1f77bcf86cd799439021';

function setRegisteredIdentity(userId: string): void {
  window.localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, `fake-jwt-${userId}`);
  window.localStorage.setItem(AUTH_STORAGE_KEYS.USER_DATA, JSON.stringify({ id: userId }));
}

const basePayload = (overrides: Partial<UserPreferencesConversationUpdatedEventData> = {}) =>
  ({
    userId: 'user-A',
    conversationId: CONVERSATION_A,
    version: 1,
    reset: false,
    preferences: {
      isPinned: false,
      isMuted: false,
      mentionsOnly: false,
      isArchived: false,
      tags: [],
      categoryId: null,
      orderInCategory: null,
      customName: null,
      reaction: null,
      readingMode: 'focal',
      deletedForUserAt: null,
      clearHistoryBefore: null,
    },
    ...overrides,
  }) as UserPreferencesConversationUpdatedEventData;

beforeEach(() => {
  window.localStorage.clear();
  useReadingModePreferenceStore.getState().reset();
  setRegisteredIdentity('user-A');
});

describe('applyReadingModePreferenceBroadcast — gardé par le drapeau', () => {
  it('drapeau ÉTEINT ⇒ AUCUN effet, quel que soit le payload', () => {
    applyReadingModePreferenceBroadcast(basePayload(), false);

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('auto');
  });

  it('drapeau ALLUMÉ + payload valide ⇒ le magasin scopé de l’identité courante est mis à jour', () => {
    applyReadingModePreferenceBroadcast(basePayload(), true);

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('focal');
  });
});

describe('applyReadingModePreferenceBroadcast — ne fabrique jamais une préférence', () => {
  it('`reset: true` (preferences: null) ⇒ AUCUN effet — pas de valeur à appliquer', () => {
    applyReadingModePreferenceBroadcast(
      basePayload({ reset: true, preferences: null, version: 2 }),
      true
    );

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('auto');
  });

  it("`readingMode` hors énumération (chaîne inconnue) ⇒ AUCUN effet, jamais devinée", () => {
    applyReadingModePreferenceBroadcast(
      basePayload({ preferences: { ...basePayload().preferences!, readingMode: 'not-a-real-mode' } }),
      true
    );

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('auto');
  });
});

describe('applyReadingModePreferenceBroadcast — arbitrage par version, la préférence serveur prime', () => {
  it('un magasin local jamais touché (version 0) perd face à un broadcast version >= 1 — « le serveur prime »', () => {
    applyReadingModePreferenceBroadcast(basePayload({ version: 3, preferences: { ...basePayload().preferences!, readingMode: 'script' } }), true);

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('script');
  });

  it('un broadcast de version INFÉRIEURE OU ÉGALE à la version locale est ignoré — pas de recul', () => {
    // `applyReadingModeUpdate` directement (pas `setReadingMode`, qui
    // déclencherait en plus une écriture réseau hors du périmètre de ce
    // fichier) : seed une version locale 1.
    useReadingModePreferenceStore.getState().applyReadingModeUpdate(CONVERSATION_A, 'resume', 1);

    applyReadingModePreferenceBroadcast(
      basePayload({ version: 1, preferences: { ...basePayload().preferences!, readingMode: 'focal' } }),
      true
    );

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('resume');
  });
});
