import type { QueryClient } from '@tanstack/react-query';

import type { StoryReactionPlan, StoryReactionSubject } from '@/lib/stories/reaction';

import { STORY_FEED_QUERY_KEY, type StoryFeedPost } from './stories';

/**
 * **`story:reacted` / `story:unreacted` — LE RAIL SUIT EN DIRECT (#7227,
 * W8).** La passerelle les diffuse depuis toujours
 * (`SocialEventsHandler.ts:446,450`) ; `socket.ts` ne les écoutait pas.
 *
 * **CE MODULE EST SÉPARÉ DE `lib/stories/reaction.ts` / `lib/api/story-
 * reactions.ts` DÉLIBÉRÉMENT** — les deux sont importés STATIQUEMENT par
 * `routes/story.tsx` (le lecteur plein écran, chunk `story_reader`,
 * `budgets.json`, plafond 11 Ko déjà serré) pour le geste INTERACTIF du
 * lecteur (`toggleStoryReaction`, l'optimiste ±1). La loi d'APPLICATION d'un
 * événement socket ne sert que l'écouteur temps réel, chargé en `import()`
 * (D-98, motif `comment:added`/`publication-comments.ts`) : la fusionner
 * dans les fichiers ci-dessus ferait payer au lecteur une loi qu'il n'exerce
 * jamais — MESURÉ : 9,76 → 11,02 Ko, DÉPASSEMENT du plafond, avant cette
 * extraction.
 */

/**
 * **LA JUMELLE SERVIE de `toggleStoryReaction`** (`lib/stories/reaction.ts`).
 *
 * `toggleStoryReaction` sert l'OPTIMISTE local (delta ±1, bascule
 * inconditionnelle) : c'est le lecteur qui vient d'agir, il sait déjà quel
 * emoji est sien. Un événement socket diffère sur les DEUX axes :
 *
 *  - **le compte est ABSOLU** (`likeCount`, miroir de `PostLikedEventData` —
 *    même garantie de convergence sous double livraison ou événement manqué
 *    qu'un `±1` local n'offre pas) ;
 *  - **`currentUserReactions` ne bascule QUE pour le geste du LECTEUR** (un
 *    autre de SES appareils) : l'événement est diffusé à TOUT le monde, et le
 *    cœur d'un AUTRE ne doit jamais remplir le mien (même garde que
 *    `post:liked`, `feed/interactions.ts#togglePost`).
 *
 * **`likeCount` SE POSE SUR `reactionCount`, ET CE SONT DEUX COLONNES**
 * (revue-correction W8, #7227) — `Post.likeCount` et `Post.reactionCount`
 * (`schema.prisma:3443,3456`) sont distinctes, et la voie qui ÉMET
 * `story:reacted`/`story:unreacted` — `POST|DELETE /posts/:id/like`,
 * `PostService.likePost`/`unlikePost` — n'écrit QUE `likeCount` ; seule la
 * voie socket `post:reaction-add` (`PostReactionService:357`) les synchronise.
 * Le rail affiche pourtant `reactionCount` (`stories.ts:224`, peint par
 * `routes/story.tsx:970`). On pose ici le compte DIFFUSÉ parce qu'il est le
 * seul VRAI — il compte les lignes `PostReaction` relues — pendant que la
 * colonne servie au chargement peut être en retard. **La divergence est
 * SERVEUR, pas cliente** : l'aligner demande que `likePost` écrive aussi
 * `reactionCount`, ce qui est un lot de passerelle, pas de ce lot.
 */
export function applyServedStoryReaction<T extends StoryReactionSubject>(
  story: T,
  change: {
    readonly storyId: string;
    readonly emoji: string;
    readonly likeCount: number;
    readonly plan: StoryReactionPlan;
    readonly byViewer: boolean;
  },
): T {
  if (story.id !== change.storyId) return story;
  const countChanged = story.reactionCount !== change.likeCount;
  if (!change.byViewer) return countChanged ? { ...story, reactionCount: change.likeCount } : story;

  const mine = story.currentUserReactions ?? [];
  const has = mine.includes(change.emoji);
  if (has === (change.plan === 'add') && !countChanged) return story;
  const next = change.plan === 'add' ? [...mine, change.emoji] : mine.filter((e) => e !== change.emoji);
  return { ...story, currentUserReactions: has === (change.plan === 'add') ? mine : next, reactionCount: change.likeCount };
}

/**
 * LA GARDE — vérifie ce dont `applyServedStoryReaction` dépend : un id de
 * story, un emoji, un `likeCount` FINI (la borne basse d'un compteur négatif
 * n'a pas de sens et signale une charge malformée plutôt qu'un vrai retrait).
 */
export function isStoryReactionEvent(
  payload: unknown,
): payload is { readonly storyId: string; readonly userId: string; readonly emoji: string; readonly likeCount: number } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.storyId === 'string' &&
    typeof p.userId === 'string' &&
    typeof p.emoji === 'string' &&
    typeof p.likeCount === 'number' &&
    Number.isFinite(p.likeCount)
  );
}

/**
 * L'APPLICATION — une charge invalide ne change rien et ne lève pas
 * (`socket.ts` route, il ne juge pas) ; un corpus jamais chargé n'est pas
 * fabriqué (même discipline que `applyCommentAdded`, `publication-comments.ts`).
 */
export function applyStoryReactionEvent(
  queryClient: QueryClient,
  payload: unknown,
  params: { readonly viewerId: string; readonly plan: StoryReactionPlan },
): void {
  if (!isStoryReactionEvent(payload)) return;
  queryClient.setQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY, (stories) =>
    stories === undefined
      ? stories
      : stories.map((s) =>
          applyServedStoryReaction(s, {
            storyId: payload.storyId,
            emoji: payload.emoji,
            likeCount: payload.likeCount,
            plan: params.plan,
            byViewer: payload.userId === params.viewerId,
          }),
        ),
  );
}
