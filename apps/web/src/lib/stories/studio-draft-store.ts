import type { PostVisibility } from '@meeshy/shared/types/post';

import type { StorageLike } from '@/lib/send/draft-store';

import { isRememberableAudience, STUDIO_AUDIENCES, type ChoosableAudience } from './publication-audience';
import type { StudioMediaKind } from './story-document';

/**
 * LE BROUILLON DU STUDIO DE STORY (#6900, § 0 « brouillon conservé sur
 * échec », élargi aux PAGES par #7684) — forme DISTINCTE de `ComposerDraft`
 * (`send/draft-store.ts`) : un brouillon de story ne porte AUCUN `File`
 * (rien à sérialiser), mais les RÉFÉRENCES SERVEUR des médias déjà montés.
 *
 * **UN brouillon par LECTEUR** — clé `meeshy.draft.story.<viewerId>` (Q4 iOS
 * 2026-05-26).
 *
 * **LE SCHÉMA — bump à tout changement de forme persistée (D-44)** :
 *  - schéma implicite (absent, « v1 ») : UNE page, les champs `texts` /
 *    `background` / `overlay` / `sound` à plat sur le snapshot — la forme
 *    d'avant #7684 ;
 *  - `schema: 2` (#7684) : plusieurs PAGES, chacune avec ses propres objets.
 *
 * **Le magasin RELIT les deux formes et ne REND que la seconde** — `get()`
 * MIGRE un snapshot v1 en UNE page `page-1` avant de le rendre : le composeur
 * (`studioDraftFromSnapshot`, `studio.ts`) ne connaît qu'UNE forme, jamais
 * une branche par version. Un `schema` FUTUR (≥ 3, écrit par un client plus
 * récent) est refusé — `null`, jamais une lecture partielle qui masquerait un
 * champ qu'un client ancien ne comprend pas.
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

/** Une LÉGENDE de média conservée avec sa référence (#6944). */
type StudioDraftCaption = { readonly caption?: string };

/** Ce qu'UNE page porte — voir `StudioPage` (`studio-page.ts`) côté vivant. */
export type StudioPageSnapshot = {
  readonly id: string;
  readonly texts: readonly StudioTextLayerSnapshot[];
  readonly background?: StudioDraftAssetRef &
    StudioDraftCaption & { readonly mediaType: StudioMediaKind; readonly aspectRatio?: number };
  /** LE CALQUE d'avant-plan et SA pose (#6943). */
  readonly overlay?: StudioDraftAssetRef &
    StudioDraftCaption & { readonly mediaType: StudioMediaKind; readonly aspectRatio?: number; readonly pose?: unknown };
  readonly sound?: StudioDraftAssetRef & { readonly plane?: unknown };
};

export type StudioDraftSnapshot = {
  readonly schema: 2;
  readonly pages: readonly StudioPageSnapshot[];
  /** L'`id` de la page qui était à l'écran — un `id` absent des pages relues
   * (page retirée entre deux sessions, donnée corrompue) retombe sur la
   * première (`studioDraftFromSnapshot`). */
  readonly currentPage?: string;
  /** La langue de COMPOSITION par défaut — un concept de SESSION, pas de
   * page : relue comme graine (`useComposeLanguage({ initialLanguage })`). */
  readonly language?: string;
  /**
   * **L'AUDIENCE CHOISIE POUR CETTE PUBLICATION** (#7683) — rang 1 de
   * {@link seededAudience} (`publication-audience.ts`), au-dessus de la
   * MÉMOIRE du dernier choix (`lastAudience`/`rememberAudience` ci-dessous).
   * `undefined` tant que l'auteur n'a rien choisi pour CE brouillon.
   */
  readonly visibility?: PostVisibility;
};

/** LA FORME PRÉCÉDENTE (#6900-#7683, sans `schema`) — UNE page implicite,
 * migrée par `get()` avant d'être rendue. */
type LegacyStudioDraftSnapshot = {
  readonly texts: readonly StudioTextLayerSnapshot[];
  readonly language?: string;
  readonly background?: StudioPageSnapshot['background'];
  readonly overlay?: StudioPageSnapshot['overlay'];
  readonly sound?: StudioPageSnapshot['sound'];
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
 * brouillon (`keyOf`) : elle survit à `clear(viewerId)`.
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

/** Les champs COMMUNS aux deux formes — un seul site pour ne pas laisser les
 * deux valider différemment. */
function hasValidPageFields(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.texts) || !value.texts.every(isLayerSnapshot)) return false;
  const { background, overlay, sound } = value;
  if (background !== undefined && !isVisualRef(background)) return false;
  if (overlay !== undefined && !isVisualRef(overlay)) return false;
  return sound === undefined || isAssetRef(sound);
}

function isPageSnapshot(value: unknown): value is StudioPageSnapshot {
  return isRecord(value) && typeof value.id === 'string' && value.id !== '' && hasValidPageFields(value);
}

function isPagesSnapshot(value: unknown): value is StudioDraftSnapshot {
  if (!isRecord(value) || value.schema !== 2) return false;
  if (!Array.isArray(value.pages) || value.pages.length === 0 || !value.pages.every(isPageSnapshot)) return false;
  if (value.currentPage !== undefined && typeof value.currentPage !== 'string') return false;
  if (value.language !== undefined && typeof value.language !== 'string') return false;
  if (value.visibility !== undefined && !(STUDIO_AUDIENCES as readonly unknown[]).includes(value.visibility)) return false;
  return true;
}

function isLegacySnapshot(value: unknown): value is LegacyStudioDraftSnapshot {
  if (!isRecord(value) || value.schema !== undefined) return false;
  if (!hasValidPageFields(value)) return false;
  if (value.language !== undefined && typeof value.language !== 'string') return false;
  return value.visibility === undefined || (STUDIO_AUDIENCES as readonly unknown[]).includes(value.visibility);
}

/** UNE page implicite, portant tout ce que la forme précédente tenait à
 * plat. */
function migrateLegacySnapshot(legacy: LegacyStudioDraftSnapshot): StudioDraftSnapshot {
  const { texts, language, background, overlay, sound, visibility } = legacy;
  return {
    schema: 2,
    pages: [
      {
        id: 'page-1',
        texts,
        ...(background !== undefined ? { background } : {}),
        ...(overlay !== undefined ? { overlay } : {}),
        ...(sound !== undefined ? { sound } : {}),
      },
    ],
    currentPage: 'page-1',
    ...(language !== undefined ? { language } : {}),
    ...(visibility !== undefined ? { visibility } : {}),
  };
}

/** LE SEUL SITE qui accepte du JSON quelconque — les deux formes en entrée,
 * UNE seule en sortie (`schema: 2`). Un `schema` futur (≥ 3) ⇒ `null` : un
 * client ancien ne relit pas ce qu'il ne comprend pas. */
function parseSnapshot(value: unknown): StudioDraftSnapshot | null {
  if (isPagesSnapshot(value)) return value;
  if (isLegacySnapshot(value)) return migrateLegacySnapshot(value);
  return null;
}

export function isStudioSnapshotEmpty(snapshot: StudioDraftSnapshot): boolean {
  return snapshot.pages.every(
    (page) => page.texts.every((layer) => layer.text.trim() === '') && page.background === undefined && page.overlay === undefined && page.sound === undefined,
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
   * (`ONLY`/`EXCEPT`, {@link isRememberableAudience}).
   */
  readonly rememberAudience: (viewerId: string, visibility: ChoosableAudience) => void;
  /** **LIRE LE SOUVENIR** — `null` si rien n'est mémorisé, ou si la valeur
   * stockée n'est plus mémorisable. */
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
      return parseSnapshot(parsed);
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
