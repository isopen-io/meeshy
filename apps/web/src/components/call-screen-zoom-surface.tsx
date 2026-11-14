import { useId, useRef, type CSSProperties, type ReactNode } from 'react';

import type { CallButton } from '@/components/call-glass-button';
import { StreamVideo } from '@/components/call-media-elements';
import { GlyphSvg } from '@/components/glyph';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { useScreenZoom, type ScreenZoomLayer } from '@/components/use-screen-zoom';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
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

export type DuoSharedScreenProps = {
  readonly call: ActiveCall;
  readonly sharer: CallMember;
  readonly language: InterfaceLanguage;
  readonly immersive: boolean;
  readonly onToggleImmersive: () => void;
  /** Ce que l'écran d'appel garde et remet (il n'est jamais importé d'ici) : le miroir de mon aperçu, le coin de ma vignette, le bouton de verre et la loi du glissé. */
  readonly mirrored: boolean;
  readonly corner: CSSProperties;
  readonly Button: typeof CallButton;
  readonly isDrag: ScreenZoomLayer['isDrag'];
};

/**
 * **L'ÉCRAN REÇU EN DUO** (P15) — chargé avec sa surface de zoom, préchargé avec l'appel (`call-stage.tsx` ›
 * `screenZoomSurfaceView`) : un duo sans partage ne le paie pas. La surface des gestes et son calque GPU ne portent QUE
 * l'image — ma vignette et le bouton plein écran, posés après, ne bougent jamais.
 */
export function DuoSharedScreen({ call, sharer, language, immersive, onToggleImmersive, mirrored, corner, Button, isDrag }: DuoSharedScreenProps) {
  return (
    <div className="absolute inset-0" data-call-shared-screen="">
      <ScreenZoomSurface hint={translateCallControls(language, 'callControls.screenZoom.hint')} isDrag={isDrag}>
        <StreamVideo stream={call.remoteStreams[sharer.userId] ?? null} mirrored={false} fit="contain" className="absolute inset-0 size-full" label={translate(language, 'call.screen.peerSharing', { name: sharer.name })} member={sharer.userId} />
      </ScreenZoomSurface>
      {call.cameraOn && !immersive ? (
        <div className="absolute overflow-hidden rounded-card shadow-lg" style={corner} data-call-corner="">
          <StreamVideo stream={call.localStream} mirrored={mirrored} className="size-full" self />
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
