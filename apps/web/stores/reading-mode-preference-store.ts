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
// REV-4bis/B2 — la reprise de l'ancienne clé traduit un vocabulaire de RENDU
// (`focal/script/bubble`) vers celui de la PRÉFÉRENCE. La table de traduction
// vit à côté de l'énumération qu'elle traduit, jamais recopiée ici.
import { isReadingMode, preferenceFromReadingMode } from '@/lib/conversations/reading-mode';

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

// =============================================================================
// REV-4bis/B2 — HYDRATATION + MIGRATION ONE-SHOT
// =============================================================================

/**
 * L'ancienne clé du magasin `zustand/persist` de `reading-mode-store`
 * (`meeshy-reading-mode`), celle que la façade ne produit plus. Exportée pour
 * que les témoins la nomment sans la recopier, et pour que la garde
 * d'occurrence unique ait une adresse à surveiller.
 */
export const LEGACY_READING_MODE_STORAGE_KEY = 'meeshy-reading-mode';

/**
 * Marqueur de migration. Sa seule fonction est de rendre la reprise
 * IDEMPOTENTE : un second onglet resté ouvert sur l'ancien code peut
 * ré-hydrater `meeshy-reading-mode` après coup, et cette réapparition ne doit
 * PAS ressusciter des choix que le lecteur a pu changer depuis.
 */
export const READING_MODE_MIGRATION_MARKER_KEY = `${STORAGE_KEY_PREFIX}__migrated-from-v1__`;

type ReadingModeSeed = { readonly conversationId: string; readonly value: ReadingModePreference };

const parsePreference = (raw: unknown): ReadingModePreference | null => {
  const parsed = ReadingModePreferenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

/**
 * Sème des valeurs dans le magasin SANS jamais écraser une entrée existante,
 * et sans faire d'écriture réseau/persistance (l'hydratation relit ce qui est
 * déjà au repos ; la migration, elle, persiste explicitement à côté).
 * Version `0` : la plus basse possible, pour qu'un futur payload serveur
 * (`applyReadingModeUpdate`, version >= 1) l'emporte toujours sur une valeur
 * seulement retrouvée sur cet appareil.
 */
const seedEntries = (seeds: readonly ReadingModeSeed[]): void => {
  if (seeds.length === 0) return;

  const state = useReadingModePreferenceStore.getState();
  const nextEntries = new Map(state.entries);
  let changed = false;

  for (const seed of seeds) {
    if (nextEntries.has(seed.conversationId)) continue;
    nextEntries.set(seed.conversationId, { value: seed.value, version: 0 });
    changed = true;
  }

  if (changed) useReadingModePreferenceStore.setState({ entries: nextEntries });
};

/**
 * Remonte en mémoire ce que l'appareil a déjà au repos sous
 * `meeshy:reading-mode:<conversationId>`.
 *
 * POURQUOI CE PAS EXISTE. `LocalReadingModePreferenceStore.get()` est
 * ASYNCHRONE et par conversation : il ne peut pas servir un sélecteur React
 * synchrone. Sans cette relecture, la façade aurait perdu une propriété que
 * `zustand/persist` assurait GRATUITEMENT à `reading-mode-store` — la
 * survie du choix collant d'une session à l'autre. Ce n'est donc pas un
 * ajout : c'est le remboursement exact de ce que le retrait de `persist`
 * enlève, sans quoi le chemin drapeau-éteint aurait régressé.
 *
 * Scan direct de `localStorage` : c'est la MÊME couche d'injection que
 * `localStoragePersistence` ci-dessus (ce fichier), pas un second lecteur —
 * l'adaptateur gelé ne connaît que `read(key)` et ne sait pas énumérer.
 */
export function hydrateReadingModePreferencesFromStorage(): void {
  if (typeof window === 'undefined') return;

  const seeds: ReadingModeSeed[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key === null || !key.startsWith(STORAGE_KEY_PREFIX)) continue;
      if (key === READING_MODE_MIGRATION_MARKER_KEY) continue;

      const conversationId = key.slice(STORAGE_KEY_PREFIX.length);
      if (conversationId.length === 0) continue;

      const value = parsePreference(window.localStorage.getItem(key));
      // Valeur hors énumération ⇒ SAUTÉE, jamais repliée sur un défaut : une
      // préférence qu'on ne sait pas lire n'est pas une préférence `auto`,
      // c'est une absence de préférence (le défaut s'en charge déjà).
      if (value !== null) seeds.push({ conversationId, value });
    }
  } catch {
    // Navigation privée Safari, quota, `localStorage` désactivé — on repart
    // simplement sans mémoire, comportement documenté comme VALIDE par
    // `LocalReadingModePreferenceStore`.
    return;
  }

  seedEntries(seeds);
}

/**
 * Reprise ONE-SHOT de l'ancienne clé `meeshy-reading-mode`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RÈGLES, ET CE QU'ELLES REFUSENT DE FABRIQUER
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. Une SEULE fois par appareil (marqueur ci-dessus), puis l'ancienne clé est
 *    RETIRÉE. Une réapparition ultérieure n'est plus jamais relue.
 * 2. Le magasin autoritatif GAGNE : une conversation qui y a déjà une valeur
 *    n'est jamais écrasée par l'héritage.
 * 3. Une lentille hors énumération (`'scene'`, une valeur d'une version
 *    future, du JSON cassé) est SAUTÉE — jamais devinée, jamais repliée sur
 *    un défaut qui aurait l'air d'un choix.
 * 4. Les valeurs reprises sont PERSISTÉES sous la nouvelle clé, pas seulement
 *    remontées en mémoire : une migration qui ne survit pas au rechargement
 *    n'en est pas une.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE SORT DES DONNÉES D'UN APPAREIL MULTI-COMPTES — dit en clair
 * ═══════════════════════════════════════════════════════════════════════════
 * L'ancienne clé `meeshy-reading-mode` était GLOBALE À L'APPAREIL : elle ne
 * portait AUCUNE identité. Il est donc structurellement impossible de savoir
 * lequel des comptes ayant utilisé ce navigateur a choisi quoi. Une préférence
 * non scopée ne peut donc être reprise QUE pour l'identité courante — celle
 * qui ouvre l'application la première fois après la mise à jour — et JAMAIS
 * devinée pour les autres. Attribuer ces choix à plusieurs comptes reviendrait
 * à fabriquer, pour chacun d'eux, une donnée que personne n'a écrite.
 *
 * ÉCART À SIGNALER, RE-PROUVÉ PLUTÔT QUE SUPPOSÉ (§0) : la destination n'est
 * pas non plus scopée par identité aujourd'hui. `ReadingModePreferenceScope`
 * (`packages/shared/providers/ReadingModePreferenceStoring.ts`, gelé S1) ne
 * porte QUE `{ conversationId }`, et la clé produite ici est
 * `meeshy:reading-mode:<conversationId>` — sans préfixe d'identité. iOS, lui,
 * A ce préfixe (`meeshy_readmode_<scopeKey>_<id>`, `ReadingModePreferenceStore
 * .swift`), posé en réponse à la fuite privacy multi-comptes du 2026-05-26.
 * La migration N'AGGRAVE donc rien — les deux clés, l'ancienne comme la
 * nouvelle, sont d'appareil — mais elle ne répare pas cet écart, qui la
 * dépasse : il se ferme avec le scope serveur de LWS-3, où la préférence
 * devient une colonne de `UserConversationPreferences`, par utilisateur par
 * construction. Consigné ici pour que la prochaine main le trouve.
 */
export function runLegacyReadingModeMigration(): void {
  if (typeof window === 'undefined') return;

  let raw: string | null;
  try {
    if (window.localStorage.getItem(READING_MODE_MIGRATION_MARKER_KEY) !== null) return;
    raw = window.localStorage.getItem(LEGACY_READING_MODE_STORAGE_KEY);
  } catch {
    return;
  }

  const seeds: ReadingModeSeed[] = [];

  if (raw !== null) {
    try {
      // Forme `zustand/persist` v1 : `{ state: { modes: Record<id, mode> }, version }`.
      const parsed: unknown = JSON.parse(raw);
      const modes = (parsed as { state?: { modes?: unknown } } | null)?.state?.modes;

      if (modes !== null && typeof modes === 'object') {
        for (const [conversationId, legacyMode] of Object.entries(modes as Record<string, unknown>)) {
          if (typeof legacyMode !== 'string' || conversationId.length === 0) continue;
          if (!isReadingMode(legacyMode)) continue;
          seeds.push({ conversationId, value: preferenceFromReadingMode(legacyMode) });
        }
      }
    } catch {
      // JSON illisible : rien n'est repris, et la clé est quand même
      // neutralisée ci-dessous. Laisser en place une valeur qu'on ne sait pas
      // lire ne fait que promettre une reprise qui n'arrivera jamais.
    }
  }

  const before = useReadingModePreferenceStore.getState().entries;
  seedEntries(seeds);
  const after = useReadingModePreferenceStore.getState().entries;

  // Persistance des SEULES entrées réellement adoptées (règle 2 : le magasin
  // autoritatif gagne, donc une conversation déjà connue n'est pas réécrite).
  for (const seed of seeds) {
    if (before.has(seed.conversationId)) continue;
    if (after.get(seed.conversationId)?.value !== seed.value) continue;
    void localReadingModeStore
      .set({ conversationId: seed.conversationId }, seed.value)
      .catch(() => {
        // Persistance indisponible : la valeur reste en mémoire pour cette
        // session. Échouer bruyamment sur une MIGRATION serait pire — elle
        // n'est pas une action de l'utilisateur, il n'a rien à rattraper.
      });
  }

  try {
    window.localStorage.removeItem(LEGACY_READING_MODE_STORAGE_KEY);
    window.localStorage.setItem(READING_MODE_MIGRATION_MARKER_KEY, new Date().toISOString());
  } catch {
    // Cf. ci-dessus — sans marqueur, la reprise sera simplement retentée.
  }
}

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

/**
 * REV-4bis/B2 — AU CHARGEMENT DU MODULE, dans cet ordre et pas l'autre.
 *
 * D'abord l'hydratation (ce que le magasin autoritatif a déjà au repos),
 * ENSUITE la reprise de l'héritage : c'est ce qui donne son sens à la règle
 * « le magasin autoritatif gagne ». L'inverse aurait laissé un vieux choix
 * `meeshy-reading-mode` écraser une préférence écrite depuis le menu Lentille.
 *
 * Les deux sont sans effet côté serveur (`typeof window === 'undefined'`) et
 * sans effet sur un appareil neuf : aucune clé, aucune entrée fabriquée.
 */
hydrateReadingModePreferencesFromStorage();
runLegacyReadingModeMigration();
