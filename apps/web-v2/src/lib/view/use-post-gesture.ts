import { useCallback } from 'react';

import { postGestureAction, recordShareAction } from '@/lib/api/query';
import type { PostToggleKind } from '@/lib/feed/interactions';
import { publicationShareUrl, RETOUR_PARTAGE_PUBLICATION } from '@/lib/feed/share-url';

import { partagerLien } from './invitation';
import { useLiveAnnouncer } from './use-live-announcer';

/**
 * `usePostGesture` (#6278) — le SEUL hôte des gestes d'une publication, que
 * le fil et le détail montent tous deux : l'intention part vers
 * `postGestureAction` (aimer, enregistrer) ou la feuille de partage, et
 * l'issue s'ANNONCE, exactement comme une réaction du fil de messages
 * (`use-message-menu.ts`). Sans annonce, un échec défait l'optimiste en
 * silence pour l'œil qui regarde ailleurs, et un geste hors ligne ressemble à
 * un geste confirmé. L'écran pose `announcement` dans une région
 * `role="status"`.
 *
 * PARTAGER (D-48) — `partagerLien` part DANS le gestionnaire, sans `await`
 * préalable : la feuille du système n'ouvre que pendant l'activation du geste.
 * Le partage n'est COMPTÉ qu'une fois le lien réellement parti.
 */
export function usePostGesture(): {
  readonly announcement: string;
  readonly onGesture: (postId: string, kind: PostToggleKind) => void;
  readonly onShare: (postId: string) => void;
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

  const onShare = useCallback(
    (postId: string) => {
      void partagerLien({ title: 'Meeshy', text: 'Une publication sur Meeshy', url: publicationShareUrl(postId) }).then(
        (result) => {
          if (result === 'partage' || result === 'copie') void recordShareAction(postId);
          const retour = RETOUR_PARTAGE_PUBLICATION[result];
          if (retour !== null) announce(retour);
        },
      );
    },
    [announce],
  );

  return { announcement, onGesture, onShare };
}
