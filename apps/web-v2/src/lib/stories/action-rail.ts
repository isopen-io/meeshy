/**
 * **LE RAIL D'ACTIONS DU LECTEUR DE STORIES** — loi PURE, portage vecteur à
 * vecteur de `StoryActionRailPlan.resolve`
 * (`apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift:45-73`),
 * et de son GEL (`frozenRailPlan`, `:216-232` et `:578-645`).
 *
 * Ce module ne connaît NI le DOM, NI le réseau, NI React : il répond à deux
 * questions, et à rien d'autre —
 *
 *   1. quels boutons ce rail porte-t-il, pour CETTE story et CE lecteur ?
 *   2. ce que la lecture apprend ensuite a-t-il le droit de changer la
 *      réponse ?
 *
 * **La seconde est la raison d'être du module.** Directive porteur du
 * 2026-07-10, citée par le fichier Swift : « le calcul des boutons à afficher
 * doit se faire avant affichage, même contenant toutes les informations de
 * compteur — pas des apparitions en second temps ». Toutes les entrées
 * viennent du corpus déjà en main (compteurs compris) : aucune résolution
 * réseau n'est nécessaire pour décider du jeu. Les VALEURS affichées sur les
 * boutons restent vivantes ; l'APPARTENANCE d'un bouton au rail ne change
 * jamais en cours de diapositive — un compteur réconcilié après coup ne fait
 * plus surgir un bouton au milieu de la lecture.
 *
 * DEUX remontées, et deux seulement, franchissent le gel — toutes deux à
 * SENS UNIQUE (un bouton peut apparaître, jamais disparaître sous le doigt) :
 *
 *   - le SON, parce que la présence d'une piste audible s'établit par un
 *     sondage asynchrone qui conclut souvent après l'entrée
 *     (`adaptiveOnChange(of: storyHasAudibleSound)`, `:604-608`) ;
 *   - les COMMENTAIRES, mais seulement sur la RÉCONCILIATION D'OUVERTURE
 *     (`storyCommentCountReconciledPulse`, `:625-645`) — jamais sur l'activité
 *     temps réel, ni sur son propre envoi. D'où `reconcileStoryActionRailComments`,
 *     une fonction SÉPARÉE : si la réconciliation arrivait par la même porte
 *     que les entrées vivantes, rien ne distinguerait plus « le corpus était
 *     périmé » de « quelqu'un vient de commenter », et le rail clignoterait.
 */

export type StoryActionRailPlan = {
  readonly showsSound: boolean;
  readonly showsReact: boolean;
  readonly showsReply: boolean;
  readonly showsForward: boolean;
  readonly showsRepost: boolean;
  readonly showsViews: boolean;
  readonly showsExport: boolean;
  readonly showsComments: boolean;
  readonly showsTranslations: boolean;
};

export type StoryActionRailInputs = {
  readonly storyId: string;
  readonly isOwnStory: boolean;
  /** `onReplyToStory != nil` chez iOS — l'hôte a-t-il un chemin de réponse à
   * offrir ? Une porte de CAPACITÉ, pas de permission. */
  readonly canReply: boolean;
  readonly hasAudibleSound: boolean;
  readonly commentCount: number;
  readonly hasTranslatableContent: boolean;
};

/**
 * `StoryActionRailPlan.resolve` — la loi NUE, sans gel.
 *
 * `showsRepost: !isOwnStory` SANS gate `isPublicStory` : arbitrage porteur du
 * 2026-08-19 (D1, cité `:57-65`). Une story FRIENDS se republie en FRIENDS ou
 * PRIVATE ; c'est la LOI D'AUDIENCE qui borne le CHOIX, plus l'appartenance
 * au rail — gater ici rendait la règle inatteignable, le bouton n'existant
 * pas pour les seules stories qu'elle concerne.
 *
 * `showsTranslations: hasTranslatableContent` sans gate sur l'auteur
 * (changement iOS du 2026-07-25) : « le Prisme est un outil de lecture, pas
 * une permission » — l'auteur explore les langues de sa propre story.
 */
export function resolveStoryActionRailPlan(inputs: StoryActionRailInputs): StoryActionRailPlan {
  return {
    showsSound: inputs.hasAudibleSound,
    showsReact: !inputs.isOwnStory,
    showsReply: !inputs.isOwnStory && inputs.canReply,
    showsForward: true,
    showsRepost: !inputs.isOwnStory,
    showsViews: inputs.isOwnStory,
    showsExport: inputs.isOwnStory,
    showsComments: inputs.commentCount > 0,
    showsTranslations: inputs.hasTranslatableContent,
  };
}

/** Le plan FIGÉ porte l'identité de la story qui l'a produit : un plan sans
 * son étiquette ne peut pas dire s'il vaut encore pour ce qu'on regarde —
 * même discipline que `mediaDuration` et `soundAvailability` dans le lecteur
 * (`routes/story.tsx`), où une remise à zéro « à chaque story » était une
 * course entre les effets du parent et ceux de l'enfant. */
export type FrozenStoryActionRail = {
  readonly storyId: string;
  readonly plan: StoryActionRailPlan;
};

/**
 * Le gel, et ses DEUX seules sorties :
 *
 *  - la story CHANGE (ou rien n'est encore figé) ⇒ le plan se re-résout en
 *    entier, c'est l'entrée de diapositive ;
 *  - la story est la MÊME ⇒ le plan est rendu TEL QUEL — identité comprise,
 *    pour qu'un hôte React ne recompose pas son rail à chaque message reçu —
 *    sauf la remontée du son, à sens unique.
 */
export function freezeStoryActionRail(
  current: FrozenStoryActionRail | null,
  inputs: StoryActionRailInputs,
): FrozenStoryActionRail {
  if (current === null || current.storyId !== inputs.storyId) {
    return { storyId: inputs.storyId, plan: resolveStoryActionRailPlan(inputs) };
  }
  if (current.plan.showsSound || !inputs.hasAudibleSound) return current;
  return { storyId: current.storyId, plan: { ...current.plan, showsSound: true } };
}

/**
 * La réconciliation d'OUVERTURE du compteur de commentaires — la seconde
 * remontée, et la seule qui touche `showsComments`. Rend le MÊME objet quand
 * elle n'apprend rien : ni compteur nul, ni autre story, ni bouton déjà là.
 */
export function reconcileStoryActionRailComments(
  current: FrozenStoryActionRail,
  reconciled: { readonly storyId: string; readonly commentCount: number },
): FrozenStoryActionRail {
  if (current.storyId !== reconciled.storyId) return current;
  if (current.plan.showsComments || reconciled.commentCount <= 0) return current;
  return { storyId: current.storyId, plan: { ...current.plan, showsComments: true } };
}

/**
 * **L'ORDRE DU RAIL, DÉRIVÉ — jamais recopié.** Le fichier Swift a supprimé
 * ses blocs NUMÉROTÉS pour cette raison exacte (`:464-478`) : « déplacer le
 * son d'un cran a suffi à rendre la moitié de la suite fausse ». Ici l'ordre
 * est une DONNÉE unique, que le rendu parcourt — il n'existe nulle part une
 * seconde liste à tenir d'accord avec celle-ci.
 *
 * `views` occupe la MÊME fente que `repost` (`else if railPlan.showsViews`,
 * `:672-682`) : les deux ne coexistent jamais, la loi les rendant
 * mutuellement exclusifs (`!isOwnStory` contre `isOwnStory`). La fente est
 * respectée par la POSITION dans cette liste, pas par une branche au rendu.
 *
 * `share` et `save` sont les DEUX faces de `showsExport` (`StoryExportRailButtons`,
 * `:88-108`) : elles apparaissent et disparaissent toujours ensemble.
 */
export const STORY_ACTION_RAIL_ORDER = [
  'sound',
  'react',
  'reply',
  'forward',
  'repost',
  'views',
  'share',
  'save',
  'comments',
  'translations',
] as const;

export type StoryActionRailButton = (typeof STORY_ACTION_RAIL_ORDER)[number];

const GATE: Readonly<Record<StoryActionRailButton, (plan: StoryActionRailPlan) => boolean>> = {
  sound: (p) => p.showsSound,
  react: (p) => p.showsReact,
  reply: (p) => p.showsReply,
  forward: (p) => p.showsForward,
  repost: (p) => p.showsRepost,
  views: (p) => p.showsViews,
  share: (p) => p.showsExport,
  save: (p) => p.showsExport,
  comments: (p) => p.showsComments,
  translations: (p) => p.showsTranslations,
};

/** Les boutons du rail, dans l'ordre, pour un plan donné. Le rendu itère
 * CETTE liste : un bouton dont la loi dit `false` n'a pas de branche à
 * oublier — il n'est simplement pas là. */
export function storyActionRailButtons(plan: StoryActionRailPlan): readonly StoryActionRailButton[] {
  return STORY_ACTION_RAIL_ORDER.filter((button) => GATE[button](plan));
}
