/**
 * « PARTAGER AUSSI MA BATTERIE — PENDANT LE PARTAGE SEULEMENT » (#19204). Le canal batterie existant
 * sert, le temps d'un partage de position, les destinataires que l'émetteur a choisis : l'accord
 * vient du partage (`sharedBatteryGrants`), la LOI reste celle de la batterie (`device.battery`,
 * dès Proche, sans blocage, comptes utilisables) et la coupure globale ferme tout. Aucune seconde
 * table : le relais, ses épisodes et ses réglages sont ceux de la batterie.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  batterySnapshotFor,
  batteryStateFor,
  refreshBatteryBetween,
  reportBattery,
  type BatteryReaderContext,
  type BatteryRelayDeps,
} from '../../../../services/battery/batteryRelay';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink } from '../../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from './batteryWorld';

const EMETTEUR = '6900000000000000000000e1';
const PROCHE = '6900000000000000000000c1';
const SANG_REFUSE = '6900000000000000000000b2';
const AMI = '6900000000000000000000f1';
const BLOQUEUR = '6900000000000000000000d1';
const T0 = Date.parse('2026-11-17T10:00:00.000Z');

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

const LIENS: readonly CircleLink[] = [
  [EMETTEUR, PROCHE, 'CLOSE'],
  [EMETTEUR, SANG_REFUSE, 'BLOOD'],
  [EMETTEUR, AMI, 'FRIEND'],
  [EMETTEUR, BLOQUEUR, 'CLOSE'],
];

function monde(options: { readonly accordes?: readonly string[]; readonly coupure?: boolean; readonly fantome?: boolean } = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [EMETTEUR, PROCHE, SANG_REFUSE, AMI, BLOQUEUR].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      ...(id === BLOQUEUR ? { blockedUserIds: [EMETTEUR] } : {}),
      ...(id === EMETTEUR && options.coupure ? { batterySharingDisabledAt: new Date(T0) } : {}),
      ...(id === EMETTEUR && options.fantome ? { locationGhostAt: new Date(T0) } : {}),
    })),
  });
  const settings = table([{ ownerId: EMETTEUR, otherId: SANG_REFUSE, batteryShared: false }]);
  const emissions: Emission[] = [];
  const grants = { readers: new Set(options.accordes ?? []) };
  const deps: BatteryRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient,
    cache: batteryCacheInMemory(),
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as BatteryRelayDeps['io'],
    now: () => T0,
    context: async ({ readerIds }) => new Map<string, BatteryReaderContext>(readerIds.map((id) => [id, { roomOpen: false, lastExchangeAt: null, awaitingReply: false }])),
    push: async () => true,
    isTrackedDevice: async () => true,
    sharedBatteryGrants: async (emitterIds) => new Map(emitterIds.filter((id) => id === EMETTEUR).map((id) => [id, new Set(grants.readers)])),
  };
  const releve = (level: number) =>
    reportBattery(deps, { emitterId: EMETTEUR, sessionId: 's1', payload: { level, charging: false, lowPower: false, measuredAt: new Date(T0).toISOString() } });
  return { deps, grants, emissions, releve, vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)) };
}

describe('la batterie accompagne le partage de position (#19204)', () => {
  it('un Proche sans accord durable reçoit l\'épisode tant que le partage le lui accorde', async () => {
    const m = monde({ accordes: [PROCHE] });

    await m.releve(18);

    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.BATTERY_CHANGED]);
    expect(await batteryStateFor(m.deps, { readerId: PROCHE, emitterId: EMETTEUR })).toMatchObject({ userId: EMETTEUR, level: 18 });
    expect((await batterySnapshotFor(m.deps, PROCHE)).items.map((s) => s.userId)).toEqual([EMETTEUR]);
  });

  it('sans le partage, le même Proche ne reçoit rien — l\'ancien comportement est inchangé', async () => {
    const m = monde();

    await m.releve(18);

    expect(m.vers(PROCHE)).toEqual([]);
    expect(await batteryStateFor(m.deps, { readerId: PROCHE, emitterId: EMETTEUR })).toBeNull();
  });

  it('le geste explicite du partage l\'emporte, le temps du partage, sur un retrait par personne', async () => {
    const m = monde({ accordes: [SANG_REFUSE] });

    await m.releve(18);

    expect(m.vers(SANG_REFUSE).map((e) => e.event)).toEqual([SERVER_EVENTS.BATTERY_CHANGED]);
  });

  it('la loi reste le plafond : un Ami et un bloqueur ne reçoivent rien, même accordés', async () => {
    const m = monde({ accordes: [AMI, BLOQUEUR] });

    await m.releve(18);

    expect(m.vers(AMI)).toEqual([]);
    expect(m.vers(BLOQUEUR)).toEqual([]);
    expect(await batteryStateFor(m.deps, { readerId: AMI, emitterId: EMETTEUR })).toBeNull();
  });

  it('la coupure globale ferme tout, partage ou non', async () => {
    const m = monde({ accordes: [PROCHE], coupure: true });

    await m.releve(18);

    expect(m.vers(PROCHE)).toEqual([]);
  });

  it('l\'émetteur en fantôme met le partage en pause, et sa batterie avec lui', async () => {
    const m = monde({ accordes: [PROCHE], fantome: true });

    await m.releve(18);

    expect(m.vers(PROCHE)).toEqual([]);
  });

  it('le partage fini, le rafraîchissement efface chez qui voyait', async () => {
    const m = monde({ accordes: [PROCHE] });
    await m.releve(18);
    m.emissions.length = 0;

    m.grants.readers.clear();
    await refreshBatteryBetween(m.deps, { userA: EMETTEUR, userB: PROCHE });

    expect(m.vers(PROCHE)).toEqual([{ room: ROOMS.user(PROCHE), event: SERVER_EVENTS.BATTERY_CLEARED, data: { userId: EMETTEUR } }]);
  });

  it('le partage qui commence sert l\'épisode en cours au rafraîchissement', async () => {
    const m = monde();
    await m.releve(18);

    m.grants.readers.add(PROCHE);
    await refreshBatteryBetween(m.deps, { userA: EMETTEUR, userB: PROCHE });

    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.BATTERY_CHANGED]);
  });
});
