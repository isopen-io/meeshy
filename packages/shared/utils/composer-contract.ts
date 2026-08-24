/**
 * Le contrat du composer — la LOI PRODUIT, et rien d'autre.
 *
 * Ce module ne porte que ce que les deux plateformes doivent honorer à
 * l'identique : les portes, ce que chacune ouvre, et la règle qui interdit
 * d'écrire ce qu'on ne sait pas. Les capacités d'atelier (`showsSlides`,
 * `opensWith`, `allowsCapture`) restent chez chaque plateforme — le web n'a pas
 * d'atelier, lui faire porter ce vocabulaire promettrait des affordances
 * inexistantes.
 *
 * Miroir iOS : `ComposerIntent.swift` (`apps/ios/.../Composer/`), qui devient le
 * MIROIR de ce contrat et cesse d'en être la source. Toute évolution touche les
 * deux sites.
 *
 * @see docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md
 * @see docs/superpowers/specs/2026-08-19-meeshy-composer-views.html — doctrine
 */

/**
 * Les QUATRE formats, énumérables à l'exécution.
 *
 * Même forme que `COMPOSER_DOORS` ci-dessous, et pour la même raison : une
 * union TypeScript disparaît à la compilation, donc chaque consommateur qui a
 * besoin de parcourir les formats en réécrit la liste — et une liste réécrite
 * reste VERTE le jour où un cinquième format entre dans l'union.
 *
 * Ce tableau ne descend aucune affordance : c'est le vocabulaire lui-même, pas
 * ce qu'une plateforme sait en faire. La loi 1 tient.
 */
export const COMPOSER_FORMATS = ['story', 'post', 'reel', 'status'] as const;

export type ComposerFormat = (typeof COMPOSER_FORMATS)[number];

/**
 * Les NEUF portes. Le forward n'en est pas une dixième : la fiche de partage
 * gagne des destinations qui ne sont pas des conversations, et elles retombent
 * sur `conversationMedia` — même graine, même éventail.
 */
export const COMPOSER_DOORS = [
  'storyTray',
  'feedComposer',
  'reelTab',
  'moodChip',
  'repost',
  'edit',
  'draft',
  'share',
  'conversationMedia',
] as const;

export type ComposerDoorKind = (typeof COMPOSER_DOORS)[number];

/**
 * Deux portes PORTENT leur format au lieu de le deviner : l'appelant l'a déjà
 * en main, puisqu'on tape « reposter » ou « modifier » sur une carte rendue.
 */
export type ComposerDoor =
  | { kind: 'storyTray' }
  | { kind: 'feedComposer' }
  | { kind: 'reelTab' }
  | { kind: 'moodChip' }
  | { kind: 'repost'; sourceFormat: ComposerFormat }
  | { kind: 'edit'; documentFormat: ComposerFormat }
  | { kind: 'draft' }
  | { kind: 'share' }
  | { kind: 'conversationMedia' };

export type ComposerOpeningContext = {
  /** `qualifiesAsReel` de la composition COURANTE — source unique, `./reel-composition`. */
  readonly compositionQualifiesAsReel: boolean;
};

export type ComposerOpening = {
  readonly initialFormat: ComposerFormat;
  readonly offeredFormats: ReadonlyArray<ComposerFormat>;
};

/**
 * Le gate AJOUTE le réel, il ne retire jamais le format propre d'une porte —
 * sans quoi l'invariant « l'éventail contient toujours le format initial »
 * tomberait pour l'onglet réels, dont la composition n'existe pas encore quand
 * la caméra s'ouvre.
 */
function plusReelIfQualifying(
  base: ReadonlyArray<ComposerFormat>,
  context: ComposerOpeningContext,
): ReadonlyArray<ComposerFormat> {
  return context.compositionQualifiesAsReel ? [...base, 'reel'] : base;
}

/**
 * Un repost offre sa source ET le post : **changer de format est le geste
 * d'ANCRAGE** — « garder la chose pour de bon ». L'éphémère reste éphémère par
 * défaut (story 20 h, status 1 h) ; le post est la seule cible permanente, donc
 * la seule option ajoutée. Reposter un post ne le propose pas deux fois : il
 * est déjà son propre ancrage.
 */
function repostFormats(source: ComposerFormat): ReadonlyArray<ComposerFormat> {
  return source === 'post' ? ['post'] : [source, 'post'];
}

/**
 * L'édition ne convertit qu'entre POST et RÉEL — `UpdatePostSchema.type` est un
 * `z.enum(['POST','REEL'])`, le serveur refuse le reste. Changer le format d'un
 * contenu déjà publié est le rôle du REPOST, pas de l'édition.
 */
function editFormats(
  document: ComposerFormat,
  context: ComposerOpeningContext,
): ReadonlyArray<ComposerFormat> {
  if (document === 'story' || document === 'status') return [document];
  if (document === 'reel') return ['reel', 'post'];
  return plusReelIfQualifying(['post'], context);
}

/**
 * Ce que la porte décide — un format initial ET l'éventail des formats
 * atteignables depuis lui.
 *
 * C'est la forme donnée à la **loi 9** de la doctrine (« la porte ne fixe que
 * l'état initial ; les capacités visibles sont `f(format COURANT, seed)` »),
 * pas une loi nouvelle.
 *
 * Contrainte de la **loi 4** (« rien à l'écran sans raison ») pour les
 * consommateurs : un format absent de `offeredFormats` n'est pas grisé — il
 * n'est PAS AFFICHÉ.
 */
export function composerOpening(
  door: ComposerDoor,
  context: ComposerOpeningContext,
): ComposerOpening {
  switch (door.kind) {
    case 'storyTray':
      return { initialFormat: 'story', offeredFormats: plusReelIfQualifying(['story', 'post'], context) };
    case 'feedComposer':
      return { initialFormat: 'post', offeredFormats: plusReelIfQualifying(['post', 'story'], context) };
    case 'reelTab':
      return { initialFormat: 'reel', offeredFormats: ['reel', 'post'] };
    case 'moodChip':
      return { initialFormat: 'status', offeredFormats: ['status'] };
    case 'repost':
      return { initialFormat: door.sourceFormat, offeredFormats: repostFormats(door.sourceFormat) };
    case 'edit':
      return { initialFormat: door.documentFormat, offeredFormats: editFormats(door.documentFormat, context) };
    case 'draft':
    case 'share':
      // TRANSITOIRE : le host rebascule au format du document une fois chargé.
      // La table reste fonction de l'origine — elle n'ouvre pas le document
      // pour le deviner.
      return { initialFormat: 'post', offeredFormats: plusReelIfQualifying(['post', 'story'], context) };
    case 'conversationMedia':
      return { initialFormat: 'story', offeredFormats: plusReelIfQualifying(['story', 'post'], context) };
  }
}

/**
 * **On n'écrit que ce qu'on sait complet et qu'on a su rendre.**
 *
 * Deux raisons indépendantes rendent un champ non-écrivable, et la sanction est
 * la même : le formulaire web n'a jamais peint le canevas iOS, donc il ne peut
 * pas le réécrire ; et la charge utile d'une liste porte des mentions amputées
 * par construction (le `select` du fil écarte les mentions silencieuses), donc
 * les republier révoquerait celles que l'auteur avait posées discrètement.
 *
 * Dans les deux cas la clé est **OMISE** du PUT, et `UpdatePostSchema` lit
 * l'absence comme « inchangé » — le tri-état qu'il documente déjà pour
 * `mentions` et `location` (« clé ABSENTE = inchangées, `[]` = plus aucune
 * référence, liste = remplace »).
 *
 * Généralise `editingKnowsDeclaredReferences`
 * (`StoryComposerViewModel+Edit.swift`), qui portait cette discipline sur UN
 * champ. Une fonction, testée une fois, plutôt que sept drapeaux dispersés dont
 * le prochain serait oublié.
 *
 * `known` est volontairement une liste de chaînes et non `keyof T` : un
 * composer peut déclarer connu un champ que la forme du brouillon ne porte pas
 * encore, et cela doit être TOLÉRÉ — la clé est simplement omise — plutôt que
 * refusé à la compilation chez l'appelant.
 */
export function buildUpdatePayload<T extends Record<string, unknown>>(
  known: ReadonlyArray<string>,
  draft: T,
): Partial<T> {
  const writable = [...new Set(known)].filter(
    (key) =>
      Object.prototype.hasOwnProperty.call(draft, key) &&
      draft[key as keyof T] !== undefined,
  );
  // `Object.fromEntries` ne sait pas préserver le type des clés d'un mappé :
  // l'assertion porte sur cette limite du typage, pas sur une incertitude
  // logique — chaque clé retenue est une clé propre de `draft`.
  return Object.fromEntries(writable.map((key) => [key, draft[key as keyof T]])) as Partial<T>;
}
