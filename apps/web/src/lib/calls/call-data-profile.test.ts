import { describe, expect, test } from 'bun:test';

import { acquireCallMedia, acquireCamera, videoConstraints } from './call-media';
import { TIER_ENCODING } from './call-quality';
import { audioBitrateFor, DATA_PROFILES, dataProfileOf, opusShapeFor, profiledEncoding, captureShape } from './call-data-profile';

describe('le profil de données d’un appel (#8697)', () => {
  test('sans information de connexion, le réseau est tenu pour du Wi-Fi', () => {
    expect(dataProfileOf(null)).toBe('wifi');
    expect(dataProfileOf({})).toBe('wifi');
    expect(dataProfileOf({ type: 'wifi', effectiveType: '4g' })).toBe('wifi');
  });

  test('un lien cellulaire annoncé par le navigateur ou la coque passe au profil cellulaire', () => {
    expect(dataProfileOf({ type: 'cellular', effectiveType: '4g' })).toBe('cellular');
  });

  test('l’économie de données ou un réseau lent imposent le profil économie, même en Wi-Fi', () => {
    expect(dataProfileOf({ type: 'wifi', saveData: true })).toBe('economy');
    expect(dataProfileOf({ effectiveType: '3g' })).toBe('economy');
    expect(dataProfileOf({ type: 'cellular', effectiveType: 'slow-2g' })).toBe('economy');
    expect(dataProfileOf({ effectiveType: '2g' })).toBe('economy');
  });

  test('le barème est celui d’iOS : Opus 32/24/16 kb/s, vidéo 1,2 Mb/s, 600 kb/s, 300 kb/s', () => {
    expect([DATA_PROFILES.wifi.audioBitrate, DATA_PROFILES.cellular.audioBitrate, DATA_PROFILES.economy.audioBitrate]).toEqual([32_000, 24_000, 16_000]);
    expect([DATA_PROFILES.wifi.videoBitrate, DATA_PROFILES.cellular.videoBitrate, DATA_PROFILES.economy.videoBitrate]).toEqual([1_200_000, 600_000, 300_000]);
  });

  test('un lien mauvais fait descendre l’audio au palier dégradé, quel que soit le profil', () => {
    expect(audioBitrateFor('wifi', 'excellent')).toBe(32_000);
    expect(audioBitrateFor('wifi', 'fair')).toBe(32_000);
    expect(audioBitrateFor('wifi', 'poor')).toBe(16_000);
    expect(audioBitrateFor('cellular', 'good')).toBe(24_000);
    expect(audioBitrateFor('cellular', 'poor')).toBe(16_000);
  });

  test('le profil plafonne le palier vidéo sans jamais le relever', () => {
    expect(profiledEncoding(TIER_ENCODING.high, 'wifi')).toEqual({ ...TIER_ENCODING.high, maxBitrate: 1_200_000 });
    expect(profiledEncoding(TIER_ENCODING.high, 'cellular')).toEqual({ active: true, maxBitrate: 600_000, scaleResolutionDownBy: 1, maxFramerate: 24 });
    expect(profiledEncoding(TIER_ENCODING.high, 'economy')).toEqual({ active: true, maxBitrate: 300_000, scaleResolutionDownBy: 2, maxFramerate: 15 });
    expect(profiledEncoding(TIER_ENCODING.frozen, 'wifi')).toEqual(TIER_ENCODING.frozen);
    expect(profiledEncoding(TIER_ENCODING.suspended, 'economy')).toEqual(TIER_ENCODING.suspended);
  });

  test('la capture reste bornée à 720p et 24 à 30 images par seconde, plus petite hors Wi-Fi', () => {
    for (const profile of ['wifi', 'cellular', 'economy'] as const) {
      const shape = captureShape(profile);
      expect(shape.height.max).toBe(720);
      expect(shape.width.max).toBe(1280);
      expect(shape.frameRate.max).toBe(30);
      expect(shape.frameRate.ideal).toBeGreaterThanOrEqual(24);
    }
    expect(captureShape('wifi')).toMatchObject({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } });
    expect(captureShape('cellular')).toMatchObject({ width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } });
    expect(captureShape('economy')).toMatchObject({ width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 24 } });
  });

  test('la voix demandée au pair suit le même barème ; en économie, la bande élargie suffit', () => {
    expect(opusShapeFor('wifi')).toEqual({ maxAverageBitrate: 32_000 });
    expect(opusShapeFor('cellular')).toEqual({ maxAverageBitrate: 24_000 });
    expect(opusShapeFor('economy')).toEqual({ maxAverageBitrate: 16_000, maxPlaybackRate: 16_000 });
  });

  test('chaque profil dit sa préférence de dégradation à l’encodeur', () => {
    expect(DATA_PROFILES.wifi.degradationPreference).toBe('balanced');
    expect(DATA_PROFILES.economy.degradationPreference).toBe('maintain-framerate');
  });
});

describe('la caméra d’un appel suit le profil (#8697)', () => {
  const recorder = () => {
    const asked: MediaStreamConstraints[] = [];
    const mediaDevices = {
      getUserMedia: async (constraints?: MediaStreamConstraints) => {
        asked.push(constraints ?? {});
        return { getVideoTracks: () => [{ kind: 'video' }], getAudioTracks: () => [] } as unknown as MediaStream;
      },
    };
    return { asked, mediaDevices };
  };

  test('l’appel vidéo ouvre la caméra à la forme du profil, face gardée', async () => {
    const { asked, mediaDevices } = recorder();
    await acquireCallMedia({ video: true, facing: 'user', profile: 'economy', mediaDevices });
    expect(asked[0]?.video).toEqual({ ...captureShape('economy'), facingMode: 'user' });
  });

  test('la caméra rouverte (bascule, reprise) garde la forme du profil', async () => {
    const { asked, mediaDevices } = recorder();
    await acquireCamera({ facing: 'environment', profile: 'wifi', mediaDevices });
    expect(asked[0]?.video).toEqual({ ...captureShape('wifi'), facingMode: 'environment' });
  });

  test('sans profil, la forme historique tient : 640 × 480 à 24 i/s', () => {
    expect(videoConstraints('user')).toEqual({ ...captureShape('cellular'), facingMode: 'user' });
  });
});
