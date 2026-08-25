import { useCallback } from 'react';
import { useRepostMutation } from '@/hooks/queries/use-post-mutations';
import type { PostType } from '@meeshy/shared/types/post';

/**
 * Le site UNIQUE qui pose `{ isQuote, targetType, content? }` sur
 * `useRepostMutation()` — W8.
 *
 * Avant ce lot, chaque écran (`PostsFeedScreen`, `ReelsFeedScreen`,
 * `app/feeds/post/[postId]/page.tsx`, `app/reel/[postId]/page.tsx`,
 * `app/story/[postId]/page.tsx`) rejouait cette charge à la main — huit
 * endroits, la même règle recopiée huit fois. Le commentaire de
 * `RepostRequest.targetType` disait « ce sont les tests par site d'appel qui
 * tiennent la loi » : c'était vrai tant qu'il y avait plusieurs sites. Il n'y
 * en a plus qu'un — celui-ci.
 *
 * Ce hook ne résout AUCUNE cible : `targetId` est fourni par l'appelant, qu'il
 * vienne de `repostTargetId()` (surfaces de carte — fil, fil des réels, page
 * de détail) ou de `story.id` (viewer de story, délibérément exclu de
 * `repostTargetId()`, voir `packages/shared/utils/repost-target.ts`). Les deux
 * familles d'appelants partagent ce site sans que l'une ne connaisse l'autre.
 */
export interface ComposerRepostArgs {
  readonly targetId: string;
  readonly targetType: PostType;
  readonly isQuote: boolean;
  /** Présent seulement pour une citation — jamais posé sur un repost sec. */
  readonly content?: string;
}

export interface ComposerRepostCallbacks {
  readonly onSuccess?: () => void;
  readonly onError?: () => void;
}

export function useComposerRepost() {
  const repostMutation = useRepostMutation();

  const repost = useCallback(
    (args: ComposerRepostArgs, callbacks: ComposerRepostCallbacks = {}) => {
      repostMutation.mutate(
        {
          postId: args.targetId,
          data: {
            isQuote: args.isQuote,
            targetType: args.targetType,
            ...(args.isQuote && args.content !== undefined ? { content: args.content } : {}),
          },
        },
        {
          onSuccess: () => callbacks.onSuccess?.(),
          onError: () => callbacks.onError?.(),
        },
      );
    },
    [repostMutation],
  );

  return { repost, isPending: repostMutation.isPending };
}
