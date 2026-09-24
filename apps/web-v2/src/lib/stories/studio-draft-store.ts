import type { PostVisibility } from '@meeshy/shared/types/post';

import type { StorageLike } from '@/lib/send/draft-store';

import { isRememberableAudience, STUDIO_AUDIENCES, type ChoosableAudience } from './publication-audience';
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
  /** L'empreinte de l'accusé TUS (§ 0, défaut 7) — RELUE telle quelle, jamais
   * remesurée : le fichier local n'existe plus après un rechargement. */
  readonly thumbHash?: string;
  /** La durée mesurée du fichier local (#7497) — la règle du réel la relit. */
  readonly durationMs?: number;
};

/** Une LÉGENDE de média conservée avec sa référence (#6944) — elle est le
 * travail de l'auteur autant que le fichier, et la perdre à un échec de
 * publication reviendrait à lui demander de la réécrire. */
type StudioDraftCaption = { readonly caption?: string };

export type StudioDraftSnapshot = {
  /**
   * LES OBJETS TEXTE, tels que l'auteur les a posés — texte, langue, style et
   * POSE. Le brouillon de #6900 ne portait qu'une chaîne `text` ; un plateau
   * qui restaure le texte mais pas sa place, sa taille ou son inclinaison
   * rendrait un brouillon MENTEUR.
   *
   * **La forme a changé** : un brouillon écrit par la version précédente ne
   * passe plus `isSnapshot` et est relu `null` — l'auteur repart d'un plateau
   * vide plutôt que d'un état à moitié compris. Une migration de forme n'a
   * pas sa place pour une valeur qui vit quelques minutes.
   */
  readonly texts: readonly StudioTextLayerSnapshot[];
  /** La langue de COMPOSITION par défaut — relue comme graine
   * (`useComposeLanguage({ initialLanguage })`) : sans elle, un nouvel objet
   * texte repartirait étiqueté dans la langue primaire du lecteur, et le
   * Prisme le traduirait depuis la mauvaise langue. */
  readonly language?: string;
  readonly background?: StudioDraftAssetRef &
    StudioDraftCaption & { readonly mediaType: StudioMediaKind; readonly aspectRatio?: number };
  /** LE CALQUE d'avant-plan et SA pose (#6943). */
  readonly overlay?: StudioDraftAssetRef &
    StudioDraftCaption & { readonly mediaType: StudioMediaKind; readonly aspectRatio?: number; readonly pose?: unknown };
  readonly sound?: StudioDraftAssetRef & { readonly plane?: unknown };
  /**
   * **L'AUDIENCE CHOISIE POUR CETTE PUBLICATION** (#7683) — rang 1 de
   * {@link seededAudience} (`publication-audience.ts`), au-dessus de la
   * MÉMOIRE du dernier choix (`lastAudience`/`rememberAudience` ci-dessous,
   * une clé DISTINCTE qui survit à `clear`). `undefined` tant que l'auteur
   * n'a rien choisi pour CE brouillon.
   */
  readonly visibility?: PostVisibility;
};

/** Ce que le stockage porte pour UN objet texte — volontairement LÂCHE : la
 * relecture (`studioDraftFromSnapshot`) normalise chaque champ contre les
 * tables du studio, donc un JSON abîmé ou écrit par une version antérieure
 * rend un objet valide plutôt qu'une exception. */
export type StudioTextLayerSnapshot = {
  readonly id: string;
  readonly text: string;
  readonly language?: unknown;
  readonly style?: unknown;
  readonly effect?: unknown;
  readonly color?: unknown;
  readonly align?: unknown;
  readonly background?: unknown;
  readonly pose?: unknown;
};

const keyOf = (viewerId: string): string => `meeshy.draft.story.${viewerId}`;

/**
 * **LA MÉMOIRE DU DERNIER CHOIX D'AUDIENCE** (#7683) — clé DISTINCTE du
 * brouillon (`keyOf`) : elle survit à `clear(viewerId)` (une publication
 * réussie purge le brouillon, jamais le souvenir de ce que l'auteur a choisi
 * — miroir de `StoryVisibilityPreferenceStore.swift:14`, `story.composer.
 * lastVisibility`). PAR LECTEUR, même raison que le brouillon (Q4 iOS
 * 2026-05-26) : un second compte sur le même appareil ne doit pas hériter
 * l'audience du premier.
 */
const audienceKeyOf = (viewerId: string): string => `meeshy.studio.audience.${viewerId}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function isAssetRef(value: unknown): value is StudioDraftAssetRef {
  if (!isRecord(value) || typeof value.postMediaId !== 'string' || typeof value.fileUrl !== 'string') return false;
  return (
    (value.thumbHash === undefined || typeof value.thumbHash === 'string') &&
    (value.durationMs === undefined || typeof value.durationMs === 'number')
  );
}

const isLayerSnapshot = (value: unknown): value is StudioTextLayerSnapshot =>
  isRecord(value) && typeof value.id === 'string' && value.id !== '' && typeof value.text === 'string';

const isVisualRef = (value: unknown): boolean =>
  isRecord(value) &&
  (value.mediaType === 'image' || value.mediaType === 'video') &&
  (value.aspectRatio === undefined || typeof value.aspectRatio === 'number') &&
  (value.caption === undefined || typeof value.caption === 'string') &&
  isAssetRef(value);

function isSnapshot(value: unknown): value is StudioDraftSnapshot {
  if (!isRecord(value) || !Array.isArray(value.texts) || !value.texts.every(isLayerSnapshot)) return false;
  if (value.language !== undefined && typeof value.language !== 'string') return false;
  if (value.visibility !== undefined && !(STUDIO_AUDIENCES as readonly unknown[]).includes(value.visibility)) return false;
  const { background, overlay, sound } = value;
  if (background !== undefined && !isVisualRef(background)) return false;
  if (overlay !== undefined && !isVisualRef(overlay)) return false;
  return sound === undefined || isAssetRef(sound);
}

export function isStudioSnapshotEmpty(snapshot: StudioDraftSnapshot): boolean {
  return (
    snapshot.texts.every((layer) => layer.text.trim() === '') &&
    snapshot.background === undefined &&
    snapshot.overlay === undefined &&
    snapshot.sound === undefined
  );
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
  /**
   * **ÉCRIRE LE SOUVENIR** (#7683) — un no-op sur un mode NON MÉMORISABLE
   * (`ONLY`/`EXCEPT`, {@link isRememberableAudience}) : la portée de ces deux
   * modes est une liste que le studio ne reproduit pas, la proposer à nouveau
   * élargirait l'audience en silence.
   */
  readonly rememberAudience: (viewerId: string, visibility: ChoosableAudience) => void;
  /** **LIRE LE SOUVENIR** — `null` si rien n'est mémorisé, ou si la valeur
   * stockée n'est plus mémorisable (donnée écrite par une version antérieure,
   * ou corrompue). */
  readonly lastAudience: (viewerId: string) => ChoosableAudience | null;
};

/** Fabrique testable — même dispositif que `createDraftStore` : un backend
 * qui lance (quota, navigation privée) ne fait perdre aucune valeur pour la
 * session, portée par le cache mémoire. */
export function createStudioDraftStore(backend: StorageLike | null | undefined = resolveBrowserStorage()): StudioDraftStore {
  const memory = new Map<string, StudioDraftSnapshot | null>();
  const audienceMemory = new Map<string, ChoosableAudience | null>();

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

  const rememberAudience = (viewerId: string, visibility: ChoosableAudience): void => {
    if (!isRememberableAudience(visibility)) return;
    const key = audienceKeyOf(viewerId);
    audienceMemory.set(key, visibility);
    try {
      backend?.setItem(key, visibility);
    } catch {
      /* Le cache mémoire porte déjà la valeur : la session reste correcte. */
    }
  };

  const lastAudience = (viewerId: string): ChoosableAudience | null => {
    const key = audienceKeyOf(viewerId);
    if (audienceMemory.has(key)) return audienceMemory.get(key) ?? null;
    try {
      const raw = backend?.getItem(key) ?? null;
      return isRememberableAudience(raw) ? raw : null;
    } catch {
      return null;
    }
  };

  return { get, set, clear, rememberAudience, lastAudience };
}

export const studioDraftStore: StudioDraftStore = createStudioDraftStore();
