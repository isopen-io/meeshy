'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export interface CommentTarget {
  /** Commentaire (ou réponse) ciblé par `#comment-<id>` ou `?comment=<id>`. */
  targetCommentId: string | null;
  /** Parent top-level (`?parent=<id>`) quand la cible est une réponse. */
  targetParentCommentId: string | null;
}

function readHashCommentId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.hash.match(/^#comment-(.+)$/)?.[1] ?? null;
}

/**
 * Lecture RÉACTIVE de la cible de commentaire portée par l'URL — le format
 * émis par `getNotificationLink` (`?parent=<parentId>#comment-<commentId>`,
 * legacy `?comment=<id>`).
 *
 * Contrairement à une lecture mount-only, le ciblage suit :
 * - `hashchange` (navigation même-page vers une nouvelle ancre) ;
 * - `popstate` (back/forward) ;
 * - les navigations client Next (le hash est relu quand `useSearchParams`
 *   change — pushState ne déclenche pas `hashchange`).
 *
 * L'état initial est `null` (pas de lecture pendant le rendu) : la première
 * synchronisation se fait dans l'effet, ce qui évite tout mismatch
 * d'hydratation SSR/CSR.
 */
export function useCommentTarget(): CommentTarget {
  const searchParams = useSearchParams();
  const [hashCommentId, setHashCommentId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setHashCommentId(readHashCommentId());
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [searchParams]);

  const queryCommentId = searchParams?.get('comment') ?? null;
  const targetCommentId = hashCommentId ?? queryCommentId;
  const targetParentCommentId = targetCommentId
    ? (searchParams?.get('parent') ?? null)
    : null;

  return { targetCommentId, targetParentCommentId };
}
