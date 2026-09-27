import { isImageMimeType, isVideoMimeType } from '@meeshy/shared/types/attachment';

import { base64De } from '@/lib/media/file-delivery-host';
import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

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
 * `GALLERY_BRIDGE_MAX_BYTES`, la pièce n'est pas confiée au plugin.
 */
export const GALLERY_ALBUM = 'Meeshy';

/** Au-delà, le `data:` base64 (×4/3, puis recopié par le pont) ferait courir un OOM à la WebView. */
export const GALLERY_BRIDGE_MAX_BYTES = 32 * 1024 * 1024;

export type GallerySaveOutcome = 'saved' | 'unavailable' | 'failed';

export type GallerySaveInput = { readonly blob: Blob; readonly fileName: string; readonly mimeType: string };

export interface GallerySaver {
  readonly available: boolean;
  save(input: GallerySaveInput): Promise<GallerySaveOutcome>;
}

/** L'essence d'un type de galerie (image ou vidéo), ou `null` — la SEULE lecture du type que les trois sites partagent. */
export function galleryMediaEssence(mimeType: string): string | null {
  const essence = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return isImageMimeType(essence) || isVideoMimeType(essence) ? essence : null;
}

export const NULL_GALLERY_SAVER: GallerySaver = { available: false, save: async () => 'unavailable' };

const MEDIA_PLUGIN = 'Media';

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

export function shellGallerySaver(shell: CoqueNative | undefined): GallerySaver {
  const getAlbums = appelNatifMethode(shell, MEDIA_PLUGIN, 'getAlbums');
  const createAlbum = appelNatifMethode(shell, MEDIA_PLUGIN, 'createAlbum');
  const savePhoto = appelNatifMethode(shell, MEDIA_PLUGIN, 'savePhoto');
  const saveVideo = appelNatifMethode(shell, MEDIA_PLUGIN, 'saveVideo');
  if (getAlbums === null || createAlbum === null || savePhoto === null || saveVideo === null) return NULL_GALLERY_SAVER;

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

  return {
    available: true,
    save: async ({ blob, fileName, mimeType }) => {
      const essence = galleryMediaEssence(mimeType);
      if (essence === null || blob.size > GALLERY_BRIDGE_MAX_BYTES) return 'unavailable';
      const write = isImageMimeType(essence) ? savePhoto : saveVideo;
      try {
        album ??= resolveAlbum();
        const albumIdentifier = await album;
        if (albumIdentifier === null) {
          album = null;
          return 'failed';
        }
        const path = `data:${essence};base64,${await base64De(blob)}`;
        await write({ path, albumIdentifier, fileName: nativeFileName(fileName) });
        return 'saved';
      } catch {
        album = null;
        return 'failed';
      }
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
  const saver = shellGallerySaver(shell);
  return saver.available ? saver : null;
}

let currentSaver: GallerySaver | null | undefined;

/** L'hôte courant, lu une fois : les plugins d'une coque ne changent pas sous elle. */
export function currentGallerySaver(): GallerySaver | null {
  if (currentSaver === undefined) currentSaver = galleryHostOf(coqueCourante());
  return currentSaver;
}
