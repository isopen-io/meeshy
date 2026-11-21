import { SHARED_LOCATION_ERROR_CODES } from '@meeshy/shared/types/shared-location-constants';
import { describe, expect, test } from 'bun:test';

import { decodeOwnSharedLocation } from '@/lib/api/shared-locations';
import { AMI, AUTRE, HOUR, makeWorld, PARIS, T0 } from '@/test-support/shared-location-sharing-world';

import { readSharedLocationAck, sharedLocationStartPayloadOf } from './shared-location-sending';

/**
 * **UN POINT CHOISI À LA MAIN NE SE REMPLACE PAS EN SILENCE** (#20126, iso
 * `SharedLocationSharingCenter.swift`, #20087). Un autre appareil du compte peut montrer un point
 * choisi sur la carte : la passerelle le dit (`source: 'manual'`). Cet onglet ne suit alors plus la
 * position de l'appareil et n'en envoie aucune ; « Partager » d'ici DEMANDE avant de faire passer
 * tous les destinataires du point à la position réelle, puis l'envoie explicitement
 * (`source: 'device'`). Une source absente (passerelle d'avant) ne change rien.
 */

const iso = (ms: number): string => new Date(ms).toISOString();
const TROISIEME = 'd'.repeat(24);
const servedWith = (source: string | undefined, ...ids: readonly string[]) => ({
  recipients: ids.map((userId) => ({ userId, precision: 'city' as const, expiresAt: iso(T0 + HOUR) })),
  expiresAt: ids.length === 0 ? null : iso(T0 + HOUR),
  ...(source === undefined ? {} : { source: source as 'manual' | 'device' }),
});

const publiant = async (served: ReturnType<typeof servedWith> | null = servedWith(undefined)) => {
  const memory = new Map<string, string>();
  const world = makeWorld({ memory, served });
  await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
  expect(world.source.following).toBe(1);
  return world;
};

describe('le contrat du fil connaît le point choisi', () => {
  test('« remplacer le point » part avec la source de l’appareil, et seulement alors', () => {
    const recipients = [{ userId: AMI, precision: 'city' as const }];
    expect(sharedLocationStartPayloadOf({ recipients, durationMinutes: 60, fix: PARIS, replacesChosenPoint: true })?.source).toBe('device');
    expect(sharedLocationStartPayloadOf({ recipients, durationMinutes: 60, fix: PARIS })?.source).toBeUndefined();
    expect(sharedLocationStartPayloadOf({ recipients, durationMinutes: 60, fix: null, replacesChosenPoint: true })?.source).toBeUndefined();
  });

  test('le refus « point choisi » se lit comme tel, jamais comme un échec générique', () => {
    expect(readSharedLocationAck({ success: false, code: SHARED_LOCATION_ERROR_CODES.FIXED_POINT })).toEqual({ kind: 'refused', outcome: 'fixed-point' });
  });

  test('la relecture lit la source : connue telle quelle, inconnue comme un point choisi, absente rien', () => {
    const row = { userId: AMI, precision: 'city', expiresAt: iso(T0 + HOUR) };
    expect(decodeOwnSharedLocation({ recipients: [row], expiresAt: null, source: 'manual' })?.source).toBe('manual');
    expect(decodeOwnSharedLocation({ recipients: [row], expiresAt: null, source: 'device' })?.source).toBe('device');
    expect(decodeOwnSharedLocation({ recipients: [row], expiresAt: null, source: 'satellite' })?.source).toBe('manual');
    expect(decodeOwnSharedLocation({ recipients: [row], expiresAt: null })?.source).toBeUndefined();
  });
});

describe('un point choisi ailleurs fait taire la position d’ici', () => {
  test('la relecture sert un point choisi : le suivi cesse, et aucun relevé ne part', async () => {
    const world = await publiant();
    const sent = world.updates.length;
    world.server.served = servedWith('manual', AMI);
    await world.center.sync();
    expect(world.source.following).toBe(0);
    world.source.listener?.(PARIS);
    await world.advance(10 * 60_000);
    expect(world.updates.length).toBe(sent);
    expect(world.center.entry(AMI)).not.toBeNull();
  });

  test('rechargé devant un point choisi, l’onglet ne se remet pas à suivre la position', async () => {
    const memory = new Map<string, string>();
    const world = makeWorld({ memory, served: servedWith('manual', AMI) });
    await world.center.sync();
    const reloaded = makeWorld({ memory, served: servedWith('manual', AMI) });
    await reloaded.advance(0);
    expect(reloaded.center.entry(AMI)).not.toBeNull();
    expect(reloaded.source.following).toBe(0);
  });

  test('un relevé refusé parce qu’un point vient d’être choisi coupe le suivi et relit le partage servi', async () => {
    const world = await publiant();
    const reads = world.server.reads;
    world.server.served = servedWith('manual', AMI);
    world.updateQueue.push(async () => ({ kind: 'refused', outcome: 'fixed-point' }));
    world.clock.now += 5 * 60_000;
    world.source.listener?.(PARIS);
    await world.advance(0);
    expect(world.source.following).toBe(0);
    expect(world.server.reads).toBeGreaterThan(reads);
  });

  test('une passerelle d’avant, qui ne dit pas la source, ne change rien : l’onglet qui publie publie', async () => {
    const world = await publiant();
    world.server.served = servedWith(undefined, AMI);
    await world.center.sync();
    expect(world.source.following).toBe(1);
  });

  test('« Arrêter » devant un point choisi republie la liste seule, sans jamais demander ni envoyer la position', async () => {
    const world = makeWorld({ served: servedWith('manual', AMI, AUTRE) });
    await world.center.sync();
    const prompts = world.source.prompts;
    expect(await world.center.stopSharing(AMI)).toBeNull();
    expect(world.starts.at(-1)?.position).toBeUndefined();
    expect(world.source.prompts).toBe(prompts);
    expect(world.source.following).toBe(0);
  });
});

describe('les gardes de l’onglet tiennent sans compter sur la passerelle (audit du lot)', () => {
  test('un relevé encore en vol après la marque ne part pas', async () => {
    const world = await publiant();
    const move = world.source.listener;
    const sent = world.updates.length;
    world.server.served = servedWith('manual', AMI);
    await world.center.sync();
    world.clock.now += 5 * 60_000;
    move?.({ latitude: 45.76, longitude: 4.83 });
    await world.advance(0);
    expect(world.updates.length).toBe(sent);
  });

  test('retirer quelqu’un devant un point choisi ne rallume pas le suivi de l’appareil', async () => {
    const world = makeWorld({ memory: new Map(), served: servedWith(undefined) });
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.server.served = servedWith('manual', AMI, AUTRE);
    await world.center.sync();
    expect(await world.center.stopSharing(AUTRE)).toBeNull();
    expect(world.starts.at(-1)?.position).toBeUndefined();
    expect(world.source.following).toBe(0);
  });

  test('une liste seule refusée devant un point choisi ne se replie jamais sur la position de l’appareil', async () => {
    const world = makeWorld({ memory: new Map(), served: servedWith('manual', AMI, AUTRE) });
    await world.center.sync();
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'invalid' }));
    await world.center.stopSharing(AUTRE);
    expect(world.starts.filter((start) => start.position !== undefined)).toEqual([]);
  });

  test('une passerelle revenue à une version qui ne dit pas la source lève la marque : elle ne sert jamais de point choisi', async () => {
    const world = makeWorld({ served: servedWith('manual', AMI) });
    await world.center.sync();
    world.server.served = servedWith(undefined, AMI);
    await world.center.sync();
    expect(await world.center.share({ userId: TROISIEME, precision: 'city', durationMinutes: 60 })).toBeNull();
    expect(world.starts.at(-1)?.source).toBeUndefined();
  });

  test('un refus « point choisi » à l’envoi rend l’onglet tel qu’il était : reçu, il reste reçu', async () => {
    const world = makeWorld({ served: servedWith(undefined, AMI) });
    await world.center.sync();
    world.server.served = servedWith('manual', AMI);
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'fixed-point' }));
    expect(await world.center.share({ userId: TROISIEME, precision: 'city', durationMinutes: 60 })).toBe('replaces-chosen-point');
    expect(world.memory.get('roster.received')).toBe('1');
  });
});

describe('« Partager » d’ici devant un point choisi demande d’abord', () => {
  const devantUnPoint = async () => {
    const world = makeWorld({ served: servedWith('manual', AMI) });
    await world.center.sync();
    return world;
  };

  test('sans accord, rien ne part : ni relevé demandé, ni démarrage', async () => {
    const world = await devantUnPoint();
    expect(await world.center.share({ userId: TROISIEME, precision: 'city', durationMinutes: 60 })).toBe('replaces-chosen-point');
    expect(world.starts).toEqual([]);
    expect(world.source.prompts).toBe(0);
    expect(world.center.entry(TROISIEME)).toBeNull();
  });

  test('avec accord, la position réelle part explicitement, et cet onglet devient celui qui publie', async () => {
    const world = await devantUnPoint();
    expect(await world.center.share({ userId: TROISIEME, precision: 'city', durationMinutes: 60, replacingPoint: true })).toBeNull();
    expect(world.starts.at(-1)?.source).toBe('device');
    expect(world.starts.at(-1)?.recipients.map((r) => r.userId)).toEqual([AMI, TROISIEME].sort());
    expect(world.source.following).toBe(1);
    expect(await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 })).toBeNull();
  });

  test('un point choisi ailleurs pendant l’envoi : la passerelle refuse, l’onglet relit et demande', async () => {
    const world = await publiant();
    world.server.served = servedWith('manual', AMI);
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'fixed-point' }));
    expect(await world.center.share({ userId: TROISIEME, precision: 'city', durationMinutes: 60 })).toBe('replaces-chosen-point');
    expect(world.source.following).toBe(0);
    expect(world.center.entry(TROISIEME)).toBeNull();
  });

  test('le point remplacé ailleurs par une position réelle : « Partager » ne demande plus', async () => {
    const world = await devantUnPoint();
    world.server.served = servedWith('device', AMI);
    await world.center.sync();
    expect(await world.center.share({ userId: TROISIEME, precision: 'city', durationMinutes: 60 })).toBeNull();
    expect(world.starts.at(-1)?.source).toBeUndefined();
  });
});
