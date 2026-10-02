import { lazy, Suspense } from 'react';

import type { PendingAttachment } from '@/lib/send/attachments';
import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/** LE STUDIO, chargé avec cette couche — jamais avec le chunk du fil. */
const StoryComposeScreen = lazy(() => import('@/routes/story-compose'));

/**
 * **« ÉDITER » UNE PIÈCE EN ATTENTE** (#8416, #9126, miroir
 * `ConversationRetouchSeriesEditor` iOS) — le MÊME studio plein écran, posé en
 * couche au-dessus du fil (le composeur garde son brouillon : aucune
 * navigation), avec TOUTES les pièces du message en scènes (rail des scènes),
 * ouvert sur la pièce touchée. « Terminé » rend chaque scène retouchée, que
 * l'hôte substitue à SA pièce ; une scène intacte laisse sa pièce telle
 * quelle. ✕ ou Échap referment sans rien changer. Rien n'est envoyé.
 *
 * Le retour matériel de la coque Android la referme aussi (#8460) : c'est une
 * couche modale, elle passe par `useBackDismiss` comme les autres — Échap
 * compris (#8517), qui ne la referme que si aucune plaque du studio n'est
 * ouverte par-dessus.
 */
export type ComposerRetouchedPiece = { readonly localId: string; readonly file: File };

export default function ComposerRetouch({
  pieces,
  focus,
  onDone,
  onCancel,
  render,
}: {
  readonly pieces: readonly PendingAttachment[];
  /** L'index, dans `pieces`, de la pièce touchée. */
  readonly focus: number;
  readonly onDone: (replaced: readonly ComposerRetouchedPiece[]) => void;
  readonly onCancel: () => void;
  readonly render?: StudioRetouchDeps;
}) {
  useBackDismiss(onCancel, { escape: true });
  const touched = pieces[focus];
  const files = pieces.map((piece) => piece.file);
  const handBack = (replaced: readonly { readonly index: number; readonly file: File }[]) =>
    onDone(replaced.flatMap(({ index, file }) => {
      const piece = pieces[index];
      return piece === undefined ? [] : [{ localId: piece.localId, file }];
    }));

  return (
    <div data-composer-retouch role="dialog" aria-modal="true" className="fixed inset-0 z-50">
      <Suspense fallback={null}>
        <StoryComposeScreen
          retouch={{
            file: touched?.file ?? null,
            series: { files, focus, onDone: handBack },
            onDone: (file) => handBack([{ index: focus, file }]),
            onCancel,
            ...(render !== undefined ? { render } : {}),
          }}
        />
      </Suspense>
    </div>
  );
}

/**
 * **LA CAMÉRA DE LA BARRE DE COMPOSITION** (#9123, miroir
 * `ConversationCaptureSceneEditor` iOS) — le même studio plein écran, VIDE et
 * viseur ARMÉ dès l'ouverture ; la prise s'y édite, et « Terminé » la rend au
 * message en attente : intacte, telle quelle ; retouchée, composée.
 */
export function ComposerCapture({
  onDone,
  onCancel,
  render,
  camera,
}: {
  readonly onDone: (file: File) => void;
  readonly onCancel: () => void;
  readonly render?: StudioRetouchDeps;
  readonly camera?: CameraEngine;
}) {
  useBackDismiss(onCancel, { escape: true });

  return (
    <div data-composer-capture role="dialog" aria-modal="true" className="fixed inset-0 z-50">
      <Suspense fallback={null}>
        <StoryComposeScreen
          retouch={{ file: null, onDone, onCancel, ...(render !== undefined ? { render } : {}), ...(camera !== undefined ? { camera } : {}) }}
        />
      </Suspense>
    </div>
  );
}
