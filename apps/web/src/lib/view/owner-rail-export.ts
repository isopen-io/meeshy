import { currentCredential } from '@/lib/api/client';
import { apiConfig } from '@/lib/api/config';
import { apiDeps } from '@/lib/api/deps';
import { storyExportUrl } from '@/lib/api/story-export';
import type { SceneExportSubject } from '@/lib/export/scene/scene-export-subject';
import type { SceneExportResult } from '@/lib/export/scene/scene-export-run';
import type { GallerySaver } from '@/lib/gallery/gallery-saver';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';
import type { StoryPlaybackMedia } from '@/lib/stories/playback';
import type * as storySaveStore from '@/lib/stories/save-store';

/**
 * **CE QUE FAIT « ENREGISTRER » UNE FOIS TAPÉ** (#7116, #13873) — chargé À LA
 * DEMANDE par `use-story-owner-rail.ts`, au premier « Enregistrer » : le
 * téléchargement d'une story v1, la composition d'une story à scène et leurs
 * sept issues ne pèsent sur aucun lecteur qui ne tape jamais ce geste
 * (plafond `story_reader`, `budgets.json`). Ce que le lecteur garde STATIQUE
 * est ce qui DÉCIDE d'offrir le geste et ce qui doit naître DANS le geste (le
 * job, le contexte audio).
 */

export type StorySaveNoticeKey = Extract<
  InterfaceCatalogKey,
  | 'story.save.success'
  | 'story.save.cancelled'
  | 'story.save.failed'
  | 'story.save.offline'
  | 'story.save.refused'
  | 'story.save.missing'
  | 'story.save.retry'
>;

/**
 * UNE ISSUE, UNE PHRASE (miroir des quatre toasts d'iOS, `story.mine.save.*`).
 * Le premier jet ne connaissait que « échec » : un refus de session, un média
 * disparu et une coupure réseau se disaient de la même façon.
 */
export async function runStoryExport(params: {
  readonly job: storySaveStore.StorySaveJobHandle;
  readonly storyId: string;
  readonly media: StoryPlaybackMedia;
  readonly host: FileDeliveryHost;
  readonly gallerySaver: GallerySaver | null | undefined;
}): Promise<StorySaveNoticeKey> {
  const { job } = params;
  try {
    const [{ downloadFile }, { fileDeliveryPortal }, { saveToGallery }, { currentGallerySaver }] = await Promise.all([
      import('@/lib/media/download-file'),
      import('@/lib/media/deliver-file'),
      import('@/lib/gallery/save-to-gallery'),
      import('@/lib/gallery/gallery-saver'),
    ]);
    const url = storyExportUrl({ source: apiDeps.source, base: apiConfig.base, postId: params.storyId, media: params.media });
    const result = await downloadFile({
      url,
      fallbackMediaId: params.media.id,
      deps: { fetchImpl: (input, init) => fetch(input, init), credential: currentCredential },
      signal: job.signal,
      onProgress: job.report,
    });
    if (result.status === 'cancelled') return 'story.save.cancelled';
    if (result.status === 'offline') return 'story.save.offline';
    if (result.status === 'unavailable') return result.reason === 'refused' ? 'story.save.refused' : 'story.save.missing';
    job.lockDelivery();
    /* La coque Android range la story DROIT dans l'album « Meeshy » (#9246),
       comme la visionneuse (#8308) et Photos sur iOS : ni feuille de partage,
       ni activation de geste à tenir après un long téléchargement. */
    const saver = params.gallerySaver === undefined ? currentGallerySaver() : params.gallerySaver;
    const gallery = await saveToGallery({ saver, blob: result.blob, fileName: result.fileName, mimeType: result.blob.type });
    if (gallery !== null) return gallery === 'media.viewer.saved' ? 'story.save.success' : 'story.save.failed';
    const portal = fileDeliveryPortal(params.host);
    const outcome = portal === null ? 'unavailable' : await portal.deliver(result.blob, result.fileName, result.blob.type);
    if (outcome === 'delivered') return 'story.save.success';
    if (outcome === 'cancelled') return 'story.save.cancelled';
    /* `expired` (revue #7116) — l'activation du geste a expiré PENDANT le
       téléchargement, dans une coque sans ancre de repli (`deliver-file.ts`).
       Rien ne dit que le PROCHAIN tap échouera : c'est une activation neuve.
       « Échec de l'enregistrement » aurait annoncé un verdict définitif que
       rien ne prouve — `story.save.retry` dit ce qui est vrai : retaper. */
    return outcome === 'expired' ? 'story.save.retry' : 'story.save.failed';
  } catch {
    /* Le chunk à la demande n'a pas pu se charger (réseau tombé entre la
       première peinture et le geste) — jamais un job coincé à 0 % qu'aucune
       issue ne libérerait. */
    return job.signal.aborted ? 'story.save.cancelled' : 'story.save.offline';
  } finally {
    job.finish();
  }
}

/**
 * **UNE STORY À SCÈNE S'EXPORTE TELLE QU'ON LA VOIT** (#13873) — tous ses
 * calques, chaque slide à sa durée, la piste son qui JOUE (fond, vocaux,
 * vidéos, gains et coupures respectés), rendus par le moteur d'export
 * (`lib/export/scene/`), chargé au geste. Une story v1 (sans document) garde
 * le téléchargement du média filigrané par la passerelle.
 */
export type StorySceneExporter = (input: {
  readonly subject: SceneExportSubject;
  readonly audioContext: AudioContext | null;
  readonly preferredLanguages: readonly string[];
  readonly placeHere: string;
  readonly host: FileDeliveryHost;
  readonly gallerySaver: GallerySaver | null | undefined;
  readonly job: storySaveStore.StorySaveJobHandle;
}) => Promise<SceneExportResult>;

export const browserStorySceneExporter: StorySceneExporter = async (input) => {
  const [{ startSceneExport }, { currentGallerySaver }] = await Promise.all([
    import('@/lib/export/scene/scene-export-browser'),
    import('@/lib/gallery/gallery-saver'),
  ]);
  return startSceneExport({
    subject: input.subject,
    mode: 'save',
    audioContext: input.audioContext,
    preferredLanguages: input.preferredLanguages,
    placeHere: input.placeHere,
    host: input.host,
    gallerySaver: input.gallerySaver === undefined ? currentGallerySaver() : input.gallerySaver,
    chooseLength: async () => 4,
    signal: input.job.signal,
    onProgress: input.job.report,
    onDelivering: input.job.lockDelivery,
  });
};

const SCENE_NOTICE: Readonly<Record<SceneExportResult, StorySaveNoticeKey>> = {
  saved: 'story.save.success',
  shared: 'story.save.success',
  cancelled: 'story.save.cancelled',
  retry: 'story.save.retry',
  failed: 'story.save.failed',
  unsupported: 'story.save.failed',
};

export async function runComposedStoryExport(input: Parameters<StorySceneExporter>[0] & { readonly exporter: StorySceneExporter }): Promise<StorySaveNoticeKey> {
  try {
    return SCENE_NOTICE[await input.exporter(input)];
  } catch {
    return input.job.signal.aborted ? 'story.save.cancelled' : 'story.save.offline';
  } finally {
    input.job.finish();
  }
}
