import { useCallback } from 'react';

import type { CommentSettingOutcome } from '@/lib/api/comment-settings';
import { commentSettingAction } from '@/lib/api/query';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { moderatesPlatformContent } from '@/lib/view/content-removal';
import { useServedGlobalRole } from '@/lib/view/use-admin-access';
import { useOwnCommentsDisabled } from '@/lib/view/use-comments-closed';

/**
 * **« DÉSACTIVER / RÉACTIVER LES COMMENTAIRES » D'UNE STORY** (#16541) —
 * l'entrée du menu « … » du lecteur, à l'AUTEUR et à la modération de
 * plateforme (MODERATOR/ADMIN/BIGBOSS, la même loi que « Retirer »). Le geste
 * est optimiste (`commentSettingAction`) : la feuille de commentaires ouverte
 * perd sa barre au tap ; l'issue s'annonce, un refus rend l'état d'avant.
 *
 * Le rôle et le geste sont injectables pour les témoins.
 */
export function useStoryCommentSettings(params: {
  readonly storyId: string | undefined;
  readonly isMine: boolean;
  readonly announce: (message: string) => void;
  readonly platformRole?: string | null;
  readonly toggle?: (postId: string, disabled: boolean) => Promise<CommentSettingOutcome>;
}): { readonly onToggle: (() => void) | undefined; readonly disabled: boolean } {
  const { storyId, isMine, announce } = params;
  const servedRole = useServedGlobalRole();
  const role = params.platformRole === undefined ? servedRole : params.platformRole;
  const toggle = params.toggle ?? commentSettingAction;
  const disabled = useOwnCommentsDisabled(storyId);

  const run = useCallback(() => {
    if (storyId === undefined) return;
    const disable = !disabled;
    void toggle(storyId, disable).then((outcome) =>
      announce(
        translate(
          currentInterfaceLanguage(),
          outcome !== 'done' ? 'feed.post.comments_toggle.failed' : disable ? 'feed.post.comments_off.done' : 'feed.post.comments_on.done',
        ),
      ),
    );
  }, [storyId, disabled, toggle, announce]);

  const offered = storyId !== undefined && (isMine || moderatesPlatformContent(role));
  return { onToggle: offered ? run : undefined, disabled };
}
