/**
 * @jest-environment node
 *
 * #11280 — une session de lecture (`playback`) porte le TIER de l'appareil
 * (`low | mid | high`), optionnel : un ancien client ne l'envoie pas, un tier
 * inconnu d'un client plus neuf est ÔTÉ sans perdre la session.
 */
import { describe, it, expect } from '@jest/globals';
import { DEVICE_TIERS } from '@meeshy/shared/types/social-events-v2';
import { parseSocialEventV2 } from '../../../../routes/social/eventsV2Schemas';

const session = (extra: Record<string, unknown> = {}) => ({
  type: 'playback',
  action: 'session',
  playbackId: '0b5e8b1e-5f2d-4c3a-9a51-6f0f4e7c2a10',
  target: { kind: 'reel', id: '507f1f77bcf86cd799439011' },
  surface: 'reels',
  startupMs: 380,
  rebufferMs: 0,
  ...extra,
});

describe('playback.deviceTier', () => {
  it('déclare trois tiers, du moins au plus capable', () => {
    expect(DEVICE_TIERS).toEqual(['low', 'mid', 'high']);
  });

  it.each(['low', 'mid', 'high'])("garde le tier '%s'", (deviceTier) => {
    expect(parseSocialEventV2('playback', session({ deviceTier }))).toMatchObject({ deviceTier, startupMs: 380 });
  });

  it('ôte un tier inconnu sans refuser la session', () => {
    const parsed = parseSocialEventV2('playback', session({ deviceTier: 'ultra' }));

    expect(parsed).toBeDefined();
    expect(parsed).not.toHaveProperty('deviceTier');
    expect(parsed).toMatchObject({ startupMs: 380 });
  });

  it('accepte la session d’un ancien client, sans tier', () => {
    expect(parseSocialEventV2('playback', session())).toMatchObject({ startupMs: 380, surface: 'reels' });
  });
});
