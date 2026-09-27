import { isImageMimeType, isVideoMimeType } from '@meeshy/shared/types/attachment';

import { base64De } from '@/lib/media/file-delivery-host';
import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * **L'ÉCRITURE DANS LA GALERIE DE LA COQUE ANDROID** (#8308) — jumelle de
 * l'enregistrement Photos d'iOS, derrière une interface : le plugin natif
 * (`@capacitor-community/media`, nom de plugin `Media`) N'EST PAS une
 * dépendance de la coque à ce jour. Tant qu'il n'est pas enregistré, le saver
 * est NUL et rien ne se passe — aucun appel qui rejetterait au premier
 * message, aucune porte offerte qui ne mènerait nulle part (loi 4).
 *
 * Le plugin est lu comme la coque le déclare (`PluginHeaders`, motif
 * `native-shell.ts`), jamais par `@capacitor/core` : le bundle web n'en a pas
 * l'usage. Sur Android, `savePhoto`/`saveVideo` exigent un `albumIdentifier` —
 * le chemin de l'album « Meeshy », lu par `getAlbums` et créé par
 * `createAlbum` s'il manque, une fois par session.
 *
 * Le fichier voyage en `data:` base64 : les URL de pièces jointes exigent un
 * `Authorization` que le téléchargement natif du plugin n'enverrait pas.
 */
export const GALLERY_ALBUM = 'Meeshy';

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

export function shellGallerySaver(shell: CoqueNative | undefined): GallerySaver {
  const getAlbums = appelNatifMethode(shell, MEDIA_PLUGIN, 'getAlbums');
  const createAlbum = appelNatifMethode(shell, MEDIA_PLUGIN, 'createAlbum');
  const savePhoto = appelNatifMethode(shell, MEDIA_PLUGIN, 'savePhoto');
  const saveVideo = appelNatifMethode(shell, MEDIA_PLUGIN, 'saveVideo');
  if (getAlbums === null || createAlbum === null || savePhoto === null || saveVideo === null) return NULL_GALLERY_SAVER;

  let album: Promise<string | null> | null = null;
  const findAlbum = async (): Promise<string | null> =>
    albumsOf(await getAlbums({})).find((candidate) => candidate.name === GALLERY_ALBUM)?.identifier ?? null;
  const resolveAlbum = async (): Promise<string | null> => {
    const existing = await findAlbum();
    if (existing !== null) return existing;
    await createAlbum({ name: GALLERY_ALBUM });
    return findAlbum();
  };

  return {
    available: true,
    save: async ({ blob, fileName, mimeType }) => {
      const essence = galleryMediaEssence(mimeType);
      if (essence === null) return 'unavailable';
      const write = isImageMimeType(essence) ? savePhoto : saveVideo;
      try {
        album ??= resolveAlbum();
        const albumIdentifier = await album;
        if (albumIdentifier === null) {
          album = null;
          return 'failed';
        }
        const path = `data:${essence};base64,${await base64De(blob)}`;
        await write({ path, albumIdentifier, fileName });
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
