import { lazy, Suspense, useEffect } from 'react';

import type { PendingAttachment } from '@/lib/send/attachments';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/** LE STUDIO, chargé avec cette couche — jamais avec le chunk du fil. */
const StoryComposeScreen = lazy(() => import('@/routes/story-compose'));

/**
 * **« ÉDITER » UNE IMAGE EN ATTENTE** (#8416, miroir
 * `ConversationImageSceneDoor.swift`) — le MÊME studio plein écran, posé en
 * couche au-dessus du fil (le composeur garde son brouillon : aucune
 * navigation), semé de l'image, en mode RETOUCHE. « Terminé » rend le
 * composite, que l'hôte substitue à la pièce ; ✕ ou Échap referment sans rien
 * changer. Rien n'est envoyé.
 *
 * Le retour matériel de la coque Android la referme aussi (#8460) : c'est une
 * couche modale, elle passe par `useBackDismiss` comme les autres.
 */
export default function ComposerRetouch({
  attachment,
  onDone,
  onCancel,
  render,
}: {
  readonly attachment: PendingAttachment;
  readonly onDone: (file: File) => void;
  readonly onCancel: () => void;
  readonly render?: StudioRetouchDeps;
}) {
  useBackDismiss(onCancel);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div data-composer-retouch role="dialog" aria-modal="true" className="fixed inset-0 z-50">
      <Suspense fallback={null}>
        <StoryComposeScreen retouch={{ file: attachment.file, onDone, onCancel, ...(render !== undefined ? { render } : {}) }} />
      </Suspense>
    </div>
  );
}
