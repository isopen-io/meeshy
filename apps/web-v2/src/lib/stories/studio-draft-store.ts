import type { StorageLike } from '@/lib/send/draft-store';

import type { StudioMediaKind } from './story-document';

/**
 * LE BROUILLON DU STUDIO DE STORY (#6900, § 0 « brouillon conservé sur
 * échec ») — forme DISTINCTE de `ComposerDraft` (`send/draft-store.ts`) : un
 * brouillon de story ne porte AUCUN `File` (rien à sérialiser — un fichier
 * choisi ne survit pas à un rechargement), mais les RÉFÉRENCES SERVEUR des
 * médias déjà montés (`postMediaId`, `fileUrl`) — ce sont elles qui coûtent
 * (l'aller-retour réseau déjà payé).
 *
 * **UN brouillon par LECTEUR** — clé `meeshy.draft.story.<viewerId>` (Q4 iOS
 * 2026-05-26). Un `postMediaId` n'est réclamable QUE par son monteur
 * (`mediaOwnership.ts:101-106`, `uploaderId === userId` strict) : relu par un
 * second compte sur le même appareil, le brouillon du premier lui aurait
 * montré un texte qui n'est pas le sien, puis publié une story dont les
 * objets pointent vers des médias que la passerelle refuse de rattacher
 * (`describeClaimShortfall` JOURNALISE, ne refuse pas).
 */
export type StudioDraftAssetRef = {
  readonly postMediaId: string;
  readonly fileUrl: string;
};

export type StudioDraftSnapshot = {
  readonly text: string;
  /** La langue dans laquelle le texte a été COMPOSÉ — relue comme graine
   * (`useComposeLanguage({ initialLanguage })`) : sans elle, un texte espagnol
   * restauré repartirait étiqueté dans la langue primaire du lecteur, et le
   * Prisme le traduirait depuis la mauvaise langue. */
  readonly language?: string;
  readonly background?: StudioDraftAssetRef & { readonly mediaType: StudioMediaKind };
  readonly sound?: StudioDraftAssetRef;
};

const keyOf = (viewerId: string): string => `meeshy.draft.story.${viewerId}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function isAssetRef(value: unknown): value is StudioDraftAssetRef {
  return isRecord(value) && typeof value.postMediaId === 'string' && typeof value.fileUrl === 'string';
}

function isSnapshot(value: unknown): value is StudioDraftSnapshot {
  if (!isRecord(value) || typeof value.text !== 'string') return false;
  if (value.language !== undefined && typeof value.language !== 'string') return false;
  const { background, sound } = value;
  const backgroundValid =
    background === undefined || (isRecord(background) && (background.mediaType === 'image' || background.mediaType === 'video') && isAssetRef(background));
  return backgroundValid && (sound === undefined || isAssetRef(sound));
}

export function isStudioSnapshotEmpty(snapshot: StudioDraftSnapshot): boolean {
  return snapshot.text.trim() === '' && snapshot.background === undefined && snapshot.sound === undefined;
}

function resolveBrowserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export type StudioDraftStore = {
  readonly get: (viewerId: string) => StudioDraftSnapshot | null;
  readonly set: (viewerId: string, snapshot: StudioDraftSnapshot) => void;
  readonly clear: (viewerId: string) => void;
};

/** Fabrique testable — même dispositif que `createDraftStore` : un backend
 * qui lance (quota, navigation privée) ne fait perdre aucune valeur pour la
 * session, portée par le cache mémoire. */
export function createStudioDraftStore(backend: StorageLike | null | undefined = resolveBrowserStorage()): StudioDraftStore {
  const memory = new Map<string, StudioDraftSnapshot | null>();

  const get = (viewerId: string): StudioDraftSnapshot | null => {
    const key = keyOf(viewerId);
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      const raw = backend?.getItem(key) ?? null;
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      return isSnapshot(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const clear = (viewerId: string): void => {
    const key = keyOf(viewerId);
    memory.set(key, null);
    try {
      backend?.removeItem(key);
    } catch {
      /* La mémoire est déjà à jour. */
    }
  };

  const set = (viewerId: string, snapshot: StudioDraftSnapshot): void => {
    if (isStudioSnapshotEmpty(snapshot)) {
      clear(viewerId);
      return;
    }
    const key = keyOf(viewerId);
    memory.set(key, snapshot);
    try {
      backend?.setItem(key, JSON.stringify(snapshot));
    } catch {
      /* Le cache mémoire porte déjà la valeur : la session reste correcte. */
    }
  };

  return { get, set, clear };
}

export const studioDraftStore: StudioDraftStore = createStudioDraftStore();
