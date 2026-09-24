import { useCallback, useMemo, useState } from 'react';

import { CommentComposer, type CommentComposerResult } from '@/components/comment-composer';
import { CommentList } from '@/components/comment-list';
import type { CommentGestureHandlers } from '@/components/comment-row';
import { findCardPost } from '@/lib/api/card-caches';
import type { CommentGestureFailure, CommentGestureRequest } from '@/lib/api/comment-gestures';
import { commentAction, commentGestureAction, useComments } from '@/lib/api/query';
import { flattenCommentPages, type CommentInfiniteData } from '@/lib/api/publication-comments';
import { appQueryClient } from '@/lib/api/query-client';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useMentionSource } from '@/lib/view/mention-source';
import { useMinute } from '@/lib/view/use-minute';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useViewer } from '@/lib/view/use-viewer';

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
  const viewer = useViewer();
  const query = useComments(postId, { enabled });

  const comments = useMemo(
    () => flattenCommentPages(query.data as CommentInfiniteData | undefined),
    [query.data],
  );

  /**
   * LES PARTICIPANTS D'UNE PUBLICATION (#7846) — son auteur, puis ceux qui
   * la commentent, le plus récent d'abord ; la recherche distante interroge
   * `contextType=post`. L'auteur vient de la carte déjà en cache (fil,
   * détail) : rien n'est chargé pour le connaître.
   */
  const people = useMemo(() => {
    const author = findCardPost(appQueryClient, postId)?.author;
    const commenters = [...comments].reverse().map((comment) => comment.author);
    return author === undefined || author === null ? commenters : [author, ...commenters];
  }, [postId, comments]);
  const mentionSource = useMentionSource({ postId, people });

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
   *
   * ET IL N'Y A PLUS DE LIGNE GRISE GLOBALE (revue-correction #7135, défaut
   * majeur 1) : une issue passagère s'annonçait au BAS DU FIL, loin de la
   * rangée concernée et sans aucune prise, pendant que le rejeu s'offrait sur
   * la rangée pour les seuls refus qui ne peuvent pas aboutir. Tout ce qui
   * arrive à une rangée s'affiche désormais SUR elle.
   */
  const [failures, setFailures] = useState<ReadonlyMap<string, { failure: CommentGestureFailure; request: CommentGestureRequest }>>(
    () => new Map(),
  );

  /**
   * LES GESTES EN VOL, PAR RANGÉE — l'état que `comment-gestures.ts` tenait
   * pour lui seul (`inFlight`, la garde de correction) et que personne ne
   * RENDAIT : un second tap sur le cœur pendant l'appel était avalé en
   * silence par un bouton qui avait l'air disponible (défaut majeur 7). iOS
   * publie le sien (`commentHeartInFlightIds`, `PostDetailViewModel.swift:43`)
   * et la cible s'y désactive (`CommentRowView.swift:284`).
   */
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());

  const runGesture = useCallback(
    async (request: CommentGestureRequest) => {
      setFailures((current) => {
        if (!current.has(request.commentId)) return current;
        const next = new Map(current);
        next.delete(request.commentId);
        return next;
      });
      setBusy((current) => new Set(current).add(request.commentId));
      try {
        const result = await commentGestureAction(request);
        if (result.ok) return;
        setFailures((current) => new Map(current).set(request.commentId, { failure: result, request }));
      } finally {
        setBusy((current) => {
          if (!current.has(request.commentId)) return current;
          const next = new Set(current);
          next.delete(request.commentId);
          return next;
        });
      }
    },
    [],
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
            onLike: (commentId, on) => void runGesture({ kind: 'like', postId, commentId, on }),
            onDelete: (commentId) => void runGesture({ kind: 'delete', postId, commentId }),
            onEdit: (commentId, content) =>
              void runGesture({ kind: 'edit', postId, commentId, content, originalLanguage: language }),
            failureOf: (commentId) => failures.get(commentId)?.failure,
            onRetryGesture: (commentId) => {
              const failed = failures.get(commentId);
              if (failed !== undefined) void runGesture(failed.request);
            },
            busyOf: (commentId) => busy.has(commentId),
            mentionSource,
          }
        : undefined,
    [canWrite, viewerId, postId, language, runGesture, failures, busy, mentionSource],
  );

  return (
    <section
      data-comment-thread={postId}
      aria-label={translate(language, 'comments.title')}
      /* LA DESTINATION DE REPLI DU FOCUS quand la rangée qui le portait vient
         d'être supprimée (défaut majeur 6) : `-1` la rend focalisable au
         PROGRAMME sans l'ajouter à l'ordre de tabulation, et son nom
         accessible annonce « Commentaires » plutôt qu'un retour muet au haut
         du document. */
      tabIndex={-1}
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
      {/* UN VISITEUR ANONYME NE COMMENTE PAS — la passerelle exige un
          `registeredUser` (`comments.ts:184-186`). Offrir le champ puis
          refuser en 401 serait un contrôle qui ment (loi 4). */}
      <CommentComposer language={language} onSend={onSend} canWrite={canWrite} mentionSource={mentionSource} />
    </section>
  );
}
