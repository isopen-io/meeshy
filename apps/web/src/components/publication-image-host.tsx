import { lazy, Suspense, useSyncExternalStore } from 'react';

import { closePublicationImage, publicationImageRequest, subscribePublicationImage } from '@/lib/export/publication-image-store';
import { useViewer } from '@/lib/view/use-viewer';

/**
 * **L'HÔTE UNIQUE D'« IMAGER » UNE PUBLICATION** (#16393) — monté une fois par
 * le chrome différé, il lit la demande en cours (`openPublicationImage`) et
 * ouvre l'atelier de carte. Le menu d'un post, le rail d'un réel, celui d'une
 * story et la visionneuse d'un média de commentaire n'ont qu'à demander :
 * aucune surface ne monte sa propre feuille. L'atelier ne se télécharge qu'à
 * la première demande.
 */
const LazyPublicationImageSheet = lazy(() => import('@/routes/publication-image-sheet'));

export function PublicationImageHost() {
  const request = useSyncExternalStore(subscribePublicationImage, publicationImageRequest, publicationImageRequest);
  const viewer = useViewer();
  return request === null ? null : (
    <Suspense fallback={null}>
      <LazyPublicationImageSheet key={request.key} request={request} handle={viewer.handle} onClose={closePublicationImage} />
    </Suspense>
  );
}
