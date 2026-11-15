import { isImageMimeType, isVideoMimeType } from '@meeshy/shared/types/attachment';

import { NATIVE_BRIDGE_MAX_BYTES } from '@/lib/media/file-delivery-host';
import { base64De, fileSinkOf, SINK_CHUNK_BYTES, throughSink } from '@/lib/media/file-sink';
import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

import {
  galleryDigest,
  idbGallerySavedRegistry,
  NULL_GALLERY_SAVED_REGISTRY,
  type GallerySavedEntry,
  type GallerySavedRegistry,
} from './saved-registry';

/**
 * **L'ÉCRITURE DANS LA GALERIE DE LA COQUE ANDROID** (#8308, #8336) — jumelle
 * de l'enregistrement Photos d'iOS, derrière une interface. Le plugin natif est
 * `@capacitor-community/media` 9.1.0 (nom de plugin `Media`), déclaré par la
 * coque ; le saver reste NUL tant que la coque ne le déclare pas (navigateur,
 * coque iOS, coque Android antérieure) — aucun appel qui rejetterait, aucune
 * porte qui ne mènerait nulle part (loi 4).
 *
 * Le plugin est lu comme la coque le déclare (`PluginHeaders`, motif
 * `native-shell.ts`), jamais par `@capacitor/core` : le bundle web n'en a pas
 * l'usage. Contrat LU dans `MediaPlugin.java` (9.1.0), hors
 * `androidGalleryMode` — le mode par défaut, qui ne demande AUCUNE permission :
 *  - un album est un dossier de `getExternalMediaDirs()[0]`
 *    (`Android/media/<appId>/Meeshy`), indexé par MediaStore, donc visible des
 *    galeries ; `getAlbums` rend `{ albums: [{ name, identifier }] }`, où
 *    l'identifiant est le chemin du dossier ;
 *  - `createAlbum` REJETTE « Album already exists » si le dossier existe :
 *    ce rejet n'est pas un échec, l'album est relu ;
 *  - `savePhoto`/`saveVideo` AJOUTENT au `fileName` l'extension tirée du type
 *    et ÉCRASENT un fichier du même nom : le nom natif est donc une tige
 *    assainie, sans extension ni chemin, rendue unique.
 *
 * Le fichier voyage en `data:` base64 : les URL de pièces jointes exigent un
 * `Authorization` que le téléchargement natif du plugin n'enverrait pas. Le
 * pont Capacitor porte ce texte en MÉMOIRE (JS puis Java) : au-delà de
 * `GALLERY_BRIDGE_MAX_BYTES`, la pièce passe par TRANCHES (#9514) dans le
 * récepteur de la coque (`MeeshyFileSink`), qui l'écrit dans un fichier de son
 * cache ; le plugin copie ce fichier dans l'album, puis le récepteur l'efface.
 * Une coque construite avant le récepteur garde le refus.
 *
 * **Jamais deux fois les mêmes octets** (#14641) : avant d'écrire, le saver
 * consulte le registre des empreintes (`saved-registry.ts`) ; un média déjà
 * enregistré rend `already-saved` sans toucher à l'album, et deux demandes
 * simultanées des mêmes octets n'écrivent qu'une fois.
 *
 * **Mais un média supprimé de la galerie se réenregistre** (#14654), comme sur
 * Android natif (qui relit son URI MediaStore) : le registre garde le chemin
 * que `savePhoto`/`saveVideo` rendent (`filePath`), et avant de refuser le
 * saver demande à la coque (`MeeshyGallery.exists`, borné à l'album) si ce
 * fichier existe encore. Seul un « absent » explicite retire l'entrée et
 * laisse écrire ; tout le reste garde le refus, pour ne jamais doubler un
 * média encore présent :
 *  - coque construite avant la vérification, réponse refusée ou illisible ;
 *  - entrée écrite avant ce lot, sans chemin — rien ne permet de la vérifier,
 *    et la réécrire doublerait chacun de ces médias encore présents.
 */
export const GALLERY_ALBUM = 'Meeshy';

/** Au-delà, le `data:` base64 (×4/3, puis recopié par le pont) ferait courir un OOM à la WebView. */
export const GALLERY_BRIDGE_MAX_BYTES = NATIVE_BRIDGE_MAX_BYTES;

export type GallerySaveOutcome = 'saved' | 'already-saved' | 'unavailable' | 'failed';

export type GallerySaveInput = { readonly blob: Blob; readonly fileName: string; readonly mimeType: string };

export interface GallerySaver {
  readonly available: boolean;
  save(input: GallerySaveInput): Promise<GallerySaveOutcome>;
}

/** L'essence d'un type de galerie (image ou vidéo), ou `null` — la SEULE lecture du type que ses sites partagent (visionneuse, capture d'appel, carte de message, story). */
export function galleryMediaEssence(mimeType: string): string | null {
  const essence = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return isImageMimeType(essence) || isVideoMimeType(essence) ? essence : null;
}

export const NULL_GALLERY_SAVER: GallerySaver = { available: false, save: async () => 'unavailable' };

const MEDIA_PLUGIN = 'Media';
const GALLERY_PROBE_PLUGIN = 'MeeshyGallery';

type MediaAlbum = { readonly name: string; readonly identifier: string };

function albumsOf(result: unknown): readonly MediaAlbum[] {
  const albums = (result as { readonly albums?: unknown } | null)?.albums;
  if (!Array.isArray(albums)) return [];
  return albums.filter(
    (album): album is MediaAlbum =>
      typeof album === 'object' && album !== null && typeof album.name === 'string' && typeof album.identifier === 'string',
  );
}

const FILE_STEM_MAX = 64;

function fileStemOf(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : dot === 0 ? '' : base)
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, FILE_STEM_MAX);
  return /[\p{L}\p{N}]/u.test(stem) ? stem : 'meeshy';
}

type GalleryWrite = { readonly outcome: GallerySaveOutcome; readonly path: string | null };

const FAILED_WRITE: GalleryWrite = { outcome: 'failed', path: null };

/** Le chemin du fichier que `savePhoto`/`saveVideo` ont écrit dans l'album (`MediaPlugin.java` 9.1.0), ou `null`. */
function filePathOf(result: unknown): string | null {
  const filePath = (result as { readonly filePath?: unknown } | null)?.filePath;
  return typeof filePath === 'string' && filePath !== '' ? filePath : null;
}

export type GallerySaverLimits = {
  readonly bridgeMaxBytes?: number;
  readonly chunkBytes?: number;
  /** Le registre des médias déjà enregistrés — aucun par défaut ; `galleryHostOf` pose celui d'IndexedDB. */
  readonly saved?: GallerySavedRegistry;
};

export function shellGallerySaver(shell: CoqueNative | undefined, limits: GallerySaverLimits = {}): GallerySaver {
  const { bridgeMaxBytes = GALLERY_BRIDGE_MAX_BYTES, chunkBytes = SINK_CHUNK_BYTES, saved = NULL_GALLERY_SAVED_REGISTRY } = limits;
  const getAlbums = appelNatifMethode(shell, MEDIA_PLUGIN, 'getAlbums');
  const createAlbum = appelNatifMethode(shell, MEDIA_PLUGIN, 'createAlbum');
  const savePhoto = appelNatifMethode(shell, MEDIA_PLUGIN, 'savePhoto');
  const saveVideo = appelNatifMethode(shell, MEDIA_PLUGIN, 'saveVideo');
  if (getAlbums === null || createAlbum === null || savePhoto === null || saveVideo === null) return NULL_GALLERY_SAVER;
  const sink = fileSinkOf(shell);
  const exists = appelNatifMethode(shell, GALLERY_PROBE_PLUGIN, 'exists');

  let album: Promise<string | null> | null = null;
  let written = 0;
  const findAlbum = async (): Promise<string | null> =>
    albumsOf(await getAlbums({})).find((candidate) => candidate.name === GALLERY_ALBUM)?.identifier ?? null;
  const resolveAlbum = async (): Promise<string | null> => {
    const existing = await findAlbum();
    if (existing !== null) return existing;
    await createAlbum({ name: GALLERY_ALBUM }).catch(() => undefined);
    return findAlbum();
  };
  const nativeFileName = (fileName: string): string => {
    written += 1;
    return `${fileStemOf(fileName)}-${Date.now().toString(36)}${written.toString(36)}`;
  };

  const writeMedia = async ({ blob, fileName }: GallerySaveInput, essence: string): Promise<GalleryWrite> => {
    const write = isImageMimeType(essence) ? savePhoto : saveVideo;
    try {
      album ??= resolveAlbum();
      const albumIdentifier = await album;
      if (albumIdentifier === null) {
        album = null;
        return FAILED_WRITE;
      }
      let writtenPath: string | null = null;
      const writeAt = async (path: string): Promise<void> => {
        writtenPath = filePathOf(await write({ path, albumIdentifier, fileName: nativeFileName(fileName) }));
      };
      if (blob.size > bridgeMaxBytes && sink !== null) await throughSink({ sink, blob, mimeType: essence, chunkBytes, use: writeAt });
      else await writeAt(`data:${essence};base64,${await base64De(blob)}`);
      return { outcome: 'saved', path: writtenPath };
    } catch {
      album = null;
      return FAILED_WRITE;
    }
  };

  const stillInGallery = async ({ path }: GallerySavedEntry): Promise<boolean> => {
    if (path === null || exists === null) return true;
    try {
      return ((await exists({ path })) as { readonly exists?: unknown } | null)?.exists !== false;
    } catch {
      return true;
    }
  };

  const inFlight = new Map<string, Promise<GallerySaveOutcome>>();
  const writeOnce = (digest: string, writeIt: () => Promise<GalleryWrite>): Promise<GallerySaveOutcome> => {
    const previous = inFlight.get(digest);
    if (previous !== undefined) {
      return previous.then((outcome) => (outcome === 'saved' || outcome === 'already-saved' ? 'already-saved' : writeOnce(digest, writeIt)));
    }
    const attempt = (async (): Promise<GallerySaveOutcome> => {
      const entry = await saved.lookup(digest);
      if (entry !== null) {
        if (await stillInGallery(entry)) return 'already-saved';
        await saved.forget(digest);
      }
      const { outcome, path } = await writeIt();
      if (outcome === 'saved') await saved.mark(digest, path);
      return outcome;
    })();
    inFlight.set(digest, attempt);
    void attempt.finally(() => {
      if (inFlight.get(digest) === attempt) inFlight.delete(digest);
    });
    return attempt;
  };

  return {
    available: true,
    save: async (input) => {
      const essence = galleryMediaEssence(input.mimeType);
      if (essence === null || (input.blob.size > bridgeMaxBytes && sink === null)) return 'unavailable';
      const digest = await galleryDigest(input.blob).catch(() => null);
      if (digest === null) return (await writeMedia(input, essence)).outcome;
      return writeOnce(digest, () => writeMedia(input, essence));
    },
  };
}

/**
 * L'hôte qui SAIT enregistrer dans la galerie : la coque Android, et elle
 * seule, quand elle déclare le plugin. Un navigateur garde son téléchargement,
 * la coque iOS sa feuille de partage.
 */
export function galleryHostOf(shell: CoqueNative | undefined): GallerySaver | null {
  if (shell?.getPlatform?.() !== 'android') return null;
  const saver = shellGallerySaver(shell, { saved: idbGallerySavedRegistry() });
  return saver.available ? saver : null;
}

let currentSaver: GallerySaver | null | undefined;

/** L'hôte courant, lu une fois : les plugins d'une coque ne changent pas sous elle. */
export function currentGallerySaver(): GallerySaver | null {
  if (currentSaver === undefined) currentSaver = galleryHostOf(coqueCourante());
  return currentSaver;
}
