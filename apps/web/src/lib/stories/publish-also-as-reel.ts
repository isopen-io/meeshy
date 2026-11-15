import { studioPublishRefusal, type PublicationKind } from './publication-kind';
import type { PublishChoice } from './publication-layout';
import { studioPublishablePageCount, type StudioDraft } from './studio';

/**
 * **UNE STORY PART AUSSI EN RÉEL, D'UN SEUL GESTE** (#9476) — miroir de
 * `ComposerPublishMenuRule.companionReelOffered` / `toggled` / `armed`
 * (iOS, `ComposerPublishMenu.swift`).
 *
 * Le porteur a publié une story (photo, texte, son emprunté de 238 s) qu'il
 * voulait aussi en réel : le menu n'armait qu'UN format, et un seul
 * `POST /posts` `type: STORY` est parti. Quand la story peut partir aussi en
 * réel, Story et Réel se COCHENT ENSEMBLE au menu, et la passerelle publie
 * les deux (`alsoAsReel`, le réel recevant ses PROPRES médias copiés).
 */

/** L'offre : la story ET le réel publiables (la règle SERVEUR du réel,
 * `studioPublishRefusal`), UNE seule page — un réel est une scène, une story
 * de plusieurs pages partirait en plusieurs réels —, jamais à la modification
 * d'une publication existante. */
export function companionReelOffered(params: { readonly draft: StudioDraft; readonly editing: boolean }): boolean {
  if (params.editing || studioPublishablePageCount(params.draft) !== 1) return false;
  return studioPublishRefusal(params.draft, 'STORY') === null && studioPublishRefusal(params.draft, 'REEL') === null;
}

/** Les formats qui PARTENT — ce que le menu coche, ce que la capsule nomme. */
export function publishedKinds(choice: PublishChoice): readonly PublicationKind[] {
  return choice.alsoAsReel === true ? [choice.kind, 'REEL'] : [choice.kind];
}

const alone = (kind: PublicationKind): PublishChoice => ({ kind, layout: null });
const storyAndReel: PublishChoice = { kind: 'STORY', layout: null, alsoAsReel: true };

/** **CE QUE TOUCHE UNE LIGNE SANS AGENCEMENT** — sous l'offre, toucher Réel
 * ou Story AJOUTE ou RETIRE l'autre, jamais au point de ne plus rien cocher ;
 * partout ailleurs, la ligne arme son format seul, comme avant. */
export function toggledPublishChoice(kind: PublicationKind, armed: PublishChoice, offered: boolean): PublishChoice {
  if (!offered || armed.layout !== null) return alone(kind);
  const both = armed.alsoAsReel === true;
  if (kind === 'REEL' && armed.kind === 'STORY') return both ? alone('STORY') : storyAndReel;
  if (kind === 'STORY' && armed.kind === 'REEL') return storyAndReel;
  if (kind === 'STORY' && both) return alone('REEL');
  return alone(kind);
}

/** **CE QUE LA CAPSULE PUBLIE** — le réel ne survit que là où le menu
 * l'OFFRE : sinon la story part seule, et la capsule le dit. Un réel annoncé
 * qui ne partirait pas est le défaut que ce lot ferme. */
export function armedPublishChoice(choice: PublishChoice, offered: boolean): PublishChoice {
  if (choice.alsoAsReel !== true) return choice;
  return offered && choice.kind === 'STORY' && choice.layout === null ? choice : { kind: choice.kind, layout: choice.layout };
}

export type PublishChoiceTitleKey =
  | 'story.studio.publish.as.story'
  | 'story.studio.publish.as.post'
  | 'story.studio.publish.as.reel'
  | 'story.studio.publish.as.storyAndReel';

const TITLE_KEY: Readonly<Record<PublicationKind, PublishChoiceTitleKey>> = {
  STORY: 'story.studio.publish.as.story',
  POST: 'story.studio.publish.as.post',
  REEL: 'story.studio.publish.as.reel',
};

/** Ce que dit la partie principale : « Publier la story et le réel » quand les
 * deux partent, le format seul sinon. */
export function publishChoiceTitleKey(choice: PublishChoice): PublishChoiceTitleKey {
  return choice.alsoAsReel === true ? 'story.studio.publish.as.storyAndReel' : TITLE_KEY[choice.kind];
}
