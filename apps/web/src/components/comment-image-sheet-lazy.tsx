import { lazy, Suspense } from 'react';

import type { CommentImageRequest } from '@/routes/comment-image-sheet';

/**
 * « IMAGINE » POUR UN COMMENTAIRE, EN UN SEUL POINT D'IMPORT (#8693, motif
 * `publication-comments-sheet-lazy.tsx`) — l'atelier et son peintre ne se
 * téléchargent qu'au premier « Imager » d'un commentaire.
 */
const LazyCommentImageSheet = lazy(() => import('@/routes/comment-image-sheet'));

export function CommentImagePortal({ request, handle, onClose }: { readonly request: CommentImageRequest | null; readonly handle: string | null; readonly onClose: () => void }) {
  return request === null ? null : (
    <Suspense fallback={null}>
      <LazyCommentImageSheet request={request} handle={handle} onClose={onClose} />
    </Suspense>
  );
}
