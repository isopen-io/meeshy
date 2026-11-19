import { describe, expect, test } from 'bun:test';

import { acquireCallMedia, acquireCamera, acquireChosenInput, acquireDisplay, videoConstraints } from './call-media';
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

  test('seule l’économie de données demandée impose le profil économie, même en Wi-Fi', () => {
    expect(dataProfileOf({ type: 'wifi', saveData: true })).toBe('economy');
    expect(dataProfileOf({ type: 'cellular', saveData: true })).toBe('economy');
  });

  /**
   * #19775 — `effectiveType` se déduit de la latence HTTP : un lien rapide mais
   * lointain se dit « 3g ». Il ne décide plus du profil — sinon la vidéo partait
   * en 240×180 à 15 i/s sur une fibre d'hôtel.
   */
  test('un lien annoncé lent par sa latence ne dégrade plus la vidéo : c’est l’estimation de débit qui décide (#19775)', () => {
    expect(dataProfileOf({ effectiveType: '3g' })).toBe('wifi');
    expect(dataProfileOf({ effectiveType: '2g' })).toBe('wifi');
    expect(dataProfileOf({ type: 'cellular', effectiveType: 'slow-2g' })).toBe('cellular');
  });

  test('le barème : Opus 32/24/16 kb/s, vidéo 2,5 Mb/s en Wi-Fi (le plafond d’Android), 600 kb/s, 300 kb/s', () => {
    expect([DATA_PROFILES.wifi.audioBitrate, DATA_PROFILES.cellular.audioBitrate, DATA_PROFILES.economy.audioBitrate]).toEqual([32_000, 24_000, 16_000]);
    expect([DATA_PROFILES.wifi.videoBitrate, DATA_PROFILES.cellular.videoBitrate, DATA_PROFILES.economy.videoBitrate]).toEqual([2_500_000, 600_000, 300_000]);
  });

  test('un lien mauvais fait descendre l’audio au palier dégradé, quel que soit le profil', () => {
    expect(audioBitrateFor('wifi', 'excellent')).toBe(32_000);
    expect(audioBitrateFor('wifi', 'fair')).toBe(32_000);
    expect(audioBitrateFor('wifi', 'poor')).toBe(16_000);
    expect(audioBitrateFor('cellular', 'good')).toBe(24_000);
    expect(audioBitrateFor('cellular', 'poor')).toBe(16_000);
  });

  test('le profil plafonne le palier vidéo sans jamais le relever', () => {
    expect(profiledEncoding(TIER_ENCODING.high, 'wifi')).toEqual(TIER_ENCODING.high);
    expect(profiledEncoding(TIER_ENCODING.high, 'cellular')).toEqual({ active: true, maxBitrate: 600_000, scaleResolutionDownBy: 1, maxFramerate: 24 });
    expect(profiledEncoding(TIER_ENCODING.high, 'economy')).toEqual({ active: true, maxBitrate: 300_000, scaleResolutionDownBy: 1, maxFramerate: 15 });
    expect(profiledEncoding(TIER_ENCODING.frozen, 'wifi')).toEqual(TIER_ENCODING.frozen);
    expect(profiledEncoding(TIER_ENCODING.suspended, 'economy')).toEqual(TIER_ENCODING.suspended);
  });

  test('la capture reste bornée à 720p et 24 à 30 images par seconde, en 16:9', () => {
    for (const profile of ['wifi', 'cellular', 'economy'] as const) {
      const shape = captureShape(profile);
      expect(shape.height.max).toBe(720);
      expect(shape.width.max).toBe(1280);
      expect(shape.frameRate.max).toBe(30);
      expect(shape.frameRate.ideal).toBeGreaterThanOrEqual(24);
      expect(shape.aspectRatio.ideal).toBeCloseTo(16 / 9);
    }
  });

  /**
   * #19775 — le cellulaire capture en 720p comme le Wi-Fi : c'est l'encodeur qui
   * descend (débit plafonné, `balanced`), et l'image remonte d'elle-même quand
   * le lien le permet, sans rouvrir la caméra. Seule l'économie capture plus petit,
   * et jamais réduite une seconde fois à l'encodage.
   */
  test('le cellulaire capture en 720p à 30 i/s ; seule l’économie capture en 640×360 (#19775)', () => {
    expect(captureShape('wifi')).toMatchObject({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } });
    expect(captureShape('cellular')).toMatchObject({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } });
    expect(captureShape('economy')).toMatchObject({ width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } });
    expect(DATA_PROFILES.economy.scaleResolutionDownBy).toBe(1);
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

  test('sans profil, la caméra s’ouvre à la forme du Wi-Fi (#19775)', () => {
    expect(videoConstraints('user')).toEqual({ ...captureShape('wifi'), facingMode: 'user' });
  });

  test('la caméra choisie au sélecteur garde la forme du profil courant (#19775)', async () => {
    const { asked, mediaDevices } = recorder();
    await acquireChosenInput({ kind: 'camera', deviceId: 'cam-2', profile: 'wifi', mediaDevices });
    expect(asked[0]?.video).toMatchObject({ width: { ideal: 1280 }, height: { ideal: 720 }, deviceId: { exact: 'cam-2' } });
  });
});

describe('le partage d’écran reste net (#19777)', () => {
  test('l’écran est demandé jusqu’en 1080p à 15 i/s, marqué « détail » pour l’encodeur', async () => {
    const asked: DisplayMediaStreamOptions[] = [];
    const track = { kind: 'video', contentHint: '' };
    const mediaDevices = {
      getDisplayMedia: async (options?: DisplayMediaStreamOptions) => {
        asked.push(options ?? {});
        return { getVideoTracks: () => [track] } as unknown as MediaStream;
      },
    };
    await acquireDisplay({ mediaDevices });
    expect(asked[0]?.video).toEqual({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15, max: 30 } });
    expect(track.contentHint).toBe('detail');
  });
});
