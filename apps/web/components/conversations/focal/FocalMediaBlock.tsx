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
 * 1/2/3/4+. Ce composant rend donc les médias NUS (aucune bulle, aucun clip
 * de bulle) au radius correct, en grille CSS simple ; la géométrie de slots
 * exacte reste HORS PÉRIMÈTRE de WF-110..113 (documenté dans F08, suite
 * `focal-behaviour-matrix-parity.test.ts`).
 */
'use client';

import Image from 'next/image';
import type { Attachment } from '@meeshy/shared/types/attachment';

export interface FocalMediaBlockProps {
  readonly attachments: readonly Attachment[];
}

export function FocalMediaBlock({ attachments }: FocalMediaBlockProps) {
  const visible = attachments.filter((a) => a.mimeType?.startsWith('image/'));
  if (visible.length === 0) return null;

  return (
    <div
      data-testid="focal-media-block"
      className="grid grid-cols-2 gap-0.5 overflow-hidden mt-1"
      style={{
        maxWidth: '300px',
        borderRadius: 'var(--lentille-thread-media-radius)',
      }}
    >
      {visible.map((attachment) => (
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
  );
}

export default FocalMediaBlock;
