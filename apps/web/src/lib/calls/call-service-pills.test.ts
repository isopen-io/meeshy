import { describe, expect, test } from 'bun:test';

import type { ActiveCall } from './call-store';
import { callServicePills, servicePillBanners, servicePillSignalsOf, videoNoticeOf, type ServicePillSignals } from './call-service-pills';
import { orderedTopBanners, selfTileClearance, TOP_BANNER_CLEARANCE } from './call-top-banners';

/**
 * #18227 — la loi de déclenchement des pastilles de service (planche E3 « En attente », E4 « Vidéo
 * réduite »), MIROIR de `CallServicePillLaw` d'Android (`CallServicePillLawTest`, PR #18373) : mêmes
 * noms de vecteurs, mêmes entrées, mêmes sorties. `none` = `CallVideoNotice.None`, `reduced` =
 * `Reduced`, `low-light` = `LowLight`.
 */
type Notice = 'reduced' | 'low-light';

const signals = (overrides: Partial<ServicePillSignals<Notice>> = {}): ServicePillSignals<Notice> => ({
  isConnectedLayout: true,
  isPictureInPicture: false,
  isOnHold: false,
  isVideoCall: true,
  isCameraOn: true,
  videoNotice: 'none',
  ...overrides,
});

type Vector = { readonly name: string; readonly signals: ServicePillSignals<Notice>; readonly hold: boolean; readonly notice: Notice | 'none' };

const VECTORS: readonly Vector[] = [
  { name: 'repos', signals: signals(), hold: false, notice: 'none' },
  { name: 'attente-systeme', signals: signals({ isOnHold: true }), hold: true, notice: 'none' },
  { name: 'attente-appel-audio', signals: signals({ isOnHold: true, isVideoCall: false, isCameraOn: false }), hold: true, notice: 'none' },
  { name: 'attente-en-image-dans-l-image', signals: signals({ isOnHold: true, isPictureInPicture: true }), hold: true, notice: 'none' },
  { name: 'attente-pendant-la-reconnexion', signals: signals({ isOnHold: true, isConnectedLayout: false }), hold: true, notice: 'none' },
  { name: 'video-reduite', signals: signals({ videoNotice: 'reduced' }), hold: false, notice: 'reduced' },
  { name: 'faible-lumiere', signals: signals({ videoNotice: 'low-light' }), hold: false, notice: 'low-light' },
  { name: 'video-reduite-camera-coupee', signals: signals({ isCameraOn: false, videoNotice: 'reduced' }), hold: false, notice: 'none' },
  { name: 'video-reduite-appel-audio', signals: signals({ isVideoCall: false, videoNotice: 'reduced' }), hold: false, notice: 'none' },
  { name: 'video-reduite-en-image-dans-l-image', signals: signals({ isPictureInPicture: true, videoNotice: 'reduced' }), hold: false, notice: 'none' },
  { name: 'video-reduite-avant-la-connexion', signals: signals({ isConnectedLayout: false, videoNotice: 'reduced' }), hold: false, notice: 'none' },
  { name: 'attente-et-video-reduite', signals: signals({ isOnHold: true, videoNotice: 'reduced' }), hold: true, notice: 'reduced' },
];

describe('la loi des pastilles de service (miroir de `CallServicePillLaw`, #18227)', () => {
  VECTORS.forEach((vector) =>
    test(vector.name, () => {
      const pills = callServicePills(vector.signals);
      expect({ hold: pills.isHoldShown, notice: pills.videoNotice }).toEqual({ hold: vector.hold, notice: vector.notice });
    }),
  );

  test('les douze vecteurs ont des noms uniques, ceux d’Android', () => {
    expect(VECTORS).toHaveLength(12);
    expect(new Set(VECTORS.map((vector) => vector.name)).size).toBe(VECTORS.length);
  });

  test('les pastilles montrées sont des maillons de la pile des bannières, l’attente avant la vidéo', () => {
    expect(servicePillBanners(callServicePills(signals({ isOnHold: true, videoNotice: 'low-light' })))).toEqual(['hold', 'video-notice']);
    expect(servicePillBanners(callServicePills(signals()))).toEqual([]);
    expect(servicePillBanners(callServicePills(signals({ videoNotice: 'reduced' })))).toEqual(['video-notice']);
  });

  test('E3 et E4 — ma vignette descend sous les pastilles et n’est jamais couverte, comme sous tout bandeau de la pile', () => {
    const present = Object.fromEntries(servicePillBanners(callServicePills(signals({ isOnHold: true, videoNotice: 'reduced' }))).map((banner) => [banner, true]));
    expect(selfTileClearance(present)).toBe(TOP_BANNER_CLEARANCE.hold + TOP_BANNER_CLEARANCE['video-notice']);
    expect(TOP_BANNER_CLEARANCE['video-notice']).toBeGreaterThanOrEqual(52);
  });

  test('dans la pile : partage · enregistrement · capture · En attente · Vidéo réduite · cadre en direct', () => {
    expect(orderedTopBanners({ 'live-frame': true, 'video-notice': true, hold: true, capture: true, recording: true, 'screen-share': true })).toEqual(['screen-share', 'recording', 'capture', 'hold', 'video-notice', 'live-frame']);
  });
});

/**
 * Ce que le web sait dire, et ce qu'il ne sait pas : sa dégradation connue est la SURVIE de ma vidéo
 * (`call-survival.ts`, #8047) — gelée par un réseau faible, puis en pause. Le web n'a ni capteur de
 * chaleur ni mesure de lumière, et son moteur n'expose AUCUN état d'attente : « En attente » ne s'y
 * allume pas.
 */
describe('les signaux du web', () => {
  test('ma vidéo gelée ⇒ « reduced » ; en pause ⇒ « paused » ; émise ou sans relevé ⇒ rien', () => {
    expect(videoNoticeOf('frozen')).toBe('reduced');
    expect(videoNoticeOf('suspended')).toBe('paused');
    expect(videoNoticeOf('sending')).toBe('none');
    expect(videoNoticeOf(undefined)).toBe('none');
  });

  const quality = (survival: 'sending' | 'frozen' | 'suspended') => ({ level: 'poor' as const, packetLoss: 0, rtt: 0, jitter: 0, audioKbps: 0, videoKbps: 0, survival });
  const call = (overrides: Partial<ActiveCall> = {}): Pick<ActiveCall, 'phase' | 'connectedAt' | 'media' | 'cameraOn' | 'quality'> => ({
    phase: { kind: 'connected' },
    connectedAt: 1,
    media: 'video',
    cameraOn: true,
    quality: quality('frozen'),
    ...overrides,
  });

  test('l’appel établi, en vidéo, caméra allumée, hors image dans l’image : ma vidéo gelée se dit', () => {
    expect(servicePillSignalsOf(call(), false)).toEqual({ isConnectedLayout: true, isPictureInPicture: false, isOnHold: false, isVideoCall: true, isCameraOn: true, videoNotice: 'reduced' });
    expect(callServicePills(servicePillSignalsOf(call({ quality: quality('suspended') }), false)).videoNotice).toBe('paused');
  });

  test('la reconnexion APRÈS un média établi garde l’écran établi ; avant, non (`isConnectedLayout` d’Android)', () => {
    expect(servicePillSignalsOf(call({ phase: { kind: 'reconnecting' } }), false).isConnectedLayout).toBe(true);
    expect(servicePillSignalsOf(call({ phase: { kind: 'reconnecting' }, connectedAt: null }), false).isConnectedLayout).toBe(false);
    expect(servicePillSignalsOf(call({ phase: { kind: 'connecting' }, connectedAt: null }), false).isConnectedLayout).toBe(false);
  });

  test('caméra coupée, appel audio, image dans l’image : la notice se tait', () => {
    expect(callServicePills(servicePillSignalsOf(call({ cameraOn: false }), false)).videoNotice).toBe('none');
    expect(callServicePills(servicePillSignalsOf(call({ media: 'audio' }), false)).videoNotice).toBe('none');
    expect(callServicePills(servicePillSignalsOf(call(), true)).videoNotice).toBe('none');
  });

  test('le web n’a aucun état d’attente : « En attente » ne s’allume jamais', () => {
    expect(servicePillSignalsOf(call({ phase: { kind: 'reconnecting' } }), true).isOnHold).toBe(false);
  });
});
