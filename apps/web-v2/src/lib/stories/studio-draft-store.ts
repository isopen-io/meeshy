import type { StorageLike } from '@/lib/send/draft-store';

import type { StudioMediaKind } from './story-document';

/**
 * LE BROUILLON DU STUDIO DE STORY (#6900, § 0 « brouillon conservé sur
 * échec ») — miroir de `draft-store.ts` (`ComposerDraft`), forme DISTINCTE :
 * un brouillon de story ne porte AUCUN `File` (rien à sérialiser — un fichier
 * choisi ne survit ni au JSON ni, de toute façon, à un rechargement), mais
 * les RÉFÉRENCES SERVEUR des médias déjà montés (`postMediaId`, `fileUrl`) —
 * ce sont elles qui coûtent (l'aller-retour réseau déjà payé), le fichier
 * local ne coûtant rien à redemander.
 *
 * La restauration relit `fileUrl` via `attachmentSrc` (l'appelant, § écran) :
 * un aperçu restauré n'a plus de blob local (perdu au démontage), mais reste
 * un aperçu RÉEL, jamais un cadre vide.
 */
export type StudioDraftAssetRef = {
  readonly postMediaId: string;
  readonly fileUrl: string;
};

export type StudioDraftSnapshot = {
  readonly text: string;
  readonly background?: StudioDraftAssetRef & { readonly mediaType: StudioMediaKind };
  readonly sound?: StudioDraftAssetRef;
};

const KEY = 'meeshy.draft.story-studio';

function isAssetRef(value: unknown): value is StudioDraftAssetRef {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.postMediaId === 'string' && typeof raw.fileUrl === 'string';
}

function isSnapshot(value: unknown): value is StudioDraftSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  if (typeof raw.text !== 'string') return false;
  if (raw.background !== undefined && (!isAssetRef(raw.background) || (raw.background as { mediaType?: unknown }).mediaType !== 'image' && (raw.background as { mediaType?: unknown }).mediaType !== 'video')) {
    return false;
  }
  if (raw.sound !== undefined && !isAssetRef(raw.sound)) return false;
  return true;
}

function resolveBrowserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export type StudioDraftStore = {
  readonly get: () => StudioDraftSnapshot | null;
  readonly set: (snapshot: StudioDraftSnapshot) => void;
  readonly clear: () => void;
};

/** Fabrique testable — même dispositif que `createDraftStore` : un backend
 * qui lance (quota, navigation privée) ne fait perdre aucune valeur pour la
 * session, portée par le cache mémoire. */
export function createStudioDraftStore(backend: StorageLike | null | undefined = resolveBrowserStorage()): StudioDraftStore {
  let memory: StudioDraftSnapshot | null = null;

  const get = (): StudioDraftSnapshot | null => {
    if (memory !== null) return memory;
    try {
      const raw = backend?.getItem(KEY) ?? null;
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      return isSnapshot(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const set = (snapshot: StudioDraftSnapshot): void => {
    memory = snapshot;
    try {
      backend?.setItem(KEY, JSON.stringify(snapshot));
    } catch {
      /* Le cache mémoire porte déjà la valeur : la session reste correcte. */
    }
  };

  const clear = (): void => {
    memory = null;
    try {
      backend?.removeItem(KEY);
    } catch {
      /* Rien à faire : la mémoire est déjà à jour. */
    }
  };

  return { get, set, clear };
}

export const studioDraftStore: StudioDraftStore = createStudioDraftStore();
