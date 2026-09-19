import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand/react';

import { CommentComposer, type CommentComposerResult } from '@/components/comment-composer';
import { CommentList } from '@/components/comment-list';
import { apiDeps } from '@/lib/api/deps';
import { commentAction, useComments } from '@/lib/api/query';
import { flattenCommentPages, type CommentInfiniteData } from '@/lib/api/publication-comments';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useMinute } from '@/lib/view/use-minute';
import { useReaderLanguages } from '@/lib/view/use-reader';

/**
 * **LE FIL DE COMMENTAIRES, MONTÉ** — la liste (`comment-list.tsx`), son
 * composeur (`comment-composer.tsx`) et la requête, réunis en UNE surface que
 * ses DEUX hôtes partagent : le détail d'une publication (`routes/post.tsx`)
 * et le lecteur de stories. Une story EST une publication éphémère : elle
 * porte le même fil, sur la même route, avec le même cache — deux
 * implémentations auraient divergé au premier ajustement (la leçon des trois
 * familles de résolveurs, CLAUDE.md § Prisme).
 *
 * `tone` ne change QUE l'encre : la scène d'une story est peinte par son
 * contenu, jamais par le thème, donc le fil qui s'y pose vit sur du blanc
 * franc. La DISPOSITION, la hiérarchie et les gestes sont identiques des deux
 * côtés — c'est le sens de D-1.
 */
export type CommentThreadProps = {
  readonly postId: string;
  /** `false` tant que l'hôte n'a pas ouvert le fil — une story qui se lit ne
   * charge pas les commentaires qu'on ne regarde pas. */
  readonly enabled?: boolean;
  readonly tone?: 'onLight' | 'onDark';
};

export function CommentThread({ postId, enabled = true, tone = 'onLight' }: CommentThreadProps) {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const reader = useReaderLanguages();
  const minute = useMinute();
  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiDeps.source, session }), [session]);
  const query = useComments(postId, { enabled });

  const comments = useMemo(
    () => flattenCommentPages(query.data as CommentInfiniteData | undefined),
    [query.data],
  );

  /* `minute` réévalue `new Date()` — même motif que le fil : une seule
     horloge par minute, jamais un `new Date()` par rangée à chaque rendu. */
  const now = useMemo(() => new Date(), [minute]);

  const onSend = useCallback(
    async (content: string): Promise<CommentComposerResult> => {
      const result = await commentAction({
        postId,
        content,
        author: {
          id: viewer.id ?? '',
          displayName: viewer.displayName,
          ...(viewer.handle === null ? {} : { username: viewer.handle }),
          ...(viewer.avatar === undefined ? {} : { avatar: viewer.avatar }),
        },
        /* La langue d'INTERFACE est la meilleure approximation de la langue
           d'écriture que ce client ait — la passerelle la détecte à défaut
           (`CreateCommentSchema.originalLanguage`, « optional — when omitted
           the translation pipeline detects the language »). L'envoyer évite
           une détection sur un texte court, où elle se trompe le plus. */
        originalLanguage: language,
      });
      return result.ok
        ? { ok: true, ...(result.notice === undefined ? {} : { message: result.notice }) }
        : { ok: false, message: result.message };
    },
    [postId, viewer.id, viewer.displayName, viewer.handle, viewer.avatar, language],
  );

  return (
    <section
      data-comment-thread={postId}
      aria-label={translate(language, 'comments.title')}
      className="flex min-h-0 flex-1 flex-col"
      style={tone === 'onDark' ? { colorScheme: 'dark' } : undefined}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        <CommentList
          comments={comments}
          state={{
            loading: query.isPending,
            error: query.isError,
            online,
            hasMore: query.hasNextPage,
            loadingMore: query.isFetchingNextPage,
          }}
          language={language}
          preferredLanguages={reader.languages}
          locale={reader.locale}
          now={now}
          onRetry={() => void query.refetch()}
          onMore={() => void query.fetchNextPage()}
        />
      </div>
      {/* UN VISITEUR ANONYME NE COMMENTE PAS — la passerelle exige un
          `registeredUser` (`comments.ts:184-186`). Offrir le champ puis
          refuser en 401 serait un contrôle qui ment (loi 4). */}
      <CommentComposer language={language} onSend={onSend} canWrite={viewer.id !== null && !viewer.isAnonymous} />
    </section>
  );
}
