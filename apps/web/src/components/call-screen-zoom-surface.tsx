import { useId, useRef, type ReactNode } from 'react';

import { useScreenZoom, type ScreenZoomLayer } from '@/components/use-screen-zoom';

type Props = {
  /** L'image de l'écran reçu, seule à se zoomer : ma vignette et le plein écran restent hors de la surface. */
  readonly children: ReactNode;
  /** « pincez ou Ctrl + molette pour zoomer, touchez deux fois… » — dit au lecteur d'écran, comme à la une d'un groupe. */
  readonly hint: string;
  readonly isDrag: ScreenZoomLayer['isDrag'];
};

/**
 * **L'ÉCRAN REÇU EN DUO SE ZOOME** (P15.11, #17747) — chargé à part (`budgets.json` › `call_overlay`) : la surface des
 * gestes et son calque GPU. Zoomée, la surface garde le doigt pour déplacer l'image (`data-call-owns-drag`) : glisser
 * vers le bas ne réduit plus l'appel tant qu'on n'est pas revenu à 1×.
 */
export function ScreenZoomSurface({ children, hint, isDrag }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const zoom = useScreenZoom({ layer, isDrag });
  const described = useId();
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ touchAction: 'none' }}
      aria-describedby={described}
      data-call-screen-surface=""
      data-call-screen-zoom={String(zoom.zoom)}
      data-call-owns-drag={zoom.zoom > 1 ? '' : undefined}
      {...zoom.handlers}
    >
      <div ref={layer} className="absolute inset-0 transition-transform duration-200 motion-reduce:transition-none" style={{ transform: zoom.transform, transformOrigin: 'center' }} data-call-screen-layer="">
        {children}
      </div>
      <span id={described} hidden>
        {hint}
      </span>
    </div>
  );
}
