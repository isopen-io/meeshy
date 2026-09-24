import { lazy, Suspense } from 'react';

/**
 * LE CHUNK À LA DEMANDE, EN UN SEUL POINT D'IMPORT (#7116) — même motif que
 * `publication-comments-sheet-lazy.tsx` (D-54) : un lecteur qui n'ouvre
 * jamais « Vues » ne télécharge jamais `useQuery`/le port des interactions.
 */
const LazyPublicationViewersSheet = lazy(() =>
  import('@/components/publication-viewers-sheet').then((m) => ({ default: m.PublicationViewersSheet })),
);

export function PublicationViewersSheetPortal({
  open,
  postId,
  viewCount,
  onClose,
}: {
  readonly open: boolean;
  readonly postId: string;
  readonly viewCount: number;
  readonly onClose: () => void;
}) {
  return open ? (
    <Suspense fallback={null}>
      <LazyPublicationViewersSheet postId={postId} viewCount={viewCount} onClose={onClose} />
    </Suspense>
  ) : null;
}
