import { useState } from 'react';

import type { PostComment } from '@/lib/api/publication-comments';
import { commentCardSubjectOf } from '@/lib/export/comment-card-subject';

import { ExportCatalogGate } from './export-catalog-gate';
import { MessageExportSheet } from './thread-export-sheet';

/**
 * **« IMAGER » UN COMMENTAIRE** (#8693) — le même atelier « Imagine » que pour
 * un message : le commentaire est la réponse, celui auquel il répond la
 * citation. Chunk À LA DEMANDE (`comment-image-sheet-lazy.tsx`) : le fil de
 * commentaires n'en paie rien tant qu'on n'image pas.
 *
 * La feuille annonce ses issues dans SA région vivante — le fil de
 * commentaires n'en tient pas.
 */
export type CommentImageRequest = {
  readonly comment: PostComment;
  readonly servedText: string;
  readonly parent: { readonly comment: PostComment; readonly servedText: string } | null;
  /** « Avec les réponses » (#8734) — absentes tant qu'elles ne sont pas lues. */
  readonly replies?: readonly { readonly comment: PostComment; readonly servedText: string }[];
};

export default function CommentImageSheet({ request, handle, onClose }: { readonly request: CommentImageRequest; readonly handle: string | null; readonly onClose: () => void }) {
  const [announcement, setAnnouncement] = useState('');
  const subject = commentCardSubjectOf(request);
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only" data-comment-image-status="">
        {announcement}
      </p>
      {subject === null ? null : (
        <ExportCatalogGate>
          <MessageExportSheet subject={subject} handle={handle} conversationTitle={null} announce={setAnnouncement} onClose={onClose} />
        </ExportCatalogGate>
      )}
    </>
  );
}
