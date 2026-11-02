/**
 * @jest-environment node
 *
 * W11 (#11317) — le résumé de lecture du web porte les Web Vitals de la page
 * (LCP, CLS, INP) et les longues images d'animation survenues pendant la
 * séance. La passerelle les GARDE, bornés et optionnels : un ancien client ne
 * les envoie pas, une valeur hors bornes est ôtée SEULE, la session reste.
 */
import { describe, it, expect } from '@jest/globals';
import { parseSocialEventV2 } from '../../../../routes/social/eventsV2Schemas';

const session = (extra: Record<string, unknown> = {}) => ({
  type: 'playback',
  action: 'session',
  playbackId: '0b5e8b1e-5f2d-4c3a-9a51-6f0f4e7c2a10',
  target: { kind: 'reel', id: '507f1f77bcf86cd799439011' },
  surface: 'reels',
  startupMs: 380,
  ...extra,
});

const VITALS = { lcpMs: 1840, cls: 0.07, inpMs: 160, longFrames: 3, longFramesBlockingMs: 210, longFrameWorstMs: 140 };

describe('playback — Web Vitals et longues images (W11)', () => {
  it('garde les six mesures', () => {
    expect(parseSocialEventV2('playback', session(VITALS))).toMatchObject({ ...VITALS, startupMs: 380 });
  });

  it.each([
    ['cls', -0.1],
    ['cls', 50],
    ['lcpMs', -1],
    ['lcpMs', 'lent'],
    ['inpMs', 1.5],
    ['longFrames', -2],
    ['longFrameWorstMs', 90_000_000],
  ])('ôte %s = %p sans refuser la session ni les autres mesures', (field, value) => {
    const parsed = parseSocialEventV2('playback', session({ ...VITALS, [field]: value })) as Record<string, unknown> | undefined;
    expect(parsed).toBeDefined();
    expect(parsed?.[field]).toBeUndefined();
    expect(parsed).toMatchObject({ startupMs: 380, lcpMs: field === 'lcpMs' ? undefined : 1840 });
  });

  it('accepte la session d’un client qui ne les envoie pas', () => {
    expect(parseSocialEventV2('playback', session())).toMatchObject({ startupMs: 380 });
  });
});
