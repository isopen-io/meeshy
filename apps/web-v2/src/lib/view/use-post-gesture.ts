import { useCallback } from 'react';

import { postGestureAction, recordShareAction } from '@/lib/api/query';
import type { PostToggleKind } from '@/lib/feed/interactions';
import { publicationShareUrl, RETOUR_PARTAGE_PUBLICATION } from '@/lib/feed/share-url';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { href, navigate } from '@/routes/route-table';

import { withCommentsAnchor } from './comments-anchor';
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
 *
 * COMMENTER (#7113) — le TROISIÈME geste de la rangée d'actions, et il vit
 * ici pour la même raison que les deux autres. Il était recopié chez DEUX
 * hôtes (`feed.tsx`, `user-profile.tsx`), chacun réécrivant la même adresse,
 * pendant que les deux autres écrans montant la carte n'en avaient aucune :
 * leur compteur restait un `<span>` inerte, ce que la loi 4 rend correct et
 * ce qui fait qu'aucun témoin ne rougissait. Une intention recopiée chez ses
 * appelants est une intention qu'un appelant oublie — c'est arrivé deux fois.
 * Désormais tout écran qui monte la carte le reçoit en le DÉSTRUCTURANT.
 *
 * Il NAVIGUE plutôt qu'il n'ouvre une couche : iOS présente
 * `FeedCommentsSheet`, le web a déjà une adresse pour ce fil, et y mener garde
 * un lien PARTAGEABLE — jamais un état modal sans URL.
 */
export function usePostGesture(): {
  readonly announcement: string;
  readonly onGesture: (postId: string, kind: PostToggleKind) => void;
  readonly onShare: (postId: string) => void;
  readonly onComment: (postId: string) => void;
} {
  const { text: announcement, announce } = useLiveAnnouncer();

  const onGesture = useCallback(
    (postId: string, kind: PostToggleKind) => {
      void postGestureAction(postId, kind).then((result) => {
        if (!result.ok) announce(translate(currentInterfaceLanguage(), result.message));
        else if (result.notice !== undefined) announce(translate(currentInterfaceLanguage(), result.notice));
      });
    },
    [announce],
  );

  const onShare = useCallback(
    (postId: string) => {
      const language = currentInterfaceLanguage();
      void partagerLien({ title: 'Meeshy', text: translate(language, 'feed.share.text'), url: publicationShareUrl(postId) }).then(
        (result) => {
          if (result === 'partage' || result === 'copie') void recordShareAction(postId);
          const retourKey = RETOUR_PARTAGE_PUBLICATION[result];
          if (retourKey !== null) announce(translate(currentInterfaceLanguage(), retourKey));
        },
      );
    },
    [announce],
  );

  const onComment = useCallback((postId: string) => {
    navigate(withCommentsAnchor(href('post', { post: postId })));
  }, []);

  return { announcement, onGesture, onShare, onComment };
}
