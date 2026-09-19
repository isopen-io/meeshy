/**
 * **RÉAGIR À UNE STORY, CÔTÉ CACHE** — lois PURES, sur la forme que la
 * passerelle sert réellement.
 *
 * Une story est une PUBLICATION éphémère : réagir passe par
 * `POST|DELETE /api/v1/posts/:postId/like`
 * (`services/gateway/src/routes/posts/interactions.ts:86,265`), le MÊME
 * couple que « Aimer » au Flux, avec un corps `{ emoji }` optionnel
 * (`LikeSchema`/`UnlikeSchema`, `routes/posts/types.ts:560-575` — le POST
 * retombe sur « ❤️ », le DELETE sur la plus récente).
 *
 * **CE QUI DIFFÈRE DU FLUX, ET POURQUOI CE MODULE EXISTE** : le corpus des
 * stories ne porte PAS `isLikedByMe`. `scope=stories` sert
 * `currentUserReactions: string[]` — la liste des emojis que CE lecteur a
 * posés (`PostFeedService.ts:511`, `userReactionsMap`) — pendant que le Flux
 * sert un booléen (`postIncludes.ts`). Lire le booléen sur une story le
 * trouverait TOUJOURS absent : chaque tap aurait alors posé une réaction, et
 * la retirer aurait été impossible. Le geste est le même, la LECTURE de
 * l'état ne l'est pas ; c'est cette lecture-là qu'on écrit ici, une fois.
 */

/** Le défaut de `LikeSchema` (`types.ts:561`) — la passerelle le pose
 * elle-même quand le corps est vide ; on l'écrit ici parce que l'optimiste
 * doit savoir QUEL emoji il ajoute avant que la passerelle réponde. */
export const STORY_DEFAULT_REACTION = '❤️';

/** La forme MINIMALE qu'une story doit porter pour qu'on sache si le lecteur
 * a réagi — un sous-ensemble de `StoryFeedPost`, pour que ce module reste
 * éprouvable sans la forme complète du corpus. */
export type StoryReactionSubject = {
  readonly id: string;
  readonly currentUserReactions?: readonly string[] | null | undefined;
  readonly reactionCount?: number | null | undefined;
};

export type StoryReactionPlan = 'add' | 'remove';

/** `add` quand cet emoji n'est pas déjà mien sur cette story, `remove`
 * sinon — aucune notion de plafond ici : `isReactionAllowed` borne les
 * réactions d'un MESSAGE (`packages/shared/utils/reaction-limit.ts`), et la
 * passerelle ne l'applique pas à `POST /posts/:id/like`. Inventer un plafond
 * côté client refuserait un geste que le serveur accepte. */
export function storyReactionPlan(params: {
  readonly mine: readonly string[] | null | undefined;
  readonly emoji: string;
}): StoryReactionPlan {
  return (params.mine ?? []).includes(params.emoji) ? 'remove' : 'add';
}

const shifted = (count: number | null | undefined, delta: 1 | -1): number => {
  const current = typeof count === 'number' && Number.isFinite(count) ? count : 0;
  return Math.max(0, current + delta);
};

/**
 * UNE story basculée, IMMUABLE — l'identité des autres est préservée (le
 * corpus est une liste que le lecteur re-rend à chaque avance), et une
 * bascule DÉJÀ faite ne recompte pas : un second retour de la passerelle sur
 * un optimiste déjà posé laisserait sinon un compte de deux pour un geste.
 */
export function toggleStoryReaction<T extends StoryReactionSubject>(
  story: T,
  change: { readonly storyId: string; readonly emoji: string; readonly plan: StoryReactionPlan },
): T {
  if (story.id !== change.storyId) return story;
  const mine = story.currentUserReactions ?? [];
  const has = mine.includes(change.emoji);
  if (has === (change.plan === 'add')) return story;
  const next = change.plan === 'add' ? [...mine, change.emoji] : mine.filter((e) => e !== change.emoji);
  return { ...story, currentUserReactions: next, reactionCount: shifted(story.reactionCount, change.plan === 'add' ? 1 : -1) };
}

/** Le corpus entier, une story touchée. Rend la MÊME liste quand rien ne
 * change — le lecteur ne se re-rend pas pour une story qu'il ne regarde pas. */
export function applyStoryReaction<T extends StoryReactionSubject>(
  stories: readonly T[] | undefined,
  change: { readonly storyId: string; readonly emoji: string; readonly plan: StoryReactionPlan },
): readonly T[] | undefined {
  if (stories === undefined) return stories;
  const next = stories.map((s) => toggleStoryReaction(s, change));
  return next.every((s, i) => s === stories[i]) ? stories : next;
}

/** Ai-je réagi à cette story avec cet emoji ? La question que le rail pose
 * pour peindre son cœur — et le SEUL endroit où la forme
 * `currentUserReactions` est lue. */
export function hasReactedToStory(story: StoryReactionSubject | undefined, emoji: string): boolean {
  return (story?.currentUserReactions ?? []).includes(emoji);
}
