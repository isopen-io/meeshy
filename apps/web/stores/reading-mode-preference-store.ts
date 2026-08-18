/**
 * Reading Mode Preference Store — WL-106 (LWS-11), scopé par identité (D-4 / R5-6).
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
 * la préférence de mode de lecture.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * D-4 / R5-6 (2026-08-18) — LA CLÉ DE STOCKAGE WEB A UNE IDENTITÉ
 * ═══════════════════════════════════════════════════════════════════════
 * RE-PROUVÉ avant d'écrire ce lot (grep `readingMode` réseau dans `apps/web`
 * → 0 avant ce commit) : la clé de ce fichier était
 * `meeshy:reading-mode:<conversationId>` — SANS préfixe d'identité. Sur un
 * navigateur partagé, deux comptes qui ouvrent la même conversation se
 * transmettaient leur mode de lecture (fuite de préférence, pas de contenu —
 * inacceptable sur poste partagé, précondition du palier 3 de
 * `tasks/lentille-cloture-phase1.md` §2.4).
 *
 * iOS a SON scope depuis la fuite privacy multi-comptes du 2026-05-26
 * (`ReadingModePreferenceStore.swift`, clés `meeshy_readmode_<scopeKey>_
 * <conversationId>`, `scopeKey` = `u_<userId>` ou `a_<hash(participantId)>` —
 * `ConversationViewerIdentityResolver.swift`). Le type PARTAGÉ, gelé,
 * `ReadingModePreferenceScope` (`packages/shared/providers/
 * ReadingModePreferenceStoring.ts`) ne porte QUE `{ conversationId }` — et
 * n'est PAS amendé ici : le préfixe d'identité est une affaire de clé de
 * stockage WEB, résolue dans CE fichier, jamais dans le protocole partagé
 * (mandat D-4, explicite). `LocalReadingModePreferenceStore` (substitut
 * gelé, `packages/shared/providers/local/`) ne connaît que `conversationId`
 * comme clé (`keyFor(scope) = scope.conversationId`) — c'est donc
 * l'ADAPTATEUR DE PERSISTANCE ci-dessous (`localStoragePersistence`, la
 * seule pièce web-only de ce fichier) qui injecte le scope avant de toucher
 * `localStorage`, exactement comme le contrat le demande.
 *
 * Nouvelle clé : `meeshy:reading-mode:<scopeId>:<conversationId>`, où
 * `scopeId` vaut `u-<userId>` (compte inscrit, `authManager.getCurrentUser()`)
 * ou `a-<participantId>` (session anonyme, `authManager.getAnonymousSession()`
 * — le même champ que le correctif `20111d5b` [anon-join] fait circuler).
 * Sans identité résolvable (état transitoire, SSR, déconnexion en cours) :
 * REPLI MÉMOIRE — `getReadingMode`/`setReadingMode` continuent de fonctionner
 * pour la session en cours (voir `scopedEntryKey` ci-dessous), mais AUCUNE
 * lecture ni écriture ne touche `localStorage`. Jamais de clé non scopée
 * recréée.
 *
 * MIGRATION — LA SÉCURITÉ PRIME SUR LA CONTINUITÉ. Une ancienne clé non
 * scopée (celle d'avant ce commit, `meeshy:reading-mode:<conversationId>`,
 * ou l'antique `meeshy-reading-mode` d'avant REV-4bis/B2) peut appartenir à
 * N'IMPORTE LEQUEL des comptes ayant utilisé ce navigateur. L'ADOPTER pour
 * l'identité qui ouvre l'app en premier après la mise à jour reproduirait
 * EXACTEMENT la fuite que ce lot ferme. Politique retenue : SUPPRESSION
 * one-shot, jamais d'adoption (`runLegacyReadingModeMigration`, plus bas).
 * Perte acceptée : le lecteur re-choisit son mode une fois.
 *
 * PRÉCÉDENT iOS RE-PROUVÉ. `LentilleScopedReadingModePreferenceStore`
 * (`apps/ios/.../Mode/LentilleReadingModeContext.swift`) a affronté la MÊME
 * question pour SA propre ancienne clé non scopée (`meeshy.readingMode.*`,
 * M-047/M-048) et a tranché : « AUCUNE MIGRATION [...] migrer une clé NON
 * scopée vers une clé scopée consisterait à attribuer au premier lecteur
 * venu une préférence qu'un autre compte du même appareil aurait laissée —
 * soit re-commettre la fuite du 2026-05-26 dans le geste même censé la
 * refermer. Ne rien migrer est ici la seule lecture honnête. » Le web va
 * plus loin d'un cran — SUPPRIMER plutôt que simplement laisser en friche —
 * parce que ce fichier connaît déjà (depuis REV-4bis/B2) le patron
 * one-shot/marqueur nécessaire pour le faire proprement, et qu'un
 * `localStorage` qui ne purge jamais ses clés mortes grossit sans fin. La
 * différence est cosmétique (orpheliner vs. supprimer), jamais de sécurité :
 * les deux refusent l'adoption, ce qui est le seul point qui compte.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ZÉRO APPEL RÉSEAU NOUVEAU CÔTÉ LOCAL — LE DÉCOUPLAGE E9/G-121 EST LEVÉ
 * ═══════════════════════════════════════════════════════════════════════
 * Le magasin LOCAL (ce fichier) reste, comme avant D-4, un cache optimiste
 * devant `localStorage` — `localReadingModeStore.set()` ne fait toujours
 * AUCUNE requête réseau. G-121 (route gateway + colonne Prisma
 * `UserConversationPreferences.readingMode`, broadcast versionné
 * `USER_PREFERENCES_UPDATED`) EXISTE désormais et EST branché — mais depuis
 * l'EXTÉRIEUR de ce fichier, par les trois points d'entrée que D-4 ajoute :
 *   (a) `apps/web/hooks/lentille/use-reading-mode-server-sync.ts` — au
 *       chargement d'un fil, la préférence serveur (si présente) prime sur
 *       le repli local scopé, via `applyReadingModeUpdate` ci-dessous —
 *       LE MÊME arbitre de version que (b), réutilisé, pas réinventé ;
 *   (b) `apps/web/lib/conversations/reading-mode-broadcast.ts`, consommé par
 *       `apps/web/hooks/queries/use-socket-cache-sync.ts` — le broadcast
 *       versionné `USER_PREFERENCES_UPDATED` (scope conversation), gardé par
 *       le drapeau web du fil (`useReadingModesFlag`), comme le fait
 *       `MeeshyApp.swift:onReadingModePreferenceChanged` côté iOS (gardé par
 *       `isReadingModesEnabled`) ;
 *   (c) `setReadingMode` ci-dessous — un choix EXPLICITE écrit la route en
 *       tâche de fond (fire-and-forget, échec silencieux — iOS ne l'a pas
 *       encore fait à ce jour, cf. docstring de `setReadingMode`), UNIQUEMENT
 *       pour une identité INSCRITE (la route exige `fastify.authenticate` —
 *       aucune route pour les comptes anonymes, D-4 point 4).
 * `applyReadingModeUpdate` reste EXACTEMENT ce que sa docstring d'origine
 * annonçait : « le point d'entrée que le futur canal `onPreferencesUpdated`
 * (G-121) appellera ». Ce futur est arrivé ; la fonction n'a pas changé.
 *
 * @see tasks/lentille-implementation-contract.md LWS-11, LWS-2bis, LWS-3, §3 E9
 * @see tasks/lentille-cloture-phase1.md D-4, R5-6
 * @see packages/shared/providers/ReadingModePreferenceStoring.ts (protocole gelé)
 * @see packages/shared/providers/local/LocalReadingModePreferenceStore.ts (substitut M-047)
 * @see apps/web/stores/conversation-preferences-store.ts (le pattern reproduit, jamais édité)
 * @see apps/ios/Meeshy/Features/Main/Focal/Preferences/ConversationViewerIdentityResolver.swift (le résolveur d'identité jumeau)
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { ReadingModePreferenceSchema, type ReadingModePreference } from '@meeshy/shared/types/reading-modes';
import {
  LocalReadingModePreferenceStore,
  type LocalReadingModePreferencePersisting,
} from '@meeshy/shared/providers/local/LocalReadingModePreferenceStore';
import { authManager } from '@/services/auth-manager.service';
import { writeReadingModePreferenceToServer } from '@/services/reading-mode-sync.service';

const STORAGE_KEY_PREFIX = 'meeshy:reading-mode:';

// =============================================================================
// D-4 / R5-6 — RÉSOLUTION DE L'IDENTITÉ, CÔTÉ WEB SEULEMENT
// =============================================================================

/**
 * L'identité du lecteur ACTUEL, telle que ce magasin la voit — le pendant web
 * de `ConversationViewerIdentity` (iOS, `ConversationViewerIdentityResolver.
 * swift`). Compte inscrit d'abord (même précédence qu'iOS et que
 * `CrashDiagnosticsManager.setUserID(isAuth ? ... : nil)` dans
 * `MeeshyApp.swift`) ; session anonyme ensuite (`authManager.
 * getAnonymousSession()?.participantId`, le même champ que le correctif
 * `20111d5b` [anon-join] fait déjà circuler côté chat partagé) ; `none` sinon
 * — état transitoire (déconnexion en cours, SSR, lancement à froid), REPLI
 * MÉMOIRE, jamais une identité devinée.
 *
 * `scopeId` sert de composant de clé `localStorage` (ci-dessous) ET de clé
 * de l'entrée en mémoire (`scopedEntryKey`) : les deux se déduisent de LA
 * MÊME résolution, jamais recalculées séparément.
 *
 * PAS de hash pour l'anonyme (contrairement à iOS, qui SHA-256-tronque
 * `participantId` avant de l'inscrire dans une clé `UserDefaults` — voir
 * `ReadingModePreferenceScope.storageKey` côté Swift). Écart assumé, pas un
 * oubli : `participantId` est DÉJÀ en clair dans ce même `localStorage`
 * (`AUTH_STORAGE_KEYS.ANONYMOUS_SESSION`, `auth-manager.service.ts`) —
 * l'inscrire une seconde fois, en clair, dans une clé de préférence de mode
 * de lecture n'ouvre AUCUNE surface qui n'existe pas déjà au même repos.
 */
export type ReadingModeIdentityScope =
  | { readonly kind: 'registered'; readonly scopeId: string }
  | { readonly kind: 'anonymous'; readonly scopeId: string }
  | { readonly kind: 'none' };

export function resolveReadingModeIdentityScope(): ReadingModeIdentityScope {
  if (typeof window === 'undefined') return { kind: 'none' };

  if (authManager.isAuthenticated()) {
    const registeredId = authManager.getCurrentUser()?.id;
    if (registeredId) return { kind: 'registered', scopeId: `u-${registeredId}` };
  }

  const anonymousId = authManager.getAnonymousSession()?.participantId;
  if (anonymousId) return { kind: 'anonymous', scopeId: `a-${anonymousId}` };

  return { kind: 'none' };
}

/**
 * Repli mémoire EXPLICITE : préfixe qui ne collide jamais avec un `scopeId`
 * réel (`u-…`/`a-…`), pour que deux appels sans identité pendant la MÊME
 * session mémoire continuent de partager une entrée cohérente — sans jamais
 * toucher `localStorage` (voir `localStoragePersistence` plus bas, qui
 * refuse séparément toute E/S quand `resolveReadingModeIdentityScope()`
 * rend `none`).
 */
const NO_IDENTITY_SCOPE_ID = 'no-identity';

function currentScopeId(): string {
  const scope = resolveReadingModeIdentityScope();
  return scope.kind === 'none' ? NO_IDENTITY_SCOPE_ID : scope.scopeId;
}

/** Clé de l'ENTRÉE EN MÉMOIRE (`entries`, plus bas) — scopée par identité. */
function scopedEntryKey(conversationId: string): string {
  return `${currentScopeId()}:${conversationId}`;
}

/** Clé `localStorage` complète — `meeshy:reading-mode:<scopeId>:<conversationId>`. */
function scopedStorageKey(scopeId: string, conversationId: string): string {
  return `${STORAGE_KEY_PREFIX}${scopeId}:${conversationId}`;
}

/**
 * Adaptateur `localStorage` — SSR-safe (`typeof window === 'undefined'` ⇒
 * `undefined`, le substitut retombe en mémoire pure, comportement documenté
 * comme VALIDE par `LocalReadingModePreferenceStore`). Une écriture qui
 * échoue (quota dépassé, navigation privée Safari) PROPAGE — c'est ce que
 * `setReadingMode` ci-dessous rattrape pour son rollback.
 *
 * D-4 : `read`/`write` reçoivent `conversationId` SEUL (c'est ce que
 * `LocalReadingModePreferenceStore.keyFor` — gelé — leur passe, cf. docstring
 * de fichier). Le scope est résolu ICI, à l'appel, jamais mémorisé : deux
 * appels successifs sous deux identités différentes (après un rechargement
 * de page, la seule façon dont ce dépôt change d'identité — voir « risques
 * résiduels » dans le rapport de tâche) touchent deux clés distinctes.
 * Identité non résolvable ⇒ `read` rend `null` (rien à lire), `write` est un
 * NO-OP silencieux (pas une erreur : `setReadingMode` doit pouvoir réussir
 * en mémoire même sans identité, cf. docstring de `setReadingMode`).
 */
const localStoragePersistence: LocalReadingModePreferencePersisting | undefined =
  typeof window === 'undefined'
    ? undefined
    : {
        read(conversationId: string): string | null {
          const scope = resolveReadingModeIdentityScope();
          if (scope.kind === 'none') return null;
          try {
            return window.localStorage.getItem(scopedStorageKey(scope.scopeId, conversationId));
          } catch {
            return null;
          }
        },
        write(conversationId: string, value: string): void {
          const scope = resolveReadingModeIdentityScope();
          if (scope.kind === 'none') return; // repli mémoire — jamais de clé non scopée recréée
          window.localStorage.setItem(scopedStorageKey(scope.scopeId, conversationId), value);
        },
      };

/** Singleton d'injection — substitut LWS-2bis, jamais recréé par appel. */
const localReadingModeStore = new LocalReadingModePreferenceStore(localStoragePersistence);

const DEFAULT_PREFERENCE: ReadingModePreference = 'auto';

// =============================================================================
// LEGACY — PURGE ONE-SHOT DES CLÉS NON SCOPÉES (D-4 / R5-6)
// =============================================================================

/**
 * L'ancienne clé du magasin `zustand/persist` de `reading-mode-store`
 * (`meeshy-reading-mode`), celle que la façade ne produit plus. Exportée pour
 * que les témoins la nomment sans la recopier, et pour que la garde
 * d'occurrence unique ait une adresse à surveiller.
 */
export const LEGACY_READING_MODE_STORAGE_KEY = 'meeshy-reading-mode';

/**
 * Marqueur de purge. Sa seule fonction est de rendre la purge IDEMPOTENTE :
 * un second onglet resté ouvert sur l'ancien code peut ré-écrire une clé non
 * scopée après coup, et cette réapparition ne doit pas être reprise en
 * boucle à chaque rechargement. Le nom (`__migrated-from-v1__`) est conservé
 * tel quel malgré le changement de politique (adoption → suppression, D-4) :
 * changer le libellé n'aurait rien réparé et aurait cassé l'idempotence pour
 * quiconque a déjà ce marqueur posé par une version antérieure.
 */
export const READING_MODE_MIGRATION_MARKER_KEY = `${STORAGE_KEY_PREFIX}__migrated-from-v1__`;

/**
 * Une clé `meeshy:reading-mode:...` est-elle au format SCOPÉ (post-D4,
 * `<scopeId>:<conversationId>`) ou à l'ANCIEN format non scopé (pré-D4,
 * `<conversationId>` seul) ? Les `conversationId` de ce dépôt sont des
 * ObjectId Mongo (24 caractères hex, RE-PROUVÉ par les fixtures partagées) —
 * ils ne contiennent jamais `:`. Un `scopeId` (`u-…`/`a-…`) en contient
 * toujours un avant le `conversationId` qui le suit. La présence d'un `:`
 * dans le reste de la clé est donc un test fiable, jamais un ID mal formé
 * pris pour un scope : dans le doute (un `:` inattendu), la clé est traitée
 * comme SCOPÉE — elle n'est alors JAMAIS touchée par la purge, ce qui est le
 * sens sûr de l'erreur (ne jamais supprimer par excès de zèle une clé qui
 * pourrait appartenir à une identité réelle).
 */
function isLegacyUnscopedKey(remainderAfterPrefix: string): boolean {
  return !remainderAfterPrefix.includes(':');
}

/**
 * Purge ONE-SHOT de toute clé de mode de lecture non scopée par identité.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POLITIQUE D-4 / R5-6 : SUPPRESSION, JAMAIS ADOPTION
 * ═══════════════════════════════════════════════════════════════════════════
 * Avant ce lot, une ancienne clé (`meeshy-reading-mode`, le zustand/persist
 * d'avant REV-4bis/B2 ; ou `meeshy:reading-mode:<conversationId>`, la clé de
 * CE magasin avant D-4) était potentiellement ADOPTÉE pour l'identité qui
 * ouvrait l'app en premier après une mise à jour. Sur un navigateur PARTAGÉ,
 * cette clé peut appartenir à N'IMPORTE LEQUEL des comptes qui ont utilisé ce
 * navigateur : l'adopter pour le premier lecteur venu attribue à ce lecteur
 * un choix qu'un AUTRE compte a fait — soit reproduire, dans le geste même
 * censé la refermer, la fuite privacy multi-comptes que ce lot corrige.
 *
 * La politique retenue est donc : SUPPRIMER ces clés, une seule fois, sans
 * jamais rien copier dans le magasin scopé. Perte acceptée et documentée :
 * le lecteur re-choisit son mode de lecture une fois, sur ce navigateur.
 *
 * PRÉCÉDENT iOS RE-PROUVÉ (docstring de fichier, plus haut) :
 * `LentilleScopedReadingModePreferenceStore` a affronté la même question pour
 * `meeshy.readingMode.*` et a choisi de NE RIEN MIGRER — ni adopter, ni
 * supprimer, laisser en friche (justifié : ces clés n'ont jamais été écrites
 * en production sur cet OS, cf. sa docstring). Le web choisit de SUPPRIMER
 * plutôt que d'orpheliner : la différence est cosmétique (hygiène de
 * `localStorage`, qui n'a pas d'équivalent « jamais écrit en production » ici
 * — la clé non scopée EST la clé de production d'avant ce commit), jamais de
 * sécurité — aucune des deux politiques n'ADOPTE, ce qui est le seul point
 * qui compte pour R5-6.
 *
 * RÈGLES :
 * 1. Une SEULE fois par appareil (marqueur ci-dessus).
 * 2. Aucune valeur n'est jamais lue pour être réécrite ailleurs — la purge
 *    ne PARSE même pas le contenu des clés qu'elle supprime.
 * 3. Une clé SCOPÉE (`isLegacyUnscopedKey` rend `false`) n'est JAMAIS
 *    touchée, quelle que soit l'identité courante — ce n'est pas le rôle de
 *    cette fonction d'arbitrer entre deux comptes déjà scopés.
 */
export function runLegacyReadingModeMigration(): void {
  if (typeof window === 'undefined') return;

  try {
    if (window.localStorage.getItem(READING_MODE_MIGRATION_MARKER_KEY) !== null) return;
  } catch {
    return;
  }

  try {
    window.localStorage.removeItem(LEGACY_READING_MODE_STORAGE_KEY);

    const keysToDelete: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key === null || !key.startsWith(STORAGE_KEY_PREFIX)) continue;
      if (key === READING_MODE_MIGRATION_MARKER_KEY) continue;

      const remainder = key.slice(STORAGE_KEY_PREFIX.length);
      if (!isLegacyUnscopedKey(remainder)) continue; // déjà scopé — jamais touché

      keysToDelete.push(key);
    }
    keysToDelete.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Navigation privée Safari, quota, `localStorage` désactivé — rien à
    // purger cette fois-ci ; retenté au prochain chargement (le marqueur
    // n'est posé, ci-dessous, que dans le `finally`).
  } finally {
    try {
      window.localStorage.setItem(READING_MODE_MIGRATION_MARKER_KEY, new Date().toISOString());
    } catch {
      // Sans marqueur, la purge sera simplement retentée au prochain
      // chargement — idempotente par construction (une clé déjà supprimée
      // ne l'est pas deux fois différemment).
    }
  }
}

/**
 * Remonte en mémoire ce que l'appareil a déjà au repos, pour l'identité
 * COURANTE seulement, sous
 * `meeshy:reading-mode:<scopeId(identité courante)>:<conversationId>`.
 *
 * POURQUOI CE PAS EXISTE. `LocalReadingModePreferenceStore.get()` est
 * ASYNCHRONE et par conversation : il ne peut pas servir un sélecteur React
 * synchrone. Sans cette relecture, la façade aurait perdu une propriété que
 * `zustand/persist` assurait GRATUITEMENT à `reading-mode-store` — la
 * survie du choix collant d'une session à l'autre.
 *
 * D-4 : n'énumère QUE les clés dont le préfixe complet (`STORAGE_KEY_PREFIX`
 * + le `scopeId` de l'identité courante) matche — jamais les clés d'une
 * AUTRE identité, même si `localStorage` les contient (navigateur partagé,
 * plusieurs comptes). Sans identité résolvable, ne lit RIEN : il n'y a pas
 * de scope à qui attribuer une hydratation.
 */
export function hydrateReadingModePreferencesFromStorage(): void {
  if (typeof window === 'undefined') return;

  const scope = resolveReadingModeIdentityScope();
  if (scope.kind === 'none') return;

  const scopedPrefix = `${STORAGE_KEY_PREFIX}${scope.scopeId}:`;
  const seeds: ReadingModeSeed[] = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key === null || !key.startsWith(scopedPrefix)) continue;

      const conversationId = key.slice(scopedPrefix.length);
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

type ReadingModeSeed = { readonly conversationId: string; readonly value: ReadingModePreference };

const parsePreference = (raw: unknown): ReadingModePreference | null => {
  const parsed = ReadingModePreferenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

/**
 * Sème des valeurs dans le magasin SANS jamais écraser une entrée existante,
 * et sans faire d'écriture réseau/persistance (l'hydratation relit ce qui est
 * déjà au repos). Version `0` : la plus basse possible, pour qu'un futur
 * payload serveur (`applyReadingModeUpdate`, version >= 1) l'emporte toujours
 * sur une valeur seulement retrouvée sur cet appareil. Les clés semées sont
 * les clés SCOPÉES de l'entrée mémoire (`scopedEntryKey`), jamais le
 * `conversationId` nu.
 */
const seedEntries = (seeds: readonly ReadingModeSeed[]): void => {
  if (seeds.length === 0) return;

  const state = useReadingModePreferenceStore.getState();
  const nextEntries = new Map(state.entries);
  let changed = false;

  for (const seed of seeds) {
    const entryKey = scopedEntryKey(seed.conversationId);
    if (nextEntries.has(entryKey)) continue;
    nextEntries.set(entryKey, { value: seed.value, version: 0 });
    changed = true;
  }

  if (changed) useReadingModePreferenceStore.setState({ entries: nextEntries });
};

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
   * patch local immédiat (version + 1) → persistance locale (repli mémoire
   * si l'identité n'est pas résolvable, D-4) → rollback si la persistance
   * échoue ET que personne n'a écrit depuis (identité référentielle, même
   * garde que l'original).
   *
   * D-4/G-121 — LA ROUTE SERVEUR, EN TÂCHE DE FOND. Après que la persistance
   * LOCALE a réussi, un choix explicite écrit AUSSI
   * `PUT /user-preferences/conversations/:id` (`writeReadingModePreferenceToServer`,
   * `services/reading-mode-sync.service.ts`) — UNIQUEMENT pour une identité
   * INSCRITE (la route exige `fastify.authenticate` ; aucune route pour les
   * comptes anonymes, `services/gateway/src/routes/conversation-preferences.
   * ts`, D-4 point 4 — ne pas fabriquer d'appel qui échouerait toujours).
   * FIRE-AND-FORGET, échec SILENCIEUX : `localStorage` reste la vérité
   * immédiate de CE navigateur, et un `PUT` qui échoue (hors-ligne, 500) ne
   * doit pas faire reculer un choix déjà visible à l'écran — le prochain
   * choix explicite, ou la reconnexion socket, resynchronisera. iOS n'a PAS
   * encore de chemin d'écriture vers G-121 à ce jour (RE-PROUVÉ : aucun
   * fichier de `apps/ios/Meeshy` n'appelle `user-preferences/conversations`
   * — il ne fait QUE consommer le broadcast, `MeeshyApp.swift`) ; cette
   * politique est donc celle du magasin LOCAL de ce même fichier
   * (`localReadingModeStore.set`), reconduite à l'identique pour le nouveau
   * palier réseau plutôt qu'inventée.
   */
  setReadingMode: (conversationId: string, value: ReadingModePreference) => Promise<void>;

  /**
   * Réconciliation par version — le point d'entrée que le canal
   * `onPreferencesUpdated` (G-121) appelle désormais réellement (D-4) :
   *   - `apps/web/hooks/lentille/use-reading-mode-server-sync.ts` (précédence
   *     serveur au chargement d'un fil) ;
   *   - `apps/web/lib/conversations/reading-mode-broadcast.ts` (broadcast
   *     versionné multi-appareils, socket).
   * Un payload de version INFÉRIEURE OU ÉGALE à la version locale est ignoré
   * (même arbitre que `applyRemotePreferences`) — c'est CE calcul, pas un
   * texte produit, qui fait dire « la préférence serveur prime sur le local
   * scopé » : un magasin local jamais touché reste à la version 0 (le défaut
   * de `ReadingModePreferenceState`, ou `0` posé par `seedEntries` pour tout
   * héritage local) et perd donc TOUJOURS face à un `version >= 1` posé par
   * n'importe quel écrivain serveur — la primauté serveur découle de
   * l'arbitrage existant, elle n'a pas exigé de branche neuve.
   */
  applyReadingModeUpdate: (conversationId: string, value: ReadingModePreference, version: number) => void;

  reset: () => void;
}

export const useReadingModePreferenceStore = create<
  ReadingModePreferenceState & ReadingModePreferenceActions
>()((set, get) => ({
  entries: new Map(),

  getReadingMode: (conversationId) =>
    get().entries.get(scopedEntryKey(conversationId))?.value ?? DEFAULT_PREFERENCE,

  setReadingMode: async (conversationId, value) => {
    const parsed = ReadingModePreferenceSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error(`[reading-mode-preference-store] valeur hors énumération: ${String(value)}`);
    }

    const scope = resolveReadingModeIdentityScope();
    const entryKey = scopedEntryKey(conversationId);

    const snapshot = get().entries.get(entryKey);
    const optimistic: ReadingModePreferenceEntry = {
      value,
      version: (snapshot?.version ?? 0) + 1,
    };

    const optimisticEntries = new Map(get().entries);
    optimisticEntries.set(entryKey, optimistic);
    set({ entries: optimisticEntries });

    try {
      // Persistance locale — voir docstring d'interface : repli mémoire si
      // `scope.kind === 'none'` (le `write` de `localStoragePersistence`
      // devient un no-op silencieux, pas une erreur).
      await localReadingModeStore.set({ conversationId }, value);
    } catch (error) {
      // Ne rétracter QUE notre propre écriture — identité référentielle,
      // même garde que `writeOptimistic` (conversation-preferences-store.ts,
      // jamais édité) : un rollback qui écraserait une écriture plus
      // récente serait pire que l'absence de rollback.
      if (get().entries.get(entryKey) === optimistic) {
        const revertEntries = new Map(get().entries);
        if (snapshot) {
          revertEntries.set(entryKey, snapshot);
        } else {
          revertEntries.delete(entryKey);
        }
        set({ entries: revertEntries });
      }
      throw error;
    }

    // D-4/G-121 — voir docstring d'interface : identité INSCRITE seulement,
    // fire-and-forget, échec silencieux. Après le `try` local (jamais dans
    // son `catch` : un échec réseau ne doit pas interférer avec le rollback
    // du magasin LOCAL, deux préoccupations indépendantes).
    if (scope.kind === 'registered') {
      void writeReadingModePreferenceToServer(conversationId, value).catch(() => {
        // Silencieux par politique — voir docstring d'interface.
      });
    }
  },

  applyReadingModeUpdate: (conversationId, value, version) => {
    const entryKey = scopedEntryKey(conversationId);
    const current = get().entries.get(entryKey);
    if (version <= (current?.version ?? 0)) return;

    const nextEntries = new Map(get().entries);
    nextEntries.set(entryKey, { value, version });
    set({ entries: nextEntries });
  },

  reset: () => set({ entries: new Map() }),
}));

export const useReadingModePreference = (conversationId: string): ReadingModePreference =>
  useReadingModePreferenceStore(
    (state) => state.entries.get(scopedEntryKey(conversationId))?.value ?? DEFAULT_PREFERENCE
  );

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
 * REV-4bis/B2, réordonné par D-4 — AU CHARGEMENT DU MODULE, dans cet ordre et
 * pas l'autre.
 *
 * D'abord la PURGE des clés mortes (`runLegacyReadingModeMigration`, qui ne
 * sème plus jamais rien depuis D-4 — elle ne fait que supprimer), ENSUITE
 * l'hydratation (ce que le magasin autoritatif SCOPÉ a déjà au repos). Avant
 * D-4 l'ordre inverse protégeait l'hydratation contre une adoption tardive
 * qui l'aurait écrasée ; ce risque a disparu avec l'adoption elle-même — mais
 * purger avant d'hydrater reste le sens le plus simple à lire : on nettoie
 * d'abord, on relit ensuite ce qui reste.
 *
 * Les deux sont sans effet côté serveur (`typeof window === 'undefined'`), et
 * l'hydratation est de surcroît sans effet tant qu'aucune identité n'est
 * résolvable (`resolveReadingModeIdentityScope().kind === 'none'`).
 */
runLegacyReadingModeMigration();
hydrateReadingModePreferencesFromStorage();
