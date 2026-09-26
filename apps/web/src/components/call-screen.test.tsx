import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ActiveCall, CallMember } from '@/lib/calls/call-store';

import { CallScreen } from './call-screen';
import { ThreadCallButton } from './thread-call-button';

/**
 * L'ÉCRAN D'APPEL DESSINÉ (#6382, #8045) — miroir `CallView.swift` : chaque
 * phase montre SES commandes et rien d'autre. Rendu sans DOM : ce que ces
 * témoins gardent est ce que l'écran PROPOSE, pas comment il s'anime.
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
  captionsOn: false,
  quality: null,
  ...overrides,
});

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Amina Diallo', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, link: 'connected', ...overrides });

const screen = (overrides: Partial<ActiveCall> = {}, canShare = false) => renderToStaticMarkup(<CallScreen call={call(overrides)} canShare={canShare} />);

const liveVideo = { getVideoTracks: () => [{ readyState: 'live' }], getTracks: () => [] } as unknown as MediaStream;

describe('CallScreen', () => {
  test('un appel vidéo entrant propose Refuser, Répondre sans vidéo, Accepter', () => {
    const html = screen({ phase: { kind: 'incoming' }, media: 'video', direction: 'incoming', callerName: 'Amina Diallo' });
    expect(html).toContain('data-call-screen="incoming"');
    expect(html).toContain('Appel vidéo entrant');
    expect(html).toContain('Refuser');
    expect(html).toContain('Répondre sans vidéo');
    expect(html).toContain('Accepter');
    expect(html).not.toContain('Raccrocher');
  });

  test('un appel VOCAL entrant ne propose pas « Répondre sans vidéo »', () => {
    expect(screen({ phase: { kind: 'incoming' }, direction: 'incoming' })).not.toContain('Répondre sans vidéo');
  });

  test('en appel : micro, caméra, raccrocher — et le nom du pair', () => {
    const html = screen({ members: { 'u-peer': member() } });
    expect(html).toContain('Amina Diallo');
    expect(html).toContain('Couper le micro');
    expect(html).toContain('Raccrocher');
    expect(html).not.toContain('Accepter');
  });

  test('un appel sortant sans réponse se termine sur « Pas de réponse » et propose Réessayer', () => {
    const html = screen({ phase: { kind: 'ended', reason: 'missed', detail: null } });
    expect(html).toContain('Pas de réponse');
    expect(html).toContain('Réessayer');
    expect(html).toContain('Fermer');
  });

  test('un appel raccroché ne propose PAS Réessayer', () => {
    expect(screen({ phase: { kind: 'ended', reason: 'local', detail: null } })).not.toContain('Réessayer');
  });

  test('le micro coupé du pair se lit en pastille', () => {
    expect(screen({ members: { 'u-peer': member({ micMuted: true }) } })).toContain('data-call-pill="peer-muted"');
  });

  test('l’écran est un dialogue nommé', () => {
    expect(screen()).toContain('role="dialog"');
  });
});

describe('CallScreen — partage d’écran (#8063)', () => {
  test('connecté, sur un navigateur qui sait, le bouton « Partager l’écran » est offert', () => {
    const html = screen({ members: { 'u-peer': member() } }, true);
    expect(html).toContain('data-call-screen-share=""');
    expect(html).toContain('aria-label="Partager l’écran"');
  });

  test('sans getDisplayMedia (coque Android, Safari iOS), aucun bouton ne le promet', () => {
    expect(screen({ members: { 'u-peer': member() } }, false)).not.toContain('data-call-screen-share');
  });

  test('pendant la sonnerie, le partage n’est pas offert', () => {
    expect(screen({ phase: { kind: 'outgoing' } }, true)).not.toContain('data-call-screen-share');
  });

  test('celui qui partage lit « Vous partagez votre écran » et peut arrêter', () => {
    const html = screen({ screenSharing: true, members: { 'u-peer': member() } }, true);
    expect(html).toContain('data-call-pill="screen-sharing"');
    expect(html).toContain('aria-label="Arrêter le partage d’écran"');
    expect(html).toContain('aria-pressed="true"');
  });

  test('le pair qui partage : son écran en grand, ENTIER, sous une bannière qui le nomme', () => {
    const html = screen({ members: { 'u-peer': member({ screenSharing: true }) }, remoteStreams: { 'u-peer': liveVideo } });
    expect(html).toContain('data-call-shared-screen=""');
    expect(html).toContain('object-fit:contain');
    expect(html).toContain('Amina Diallo partage son écran');
  });
});

describe('ThreadCallButton', () => {
  test('en fixtures, le bouton ouvre un menu vocal/vidéo', () => {
    const html = renderToStaticMarkup(<ThreadCallButton conversationId="c-1" title="Amina" avatar={null} group={false} />);
    expect(html).toContain('data-thread-call="menu"');
    expect(html).toContain('aria-haspopup="menu"');
  });
});
