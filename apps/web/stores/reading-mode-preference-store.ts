/**
 * Reading Mode Preference Store — WL-106 (LWS-11).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE À CÔTÉ DE `conversation-preferences-store.ts`
 * ═══════════════════════════════════════════════════════════════════════
 * Le contrat (LWS-11) demande une écriture « par `conversation-preferences-
 * store` (optimiste versionnée, comme pin/mute) ». Mais ce même contrat
 * (`tasks/lentille-implementation-contract.md` §1.4, « Fichiers existants
 * LUS mais jamais modifiés ») liste EXPLICITEMENT
 * `conversation-preferences-store.ts` : « Réutilisés VERBATIM. Toute envie
 * de les "améliorer au passage" est hors contrat. » Cette tension est
 * documentée ici plutôt que tranchée en silence (règle RE-PROUVER, workshop
 * §0) : ce fichier réutilise le VRAI store `conversation-preferences-store`
 * TEL QUEL (jamais édité) et lui met à côté un jumeau comportemental —
 * MÊME PATTERN d'écriture optimiste versionnée avec rollback (voir
 * `writeOptimistic` dans le fichier gelé, reproduit ici à l'identique), pour
 * la préférence de mode de lecture, qui n'a pas de champ sur
 * `UserConversationPreferences` (type gelé §3, LWS-0/1 — `readingMode`
 * n'y est PAS ajouté ici : il le sera par LWS-3, sur `UserConversationPreferences`
 * et sa colonne Prisma, jamais avant).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ZÉRO APPEL RÉSEAU NOUVEAU — LE DÉCOUPLAGE E9/G-121
 * ═══════════════════════════════════════════════════════════════════════
 * `LWS-3` (`readingMode` sur `UserConversationPreferences`, route gateway,
 * canal `USER_PREFERENCES_UPDATED`) est planifié APRÈS la Porte V2 — donc
 * après V4 (workshop §5, table V5/G-*). Il n'existe PAS aujourd'hui : il n'y
 * a ni colonne, ni route, ni broadcast à appeler. Écrire quand même « par
 * conversation-preferences-store optimiste versionnée » en V4 signifie donc :
 * le MÉCANISME (écriture immédiate, rollback sur échec, arbitrage par
 * `version`) est prêt et testé maintenant, MAIS `request()` ne fait AUCUNE
 * requête HTTP — il persiste localement, via le substitut LWS-2bis
 * (`LocalReadingModePreferenceStore`, M-047, `packages/shared/providers/
 * local/`), qui N'EST PAS du travail jeté : sa propre docstring promet
 * explicitement qu'il « devient le cache optimiste devant le canal serveur
 * versionné » une fois LWS-3 livré. Cette bascule change l'injection
 * (`request` devient un vrai `PUT`), jamais la forme de ce store ni son API
 * (`getReadingMode`/`setReadingMode`/`applyReadingModeUpdate`).
 *
 * `applyReadingModeUpdate` EST le point d'entrée de réconciliation par
 * version — le futur lecteur du canal `onPreferencesUpdated` (une fois
 * G-121 livré côté serveur) appellera cette même fonction avec le payload
 * reçu. Testé ici indépendamment du canal réel (WL-107), pour que le jour où
 * G-121 atterrit, seul le CÂBLAGE change (brancher l'event listener), jamais
 * la loi d'arbitrage.
 *
 * GARDE SOURCE (même esprit que `LocalReadingModePreferenceStore`) : le seul
 * fichier qui nomme `LocalReadingModePreferenceStore` est CELUI-CI (la
 * couche d'injection). `ReadingModeMenu.tsx`/`LentillePeek.tsx` (la peau)
 * ne le nomment jamais — ils consomment `useReadingModePreference`/
 * `useReadingModePreferenceActions`.
 *
 * @see tasks/lentille-implementation-contract.md LWS-11, LWS-2bis, LWS-3, §3 E9
 * @see packages/shared/providers/ReadingModePreferenceStoring.ts (protocole gelé)
 * @see packages/shared/providers/local/LocalReadingModePreferenceStore.ts (substitut M-047)
 * @see apps/web/stores/conversation-preferences-store.ts (le pattern reproduit, jamais édité)
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { ReadingModePreferenceSchema, type ReadingModePreference } from '@meeshy/shared/types/reading-modes';
import {
  LocalReadingModePreferenceStore,
  type LocalReadingModePreferencePersisting,
} from '@meeshy/shared/providers/local/LocalReadingModePreferenceStore';

const STORAGE_KEY_PREFIX = 'meeshy:reading-mode:';

/**
 * Adaptateur `localStorage` — SSR-safe (`typeof window === 'undefined'` ⇒
 * `undefined`, le substitut retombe en mémoire pure, comportement documenté
 * comme VALIDE par `LocalReadingModePreferenceStore`). Une écriture qui
 * échoue (quota dépassé, navigation privée Safari) PROPAGE — c'est ce que
 * `setReadingMode` ci-dessous rattrape pour son rollback.
 */
const localStoragePersistence: LocalReadingModePreferencePersisting | undefined =
  typeof window === 'undefined'
    ? undefined
    : {
        read(key: string): string | null {
          try {
            return window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`);
          } catch {
            return null;
          }
        },
        write(key: string, value: string): void {
          window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${key}`, value);
        },
      };

/** Singleton d'injection — substitut LWS-2bis, jamais recréé par appel. */
const localReadingModeStore = new LocalReadingModePreferenceStore(localStoragePersistence);

const DEFAULT_PREFERENCE: ReadingModePreference = 'auto';

export interface ReadingModePreferenceEntry {
  readonly value: ReadingModePreference;
  /** Compteur monotone local — même sémantique que `UserConversationPreferences.version` (§3). */
  readonly version: number;
}

interface ReadingModePreferenceState {
  readonly entries: ReadonlyMap<string, ReadingModePreferenceEntry>;
}

interface ReadingModePreferenceActions {
  /** Lecture synchrone — défaut `'auto'` (rend la main à l'orchestrateur), jamais un mode figé. */
  getReadingMode: (conversationId: string) => ReadingModePreference;

  /**
   * Écriture optimiste versionnée — même dance que `writeOptimistic` du
   * store pin/mute (gelé, jamais édité, reproduite ici) : instantané →
   * patch local immédiat (version + 1) → persistance locale → rollback si
   * la persistance échoue ET que personne n'a écrit depuis (identité
   * référentielle, même garde que l'original).
   */
  setReadingMode: (conversationId: string, value: ReadingModePreference) => Promise<void>;

  /**
   * Réconciliation par version — le point d'entrée que le futur canal
   * `onPreferencesUpdated` (G-121) appellera. Un payload de version
   * INFÉRIEURE OU ÉGALE à la version locale est ignoré (même arbitre que
   * `applyRemotePreferences`).
   */
  applyReadingModeUpdate: (conversationId: string, value: ReadingModePreference, version: number) => void;

  reset: () => void;
}

export const useReadingModePreferenceStore = create<
  ReadingModePreferenceState & ReadingModePreferenceActions
>()((set, get) => ({
  entries: new Map(),

  getReadingMode: (conversationId) => get().entries.get(conversationId)?.value ?? DEFAULT_PREFERENCE,

  setReadingMode: async (conversationId, value) => {
    const parsed = ReadingModePreferenceSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error(`[reading-mode-preference-store] valeur hors énumération: ${String(value)}`);
    }

    const snapshot = get().entries.get(conversationId);
    const optimistic: ReadingModePreferenceEntry = {
      value,
      version: (snapshot?.version ?? 0) + 1,
    };

    const optimisticEntries = new Map(get().entries);
    optimisticEntries.set(conversationId, optimistic);
    set({ entries: optimisticEntries });

    try {
      // V4 : substitut local (M-047), ZÉRO appel réseau — voir docstring de
      // fichier. `request()` deviendra un vrai `PUT` derrière ce même point
      // d'injection le jour où LWS-3 livre la route serveur.
      await localReadingModeStore.set({ conversationId }, value);
    } catch (error) {
      // Ne rétracter QUE notre propre écriture — identité référentielle,
      // même garde que `writeOptimistic` (conversation-preferences-store.ts,
      // jamais édité) : un rollback qui écraserait une écriture plus
      // récente serait pire que l'absence de rollback.
      if (get().entries.get(conversationId) === optimistic) {
        const revertEntries = new Map(get().entries);
        if (snapshot) {
          revertEntries.set(conversationId, snapshot);
        } else {
          revertEntries.delete(conversationId);
        }
        set({ entries: revertEntries });
      }
      throw error;
    }
  },

  applyReadingModeUpdate: (conversationId, value, version) => {
    const current = get().entries.get(conversationId);
    if (version <= (current?.version ?? 0)) return;

    const nextEntries = new Map(get().entries);
    nextEntries.set(conversationId, { value, version });
    set({ entries: nextEntries });
  },

  reset: () => set({ entries: new Map() }),
}));

export const useReadingModePreference = (conversationId: string): ReadingModePreference =>
  useReadingModePreferenceStore((state) => state.entries.get(conversationId)?.value ?? DEFAULT_PREFERENCE);

export const useReadingModePreferenceActions = () =>
  useReadingModePreferenceStore(
    useShallow((state) => ({
      getReadingMode: state.getReadingMode,
      setReadingMode: state.setReadingMode,
      applyReadingModeUpdate: state.applyReadingModeUpdate,
      reset: state.reset,
    }))
  );
