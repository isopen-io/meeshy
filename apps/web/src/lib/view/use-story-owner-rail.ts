import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { StoryActionRailHandlers } from '@/components/story-action-rail';
import { currentCredential } from '@/lib/api/client';
import { apiConfig } from '@/lib/api/config';
import { apiDeps } from '@/lib/api/deps';
import { storyDownloadableMedia, storyExportUrl } from '@/lib/api/story-export';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { browserFileDeliveryHost, hasFileDeliveryDoor, type FileDeliveryHost } from '@/lib/media/file-delivery-host';
import type { StoryPlaybackStory } from '@/lib/stories/playback';
import * as storySaveStore from '@/lib/stories/save-store';

import { sharePublicationLink } from './publication-share';
import { useCommentsSheetHost, type CommentsSheetHost } from './use-comments-sheet-host';

/**
 * **LE RAIL DU PLAN AUTEUR** (#7116) — « Vues », « Partager », « Enregistrer »,
 * extrait de `routes/story.tsx` (déjà à 996 lignes avant ce lot).
 *
 * **CE QUE LA REVUE A REPRIS DU PREMIER JET, ET POURQUOI**
 *  - l'anneau se lisait dans un `useState` LOCAL doublant le store : revenir
 *    sur une story dont l'export tournait rendait « Enregistrer » au lieu de
 *    l'anneau — et ce bouton était INERTE (le store refusait le second
 *    `start`) ; l'export d'une story se peignait sur l'anneau d'une AUTRE. Le
 *    store est désormais la SEULE source, lue par clé de story ;
 *  - « Enregistrer » était offert sur une story SANS média (le geste sortait
 *    sans rien faire) et dans une coque où rien ne sait livrer un fichier : la
 *    paire Partager/Enregistrer n'est remise que si la story porte un média
 *    EXPORTABLE et que l'hôte a une PORTE de livraison (Q1/Q3 de la
 *    spécification — les deux faces apparaissent et disparaissent ENSEMBLE) ;
 *  - la feuille « Vues » tenait son propre booléen : le focus, éjecté par le
 *    rail devenu `inert`, tombait sur `<body>` à la fermeture. Elle suit
 *    désormais la loi d'hôte PARTAGÉE (`useCommentsSheetHost`, Q5) ;
 *  - le partage était une JUMELLE de `usePostGesture().onShare` : il appelle
 *    le site unique (`publication-share.ts`) avec la région de CE lecteur (D-11).
 *
 * **LE TÉLÉCHARGEMENT ET LA LIVRAISON SONT CHARGÉS À LA DEMANDE** (plafond
 * `story_reader` 11 Ko NON ARBITRÉ, motif D-54 du client TUS du studio) :
 * `downloadFile` et `fileDeliveryPortal` ne pèsent sur aucun lecteur qui ne
 * tape jamais « Enregistrer ». Le PARTAGE reste statique : D-48 exige qu'il
 * parte DANS le geste, sans attendre un chunk.
 */
export type StoryOwnerRail = {
  /** La feuille « Vues » — `postId !== null` ⇒ ouverte. */
  readonly viewers: CommentsSheetHost;
  /** Ce que le lecteur SAIT faire pour le plan auteur ; la loi figée
   * (`showsViews`/`showsExport`) décide, elle, de l'appartenance. */
  readonly handlers: Pick<StoryActionRailHandlers, 'views' | 'share' | 'save'>;
  /** L'export en cours de LA story affichée — l'instantané du store. */
  readonly saving: storySaveStore.StorySaveJobView | null;
  readonly cancelSave: () => void;
};

type StorySaveNoticeKey = Extract<
  InterfaceCatalogKey,
  'story.save.success' | 'story.save.cancelled' | 'story.save.failed' | 'story.save.offline' | 'story.save.refused' | 'story.save.missing'
>;

/**
 * UNE ISSUE, UNE PHRASE (miroir des quatre toasts d'iOS, `story.mine.save.*`).
 * Le premier jet ne connaissait que « échec » : un refus de session, un média
 * disparu et une coupure réseau se disaient de la même façon.
 */
async function runStoryExport(params: {
  readonly job: storySaveStore.StorySaveJobHandle;
  readonly url: string;
  readonly mediaId: string;
  readonly host: FileDeliveryHost;
}): Promise<StorySaveNoticeKey> {
  const { job } = params;
  try {
    const [{ downloadFile }, { fileDeliveryPortal }] = await Promise.all([
      import('@/lib/media/download-file'),
      import('@/lib/media/deliver-file'),
    ]);
    const result = await downloadFile({
      url: params.url,
      fallbackMediaId: params.mediaId,
      deps: { fetchImpl: (input, init) => fetch(input, init), credential: currentCredential },
      signal: job.signal,
      onProgress: job.report,
    });
    if (result.status === 'cancelled') return 'story.save.cancelled';
    if (result.status === 'offline') return 'story.save.offline';
    if (result.status === 'unavailable') return result.reason === 'refused' ? 'story.save.refused' : 'story.save.missing';
    job.lockDelivery();
    const portal = fileDeliveryPortal(params.host);
    const outcome = portal === null ? 'unavailable' : await portal.deliver(result.blob, result.fileName, result.blob.type);
    if (outcome === 'delivered') return 'story.save.success';
    return outcome === 'cancelled' ? 'story.save.cancelled' : 'story.save.failed';
  } catch {
    /* Le chunk à la demande n'a pas pu se charger (réseau tombé entre la
       première peinture et le geste) — jamais un job coincé à 0 % qu'aucune
       issue ne libérerait. */
    return job.signal.aborted ? 'story.save.cancelled' : 'story.save.offline';
  } finally {
    job.finish();
  }
}

export function useStoryOwnerRail(params: {
  readonly story: StoryPlaybackStory | undefined;
  readonly online: boolean;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly announce: (message: string) => void;
  readonly language: InterfaceLanguage;
  /** Injectable pour les témoins ; le navigateur par défaut. */
  readonly deliveryHost?: FileDeliveryHost;
}): StoryOwnerRail {
  const { story, online, pause, resume, announce, language } = params;
  const storyId = story?.id;
  const viewers = useCommentsSheetHost(storyId);
  const host = useMemo(() => params.deliveryHost ?? browserFileDeliveryHost(), [params.deliveryHost]);
  const exportMedia = useMemo(() => (hasFileDeliveryDoor(host) ? storyDownloadableMedia(story) : null), [host, story]);

  /* LA FEUILLE « VUES » MET LA LECTURE EN PAUSE, et la reprend en se
     fermant — iOS : `.sheet(isPresented: $showViewersSheet, onDismiss:
     { resumeTimer() … })`, `StoryViewerView.swift:834-858`. */
  const viewersOpen = viewers.postId !== null;
  useEffect(() => {
    if (!viewersOpen) return;
    pause();
    return () => resume();
  }, [viewersOpen, pause, resume]);

  const saving = useSyncExternalStore(
    storySaveStore.subscribe,
    () => (storyId === undefined ? null : storySaveStore.getState(storyId)),
    () => null,
  );

  const handlers = useMemo<StoryOwnerRail['handlers']>(() => {
    if (storyId === undefined) return {};
    /* La feuille « Vues » met la lecture en pause (effet ci-dessus) — iOS :
       `pauseTimer(); showViewersSheet = true`, `StoryViewerView+Sidebar.swift:683-692`. */
    const views = () => viewers.open(storyId);
    if (exportMedia === null) return { views };
    return {
      views,
      /* La feuille de partage du système est MODALE, comme celle d'iOS
         (`pauseTimer(); showExportShareSheet = true`, `:744-755`) : la story
         n'avance pas dessous, et reprend quand elle se ferme. */
      share: () => {
        pause();
        void sharePublicationLink({ postId: storyId, language, announce }).finally(resume);
      },
      save: () => {
        if (!online) {
          announce(translate(language, 'story.save.offline'));
          return;
        }
        const job = storySaveStore.start(storyId);
        if (job === null) return;
        const url = storyExportUrl({ source: apiDeps.source, base: apiConfig.base, postId: storyId, media: exportMedia });
        void runStoryExport({ job, url, mediaId: exportMedia.id, host }).then((key) => announce(translate(language, key)));
      },
    };
  }, [storyId, exportMedia, host, online, language, announce, pause, resume, viewers.open]);

  const cancelSave = useCallback(() => {
    if (storyId !== undefined) storySaveStore.cancel(storyId);
  }, [storyId]);

  return { viewers, handlers, saving, cancelSave };
}
