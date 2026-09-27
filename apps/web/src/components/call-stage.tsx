import { useState } from 'react';

import { CallButton } from '@/components/call-glass-button';
import { CallGrid, Portrait, type CallRemoval } from '@/components/call-grid';
import { StreamVideo } from '@/components/call-media-elements';
import { GlyphSvg } from '@/components/glyph';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import type { SpotlightChoice } from '@/lib/calls/call-spotlight';
import type { ActiveCall } from '@/lib/calls/call-store';
import { hasVideo, orderedMembers, screenSharer, type CallLayout } from '@/lib/calls/call-view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA SCÈNE DE L'APPEL** (#6382, #8063, #8392) — ce que l'écran d'appel montre
 * sous ses commandes : la grille d'un groupe (et sa une), l'écran partagé d'un
 * pair en duo (ENTIER, `contain`), ou la vidéo plein cadre avec la vignette
 * locale en coin, qui s'inverse d'un toucher comme sur iOS.
 */

const INK_2 = 'rgba(255,255,255,0.72)';

type StageProps = {
  readonly call: ActiveCall;
  readonly layout: CallLayout;
  readonly language: InterfaceLanguage;
  readonly choice: SpotlightChoice;
  readonly onChoose: (choice: SpotlightChoice) => void;
  readonly immersive: boolean;
  readonly onToggleImmersive: () => void;
  readonly removal: CallRemoval | null;
};

const cornerTop = { top: 'calc(env(safe-area-inset-top) + 4.5rem)' } as const;

function DuoScreen({ call, language, immersive, onToggleImmersive }: Pick<StageProps, 'call' | 'language' | 'immersive' | 'onToggleImmersive'>) {
  const sharer = screenSharer(call.members);
  const selfMirrored = call.facing === 'user' && !call.screenSharing;
  if (sharer === null) return null;
  return (
    <div className="absolute inset-0" data-call-shared-screen="">
      <StreamVideo stream={call.remoteStreams[sharer.userId] ?? null} mirrored={false} fit="contain" className="absolute inset-0 size-full" label={translate(language, 'call.screen.peerSharing', { name: sharer.name })} />
      {call.cameraOn && !immersive ? (
        <div className="absolute right-4 h-40 w-28 overflow-hidden rounded-card shadow-lg" style={cornerTop} data-call-corner="">
          <StreamVideo stream={call.localStream} mirrored={selfMirrored} className="size-full" />
        </div>
      ) : null}
      <div className="absolute bottom-4 right-4 z-20" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6.5rem)' }}>
        <CallButton
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

function VideoDuo({ call, language }: Pick<StageProps, 'call' | 'language'>) {
  const [swapped, setSwapped] = useState(false);
  const firstPeer = orderedMembers(call.members)[0];
  const remoteStream = firstPeer === undefined ? null : (call.remoteStreams[firstPeer.userId] ?? null);
  const remoteVideoOn = firstPeer !== undefined && firstPeer.cameraOn && hasVideo(remoteStream);
  const selfMirrored = call.facing === 'user' && !call.screenSharing;
  const you = translate(language, 'call.you');
  const main = swapped ? call.localStream : remoteStream;
  const corner = swapped ? remoteStream : call.localStream;
  const mainOn = swapped ? call.cameraOn : remoteVideoOn;
  const cornerOn = swapped ? remoteVideoOn : call.cameraOn;
  return (
    <div className="absolute inset-0">
      {mainOn ? (
        <StreamVideo stream={main} mirrored={swapped && selfMirrored} className="absolute inset-0 size-full" label={swapped ? you : call.title} />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <Portrait name={swapped ? you : call.title} avatar={swapped ? null : call.avatar} size={96} pulse={false} />
            <span className="text-body" style={{ color: INK_2 }}>
              {translate(language, swapped ? 'call.camera.off' : remoteStream === null ? 'call.video.connecting' : 'call.camera.peerOff')}
            </span>
          </div>
        </div>
      )}
      {cornerOn ? (
        <button
          type="button"
          aria-label={translate(language, 'call.video.swap')}
          onClick={() => setSwapped((value) => !value)}
          className="absolute right-4 h-40 w-28 overflow-hidden rounded-card shadow-lg"
          style={cornerTop}
          data-call-corner=""
        >
          <StreamVideo stream={corner} mirrored={!swapped && selfMirrored} className="size-full" />
        </button>
      ) : null}
    </div>
  );
}

export function CallStage({ call, layout, language, choice, onChoose, immersive, onToggleImmersive, removal }: StageProps) {
  if (layout === 'grid') {
    return (
      <CallGrid
        members={orderedMembers(call.members)}
        remoteStreams={call.remoteStreams}
        self={{ stream: call.localStream, cameraOn: call.cameraOn, mirrored: call.facing === 'user' && !call.screenSharing }}
        choice={choice}
        onChoose={onChoose}
        immersive={immersive}
        onToggleImmersive={onToggleImmersive}
        removal={removal}
        language={language}
      />
    );
  }
  if (layout === 'screen') return <DuoScreen call={call} language={language} immersive={immersive} onToggleImmersive={onToggleImmersive} />;
  if (layout === 'video-duo') return <VideoDuo call={call} language={language} />;
  return null;
}
