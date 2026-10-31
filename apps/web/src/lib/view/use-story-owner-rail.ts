import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { StoryActionRailHandlers } from '@/components/story-action-rail';
import type { GallerySaver } from '@/lib/gallery/gallery-saver';
import { storyDownloadableMedia } from '@/lib/api/story-export';
import { gestureAudioContext, storyExportSubject, storyMediaExportSubject, type SceneExportSubject } from '@/lib/export/scene/scene-export-subject';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { browserFileDeliveryHost, hasFileDeliveryDoor, type FileDeliveryHost } from '@/lib/media/file-delivery-host';
import type { StoryPlaybackStory } from '@/lib/stories/playback';
import * as storySaveStore from '@/lib/stories/save-store';

import type { StorySaveNoticeKey, StorySceneExporter } from './owner-rail-export';
import { useCommentsSheetHost, type CommentsSheetHost } from './use-comments-sheet-host';

export type { StorySceneExporter } from './owner-rail-export';

type OwnerRailExport = typeof import('./owner-rail-export');

/** Le geste tapé, son exécution se charge : un chunk qui ne vient pas libère le job et le DIT. */
function runOwnerRailExport(params: {
  readonly job: storySaveStore.StorySaveJobHandle;
  readonly run: (module: OwnerRailExport) => Promise<StorySaveNoticeKey>;
  readonly onUnavailable?: () => void;
}): Promise<StorySaveNoticeKey> {
  const { job } = params;
  return import('./owner-rail-export').then(params.run, () => {
    params.onUnavailable?.();
    job.finish();
    return job.signal.aborted ? 'story.save.cancelled' : 'story.save.offline';
  });
}

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
 *    coque quand elle sera livrée. **Révisé par #13881** : « Partager » livre
 *    désormais le FICHIER composé, il lit donc la même porte que « Enregistrer »
 *    (la coque la tient par `MeeshyShare.shareFile`, #7863) ; le partage d'un
 *    LIEN vit dans « Envoyer » (`forward`), qui ne lit aucune porte ;
 *  - la feuille « Vues » tenait son propre booléen : le focus, éjecté par le
 *    rail devenu `inert`, tombait sur `<body>` à la fermeture. Elle suit
 *    désormais la loi d'hôte PARTAGÉE (`useCommentsSheetHost`, Q5) ;
 *  - le partage était une JUMELLE de `usePostGesture().onShare` : il appelle
 *    le site unique (`publication-share.ts`) avec la région de CE lecteur (D-11).
 *
 * **LE TÉLÉCHARGEMENT ET LA LIVRAISON SONT CHARGÉS À LA DEMANDE** (plafond
 * `story_reader` 11 Ko NON ARBITRÉ, motif D-54 du client TUS du studio) :
 * `downloadFile`, `fileDeliveryPortal` et le moteur d'export ne pèsent sur
 * aucun lecteur qui ne tape jamais « Enregistrer », « Partager » ou
 * « Imager ». Le rendu dure au moins la story : le partage du fichier ne peut
 * pas partir dans le geste, le bandeau offre un toucher neuf (#13881). Ce que
 * fait « Enregistrer » une fois tapé (`owner-rail-export.ts`) se charge de
 * même : le lecteur ne garde que ce qui DÉCIDE d'offrir le geste et ce qui
 * doit naître DANS le geste (le job, le contexte audio).
 */
export type StoryOwnerRail = {
  /** La feuille « Vues » — `postId !== null` ⇒ ouverte. */
  readonly viewers: CommentsSheetHost;
  /** Ce que le lecteur SAIT faire pour le plan auteur ; la loi figée
   * (`showsViews`/`showsExport`) décide, elle, de l'appartenance. */
  readonly handlers: Pick<StoryActionRailHandlers, 'views' | 'share' | 'save'>;
  /** « Imager » (#13881) — le menu « … » du lecteur l'offre ; absent ⇒ rien à composer, ou aucune porte de fichier. */
  readonly imager?: () => void;
  /** L'export en cours de LA story affichée — l'instantané du store. */
  readonly saving: storySaveStore.StorySaveJobView | null;
  readonly cancelSave: () => void;
};

/**
 * **« PARTAGER » ET « IMAGER » D'UNE STORY** (#13881) — la composition passe
 * par le bandeau GLOBAL des exports (`launchSceneExport`) : sa progression,
 * le choix de longueur d'« Imager » au-delà d'une minute, et le toucher
 * « Partager » quand le rendu a fait expirer l'activation du geste. Le moteur
 * se charge au geste ; le contexte audio, lui, naît DANS le geste et voyage.
 */
export type StoryExportLauncher = (input: {
  readonly subject: SceneExportSubject;
  readonly mode: 'share' | 'imager';
  readonly audioContext: AudioContext | null;
}) => Promise<unknown>;

const browserStoryExportLauncher: StoryExportLauncher = (input) =>
  import('@/lib/export/scene/scene-export-launch').then(({ launchSceneExport }) => launchSceneExport(input));

export function useStoryOwnerRail(params: {
  readonly story: StoryPlaybackStory | undefined;
  readonly online: boolean;
  readonly announce: (message: string) => void;
  readonly language: InterfaceLanguage;
  /** Injectable pour les témoins ; le navigateur par défaut. */
  readonly deliveryHost?: FileDeliveryHost;
  /** Injectable pour les témoins ; la galerie de la coque, chargée au premier « Enregistrer », par défaut. */
  readonly gallerySaver?: GallerySaver | null;
  /** Le Prisme du lecteur — les textes de la scène exportée sont ceux qu'il lit. */
  readonly preferredLanguages?: readonly string[];
  /** Injectable pour les témoins ; le moteur d'export du navigateur par défaut. */
  readonly sceneExporter?: StorySceneExporter;
  /** Injectable pour les témoins ; le bandeau global des exports par défaut. */
  readonly exportLauncher?: StoryExportLauncher;
}): StoryOwnerRail {
  const { story, online, announce, language, gallerySaver } = params;
  const preferredLanguages = params.preferredLanguages;
  const sceneExporter = params.sceneExporter;
  const exportLauncher = params.exportLauncher ?? browserStoryExportLauncher;
  const storyId = story?.id;
  const viewers = useCommentsSheetHost(storyId);
  const host = useMemo(() => params.deliveryHost ?? browserFileDeliveryHost(), [params.deliveryHost]);
  /* **`exportMedia` NE DÉPEND PAS DE `hasFileDeliveryDoor`** (revue #7116,
   * défaut 2 ; depuis #13881, « Partager » livre un fichier et lit la porte
   * comme « Enregistrer », dans les gestionnaires) — le premier jet conflait deux portes DISTINCTES sous une seule
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
   * un média exportable ? La porte FICHIER redevient une garde des
   * gestionnaires, ci-dessous — exactement le régime que `repost`/`translations`
   * pratiquent déjà : la loi autorise, le gestionnaire (ou son absence) décide
   * de l'ATTEIGNABILITÉ, indépendamment bouton par bouton. */
  const exportMedia = useMemo(() => storyDownloadableMedia(story), [story]);
  const sceneSubject = useMemo(() => storyExportSubject(story), [story]);
  /* Ce que « Partager » et « Imager » composent : la scène, sinon le média
     d'une story v1, seul (#13881). */
  const composedSubject = useMemo(() => sceneSubject ?? storyMediaExportSubject(story), [sceneSubject, story]);

  /* La story BOUCLE sous la feuille « Vues » (#9821) : c'est le lecteur
     qui le décide (`resolveStoryPlaybackHold`), le rail ne la fige pas. */

  const saving = useSyncExternalStore(
    storySaveStore.subscribe,
    () => (storyId === undefined ? null : storySaveStore.getState(storyId)),
    () => null,
  );

  const launch = useCallback(
    (subject: SceneExportSubject, mode: 'share' | 'imager') => () => {
      /* Le contexte audio naît DANS le geste, avant tout `await` (Safari). */
      const audioContext = gestureAudioContext();
      void exportLauncher({ subject, mode, audioContext }).catch(() => {
        void audioContext?.close().catch(() => undefined);
        announce(translate(language, 'story.save.offline'));
      });
    },
    [exportLauncher, announce, language],
  );

  const offers = useMemo<Pick<StoryOwnerRail, 'handlers' | 'imager'>>(() => {
    if (story === undefined) return { handlers: {} };
    const storyId = story.id;
    const views = () => viewers.open(storyId);
    /* « Partager » et « Enregistrer » livrent un FICHIER : l'hôte qui n'en sait
       livrer aucun (coque d'avant #7863) n'offre pas des boutons inertes.
       « Envoyer » (`forward`, `use-story-send.ts`) garde la feuille d'envoi
       Meeshy, DISTINCTE, qui ne lit aucune porte de fichier. */
    if ((exportMedia === null && sceneSubject === null) || !hasFileDeliveryDoor(host)) return { handlers: { views } };
    const save = () => {
      if (!online) {
        announce(translate(language, 'story.save.offline'));
        return;
      }
      /* Le contexte audio naît DANS le geste, avant tout `await`. */
      const audioContext = sceneSubject === null ? null : gestureAudioContext();
      const job = storySaveStore.start(storyId);
      if (job === null) {
        void audioContext?.close().catch(() => undefined);
        return;
      }
      if (sceneSubject !== null) {
        void runOwnerRailExport({
          job,
          onUnavailable: () => void audioContext?.close().catch(() => undefined),
          run: (module) =>
            module.runComposedStoryExport({
              exporter: sceneExporter ?? module.browserStorySceneExporter,
              subject: sceneSubject,
              audioContext,
              preferredLanguages: preferredLanguages ?? [language],
              placeHere: translate(language, 'scene.place.here'),
              host,
              gallerySaver,
              job,
            }),
        }).then((key) => announce(translate(language, key)));
        return;
      }
      if (exportMedia === null) {
        job.finish();
        return;
      }
      void runOwnerRailExport({
        job,
        run: (module) => module.runStoryExport({ job, storyId, media: exportMedia, host, gallerySaver }),
      }).then((key) => announce(translate(language, key)));
    };
    if (composedSubject === null) return { handlers: { views, save } };
    return {
      handlers: { views, share: launch(composedSubject, 'share'), save },
      imager: launch(composedSubject, 'imager'),
    };
  }, [story, exportMedia, sceneSubject, composedSubject, sceneExporter, launch, preferredLanguages, host, gallerySaver, online, language, announce, viewers.open]);

  const cancelSave = useCallback(() => {
    if (storyId !== undefined) storySaveStore.cancel(storyId);
  }, [storyId]);

  return { viewers, handlers: offers.handlers, ...(offers.imager !== undefined ? { imager: offers.imager } : {}), saving, cancelSave };
}
