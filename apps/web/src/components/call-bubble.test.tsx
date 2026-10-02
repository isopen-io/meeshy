import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ActiveCall, CallMember } from '@/lib/calls/call-store';

import { CallBubble } from './call-bubble';
import { ActiveCallView } from './call-overlay';
import { CallScreen } from './call-screen';

/**
 * **CONTINUER À DISCUTER PENDANT L'APPEL, DESSINÉ** (#8046) — la pastille se
 * replie en bulle, la bulle garde ses trois gestes (revenir, micro,
 * raccrocher), et ni l'une ni l'autre n'est une boîte modale : l'application
 * reste utilisable dessous. L'écran d'appel porte les périphériques.
 */

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina Diallo',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const overlay = (active: ActiveCall) => renderToStaticMarkup(<ActiveCallView call={active} />);

describe('la pastille', () => {
  test('propose de se replier en bulle, sans bloquer l’application', () => {
    const html = overlay(call({ display: 'pill' }));
    expect(html).toContain('data-call-pill-bar');
    expect(html).toContain('aria-label="Réduire en bulle"');
    expect(html).not.toContain('aria-modal');
  });
});

describe('la bulle', () => {
  test('remplace la pastille : revenir, micro, raccrocher — et la consigne clavier pour la déplacer', () => {
    expect(overlay(call({ display: 'bubble' }))).toBe('');
    const html = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />);
    expect(html).toContain('data-call-bubble="right"');
    expect(html).toContain('aria-label="Revenir à l’appel"');
    expect(html).toContain('data-call-bubble-control="mic"');
    expect(html).toContain('data-call-bubble-control="hangup"');
    expect(html).toContain('Les flèches déplacent la bulle');
    expect(html).not.toContain('data-call-screen');
    expect(html).not.toContain('aria-modal');
  });

  test('la sonnerie et la fin reprennent l’écran plein, même réduites', () => {
    expect(overlay(call({ display: 'bubble', phase: { kind: 'incoming' }, direction: 'incoming' }))).toContain('data-call-screen="incoming"');
    expect(overlay(call({ display: 'bubble', phase: { kind: 'ended', reason: 'remote', detail: null } }))).toContain('data-call-screen="ended"');
  });

  test('sans vidéo, le navigateur n’a rien à faire flotter : pas de bouton image dans l’image', () => {
    expect(renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />)).not.toContain('data-call-bubble-control="pip"');
  });
});

const liveVideo = { getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;

const peer = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-a', name: 'Amina', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const withSinks = (sinks: boolean, render: () => string): string => {
  const scope = globalThis as { HTMLMediaElement?: unknown };
  const saved = scope.HTMLMediaElement;
  scope.HTMLMediaElement = sinks ? { prototype: { setSinkId: () => undefined } } : { prototype: {} };
  try {
    return render();
  } finally {
    scope.HTMLMediaElement = saved;
  }
};

describe('la bulle, en grand ou en petit (#8145)', () => {
  test('elle dit sa taille et comment la changer', () => {
    const html = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />);
    expect(html).toContain('data-call-bubble-size="small"');
    expect(html).toContain('+ et − changent sa taille');
  });
});

describe('un écran partagé dans la bulle (#8164)', () => {
  test('il s’y voit ENTIER, une caméra y reste recadrée', () => {
    const sharing = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble', members: { 'u-a': peer({ screenSharing: true }) }, remoteStreams: { 'u-a': liveVideo } })} />);
    expect(sharing).toContain('data-call-stream="contain"');
    const camera = renderToStaticMarkup(<CallBubble call={call({ display: 'bubble', members: { 'u-a': peer({ cameraOn: true }) }, remoteStreams: { 'u-a': liveVideo } })} />);
    expect(camera).toContain('data-call-stream="cover"');
  });
});

describe('la sortie audio depuis la bulle (#9097)', () => {
  test('« Choisir les périphériques » est dans la bulle là où le navigateur choisit la sortie ; absent sinon', () => {
    const offered = withSinks(true, () => renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />));
    expect(offered).toContain('data-call-bubble-control="output"');
    expect(offered).toContain('aria-label="Choisir les périphériques"');
    expect(offered).toContain('aria-haspopup="dialog"');
    expect(withSinks(false, () => renderToStaticMarkup(<CallBubble call={call({ display: 'bubble' })} />))).not.toContain('data-call-bubble-control="output"');
  });
});

describe('l’écran d’appel', () => {
  test('en appel, l’en-tête ouvre les périphériques ; pendant la sonnerie, non', () => {
    expect(renderToStaticMarkup(<CallScreen call={call()} />)).toContain('aria-label="Choisir les périphériques"');
    expect(renderToStaticMarkup(<CallScreen call={call({ phase: { kind: 'incoming' }, direction: 'incoming' })} />)).not.toContain('Choisir les périphériques');
  });
});
