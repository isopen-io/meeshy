import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ActiveCall, CallMember, CallQuality } from '@/lib/calls/call-store';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { CallPeerAlerts, CallQualityDetail, CallQualityIndicator } from './call-quality';
import { CallScreen } from './call-screen';

/**
 * **LA QUALITÉ SE VOIT** (#8047) — l'indicateur de l'en-tête (quatre barres,
 * un nom lisible au lecteur d'écran), son détail (perte, latence, gigue,
 * débits, dans les unités de la langue), les pastilles de survie de ma vidéo
 * et les alertes d'un pair annoncées sans qu'on les cherche.
 */

beforeAll(async () => {
  await loadInterfaceCatalog('en');
});

const quality = (overrides: Partial<CallQuality> = {}): CallQuality => ({ level: 'good', packetLoss: 1.24, rtt: 142.6, jitter: 8.3, audioKbps: 31.6, videoKbps: 812.2, survival: 'sending', ...overrides });

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Nadia Benali', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Nadia Benali',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
  facing: 'user',
  screenSharing: false,
  members: { 'u-peer': member() },
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsOn: false,
  quality: quality(),
  ...overrides,
});

const barsLit = (html: string): number => (html.match(/data-bar="on"/g) ?? []).length;

describe('l’indicateur de qualité (#8047)', () => {
  test('quatre barres, allumées selon le niveau, et un nom qui DIT le niveau', () => {
    const levels = (['excellent', 'good', 'fair', 'poor'] as const).map((level) => renderToStaticMarkup(<CallQualityIndicator quality={quality({ level })} language="fr" />));
    expect(levels.map(barsLit)).toEqual([4, 3, 2, 1]);
    expect(levels[3]).toContain('aria-label="Qualité de l’appel : faible"');
    expect(levels[3]).toContain('data-call-quality="poor"');
    expect(levels[0]).toContain('aria-expanded="false"');
    expect(levels[0]).toContain('size-11');
  });

  test('le détail : perte, latence, gigue et débits, dans les unités de la langue', () => {
    const fr = renderToStaticMarkup(<CallQualityDetail quality={quality()} language="fr" onClose={() => undefined} />);
    expect(fr).toContain('Perte de paquets');
    expect(fr).toMatch(/1,2\s?%/);
    expect(fr).toContain('Latence');
    expect(fr).toMatch(/143\s?ms/);
    expect(fr).toContain('Gigue');
    expect(fr).toContain('Débit audio');
    expect(fr).toMatch(/32\s?kbit\/s/);
    expect(fr).toContain('Débit vidéo');
    expect(fr).toMatch(/812\s?kbit\/s/);
    expect(fr).toContain('aria-label="Fermer le détail de la qualité"');
    const en = renderToStaticMarkup(<CallQualityDetail quality={quality()} language="en" onClose={() => undefined} />);
    expect(en).toContain('Packet loss');
    expect(en).toContain('1.2%');
  });

  test('l’écran d’appel connecté porte l’indicateur ; sans relevé, il n’invente rien', () => {
    expect(renderToStaticMarkup(<CallScreen call={call()} canShare={false} />)).toContain('data-call-quality="good"');
    expect(renderToStaticMarkup(<CallScreen call={call({ quality: null })} canShare={false} />)).not.toContain('data-call-quality=');
    expect(renderToStaticMarkup(<CallScreen call={call({ phase: { kind: 'incoming' } })} canShare={false} />)).not.toContain('data-call-quality=');
  });

  test('ma vidéo gelée puis suspendue se dit par une pastille', () => {
    expect(renderToStaticMarkup(<CallScreen call={call({ quality: quality({ level: 'poor', survival: 'frozen' }) })} canShare={false} />)).toContain('data-call-pill="video-frozen"');
    const paused = renderToStaticMarkup(<CallScreen call={call({ quality: quality({ level: 'poor', survival: 'suspended' }) })} canShare={false} />);
    expect(paused).toContain('data-call-pill="video-suspended"');
    expect(paused).toContain('Réseau faible : votre vidéo est en pause, l’audio continue');
  });
});

describe('les alertes d’un pair (#8047)', () => {
  test('un lien instable est dit poliment ; une capture d’écran est une ALERTE', () => {
    const html = renderToStaticMarkup(<CallPeerAlerts members={{ a: member({ weakNetwork: true }), b: member({ userId: 'u-b', name: 'Karim', capturing: true }) }} language="fr" />);
    expect(html).toContain('La connexion de Nadia Benali est instable');
    expect(html).toContain('Karim capture l’écran de l’appel');
    expect(html).toMatch(/role="alert"[^>]*data-call-alert="capturing"|data-call-alert="capturing"[^>]*role="alert"/);
    expect(html).toContain('aria-live="polite"');
  });

  test('sans alerte, la région vivante reste montée mais vide', () => {
    const html = renderToStaticMarkup(<CallPeerAlerts members={{ a: member() }} language="fr" />);
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('data-call-alert=');
  });

  test('l’écran d’appel les montre', () => {
    expect(renderToStaticMarkup(<CallScreen call={call({ members: { 'u-peer': member({ weakNetwork: true }) } })} canShare={false} />)).toContain('data-call-alert="weak-network"');
  });
});
