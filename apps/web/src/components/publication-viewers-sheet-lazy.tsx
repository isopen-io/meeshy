import { lazy, Suspense } from 'react';

import type { CommentsSheetHost } from '@/lib/view/use-comments-sheet-host';

import type { ViewersSubject } from './publication-viewers-sheet';

/**
 * LE CHUNK À LA DEMANDE, EN UN SEUL POINT D'IMPORT (#7116) — même motif que
 * `publication-comments-sheet-lazy.tsx` (D-54) : un lecteur qui n'ouvre
 * jamais « Vues » ne télécharge ni la feuille, ni le port des interactions,
 * ni le catalogue de ses libellés (#9727, `preparePublicationViewersSheet`,
 * attendu AVEC le chunk : la feuille s'ouvre libellée du premier coup).
 *
 * L'HÔTE est la loi PARTAGÉE des feuilles du lecteur (`useCommentsSheetHost`,
 * spécification #7116 Q5) : focus mémorisé à l'ouverture, rendu à la
 * fermeture, fermeture au changement de story. Le premier jet tenait un
 * booléen à part — et le focus, éjecté par le rail devenu `inert`, tombait
 * sur `<body>`.
 */
const LazyPublicationViewersSheet = lazy(() =>
  import('@/components/publication-viewers-sheet').then(async (m) => {
    await m.preparePublicationViewersSheet();
    return { default: m.PublicationViewersSheet };
  }),
);

export function PublicationViewersSheetPortal({
  host,
  viewCount,
}: {
  readonly host: CommentsSheetHost;
  readonly viewCount: number | null | undefined;
}) {
  return host.postId !== null ? (
    <Suspense fallback={null}>
      <LazyPublicationViewersSheet postId={host.postId} viewCount={viewCount} onClose={host.close} />
    </Suspense>
  ) : null;
}

/**
 * La même feuille ouverte depuis le menu « ⋯ » d'un post ou d'un réel
 * (#9727) — l'hôte tient lui-même l'ouverture et rend le focus au « ⋯ ».
 */
export function PublicationViewersSheetLazy({
  postId,
  viewCount,
  subject,
  onClose,
}: {
  readonly postId: string;
  readonly viewCount: number | null | undefined;
  readonly subject: ViewersSubject;
  readonly onClose: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <LazyPublicationViewersSheet postId={postId} viewCount={viewCount} subject={subject} onClose={onClose} />
    </Suspense>
  );
}
