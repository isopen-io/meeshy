/**
 * `FocalMediaBlock` — médias NUS, radius 16 (WF-112, contrat Focal §WS-3,
 * lentille-implementation-contract §4.3 : « médias — radius 16 »).
 *
 * ÉCART DE PÉRIMÈTRE assumé et documenté (rapport WF-112) : le contrat Focal
 * §WS-3 décrit une loi de grille complète (`FocalMediaGridLayout.slots`,
 * largeurs 300/149/178.8/119.2 selon le nombre de pièces jointes 1/2/3/4+,
 * `gridMaxWidth 300`, `spacing 2`) — CETTE loi n'existe dans AUCUN fichier de
 * `packages/shared` (re-preuve : `grep -rn "FocalMediaGridLayout\|gridMaxWidth"
 * packages/shared` → rien). Le plan d'exécution (workshop §5, ligne WF-112)
 * ne demande, lui, que « médias radius 16 » — pas la géométrie de grille
 * 1/2/3/4+. Ce composant rend donc les IMAGES NUES (aucune bulle, aucun clip
 * de bulle) au radius correct, en grille CSS simple ; la géométrie de slots
 * exacte reste HORS PÉRIMÈTRE de WF-110..113 (documenté dans F08, suite
 * `focal-behaviour-matrix-parity.test.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PARITÉ 2026-08-17 — CE QUI ÉTAIT JETÉ
 * ═══════════════════════════════════════════════════════════════════════════
 * Ce composant filtrait `mimeType.startsWith('image/')` et laissait tomber
 * TOUT le reste, sans un mot. Un vocal seul, une vidéo seule, un PDF seul, un
 * fichier seul — soit des messages dont le contenu texte est vide par
 * construction — rendaient donc une rangée LITTÉRALEMENT VIDE dans les deux
 * densités du fil plat, là où la vue Bulles montait `MessageAttachments`
 * (via `MessageAttachmentsSection`) et affichait le lecteur audio, la
 * vignette vidéo ou la carte de document.
 *
 * Le correctif n'invente rien : les non-images partent vers CE MÊME
 * `MessageAttachments` (`components/attachments/`), le renderer que la vue
 * Bulles utilise déjà — lecteur audio, lightbox vidéo, carte document, carte
 * fichier. Les images, elles, gardent la grille nue du contrat : c'est la
 * seule partie que le contrat Focal spécifie, et les faire passer par la
 * grille à bulles perdrait le « nu » que §WS-3 exige.
 *
 * Précédent iOS : `FocalAttachmentBlock`/`FocalAudioBlock` (F-082, « audio à
 * plat » 654c563) montent eux aussi le VRAI bloc riche dans la rangée plate,
 * plutôt qu'une description textuelle.
 */
'use client';

import Image from 'next/image';
import type { Attachment } from '@meeshy/shared/types/attachment';
import { MessageAttachments } from '@/components/attachments/MessageAttachments';
import { splitFocalAttachments } from './focal-row-utils';

export interface FocalMediaBlockProps {
  readonly attachments: readonly Attachment[];
  /** Propriétaire des pièces jointes — passé VERBATIM à `MessageAttachments` (suppression). */
  readonly currentUserId?: string;
  readonly token?: string;
  readonly isOwnMessage?: boolean;
  readonly onImageClick?: (attachmentId: string) => void;
}

export function FocalMediaBlock({
  attachments,
  currentUserId,
  token,
  isOwnMessage = false,
  onImageClick,
}: FocalMediaBlockProps) {
  const { images, others } = splitFocalAttachments(attachments);
  if (images.length === 0 && others.length === 0) return null;

  return (
    <>
      {images.length > 0 && (
        <div
          data-testid="focal-media-block"
          className="grid grid-cols-2 gap-0.5 overflow-hidden mt-1"
          style={{
            maxWidth: '300px',
            borderRadius: 'var(--lentille-thread-media-radius)',
          }}
        >
          {images.map((attachment) => (
            <div key={attachment.id} className="relative aspect-square overflow-hidden bg-muted">
              <Image
                src={attachment.thumbnailUrl || attachment.fileUrl}
                alt={attachment.alt || attachment.originalName}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div data-testid="focal-attachment-block" className="mt-1 max-w-full overflow-hidden">
          <MessageAttachments
            attachments={others as Attachment[]}
            currentUserId={currentUserId}
            token={token}
            isOwnMessage={isOwnMessage}
            onImageClick={onImageClick}
          />
        </div>
      )}
    </>
  );
}

export default FocalMediaBlock;
