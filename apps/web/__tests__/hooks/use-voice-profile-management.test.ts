import { renderHook, act } from '@testing-library/react';
import { useVoiceProfileManagement } from '@/hooks/use-voice-profile-management';

// ─── Mock sonner ──────────────────────────────────────────────────────────────

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  },
}));

// ─── Mock apiService ──────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
  TIMEOUT_VOICE_PROFILE: 300000,
}));

// ─── Mock @/lib/config (catalogue partagé) ─────────────────────────────────────
//
// #4348 (critère 8) — `API_ENDPOINTS.me.consentsByPurpose` a atterri dans le
// catalogue RÉEL (`packages/shared/api/endpoints.ts`) PENDANT l'écriture de
// ce correctif (session gateway parallèle, hors du territoire WEB de #4348 —
// voir la note d'intégration en tête de `use-voice-profile-management.ts`).
// Le mock reste malgré tout la bonne pratique : mocker `@meeshy/shared/api/
// endpoints` directement serait INERTE ici (moduleNameMapper redirige vers
// `packages/shared/dist`, cf. `apps/web/CLAUDE.md`) — le module `dist/`
// compilé n'est pas nécessairement à jour dans tout arbre de travail. Mocker
// `@/lib/config`, module LOCAL au web que le hook consomme, fixe le contrat
// attendu de façon déterministe, sans dépendre de l'état du `dist/` partagé
// ni de l'ordre de livraison des sessions parallèles.
const CONSENTS_BY_PURPOSE_PATH = (purpose: string) => `/api/v1/me/consents/${purpose}`;

jest.mock('@/lib/config', () => ({
  API_ENDPOINTS: {
    me: {
      consentsByPurpose: (purpose: string) => `/api/v1/me/consents/${purpose}`,
    },
  },
}));

// ─── Factories ────────────────────────────────────────────────────────────────

function makeProfileData(overrides = {}) {
  return {
    exists: true,
    userId: 'user-1',
    profileId: 'profile-1',
    createdAt: '2026-01-01T00:00:00Z',
    consentStatus: {
      voiceRecordingConsentAt: '2026-01-01T00:00:00Z',
      voiceCloningEnabledAt: null,
    },
    ...overrides,
  };
}

function makeNoProfileData(overrides = {}) {
  return {
    exists: false,
    consentStatus: {
      voiceRecordingConsentAt: null,
      voiceCloningEnabledAt: null,
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: loadProfile resolves with no profile
  mockGet.mockResolvedValue({ success: true, data: makeNoProfileData() });
  // Default: the unified /me/consents write succeeds (best-effort, #4348 critère 8)
  mockPut.mockResolvedValue({ success: true });
});

describe('useVoiceProfileManagement', () => {
  describe('initial state', () => {
    it('starts with isLoading=true, no profile, no consent', () => {
      const { result } = renderHook(() => useVoiceProfileManagement());
      expect(result.current.isLoading).toBe(true);
      expect(result.current.profile).toBeNull();
      expect(result.current.hasConsent).toBe(false);
      expect(result.current.hasVoiceCloningConsent).toBe(false);
    });
  });

  describe('loadProfile', () => {
    it('sets profile when exists=true', async () => {
      const profileData = makeProfileData();
      mockGet.mockResolvedValueOnce({ success: true, data: profileData });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.profile).toEqual(profileData);
      expect(result.current.isLoading).toBe(false);
    });

    it('sets profile to null when exists=false', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: makeNoProfileData() });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.profile).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('sets hasConsent=true when voiceRecordingConsentAt is set', async () => {
      const profileData = makeProfileData({
        consentStatus: {
          voiceRecordingConsentAt: '2026-01-01T00:00:00Z',
          voiceCloningEnabledAt: null,
        },
      });
      mockGet.mockResolvedValueOnce({ success: true, data: profileData });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.hasConsent).toBe(true);
      expect(result.current.hasVoiceCloningConsent).toBe(false);
    });

    it('sets hasVoiceCloningConsent=true when voiceCloningEnabledAt is set', async () => {
      const profileData = makeProfileData({
        consentStatus: {
          voiceRecordingConsentAt: '2026-01-01T00:00:00Z',
          voiceCloningEnabledAt: '2026-02-01T00:00:00Z',
        },
      });
      mockGet.mockResolvedValueOnce({ success: true, data: profileData });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.hasConsent).toBe(true);
      expect(result.current.hasVoiceCloningConsent).toBe(true);
    });

    it('handles double-nested response (data.data)', async () => {
      const profileData = makeProfileData();
      mockGet.mockResolvedValueOnce({ success: true, data: { data: profileData } });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.profile).toEqual(profileData);
    });

    it('handles missing consentStatus gracefully', async () => {
      const profileData = makeProfileData({ consentStatus: undefined });
      mockGet.mockResolvedValueOnce({ success: true, data: profileData });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.hasConsent).toBe(false);
      expect(result.current.hasVoiceCloningConsent).toBe(false);
    });

    it('shows error toast on failure and sets isLoading=false', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to load voice profile');
      expect(result.current.isLoading).toBe(false);
    });

    it('handles non-successful response (success=false)', async () => {
      mockGet.mockResolvedValueOnce({ success: false, data: null });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.profile).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('grantConsent', () => {
    it('grants consent and shows success toast', async () => {
      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantConsent();
      });

      // #4180 — `/voice/consent` n'existe pas (404). La seule route réelle,
      // qui horodate le consentement côté SERVEUR, est
      // POST /voice/profile/consent.
      expect(mockPost).toHaveBeenCalledWith('/voice/profile/consent', { voiceRecordingConsent: true });
      expect(result.current.hasConsent).toBe(true);
      expect(mockToastSuccess).toHaveBeenCalledWith('Voice recording consent granted');
    });

    it('does not change state when success=false', async () => {
      mockPost.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantConsent();
      });

      expect(result.current.hasConsent).toBe(false);
    });

    it('shows error toast on exception', async () => {
      mockPost.mockRejectedValueOnce(new Error('Error'));

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantConsent();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to grant consent');
    });
  });

  describe('deleteProfile', () => {
    it('deletes profile, clears it locally, and reloads', async () => {
      // First load the profile
      const profileData = makeProfileData();
      mockGet.mockResolvedValueOnce({ success: true, data: profileData });
      mockDelete.mockResolvedValueOnce({ success: true });
      // loadProfile called again after delete
      mockGet.mockResolvedValueOnce({ success: true, data: makeNoProfileData() });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });
      expect(result.current.profile).not.toBeNull();

      await act(async () => {
        await result.current.deleteProfile();
      });

      expect(mockDelete).toHaveBeenCalledWith('/voice/profile');
      expect(mockToastSuccess).toHaveBeenCalledWith('Voice profile deleted');
    });

    it('does not call loadProfile when delete returns success=false', async () => {
      mockDelete.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() => useVoiceProfileManagement());
      const getCallsBefore = mockGet.mock.calls.length;
      await act(async () => {
        await result.current.deleteProfile();
      });

      // loadProfile was not called again
      expect(mockGet.mock.calls.length).toBe(getCallsBefore);
    });

    it('shows error toast on failure', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Delete error'));

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.deleteProfile();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to delete voice profile');
    });
  });

  describe('grantVoiceCloningConsent', () => {
    it('grants voice cloning consent and reloads profile', async () => {
      mockPost.mockResolvedValueOnce({ success: true });
      // loadProfile() is called after grant; return data with cloning enabled
      mockGet.mockResolvedValueOnce({
        success: true,
        data: makeProfileData({
          consentStatus: {
            voiceRecordingConsentAt: '2026-01-01T00:00:00Z',
            voiceCloningEnabledAt: '2026-02-01T00:00:00Z',
          },
        }),
      });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantVoiceCloningConsent();
      });

      // #4180 — `/voice/voice-cloning-consent` n'existe pas (404) : le web
      // n'avait AUCUN moyen d'accorder le clonage vocal. Seule route réelle :
      // POST /voice/profile/consent (même écrivain que grantConsent).
      expect(mockPost).toHaveBeenCalledWith('/voice/profile/consent', {
        voiceRecordingConsent: true,
        voiceCloningConsent: true,
      });
      expect(result.current.hasVoiceCloningConsent).toBe(true);
      expect(mockToastSuccess).toHaveBeenCalledWith('Voice cloning enabled');
    });

    // #4348 (critère 8) — l'octroi part AUSSI vers la surface unifiée
    // `PUT /me/consents/{purpose}`, adressée via le catalogue partagé
    // (`API_ENDPOINTS.me.consentsByPurpose`), jamais un chemin écrit à la
    // main. Le corps ne porte QUE `{ granted, policyVersion }` — aucun champ
    // de date : le serveur horodate seul (contrat #4335/#4348).
    it('also PUTs the granted purpose to the catalogue-addressed unified /me/consents surface', async () => {
      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantVoiceCloningConsent();
      });

      expect(mockPut).toHaveBeenCalledWith(
        CONSENTS_BY_PURPOSE_PATH('voice-cloning'),
        { granted: true, policyVersion: expect.any(String) }
      );
      // Zod strict côté serveur ne déclare aucun champ de date : le web n'en
      // envoie donc aucun — le corps ne porte QUE ces deux clés.
      const [, body] = mockPut.mock.calls[0];
      expect(Object.keys(body).sort()).toEqual(['granted', 'policyVersion']);
    });

    it('still grants via the historical writer even when the unified surface is not available yet (best-effort, no user-facing error)', async () => {
      mockPut.mockRejectedValueOnce(new Error('/me/consents not deployed yet'));
      mockPost.mockResolvedValueOnce({ success: true });
      // loadProfile() runs after the grant — reflect the granted state
      mockGet.mockResolvedValueOnce({
        success: true,
        data: makeProfileData({
          consentStatus: {
            voiceRecordingConsentAt: '2026-01-01T00:00:00Z',
            voiceCloningEnabledAt: '2026-02-01T00:00:00Z',
          },
        }),
      });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantVoiceCloningConsent();
      });

      expect(result.current.hasVoiceCloningConsent).toBe(true);
      expect(mockToastSuccess).toHaveBeenCalledWith('Voice cloning enabled');
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it('does not update state when success=false', async () => {
      mockPost.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantVoiceCloningConsent();
      });

      expect(result.current.hasVoiceCloningConsent).toBe(false);
    });

    it('shows error toast on failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Consent error'));

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantVoiceCloningConsent();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to enable voice cloning');
    });
  });

  describe('revokeVoiceCloningConsent', () => {
    it('revokes voice cloning consent and reloads profile', async () => {
      // Revoke directly (no need to pre-grant in test)
      mockPost.mockResolvedValueOnce({ success: true });
      // loadProfile after revoke returns no cloning consent
      mockGet.mockResolvedValueOnce({ success: true, data: makeNoProfileData() });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.revokeVoiceCloningConsent();
      });

      // #4180 — même route que grantVoiceCloningConsent ; `false` fait
      // écrire `User.voiceCloningEnabledAt = null` côté serveur, donc une
      // révocation avec un effet réellement observable au prochain GET.
      expect(mockPost).toHaveBeenCalledWith('/voice/profile/consent', {
        voiceRecordingConsent: true,
        voiceCloningConsent: false,
      });
      // The hook sets hasVoiceCloningConsent=false explicitly before reload
      expect(result.current.hasVoiceCloningConsent).toBe(false);
      expect(mockToastSuccess).toHaveBeenCalledWith('Voice cloning disabled');
    });

    // #4348 (critère 8) — témoin explicite que la RÉVOCATION part, pas
    // seulement l'octroi : la même surface `PUT /me/consents/{purpose}`
    // reçoit `granted: false`, jamais un défaut figé à `true`.
    it('also PUTs granted:false to the unified /me/consents surface — the revocation itself leaves', async () => {
      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.revokeVoiceCloningConsent();
      });

      expect(mockPut).toHaveBeenCalledWith(
        CONSENTS_BY_PURPOSE_PATH('voice-cloning'),
        { granted: false, policyVersion: expect.any(String) }
      );
    });

    it('does not update state when success=false', async () => {
      mockPost.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.revokeVoiceCloningConsent();
      });

      // Initial value is false, stays false
      expect(result.current.hasVoiceCloningConsent).toBe(false);
    });

    it('shows error toast on failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Revoke error'));

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.revokeVoiceCloningConsent();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to disable voice cloning');
    });
  });

  // #4348 (critère 8) — la surface unifiée `/me/consents` ne doit JAMAIS
  // recevoir d'écriture qui ne provienne pas d'un geste explicite de
  // l'utilisateur (octroi ou révocation) : ni au montage, ni pendant
  // `loadProfile`, ni parce que le défaut serait resté figé d'un appel à
  // l'autre.
  describe('the unified /me/consents surface only ever receives an explicit user gesture (#4348 critère 8)', () => {
    it('sends no PUT to /me/consents merely from mounting the hook', () => {
      renderHook(() => useVoiceProfileManagement());
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('sends no PUT to /me/consents from loadProfile alone, even when cloning consent is already granted server-side', async () => {
      mockGet.mockResolvedValueOnce({
        success: true,
        data: makeProfileData({
          consentStatus: {
            voiceRecordingConsentAt: '2026-01-01T00:00:00Z',
            voiceCloningEnabledAt: '2026-02-01T00:00:00Z',
          },
        }),
      });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.hasVoiceCloningConsent).toBe(true);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('sends the flipped boolean on each explicit gesture — granting then revoking are two distinct payloads, not a stale default', async () => {
      const { result } = renderHook(() => useVoiceProfileManagement());

      await act(async () => {
        await result.current.grantVoiceCloningConsent();
      });
      await act(async () => {
        await result.current.revokeVoiceCloningConsent();
      });

      expect(mockPut).toHaveBeenCalledTimes(2);
      expect(mockPut.mock.calls[0][1]).toEqual({ granted: true, policyVersion: expect.any(String) });
      expect(mockPut.mock.calls[1][1]).toEqual({ granted: false, policyVersion: expect.any(String) });
    });
  });
});
