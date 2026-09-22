import { useEffect } from 'react';

import { reportAttachmentStatus } from '@/lib/api/attachments';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';

import { attachmentOpenReport } from './attachment-open-report';

/**
 * LE RAPPORT D'OUVERTURE D'UNE PAGE IMAGE (#7363, W6) — miroir
 * `DocumentViewerView.onAppear { reportDocumentOpened() }`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Media/DocumentViewerView.swift:221`) :
 * ce lot retient le patron « rapport immédiat à l'ouverture », le plus
 * simple des deux que porte iOS (`ImageViewerView` diffère au contraire vers
 * `.onDisappear` avec un seuil de 500 ms, § doc-comment du fichier) — décrit
 * dans `W6.md` (§ Référence iOS), décision produit la plus simple faute d'un
 * seuil observable sans horloge factice côté web.
 *
 * `isActive` DEVENANT `true` déclenche le rapport — une page revisitée (la
 * pellicule permet d'y revenir) rapporte À NOUVEAU, cohérent avec « Nx
 * ouvertures » (`message-detail.attachment.opens.other`). `isMine` ferme le
 * rapport pour sa propre pièce (`attachmentOpenReport`). `deps` INJECTABLE
 * pour les témoins — `apiDeps` (singleton réel) par défaut, même patron que
 * `MediaPlaybackReport.deps`.
 */
export function useAttachmentOpenReport(params: {
  readonly attachmentId: string;
  readonly isActive: boolean;
  readonly isMine: boolean;
  readonly deps?: ConversationsDeps;
}): void {
  const { attachmentId, isActive, isMine, deps } = params;

  useEffect(() => {
    if (!isActive) return;
    const report = attachmentOpenReport({ isMine });
    if (report === null) return;
    void reportAttachmentStatus({ ...(deps ?? apiDeps), attachmentId, report });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, attachmentId, isMine]);
}
