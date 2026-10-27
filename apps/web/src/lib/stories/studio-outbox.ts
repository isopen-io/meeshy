import { idbDeviceRecords, type DeviceRecords } from '@/lib/send/device-records';
import { studioOutboxFilesKey, studioOutboxMetaKey } from './studio-outbox-records';

import type { PublishChoice } from './publication-layout';
import { isStudioDraftEmpty, STUDIO_PAGE_MAX, type StudioDraft } from './studio';
import { emptyStudioPage, isStudioPageEmpty, type StudioDoor, type StudioPage, type StudioSoundAsset, type StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE, clampPose, type StudioPose } from './studio-pose';
import { nextTextLayerId } from './studio-text';

/**
 * **LES PUBLICATIONS NON ENVOYÉES DU STUDIO** (#13416, jumelle de l'iOS #13415)
 * — une création et ses médias restent sur l'appareil jusqu'à la confirmation
 * du serveur ou jusqu'à leur retrait EXPLICITE par l'auteur. Jamais de purge
 * silencieuse, jamais d'effacement à la mise en file.
 *
 * Le brouillon (`studio-draft-store.ts`, `localStorage`) ne garde que les
 * RÉFÉRENCES serveur des médias montés : les `File` vivaient dans la mémoire
 * de l'onglet, et un rechargement, une coupure ou un 415 les perdait. Ils
 * vivent ici, dans la base des envois (`idbDeviceRecords`), avec ce qui les
 * habille (légende, pose, cadre…) et l'INTENTION de publier :
 *  - `armed` : l'auteur a dit Publier (hors ligne, ou l'envoi était en vol) —
 *    la publication REPART seule au rechargement ;
 *  - `failed` : le serveur a refusé ou l'envoi a échoué — elle est PROPOSÉE
 *    (« Réessayer » / « Supprimer »), jamais rejouée en boucle.
 * Les clés d'idempotence voyagent avec l'intention : un envoi que le serveur
 * avait reçu avant le rechargement n'est pas publié deux fois.
 *
 * Deux enregistrements par compte : les FICHIERS (réécrits seulement quand un
 * fichier change) et leur HABILLAGE (léger, réécrit à chaque retouche). Le
 * magasin est une frontière de confiance : une entrée abîmée est écartée
 * sans faire tomber les autres, et un appareil qui refuse rend `false`, jamais
 * une exception.
 */
export type StudioOutboxSlot = {
  readonly pageId: string;
  readonly door: StudioDoor;
  readonly file: File;
  /** L'habillage du média — l'asset sans `file`, `previewUrl` ni `upload`,
   * plus `fileUrl` quand il était déjà monté. */
  readonly meta: Readonly<Record<string, unknown>>;
};

export type StudioOutboxIntent = {
  readonly choice: PublishChoice;
  readonly promoted: boolean;
  readonly state: 'armed' | 'failed';
  readonly keys: readonly (readonly [string, string])[];
};

export type StudioOutboxRecord = { readonly slots: readonly StudioOutboxSlot[]; readonly intent: StudioOutboxIntent | null };

export type StudioOutbox = {
  /** `null` : rien n'attend pour ce compte, ou l'appareil ne sait pas le dire. */
  readonly load: (viewerId: string) => Promise<StudioOutboxRecord | null>;
  /** `true` si l'appareil a gardé l'état ; `false` s'il l'a refusé. */
  readonly save: (viewerId: string, record: StudioOutboxRecord) => Promise<boolean>;
  readonly clear: (viewerId: string) => Promise<boolean>;
};

const DOORS: readonly StudioDoor[] = ['visual', 'overlay', 'sound'];

const slotKey = (pageId: string, door: StudioDoor): string => `${pageId}:${door}`;

const filesKey = studioOutboxFilesKey;
const metaKey = studioOutboxMetaKey;

const assetOf = (page: StudioPage, door: StudioDoor): StudioVisualAsset | StudioSoundAsset | null =>
  door === 'sound' ? page.sound : door === 'visual' ? page.background : page.overlay;

function metaOf(asset: StudioVisualAsset | StudioSoundAsset): Readonly<Record<string, unknown>> {
  const { file: _file, previewUrl: _previewUrl, upload, ...meta } = asset;
  return upload.phase === 'ready' ? { ...meta, fileUrl: upload.fileUrl } : meta;
}

/** Ce qui doit survivre : chaque média qui porte encore son fichier local. */
export function outboxSlotsOf(draft: StudioDraft): readonly StudioOutboxSlot[] {
  return draft.pages.flatMap((page) =>
    DOORS.flatMap((door) => {
      const asset = assetOf(page, door);
      return asset?.file === undefined ? [] : [{ pageId: page.id, door, file: asset.file, meta: metaOf(asset) }];
    }),
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const poseOf = (value: unknown): StudioPose => {
  if (!isRecord(value)) return IDENTITY_POSE;
  const n = (key: string, fallback: number): number => (typeof value[key] === 'number' ? (value[key] as number) : fallback);
  return clampPose({ x: n('x', 0.5), y: n('y', 0.5), scale: n('scale', 1), rotation: n('rotation', 0) });
};

const RESTARTED = { phase: 'uploading', progress: 0 } as const;

function restoredAsset(slot: StudioOutboxSlot, previewUrl: string): StudioVisualAsset | StudioSoundAsset | null {
  const { fileUrl: _fileUrl, ...meta } = slot.meta;
  if (slot.door === 'sound') {
    return { ...meta, file: slot.file, previewUrl, upload: RESTARTED, plane: meta.plane === 'foreground' ? 'foreground' : 'background' } as StudioSoundAsset;
  }
  if (meta.mediaType !== 'image' && meta.mediaType !== 'video') return null;
  return {
    ...meta,
    file: slot.file,
    previewUrl,
    mediaType: meta.mediaType,
    upload: RESTARTED,
    caption: typeof meta.caption === 'string' ? meta.caption : '',
    pose: poseOf(meta.pose),
  } as StudioVisualAsset;
}

const withSlot = (page: StudioPage, door: StudioDoor, asset: StudioVisualAsset | StudioSoundAsset): StudioPage =>
  door === 'sound' ? { ...page, sound: asset as StudioSoundAsset } : { ...page, [door === 'visual' ? 'background' : 'overlay']: asset };

/**
 * Le brouillon relu, ses médias RENDUS — un média que le brouillon a gardé
 * monté retrouve son fichier local ; un média qui n'était pas monté revient
 * sur sa page et REPART (`uploading`, la reprise des montées le relance) ; une
 * page que le brouillon n'a pas gardée (elle ne portait qu'un média non
 * monté) revient après les siennes. Un emplacement que le brouillon a rempli
 * d'un AUTRE média reste à ce média.
 */
export function draftWithOutbox(
  draft: StudioDraft,
  slots: readonly StudioOutboxSlot[],
  env: { readonly makeUrl: (file: File) => string; readonly language: string },
): StudioDraft {
  const wasEmpty = isStudioDraftEmpty(draft);
  const merged = slots.reduce<StudioDraft>((current, slot) => {
    const known = current.pages.some((page) => page.id === slot.pageId);
    if (!known && current.pages.length >= STUDIO_PAGE_MAX) return current;
    const pages = known
      ? current.pages
      : [...current.pages, emptyStudioPage(slot.pageId, nextTextLayerId(current.pages.flatMap((page) => page.texts)), env.language)];
    return {
      ...current,
      pages: pages.map((page) => {
        if (page.id !== slot.pageId) return page;
        const present = assetOf(page, slot.door);
        if (present !== null) {
          const sameMedia = present.upload.phase === 'ready' && present.upload.fileUrl === slot.meta.fileUrl;
          return sameMedia && present.file === undefined ? withSlot(page, slot.door, { ...present, file: slot.file, previewUrl: env.makeUrl(slot.file) }) : page;
        }
        const asset = restoredAsset(slot, env.makeUrl(slot.file));
        return asset === null ? page : withSlot(page, slot.door, asset);
      }),
    };
  }, draft);
  if (!wasEmpty) return merged;
  const filled = merged.pages.filter((page) => !isStudioPageEmpty(page));
  if (filled.length === 0) return merged;
  return { ...merged, pages: filled, currentPage: filled[0]!.id };
}

const isDoor = (value: unknown): value is StudioDoor => value === 'visual' || value === 'overlay' || value === 'sound';

const isBlob = (value: unknown): value is File => typeof Blob !== 'undefined' && value instanceof Blob;

function intentOf(value: unknown): StudioOutboxIntent | null {
  if (!isRecord(value) || (value.state !== 'armed' && value.state !== 'failed')) return null;
  const choice = value.choice;
  if (!isRecord(choice) || typeof choice.kind !== 'string') return null;
  const keys = Array.isArray(value.keys)
    ? value.keys.filter((entry: unknown): entry is [string, string] => Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string')
    : [];
  return { choice: choice as PublishChoice, promoted: value.promoted === true, state: value.state, keys };
}

type StoredMeta = { readonly pageId: string; readonly door: StudioDoor; readonly meta: Readonly<Record<string, unknown>> };

function metasOf(value: unknown): readonly StoredMeta[] {
  if (!isRecord(value) || !Array.isArray(value.slots)) return [];
  return value.slots.flatMap((entry: unknown): StoredMeta[] =>
    isRecord(entry) && typeof entry.pageId === 'string' && isDoor(entry.door) && isRecord(entry.meta) ? [{ pageId: entry.pageId, door: entry.door, meta: entry.meta }] : [],
  );
}

function filesOf(value: unknown): ReadonlyMap<string, File> {
  if (!Array.isArray(value)) return new Map();
  return new Map(value.flatMap((entry: unknown): [string, File][] => (Array.isArray(entry) && typeof entry[0] === 'string' && isBlob(entry[1]) ? [[entry[0], entry[1]]] : [])));
}

const sameFiles = (a: readonly (readonly [string, File])[] | undefined, b: readonly (readonly [string, File])[]): boolean =>
  a !== undefined && a.length === b.length && a.every(([key, file], index) => b[index]?.[0] === key && b[index]?.[1] === file);

export function createStudioOutbox(records: DeviceRecords): StudioOutbox {
  const writtenFiles = new Map<string, readonly (readonly [string, File])[]>();
  const writtenMeta = new Map<string, string>();
  let chain: Promise<unknown> = Promise.resolve();

  const serial = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    chain = next.catch(() => undefined);
    return next;
  };

  const load = async (viewerId: string): Promise<StudioOutboxRecord | null> => {
    try {
      const [rawFiles, rawMeta] = await Promise.all([records.load(filesKey(viewerId)), records.load(metaKey(viewerId))]);
      const files = filesOf(rawFiles);
      const slots = metasOf(rawMeta).flatMap((stored): StudioOutboxSlot[] => {
        const file = files.get(slotKey(stored.pageId, stored.door));
        return file === undefined ? [] : [{ ...stored, file }];
      });
      const intent = isRecord(rawMeta) ? intentOf(rawMeta.intent) : null;
      if (slots.length === 0 && intent === null) {
        writtenFiles.set(viewerId, []);
        writtenMeta.set(viewerId, '');
        return null;
      }
      writtenFiles.set(viewerId, slots.map((slot) => [slotKey(slot.pageId, slot.door), slot.file] as const));
      return { slots, intent };
    } catch {
      return null;
    }
  };

  const save = (viewerId: string, record: StudioOutboxRecord): Promise<boolean> =>
    serial(async () => {
      try {
        if (record.slots.length === 0 && record.intent === null) {
          if (writtenFiles.get(viewerId)?.length === 0 && writtenMeta.get(viewerId) === '') return true;
          await clearNow(viewerId);
          return true;
        }
        const files = record.slots.map((slot) => [slotKey(slot.pageId, slot.door), slot.file] as const);
        if (!sameFiles(writtenFiles.get(viewerId), files)) {
          await records.save(filesKey(viewerId), files);
          writtenFiles.set(viewerId, files);
        }
        const meta = { slots: record.slots.map(({ pageId, door, meta: slotMeta }) => ({ pageId, door, meta: slotMeta })), intent: record.intent };
        const serialized = JSON.stringify(meta);
        if (writtenMeta.get(viewerId) !== serialized) {
          await records.save(metaKey(viewerId), meta);
          writtenMeta.set(viewerId, serialized);
        }
        return true;
      } catch {
        writtenFiles.delete(viewerId);
        writtenMeta.delete(viewerId);
        return false;
      }
    });

  async function clearNow(viewerId: string): Promise<void> {
    writtenFiles.delete(viewerId);
    writtenMeta.delete(viewerId);
    await records.save(filesKey(viewerId), undefined);
    await records.save(metaKey(viewerId), undefined);
    writtenFiles.set(viewerId, []);
    writtenMeta.set(viewerId, '');
  }

  const clear = (viewerId: string): Promise<boolean> =>
    serial(async () => {
      try {
        await clearNow(viewerId);
        return true;
      } catch {
        writtenFiles.delete(viewerId);
        writtenMeta.delete(viewerId);
        return false;
      }
    });

  return { load, save, clear };
}

/** Le magasin de l'application — la base des envois de l'appareil. */
export const studioOutbox: StudioOutbox = createStudioOutbox(idbDeviceRecords());
