import { Suspense, lazy } from 'react';

import type { Attachment } from '@/lib/api/types';
import type { MediaGridFrame } from '@/lib/view/media-grid-layout';

import { MediaGrid } from './media-grid';
import type { MediaViewerProps } from './media-viewer';
import { veiledAttachment } from './view-once-opened';

const MediaViewer = lazy(() => import('./media-viewer'));

/**
 * CE QUE LA VISIONNEUSE D'UN MESSAGE PROTÉGÉ A BESOIN DE SAVOIR (#8008) — tout
 * ce que `Attachments` lui remet déjà pour un message ordinaire (le prisme du
 * lecteur, l'auteur, la légende servie), plus la FORME de la grille, que
 * l'hôte déclare (`box` en bulle, `tiles` en rangée plate). L'hôte le passe à
 * `ProtectedContent` ; sans lui, un média protégé garde l'ancien chemin.
 */
export type ProtectedMediaContext = Omit<MediaViewerProps, 'items' | 'startIndex' | 'onClose' | 'scenes'> & {
  readonly frame: MediaGridFrame;
};

/**
 * LA GRILLE AU REPOS D'UN MESSAGE PROTÉGÉ — une case par pièce visuelle, et
 * chaque case est le SUBSTITUT de sa pièce (`MaskedAttachment`) : ni fichier,
 * ni URL, ni vignette dans le document. Toucher une case ouvre la visionneuse
 * sur ELLE. Les pièces passent par `veiledAttachment` : une charge qui ne
 * porterait pas encore la protection de son message (#7498) se rend quand même
 * masquée — c'est le message qui décide, jamais l'oubli d'une colonne.
 */
export function ProtectedMediaGrid({
  pieces,
  media,
  onOpen,
}: {
  readonly pieces: readonly Attachment[];
  readonly media: ProtectedMediaContext;
  readonly onOpen: (index: number) => void;
}) {
  return (
    <MediaGrid
      items={pieces.map(veiledAttachment)}
      frame={media.frame}
      languages={media.languages}
      fallbackLanguage={media.fallbackLanguage}
      onOpen={onOpen}
    />
  );
}

/**
 * LA VISIONNEUSE D'UN MESSAGE PROTÉGÉ — la MÊME que celle d'un message
 * ordinaire (`media-viewer.tsx`, chunk à la demande), montée seulement après
 * le toucher, sur les pièces que l'hôte vient de rendre en clair.
 */
export function ProtectedMediaViewer({
  items,
  startIndex,
  media,
  onClose,
}: {
  readonly items: readonly Attachment[];
  readonly startIndex: number;
  readonly media: ProtectedMediaContext;
  readonly onClose: () => void;
}) {
  const { frame: _frame, ...viewer } = media;
  return (
    <Suspense fallback={null}>
      <MediaViewer {...viewer} items={items} startIndex={startIndex} onClose={onClose} />
    </Suspense>
  );
}
