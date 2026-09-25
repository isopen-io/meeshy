import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand/react';

import type { PostMenuHost } from '@/components/feed-post-menu';
import { deletePostAction, editPostAction, pinPostAction, postGestureAction, repostAction, reportPostAction } from '@/lib/api/query';
import type { PostActionOutcome } from '@/lib/api/publication-actions';
import { sessionStore } from '@/lib/api/session';
import type { PostToggleKind } from '@/lib/feed/interactions';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { href, navigate } from '@/routes/route-table';

import { withCommentsAnchor } from './comments-anchor';
import { sharePublicationLink } from './publication-share';
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
 *
 * REPARTAGER (#6484) — le QUATRIÈME geste, même raison que les trois autres :
 * `ReelRail` (`components/reel-page.tsx`) en avait besoin, et le rail iOS
 * (`ReelActionRail`) le porte à côté de « J'aime » et « Commenter ». `onRepost`
 * ANNONCE son issue exactement comme `onGesture` — succès, refus ou geste déjà
 * posé (`feed.post.repost.already`, append-only, iOS `ReelsViewModel.repost`).
 */
/** Une UNION LITTÉRALE, jamais le catalogue entier — voir `PostGestureMessageKey`. */
type MenuNotice =
  | 'feed.post.copied'
  | 'feed.post.copy_failed'
  | 'feed.post.pinned'
  | 'feed.post.pin_failed'
  | 'feed.post.edited'
  | 'feed.post.edit_failed'
  | 'feed.post.deleted'
  | 'feed.post.delete_failed'
  | 'report.done'
  | 'report.throttled'
  | 'report.failed';

export function usePostGesture(): {
  readonly announcement: string;
  readonly onGesture: (postId: string, kind: PostToggleKind) => void;
  readonly onShare: (postId: string) => void;
  readonly onComment: (postId: string) => void;
  readonly onRepost: (postId: string) => void;
  readonly menu: PostMenuHost;
} {
  const { text: announcement, announce } = useLiveAnnouncer();
  const viewerId = useStore(sessionStore, (s) => (s.session.status === 'authenticated' ? s.session.user.id : null));

  const onGesture = useCallback(
    (postId: string, kind: PostToggleKind) => {
      void postGestureAction(postId, kind).then((result) => {
        if (!result.ok) announce(translate(currentInterfaceLanguage(), result.message));
        else if (result.notice !== undefined) announce(translate(currentInterfaceLanguage(), result.notice));
      });
    },
    [announce],
  );

  /* Le geste vit dans `publication-share.ts` (site UNIQUE depuis la revue de
     #7116) : le rail auteur du lecteur de stories le partage avec SA région. */
  const onShare = useCallback(
    (postId: string) => void sharePublicationLink({ postId, language: currentInterfaceLanguage(), announce }),
    [announce],
  );

  const onComment = useCallback((postId: string) => {
    navigate(withCommentsAnchor(href('post', { post: postId })));
  }, []);

  const onRepost = useCallback(
    (postId: string) => {
      void repostAction(postId).then((result) => {
        if (!result.ok) announce(translate(currentInterfaceLanguage(), result.message));
        else if (result.notice !== undefined) announce(translate(currentInterfaceLanguage(), result.notice));
      });
    },
    [announce],
  );

  /**
   * LE MENU « ⋯ » (#7533) — ses gestes vivent ICI pour la raison même des
   * trois autres : c'est l'hôte qui tient la région d'annonce, et chaque issue
   * s'annonce (miroir des toasts de `FeedViewModel.swift` : « Publication
   * supprimée », « Publication signalée »…). `viewerId` décide seulement de ce
   * que le menu MONTRE ; la passerelle reste l'autorité.
   */
  const menu = useMemo<PostMenuHost>(() => {
    const say = (key: MenuNotice) => announce(translate(currentInterfaceLanguage(), key));
    return {
      viewerId,
      onCopyText: (text: string) => {
        const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
        if (clipboard === undefined) {
          say('feed.post.copy_failed');
          return;
        }
        void clipboard.writeText(text).then(
          () => say('feed.post.copied'),
          () => say('feed.post.copy_failed'),
        );
      },
      onPin: (postId: string) => {
        void pinPostAction(postId).then((outcome) => say(outcome === 'done' ? 'feed.post.pinned' : 'feed.post.pin_failed'));
      },
      onEdit: (postId: string, content: string): Promise<PostActionOutcome> =>
        editPostAction(postId, content).then((outcome) => {
          say(outcome === 'done' ? 'feed.post.edited' : 'feed.post.edit_failed');
          return outcome;
        }),
      onDelete: (postId: string) => {
        void deletePostAction(postId).then((outcome) => say(outcome === 'done' ? 'feed.post.deleted' : 'feed.post.delete_failed'));
      },
      onReport: (postId, reason) => {
        void reportPostAction(postId, reason).then((outcome) =>
          say(outcome === 'done' ? 'report.done' : outcome === 'throttled' ? 'report.throttled' : 'report.failed'),
        );
      },
    };
  }, [viewerId, announce]);

  return { announcement, onGesture, onShare, onComment, onRepost, menu };
}
