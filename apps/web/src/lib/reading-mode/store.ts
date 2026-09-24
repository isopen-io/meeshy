import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

/**
 * LE MAGASIN LOCAL — clés SCOPÉES par (lecteur, conversation), miroir de
 * `ReadingModePreferenceStore` (iOS, `Focal/Preferences/`) : « préfixage par
 * identité OBLIGATOIRE — fuite privacy multi-comptes du 2026-05-26 ». Tant
 * qu'aucune session n'existe, `scope` vaut `'local'` (voir `thread.tsx`) ;
 * brancher la session (#5555) ne demande qu'un `scope` différent, aucun de ces
 * fichiers ne bouge.
 *
 * `nil` mémoire iOS ⇔ `null` ici : rien de mémorisé ⇒ l'orchestrateur reprend
 * la main (`auto`), JAMAIS un mode figé par défaut.
 */

export type StorageLike = {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
};

/**
 * Miroir des valeurs de `ConversationReadingModeSchema`
 * (`@meeshy/shared/types/reading-modes.ts`, « contrat gelé, définitions
 * reprises mot pour mot ») — un test d'appartenance LITTÉRAL, jamais le
 * `import` (valeur) du schéma `zod` : cette énumération est GELÉE et courte,
 * et le paquet `@meeshy/shared` n'a pas d'export qui la rende sans tirer
 * `zod` au runtime. Payer ~10 Ko gzip pour valider cinq mots dans le chunk du
 * Fil serait exactement le genre de coût que la charte interdit de faire
 * payer trente écrans à venir (directive « qualité dès la première
 * itération »).
 */
const VALID_MODES: ReadonlySet<string> = new Set(['focal', 'script', 'summary', 'river', 'bubbles']);
const isReadingMode = (value: string): value is ConversationReadingMode => VALID_MODES.has(value);

const modeKey = (scope: string, conversationId: string): string =>
  `meeshy.reading-mode.${scope}.${conversationId}`;
const lastOpenedKey = (scope: string, conversationId: string): string =>
  `meeshy.last-opened.${scope}.${conversationId}`;

/**
 * `localStorage` peut être ABSENT (ce runtime de test, un rendu serveur) ou
 * LANCER à l'usage (quota, navigation privée) — les deux sont traités
 * pareil : un magasin en mémoire de session prend le relais, sans qu'aucune
 * exception ne fuie (même parti que `scheme.ts`).
 */
function resolveBrowserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export type ReadingModeStore = {
  readonly getPreference: (scope: string, conversationId: string) => ConversationReadingMode | null;
  readonly setPreference: (
    scope: string,
    conversationId: string,
    mode: ConversationReadingMode | null,
  ) => void;
  readonly lastOpenedAt: (scope: string, conversationId: string) => Date | null;
  readonly noteOpened: (scope: string, conversationId: string, at: Date) => void;
};

/**
 * Fabrique testable : `backend` est injectable (un `StorageLike` bouchonné
 * pour simuler un stockage qui LANCE, ou une valeur CORROMPUE déjà présente)
 * — `undefined` résout le `localStorage` réel du navigateur.
 *
 * `memory` est un cache d'ÉCRITURE : chaque écriture y est posée d'abord,
 * puis reportée au backend « au mieux ». Un backend qui lance à l'écriture ne
 * fait donc perdre AUCUNE valeur pour la session — c'est lui qui retombe en
 * arrière du cache, jamais l'inverse.
 */
export function createReadingModeStore(backend: StorageLike | null | undefined = resolveBrowserStorage()): ReadingModeStore {
  const memory = new Map<string, string>();

  const read = (key: string): string | null => {
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      return backend ? backend.getItem(key) : null;
    } catch {
      return null;
    }
  };

  const write = (key: string, value: string): void => {
    memory.set(key, value);
    try {
      backend?.setItem(key, value);
    } catch {
      /* Le cache mémoire porte déjà la valeur : la session reste correcte. */
    }
  };

  const remove = (key: string): void => {
    memory.delete(key);
    try {
      backend?.removeItem(key);
    } catch {
      /* Rien à faire : la mémoire est déjà à jour. */
    }
  };

  const getPreference = (scope: string, conversationId: string): ConversationReadingMode | null => {
    const raw = read(modeKey(scope, conversationId));
    if (raw === null) return null;
    // Valeur CORROMPUE (résidu d'une énumération antérieure, écriture
    // manuelle) ⇒ null plutôt qu'un crash — validée par l'énumération, jamais
    // par un simple champ non vide.
    return isReadingMode(raw) ? raw : null;
  };

  const setPreference = (
    scope: string,
    conversationId: string,
    mode: ConversationReadingMode | null,
  ): void => {
    const key = modeKey(scope, conversationId);
    if (mode === null) {
      remove(key);
      return;
    }
    write(key, mode);
  };

  const lastOpenedAtOf = (scope: string, conversationId: string): Date | null => {
    const raw = read(lastOpenedKey(scope, conversationId));
    if (raw === null) return null;
    const ms = Number(raw);
    return Number.isNaN(ms) ? null : new Date(ms);
  };

  const noteOpened = (scope: string, conversationId: string, at: Date): void => {
    write(lastOpenedKey(scope, conversationId), String(at.getTime()));
  };

  return { getPreference, setPreference, lastOpenedAt: lastOpenedAtOf, noteOpened };
}

/** Le magasin de l'application — résout le `localStorage` réel une seule fois. */
export const readingModeStore: ReadingModeStore = createReadingModeStore();
