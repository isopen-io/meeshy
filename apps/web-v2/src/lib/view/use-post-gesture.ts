import { useCallback } from 'react';

import { postGestureAction } from '@/lib/api/query';
import type { PostToggleKind } from '@/lib/feed/interactions';

import { useLiveAnnouncer } from './use-live-announcer';

/**
 * `usePostGesture` (#6278) — le SEUL hôte des gestes d'une publication, que
 * le fil et le détail montent tous deux : l'intention part vers
 * `postGestureAction`, l'issue s'ANNONCE (échec, ou geste non confirmé hors
 * ligne), exactement comme une réaction du fil de messages
 * (`use-message-menu.ts`). Sans annonce, un échec défait l'optimiste en
 * silence pour l'œil qui regarde ailleurs, et un geste hors ligne ressemble à
 * un geste confirmé. L'écran pose `announcement` dans une région
 * `role="status"`.
 */
export function usePostGesture(): {
  readonly announcement: string;
  readonly onGesture: (postId: string, kind: PostToggleKind) => void;
} {
  const { text: announcement, announce } = useLiveAnnouncer();
  const onGesture = useCallback(
    (postId: string, kind: PostToggleKind) => {
      void postGestureAction(postId, kind).then((result) => {
        if (!result.ok) announce(result.message);
        else if (result.notice !== undefined) announce(result.notice);
      });
    },
    [announce],
  );
  return { announcement, onGesture };
}
