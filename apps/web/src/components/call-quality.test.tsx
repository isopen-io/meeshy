import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CallHeaderCapsule } from '@/lib/calls/call-header';
import type { ActiveCall, CallMember, CallQuality } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { CallQualityChip } from './call-quality';
import { CallQualityDetail } from './call-quality-detail';
import { CallScreen, loadColdCallViews } from './call-screen';
import { CallCaptureAlerts, CallPeerAlerts } from './call-share-banner';

/**
 * **LA QUALITÉ SE VOIT** (#8047) — l'indicateur de l'en-tête (quatre barres,
 * un nom lisible au lecteur d'écran), son détail (perte, latence, gigue,
 * débits, dans les unités de la langue), les pastilles de survie de ma vidéo
 * et les alertes d'un pair annoncées sans qu'on les cherche.
 */

beforeAll(async () => {
  await loadInterfaceCatalog('en');
  await loadCallControlsCatalog('fr');
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
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: quality(),
  ...overrides,
});

const barsLit = (html: string): number => (html.match(/data-bar="on"/g) ?? []).length;

describe('l’indicateur de qualité (#8047), dans la capsule de l’en-tête (#8391, #17341)', () => {
  const video: CallHeaderCapsule = { title: 'Awa', participantCount: null, duration: true, network: true };
  const chip = (overrides: Partial<CallQuality> | null = {}, capsule: CallHeaderCapsule = video) =>
    renderToStaticMarkup(<CallQualityChip capsule={capsule} clock="1:23" quality={overrides === null ? null : quality(overrides)} language="fr" prominent={false} />);

  test('quatre barres, allumées selon le niveau, et un nom qui DIT la capsule ET le niveau', () => {
    const levels = (['excellent', 'good', 'fair', 'poor'] as const).map((level) => chip({ level }));
    expect(levels.map(barsLit)).toEqual([4, 3, 2, 1]);
    expect(levels[3]).toContain('aria-label="Awa · 1:23 — Qualité de l’appel : faible"');
    expect(levels[3]).toContain('data-call-quality="poor"');
    expect(levels[0]).toContain('aria-expanded="false"');
    expect(levels[0]).toContain('aria-haspopup="dialog"');
    expect(levels[0]).toContain('min-h-11');
  });

  test('tant que le lien n’est pas dégradé, la capsule ne dessine aucune barre — mais le niveau reste dit et le détail ouvrable', () => {
    const html = chip({ level: 'good' }, { ...video, network: false });
    expect(barsLit(html)).toBe(0);
    expect(html).not.toContain('data-bar=');
    expect(html).toContain('aria-label="Awa · 1:23 — Qualité de l’appel : bonne"');
    expect(html).toContain('<button');
  });

  test('une capsule de verre qui montre le nom donné et la durée', () => {
    const html = chip({ level: 'good' }, { ...video, network: false });
    expect(html).toContain('glass-call');
    expect(html).toContain('Awa');
    expect(html).toContain('1:23');
  });

  test('en groupe : le nom, le nombre de participants (dit en toutes lettres au lecteur d’écran) et la durée', () => {
    const html = chip({ level: 'good' }, { title: 'Famille', participantCount: 4, duration: true, network: false });
    expect(html).toContain('data-call-chip-count');
    expect(html).toContain('aria-label="Famille · 4 participants · 1:23 — Qualité de l’appel : bonne"');
  });

  test('la capsule montre ses « · » entre le nom, le nombre et la durée — lus une seule fois, par le nom accessible (L1.2, L4.5)', () => {
    const duo = chip({ level: 'good' }, { ...video, network: false });
    expect(duo).toMatch(/Awa<\/span><span[^>]*aria-hidden="true"[^>]*data-call-chip-sep=""[^>]*>·<\/span><span class="shrink-0">1:23<\/span>/);
    expect((duo.match(/data-call-chip-sep/g) ?? []).length).toBe(1);
    const group = chip({ level: 'good' }, { title: 'Équipe', participantCount: 4, duration: true, network: false });
    expect((group.match(/data-call-chip-sep/g) ?? []).length).toBe(2);
    expect(group).toMatch(/Équipe<\/span><span[^>]*data-call-chip-sep[^>]*>·<\/span><span[^>]*data-call-chip-count[^>]*>.*4<\/span><span[^>]*data-call-chip-sep[^>]*>·<\/span><span class="shrink-0">1:23<\/span>/);
    expect(group).toContain('aria-label="Équipe · 4 participants · 1:23 — Qualité de l’appel : bonne"');
    expect((chip(null, { title: 'Awa', participantCount: null, duration: true, network: false }).match(/data-call-chip-sep/g) ?? []).length).toBe(1);
  });

  test('aucun « · » orphelin : un nom seul, une durée seule, l’audio et l’écran reçu n’en dessinent pas', () => {
    const none = [
      chip({ level: 'good' }, { title: 'Awa', participantCount: null, duration: false, network: false }),
      chip({ level: 'good' }, { title: null, participantCount: null, duration: true, network: false }),
      chip({ level: 'poor' }, { title: null, participantCount: null, duration: false, network: true }),
      chip({ level: 'good' }, { title: 'Awa', participantCount: null, duration: false, network: false, receivedScreen: true }),
    ];
    for (const html of none) expect(html).not.toContain('data-call-chip-sep');
  });

  test('en audio : la capsule n’existe que pour le réseau dégradé — ni nom, ni durée, les barres seules', () => {
    const html = chip({ level: 'poor' }, { title: null, participantCount: null, duration: false, network: true });
    expect(barsLit(html)).toBe(1);
    expect(html).not.toContain('1:23');
    expect(html).toContain('aria-label="Qualité de l’appel : faible"');
  });

  test('un écran reçu (P15.4) : la capsule dit « Écran de X » avec l’icône d’écran, sans durée, et son nom accessible le dit', async () => {
    await loadInterfaceCatalog('fr');
    const screen: CallHeaderCapsule = { title: 'Awa', participantCount: null, duration: false, network: false, receivedScreen: true };
    const html = chip({ level: 'good' }, screen);
    expect(html).toContain('Écran de Awa');
    expect(html).toContain('data-call-chip-screen');
    expect(html).not.toContain('1:23');
    expect(html).toMatch(/aria-label="Écran de Awa — Qualité de l’appel : bonne"/);
    expect(chip(null, screen)).toContain('Écran de Awa');
  });

  test('une capsule sans écran reçu ne porte pas l’icône d’écran', () => {
    expect(chip({ level: 'good' }, { ...video, network: false })).not.toContain('data-call-chip-screen');
  });

  test('sans relevé de qualité, la capsule ne promet aucun détail : pas de bouton', () => {
    const html = chip(null);
    expect(html).toContain('Awa');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('data-call-quality=');
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

  test('chaque mesure du détail porte le niveau d’iOS, vu ET dit : gigue 30/50 ms, perte 3/5 %, latence 300/450 ms (#8209)', () => {
    const html = renderToStaticMarkup(<CallQualityDetail quality={quality({ packetLoss: 4, rtt: 120, jitter: 55 })} language="fr" onClose={() => undefined} />);
    expect(html).toMatch(/data-call-quality-row="call.quality.loss"[^>]*data-call-quality-grade="medium"/);
    expect(html).toMatch(/data-call-quality-row="call.quality.latency"[^>]*data-call-quality-grade="good"/);
    expect(html).toMatch(/data-call-quality-row="call.quality.jitter"[^>]*data-call-quality-grade="poor"/);
    expect(html).not.toMatch(/data-call-quality-row="call.quality.audioRate"[^>]*data-call-quality-grade/);
    expect(html).toMatch(/55\s?ms[\s\S]*?faible/);
    const borderline = renderToStaticMarkup(<CallQualityDetail quality={quality({ jitter: 30 })} language="fr" onClose={() => undefined} />);
    expect(borderline).toMatch(/data-call-quality-row="call.quality.jitter"[^>]*data-call-quality-grade="medium"/);
  });

  test('le détail dit le profil de données et ce qu’il permet d’envoyer ; un lien mauvais baisse la voix (#8697)', () => {
    const cellular = renderToStaticMarkup(<CallQualityDetail quality={quality()} profile="cellular" language="fr" onClose={() => undefined} />);
    expect(cellular).toContain('Réseau');
    expect(cellular).toContain('Données mobiles');
    expect(cellular).toContain('Plafond audio');
    expect(cellular).toMatch(/24\s?kbit\/s/);
    expect(cellular).toContain('Plafond vidéo');
    expect(cellular).toMatch(/600\s?kbit\/s/);
    const poor = renderToStaticMarkup(<CallQualityDetail quality={quality({ level: 'poor' })} profile="wifi" language="en" onClose={() => undefined} />);
    expect(poor).toContain('Wi-Fi');
    expect(poor).toMatch(/16\s?kb(it)?\/s/);
    expect(poor).toMatch(/1,200\s?kb(it)?\/s/);
    const economy = renderToStaticMarkup(<CallQualityDetail quality={quality()} profile="economy" language="fr" onClose={() => undefined} />);
    expect(economy).toContain('Économie de données');
    expect(economy).toContain('data-call-quality-profile="economy"');
  });

  test('l’écran d’appel connecté porte l’indicateur ; sans relevé, il n’invente rien', async () => {
    await loadColdCallViews();
    expect(renderToStaticMarkup(<CallScreen call={call()} canShare={false} />)).toContain('data-call-quality="good"');
    expect(renderToStaticMarkup(<CallScreen call={call({ quality: null })} canShare={false} />)).not.toContain('data-call-quality=');
    expect(renderToStaticMarkup(<CallScreen call={call({ phase: { kind: 'incoming' } })} canShare={false} />)).not.toContain('data-call-quality=');
  });

  /* E4 (#18227) : la survie de ma vidéo n'est plus une pastille de la rangée (`data-call-pill`) mais « Vidéo réduite », un maillon de verre partagé de la pile du haut, annoncé poliment. */
  const stackOf = (html: string): string => html.slice(html.indexOf('data-call-banner-stack'));

  test('ma vidéo gelée puis suspendue se dit par la pastille « Vidéo réduite », en verre du kit, dans la pile du haut', async () => {
    await loadColdCallViews();
    const frozen = renderToStaticMarkup(<CallScreen call={call({ quality: quality({ level: 'poor', survival: 'frozen' }) })} canShare={false} />);
    expect(frozen).not.toContain('data-call-pill="video-frozen"');
    expect(stackOf(frozen)).toContain('data-call-video-notice="reduced"');
    expect(stackOf(frozen)).toContain('Réseau faible : votre vidéo est ralentie');
    const paused = renderToStaticMarkup(<CallScreen call={call({ quality: quality({ level: 'poor', survival: 'suspended' }) })} canShare={false} />);
    expect(paused).not.toContain('data-call-pill="video-suspended"');
    expect(stackOf(paused)).toContain('data-call-video-notice="paused"');
    expect(stackOf(paused)).toContain('Réseau faible : votre vidéo est en pause, l’audio continue');
    const tag = /<[^>]*data-call-video-notice="paused"[^>]*>/.exec(paused)?.[0] ?? '';
    expect(tag).toContain('role="status"');
    expect(tag).toContain('data-glass-tone=');
  });

  test('« Vidéo réduite » se range au premier toucher avec les autres bannières, et revient au second (loi 11, comme iOS #18396)', async () => {
    await loadColdCallViews();
    const html = renderToStaticMarkup(<CallScreen call={call({ quality: quality({ level: 'poor', survival: 'frozen' }) })} canShare={false} />);
    const slot = /<[^>]*data-call-video-notice-slot[^>]*>/.exec(html)?.[0] ?? '';
    expect(slot).toContain('data-call-stow="top"');
  });

  test('« Vidéo réduite » se tait caméra coupée, en appel audio et avant l’appel établi (loi des pastilles de service)', async () => {
    await loadColdCallViews();
    const frozen = quality({ level: 'poor', survival: 'frozen' });
    expect(renderToStaticMarkup(<CallScreen call={call({ quality: frozen, cameraOn: false })} canShare={false} />)).not.toContain('data-call-video-notice');
    expect(renderToStaticMarkup(<CallScreen call={call({ quality: frozen, media: 'audio', cameraOn: false })} canShare={false} />)).not.toContain('data-call-video-notice');
    expect(renderToStaticMarkup(<CallScreen call={call({ quality: frozen, phase: { kind: 'connecting' }, connectedAt: null })} canShare={false} />)).not.toContain('data-call-video-notice');
  });
});

describe('les alertes d’un pair (#8047)', () => {
  test('un lien instable est dit poliment ; une capture d’écran est une ALERTE', () => {
    const members = { a: member({ weakNetwork: true }), b: member({ userId: 'u-b', name: 'Karim', capturing: true }) };
    const network = renderToStaticMarkup(<CallPeerAlerts members={members} language="fr" />);
    const capture = renderToStaticMarkup(<CallCaptureAlerts members={members} language="fr" />);
    expect(network).toContain('La connexion de Nadia Benali est instable');
    expect(network).toContain('aria-live="polite"');
    expect(capture).toContain('Karim capture l’écran de l’appel');
    expect(capture).toMatch(/role="alert"[^>]*data-call-alert="capturing"|data-call-alert="capturing"[^>]*role="alert"/);
  });

  test('sans alerte, la région vivante reste montée mais vide', () => {
    const html = renderToStaticMarkup(<CallPeerAlerts members={{ a: member() }} language="fr" />);
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('data-call-alert=');
  });

  test('#16665 — R1 : une capsule rouge, un petit anneau blanc puis « Karim capture l’écran de l’appel »', () => {
    const html = renderToStaticMarkup(<CallCaptureAlerts members={{ b: member({ userId: 'u-b', name: 'Karim', capturing: true }) }} language="fr" />);
    expect(html).toMatch(/data-call-alert="capturing"[^>]*><span aria-hidden="true"[^>]*data-call-alert-dot=""[^>]*><\/span><span class="truncate">Karim capture l’écran de l’appel<\/span><\/span>/);
    expect(html).toMatch(/class="inline-flex h-11 [^"]*px-3\.5 text-\[13px\]/);
  });

  test('#16665 — la capsule de capture se montre en audio comme en vidéo', () => {
    for (const media of ['audio', 'video'] as const) {
      const html = renderToStaticMarkup(<CallScreen call={call({ media, cameraOn: media === 'video', members: { 'u-peer': member({ capturing: true, cameraOn: media === 'video' }) } })} canShare={false} />);
      expect(html).toContain('data-call-alert="capturing"');
      expect(html.split('data-call-alert="capturing"')).toHaveLength(2);
    }
  });

  /* R1.6 (#17963, tranchée le 2026-11-13) : le témoin « hors du fondu du chrome » évolue — la puce se range désormais au premier toucher avec les bannières, comme iOS #18364 et Android #18376. */
  test('#16665 — R1 : la capsule se pose sous l’en-tête, et se range au premier toucher avec les bannières (R1.6)', () => {
    const html = renderToStaticMarkup(<CallScreen call={call({ media: 'audio', members: { 'u-peer': member({ capturing: true }) } })} canShare={false} />);
    const slot = html.indexOf('data-call-capture-slot');
    expect(slot).toBeGreaterThan(-1);
    expect(html.indexOf('data-call-plane')).toBeLessThan(slot);
    const tag = /<[^>]*data-call-capture-slot[^>]*>/.exec(html)?.[0] ?? '';
    expect(tag).toContain('data-call-stow="top"');
    expect(tag).not.toContain('aria-hidden');
  });

  test('R1.2 (#17963) : la puce est en verre teinté rouge du kit, celui du bandeau de partage, jamais un aplat', () => {
    const html = renderToStaticMarkup(<CallCaptureAlerts members={{ b: member({ userId: 'u-b', name: 'Karim', capturing: true }) }} language="fr" />);
    const chip = /<span[^>]*data-call-alert="capturing"[^>]*>/.exec(html)?.[0] ?? '';
    expect(chip.split('class="')[1]?.split('"')[0]?.split(' ')).toContain('glass-call-danger');
    expect(chip).not.toContain('color-mix');
    expect(chip).not.toContain('style=');
  });

  test('R1.2 : deux personnes capturent, UNE puce — celle de la capture la plus récente (comme iOS et Android)', () => {
    const members = { a: member({ userId: 'u-a', name: 'Awa', capturing: true }), b: member({ userId: 'u-b', name: 'Karim', capturing: true }) };
    const notes = [
      { id: 'n1', kind: 'screenshot' as const, userId: 'u-b', name: 'Karim', at: 10 },
      { id: 'n2', kind: 'recording' as const, userId: 'u-a', name: 'Awa', at: 20 },
    ];
    const html = renderToStaticMarkup(<CallCaptureAlerts members={members} notes={notes} language="fr" />);
    expect(html.split('data-call-alert="capturing"')).toHaveLength(2);
    expect(html).toContain('Awa capture l’écran de l’appel');
    const screen = renderToStaticMarkup(<CallScreen call={call({ media: 'audio', members: { 'u-a': members.a, 'u-b': members.b }, journalNotes: notes })} canShare={false} />);
    expect(screen.split('data-call-alert="capturing"')).toHaveLength(2);
  });

  test('l’écran d’appel les montre', () => {
    expect(renderToStaticMarkup(<CallScreen call={call({ members: { 'u-peer': member({ weakNetwork: true }) } })} canShare={false} />)).toContain('data-call-alert="weak-network"');
  });
});
