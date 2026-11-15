/**
 * LE RELAIS DE LA BATTERIE (#14147) — chaque lecteur reçoit SA projection dans `user:<id>`,
 * par SON canal : la SyncPill en conversation, un push hors conversation pour le critique et
 * la suite de l'épisode, rien quand la loi refuse — pas même un effacement.
 *
 * Le monde évalue chaque clause reçue (`messagingWorld`) ; seuls le contexte « en
 * conversation » et le push sont injectés.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BATTERY_ERROR_CODES } from '@meeshy/shared/types/battery';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  batterySnapshotFor,
  batteryStateFor,
  captureBatteryAccess,
  captureBatteryAudience,
  refreshBatteryAudience,
  refreshBatteryBetween,
  reportBattery,
  sweepBatteryOff,
  markBatteryAlive,
  type BatteryPush,
  type BatteryReaderContext,
  type BatteryRelayDeps,
} from '../../../../services/battery/batteryRelay';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink, type Row } from '../../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from './batteryWorld';

const EMETTEUR = '6400000000000000000000e1';
const SANG = '6400000000000000000000b1';
const SANG_REFUSE = '6400000000000000000000b2';
const PROCHE = '6400000000000000000000c1';
const PROCHE_CONSENTI = '6400000000000000000000c2';
const AMI = '6400000000000000000000f1';
const BLOQUEUR = '6400000000000000000000d1';
const DESACTIVE = '6400000000000000000000d2';
const ANALYSTE = '6400000000000000000000a1';
const ADMIN = '6400000000000000000000a2';

const T0 = Date.parse('2026-11-15T10:00:00.000Z');
const MIN = 60_000;

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

const LIENS: readonly CircleLink[] = [
  [EMETTEUR, SANG, 'BLOOD'],
  [EMETTEUR, SANG_REFUSE, 'BLOOD'],
  [EMETTEUR, PROCHE, 'CLOSE'],
  [EMETTEUR, PROCHE_CONSENTI, 'CLOSE'],
  [EMETTEUR, AMI, 'FRIEND'],
  [EMETTEUR, BLOQUEUR, 'BLOOD'],
  [EMETTEUR, DESACTIVE, 'BLOOD'],
];

function monde(options: { readonly settings?: readonly Row[]; readonly enConversation?: readonly string[]; readonly suivi?: boolean } = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [EMETTEUR, SANG, SANG_REFUSE, PROCHE, PROCHE_CONSENTI, AMI, BLOQUEUR, DESACTIVE, ANALYSTE, ADMIN].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      role: id === ANALYSTE ? 'ANALYST' : id === ADMIN ? 'ADMIN' : 'USER',
      ...(id === BLOQUEUR ? { blockedUserIds: [EMETTEUR] } : {}),
      ...(id === DESACTIVE ? { deactivatedAt: new Date('2026-11-01T00:00:00.000Z') } : {}),
    })),
  });
  const settings = table([
    { ownerId: EMETTEUR, otherId: PROCHE_CONSENTI, batteryShared: true },
    { ownerId: EMETTEUR, otherId: SANG_REFUSE, batteryShared: false },
    { ownerId: EMETTEUR, otherId: AMI, batteryShared: true },
    ...(options.settings ?? []),
  ]);
  const emissions: Emission[] = [];
  const pushes: BatteryPush[] = [];
  const conversing = new Set(options.enConversation ?? []);
  let now = T0;
  const deps: BatteryRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient,
    cache: batteryCacheInMemory(),
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as BatteryRelayDeps['io'],
    now: () => now,
    context: async ({ readerIds }) =>
      new Map<string, BatteryReaderContext>(readerIds.map((id) => [id, { roomOpen: conversing.has(id), lastExchangeAt: null, awaitingReply: false }])),
    push: async (push) => {
      pushes.push(push);
      return true;
    },
    isTrackedDevice: async () => options.suivi ?? true,
  };
  const releve = (level: number, extra: Record<string, unknown> = {}) =>
    reportBattery(deps, { emitterId: EMETTEUR, sessionId: 's1', payload: { level, charging: false, lowPower: false, measuredAt: new Date(now).toISOString(), ...extra } });
  return {
    deps,
    settings,
    world,
    emissions,
    pushes,
    conversing,
    releve,
    avancer: (ms: number) => {
      now += ms;
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
    annonces: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId) && e.data.announcement).map((e) => (e.data.announcement as { kind: string }).kind),
    pousses: (userId: string) => pushes.filter((p) => p.readerId === userId).map((p) => p.announcement.kind),
  };
}

describe('la loi — rien ne part vers qui n\'y a pas droit, pas même un effacement', () => {
  it('Ami rien ; Proche sans consentement rien ; Proche consenti oui ; Sang sans réglage oui ; Sang refusé rien', async () => {
    const m = monde({ enConversation: [SANG, PROCHE_CONSENTI, AMI, PROCHE, SANG_REFUSE] });
    await m.releve(28);

    expect(m.annonces(SANG)).toEqual(['low']);
    expect(m.annonces(PROCHE_CONSENTI)).toEqual(['low']);
    expect(m.vers(AMI)).toEqual([]);
    expect(m.vers(PROCHE)).toEqual([]);
    expect(m.vers(SANG_REFUSE)).toEqual([]);
  });

  it('bloqué et désactivé : rien, à aucun palier', async () => {
    const m = monde({ enConversation: [BLOQUEUR, DESACTIVE] });
    await m.releve(28);
    m.avancer(MIN);
    await m.releve(4);

    expect(m.vers(BLOQUEUR)).toEqual([]);
    expect(m.vers(DESACTIVE)).toEqual([]);
    expect(m.pousses(BLOQUEUR)).toEqual([]);
    expect(m.pousses(DESACTIVE)).toEqual([]);
  });

  it('la charge servie porte l\'état complet du lecteur, sans rien d\'autre', async () => {
    const m = monde({ enConversation: [SANG] });
    await m.releve(28, { lowPower: true, deviceLabel: 'iPhone de Awa' });

    expect(m.vers(SANG)).toEqual([{
      room: ROOMS.user(SANG),
      event: SERVER_EVENTS.BATTERY_CHANGED,
      data: {
        userId: EMETTEUR,
        state: { userId: EMETTEUR, phase: 'low', level: 28, charging: false, lowPower: true, measuredAt: new Date(T0).toISOString(), deviceLabel: 'iPhone de Awa' },
        announcement: { kind: 'low', level: 28, at: new Date(T0).toISOString() },
      },
    }]);
  });
});

describe('le contexte décide', () => {
  it('hors conversation à 30 % : l\'état en silence, aucune annonce, aucun push', async () => {
    const m = monde();
    await m.releve(30);

    expect(m.vers(SANG)).toHaveLength(1);
    expect(m.annonces(SANG)).toEqual([]);
    expect(m.pushes).toEqual([]);
  });

  it('hors conversation à 5 % : un push critique, et l\'état en silence par socket', async () => {
    const m = monde();
    await m.releve(28);
    m.avancer(MIN);
    await m.releve(5);

    expect(m.pousses(SANG)).toEqual(['critical']);
    expect(m.annonces(SANG)).toEqual([]);
    expect(m.vers(SANG).at(-1)?.data.state).toMatchObject({ phase: 'critical', level: 5 });
  });

  it('en conversation : tout part par la SyncPill, rien par push', async () => {
    const m = monde({ enConversation: [SANG] });
    await m.releve(28);
    m.avancer(MIN);
    await m.releve(20);
    m.avancer(MIN);
    await m.releve(5);

    expect(m.annonces(SANG)).toEqual(['low', 'threshold', 'critical']);
    expect(m.pousses(SANG)).toEqual([]);
  });

  it('la suite après le push critique est toujours servie : extinction, retour, charge', async () => {
    const m = monde();
    await m.releve(5);
    m.avancer(11 * MIN);
    expect(await sweepBatteryOff(m.deps)).toBe(1);
    m.avancer(MIN);
    await m.releve(6, { charging: true });

    expect(m.pousses(SANG)).toEqual(['critical', 'probably-off', 'back-on', 'charging']);
  });

  it('qui n\'a pas reçu le push critique ne reçoit pas la charge par push', async () => {
    const m = monde({ settings: [{ ownerId: PROCHE_CONSENTI, otherId: EMETTEUR, batteryReceive: 'pill' }] });
    await m.releve(5);
    m.avancer(MIN);
    await m.releve(5, { charging: true });

    expect(m.pousses(SANG)).toEqual(['critical', 'charging']);
    expect(m.pousses(PROCHE_CONSENTI)).toEqual([]);
    expect(m.annonces(PROCHE_CONSENTI)).toEqual(['critical']);
  });

  it('« critique seulement » : le push du critique, puis la SyncPill pour le reste', async () => {
    const m = monde({ settings: [{ ownerId: SANG, otherId: EMETTEUR, batteryReceive: 'critical' }] });
    await m.releve(5);
    m.avancer(11 * MIN);
    await sweepBatteryOff(m.deps);

    expect(m.pousses(SANG)).toEqual(['critical']);
    expect(m.annonces(SANG)).toEqual(['probably-off']);
  });

  it('un épisode qui se clôt efface l\'icône chez qui la voyait', async () => {
    const m = monde({ enConversation: [SANG] });
    await m.releve(28);
    m.avancer(MIN);
    await m.releve(40);

    expect(m.vers(SANG).at(-1)).toMatchObject({ event: SERVER_EVENTS.BATTERY_CLEARED, data: { userId: EMETTEUR, announcement: { kind: 'ended' } } });
    expect(m.vers(AMI)).toEqual([]);
  });

  it('le balayage est idempotent, et une connexion repousse l\'extinction', async () => {
    const m = monde();
    await m.releve(5);
    m.avancer(9 * MIN);
    await markBatteryAlive(m.deps, EMETTEUR);
    m.avancer(2 * MIN);
    expect(await sweepBatteryOff(m.deps)).toBe(0);
    m.avancer(9 * MIN);
    expect(await sweepBatteryOff(m.deps)).toBe(1);
    expect(await sweepBatteryOff(m.deps)).toBe(0);
    expect(m.pousses(SANG)).toEqual(['critical', 'probably-off']);
  });
});

describe('l\'équipe (#16623) — comme entre Sangs', () => {
  it('ANALYST émet, ADMIN reçoit sans aucun lien', async () => {
    const m = monde();
    await reportBattery(m.deps, { emitterId: ANALYSTE, sessionId: 's1', payload: { level: 5, charging: false, lowPower: false, measuredAt: new Date(T0).toISOString() } });

    expect(m.pushes.map((p) => [p.readerId, p.announcement.kind])).toEqual([[ADMIN, 'critical']]);
  });
});

describe('le relevé lui-même', () => {
  it('un appareil qui n\'est pas le téléphone suivi est ignoré, sans erreur', async () => {
    const m = monde({ suivi: false });
    expect(await m.releve(5)).toEqual({ success: true, data: { tracked: false } });
    expect(m.emissions).toEqual([]);
  });

  it('une charge hors contrat est refusée', async () => {
    const m = monde();
    expect(await reportBattery(m.deps, { emitterId: EMETTEUR, sessionId: 's1', payload: { level: 101, charging: false, lowPower: false, measuredAt: 'x' } }))
      .toMatchObject({ success: false, code: BATTERY_ERROR_CODES.INVALID });
  });

  it('la pente donne une estimation des minutes restantes', async () => {
    const m = monde({ enConversation: [SANG] });
    await m.releve(30);
    m.avancer(20 * MIN);
    await m.releve(20);

    expect(m.vers(SANG).at(-1)?.data.state).toMatchObject({ level: 20, estimatedMinutes: 40 });
  });
});

describe('le rattrapage et le rafraîchissement quand le lien change', () => {
  it('le rattrapage sert l\'épisode à qui y a droit, et à lui seul', async () => {
    const m = monde();
    await m.releve(20);

    expect((await batterySnapshotFor(m.deps, SANG)).items.map((s) => s.userId)).toEqual([EMETTEUR]);
    expect((await batterySnapshotFor(m.deps, AMI)).items).toEqual([]);
    expect(await batteryStateFor(m.deps, { readerId: PROCHE, emitterId: EMETTEUR })).toBeNull();
    expect(await batteryStateFor(m.deps, { readerId: PROCHE_CONSENTI, emitterId: EMETTEUR })).toMatchObject({ level: 20 });
  });

  it('un retrait efface chez qui voyait ; un accord fait remonter l\'état ; rien vers qui ne voyait rien', async () => {
    const m = monde();
    await m.releve(20);
    m.emissions.length = 0;

    const avant = await captureBatteryAccess(m.deps, { userA: EMETTEUR, userB: SANG });
    m.settings.rows.push({ ownerId: EMETTEUR, otherId: SANG, batteryShared: false });
    await refreshBatteryBetween(m.deps, { userA: EMETTEUR, userB: SANG, before: avant });
    expect(m.vers(SANG)).toEqual([{ room: ROOMS.user(SANG), event: SERVER_EVENTS.BATTERY_CLEARED, data: { userId: EMETTEUR } }]);

    const avantProche = await captureBatteryAccess(m.deps, { userA: EMETTEUR, userB: PROCHE });
    await refreshBatteryBetween(m.deps, { userA: EMETTEUR, userB: PROCHE, before: avantProche });
    expect(m.vers(PROCHE)).toEqual([]);

    m.settings.rows.push({ ownerId: EMETTEUR, otherId: PROCHE, batteryShared: true });
    await refreshBatteryBetween(m.deps, { userA: EMETTEUR, userB: PROCHE, before: avantProche });
    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.BATTERY_CHANGED]);
  });
});

describe('la coupure globale de l\'émetteur', () => {
  it('efface chez chaque lecteur qui voyait, et seulement chez lui ; la reprise fait remonter l\'état', async () => {
    const m = monde();
    await m.releve(20);
    m.emissions.length = 0;
    const users = (m.world.prisma as unknown as { user: { rows: Row[] } }).user.rows;
    const emetteur = users.find((row) => row.id === EMETTEUR)!;

    const avant = await captureBatteryAudience(m.deps, EMETTEUR);
    emetteur.batterySharingDisabledAt = new Date(T0);
    await refreshBatteryAudience(m.deps, { emitterId: EMETTEUR, before: avant });
    expect(m.emissions.map((e) => [e.room, e.event]).sort()).toEqual(
      [SANG, PROCHE_CONSENTI].map((id) => [ROOMS.user(id), SERVER_EVENTS.BATTERY_CLEARED]).sort(),
    );

    m.emissions.length = 0;
    const coupe = await captureBatteryAudience(m.deps, EMETTEUR);
    emetteur.batterySharingDisabledAt = null;
    await refreshBatteryAudience(m.deps, { emitterId: EMETTEUR, before: coupe });
    expect(m.emissions.map((e) => [e.room, e.event]).sort()).toEqual(
      [SANG, PROCHE_CONSENTI].map((id) => [ROOMS.user(id), SERVER_EVENTS.BATTERY_CHANGED]).sort(),
    );
  });
});
