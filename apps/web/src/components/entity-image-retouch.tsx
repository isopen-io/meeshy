import { lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';

import type { EntityImageFormat } from '@/lib/profile/entity-image-format';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/** LE STUDIO, chargé avec cette couche — jamais avec l'écran qui l'ouvre. */
const StoryComposeScreen = lazy(() => import('@/routes/story-compose'));

/**
 * **AVATAR ET BANNIÈRE SE RETOUCHENT AVEC L'OUTIL DE LA CAPTURE** (#17256,
 * jumelle d'`EntityImageRetouch` iOS, #17251) — le MÊME studio que la retouche
 * d'une pièce du fil (`ComposerRetouch`), ouvert sur l'image choisie, à format
 * imposé : la scène est un carré voilé hors du cercle pour l'avatar, un
 * bandeau 3:1 pour la bannière. « Terminé » rend un JPEG à ces proportions ;
 * ✕, Échap et le retour matériel ne rendent RIEN.
 *
 * La couche se pose dans `container` : `document.body` par défaut, la feuille
 * (`<dialog>` modal) qui l'ouvre sinon — hors d'elle, la couche supérieure du
 * navigateur la rendrait inerte (même règle que la visionneuse, #8103).
 */
export type EntityImageEditProps = {
  readonly file: File;
  readonly format: EntityImageFormat;
  readonly onDone: (file: File) => void;
  readonly onCancel: () => void;
  readonly container?: Element | null;
};

export default function EntityImageRetouch({
  file,
  format,
  onDone,
  onCancel,
  container,
  render,
}: EntityImageEditProps & {
  /** Injectable pour les témoins ; la production peint un canvas hors écran. */
  readonly render?: StudioRetouchDeps;
}) {
  useBackDismiss(onCancel, { escape: true, held: true });
  return createPortal(
    <div data-entity-image-retouch={format} role="dialog" aria-modal="true" className="fixed inset-0 z-50">
      <Suspense fallback={null}>
        <StoryComposeScreen retouch={{ file, format, onDone, onCancel, ...(render !== undefined ? { render } : {}) }} />
      </Suspense>
    </div>,
    container ?? document.body,
  );
}
