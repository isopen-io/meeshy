import { useCallback, useState, type ReactNode } from 'react';

import { ContentRemovalSheet } from '@/components/content-removal-sheet';
import type { PostActionOutcome } from '@/lib/api/publication-actions';
import { deletePostAction } from '@/lib/api/query';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { moderatesPlatformContent } from '@/lib/view/content-removal';
import { useServedGlobalRole } from '@/lib/view/use-admin-access';

/**
 * **« RETIRER » UNE STORY D'UN AUTRE** (#11150) — l'entrée du menu « … » du
 * lecteur, offerte à la modération de plateforme (MODERATOR/ADMIN/BIGBOSS)
 * sur la story d'un autre. Elle ouvre la feuille du motif ; la confirmation
 * referme le lecteur (la story a quitté chaque caisse, `deletePost`) et
 * l'issue s'annonce — un refus de la passerelle la fait revenir au corpus.
 *
 * Le rôle et le geste sont injectables pour les témoins.
 */
export function useStoryRemoval(params: {
  readonly storyId: string | undefined;
  readonly isMine: boolean;
  readonly announce: (message: string) => void;
  readonly onRemoved: () => void;
  readonly platformRole?: string | null;
  readonly remove?: (postId: string, reason: string) => Promise<PostActionOutcome>;
}): { readonly onRemove: (() => void) | undefined; readonly open: boolean; readonly sheet: ReactNode } {
  const { storyId, isMine, announce, onRemoved } = params;
  const servedRole = useServedGlobalRole();
  const role = params.platformRole === undefined ? servedRole : params.platformRole;
  const remove = params.remove ?? deletePostAction;
  const [target, setTarget] = useState<string | null>(null);

  const confirm = useCallback(
    (reason: string) => {
      if (target === null) return;
      setTarget(null);
      onRemoved();
      void remove(target, reason).then((outcome) =>
        announce(translate(currentInterfaceLanguage(), outcome === 'done' ? 'moderation.remove.done' : 'moderation.remove.failed')),
      );
    },
    [target, remove, onRemoved, announce],
  );

  const offered = storyId !== undefined && !isMine && moderatesPlatformContent(role);
  return {
    onRemove: offered ? () => setTarget(storyId) : undefined,
    open: target !== null,
    sheet: target === null ? null : <ContentRemovalSheet onConfirm={confirm} onCancel={() => setTarget(null)} />,
  };
}
