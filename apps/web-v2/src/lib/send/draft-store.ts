import type { ComposeProtection } from './compose-protection';

/**
 * LE BROUILLON DU COMPOSEUR (#6175) — miroir de `MessageDraft`
 * (`DraftStore.swift:49-90`) : texte, langue choisie, protection (éphémère /
 * flou / vue unique / effets décoratifs) et citation. Une clé par
 * (LECTEUR, CONVERSATION), même discipline que `readingModeStore`
 * (`reading-mode/store.ts`) — même préfixage anti-fuite multi-comptes
 * (Q4 iOS, 2026-05-26 : « un user B ouvrant une conversation voyait le
 * brouillon du user A »).
 *
 * `replyToId` SEUL voyage (jamais `replyAuthorName`/`replyPreviewText`
 * recopiés comme iOS, §1.2 point 6 de la spécification) : le web résout la
 * citation depuis le cache des messages au moment de la restauration, il n'a
 * pas besoin d'un aplatissement qu'iOS ne fait que faute d'avoir le message
 * en mémoire.
 *
 * LES PIÈCES JOINTES NE SONT PAS PERSISTÉES (§1.2 point 5) — le web n'a pas
 * de magasin de fichiers durable (`PendingAttachment` porte des `File`/
 * `blob:`, invalides après un redémarrage) ; issue compagnon.
 */
export type ComposerDraft = {
  readonly text: string;
  readonly language: string;
  readonly protection: ComposeProtection;
  readonly replyToId?: string;
};

/** Un brouillon totalement neuf, pour l'appelant qui veut une valeur de repli
 * explicite plutôt que `null` — jamais persisté tel quel (`isDraftEmpty`
 * ci-dessous le purgerait). */
export function emptyDraft(language: string): ComposerDraft {
  return { text: '', language, protection: {} };
}

/**
 * `isEffectivelyEmpty` (`DraftStore.swift:97-107`) — un brouillon SANS texte
 * mais qui porte une réponse, une protection armée, EST conservé : c'est ce
 * qu'on reprendrait en rouvrant, même sans un mot tapé.
 */
function isDraftEmpty(draft: ComposerDraft): boolean {
  const { text, protection, replyToId } = draft;
  const hasProtection =
    protection.ephemeralSeconds !== undefined ||
    protection.blurred === true ||
    protection.viewOnce === true ||
    (protection.effectFlags ?? 0) !== 0;
  return text.trim() === '' && !hasProtection && replyToId === undefined;
}

export type StorageLike = {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
};

function resolveBrowserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

const draftKey = (scope: string, conversationId: string): string => `meeshy.draft.${scope}.${conversationId}`;

function isComposerDraft(value: unknown): value is ComposerDraft {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.text === 'string' && typeof raw.language === 'string' && typeof raw.protection === 'object' && raw.protection !== null;
}

export type DraftStore = {
  readonly getDraft: (scope: string, conversationId: string) => ComposerDraft | null;
  readonly setDraft: (scope: string, conversationId: string, draft: ComposerDraft) => void;
};

/**
 * Fabrique testable — même dispositif que `createReadingModeStore` :
 * `memory` est un cache d'ÉCRITURE, un backend qui LANCE (quota, navigation
 * privée) ne fait perdre aucune valeur pour la session.
 */
export function createDraftStore(backend: StorageLike | null | undefined = resolveBrowserStorage()): DraftStore {
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

  const getDraft = (scope: string, conversationId: string): ComposerDraft | null => {
    const raw = read(draftKey(scope, conversationId));
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isComposerDraft(parsed) ? parsed : null;
    } catch {
      return null; // Valeur CORRUMPUE : jamais un crash, `null` comme absence.
    }
  };

  const setDraft = (scope: string, conversationId: string, draft: ComposerDraft): void => {
    const key = draftKey(scope, conversationId);
    if (isDraftEmpty(draft)) {
      remove(key);
      return;
    }
    write(key, JSON.stringify(draft));
  };

  return { getDraft, setDraft };
}

/** Le magasin de l'application — résout le `localStorage` réel une seule fois. */
export const draftStore: DraftStore = createDraftStore();
