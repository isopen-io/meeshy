'use client';

import { useCallback, useState } from 'react';
import { webComposerOpening, type ComposerDoor, type ComposerFormat } from '@/lib/composer-door';
import { COMPOSER_FORMATS } from '@meeshy/shared/utils/composer-contract';
import {
  ComposerDocumentSurface,
  type ComposerDocumentPayload,
  type DocumentFormat,
} from '@/components/composer/ComposerDocumentSurface';

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
 * Une seule surface existe aujourd'hui, celle du format document (post/réel).
 * Un format que le meuble ne sait pas peindre n'est pas seulement inerte : le
 * choisir démonterait la surface, donc l'éventail qui vit dedans, donc tout
 * chemin de retour — le brouillon entier serait perdu sans recours. La loi 4
 * l'interdit d'avance : ce que l'auteur peut choisir est l'intersection de ce
 * que la PORTE offre et de ce que l'HÔTE sait peindre, et `ROUTABLE_FORMATS`
 * descend jusqu'à la surface pour que l'éventail ne peigne rien d'autre.
 *
 * Cette intersection n'ajoute aucune loi à la table partagée : elle avoue une
 * capacité, et elle se referme d'elle-même le jour où les surfaces manquantes
 * arrivent — `ROUTABLE_FORMATS` se dérive du prédicat de routage, pas d'une
 * troisième liste tenue à la main.
 */

const NO_COMPOSITION = [] as const;

const isDocumentFormat = (format: ComposerFormat): format is DocumentFormat =>
  format === 'post' || format === 'reel';

/** Ce que CE meuble sait peindre — dérivé du routage, jamais réécrit. */
const ROUTABLE_FORMATS: ReadonlyArray<ComposerFormat> = COMPOSER_FORMATS.filter(isDocumentFormat);

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
  readonly disabled?: boolean;
  readonly className?: string;
}

export function MeeshyComposer({
  door,
  currentUser,
  onPublish,
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
  // l'ancienne.
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

  if (!isDocumentFormat(format)) return null;

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

export type { ComposerDocumentPayload };
