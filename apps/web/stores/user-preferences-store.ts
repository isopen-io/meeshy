import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { trackPreferenceWrite } from '@/lib/preferences/preference-write-lock';
import { DEFAULT_PUBLICATION_VISIBILITY } from '@meeshy/shared/types/post';
import type {
  NotificationPreference,
  PrivacyPreference,
} from '@meeshy/shared/types/preferences';

export type { EncryptionPreference } from '@meeshy/shared/types';

export type StoreNotificationPreferences = Pick<
  NotificationPreference,
  | 'pushEnabled'
  | 'emailEnabled'
  | 'soundEnabled'
  | 'newMessageEnabled'
  | 'missedCallEnabled'
  | 'systemEnabled'
  | 'conversationEnabled'
  | 'replyEnabled'
  | 'mentionEnabled'
  | 'reactionEnabled'
  | 'contactRequestEnabled'
  | 'memberJoinedEnabled'
  | 'dndEnabled'
  | 'dndStartTime'
  | 'dndEndTime'
>;

export type EncryptionPreferences = Pick<
  PrivacyPreference,
  | 'encryptionPreference'
  | 'autoEncryptNewConversations'
  | 'showEncryptionStatus'
  | 'warnOnUnencrypted'
>;

export type StorePrivacyPreferences = Pick<
  PrivacyPreference,
  | 'showOnlineStatus'
  | 'showLastSeen'
  | 'showReadReceipts'
  | 'showTypingIndicator'
  | 'allowContactRequests'
  | 'allowGroupInvites'
  | 'saveMediaToGallery'
  | 'allowAnalytics'
>;

export interface LanguagePreferences {
  preferredLanguage: string;
  translationEnabled: boolean;
  autoTranslate: boolean;
  translationTargetLanguage: string;
}

export interface StoryPreferences {
  defaultVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  storyNotificationsEnabled: boolean;
}

/**
 * Server state, not a preference: whether a `SignalPreKeyBundle` row exists for
 * this user. Written by `POST /signal/keys`, reported by
 * `GET /me/preferences/encryption`.
 *
 * It cannot ride on the user object: `userSchema` — the response schema
 * fast-json-stringify serializes `GET /auth/me` through — declares no signal
 * field, so any the handler sets is dropped before the body is written.
 */
export interface EncryptionKeyStatus {
  hasSignalKeys: boolean;
  signalRegistrationId: number | null;
  lastKeyRotation: string | null;
}

export interface UserPreferencesState {
  notifications: StoreNotificationPreferences;
  encryption: EncryptionPreferences;
  encryptionKeys: EncryptionKeyStatus;
  privacy: StorePrivacyPreferences;
  language: LanguagePreferences;
  story: StoryPreferences;

  // Loading states
  isLoading: boolean;
  isInitialized: boolean;
  /**
   * Quand cette SESSION a lu des préférences du serveur — `null` tant qu'elle
   * n'en a lu aucune.
   *
   * Une seule question, et c'est ce qui le rend utilisable : son unique lecteur
   * (`preference-rehydration`) demande « cet onglet a-t-il été rempli ? », pas
   * « quand l'a-t-il été la dernière fois ». Le champ n'est donc PAS persisté
   * (voir `partialize` et la migration v2) : restauré d'une session
   * précédente, il répondrait à la seconde question en faisant croire à la
   * première.
   */
  lastSyncedAt: string | null;

  // Error state
  error: string | null;
}

export interface UserPreferencesActions {
  // Initialization
  initialize: () => Promise<void>;
  reset: () => void;

  /**
   * Les cinq lectures rendent le SUCCÈS plutôt que de l'absorber : `true` ⇒ des
   * données SERVEUR ont été lues et appliquées.
   *
   * `false` couvre indistinctement l'absence de jeton, le réseau tombé, un
   * statut non-2xx et une enveloppe sans données — quatre façons de n'avoir
   * rien lu. Ce qui a été appliqué au store, jamais ce qui a été tenté : c'est
   * la seule question à laquelle `lastSyncedAt` doit répondre.
   */
  syncAll: () => Promise<boolean>;
  syncNotifications: () => Promise<boolean>;
  syncEncryption: () => Promise<boolean>;
  syncEncryptionKeys: () => Promise<boolean>;
  syncPrivacy: () => Promise<boolean>;

  updateNotifications: (prefs: Partial<StoreNotificationPreferences>) => Promise<void>;
  updateEncryption: (prefs: Partial<EncryptionPreferences>) => Promise<void>;
  updateEncryptionLocalSettings: (settings: Partial<EncryptionPreferences>) => Promise<void>;
  updatePrivacy: (prefs: Partial<StorePrivacyPreferences>) => Promise<void>;
  updateLanguage: (prefs: Partial<LanguagePreferences>) => void;
  updateStory: (prefs: Partial<StoryPreferences>) => void;

  // Utility checks
  shouldShowEncryptionWarning: (conversationEncrypted: boolean) => boolean;
  isInDndPeriod: () => boolean;
  canReceiveNotification: (type: keyof StoreNotificationPreferences) => boolean;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_NOTIFICATION_PREFERENCES: StoreNotificationPreferences = {
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
};

const DEFAULT_ENCRYPTION_PREFERENCES: EncryptionPreferences = {
  encryptionPreference: 'optional',
  autoEncryptNewConversations: false,
  showEncryptionStatus: true,
  warnOnUnencrypted: false,
};

const DEFAULT_ENCRYPTION_KEY_STATUS: EncryptionKeyStatus = {
  hasSignalKeys: false,
  signalRegistrationId: null,
  lastKeyRotation: null,
};

const DEFAULT_PRIVACY_PREFERENCES: StorePrivacyPreferences = {
  showOnlineStatus: true,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: true,
  allowContactRequests: true,
  allowGroupInvites: true,
  saveMediaToGallery: false,
  allowAnalytics: true,
};

const DEFAULT_LANGUAGE_PREFERENCES: LanguagePreferences = {
  preferredLanguage: 'fr',
  translationEnabled: true,
  autoTranslate: false,
  translationTargetLanguage: 'fr',
};

const DEFAULT_STORY_PREFERENCES: StoryPreferences = {
  defaultVisibility: DEFAULT_PUBLICATION_VISIBILITY,
  storyNotificationsEnabled: true,
};

/**
 * Ce qu'une écriture a le droit d'envoyer : les clés que L'APPELANT a soumises,
 * et rien d'autre.
 *
 * Les trois écritures envoyaient un instantané de DOCUMENT ENTIER
 * (`get().privacy`, `get().notifications`) sur un `PUT` que la passerelle traite
 * en REMPLACEMENT — `update: { [category]: validated }`, Zod comblant les clés
 * absentes par leurs `default()`. Or chaque tranche du store est un
 * SOUS-ENSEMBLE STRICT de son document, et la tranche `privacy` ne peut pas même
 * en porter le bloc chiffrement : `syncPrivacy` l'en retire, `EncryptionPreferences`
 * en est le seul porteur. Basculer un réglage de confidentialité remettait donc
 * les quatre réglages de chiffrement aux défauts — plus d'auto-chiffrement des
 * conversations neuves, sans un signe.
 *
 * Envoyer le SOUMIS retire la dépendance à la fidélité de la tranche : le
 * serveur fusionne par `submittedKeysOnly` sur ce qu'il obéit déjà, donc ce
 * qu'on ne nomme pas ne bouge pas. C'est la forme qu'Android applique déjà et
 * qu'il documente (`PrivacyPreferenceSyncBody` : « a body that omits the
 * encryption keys leaves the server's encryption preferences untouched instead
 * of silently stamping the device defaults over a value the user may have set on
 * web/iOS »). Elle ferme au passage l'écrasement concurrent : un voisin changé
 * sur un AUTRE appareil n'est plus annulé par une bascule sans rapport.
 *
 * `undefined` est retiré parce que `JSON.stringify` le retire de toute façon —
 * sans quoi la garde « aucune clé » compterait une clé que le serveur ne verra
 * jamais, et paierait un aller-retour, un journal de mutation et une diffusion
 * `preferences:updated` pour zéro changement.
 */
const submittedKeys = <T extends object>(prefs: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(prefs).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

const DEFAULT_STATE: UserPreferencesState = {
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  encryption: DEFAULT_ENCRYPTION_PREFERENCES,
  encryptionKeys: DEFAULT_ENCRYPTION_KEY_STATUS,
  privacy: DEFAULT_PRIVACY_PREFERENCES,
  language: DEFAULT_LANGUAGE_PREFERENCES,
  story: DEFAULT_STORY_PREFERENCES,
  isLoading: false,
  isInitialized: false,
  lastSyncedAt: null,
  error: null,
};

// ============================================================================
// PERSISTED STATE MIGRATION
// ============================================================================

/**
 * v1 (2026-08-23) — l'audience par défaut d'une story passe de `FRIENDS` à
 * `PUBLIC`, alignée sur les posts et les réels.
 *
 * Sans cette migration, la bascule ne toucherait que les NOUVEAUX navigateurs :
 * tout onglet ayant déjà ouvert Meeshy porte `story.defaultVisibility:
 * 'FRIENDS'` gravé dans `localStorage` et le rejouerait indéfiniment. C'est ce
 * qui rend l'application IMMÉDIATE, pas différée au prochain vidage de cache.
 *
 * La réécriture est ciblée : seul l'ANCIEN DÉFAUT littéral est remplacé. Une
 * valeur posée par l'utilisateur via `updateStory` (`PRIVATE`, ou `FRIENDS`
 * re-choisi après la bascule — version courante) survit intacte.
 *
 * v2 (2026-08-28) — `lastSyncedAt` cesse d'être persisté (voir sa
 * documentation d'état). Retirer le champ de `partialize` ne suffit PAS : la
 * fusion par défaut de `persist` repose l'état persisté PAR-DESSUS l'état
 * initial, donc un blob écrit par la v1 réinjecterait son horodatage à chaque
 * chargement jusqu'à la première écriture. C'est la migration qui le retire.
 */
export const USER_PREFERENCES_STORE_VERSION = 2;

/**
 * Ce que `partialize` écrit — plus `lastSyncedAt`, que seules les versions ≤ 1
 * écrivaient et que la migration v2 retire.
 */
export type PersistedUserPreferences = Partial<
  Pick<
    UserPreferencesState,
    'notifications' | 'encryption' | 'encryptionKeys' | 'privacy' | 'language' | 'story'
  >
> & { lastSyncedAt?: string | null };

const LEGACY_DEFAULT_STORY_VISIBILITY: StoryPreferences['defaultVisibility'] = 'FRIENDS';

const migrateStoryDefaultVisibility = (
  state: PersistedUserPreferences,
): PersistedUserPreferences => {
  const story = state.story;
  if (!story || story.defaultVisibility !== LEGACY_DEFAULT_STORY_VISIBILITY) return state;

  return {
    ...state,
    story: { ...story, defaultVisibility: DEFAULT_STORY_PREFERENCES.defaultVisibility },
  };
};

const dropPersistedLastSyncedAt = ({
  lastSyncedAt: _lastSyncedAt,
  ...state
}: PersistedUserPreferences): PersistedUserPreferences => state;

/**
 * Les étapes s'appliquent en CHAÎNE, chacune portant la version qui l'a
 * introduite : un blob v0 les traverse toutes, un blob v1 les suivantes. Une
 * sortie anticipée sur la version courante ne dirait plus laquelle sauter, et
 * la table rend la garde impossible à oublier en ajoutant la prochaine.
 */
const MIGRATIONS: ReadonlyArray<{
  to: number;
  apply: (state: PersistedUserPreferences) => PersistedUserPreferences;
}> = [
  { to: 1, apply: migrateStoryDefaultVisibility },
  { to: 2, apply: dropPersistedLastSyncedAt },
];

/**
 * Une version ABSENTE est la plus ANCIENNE, jamais la plus récente. Un blob
 * antérieur au versionnage n'en porte aucune, et `persist` transmet alors
 * `undefined` : comparé à un nombre, il rend `false` des DEUX côtés — donc un
 * `from < step.to` non normalisé sauterait toutes les étapes pour les états qui
 * en ont le plus besoin.
 */
export const migrateUserPreferences = (
  persistedState: PersistedUserPreferences | null | undefined,
  version: number | undefined,
): PersistedUserPreferences => {
  const from = typeof version === 'number' && Number.isFinite(version) ? version : 0;

  return MIGRATIONS.reduce(
    (state, step) => (from < step.to ? step.apply(state) : state),
    persistedState ?? {},
  );
};

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useUserPreferencesStore = create<UserPreferencesState & UserPreferencesActions>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      // ========================================================================
      // INITIALIZATION
      // ========================================================================

      initialize: async () => {
        const token = authManager.getAuthToken();
        if (!token) {
          set({ isInitialized: true });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const hydrated = await get().syncAll();
          set(
            hydrated
              ? { isInitialized: true, lastSyncedAt: new Date().toISOString() }
              : { isInitialized: true, error: 'Failed to load preferences' },
          );
        } catch (error) {
          console.error('[UserPreferencesStore] Initialization error:', error);
          set({ error: 'Failed to load preferences', isInitialized: true });
        } finally {
          set({ isLoading: false });
        }
      },

      reset: () => {
        set(DEFAULT_STATE);
      },

      // ========================================================================
      // SYNC METHODS
      // ========================================================================

      /**
       * `some`, jamais `every` : une lecture qui aboutit a rempli le store, et
       * c'est ce que `lastSyncedAt` doit dire.
       *
       * Exiger les quatre ferait dépendre l'horodatage du point de terminaison
       * le plus fragile — `/me/preferences/privacy` a été absent pendant toute
       * une période, son `catch` en garde encore la trace. Un `every` aurait
       * alors supprimé l'horodatage à VIE, et le rattrapage de reconnexion
       * serait devenu dû à CHAQUE connexion, pour zéro fraîcheur de plus.
       */
      syncAll: async () => {
        const reads = await Promise.all([
          get().syncNotifications(),
          get().syncEncryption(),
          get().syncEncryptionKeys(),
          get().syncPrivacy(),
        ]);
        return reads.some(Boolean);
      },

      syncNotifications: async () => {
        const token = authManager.getAuthToken();
        if (!token) return false;

        try {
          const response = await fetch(buildApiUrl('/me/preferences/notification'), {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (!response.ok) return false;

          const data = await response.json();
          if (!data.success || !data.data) return false;

          const { id, userId, isDefault, createdAt, updatedAt, ...prefs } = data.data;
          set(state => ({
            notifications: { ...state.notifications, ...prefs }
          }));
          return true;
        } catch (error) {
          console.error('[UserPreferencesStore] Error syncing notifications:', error);
          return false;
        }
      },

      syncEncryption: async () => {
        const token = authManager.getAuthToken();
        if (!token) return false;

        try {
          // Encryption preferences are now part of privacy preferences
          const response = await fetch(buildApiUrl('/me/preferences/privacy'), {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (!response.ok) return false;

          const data = await response.json();
          if (!data.success || !data.data) return false;

          // Extract encryption-related fields from privacy preferences
          const {
            encryptionPreference,
            autoEncryptNewConversations,
            showEncryptionStatus,
            warnOnUnencrypted
          } = data.data;

          set(state => ({
            encryption: {
              ...state.encryption,
              encryptionPreference: encryptionPreference || 'optional',
              autoEncryptNewConversations: autoEncryptNewConversations ?? false,
              showEncryptionStatus: showEncryptionStatus ?? true,
              warnOnUnencrypted: warnOnUnencrypted ?? false,
            }
          }));
          return true;
        } catch (error) {
          console.error('[UserPreferencesStore] Error syncing encryption:', error);
          return false;
        }
      },

      syncEncryptionKeys: async () => {
        const token = authManager.getAuthToken();
        if (!token) return false;

        try {
          const response = await fetch(buildApiUrl('/me/preferences/encryption'), {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (!response.ok) return false;

          const data = await response.json();
          if (!data.success || !data.data) return false;

          const { hasSignalKeys, signalRegistrationId, lastKeyRotation } = data.data;

          set({
            encryptionKeys: {
              hasSignalKeys: hasSignalKeys === true,
              signalRegistrationId: signalRegistrationId ?? null,
              lastKeyRotation: lastKeyRotation ?? null,
            }
          });
          return true;
        } catch (error) {
          // Le dernier statut connu reste affiché : une panne réseau n'est pas
          // la preuve que l'utilisateur a perdu ses clés.
          console.error('[UserPreferencesStore] Error syncing encryption keys:', error);
          return false;
        }
      },

      syncPrivacy: async () => {
        const token = authManager.getAuthToken();
        if (!token) return false;

        try {
          const response = await fetch(buildApiUrl('/me/preferences/privacy'), {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (!response.ok) return false;

          const data = await response.json();
          if (!data.success || !data.data) return false;

          // Filter out encryption-related fields (they're synced separately)
          const {
            id,
            userId,
            createdAt,
            updatedAt,
            encryptionPreference,
            autoEncryptNewConversations,
            showEncryptionStatus,
            warnOnUnencrypted,
            ...prefs
          } = data.data;

          set(state => ({
            privacy: { ...state.privacy, ...prefs }
          }));
          return true;
        } catch (error) {
          // Privacy endpoint might not exist yet - use defaults
          console.warn('[UserPreferencesStore] Privacy endpoint not available, using defaults');
          return false;
        }
      },

      // ========================================================================
      // UPDATE METHODS
      // ========================================================================

      updateNotifications: async (prefs) => {
        const token = authManager.getAuthToken();
        if (!token) return;

        // `StoreNotificationPreferences` est un `Pick` de 14 des 33 champs du
        // schéma : un remplacement construit sur cette tranche remettait aux
        // défauts les dix-neuf autres — `callsEnabled`, `dndDays`,
        // `dndUtcOffsetMinutes`, les sept bascules sociales — dès que
        // l'hydratation n'avait pas abouti.
        const submitted = submittedKeys(prefs);
        if (Object.keys(submitted).length === 0) return;

        // Optimistic update
        set(state => ({
          notifications: { ...state.notifications, ...submitted }
        }));

        try {
          const response = await fetch(buildApiUrl('/me/preferences/notification'), {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(submitted),
          });

          if (!response.ok) {
            // Revert on error
            await get().syncNotifications();
            throw new Error('Failed to update notification preferences');
          }
        } catch (error) {
          console.error('[UserPreferencesStore] Error updating notifications:', error);
          throw error;
        }
      },

      updateEncryption: async (prefs) => {
        const token = authManager.getAuthToken();
        if (!token) return;

        const submitted = submittedKeys(prefs);
        if (Object.keys(submitted).length === 0) return;

        // Optimistic update
        set(state => ({
          encryption: { ...state.encryption, ...submitted }
        }));

        return trackPreferenceWrite(async () => {
          try {
            // Le chiffrement vit dans le document `privacy`, et c'est tout ce
            // que ce site en sait : il n'a rien à dire des réglages de
            // confidentialité voisins. Les réaffirmer depuis la tranche locale
            // — ce que faisait `...currentPrivacy` — annulait un réglage changé
            // sur un AUTRE appareil à chaque bascule de chiffrement, et
            // estampait les huit défauts de la tranche quand l'hydratation
            // n'avait pas abouti.
            const response = await fetch(buildApiUrl('/me/preferences/privacy'), {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(submitted),
            });

            if (!response.ok) {
              // Revert on error
              await get().syncEncryption();
              throw new Error('Failed to update encryption preferences');
            }
          } catch (error) {
            console.error('[UserPreferencesStore] Error updating encryption:', error);
            throw error;
          }
        });
      },

      updateEncryptionLocalSettings: async (settings) => {
        // Deprecated: localSettings are now top-level encryption preferences
        // Just call updateEncryption with the settings
        await get().updateEncryption(settings);
      },

      updatePrivacy: async (prefs) => {
        const token = authManager.getAuthToken();
        if (!token) return;

        const submitted = submittedKeys(prefs);
        if (Object.keys(submitted).length === 0) return;

        // Optimistic update
        set(state => ({
          privacy: { ...state.privacy, ...submitted }
        }));

        return trackPreferenceWrite(async () => {
          try {
            // `PATCH`, jamais `PUT` : la tranche `privacy` ne porte PAS le bloc
            // chiffrement du même document (`syncPrivacy` l'en retire), donc un
            // remplacement construit sur elle remettait `encryptionPreference`,
            // `autoEncryptNewConversations`, `showEncryptionStatus` et
            // `warnOnUnencrypted` aux défauts de Zod — à chaque bascule d'un
            // réglage sans rapport.
            const response = await fetch(buildApiUrl('/me/preferences/privacy'), {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(submitted),
            });

            if (!response.ok) {
              await get().syncPrivacy();
              throw new Error('Failed to update privacy preferences');
            }
          } catch (error) {
            console.error('[UserPreferencesStore] Error updating privacy:', error);
            throw error;
          }
        });
      },

      updateLanguage: (prefs) => {
        set(state => ({
          language: { ...state.language, ...prefs }
        }));
      },

      updateStory: (prefs) => {
        set(state => ({
          story: { ...state.story, ...prefs }
        }));
      },

      // ========================================================================
      // UTILITY CHECKS
      // ========================================================================

      shouldShowEncryptionWarning: (conversationEncrypted: boolean) => {
        const { encryption } = get();

        // Show warning if user prefers encryption but conversation is not encrypted
        if (encryption.encryptionPreference === 'always' && !conversationEncrypted) {
          return true;
        }

        // Show warning based on user preference
        if (encryption.warnOnUnencrypted && !conversationEncrypted) {
          return true;
        }

        return false;
      },

      isInDndPeriod: () => {
        const { notifications } = get();

        if (!notifications.dndEnabled) return false;

        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const startTime = notifications.dndStartTime || '22:00';
        const endTime = notifications.dndEndTime || '08:00';

        // Handle overnight DND periods (e.g., 22:00 - 08:00)
        if (startTime > endTime) {
          return currentTime >= startTime || currentTime < endTime;
        }

        return currentTime >= startTime && currentTime < endTime;
      },

      canReceiveNotification: (type) => {
        const { notifications } = get();
        const state = get();

        // Check if in DND period
        if (state.isInDndPeriod()) return false;

        // Check global toggle
        if (!notifications.pushEnabled) return false;

        // Check specific type
        const key = type as keyof StoreNotificationPreferences;
        if (typeof notifications[key] === 'boolean') {
          return notifications[key] as boolean;
        }

        return true;
      },
    }),
    {
      name: 'meeshy-user-preferences',
      version: USER_PREFERENCES_STORE_VERSION,
      migrate: (persistedState, version) =>
        migrateUserPreferences(persistedState as PersistedUserPreferences, version),
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist these fields
        notifications: state.notifications,
        encryption: state.encryption,
        encryptionKeys: state.encryptionKeys,
        privacy: state.privacy,
        language: state.language,
        story: state.story,
      }),
    }
  )
);

// ============================================================================
// HOOKS FOR SPECIFIC PREFERENCE CATEGORIES
// ============================================================================

/**
 * Hook for notification preferences only
 */
export const useNotificationPreferences = () => {
  return useUserPreferencesStore(useShallow(state => ({
    preferences: state.notifications,
    update: state.updateNotifications,
    sync: state.syncNotifications,
    canReceive: state.canReceiveNotification,
    isInDnd: state.isInDndPeriod,
  })));
};

/**
 * Hook for encryption preferences only
 */
export const useEncryptionPreferences = () => {
  return useUserPreferencesStore(useShallow(state => ({
    preferences: state.encryption,
    keyStatus: state.encryptionKeys,
    update: state.updateEncryption,
    updateLocalSettings: state.updateEncryptionLocalSettings,
    sync: state.syncEncryption,
    syncKeys: state.syncEncryptionKeys,
    shouldShowWarning: state.shouldShowEncryptionWarning,
  })));
};

/**
 * Hook for privacy preferences only
 */
export const usePrivacyPreferences = () => {
  return useUserPreferencesStore(useShallow(state => ({
    preferences: state.privacy,
    update: state.updatePrivacy,
    sync: state.syncPrivacy,
  })));
};

/**
 * Hook for language preferences only
 */
export const useLanguagePreferencesFromStore = () => {
  return useUserPreferencesStore(useShallow(state => ({
    preferences: state.language,
    update: state.updateLanguage,
  })));
};

/**
 * Hook for story preferences only
 */
export const useStoryPreferences = () => {
  return useUserPreferencesStore(useShallow(state => ({
    preferences: state.story,
    update: state.updateStory,
  })));
};

// ============================================================================
// INITIALIZATION HELPER
// ============================================================================

/**
 * Initialize preferences store when user logs in
 * Call this from the auth flow after successful login
 */
export const initializeUserPreferences = async () => {
  const store = useUserPreferencesStore.getState();
  if (!store.isInitialized) {
    await store.initialize();
  }
};

/**
 * Reset preferences store when user logs out
 * Call this from the auth flow on logout
 */
export const resetUserPreferences = () => {
  useUserPreferencesStore.getState().reset();
};
