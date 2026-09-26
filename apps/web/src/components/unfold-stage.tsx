import { useRef, type ReactNode } from 'react';

import { FOCAL_METRICS } from '@meeshy/shared/utils/focal-metrics';

import { ROW_PADDING_HORIZONTAL } from '@/lib/reading-mode/metrics';
import { useIsUnfolded } from '@/lib/view/unfold-store';
import { useFocalLoupe } from '@/lib/view/use-focal-loupe';

/**
 * LA SCÈNE D'UN MESSAGE DÉPLIÉ (#8147) — posée par `ThreadModes` autour des
 * DEUX peaux, pour que Focal, Script, Bulles et Rivière reçoivent le même
 * effet sans que chacune le câble.
 *
 * Directive porteur 2026-09-26 : « lorsqu'on déplie un message long, il faut
 * appliquer l'effet focal », et le Focal pose désormais le message sur un
 * BLOC DE VERRE. Tant que la rangée est dépliée :
 *
 * - le verre (`glass glass-card`, la matière unique de `styles/glass.css` —
 *   jamais réécrite ici, `scripts/lib/glass-site.mjs`) se pose DERRIÈRE le
 *   message, aux cotes partagées avec iOS (`FOCAL_METRICS`) : il déborde du
 *   contenu de `glassHorizontalInset`, soit la gouttière de la rangée moins
 *   ce débord ; en hauteur il épouse la rangée, dont le rembourrage vaut
 *   `glassVerticalInset` ;
 * - le contenu grossit de la LOUPE (`useFocalLoupe`, écrêtée, coupée sous
 *   Réduire le mouvement), le verre, lui, reste à sa taille ;
 * - les voisins s'atténuent (`thread-scene.css`, `ol:has([data-unfolded])`).
 *
 * Seule la rangée dont le verdict bascule se rend à nouveau
 * (`useIsUnfolded`) : déplier un message ne redessine pas le fil.
 */
export function UnfoldStage({ messageId, children }: { readonly messageId: string; readonly children: ReactNode }) {
  const unfolded = useIsUnfolded(messageId);
  const content = useRef<HTMLDivElement>(null);
  useFocalLoupe(content, unfolded);

  return (
    <div data-unfold-stage="" {...(unfolded ? { 'data-unfolded': '' } : {})} className="unfold-stage">
      {unfolded ? (
        <span
          aria-hidden="true"
          data-unfold-glass=""
          className="glass glass-card unfold-glass"
          style={{
            borderRadius: `${FOCAL_METRICS.glassRadius}px`,
            insetInline: `${ROW_PADDING_HORIZONTAL - FOCAL_METRICS.glassHorizontalInset}px`,
            insetBlock: 0,
          }}
        />
      ) : null}
      <div ref={content} className="unfold-content">
        {children}
      </div>
    </div>
  );
}
