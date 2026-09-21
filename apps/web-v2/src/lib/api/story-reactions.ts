import type { QueryClient } from '@tanstack/react-query';

import {
  STORY_DEFAULT_REACTION,
  applyStoryReaction,
  hasReactedToStory,
  storyReactionPlan,
  toggleStoryReaction,
  type StoryReactionPlan,
} from '@/lib/stories/reaction';

import { newClientMessageId } from './client-message-id';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';
import { STORY_FEED_QUERY_KEY, storyPostQueryKey, type StoryFeedPost } from './stories';

/**
 * **RÉAGIR À UNE STORY** — le PORT, au-dessus de la loi pure
 * (`lib/stories/reaction.ts`). MÊME route que « Aimer » au Flux :
 * `POST|DELETE /api/v1/posts/:postId/like`
 * (`services/gateway/src/routes/posts/interactions.ts:86,265`, `requiredAuth`
 * + `registeredUser` obligatoire), corps `{ emoji }`, idempotence par
 * `X-Client-Mutation-Id` (`middleware/clientMutationId.ts`, `cmid_<uuid>`) —
 * le même en-tête et la même forme que `feed-gestures.ts`, parce que c'est
 * la même route.
 *
 * Ce fichier n'est donc PAS une jumelle de `feed-gestures.ts` : ce qui y est
 * écrit est ce que le corpus des STORIES a de différent — l'état du lecteur y
 * est une LISTE d'emojis (`currentUserReactions`), pas un booléen, et le
 * cache à basculer est `STORY_FEED_QUERY_KEY`, que `performPostGesture` ne
 * connaît pas. Le jour où le Flux et les stories serviront la même forme, les
 * deux ports fusionneront ; jusque-là, les faire tenir dans une seule
 * fonction obligerait chaque appelant à dire laquelle des deux formes il a.
 *
 * ISSUES, même grammaire que les gestes du fil :
 *  - succès : l'optimiste reflète déjà la réalité ;
 *  - panne PASSAGÈRE (réseau, 5xx, 408/425/429 — `outcomeOf`) : l'optimiste
 *    RESTE, ANNONCÉ. Aucune promesse de rejeu (la file de reprise est #5868) ;
 *  - refus PERMANENT : l'optimiste est DÉFAIT et l'échec annoncé.
 */
export type StoryReactionDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly queryClient: QueryClient;
};

/** Une CLÉ de catalogue, jamais un texte traduit — seule la surface qui
 * annonce connaît la langue d'interface. */
export type StoryReactionMessageKey = 'feed.like.error' | 'feed.gesture.pending';

export const STORY_REACTION_FAILED: StoryReactionMessageKey = 'feed.like.error';
export const STORY_REACTION_PENDING: StoryReactionMessageKey = 'feed.gesture.pending';

export type StoryReactionResult =
  | { readonly ok: true; readonly notice?: StoryReactionMessageKey }
  | { readonly ok: false; readonly message: StoryReactionMessageKey };

/** UN geste à la fois par story ET par emoji — un second tap pendant l'appel
 * enverrait un `DELETE` qui croiserait le `POST` encore en route (miroir
 * `isHeartInFlight`, `FeedPostCard.swift:974`). */
const inFlight = new Set<string>();

/**
 * **UNE STORY VIT DANS L'UN OU L'AUTRE DES DEUX CACHES, parfois les deux.**
 * Le corpus du plateau (`STORY_FEED_QUERY_KEY`) ne sert que les 50 plus
 * récentes ; une story ouverte par LIEN hors de cette fenêtre arrive par la
 * TROISIÈME MARCHE de la cascade (`storyPostQueryKey`,
 * `stories.ts#loadStoryPost`), et le lecteur la FUSIONNE dans ses groupes —
 * elle s'affiche comme les autres, avec le même rail.
 *
 * Ce port ne connaissait que le corpus. Sur une story de lien, donc :
 * `applyStoryReaction` sur une liste qui ne la contient pas rendait la MÊME
 * liste (l'optimiste tombait dans le vide), l'état du lecteur se lisait
 * ABSENT — chaque tap repartait en `add`, le retrait devenait impossible —
 * et le rollback d'un refus ne défaisait rien. La requête partait, la
 * passerelle enregistrait, **et l'écran ne bougeait pas d'un pixel** : le
 * cœur du rail EXISTAIT sans avoir aucun EFFET. Suivre une donnée jusqu'à
 * son consommateur s'arrête un cran trop tôt — il faut la suivre jusqu'au
 * PIXEL, et ici le pixel lit un AUTRE cache.
 */
function knownStory(queryClient: QueryClient, storyId: string): StoryFeedPost | undefined {
  const corpus = queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY);
  return corpus?.find((s) => s.id === storyId) ?? queryClient.getQueryData<StoryFeedPost>(storyPostQueryKey(storyId));
}

/** L'optimiste, posé sur les DEUX caches en UN geste — n'en servir qu'un
 * laisserait un cœur plein d'un côté et vide de l'autre dès que la story
 * vit dans les deux. L'updater qui rend `undefined` fait renoncer
 * `setQueryData` : un cache qui n'a pas cette story n'en reçoit pas une. */
function applyStoryReactionEverywhere(
  queryClient: QueryClient,
  change: { readonly storyId: string; readonly emoji: string; readonly plan: StoryReactionPlan },
): void {
  queryClient.setQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY, (data) => applyStoryReaction(data, change));
  queryClient.setQueryData<StoryFeedPost>(storyPostQueryKey(change.storyId), (data) =>
    data === undefined ? data : toggleStoryReaction(data, change),
  );
}

const newClientMutationId = (): string => newClientMessageId().replace(/^cid_/, 'cmid_');

function sendStoryReaction(
  deps: StoryReactionDeps,
  params: { readonly storyId: string; readonly emoji: string; readonly plan: StoryReactionPlan },
): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return Promise.resolve({ ok: true, status: params.plan === 'add' ? 201 : 200, data: { liked: params.plan === 'add' } });
  }
  return deps.transport.request<unknown>({
    method: params.plan === 'add' ? 'POST' : 'DELETE',
    path: `/api/v1/posts/${encodeURIComponent(params.storyId)}/like`,
    body: { emoji: params.emoji },
    headers: { 'X-Client-Mutation-Id': newClientMutationId() },
  });
}

export async function performStoryReaction(params: {
  readonly storyId: string;
  readonly emoji?: string;
  readonly deps: StoryReactionDeps;
}): Promise<StoryReactionResult> {
  const { storyId, deps } = params;
  const emoji = params.emoji ?? STORY_DEFAULT_REACTION;
  const flightKey = `${storyId}:${emoji}`;
  if (inFlight.has(flightKey)) return { ok: true };

  const known = knownStory(deps.queryClient, storyId);
  const plan = storyReactionPlan({ mine: known?.currentUserReactions, emoji });

  const apply = (p: StoryReactionPlan) =>
    applyStoryReactionEverywhere(deps.queryClient, { storyId, emoji, plan: p });

  apply(plan);
  inFlight.add(flightKey);
  try {
    const result = await sendStoryReaction(deps, { storyId, emoji, plan }).catch(() => null);
    if (result === null) return { ok: true, notice: STORY_REACTION_PENDING };
    if (result.ok) return { ok: true };
    if (outcomeOf(result) !== 'permanent') return { ok: true, notice: STORY_REACTION_PENDING };

    /* UN RETRAIT REFUSÉ EN 404 EST UNE RÉCONCILIATION, pas un échec : la
       passerelle dit que la réaction n'existe pas. La restaurer re-poserait
       « mienne » et le tap suivant retomberait sur le même 404 — le contrôle
       de retrait deviendrait INERTE (même défaut et même remède que
       `performReaction`, `reactions.ts:167-182`). */
    if (plan === 'remove' && result.status === 404) return { ok: true };

    apply(plan === 'add' ? 'remove' : 'add');
    return { ok: false, message: STORY_REACTION_FAILED };
  } finally {
    inFlight.delete(flightKey);
  }
}

/** Le cœur du rail est-il plein ? Lu des MÊMES caches que ceux que le geste
 * bascule — jamais d'un état local, qui divergerait à la première avance,
 * et jamais du seul corpus, qui ignore la story ouverte par LIEN. */
export function viewerReactedToStory(
  queryClient: QueryClient,
  storyId: string,
  emoji: string = STORY_DEFAULT_REACTION,
): boolean {
  return hasReactedToStory(knownStory(queryClient, storyId), emoji);
}

/**
 * **CE QU'IL FAUT DIRE, ET QUAND SE TAIRE** (#7112, revue) — l'adaptateur
 * `issue → annonce`, extrait de l'hôte (`routes/story.tsx`) pour la raison
 * qui l'a rendu nécessaire : aucun fichier de test du dépôt n'importe cet
 * hôte, et sous fixtures `sendStoryReaction` rend `{ok:true}` de façon
 * SYNCHRONE — ni `!result.ok` ni `result.notice` n'y sont joignables. La
 * règle vivait donc à l'unique endroit où ni un témoin unitaire ni un gate
 * de navigateur ne pouvait l'atteindre : effaçable demain sans qu'un seul
 * gate ne rougisse.
 *
 * Trois issues, DEUX annonces — le succès NET se tait. Un geste confirmé a
 * déjà son retour : le cœur a basculé sous le doigt, et son compte avec.
 * Une annonce de plus serait du bruit sur chaque tap.
 */
export function storyReactionAnnouncement(result: StoryReactionResult): StoryReactionMessageKey | null {
  if (!result.ok) return result.message;
  return result.notice ?? null;
}

/*
 * `story:reacted` / `story:unreacted`, CÔTÉ TEMPS RÉEL, vivent dans
 * `lib/api/reaction-realtime.ts` — CE fichier est importé
 * STATIQUEMENT par `routes/story.tsx` (chunk `story_reader`, budgets.json) ;
 * la loi d'application d'un événement socket ne sert QUE l'écouteur, chargé
 * en `import()`. Voir le doc-comment jumeau dans `lib/stories/reaction.ts`.
 */
