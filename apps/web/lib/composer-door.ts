/**
 * Le point d'entrée UNIQUE du web dans le contrat du composer.
 *
 * Le contrat vit dans `@meeshy/shared/utils/composer-contract` : c'est lui qui
 * porte la table des portes, l'éventail des formats et la règle d'écriture. Ce
 * module n'en rejoue AUCUNE règle — il les appelle, et il ajoute exactement les
 * deux choses que le web doit fournir pour les appeler :
 *
 *   1. la **composition courante** (le contrat veut un booléen déjà résolu ;
 *      le web tient des médias) ;
 *   2. la **traduction de vocabulaire** entre le contrat (`ComposerFormat`,
 *      minuscules) et le fil (`PostType`, majuscules).
 *
 * `composerOpening` et `buildUpdatePayload` ne sont appelés QUE d'ici — c'est
 * ce que compte `__tests__/lib/composer-door-single-source.test.ts`.
 *
 * Miroir Swift : `composer-contract.ts` nomme lui-même le sien et rappelle que
 * toute évolution touche les deux sites. Ce fichier ne fait que consommer la
 * table ; il n'ajoute aucune loi à mirroiter.
 */

import {
  buildUpdatePayload,
  composerOpening,
  type ComposerDoor,
  type ComposerDoorKind,
  type ComposerFormat,
  type ComposerOpening,
} from '@meeshy/shared/utils/composer-contract';
import { qualifiesAsReel, type ReelMediaLike } from '@meeshy/shared/utils/reel-composition';
import type { PostType } from '@meeshy/shared/types/post';

export type { ComposerDoor, ComposerDoorKind, ComposerFormat, ComposerOpening };

/**
 * Ce que la porte ouvre, pour la composition que le web tient EN MAIN.
 *
 * `ReelMediaLike` (`mimeType: string | null`, `duration?: number | null`) est
 * la forme du prédicat partagé, et elle accepte telles quelles les deux formes
 * de média du web — `PostMedia` (un post déjà publié) et
 * `UploadedAttachmentResponse` (un brouillon en cours) — sans normalisation
 * intermédiaire, donc sans second endroit où la règle pourrait glisser.
 */
export function webComposerOpening(
  door: ComposerDoor,
  composition: ReadonlyArray<ReelMediaLike>,
): ComposerOpening {
  return composerOpening(door, { compositionQualifiesAsReel: qualifiesAsReel(composition) });
}

const POST_TYPE_BY_FORMAT = {
  story: 'STORY',
  post: 'POST',
  reel: 'REEL',
  status: 'STATUS',
} as const satisfies Record<ComposerFormat, PostType>;

const FORMAT_BY_POST_TYPE = {
  STORY: 'story',
  POST: 'post',
  REEL: 'reel',
  STATUS: 'status',
} as const satisfies Record<PostType, ComposerFormat>;

/** Le vocabulaire du contrat vers celui du fil. Bijection totale, 4 ↔ 4. */
export function postTypeOf(format: ComposerFormat): PostType {
  return POST_TYPE_BY_FORMAT[format];
}

/** Le vocabulaire du fil vers celui du contrat. Bijection totale, 4 ↔ 4. */
export function composerFormatOf(type: PostType): ComposerFormat {
  return FORMAT_BY_POST_TYPE[type];
}

/**
 * Les deux champs qu'une édition **web** ne réécrit jamais, quoi qu'elle
 * déclare connaître. Ce sont les deux raisons que `buildUpdatePayload`
 * documente déjà, appliquées à la seule plateforme qui les subit :
 *
 * - `mentions` — la charge d'une liste porte des références amputées par
 *   construction ; les republier révoquerait les références silencieuses, et
 *   `[]` les effacerait toutes (`UpdatePostSchema.mentions` est un tri-état) ;
 * - `storyEffects` — aucun formulaire web n'a jamais peint ce canevas.
 *
 * La protection est ici et non chez l'appelant : un appelant qui déclare l'un
 * des deux connu par erreur n'écrit toujours rien. Elle ne dit RIEN des autres
 * champs — `removeMediaIds` et `mediaIds` passent, et leur bonne valeur est
 * l'affaire de leur formulaire. `visibilityUserIds`, lui, ne passe QUE
 * accompagné de sa `visibility` : voir la règle de couple ci-dessous, qui est
 * une contrainte distincte et ne fait pas de lui un champ non-écrivable.
 */
export const WEB_UNWRITABLE_POST_FIELDS = ['mentions', 'storyEffects'] as const;

const UNWRITABLE = new Set<string>(WEB_UNWRITABLE_POST_FIELDS);

/**
 * La liste d'audience ne s'écrit pas sans l'audience qu'elle qualifie.
 *
 * Le serveur ne rattrape pas ce cas : le `.refine` d'`UpdatePostSchema` ne
 * valide le couple EXCEPT/ONLY que si `visibility` est PRÉSENT dans la charge —
 * il ne consulte jamais la visibilité STOCKÉE — et le service écrit
 * `visibilityUserIds` dès que la clé n'est pas `undefined`, `[]` compris. Un
 * PUT `{ visibilityUserIds: [] }` sur un post stocké `ONLY` remplace donc sa
 * liste blanche par le vide, en 200 OK, sans erreur ni journal : le post
 * devient invisible pour tout le monde.
 *
 * La règle est structurelle, pas conditionnelle à une valeur : ce n'est pas la
 * liste VIDE qu'on refuse, c'est la moitié de couple. Un formulaire qui veut
 * changer la seule liste déclare donc aussi la visibilité — il ré-affirme le
 * couple qu'il a rendu, et le serveur retrouve de quoi rejeter (400) un `ONLY`
 * sans destinataire au lieu de l'écrire.
 */
const AUDIENCE_LIST_FIELD = 'visibilityUserIds';
const AUDIENCE_FIELD = 'visibility';

/**
 * Le PUT d'une édition web : `buildUpdatePayload` du contrat, moins les champs
 * non-écrivables, moins la liste d'audience orpheline. Un champ `undefined`
 * dans le brouillon reste absent de la charge — c'est ainsi qu'« inchangé » se
 * dit au serveur.
 */
export function webUpdatePayload<T extends Record<string, unknown>>(
  known: ReadonlyArray<string>,
  draft: T,
): Partial<T> {
  const writable = known.filter((key) => !UNWRITABLE.has(key));
  const writesAudience =
    writable.includes(AUDIENCE_FIELD) &&
    Object.prototype.hasOwnProperty.call(draft, AUDIENCE_FIELD) &&
    draft[AUDIENCE_FIELD as keyof T] !== undefined;

  return buildUpdatePayload(
    writesAudience ? writable : writable.filter((key) => key !== AUDIENCE_LIST_FIELD),
    draft,
  );
}
