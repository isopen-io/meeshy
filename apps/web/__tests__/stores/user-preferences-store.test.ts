/**
 * Unit tests for useUserPreferencesStore.
 * Covers state management, utility functions, sync methods, and update actions.
 */

import { act } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetAuthToken = jest.fn();

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: (...args: unknown[]) => mockGetAuthToken(...args),
  },
}));

jest.mock('@/lib/config', () => ({
  // #4281 — miroir du vrai comportement (lib/config.ts) : un chemin déjà
  // préfixé /api/v… (catalogue partagé) n'est pas re-préfixé.
  buildApiUrl: (path: string) => `https://api.meeshy.test${path.startsWith('/api/v') ? path : `/api/v1${path}`}`,
}));

global.fetch = jest.fn();
const mockFetch = global.fetch as jest.Mock;

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  useUserPreferencesStore,
  initializeUserPreferences,
  resetUserPreferences,
} from '@/stores/user-preferences-store';
import { isPreferenceWriteInFlight } from '@/lib/preferences/preference-write-lock';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetStore() {
  act(() => {
    useUserPreferencesStore.setState({
      notifications: {
        pushEnabled: true,
        emailEnabled: true,
        soundEnabled: true,
        newMessageEnabled: true,
        missedCallEnabled: true,
        systemEnabled: true,
        conversationEnabled: true,
        replyEnabled: true,
        mentionEnabled: true,
        reactionEnabled: true,
        contactRequestEnabled: true,
        memberJoinedEnabled: true,
        dndEnabled: false,
        dndStartTime: '22:00',
        dndEndTime: '08:00',
      },
      encryption: {
        encryptionPreference: 'optional',
        autoEncryptNewConversations: false,
        showEncryptionStatus: true,
        warnOnUnencrypted: false,
      },
      privacy: {
        showOnlineStatus: true,
        showLastSeen: true,
        showReadReceipts: true,
        showTypingIndicator: true,
        allowContactRequests: true,
        allowGroupInvites: true,
        saveMediaToGallery: false,
        allowAnalytics: true,
      },
      language: {
        preferredLanguage: 'fr',
        translationEnabled: true,
        autoTranslate: false,
        translationTargetLanguage: 'fr',
      },
      story: {
        defaultVisibility: 'PUBLIC',
        storyNotificationsEnabled: true,
      },
      encryptionKeys: {
        hasSignalKeys: false,
        signalRegistrationId: null,
        lastKeyRotation: null,
      },
      isLoading: false,
      isInitialized: false,
      lastSyncedAt: null,
      error: null,
    });
  });
}

function makeOkResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data }),
  } as Response);
}

function makeErrorResponse() {
  return Promise.resolve({ ok: false } as Response);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useUserPreferencesStore', () => {
  beforeEach(() => {
    resetStore();
    mockGetAuthToken.mockReset();
    mockFetch.mockReset();
  });

  // ─── default state ──────────────────────────────────────────────────────────

  describe('default state', () => {
    it('has correct default notification preferences', () => {
      const { notifications } = useUserPreferencesStore.getState();
      expect(notifications.pushEnabled).toBe(true);
      expect(notifications.dndEnabled).toBe(false);
      expect(notifications.dndStartTime).toBe('22:00');
      expect(notifications.dndEndTime).toBe('08:00');
    });

    it('has correct default encryption preferences', () => {
      const { encryption } = useUserPreferencesStore.getState();
      expect(encryption.encryptionPreference).toBe('optional');
      expect(encryption.autoEncryptNewConversations).toBe(false);
      expect(encryption.warnOnUnencrypted).toBe(false);
    });

    it('has correct default language preferences', () => {
      const { language } = useUserPreferencesStore.getState();
      expect(language.preferredLanguage).toBe('fr');
      expect(language.translationEnabled).toBe(true);
    });

    it('starts uninitialized and not loading', () => {
      const state = useUserPreferencesStore.getState();
      expect(state.isInitialized).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.lastSyncedAt).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  // ─── reset ──────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('reverts all state to defaults', () => {
      act(() => {
        useUserPreferencesStore.setState({
          isInitialized: true,
          lastSyncedAt: '2026-01-01T00:00:00Z',
          error: 'some error',
        });
      });
      act(() => {
        useUserPreferencesStore.getState().reset();
      });
      const state = useUserPreferencesStore.getState();
      expect(state.isInitialized).toBe(false);
      expect(state.lastSyncedAt).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  // ─── updateLanguage ──────────────────────────────────────────────────────────

  describe('updateLanguage', () => {
    it('merges partial language preferences', () => {
      act(() => {
        useUserPreferencesStore.getState().updateLanguage({ preferredLanguage: 'en' });
      });
      const { language } = useUserPreferencesStore.getState();
      expect(language.preferredLanguage).toBe('en');
      expect(language.translationEnabled).toBe(true); // unchanged
    });

    it('updates multiple fields at once', () => {
      act(() => {
        useUserPreferencesStore.getState().updateLanguage({
          preferredLanguage: 'es',
          autoTranslate: true,
        });
      });
      const { language } = useUserPreferencesStore.getState();
      expect(language.preferredLanguage).toBe('es');
      expect(language.autoTranslate).toBe(true);
    });
  });

  // ─── updateStory ─────────────────────────────────────────────────────────────

  describe('updateStory', () => {
    it('merges partial story preferences', () => {
      act(() => {
        useUserPreferencesStore.getState().updateStory({ defaultVisibility: 'PRIVATE' });
      });
      const { story } = useUserPreferencesStore.getState();
      expect(story.defaultVisibility).toBe('PRIVATE');
      expect(story.storyNotificationsEnabled).toBe(true); // unchanged
    });
  });

  // ─── shouldShowEncryptionWarning ─────────────────────────────────────────────

  describe('shouldShowEncryptionWarning', () => {
    it('returns true when preference is always and conversation is not encrypted', () => {
      act(() => {
        useUserPreferencesStore.setState({
          encryption: {
            encryptionPreference: 'always',
            autoEncryptNewConversations: false,
            showEncryptionStatus: true,
            warnOnUnencrypted: false,
          },
        });
      });
      expect(useUserPreferencesStore.getState().shouldShowEncryptionWarning(false)).toBe(true);
    });

    it('returns false when preference is always but conversation IS encrypted', () => {
      act(() => {
        useUserPreferencesStore.setState({
          encryption: {
            encryptionPreference: 'always',
            autoEncryptNewConversations: false,
            showEncryptionStatus: true,
            warnOnUnencrypted: false,
          },
        });
      });
      expect(useUserPreferencesStore.getState().shouldShowEncryptionWarning(true)).toBe(false);
    });

    it('returns true when warnOnUnencrypted is true and conversation is not encrypted', () => {
      act(() => {
        useUserPreferencesStore.setState({
          encryption: {
            encryptionPreference: 'optional',
            autoEncryptNewConversations: false,
            showEncryptionStatus: true,
            warnOnUnencrypted: true,
          },
        });
      });
      expect(useUserPreferencesStore.getState().shouldShowEncryptionWarning(false)).toBe(true);
    });

    it('returns false when warnOnUnencrypted is false and preference is optional', () => {
      expect(useUserPreferencesStore.getState().shouldShowEncryptionWarning(false)).toBe(false);
    });

    it('returns false when warnOnUnencrypted is true but conversation IS encrypted', () => {
      act(() => {
        useUserPreferencesStore.setState({
          encryption: {
            encryptionPreference: 'optional',
            autoEncryptNewConversations: false,
            showEncryptionStatus: true,
            warnOnUnencrypted: true,
          },
        });
      });
      expect(useUserPreferencesStore.getState().shouldShowEncryptionWarning(true)).toBe(false);
    });
  });

  // ─── isInDndPeriod ───────────────────────────────────────────────────────────

  describe('isInDndPeriod', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns false when DND is disabled', () => {
      expect(useUserPreferencesStore.getState().isInDndPeriod()).toBe(false);
    });

    it('returns true during overnight DND period (23:00 → current 23:30)', () => {
      act(() => {
        useUserPreferencesStore.setState({
          notifications: {
            ...useUserPreferencesStore.getState().notifications,
            dndEnabled: true,
            dndStartTime: '22:00',
            dndEndTime: '08:00',
          },
        });
      });
      // Set time to 23:30
      jest.setSystemTime(new Date('2026-01-01T23:30:00'));
      expect(useUserPreferencesStore.getState().isInDndPeriod()).toBe(true);
    });

    it('returns true during overnight DND period (early morning → current 05:00)', () => {
      act(() => {
        useUserPreferencesStore.setState({
          notifications: {
            ...useUserPreferencesStore.getState().notifications,
            dndEnabled: true,
            dndStartTime: '22:00',
            dndEndTime: '08:00',
          },
        });
      });
      jest.setSystemTime(new Date('2026-01-01T05:00:00'));
      expect(useUserPreferencesStore.getState().isInDndPeriod()).toBe(true);
    });

    it('returns false outside overnight DND period (14:00)', () => {
      act(() => {
        useUserPreferencesStore.setState({
          notifications: {
            ...useUserPreferencesStore.getState().notifications,
            dndEnabled: true,
            dndStartTime: '22:00',
            dndEndTime: '08:00',
          },
        });
      });
      jest.setSystemTime(new Date('2026-01-01T14:00:00'));
      expect(useUserPreferencesStore.getState().isInDndPeriod()).toBe(false);
    });

    it('returns true during same-day DND period (start < end)', () => {
      act(() => {
        useUserPreferencesStore.setState({
          notifications: {
            ...useUserPreferencesStore.getState().notifications,
            dndEnabled: true,
            dndStartTime: '12:00',
            dndEndTime: '14:00',
          },
        });
      });
      jest.setSystemTime(new Date('2026-01-01T13:00:00'));
      expect(useUserPreferencesStore.getState().isInDndPeriod()).toBe(true);
    });

    it('returns false outside same-day DND window', () => {
      act(() => {
        useUserPreferencesStore.setState({
          notifications: {
            ...useUserPreferencesStore.getState().notifications,
            dndEnabled: true,
            dndStartTime: '12:00',
            dndEndTime: '14:00',
          },
        });
      });
      jest.setSystemTime(new Date('2026-01-01T10:00:00'));
      expect(useUserPreferencesStore.getState().isInDndPeriod()).toBe(false);
    });
  });

  // ─── canReceiveNotification ──────────────────────────────────────────────────

  describe('canReceiveNotification', () => {
    it('returns true for an enabled notification type when not in DND', () => {
      expect(useUserPreferencesStore.getState().canReceiveNotification('newMessageEnabled')).toBe(true);
    });

    it('returns false when pushEnabled is false', () => {
      act(() => {
        useUserPreferencesStore.setState({
          notifications: {
            ...useUserPreferencesStore.getState().notifications,
            pushEnabled: false,
          },
        });
      });
      expect(useUserPreferencesStore.getState().canReceiveNotification('newMessageEnabled')).toBe(false);
    });

    it('returns false for a disabled notification type', () => {
      act(() => {
        useUserPreferencesStore.setState({
          notifications: {
            ...useUserPreferencesStore.getState().notifications,
            reactionEnabled: false,
          },
        });
      });
      expect(useUserPreferencesStore.getState().canReceiveNotification('reactionEnabled')).toBe(false);
    });

    it('returns true for a non-boolean field (dndStartTime)', () => {
      expect(useUserPreferencesStore.getState().canReceiveNotification('dndStartTime' as any)).toBe(true);
    });

    it('returns false during DND period', () => {
      jest.useFakeTimers();
      act(() => {
        useUserPreferencesStore.setState({
          notifications: {
            ...useUserPreferencesStore.getState().notifications,
            dndEnabled: true,
            dndStartTime: '22:00',
            dndEndTime: '08:00',
          },
        });
      });
      jest.setSystemTime(new Date('2026-01-01T23:00:00'));
      expect(useUserPreferencesStore.getState().canReceiveNotification('newMessageEnabled')).toBe(false);
      jest.useRealTimers();
    });
  });

  // ─── syncNotifications ────────────────────────────────────────────────────────

  describe('syncNotifications', () => {
    it('does nothing when no auth token', async () => {
      mockGetAuthToken.mockReturnValue(null);
      await act(async () => {
        await useUserPreferencesStore.getState().syncNotifications();
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('updates notification preferences on success', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeOkResponse({
        id: '1',
        userId: 'u1',
        isDefault: false,
        createdAt: '',
        updatedAt: '',
        pushEnabled: false,
        emailEnabled: false,
        soundEnabled: false,
        newMessageEnabled: false,
        missedCallEnabled: false,
        systemEnabled: false,
        conversationEnabled: false,
        replyEnabled: false,
        mentionEnabled: false,
        reactionEnabled: false,
        contactRequestEnabled: false,
        memberJoinedEnabled: false,
        dndEnabled: true,
        dndStartTime: '21:00',
        dndEndTime: '07:00',
      }));

      await act(async () => {
        await useUserPreferencesStore.getState().syncNotifications();
      });

      const { notifications } = useUserPreferencesStore.getState();
      expect(notifications.pushEnabled).toBe(false);
      expect(notifications.dndEnabled).toBe(true);
      expect(notifications.dndStartTime).toBe('21:00');
    });

    it('does not throw when fetch rejects', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockRejectedValue(new Error('network error'));
      await expect(
        act(async () => { await useUserPreferencesStore.getState().syncNotifications(); })
      ).resolves.not.toThrow();
    });

    it('does not update state when response is not ok', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeErrorResponse());
      const before = useUserPreferencesStore.getState().notifications.pushEnabled;
      await act(async () => {
        await useUserPreferencesStore.getState().syncNotifications();
      });
      expect(useUserPreferencesStore.getState().notifications.pushEnabled).toBe(before);
    });
  });

  // ─── syncEncryption ───────────────────────────────────────────────────────────

  describe('syncEncryption', () => {
    it('does nothing when no auth token', async () => {
      mockGetAuthToken.mockReturnValue(null);
      await act(async () => {
        await useUserPreferencesStore.getState().syncEncryption();
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('updates encryption from privacy endpoint on success', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeOkResponse({
        encryptionPreference: 'always',
        autoEncryptNewConversations: true,
        showEncryptionStatus: false,
        warnOnUnencrypted: true,
      }));

      await act(async () => {
        await useUserPreferencesStore.getState().syncEncryption();
      });

      const { encryption } = useUserPreferencesStore.getState();
      expect(encryption.encryptionPreference).toBe('always');
      expect(encryption.autoEncryptNewConversations).toBe(true);
      expect(encryption.warnOnUnencrypted).toBe(true);
    });
  });

  // ─── syncEncryptionKeys ───────────────────────────────────────────────────────

  describe('syncEncryptionKeys', () => {
    it('does nothing when no auth token', async () => {
      mockGetAuthToken.mockReturnValue(null);
      await act(async () => {
        await useUserPreferencesStore.getState().syncEncryptionKeys();
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('reads key status from GET /me?expand=security — #4178, la seule lecture de soi', async () => {
      // `GET /me/preferences/encryption` est désormais un ALIAS déprécié de
      // `GET /me?expand=security` (#4178) : la forme sert `security` NICHÉ
      // sous `data.user`, pas à plat sous `data` — c'est ce que
      // `?expand=security` ajoute à la lecture de soi, exactement la forme
      // que servait déjà l'ancienne route.
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeOkResponse({
        user: {
          security: {
            hasSignalKeys: true,
            signalRegistrationId: 4242,
            lastKeyRotation: '2026-03-04T05:06:07.000Z',
          },
        },
      }));

      await act(async () => {
        await useUserPreferencesStore.getState().syncEncryptionKeys();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.meeshy.test/api/v1/me?expand=security',
        expect.anything(),
      );
      const { encryptionKeys } = useUserPreferencesStore.getState();
      expect(encryptionKeys.hasSignalKeys).toBe(true);
      expect(encryptionKeys.signalRegistrationId).toBe(4242);
      expect(encryptionKeys.lastKeyRotation).toBe('2026-03-04T05:06:07.000Z');
    });

    it('reports no keys when the server says so', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      useUserPreferencesStore.setState({
        encryptionKeys: { hasSignalKeys: true, signalRegistrationId: 1, lastKeyRotation: 'x' },
      });
      mockFetch.mockResolvedValue(makeOkResponse({
        user: { security: { hasSignalKeys: false, signalRegistrationId: null, lastKeyRotation: null } },
      }));

      await act(async () => {
        await useUserPreferencesStore.getState().syncEncryptionKeys();
      });

      expect(useUserPreferencesStore.getState().encryptionKeys).toEqual({
        hasSignalKeys: false,
        signalRegistrationId: null,
        lastKeyRotation: null,
      });
    });

    it('data.user sans security ne lève pas — les trois champs retombent à leur valeur "aucune clé"', async () => {
      // Cohérent avec le contrat générique des sync* (§ plus bas) : une
      // enveloppe qui PORTE des données rend `true`, même incomplète — seule
      // l'ABSENCE de `data` (§ « enveloppe sans données ») rend `false`.
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeOkResponse({ user: {} }));

      let result: boolean | undefined;
      await act(async () => {
        result = await useUserPreferencesStore.getState().syncEncryptionKeys();
      });

      expect(result).toBe(true);
      expect(useUserPreferencesStore.getState().encryptionKeys).toEqual({
        hasSignalKeys: false,
        signalRegistrationId: null,
        lastKeyRotation: null,
      });
    });

    it('leaves the last known status untouched when the request fails', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      useUserPreferencesStore.setState({
        encryptionKeys: { hasSignalKeys: true, signalRegistrationId: 7, lastKeyRotation: null },
      });
      mockFetch.mockRejectedValue(new Error('offline'));

      await act(async () => {
        await useUserPreferencesStore.getState().syncEncryptionKeys();
      });

      expect(useUserPreferencesStore.getState().encryptionKeys.hasSignalKeys).toBe(true);
      expect(useUserPreferencesStore.getState().encryptionKeys.signalRegistrationId).toBe(7);
    });
  });

  // ─── syncPrivacy ──────────────────────────────────────────────────────────────

  describe('syncPrivacy', () => {
    it('does nothing when no auth token', async () => {
      mockGetAuthToken.mockReturnValue(null);
      await act(async () => {
        await useUserPreferencesStore.getState().syncPrivacy();
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('updates privacy prefs and filters out encryption fields', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeOkResponse({
        id: '1', userId: 'u1', createdAt: '', updatedAt: '',
        encryptionPreference: 'always',
        autoEncryptNewConversations: true,
        showEncryptionStatus: false,
        warnOnUnencrypted: true,
        showOnlineStatus: false,
        showLastSeen: false,
        showReadReceipts: false,
        showTypingIndicator: false,
        allowContactRequests: false,
        allowGroupInvites: false,
        saveMediaToGallery: true,
        allowAnalytics: false,
      }));

      await act(async () => {
        await useUserPreferencesStore.getState().syncPrivacy();
      });

      const { privacy, encryption } = useUserPreferencesStore.getState();
      expect(privacy.showOnlineStatus).toBe(false);
      expect(privacy.allowAnalytics).toBe(false);
      // Encryption fields are NOT synced here (handled by syncEncryption)
      expect(encryption.encryptionPreference).toBe('optional'); // unchanged
    });

    it('does not throw when fetch rejects', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockRejectedValue(new Error('network error'));
      await expect(
        act(async () => { await useUserPreferencesStore.getState().syncPrivacy(); })
      ).resolves.not.toThrow();
    });
  });

  // ─── updateNotifications ─────────────────────────────────────────────────────

  describe('updateNotifications', () => {
    it('does nothing when no auth token', async () => {
      mockGetAuthToken.mockReturnValue(null);
      await act(async () => {
        await useUserPreferencesStore.getState().updateNotifications({ soundEnabled: false });
      });
      expect(mockFetch).not.toHaveBeenCalled();
      // State unchanged
      expect(useUserPreferencesStore.getState().notifications.soundEnabled).toBe(true);
    });

    it('applies optimistic update and persists on success', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useUserPreferencesStore.getState().updateNotifications({ soundEnabled: false });
      });

      expect(useUserPreferencesStore.getState().notifications.soundEnabled).toBe(false);
    });

    it('reverts and throws when server returns error', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      // First call for updateNotifications fails, second call for syncNotifications succeeds
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse())  // PUT fails
        .mockResolvedValueOnce(makeOkResponse({     // syncNotifications reverts
          pushEnabled: true, soundEnabled: true,
        }));

      await expect(
        act(async () => {
          await useUserPreferencesStore.getState().updateNotifications({ soundEnabled: false });
        })
      ).rejects.toThrow('Failed to update notification preferences');
    });
  });

  // ─── updateEncryption ────────────────────────────────────────────────────────

  describe('updateEncryption', () => {
    it('does nothing when no auth token', async () => {
      mockGetAuthToken.mockReturnValue(null);
      await act(async () => {
        await useUserPreferencesStore.getState().updateEncryption({ warnOnUnencrypted: true });
      });
      expect(useUserPreferencesStore.getState().encryption.warnOnUnencrypted).toBe(false);
    });

    it('applies optimistic update and persists on success', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useUserPreferencesStore.getState().updateEncryption({ warnOnUnencrypted: true });
      });

      expect(useUserPreferencesStore.getState().encryption.warnOnUnencrypted).toBe(true);
    });

    it('throws when server returns error', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse())  // PATCH fails
        .mockResolvedValueOnce(makeOkResponse({ encryptionPreference: 'optional' }));  // sync revert

      await expect(
        act(async () => {
          await useUserPreferencesStore.getState().updateEncryption({ autoEncryptNewConversations: true });
        })
      ).rejects.toThrow('Failed to update encryption preferences');
    });
  });

  // ─── updateEncryptionLocalSettings ──────────────────────────────────────────

  describe('updateEncryptionLocalSettings', () => {
    it('delegates to updateEncryption', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useUserPreferencesStore.getState().updateEncryptionLocalSettings({ warnOnUnencrypted: true });
      });

      expect(useUserPreferencesStore.getState().encryption.warnOnUnencrypted).toBe(true);
    });
  });

  // ─── updatePrivacy ────────────────────────────────────────────────────────────

  describe('updatePrivacy', () => {
    it('does nothing when no auth token', async () => {
      mockGetAuthToken.mockReturnValue(null);
      await act(async () => {
        await useUserPreferencesStore.getState().updatePrivacy({ showOnlineStatus: false });
      });
      expect(useUserPreferencesStore.getState().privacy.showOnlineStatus).toBe(true);
    });

    it('applies optimistic update and persists on success', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useUserPreferencesStore.getState().updatePrivacy({ showOnlineStatus: false });
      });

      expect(useUserPreferencesStore.getState().privacy.showOnlineStatus).toBe(false);
    });

    it('throws when server returns error', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse())
        .mockResolvedValueOnce(makeOkResponse({}));

      await expect(
        act(async () => {
          await useUserPreferencesStore.getState().updatePrivacy({ showOnlineStatus: false });
        })
      ).rejects.toThrow('Failed to update privacy preferences');
    });
  });

  // ─── une écriture n'envoie QUE ce qu'on lui a soumis ─────────────────────────

  /**
   * Les trois écritures envoyaient un instantané de DOCUMENT ENTIER construit
   * depuis une tranche de store qui est un SOUS-ENSEMBLE STRICT de ce document,
   * sur un `PUT` que la passerelle traite en REMPLACEMENT
   * (`update: { [category]: validated }`) — Zod comblant les clés absentes par
   * leurs `default()`.
   *
   * La tranche `privacy` ne peut structurellement pas porter le bloc
   * CHIFFREMENT : `syncPrivacy` l'en retire, `EncryptionPreferences` en est le
   * seul porteur. Basculer n'importe quel réglage de confidentialité remettait
   * donc `encryptionPreference` / `autoEncryptNewConversations` /
   * `showEncryptionStatus` / `warnOnUnencrypted` aux défauts — les
   * conversations neuves cessant d'être chiffrées automatiquement, sans un
   * signe.
   *
   * Les témoins portent sur la MÉTHODE et sur le CORPS : aucun des témoins
   * d'écriture précédents n'assertait ni l'une ni l'autre, et c'est exactement
   * l'espace où le défaut vivait (« un témoin d'écriture assert sur l'EFFET,
   * jamais sur le statut »).
   */
  describe('une écriture ne nomme que les clés soumises', () => {
    function lastRequest(): { url: string; init: RequestInit } {
      const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      return { url, init };
    }

    function lastBody(): Record<string, unknown> {
      return JSON.parse(String(lastRequest().init.body)) as Record<string, unknown>;
    }

    const ENCRYPTION_KEYS = [
      'encryptionPreference',
      'autoEncryptNewConversations',
      'showEncryptionStatus',
      'warnOnUnencrypted',
    ] as const;

    it('updatePrivacy fusionne au lieu de remplacer', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useUserPreferencesStore.getState().updatePrivacy({ showOnlineStatus: false });
      });

      expect(lastRequest().init.method).toBe('PATCH');
    });

    it('updatePrivacy ne nomme AUCUNE clé de chiffrement', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useUserPreferencesStore.getState().updatePrivacy({ showOnlineStatus: false });
      });

      expect(Object.keys(lastBody())).toEqual(['showOnlineStatus']);
      for (const key of ENCRYPTION_KEYS) {
        expect(lastBody()).not.toHaveProperty(key);
      }
    });

    it('updatePrivacy ne réaffirme pas les réglages voisins qu\'on n\'a pas touchés', async () => {
      // Un voisin changé sur un AUTRE appareil serait annulé par la simple
      // bascule d'un réglage sans rapport.
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useUserPreferencesStore.getState().updatePrivacy({ showReadReceipts: false });
      });

      expect(lastBody()).toEqual({ showReadReceipts: false });
    });

    it('updateEncryption ne nomme AUCUNE clé de confidentialité', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useUserPreferencesStore.getState().updateEncryption({ warnOnUnencrypted: true });
      });

      expect(lastRequest().init.method).toBe('PATCH');
      expect(lastBody()).toEqual({ warnOnUnencrypted: true });
    });

    it('updateNotifications ne nomme que ce qu\'on lui a passé', async () => {
      // `StoreNotificationPreferences` est un `Pick` de 14 des 33 champs du
      // schéma : après une hydratation ÉCHOUÉE, un remplacement remettait les
      // dix-neuf autres aux défauts — `callsEnabled`, `dndDays`,
      // `dndUtcOffsetMinutes` et les sept bascules sociales comprises.
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useUserPreferencesStore.getState().updateNotifications({ soundEnabled: false });
      });

      expect(lastRequest().init.method).toBe('PATCH');
      expect(lastBody()).toEqual({ soundEnabled: false });
    });

    it('une écriture sans aucune clé ne part pas', async () => {
      // Un `PATCH` au corps vide fait payer un aller-retour, un journal de
      // mutation et une diffusion `preferences:updated` pour zéro changement.
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useUserPreferencesStore.getState().updatePrivacy({});
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(isPreferenceWriteInFlight()).toBe(false);
    });
  });

  // ─── déclaration des écritures en vol ────────────────────────────────────────

  /**
   * Les deux écritures appliquent OPTIMISTEMENT puis envoient. Pendant cette
   * fenêtre, la valeur juste n'existe que localement : une relecture qui part
   * là rend l'ancienne valeur du serveur et DÉFAIT le geste. Les écritures se
   * déclarent donc, pour que la relecture puisse s'abstenir (leçon 310).
   */
  describe('déclaration des écritures en vol', () => {
    function pendingFetch(): (response: Response) => void {
      let release!: (response: Response) => void;
      mockFetch.mockImplementation(
        () => new Promise<Response>((resolve) => { release = resolve; })
      );
      return (response: Response) => release(response);
    }

    it('déclare updatePrivacy en vol pendant tout le PATCH', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      const release = pendingFetch();

      let write!: Promise<void>;
      await act(async () => {
        write = useUserPreferencesStore.getState().updatePrivacy({ showOnlineStatus: false });
        await Promise.resolve();
      });

      expect(isPreferenceWriteInFlight()).toBe(true);

      await act(async () => {
        release({ ok: true } as Response);
        await write;
      });

      expect(isPreferenceWriteInFlight()).toBe(false);
    });

    it('déclare updateEncryption en vol pendant tout le PATCH', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      const release = pendingFetch();

      let write!: Promise<void>;
      await act(async () => {
        write = useUserPreferencesStore.getState().updateEncryption({ warnOnUnencrypted: true });
        await Promise.resolve();
      });

      expect(isPreferenceWriteInFlight()).toBe(true);

      await act(async () => {
        release({ ok: true } as Response);
        await write;
      });

      expect(isPreferenceWriteInFlight()).toBe(false);
    });

    it('libère la déclaration quand le serveur refuse', async () => {
      // Sans libération sur l'échec, le verrou resterait posé pour la vie de
      // l'onglet et plus aucun rattrapage ne partirait.
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse())
        .mockResolvedValueOnce(makeOkResponse({}));

      // On attend la promesse de l'ÉCRITURE, pas celle d'un `act` : `act`
      // propage le rejet avant que le `finally` du verrou n'ait tourné, et
      // c'est le verrou qu'on mesure ici.
      await expect(
        useUserPreferencesStore.getState().updatePrivacy({ showOnlineStatus: false })
      ).rejects.toThrow('Failed to update privacy preferences');

      expect(isPreferenceWriteInFlight()).toBe(false);
    });

    it('ne déclare rien quand il n\'y a pas de jeton', async () => {
      mockGetAuthToken.mockReturnValue(null);

      await act(async () => {
        await useUserPreferencesStore.getState().updatePrivacy({ showOnlineStatus: false });
      });

      expect(isPreferenceWriteInFlight()).toBe(false);
    });
  });

  // ─── initialize ──────────────────────────────────────────────────────────────

  describe('initialize', () => {
    it('sets isInitialized:true when no auth token (guest mode)', async () => {
      mockGetAuthToken.mockReturnValue(null);

      await act(async () => {
        await useUserPreferencesStore.getState().initialize();
      });

      const state = useUserPreferencesStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('syncs all prefs on success and sets isInitialized + lastSyncedAt', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeOkResponse({}));

      await act(async () => {
        await useUserPreferencesStore.getState().initialize();
      });

      const state = useUserPreferencesStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.lastSyncedAt).not.toBeNull();
      expect(state.error).toBeNull();
    });

    it("n'horodate RIEN quand aucune lecture n'a rendu de données", async () => {
      // Le défaut du cycle 134 : `syncAll()` absorbait l'échec de ses quatre
      // `GET`, donc une passe entièrement ratée posait `lastSyncedAt` comme une
      // passe réussie. Un onglet ouvert hors ligne déclarait une hydratation
      // qui n'avait rien lu.
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockRejectedValue(new Error('network failure'));

      await act(async () => {
        await useUserPreferencesStore.getState().initialize();
      });

      const state = useUserPreferencesStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.lastSyncedAt).toBeNull();
      expect(state.error).toBe('Failed to load preferences');
    });

    it("laisse l'horodatage PRÉCÉDENT intact quand la passe ne lit rien", async () => {
      act(() => {
        useUserPreferencesStore.setState({ lastSyncedAt: '2026-01-01T00:00:00.000Z' });
      });
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeErrorResponse());

      await act(async () => {
        await useUserPreferencesStore.getState().initialize();
      });

      expect(useUserPreferencesStore.getState().lastSyncedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it("horodate dès qu'UNE seule lecture a rendu des données", async () => {
      // `some`, jamais `every` : un point de terminaison absent en permanence
      // — `privacy` l'a été — supprimerait sinon l'horodatage à vie, et le
      // rattrapage de reconnexion serait dû à CHAQUE connexion pour zéro
      // fraîcheur de plus.
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockImplementation((url: string) =>
        url.includes('/preferences/notification') ? makeOkResponse({}) : makeErrorResponse(),
      );

      await act(async () => {
        await useUserPreferencesStore.getState().initialize();
      });

      const state = useUserPreferencesStore.getState();
      expect(state.lastSyncedAt).not.toBeNull();
      expect(state.error).toBeNull();
    });
  });

  // ─── le contrat de lecture des sync* ─────────────────────────────────────────

  describe('contrat de lecture des sync*', () => {
    const readers = [
      'syncNotifications',
      'syncEncryption',
      'syncEncryptionKeys',
      'syncPrivacy',
    ] as const;

    it.each(readers)('%s rend true quand des données serveur ont été appliquées', async (method) => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeOkResponse({}));

      await act(async () => {
        await expect(useUserPreferencesStore.getState()[method]()).resolves.toBe(true);
      });
    });

    it.each(readers)('%s rend false sans jeton', async (method) => {
      mockGetAuthToken.mockReturnValue(null);

      await act(async () => {
        await expect(useUserPreferencesStore.getState()[method]()).resolves.toBe(false);
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each(readers)('%s rend false sur un statut non-2xx', async (method) => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeErrorResponse());

      await act(async () => {
        await expect(useUserPreferencesStore.getState()[method]()).resolves.toBe(false);
      });
    });

    it.each(readers)('%s rend false sur une enveloppe sans données', async (method) => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(
        Promise.resolve({ ok: true, json: () => Promise.resolve({ success: false }) } as Response),
      );

      await act(async () => {
        await expect(useUserPreferencesStore.getState()[method]()).resolves.toBe(false);
      });
    });

    it.each(readers)('%s rend false quand le réseau tombe', async (method) => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockRejectedValue(new Error('network error'));

      await act(async () => {
        await expect(useUserPreferencesStore.getState()[method]()).resolves.toBe(false);
      });
    });

    it('syncAll rend false quand les QUATRE lectures échouent', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockRejectedValue(new Error('network error'));

      await act(async () => {
        await expect(useUserPreferencesStore.getState().syncAll()).resolves.toBe(false);
      });
    });

    it("syncAll rend true dès qu'une lecture aboutit", async () => {
      mockGetAuthToken.mockReturnValue('tok');
      // #4178 : syncEncryptionKeys lit désormais GET /me?expand=security,
      // plus /me/preferences/encryption — seule requête qu'on laisse aboutir
      // pour prouver que syncAll ne dépend d'AUCUNE lecture en particulier.
      mockFetch.mockImplementation((url: string) =>
        url.includes('/me?expand=security') ? makeOkResponse({}) : makeErrorResponse(),
      );

      await act(async () => {
        await expect(useUserPreferencesStore.getState().syncAll()).resolves.toBe(true);
      });
    });
  });

  // ─── module-level helpers ────────────────────────────────────────────────────

  describe('initializeUserPreferences', () => {
    it('calls initialize when store is not yet initialized', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockResolvedValue(makeOkResponse({}));

      await act(async () => {
        await initializeUserPreferences();
      });

      expect(useUserPreferencesStore.getState().isInitialized).toBe(true);
    });

    it('skips initialize when already initialized', async () => {
      act(() => {
        useUserPreferencesStore.setState({ isInitialized: true });
      });

      await act(async () => {
        await initializeUserPreferences();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('resetUserPreferences', () => {
    it('resets the store to default state', () => {
      act(() => {
        useUserPreferencesStore.setState({ isInitialized: true, error: 'err' });
      });

      act(() => {
        resetUserPreferences();
      });

      expect(useUserPreferencesStore.getState().isInitialized).toBe(false);
      expect(useUserPreferencesStore.getState().error).toBeNull();
    });
  });
});
