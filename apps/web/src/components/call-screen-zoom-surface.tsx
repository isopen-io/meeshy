import { useId, useRef, type CSSProperties, type ReactNode } from 'react';

import type { CallButton } from '@/components/call-glass-button';
import { StreamVideo } from '@/components/call-media-elements';
import { GlyphSvg } from '@/components/glyph';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { useScreenZoom, type ScreenZoomLayer } from '@/components/use-screen-zoom';
import { isTileDrag } from '@/lib/calls/call-self-tile-gestures';
import type { ActiveCall } from '@/lib/calls/call-store';
import { screenSharer } from '@/lib/calls/call-view';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

type Props = {
  /** L'image de l'écran reçu, seule à se zoomer : ma vignette et le plein écran restent hors de la surface. */
  readonly children: ReactNode;
  /** « pincez ou Ctrl + molette pour zoomer, touchez deux fois… » — dit au lecteur d'écran, comme à la une d'un groupe. */
  readonly hint: string;
  readonly isDrag: ScreenZoomLayer['isDrag'];
};

/**
 * **L'ÉCRAN REÇU EN DUO SE ZOOME** (P15.11, #17747) : la surface des gestes et son calque GPU. Zoomée, la surface garde
 * le doigt pour déplacer l'image (`data-call-owns-drag`) : glisser vers le bas ne réduit plus l'appel tant qu'on n'est
 * pas revenu à 1×.
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

type DuoScreenProps = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly immersive: boolean;
  readonly onToggleImmersive: () => void;
  /** Le bouton de verre de l'écran d'appel, REMIS : ce chunk n'importe rien de `call_overlay`. */
  readonly Button: typeof CallButton;
  /** La place de ma caméra, que pose la loi de ma vignette (`SCREEN_SELF_TILE`, `call-self-tile.ts`). */
  readonly corner: CSSProperties;
  readonly selfMirrored: boolean;
};

/**
 * **L'ÉCRAN QU'UN PAIR PARTAGE EN DUO** (P15, #17930) — ENTIER (`contain`), zoomable, ma caméra en coin et le bouton du
 * plein écran. Un état rare : chargé à part (`budgets.json` › `call_screen_zoom_surface`), préchargé dès qu'un duo se
 * montre et avec l'appel (`PREFETCH`, `loadColdCallViews`) ; une fois là, il se rend dans le même rendu que la scène.
 */
export function DuoScreen({ call, language, immersive, onToggleImmersive, Button, corner, selfMirrored }: DuoScreenProps) {
  const sharer = screenSharer(call.members);
  if (sharer === null) return null;
  return (
    <div className="absolute inset-0" data-call-shared-screen="">
      {/* Les gestes et le calque GPU ne portent QUE l'image : ma vignette et le bouton plein écran, posés après, ne bougent jamais. */}
      <ScreenZoomSurface hint={translateCallControls(language, 'callControls.screenZoom.hint')} isDrag={isTileDrag}>
        <StreamVideo stream={call.remoteStreams[sharer.userId] ?? null} mirrored={false} fit="contain" className="absolute inset-0 size-full" label={translate(language, 'call.screen.peerSharing', { name: sharer.name })} member={sharer.userId} />
      </ScreenZoomSurface>
      {call.cameraOn && !immersive ? (
        <div className="absolute overflow-hidden rounded-card shadow-lg" style={corner} data-call-corner="">
          <StreamVideo stream={call.localStream} mirrored={selfMirrored} className="size-full" self />
        </div>
      ) : null}
      <div className="absolute bottom-4 right-4 z-20" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6.5rem)' }} data-call-chrome-fade="">
        <Button
          label={translate(language, immersive ? 'call.fullscreen.exit' : 'call.fullscreen.enter')}
          glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS[immersive ? 'cornersIn' : 'cornersOut']} size={20} />}
          onPress={onToggleImmersive}
          tone="glass"
          prominent
          size={44}
          data={{ 'data-call-fullscreen': '' }}
        />
      </div>
    </div>
  );
}
