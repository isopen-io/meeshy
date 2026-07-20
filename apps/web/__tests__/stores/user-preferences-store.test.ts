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
  buildApiUrl: (path: string) => `https://api.meeshy.test/api/v1${path}`,
}));

global.fetch = jest.fn();
const mockFetch = global.fetch as jest.Mock;

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  useUserPreferencesStore,
  initializeUserPreferences,
  resetUserPreferences,
} from '@/stores/user-preferences-store';

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
        defaultVisibility: 'FRIENDS',
        storyNotificationsEnabled: true,
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

    it('still completes initialization even when individual syncs fail (errors are swallowed)', async () => {
      // Sync methods catch their own errors — initialize never hits its catch block.
      // Verify: network failure → still initialized, no error state, isLoading cleared.
      mockGetAuthToken.mockReturnValue('tok');
      mockFetch.mockRejectedValue(new Error('network failure'));

      await act(async () => {
        await useUserPreferencesStore.getState().initialize();
      });

      const state = useUserPreferencesStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull(); // sync methods swallow errors
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
