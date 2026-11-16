/**
 * LE RELEVÉ À LA DEMANDE (#14147) — Sang seulement, une fois toutes les 5 min par paire, et
 * la demande ne dit pas qui la fait.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BATTERY_ERROR_CODES } from '@meeshy/shared/types/battery';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { requestBatteryPull, type BatteryPullDeps } from '../../../../services/battery/batteryPull';
import { ADULT_BIRTH, messagingWorld, table } from '../../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from './batteryWorld';

const EMETTEUR = '6500000000000000000000e1';
const SANG = '6500000000000000000000b1';
const PROCHE = '6500000000000000000000c1';
const SANG_EXCLU = '6500000000000000000000b2';
const T0 = Date.parse('2026-11-15T10:00:00.000Z');

function monde(options: { readonly coupure?: boolean } = {}) {
  const world = messagingWorld({
    links: [[EMETTEUR, SANG, 'BLOOD'], [EMETTEUR, PROCHE, 'CLOSE'], [EMETTEUR, SANG_EXCLU, 'BLOOD']],
    users: [EMETTEUR, SANG, PROCHE, SANG_EXCLU].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      role: 'USER',
      ...(id === EMETTEUR && options.coupure ? { batterySharingDisabledAt: new Date(T0) } : {}),
    })),
  });
  const emissions: Array<{ room: string; event: string; data: unknown }> = [];
  const wakes: Array<[string, string]> = [];
  let now = T0;
  const deps: BatteryPullDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: table([{ ownerId: EMETTEUR, otherId: PROCHE, batteryShared: true }, { ownerId: EMETTEUR, otherId: SANG_EXCLU, batteryShared: false }]) } as unknown as PrismaClient,
    cache: batteryCacheInMemory(),
    io: { to: (room: string) => ({ emit: (event: string, data: unknown) => emissions.push({ room, event, data }) }) } as unknown as BatteryPullDeps['io'],
    now: () => now,
    wake: async (emitterId, at) => {
      wakes.push([emitterId, at]);
    },
  };
  return { deps, emissions, wakes, avancer: (ms: number) => (now += ms) };
}

describe('battery:pull', () => {
  it('un Sang demande : la demande part vers l\'émetteur, sans dire qui, et le réveille en silence', async () => {
    const m = monde();
    const ack = await requestBatteryPull(m.deps, { readerId: SANG, payload: { userId: EMETTEUR } });

    expect(ack).toEqual({ success: true, data: { requestedAt: new Date(T0).toISOString(), episodeOnly: true } });
    expect(m.emissions).toEqual([{ room: ROOMS.user(EMETTEUR), event: SERVER_EVENTS.BATTERY_PULL_REQUESTED, data: { requestedAt: new Date(T0).toISOString() } }]);
    expect(JSON.stringify(m.emissions)).not.toContain(SANG);
    expect(m.wakes).toEqual([[EMETTEUR, new Date(T0).toISOString()]]);
  });

  it('une seconde demande sous 5 min est refusée, puis permise après', async () => {
    const m = monde();
    await requestBatteryPull(m.deps, { readerId: SANG, payload: { userId: EMETTEUR } });
    expect(await requestBatteryPull(m.deps, { readerId: SANG, payload: { userId: EMETTEUR } })).toMatchObject({ code: BATTERY_ERROR_CODES.PULL_TOO_SOON });
  });

  it('un Proche, même consenti, ne peut pas la demander ; ni soi', async () => {
    const m = monde();
    expect(await requestBatteryPull(m.deps, { readerId: PROCHE, payload: { userId: EMETTEUR } })).toMatchObject({ code: BATTERY_ERROR_CODES.PULL_FORBIDDEN });
    expect(await requestBatteryPull(m.deps, { readerId: EMETTEUR, payload: { userId: EMETTEUR } })).toMatchObject({ code: BATTERY_ERROR_CODES.PULL_FORBIDDEN });
    expect(m.emissions).toEqual([]);
  });

  it('une charge illisible est refusée', async () => {
    const m = monde();
    expect(await requestBatteryPull(m.deps, { readerId: SANG, payload: { userId: 'x' } })).toMatchObject({ code: BATTERY_ERROR_CODES.INVALID });
  });

  it('un Sang que l\'émetteur a exclu reçoit la MÊME réponse qu\'un Sang servi : aucun oracle sur le choix de l\'émetteur', async () => {
    const m = monde();
    const servi = await requestBatteryPull(m.deps, { readerId: SANG, payload: { userId: EMETTEUR } });
    const exclu = await requestBatteryPull(m.deps, { readerId: SANG_EXCLU, payload: { userId: EMETTEUR } });
    expect(exclu).toEqual(servi);
    expect(await requestBatteryPull(m.deps, { readerId: SANG_EXCLU, payload: { userId: EMETTEUR } })).toMatchObject({ code: BATTERY_ERROR_CODES.PULL_TOO_SOON });
    expect(m.wakes).toHaveLength(1);
    expect(m.emissions).toHaveLength(1);
  });

  it('la coupure globale de l\'émetteur ne se lit pas non plus : la demande est accusée, rien ne réveille le téléphone', async () => {
    const m = monde({ coupure: true });
    expect(await requestBatteryPull(m.deps, { readerId: SANG, payload: { userId: EMETTEUR } })).toMatchObject({ success: true, data: { episodeOnly: true } });
    expect(m.wakes).toEqual([]);
    expect(m.emissions).toEqual([]);
  });
});
