import { describe, expect, test } from 'bun:test';

import { createVideoCodecProbe, PROBED_VIDEO_CODECS, type EncodingInfoQuery, type VideoCodecFamily } from './call-codec-probe';

/**
 * LE CODEC ENCODÉ EN MATÉRIEL (#19777) — `mediaCapabilities.encodingInfo`
 * dit, codec par codec, si l'appareil l'encode sans brûler la batterie. La
 * sonde tourne UNE fois par page, bornée dans le temps : l'établissement d'un
 * appel ne l'attend jamais, il prend ce qu'elle a déjà rendu.
 */

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const answering = (efficient: readonly VideoCodecFamily[], queries: EncodingInfoQuery[] = []) => async (query: EncodingInfoQuery) => {
  queries.push(query);
  const family = PROBED_VIDEO_CODECS.find((probed) => probed.contentType === query.video.contentType)?.family;
  return { supported: true, powerEfficient: family !== undefined && efficient.includes(family) };
};

describe('la sonde des codecs vidéo', () => {
  test('rend les familles que l’appareil encode efficacement, interrogées en webrtc 720p', async () => {
    const queries: EncodingInfoQuery[] = [];
    const probe = createVideoCodecProbe({ encodingInfo: () => answering(['h264-baseline', 'vp9'], queries), delay: () => new Promise(() => undefined) });
    expect(probe.current()).toBeNull();
    probe.prime();
    await flush();
    expect([...(probe.current() ?? [])].sort()).toEqual(['h264-baseline', 'vp9']);
    expect(queries[0]).toMatchObject({ type: 'webrtc', video: { width: 1280, height: 720, bitrate: 2_500_000, framerate: 30 } });
    expect(queries.map((query) => query.video.contentType)).toEqual(PROBED_VIDEO_CODECS.map((probed) => probed.contentType));
  });

  test('une seule sonde par page, même amorcée plusieurs fois', async () => {
    const queries: EncodingInfoQuery[] = [];
    const probe = createVideoCodecProbe({ encodingInfo: () => answering([], queries), delay: () => new Promise(() => undefined) });
    probe.prime();
    probe.prime();
    await flush();
    probe.prime();
    expect(queries).toHaveLength(PROBED_VIDEO_CODECS.length);
  });

  test('un navigateur sans mediaCapabilities rend aussitôt « rien d’efficace » : l’ordre statique tient', () => {
    const probe = createVideoCodecProbe({ encodingInfo: () => null });
    probe.prime();
    expect(probe.current()?.size).toBe(0);
  });

  test('une requête refusée (type webrtc inconnu) ou supportée mais logicielle ne compte pas', async () => {
    const probe = createVideoCodecProbe({
      encodingInfo: () => async (query) => {
        if (query.video.contentType.startsWith('video/VP9')) throw new TypeError('webrtc');
        return { supported: query.video.contentType.startsWith('video/VP8'), powerEfficient: true };
      },
      delay: () => new Promise(() => undefined),
    });
    probe.prime();
    await flush();
    expect([...(probe.current() ?? [])]).toEqual(['vp8']);
  });

  test('une réponse qui ne vient pas est bornée : la sonde conclut sans elle', async () => {
    const elapsed: number[] = [];
    const probe = createVideoCodecProbe({
      encodingInfo: () => async (query) => (query.video.contentType.startsWith('video/VP8') ? new Promise<{ supported: boolean; powerEfficient: boolean }>(() => undefined) : { supported: true, powerEfficient: true }),
      delay: (ms) => {
        elapsed.push(ms);
        return new Promise((resolve) => setTimeout(resolve, 5));
      },
    });
    probe.prime();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(probe.current()?.has('vp8')).toBe(false);
    expect(probe.current()?.has('vp9')).toBe(true);
    expect(elapsed.length).toBeGreaterThan(0);
  });
});
