import { useCallback, useMemo, useState } from 'react';
import { useStore } from 'zustand/react';

import { CommentComposer, type CommentComposerResult } from '@/components/comment-composer';
import { CommentList } from '@/components/comment-list';
import type { CommentGestureHandlers } from '@/components/comment-row';
import type { CommentGestureMessageKey, CommentGestureRequest } from '@/lib/api/comment-gestures';
import { apiDeps } from '@/lib/api/deps';
import { commentAction, commentGestureAction, useComments } from '@/lib/api/query';
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

  /**
   * L'ÉCHEC D'UN GESTE VIT ICI, PAR RANGÉE — la liste ne charge rien (son
   * contrat) et la rangée ne connaît pas le réseau. On garde la REQUÊTE, pas
   * seulement son message : « Réessayer » rejoue EXACTEMENT le geste refusé,
   * sans que la rangée ait à se souvenir duquel il s'agissait.
   */
  const [failures, setFailures] = useState<ReadonlyMap<string, { message: CommentGestureMessageKey; request: CommentGestureRequest }>>(
    () => new Map(),
  );
  const [notice, setNotice] = useState('');

  const runGesture = useCallback(
    async (request: CommentGestureRequest) => {
      setFailures((current) => {
        if (!current.has(request.commentId)) return current;
        const next = new Map(current);
        next.delete(request.commentId);
        return next;
      });
      setNotice('');
      const result = await commentGestureAction(request);
      if (result.ok) {
        /* PARTI MAIS NON CONFIRMÉ : l'optimiste tient, et le silence serait
           indiscernable d'une confirmation (même règle que le composeur). */
        if (result.notice !== undefined) setNotice(translate(language, result.notice));
        return;
      }
      setFailures((current) => new Map(current).set(request.commentId, { message: result.message, request }));
    },
    [language],
  );

  /* UN VISITEUR ANONYME N'A AUCUN GESTE — les trois routes exigent un
     `registeredUser` (`comments.ts`), exactement comme le composeur. */
  const canWrite = viewer.id !== null && !viewer.isAnonymous;
  const viewerId = viewer.id ?? '';

  const gestures = useMemo<CommentGestureHandlers | undefined>(
    () =>
      canWrite
        ? {
            viewerId,
            onLike: (commentId) => void runGesture({ kind: 'like', postId, commentId }),
            onDelete: (commentId) => void runGesture({ kind: 'delete', postId, commentId }),
            onEdit: (commentId, content) =>
              void runGesture({ kind: 'edit', postId, commentId, content, originalLanguage: language }),
            failureOf: (commentId) => failures.get(commentId)?.message,
            onRetryGesture: (commentId) => {
              const failed = failures.get(commentId);
              if (failed !== undefined) void runGesture(failed.request);
            },
          }
        : undefined,
    [canWrite, viewerId, postId, language, runGesture, failures],
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
          {...(gestures === undefined ? {} : { gestures })}
        />
      </div>
      {notice !== '' ? (
        <p role="status" aria-live="polite" data-comment-gesture-notice className="text-caption px-3 pb-1" style={{ color: 'var(--color-ios-ink-2)' }}>
          {notice}
        </p>
      ) : null}
      {/* UN VISITEUR ANONYME NE COMMENTE PAS — la passerelle exige un
          `registeredUser` (`comments.ts:184-186`). Offrir le champ puis
          refuser en 401 serait un contrôle qui ment (loi 4). */}
      <CommentComposer language={language} onSend={onSend} canWrite={canWrite} />
    </section>
  );
}
