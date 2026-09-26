import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ActiveCall } from '@/lib/calls/call-store';

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
  members: {},
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsOn: false,
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

describe('l’écran d’appel', () => {
  test('en appel, l’en-tête ouvre les périphériques ; pendant la sonnerie, non', () => {
    expect(renderToStaticMarkup(<CallScreen call={call()} />)).toContain('aria-label="Choisir les périphériques"');
    expect(renderToStaticMarkup(<CallScreen call={call({ phase: { kind: 'incoming' }, direction: 'incoming' })} />)).not.toContain('Choisir les périphériques');
  });
});
