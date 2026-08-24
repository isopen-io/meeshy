'use client';

import { useCallback, useState } from 'react';
import { webComposerOpening, type ComposerDoor, type ComposerFormat } from '@/lib/composer-door';
import { COMPOSER_FORMATS } from '@meeshy/shared/utils/composer-contract';
import {
  ComposerDocumentSurface,
  type ComposerDocumentPayload,
  type DocumentFormat,
} from '@/components/composer/ComposerDocumentSurface';
import {
  StoryComposerSurface,
  type ComposerStoryPayload,
  type StoryVisibility,
} from '@/components/v2/StoryComposer';
import { ComposerMoodSurface, type ComposerStatusPayload } from '@/components/composer/ComposerMoodSurface';

/**
 * Le meuble — l'hôte qui lit la PORTE et peint la surface du format courant.
 *
 * Il ne connaît qu'une chose du contrat : ce que la porte ouvre. `door` entre,
 * `webComposerOpening` (`lib/composer-door.ts`) rend l'état initial, et l'auteur
 * navigue ensuite dans l'éventail que la surface peint. C'est la forme de la
 * **loi 9** de la doctrine — la porte ne fixe que l'état INITIAL ; les capacités
 * visibles sont fonction du format COURANT.
 *
 * ### Pourquoi l'état initial se lit sur une composition VIDE
 *
 * `composerOpening` ne consulte la composition que pour l'ÉVENTAIL : le gate de
 * qualification n'alimente que `offeredFormats`, jamais `initialFormat`
 * (`composer-contract.ts`, `composerOpening`). Lire l'état initial sur une composition vide
 * rend donc exactement ce qu'il rendrait sur n'importe quelle autre. L'éventail,
 * lui, se recalcule à chaque composition — et c'est la surface qui le tient,
 * puisque c'est elle qui tient les médias.
 *
 * ### La porte est VIVANTE
 *
 * `initialFormat` se recalcule à chaque rendu, mais un `useState` ne se sème
 * qu'au montage : sans re-semis explicite, changer `door` sur une instance déjà
 * montée laisserait le format de l'ANCIENNE porte en place. Un écran qui tient
 * sa porte en état sur un seul composer — cinq gestes, cinq portes — ouvrirait
 * alors l'onglet Réels sur POST et publierait des POST en silence. Le format se
 * re-sème donc quand la CLÉ de la porte change, et seulement là : un rendu de
 * même porte ne réinitialise jamais un format que l'auteur vient de choisir.
 *
 * Ce que le re-semis n'entreprend PAS : sauver le brouillon. Le contenu, les
 * médias et l'audience vivent dans la surface ; si la porte neuve ouvre sur un
 * format que ce meuble ne peint pas, la surface se démonte et son brouillon
 * part avec elle. Changer de porte est un geste de navigation de l'appelant, et
 * l'appelant est le seul à savoir s'il doit le confirmer.
 *
 * ### Ce que CE fichier ne peint pas, et ce qu'il n'offre donc pas
 *
 * Trois surfaces existent aujourd'hui : celle du format document (post/réel,
 * `ComposerDocumentSurface`), celle du format story (`StoryComposerSurface`,
 * W5 — absorbée depuis `components/v2/StoryComposer.tsx`, qui en reste
 * l'enrobage historique), et celle du format mood (`ComposerMoodSurface`, W6 —
 * un PORT frais, pas une absorption : `components/v2/StatusComposer.tsx` reste
 * intact et indépendant). Un format que le meuble ne sait pas peindre n'est
 * pas seulement inerte : le choisir démonterait la surface, donc l'éventail
 * qui vit dedans, donc tout chemin de retour — le brouillon entier serait
 * perdu sans recours. La loi 4 l'interdit d'avance : ce que l'auteur peut
 * choisir est l'intersection de ce que la PORTE offre et de ce que l'HÔTE
 * sait peindre, et `ROUTABLE_FORMATS` descend jusqu'à CHAQUE surface pour que
 * leur éventail ne peigne rien d'autre.
 *
 * Cette intersection n'ajoute aucune loi à la table partagée : elle avoue une
 * capacité, et elle se referme d'elle-même le jour où les surfaces manquantes
 * arrivent — `ROUTABLE_FORMATS` se dérive du prédicat de routage, pas d'une
 * troisième liste tenue à la main. Passer de `story` à `post` (ou l'inverse)
 * via l'éventail DÉMONTE une surface et en monte une autre : ce n'est PAS le
 * défaut W1-W3 (un format non peint retournant `null`) — les deux surfaces
 * sont réelles et fonctionnelles, c'est un remplacement de brouillon
 * délibéré, au même titre que fermer un formulaire pour en ouvrir un autre.
 * Seul le cas post↔réel préserve le brouillon, parce que les deux partagent
 * la MÊME surface montée (`ComposerDocumentSurface`).
 */

const NO_COMPOSITION = [] as const;

const isDocumentFormat = (format: ComposerFormat): format is DocumentFormat =>
  format === 'post' || format === 'reel';

/** Les formats que CE meuble sait peindre : document, story, ou mood. */
type RoutableFormat = Extract<ComposerFormat, 'post' | 'reel' | 'story' | 'status'>;

const isRoutableFormat = (format: ComposerFormat): format is RoutableFormat =>
  isDocumentFormat(format) || format === 'story' || format === 'status';

/** Ce que CE meuble sait peindre — dérivé du routage, jamais réécrit. */
const ROUTABLE_FORMATS: ReadonlyArray<ComposerFormat> = COMPOSER_FORMATS.filter(isRoutableFormat);

/**
 * L'identité d'une porte, réduite à ce dont dépend son ouverture : sa sorte, et
 * le format qu'elle PORTE quand elle en porte un (`repost`, `edit`). Deux
 * `edit` de formats différents sont deux portes ; deux rendus de la même porte
 * n'en sont qu'une, même si l'appelant en refabrique l'objet à chaque rendu.
 */
function doorKeyOf(door: ComposerDoor): string {
  if (door.kind === 'repost') return `repost:${door.sourceFormat}`;
  if (door.kind === 'edit') return `edit:${door.documentFormat}`;
  return door.kind;
}

export interface MeeshyComposerProps {
  readonly door: ComposerDoor;
  readonly currentUser?: { username: string; avatar?: string | null } | null;
  readonly onPublish: (payload: ComposerDocumentPayload) => void;
  /**
   * W5 — le format story publie par CE canal, jamais par `onPublish`
   * (document). OPTIONNEL : un appelant dont aucune porte ne résout jamais
   * sur `story` (ex. la porte `reelTab`, qui ne l'offre jamais) n'a rien à
   * fournir. Un appelant dont une porte OFFRE `story` (`feedComposer`,
   * `storyTray`, …) sans le fournir voit son bouton Publier de la surface
   * story devenir un no-op silencieux plutôt qu'un crash — jamais une
   * exception jetée pour un canal que l'appelant a choisi de ne pas brancher.
   */
  readonly onPublishStory?: (payload: ComposerStoryPayload) => void;
  /**
   * W6 — le format mood publie par CE canal, jamais par `onPublish`
   * (document). OPTIONNEL, même contrat que `onPublishStory` : une porte qui
   * n'offre jamais `status` (toutes, sauf `moodChip`) n'a rien à fournir ; un
   * appelant de `moodChip` sans ce canal voit le bouton Publier de la surface
   * mood devenir un no-op silencieux, jamais un crash.
   */
  readonly onPublishStatus?: (payload: ComposerStatusPayload) => void;
  /**
   * W6 — un mood DÉJÀ PUBLIÉ. Il SÈME la surface mood (emoji présélectionné,
   * texte prérempli) et il est la moitié « il y a quelque chose à effacer » du
   * bouton Effacer. `undefined`/`null` ⇒ composition fraîche. Sans valeur par
   * défaut, à dessein — même raison que `viaUsername` côté iOS : un `nil`
   * implicite ferait disparaître le bouton Effacer d'un site de montage sans
   * casser la moindre compilation.
   */
  readonly currentStatus?: { moodEmoji: string; content?: string } | null;
  /**
   * W6 — l'autre moitié du bouton Effacer : le canal par lequel l'effacement
   * d'un mood voyage. Il est DISTINCT de `onPublishStatus` parce que ce sont
   * deux intentions, et parce que la charge qu'un effacement emprunterait sur
   * le canal de création ne porte aucun contenu — ce que le gateway refuse
   * (`ComposerMoodSurface.tsx`, note de fichier). Absent ⇒ le bouton n'est pas
   * peint.
   */
  readonly onClearStatus?: () => void;
  /**
   * W5 — la visibilité sur laquelle le format story OUVRE. Elle existe et est
   * déjà lue en production (`useStoryPreferences().preferences.defaultVisibility`,
   * que `PostsFeedScreen.tsx` descend au dialogue autonome) : sans site sur ce
   * meuble, une story composée par la surface neuve naîtrait TOUJOURS
   * `DEFAULT_PUBLICATION_VISIBILITY` — un élargissement silencieux de
   * l'audience sur le contrôle le plus sensible. Absente ⇒ ce défaut par
   * défaut, inchangé.
   */
  readonly storyDefaultVisibility?: StoryVisibility;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function MeeshyComposer({
  door,
  currentUser,
  onPublish,
  onPublishStory,
  onPublishStatus,
  currentStatus,
  onClearStatus,
  storyDefaultVisibility,
  disabled,
  className,
}: MeeshyComposerProps) {
  const initialFormat = webComposerOpening(door, NO_COMPOSITION).initialFormat;
  const doorKey = doorKeyOf(door);
  const [format, setFormat] = useState<ComposerFormat>(initialFormat);
  const [seededDoorKey, setSeededDoorKey] = useState(doorKey);

  // Re-semis pendant le rendu plutôt que dans un effet : React ré-exécute
  // immédiatement ce composant avec le nouvel état, sans jamais valider à
  // l'écran la frame où la porte neuve porterait encore le format de
  // l'ancienne. Ce mécanisme est générique — il ne connaît PAS `story` en
  // particulier, et n'a donc rien demandé de plus pour W5.
  if (seededDoorKey !== doorKey) {
    setSeededDoorKey(doorKey);
    setFormat(initialFormat);
  }

  // Publier referme le brouillon : la surface remet le sien à zéro, le meuble
  // remet le format à ce que la porte ouvrait. Sans cela, une publication en
  // RÉEL laisserait la porte ouverte sur un format que l'auteur n'a pas
  // redemandé pour le brouillon suivant.
  const handlePublish = useCallback(
    (payload: ComposerDocumentPayload) => {
      onPublish(payload);
      setFormat(initialFormat);
    },
    [onPublish, initialFormat],
  );

  const handlePublishStory = useCallback(
    (payload: ComposerStoryPayload) => {
      onPublishStory?.(payload);
      setFormat(initialFormat);
    },
    [onPublishStory, initialFormat],
  );

  const handlePublishStatus = useCallback(
    (payload: ComposerStatusPayload) => {
      onPublishStatus?.(payload);
      setFormat(initialFormat);
    },
    [onPublishStatus, initialFormat],
  );

  if (!isRoutableFormat(format)) return null;

  if (format === 'story') {
    return (
      <StoryComposerSurface
        door={door}
        onFormatChange={setFormat}
        routableFormats={ROUTABLE_FORMATS}
        defaultVisibility={storyDefaultVisibility}
        onPublish={handlePublishStory}
        disabled={disabled}
        className={className}
      />
    );
  }

  if (format === 'status') {
    return (
      <ComposerMoodSurface
        currentStatus={currentStatus}
        onClearStatus={onClearStatus}
        onPublish={handlePublishStatus}
        disabled={disabled}
        className={className}
      />
    );
  }

  return (
    <ComposerDocumentSurface
      door={door}
      format={format}
      onFormatChange={setFormat}
      routableFormats={ROUTABLE_FORMATS}
      currentUser={currentUser}
      onPublish={handlePublish}
      disabled={disabled}
      className={className}
    />
  );
}

MeeshyComposer.displayName = 'MeeshyComposer';

export type { ComposerDocumentPayload, ComposerStoryPayload, ComposerStatusPayload };
