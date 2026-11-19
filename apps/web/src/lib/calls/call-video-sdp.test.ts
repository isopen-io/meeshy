import { describe, expect, test } from 'bun:test';

import { shapeVideoSdp, videoShapeFor } from './call-video-sdp';

const OFFER = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'm=video 9 UDP/TLS/RTP/SAVPF 102 103 96 97 98',
  'a=rtpmap:102 H264/90000',
  'a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
  'a=rtpmap:103 rtx/90000',
  'a=fmtp:103 apt=102',
  'a=rtpmap:96 VP8/90000',
  'a=rtpmap:97 VP9/90000',
  'a=fmtp:97 profile-id=0',
  'a=rtpmap:98 ulpfec/90000',
  '',
].join('\r\n');

const fmtpOf = (sdp: string, payload: string): string | undefined => sdp.split('\r\n').find((line) => line.startsWith(`a=fmtp:${payload} `));

/**
 * #19775 — LE DÉBIT DE DÉPART. Sans indication, Chrome commence une vidéo
 * vers 300 kb/s et met plusieurs secondes à monter : les premières secondes
 * d'un appel sont floues. La description que J'ENVOIE dit au pair à quel débit
 * démarrer ce qu'il m'envoie, et dans quelles bornes — le réglage d'iOS
 * (`P2PWebRTCClient+SdpRules`, `x-google-max-bitrate=2500;x-google-min-bitrate=100`).
 */
describe('le débit vidéo demandé au pair (#19775)', () => {
  test('chaque codec vidéo démarre au débit du profil, borné entre 100 kb/s et son plafond', () => {
    const shaped = shapeVideoSdp(OFFER, videoShapeFor('wifi'));
    expect(fmtpOf(shaped, '102')).toBe('a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f;x-google-start-bitrate=1500;x-google-min-bitrate=100;x-google-max-bitrate=2500');
    expect(fmtpOf(shaped, '96')).toBe('a=fmtp:96 x-google-start-bitrate=1500;x-google-min-bitrate=100;x-google-max-bitrate=2500');
    expect(fmtpOf(shaped, '97')).toBe('a=fmtp:97 profile-id=0;x-google-start-bitrate=1500;x-google-min-bitrate=100;x-google-max-bitrate=2500');
  });

  test('la retransmission, la correction d’erreurs et l’audio restent intacts', () => {
    const shaped = shapeVideoSdp(OFFER, videoShapeFor('wifi'));
    expect(fmtpOf(shaped, '103')).toBe('a=fmtp:103 apt=102');
    expect(fmtpOf(shaped, '98')).toBeUndefined();
    expect(fmtpOf(shaped, '111')).toBe('a=fmtp:111 minptime=10;useinbandfec=1');
  });

  test('le profil borne ce que le pair m’envoie : moins en cellulaire, moins encore en économie', () => {
    expect(videoShapeFor('cellular')).toEqual({ startKbps: 400, minKbps: 100, maxKbps: 600 });
    expect(videoShapeFor('economy')).toEqual({ startKbps: 200, minKbps: 100, maxKbps: 300 });
  });

  test('une description sans vidéo ressort identique', () => {
    const audioOnly = OFFER.split('\r\n').slice(0, 4).join('\r\n');
    expect(shapeVideoSdp(audioOnly, videoShapeFor('wifi'))).toBe(audioOnly);
  });

  test('un second passage ne duplique rien', () => {
    const once = shapeVideoSdp(OFFER, videoShapeFor('wifi'));
    expect(shapeVideoSdp(once, videoShapeFor('wifi'))).toBe(once);
  });
});
