/**
 * LE TÉLÉPHONE INJOIGNABLE (#18737) — deux sondes silencieuses sans réponse rendent le téléphone
 * injoignable depuis son dernier signe de vie ; chaque lecteur autorisé reçoit SA projection dans
 * `user:<id>`, par SON canal : SyncPill en conversation, push hors conversation, rien quand la loi
 * refuse — pas même un effacement.
 *
 * Le monde évalue chaque clause reçue (`messagingWorld`) ; le contexte, la sonde et le push sont injectés.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  capturePhoneReachabilityAccess,
  forgetPhoneReachabilityOf,
  notePhoneAlive,
  phoneReachabilitySnapshotFor,
  phoneReachabilityStateFor,
  refreshPhoneReachabilityAudience,
  refreshPhoneReachabilityBetween,
  sweepPhoneReachability,
  type PhoneReachabilityPush,
  type PhoneReachabilityRelayDeps,
} from '../../../../services/phoneReachability/phoneReachabilityRelay';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink, type Row } from '../../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from '../battery/batteryWorld';

const EMETTEUR = '6400000000000000000000e1';
const SANG = '6400000000000000000000b1';
const SANG_REFUSE = '6400000000000000000000b2';
const PROCHE = '6400000000000000000000c1';
const PROCHE_CONSENTI = '6400000000000000000000c2';
const AMI = '6400000000000000000000f1';
const BLOQUEUR = '6400000000000000000000d1';
const ANALYSTE = '6400000000000000000000a1';
const MODERATEUR = '6400000000000000000000a3';
const ADMIN = '6400000000000000000000a2';

const T0 = Date.parse('2026-11-15T14:10:00.000Z');
const MIN = 60_000;

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

const LIENS: readonly CircleLink[] = [
  [EMETTEUR, SANG, 'BLOOD'],
  [EMETTEUR, SANG_REFUSE, 'BLOOD'],
  [EMETTEUR, PROCHE, 'CLOSE'],
  [EMETTEUR, PROCHE_CONSENTI, 'CLOSE'],
  [EMETTEUR, AMI, 'FRIEND'],
  [EMETTEUR, BLOQUEUR, 'BLOOD'],
];

const ROLE: Readonly<Record<string, string>> = { [ANALYSTE]: 'ANALYST', [MODERATEUR]: 'MODERATOR', [ADMIN]: 'ADMIN' };

function monde(options: {
  readonly settings?: readonly Row[];
  readonly enConversation?: readonly string[];
  readonly emetteurRole?: string;
  readonly connecte?: boolean;
  readonly batterieBasse?: boolean;
  readonly fantome?: boolean;
} = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [EMETTEUR, SANG, SANG_REFUSE, PROCHE, PROCHE_CONSENTI, AMI, BLOQUEUR, ANALYSTE, MODERATEUR, ADMIN].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      role: id === EMETTEUR ? (options.emetteurRole ?? 'USER') : (ROLE[id] ?? 'USER'),
      ...(id === BLOQUEUR ? { blockedUserIds: [EMETTEUR] } : {}),
      ...(id === EMETTEUR && options.fantome ? { unreachableSharingDisabledAt: new Date('2026-11-01T00:00:00.000Z') } : {}),
    })),
  });
  const settings = table([
    { ownerId: EMETTEUR, otherId: PROCHE_CONSENTI, unreachableShared: true },
    { ownerId: EMETTEUR, otherId: SANG_REFUSE, unreachableShared: false },
    { ownerId: EMETTEUR, otherId: AMI, unreachableShared: true },
    ...(options.settings ?? []),
  ]);
  const emissions: Emission[] = [];
  const pushes: PhoneReachabilityPush[] = [];
  const sondes: string[] = [];
  const retraits: Array<{ emitterId: string; readerId: string }> = [];
  const conversing = new Set(options.enConversation ?? []);
  let now = T0;
  let connecte = options.connecte ?? false;
  const deps: PhoneReachabilityRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient,
    cache: batteryCacheInMemory(),
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as PhoneReachabilityRelayDeps['io'],
    now: () => now,
    context: async ({ readerIds }) => new Map(readerIds.map((id) => [id, { roomOpen: conversing.has(id), lastExchangeAt: null, awaitingReply: false }])),
    push: async (push) => {
      pushes.push(push);
      return true;
    },
    probe: async (emitterId) => {
      sondes.push(emitterId);
    },
    isTrackedDevice: async ({ sessionId }) => sessionId !== 'tablette',
    trackedDeviceConnected: async () => connecte,
    batteryLow: async () => options.batterieBasse ?? false,
    retractPushes: async (pairs) => {
      retraits.push(...pairs);
    },
  };
  const vivant = (extra: { answer?: boolean; sessionId?: string } = {}) =>
    notePhoneAlive(deps, { userId: EMETTEUR, sessionId: extra.sessionId ?? 's1', answer: extra.answer ?? false });
  const balayer = () => sweepPhoneReachability(deps);
  const avancer = (ms: number) => {
    now += ms;
  };
  /** Le chemin nominal : un signe de vie à T0, puis deux sondes ignorées. */
  const perdre = async () => {
    await vivant();
    avancer(10 * MIN);
    await balayer();
    avancer(10 * MIN);
    await balayer();
    avancer(10 * MIN);
    await balayer();
  };
  return {
    deps,
    emissions,
    pushes,
    sondes,
    retraits,
    conversing,
    settings,
    vivant,
    balayer,
    avancer,
    perdre,
    poser: (otherId: string, unreachableShared: boolean) => {
      const row = settings.rows.find((r) => r.ownerId === EMETTEUR && r.otherId === otherId);
      if (row) row.unreachableShared = unreachableShared;
      else settings.rows.push({ ownerId: EMETTEUR, otherId, unreachableShared });
    },
    couper: () => {
      const row = world.users.rows.find((r) => r.id === EMETTEUR);
      if (row) row.unreachableSharingDisabledAt = new Date(T0);
    },
    connecter: (value: boolean) => {
      connecte = value;
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
    annonces: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId) && e.data.announcement).map((e) => (e.data.announcement as { kind: string }).kind),
    pousses: (userId: string) => pushes.filter((p) => p.readerId === userId).map((p) => p.announcement.kind),
  };
}

describe('deux sondes sans réponse font un téléphone injoignable', () => {
  it('sonde après dix minutes de silence, puis dix minutes plus tard, puis déclare', async () => {
    const m = monde();
    await m.vivant();
    m.avancer(9 * MIN);
    await m.balayer();
    expect(m.sondes).toEqual([]);
    m.avancer(MIN);
    await m.balayer();
    expect(m.sondes).toEqual([EMETTEUR]);
    m.avancer(10 * MIN);
    await m.balayer();
    expect(m.sondes).toEqual([EMETTEUR, EMETTEUR]);
    expect(m.pushes).toEqual([]);
    m.avancer(10 * MIN);
    await m.balayer();
    expect(m.pousses(SANG)).toEqual(['unreachable']);
  });

  it('la charge servie dit depuis quand et pourquoi, rien d\'autre', async () => {
    const m = monde({ batterieBasse: true });
    await m.perdre();
    expect(m.vers(SANG)).toEqual([{
      room: ROOMS.user(SANG),
      event: SERVER_EVENTS.PHONE_UNREACHABLE,
      data: { userId: EMETTEUR, state: { userId: EMETTEUR, unreachableSince: new Date(T0).toISOString(), cause: 'battery' } },
    }]);
    expect(m.pushes.find((p) => p.readerId === SANG)).toMatchObject({ state: { cause: 'battery' } });
  });

  it('un téléphone dont la socket est ouverte n\'est jamais sondé : sa connexion est un signe de vie', async () => {
    const m = monde({ connecte: true });
    await m.vivant();
    m.avancer(45 * MIN);
    await m.balayer();
    m.avancer(45 * MIN);
    await m.balayer();
    expect(m.sondes).toEqual([]);
    expect(m.pushes).toEqual([]);
  });

  it('une réponse à la sonde le garde joignable, et espace la sonde suivante d\'une heure', async () => {
    const m = monde();
    await m.vivant();
    m.avancer(10 * MIN);
    await m.balayer();
    m.avancer(MIN);
    await m.vivant({ answer: true });
    m.avancer(30 * MIN);
    await m.balayer();
    expect(m.sondes).toHaveLength(1);
    m.avancer(30 * MIN);
    await m.balayer();
    expect(m.sondes).toHaveLength(2);
    expect(m.pushes).toEqual([]);
  });

  it('un autre appareil que le téléphone suivi ne dit rien du téléphone', async () => {
    const m = monde();
    await m.vivant();
    m.avancer(10 * MIN);
    await m.balayer();
    await m.vivant({ sessionId: 'tablette' });
    m.avancer(10 * MIN);
    await m.balayer();
    m.avancer(10 * MIN);
    await m.balayer();
    expect(m.pousses(SANG)).toEqual(['unreachable']);
  });

  it('un émetteur sans aucun lecteur possible n\'est jamais sondé', async () => {
    const m = monde({ fantome: true });
    await m.perdre();
    expect(m.sondes).toEqual([]);
    expect(m.emissions).toEqual([]);
  });
});

describe('la loi — rien ne part vers qui n\'y a pas droit, pas même un effacement', () => {
  it('Sang sans réglage oui ; Proche consenti oui ; Proche sans accord, Sang refusé, Ami, bloqué : rien', async () => {
    const m = monde();
    await m.perdre();
    expect(m.pousses(SANG)).toEqual(['unreachable']);
    expect(m.pousses(PROCHE_CONSENTI)).toEqual(['unreachable']);
    for (const id of [PROCHE, SANG_REFUSE, AMI, BLOQUEUR, ADMIN]) {
      expect(m.vers(id)).toEqual([]);
      expect(m.pousses(id)).toEqual([]);
    }
  });

  it('le fantôme coupe tout', async () => {
    const m = monde({ fantome: true });
    await m.perdre();
    expect(m.pushes).toEqual([]);
    expect(await phoneReachabilitySnapshotFor(m.deps, SANG)).toEqual({ items: [] });
  });

  it('entre comptes de l\'équipe sans lien, le niveau rendu est Sang (#16623) ; un utilisateur ordinaire ne voit rien', async () => {
    const m = monde({ emetteurRole: 'MODERATOR' });
    await m.perdre();
    expect(m.pousses(ANALYSTE)).toEqual(['unreachable']);
    expect(m.pousses(ADMIN)).toEqual(['unreachable']);
    expect(m.pousses(AMI)).toEqual([]);
  });
});

describe('le contexte décide', () => {
  it('en conversation : la SyncPill, jamais le push', async () => {
    const m = monde({ enConversation: [SANG] });
    await m.perdre();
    expect(m.annonces(SANG)).toEqual(['unreachable']);
    expect(m.pousses(SANG)).toEqual([]);
  });

  it('le retour est poussé à qui a reçu le push, en SyncPill en conversation, en silence sinon', async () => {
    const m = monde({ settings: [{ ownerId: EMETTEUR, otherId: PROCHE, unreachableShared: true }] });
    await m.perdre();
    m.conversing.add(PROCHE);
    m.avancer(15 * MIN);
    await m.vivant();
    expect(m.pousses(SANG)).toEqual(['unreachable', 'reachable']);
    expect(m.vers(SANG).at(-1)).toEqual({ room: ROOMS.user(SANG), event: SERVER_EVENTS.PHONE_REACHABLE, data: { userId: EMETTEUR } });
    expect(m.annonces(PROCHE)).toEqual([]);
  });

  it('en conversation au retour sans push reçu : la SyncPill annonce le retour', async () => {
    const m = monde({ enConversation: [SANG] });
    await m.perdre();
    m.avancer(MIN);
    await m.vivant();
    expect(m.annonces(SANG)).toEqual(['unreachable', 'reachable']);
    expect(m.pousses(SANG)).toEqual([]);
  });
});

describe('le rattrapage et la lecture', () => {
  it('le lecteur autorisé retrouve l\'état ; les autres rien', async () => {
    const m = monde();
    await m.perdre();
    const state = { userId: EMETTEUR, unreachableSince: new Date(T0).toISOString(), cause: 'network' };
    expect(await phoneReachabilitySnapshotFor(m.deps, SANG)).toEqual({ items: [state] });
    expect(await phoneReachabilitySnapshotFor(m.deps, PROCHE)).toEqual({ items: [] });
    expect(await phoneReachabilityStateFor(m.deps, { readerId: SANG, emitterId: EMETTEUR })).toEqual(state);
    expect(await phoneReachabilityStateFor(m.deps, { readerId: AMI, emitterId: EMETTEUR })).toBeNull();
  });

  it('un téléphone joignable ne sert rien', async () => {
    const m = monde();
    await m.vivant();
    expect(await phoneReachabilitySnapshotFor(m.deps, SANG)).toEqual({ items: [] });
  });
});

describe('qui perd l\'accès perd l\'état et ses notifications', () => {
  it('un retrait du consentement efface l\'état chez le Sang et retire ses notifications', async () => {
    const m = monde();
    await m.perdre();
    const before = await capturePhoneReachabilityAccess(m.deps, { userA: EMETTEUR, userB: SANG });
    m.poser(SANG, false);
    await refreshPhoneReachabilityBetween(m.deps, { userA: EMETTEUR, userB: SANG, before });
    expect(m.vers(SANG).at(-1)).toEqual({ room: ROOMS.user(SANG), event: SERVER_EVENTS.PHONE_REACHABLE, data: { userId: EMETTEUR } });
    expect(m.retraits).toContainEqual({ emitterId: EMETTEUR, readerId: SANG });
  });

  it('un accord donné à un Proche lui sert l\'état en cours', async () => {
    const m = monde();
    await m.perdre();
    m.poser(PROCHE, true);
    await refreshPhoneReachabilityBetween(m.deps, { userA: EMETTEUR, userB: PROCHE });
    expect(m.vers(PROCHE).at(-1)?.event).toBe(SERVER_EVENTS.PHONE_UNREACHABLE);
  });

  it('la coupure globale efface l\'état chez tous ceux qui le voyaient, puis l\'oublie', async () => {
    const m = monde();
    await m.perdre();
    const before = new Set([SANG, PROCHE_CONSENTI]);
    m.couper();
    await refreshPhoneReachabilityAudience(m.deps, { emitterId: EMETTEUR, before });
    await forgetPhoneReachabilityOf(m.deps, EMETTEUR);
    expect(m.vers(SANG).at(-1)?.event).toBe(SERVER_EVENTS.PHONE_REACHABLE);
    expect(m.vers(PROCHE_CONSENTI).at(-1)?.event).toBe(SERVER_EVENTS.PHONE_REACHABLE);
    expect(await phoneReachabilitySnapshotFor(m.deps, SANG)).toEqual({ items: [] });
  });
});
