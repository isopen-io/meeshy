import type { ComposeProtection } from './compose-protection';
import type { StorageLike } from './draft-store';

/**
 * UNE PROTECTION ARMÉE RESTE ARMÉE DANS LA CONVERSATION (#8306, directive
 * porteur 2026-09-27) — jusqu'ici l'envoi désarmait tout (#6175). Désormais
 * l'éphémère (durée ou flamme-œil), le flou et la vue unique survivent à
 * l'envoi ET à la fermeture : une préférence PAR (lecteur, conversation),
 * restaurée à l'ouverture, réécrite à chaque changement.
 *
 * DISTINCTE DU BROUILLON (`draft-store.ts`) : le brouillon décrit un message
 * PAS ENCORE PARTI et s'efface avec lui ; la préférence décrit la
 * conversation. Les effets DÉCORATIFS n'en font jamais partie — ils décrivent
 * un message, et restent à usage unique.
 */
export type StickyProtection = Pick<ComposeProtection, 'ephemeralSeconds' | 'blurred' | 'viewOnce'>;

export function stickyProtectionOf(protection: ComposeProtection): StickyProtection {
  return {
    ...(protection.ephemeralSeconds === undefined ? {} : { ephemeralSeconds: protection.ephemeralSeconds }),
    ...(protection.blurred === true ? { blurred: true } : {}),
    ...(protection.viewOnce === true ? { viewOnce: true } : {}),
  };
}

function parseSticky(raw: string): StickyProtection | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    const seconds = record.ephemeralSeconds;
    return stickyProtectionOf({
      ...(typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? { ephemeralSeconds: seconds } : {}),
      blurred: record.blurred === true,
      viewOnce: record.viewOnce === true,
    });
  } catch {
    return null;
  }
}

/** La clé porte le lecteur — `purgeAccountLocalData` (`lib/api/accounts.ts`) efface ce préfixe à la déconnexion. */
export const PROTECTION_PREFERENCE_PREFIX = 'meeshy.composer-protection.';

const preferenceKey = (scope: string, conversationId: string): string =>
  `${PROTECTION_PREFERENCE_PREFIX}${scope}.${conversationId}`;

export type ProtectionPreferenceStore = {
  /** `null` : aucune préférence enregistrée pour cette conversation. */
  readonly get: (scope: string, conversationId: string) => StickyProtection | null;
  readonly set: (scope: string, conversationId: string, protection: StickyProtection) => void;
};

function resolveBrowserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Même dispositif que `createDraftStore` : la mémoire est un cache
 * d'écriture, un stockage qui lève (quota, navigation privée) ne fait rien
 * perdre à la session.
 */
export function createProtectionPreferenceStore(
  backend: StorageLike | null | undefined = resolveBrowserStorage(),
): ProtectionPreferenceStore {
  const memory = new Map<string, string | null>();

  const read = (key: string): string | null => {
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      return backend ? backend.getItem(key) : null;
    } catch {
      return null;
    }
  };

  return {
    get: (scope, conversationId) => {
      const key = preferenceKey(scope, conversationId);
      if (memory.has(key) && memory.get(key) === null) return {};
      const raw = read(key);
      return raw === null ? null : parseSticky(raw);
    },
    set: (scope, conversationId, protection) => {
      const key = preferenceKey(scope, conversationId);
      const sticky = stickyProtectionOf(protection);
      const empty = Object.keys(sticky).length === 0;
      memory.set(key, empty ? null : JSON.stringify(sticky));
      try {
        if (empty) backend?.removeItem(key);
        else backend?.setItem(key, JSON.stringify(sticky));
      } catch {
        return;
      }
    },
  };
}

export const protectionPreferenceStore = createProtectionPreferenceStore();
