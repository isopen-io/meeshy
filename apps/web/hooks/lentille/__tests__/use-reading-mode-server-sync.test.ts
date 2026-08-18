/**
 * D-4 / R5-6, point 3(a) — au chargement d'un fil, la préférence SERVEUR (si
 * présente) prime sur le repli local scopé.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { AUTH_STORAGE_KEYS } from '@/constants/auth';
import { useReadingModePreferenceStore } from '@/stores/reading-mode-preference-store';
import { useReadingModeServerSync } from '../use-reading-mode-server-sync';

const CONVERSATION_A = '507f1f77bcf86cd799439021';

const fetchServerReadingModePreferenceMock = jest.fn();
jest.mock('@/services/reading-mode-sync.service', () => ({
  fetchServerReadingModePreference: (...args: unknown[]) =>
    fetchServerReadingModePreferenceMock(...args),
  writeReadingModePreferenceToServer: jest.fn().mockResolvedValue(undefined),
}));

let flagActive = true;
jest.mock('../use-reading-modes-flag', () => ({
  useReadingModesFlag: () => ({ active: flagActive }),
}));

function setRegisteredIdentity(userId: string): void {
  window.localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, `fake-jwt-${userId}`);
  window.localStorage.setItem(AUTH_STORAGE_KEYS.USER_DATA, JSON.stringify({ id: userId }));
}

function setAnonymousIdentity(participantId: string): void {
  window.localStorage.setItem(
    AUTH_STORAGE_KEYS.ANONYMOUS_SESSION,
    JSON.stringify({ token: `anon-${participantId}`, participantId, expiresAt: Date.now() + 86_400_000 })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useReadingModePreferenceStore.getState().reset();
  fetchServerReadingModePreferenceMock.mockReset();
  flagActive = true;
});

describe('useReadingModeServerSync', () => {
  it('applique la préférence serveur au magasin scopé quand elle existe', async () => {
    setRegisteredIdentity('user-A');
    fetchServerReadingModePreferenceMock.mockResolvedValue({ value: 'script', version: 3 });

    renderHook(() => useReadingModeServerSync(CONVERSATION_A));

    await waitFor(() => {
      expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('script');
    });
    expect(fetchServerReadingModePreferenceMock).toHaveBeenCalledWith(CONVERSATION_A);
  });

  it('un choix local plus récent (version supérieure) n’est PAS écrasé par une réponse serveur périmée', async () => {
    setRegisteredIdentity('user-A');
    useReadingModePreferenceStore.getState().applyReadingModeUpdate(CONVERSATION_A, 'resume', 5);
    fetchServerReadingModePreferenceMock.mockResolvedValue({ value: 'focal', version: 2 });

    renderHook(() => useReadingModeServerSync(CONVERSATION_A));

    await waitFor(() => expect(fetchServerReadingModePreferenceMock).toHaveBeenCalled());
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('resume');
  });

  it('drapeau `reading_modes` ÉTEINT ⇒ aucun appel réseau', () => {
    flagActive = false;
    setRegisteredIdentity('user-A');

    renderHook(() => useReadingModeServerSync(CONVERSATION_A));

    expect(fetchServerReadingModePreferenceMock).not.toHaveBeenCalled();
  });

  it("session ANONYME ⇒ aucun appel réseau — pas de route serveur pour elle (D-4 point 4)", () => {
    setAnonymousIdentity('participant-1');

    renderHook(() => useReadingModeServerSync(CONVERSATION_A));

    expect(fetchServerReadingModePreferenceMock).not.toHaveBeenCalled();
  });

  it('sans conversation ⇒ aucun appel réseau', () => {
    setRegisteredIdentity('user-A');

    renderHook(() => useReadingModeServerSync(undefined));

    expect(fetchServerReadingModePreferenceMock).not.toHaveBeenCalled();
  });

  it('un échec réseau reste silencieux — pas de rejet non capturé', async () => {
    setRegisteredIdentity('user-A');
    fetchServerReadingModePreferenceMock.mockRejectedValue(new Error('network down'));

    renderHook(() => useReadingModeServerSync(CONVERSATION_A));

    await waitFor(() => expect(fetchServerReadingModePreferenceMock).toHaveBeenCalled());
    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_A)).toBe('auto');
  });
});
