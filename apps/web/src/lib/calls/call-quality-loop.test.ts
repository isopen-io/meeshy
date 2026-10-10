import { describe, expect, test } from 'bun:test';

import { profiledEncoding } from './call-data-profile';
import { TIER_ENCODING } from './call-quality';
import type { DataProfile } from './call-data-profile';
import { qualityReport } from './call-analytics';
import { createQualityLoop } from './call-quality-loop';
import { FREEZE_AFTER_MS, RESUME_AFTER_MS, SUSPEND_AFTER_MS } from './call-survival';

type Encoding = Readonly<Record<string, unknown>>;

type FakeSender = { readonly kind: 'audio' | 'video'; encodings: readonly Encoding[]; readonly sets: Encoding[][]; preference: unknown };

function fakeConnection(network: { loss: number; rtt: number; relay?: boolean; refusePreference?: boolean }) {
  const senders: Record<'audio' | 'video', FakeSender> = {
    audio: { kind: 'audio', encodings: [{ active: true }], sets: [], preference: undefined },
    video: { kind: 'video', encodings: [{ active: true, rid: 'f' }], sets: [], preference: undefined },
  };
  let received = 0;
  let lost = 0;
  const sender = (fake: FakeSender) => ({
    getParameters: () => ({ transactionId: 't', encodings: fake.encodings }),
    setParameters: async (parameters: { readonly encodings: readonly Encoding[]; readonly degradationPreference?: unknown }) => {
      if (network.refusePreference === true && parameters.degradationPreference !== undefined) throw Object.assign(new Error('unsupported'), { name: 'InvalidModificationError' });
      fake.encodings = parameters.encodings;
      fake.preference = parameters.degradationPreference;
      fake.sets.push([...parameters.encodings]);
    },
  });
  const connection = {
    getTransceivers: () => (['audio', 'video'] as const).map((kind) => ({ receiver: { track: { kind } }, sender: sender(senders[kind]) })),
    getStats: async () => {
      received += 100;
      lost += Math.round((100 * network.loss) / (100 - network.loss));
      const entries = [
        { type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: network.rtt / 1000, localCandidateId: 'l1' },
        { type: 'local-candidate', id: 'l1', candidateType: network.relay === true ? 'relay' : 'srflx' },
        { type: 'inbound-rtp', kind: 'audio', packetsReceived: received, packetsLost: lost, bytesReceived: received * 100, jitter: 0.01 },
        { type: 'outbound-rtp', kind: 'video', bytesSent: 10, codecId: 'v' },
        { type: 'codec', id: 'v', mimeType: 'video/VP8' },
      ];
      return { forEach: (fn: (entry: Encoding) => void) => entries.forEach(fn) };
    },
  };
  return { connection: connection as unknown as RTCPeerConnection, senders };
}

function harness(options: { readonly wantsVideo?: () => boolean; readonly profile?: () => DataProfile } = {}) {
  let now = 0;
  const peers = new Map<string, ReturnType<typeof fakeConnection>>();
  const networks = new Map<string, { loss: number; rtt: number; relay?: boolean; refusePreference?: boolean }>();
  const add = (userId: string, refusePreference = false) => {
    const network: { loss: number; rtt: number; relay?: boolean; refusePreference?: boolean } = { loss: 0, rtt: 40, refusePreference };
    networks.set(userId, network);
    peers.set(userId, fakeConnection(network));
  };
  const loop = createQualityLoop({
    links: () => [...peers.entries()].map(([userId, peer]) => [userId, peer.connection] as const),
    wantsVideo: options.wantsVideo ?? (() => true),
    now: () => now,
    ...(options.profile === undefined ? {} : { profile: options.profile }),
  });
  const advance = async (ms: number) => {
    const ticks = [];
    for (let elapsed = 0; elapsed < ms; elapsed += 2_000) {
      now += 2_000;
      ticks.push(await loop.tick());
    }
    return ticks;
  };
  return { add, peers, networks, loop, advance, remove: (userId: string) => peers.delete(userId) };
}

const lastVideo = (peer: ReturnType<typeof fakeConnection>) => peer.senders.video.encodings[0];

describe('la boucle de qualité d’un appel (#8047)', () => {
  test('chaque pair reçoit le palier de SON lien, sans toucher aux autres', async () => {
    const h = harness();
    h.add('a');
    h.add('b');
    const bNet = h.networks.get('b');
    if (bNet !== undefined) bNet.rtt = 350;
    await h.advance(4_000);
    expect(lastVideo(h.peers.get('a') as ReturnType<typeof fakeConnection>)).toEqual({ rid: 'f', ...TIER_ENCODING.high });
    expect(lastVideo(h.peers.get('b') as ReturnType<typeof fakeConnection>)).toEqual({ rid: 'f', ...TIER_ENCODING.medium });
  });

  test('un palier inchangé n’est pas réappliqué à chaque relevé', async () => {
    const h = harness();
    h.add('a');
    await h.advance(20_000);
    expect(h.peers.get('a')?.senders.video.sets.length).toBe(1);
  });

  test('l’audio passe en priorité haute sur chaque lien', async () => {
    const h = harness();
    h.add('a');
    await h.advance(2_000);
    expect(h.peers.get('a')?.senders.audio.encodings[0]).toMatchObject({ priority: 'high', networkPriority: 'high' });
  });

  test('un réseau très dégradé gèle, puis SUSPEND la vidéo ; l’audio n’est jamais désactivé ; le retour du réseau la rend', async () => {
    const h = harness();
    h.add('a');
    const peer = h.peers.get('a') as ReturnType<typeof fakeConnection>;
    const network = h.networks.get('a') as { loss: number; rtt: number };
    await h.advance(2_000);
    network.loss = 20;
    network.rtt = 600;
    const frozen = await h.advance(FREEZE_AFTER_MS + 2_000);
    expect(frozen.at(-1)?.stage).toBe('frozen');
    expect(lastVideo(peer)).toMatchObject({ active: true, maxFramerate: 2 });
    const suspended = await h.advance(SUSPEND_AFTER_MS);
    expect(suspended.at(-1)?.stage).toBe('suspended');
    expect(lastVideo(peer)).toMatchObject({ active: false });
    network.loss = 0;
    network.rtt = 40;
    const resumed = await h.advance(RESUME_AFTER_MS + 2_000);
    expect(resumed.at(-1)?.stage).toBe('sending');
    expect(lastVideo(peer)).toMatchObject({ active: true, maxFramerate: 30 });
    expect(peer.senders.audio.sets.every((encodings) => encodings.every((encoding) => encoding.active !== false))).toBe(true);
  });

  test('caméra coupée pendant la suspension : l’encodage est rendu neutre, la caméra rallumée émet', async () => {
    let wants = true;
    const h = harness({ wantsVideo: () => wants });
    h.add('a');
    const network = h.networks.get('a') as { loss: number; rtt: number };
    network.loss = 30;
    await h.advance(FREEZE_AFTER_MS + SUSPEND_AFTER_MS + 2_000);
    expect(lastVideo(h.peers.get('a') as ReturnType<typeof fakeConnection>)).toMatchObject({ active: false });
    wants = false;
    const [tick] = await h.advance(2_000);
    expect(tick?.stage).toBe('sending');
    expect(lastVideo(h.peers.get('a') as ReturnType<typeof fakeConnection>)).toMatchObject({ active: true });
  });

  test('un relevé lent n’en chevauche pas un autre : le second rend null, la survie n’avance qu’une fois', async () => {
    const h = harness();
    h.add('a');
    const [first, second] = await Promise.all([h.loop.tick(), h.loop.tick()]);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await h.loop.tick()).not.toBeNull();
  });

  test('le relevé rend le total, le niveau et le codec ; sans lien, rien', async () => {
    const h = harness();
    expect(await h.loop.tick()).toBeNull();
    h.add('a');
    const [tick] = await h.advance(2_000);
    expect(tick?.total.level).toBe('excellent');
    expect(tick?.codec).toBe('VP8');
  });

  test('le rapport `call:quality-report` suit le schéma de la passerelle (horodatage ISO, débits par nature)', () => {
    const report = qualityReport('c1', { level: 'fair', packetLoss: 4.2, rtt: 312.4, jitter: 20, audioKbps: 30, videoKbps: 400, bytesSent: 10, bytesReceived: 20 }, 0);
    expect(report).toEqual({ callId: 'c1', stats: { level: 'fair', packetLoss: 4.2, rtt: 312, jitter: 20, bitrate: { audio: 30, video: 400 }, bytesSent: 10, bytesReceived: 20, timestamp: '1970-01-01T00:00:00.000Z' } });
  });

  test('le profil de données plafonne la vidéo et dit sa préférence de dégradation (#8697)', async () => {
    const h = harness({ profile: () => 'cellular' });
    h.add('a');
    const [tick] = await h.advance(2_000);
    const peer = h.peers.get('a') as ReturnType<typeof fakeConnection>;
    expect(lastVideo(peer)).toEqual({ rid: 'f', ...profiledEncoding(TIER_ENCODING.high, 'cellular') });
    expect(peer.senders.video.preference).toBe('balanced');
    expect(tick?.profile).toBe('cellular');
  });

  test('l’audio est borné par le profil, descend à 16 kb/s sur un lien mauvais et remonte avec lui (#8697)', async () => {
    const h = harness({ profile: () => 'cellular' });
    h.add('a');
    const peer = h.peers.get('a') as ReturnType<typeof fakeConnection>;
    const network = h.networks.get('a') as { loss: number; rtt: number };
    const [first] = await h.advance(2_000);
    expect(peer.senders.audio.encodings[0]).toMatchObject({ priority: 'high', maxBitrate: 24_000 });
    expect(first?.audioBitrate).toBe(24_000);
    network.loss = 20;
    await h.advance(2_000);
    expect(peer.senders.audio.encodings[0]).toMatchObject({ priority: 'high', maxBitrate: 16_000 });
    network.loss = 0;
    await h.advance(2_000);
    expect(peer.senders.audio.encodings[0]).toMatchObject({ maxBitrate: 24_000 });
    const sets = peer.senders.audio.sets.length;
    await h.advance(6_000);
    expect(peer.senders.audio.sets.length).toBe(sets);
  });

  test('un profil qui change en cours d’appel réapplique la vidéo sans attendre un changement de palier (#8697)', async () => {
    let profile: DataProfile = 'wifi';
    const h = harness({ profile: () => profile });
    h.add('a');
    await h.advance(2_000);
    profile = 'economy';
    await h.advance(2_000);
    const peer = h.peers.get('a') as ReturnType<typeof fakeConnection>;
    expect(lastVideo(peer)).toEqual({ rid: 'f', ...profiledEncoding(TIER_ENCODING.high, 'economy') });
    expect(peer.senders.video.preference).toBe('maintain-framerate');
    expect(peer.senders.audio.encodings[0]).toMatchObject({ maxBitrate: 16_000 });
  });

  test('le relevé dit si le média passe par un relais (#8698)', async () => {
    const h = harness();
    h.add('a');
    const [direct] = await h.advance(2_000);
    expect(direct?.path).toBe('direct');
    (h.networks.get('a') as { relay?: boolean }).relay = true;
    const [relayed] = await h.advance(2_000);
    expect(relayed?.path).toBe('relay');
    expect(relayed?.profile).toBe('wifi');
  });

  test('un navigateur qui refuse la préférence de dégradation reçoit quand même le plafond du profil, une seule fois (#8697)', async () => {
    const h = harness({ profile: () => 'cellular' });
    h.add('a', true);
    await h.advance(2_000);
    const peer = h.peers.get('a') as ReturnType<typeof fakeConnection>;
    expect(lastVideo(peer)).toEqual({ rid: 'f', ...profiledEncoding(TIER_ENCODING.high, 'cellular') });
    const sets = peer.senders.video.sets.length;
    await h.advance(6_000);
    expect(peer.senders.video.sets.length).toBe(sets);
  });
});
