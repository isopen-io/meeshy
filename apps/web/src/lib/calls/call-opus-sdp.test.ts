import { describe, expect, test } from 'bun:test';

import { shapeOpusSdp } from './call-opus-sdp';

const OFFER = [
  'v=0',
  'o=- 1 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 0',
  'a=rtpmap:111 opus/48000/2',
  'a=rtcp-fb:111 transport-cc',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  'a=fmtp:63 111/111',
  'a=rtpmap:0 PCMU/8000',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'a=rtpmap:96 VP8/90000',
  '',
].join('\r\n');

const fmtpOf = (sdp: string, payload: string): string | undefined => sdp.split('\r\n').find((line) => line.startsWith(`a=fmtp:${payload} `));

describe('le réglage Opus de la description envoyée (#8697)', () => {
  test('la voix est mono, DTX et FEC actifs, débit moyen borné par le profil', () => {
    const shaped = shapeOpusSdp(OFFER, { maxAverageBitrate: 24_000 });
    expect(fmtpOf(shaped, '111')).toBe('a=fmtp:111 minptime=10;useinbandfec=1;maxaveragebitrate=24000;usedtx=1;stereo=0;sprop-stereo=0');
  });

  test('RED, les autres codecs et la vidéo restent intacts : aucune ligne ajoutée ailleurs', () => {
    const shaped = shapeOpusSdp(OFFER, { maxAverageBitrate: 32_000 });
    expect(fmtpOf(shaped, '63')).toBe('a=fmtp:63 111/111');
    expect(shaped.split('\r\n').length).toBe(OFFER.split('\r\n').length);
    expect(shaped.replace(fmtpOf(shaped, '111') ?? '', '')).toBe(OFFER.replace(fmtpOf(OFFER, '111') ?? '', ''));
  });

  test('une valeur déjà posée est remplacée, jamais doublée', () => {
    const once = shapeOpusSdp(OFFER, { maxAverageBitrate: 32_000 });
    const twice = shapeOpusSdp(once, { maxAverageBitrate: 16_000 });
    expect(fmtpOf(twice, '111')).toBe('a=fmtp:111 minptime=10;useinbandfec=1;maxaveragebitrate=16000;usedtx=1;stereo=0;sprop-stereo=0');
  });

  test('en économie, la voix se contente de la bande élargie', () => {
    const shaped = shapeOpusSdp(OFFER, { maxAverageBitrate: 16_000, maxPlaybackRate: 16_000 });
    expect(fmtpOf(shaped, '111')).toContain(';maxplaybackrate=16000');
  });

  test('un Opus sans ligne fmtp en reçoit une, juste sous son rtpmap', () => {
    const bare = OFFER.replace('a=fmtp:111 minptime=10;useinbandfec=1\r\n', '');
    const lines = shapeOpusSdp(bare, { maxAverageBitrate: 24_000 }).split('\r\n');
    const at = lines.indexOf('a=rtpmap:111 opus/48000/2');
    expect(lines[at + 1]).toBe('a=fmtp:111 maxaveragebitrate=24000;usedtx=1;useinbandfec=1;stereo=0;sprop-stereo=0');
  });

  test('une description sans Opus (ou vide) repart telle quelle', () => {
    const noOpus = OFFER.replace('a=rtpmap:111 opus/48000/2', 'a=rtpmap:111 G722/8000');
    expect(shapeOpusSdp(noOpus, { maxAverageBitrate: 24_000 })).toBe(noOpus);
    expect(shapeOpusSdp('', { maxAverageBitrate: 24_000 })).toBe('');
  });

  test('les fins de ligne LF seules sont respectées', () => {
    const lf = OFFER.replaceAll('\r\n', '\n');
    const shaped = shapeOpusSdp(lf, { maxAverageBitrate: 24_000 });
    expect(shaped.includes('\r')).toBe(false);
    expect(shaped).toContain('a=fmtp:111 minptime=10;useinbandfec=1;maxaveragebitrate=24000;usedtx=1;stereo=0;sprop-stereo=0');
  });

  test('seule la section audio est réglée : une section vidéo au même numéro de charge reste intacte', () => {
    const clash = OFFER.replace('m=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000', 'm=video 9 UDP/TLS/RTP/SAVPF 96 111\r\na=rtpmap:96 VP8/90000\r\na=rtpmap:111 rtx/90000\r\na=fmtp:111 apt=96');
    const shaped = shapeOpusSdp(clash, { maxAverageBitrate: 24_000 });
    expect(shaped).toContain('\r\na=fmtp:111 apt=96\r\n');
    expect(fmtpOf(shaped, '111')).toBe('a=fmtp:111 minptime=10;useinbandfec=1;maxaveragebitrate=24000;usedtx=1;stereo=0;sprop-stereo=0');
  });

  test('un Opus sans fmtp en reçoit une même quand une autre section porte une fmtp au même numéro', () => {
    const clash = OFFER.replace('a=fmtp:111 minptime=10;useinbandfec=1\r\n', '').replace('m=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000', 'm=video 9 UDP/TLS/RTP/SAVPF 96 111\r\na=rtpmap:96 VP8/90000\r\na=rtpmap:111 rtx/90000\r\na=fmtp:111 apt=96');
    const lines = shapeOpusSdp(clash, { maxAverageBitrate: 24_000 }).split('\r\n');
    expect(lines[lines.indexOf('a=rtpmap:111 opus/48000/2') + 1]).toBe('a=fmtp:111 maxaveragebitrate=24000;usedtx=1;useinbandfec=1;stereo=0;sprop-stereo=0');
    expect(lines).toContain('a=fmtp:111 apt=96');
  });
});

