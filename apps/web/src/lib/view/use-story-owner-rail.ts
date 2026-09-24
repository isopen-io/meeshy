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
 *    sans rien faire) : ni « Partager » ni « Enregistrer » ne sont remis si la
 *    story ne porte pas de média EXPORTABLE (Q1 de la spécification — les deux
 *    faces apparaissent et disparaissent ENSEMBLE quand c'est la story qui
 *    n'a rien à exporter) ;
 *  - **défaut 2 (revue suivante)** : la porte de livraison de FICHIER
 *    (`hasFileDeliveryDoor`) gouvernait AUSSI « Partager », qui ne l'utilise
 *    pourtant pas (`sharePublicationLink` partage un LIEN, via
 *    `portailDuNavigateur()` — la coque Android y a `MeeshySharePlugin`,
 *    #7710, même sans fichier). Sur cette coque, « Partager » disparaissait
 *    donc pour une raison qui ne le concernait pas. La porte FICHIER ne garde
 *    plus que `save` ; « Vues » + « Partager » restent quand seule cette porte
 *    manque — #7788 (`MeeshySharePlugin.saveFile`) rejoindra `save` sur cette
 *    coque quand elle sera livrée ;
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
  /* **`exportMedia` NE DÉPEND PLUS DE `hasFileDeliveryDoor`** (revue #7116,
   * défaut 2) — le premier jet conflait deux portes DISTINCTES sous une seule
   * variable : celle du FICHIER (`hasFileDeliveryDoor`, ce que `save` UTILISE)
   * et celle du LIEN (`sharePublicationLink` → `portailDuNavigateur()`, que
   * `share` appelle SANS jamais lire `host`). Sur la coque Android —
   * `@capacitor/android` 8.5.1 n'a ni `DownloadListener` ni `navigator.share`
   * (crbug 765923) — la première porte est fermée mais la SECONDE ne l'est
   * pas : `MeeshySharePlugin` (#7710) partage déjà le lien. Faire dépendre
   * `exportMedia` de la porte FICHIER retirait donc « Partager » là où il
   * aurait fonctionné — un contrôle qui AURAIT eu un effet, caché par la
   * garde d'un AUTRE contrôle (loi 4, lue à l'envers).
   *
   * `exportMedia` ne porte plus que ce que la LOI PURE (`resolveStoryActionRailPlan`
   * → `showsExport`, `lib/stories/action-rail.ts`) décrit : la story a-t-elle
   * un média exportable ? La porte FICHIER redevient une garde SPÉCIFIQUE à
   * `save`, ci-dessous — exactement le régime que `repost`/`translations`
   * pratiquent déjà : la loi autorise, le gestionnaire (ou son absence) décide
   * de l'ATTEIGNABILITÉ, indépendamment bouton par bouton. */
  const exportMedia = useMemo(() => storyDownloadableMedia(story), [story]);

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
    /* La feuille de partage du système est MODALE, comme celle d'iOS
       (`pauseTimer(); showExportShareSheet = true`, `:744-755`) : la story
       n'avance pas dessous, et reprend quand elle se ferme. INDÉPENDANT de
       `hasFileDeliveryDoor` — voir le commentaire d'`exportMedia` ci-dessus. */
    const share = () => {
      pause();
      void sharePublicationLink({ postId: storyId, language, announce }).finally(resume);
    };
    /* `save` seul lit la porte FICHIER — l'hôte qui ne sait pas livrer de
       fichier (coque Android aujourd'hui, #7116 défaut 2) n'offre pas un
       bouton inerte : #7788 porte `MeeshySharePlugin.saveFile`. */
    if (!hasFileDeliveryDoor(host)) return { views, share };
    return {
      views,
      share,
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
