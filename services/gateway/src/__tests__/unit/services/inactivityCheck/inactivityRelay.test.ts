/**
 * LA VÉRIFICATION D'INACTIVITÉ (#18738) — après le délai choisi sans activité du téléphone suivi,
 * la personne reçoit « Tout va bien ? » ; sans réponse en 30 min, chaque Sang autorisé reçoit, dans
 * `user:<id>`, l'alerte poussée avec ce qui lui est DÉJÀ partagé (dernière position, dernière
 * batterie) ; la première activité qui suit lui annonce le retour. Rien ne part vers un lecteur que
 * la loi refuse.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  inactivitySnapshotFor,
  noteInactivityActivity,
  refreshInactivityBetween,
  refreshInactivityAudience,
  reconcileInactivityOfAccount,
  sweepInactivity,
  type InactivityPush,
  type InactivityRelayDeps,
} from '../../../../services/inactivityCheck/inactivityRelay';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink, type Row } from '../../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from '../battery/batteryWorld';

const PERSONNE = '6400000000000000000000e1';
const SANG = '6400000000000000000000b1';
const SANG_REFUSE = '6400000000000000000000b2';
const PROCHE = '6400000000000000000000c1';
const PROCHE_CONSENTI = '6400000000000000000000c2';
const BLOQUEUR = '6400000000000000000000d1';
const ANALYSTE = '6400000000000000000000a1';
const ADMIN = '6400000000000000000000a2';

const T0 = Date.parse('2026-11-16T08:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

const LIENS: readonly CircleLink[] = [
  [PERSONNE, SANG, 'BLOOD'],
  [PERSONNE, SANG_REFUSE, 'BLOOD'],
  [PERSONNE, PROCHE, 'CLOSE'],
  [PERSONNE, PROCHE_CONSENTI, 'CLOSE'],
  [PERSONNE, BLOQUEUR, 'BLOOD'],
];
const ROLE: Readonly<Record<string, string>> = { [ANALYSTE]: 'ANALYST', [ADMIN]: 'ADMIN' };

function monde(options: { readonly role?: string; readonly delai?: number | null; readonly coupee?: boolean; readonly settings?: readonly Row[] } = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [PERSONNE, SANG, SANG_REFUSE, PROCHE, PROCHE_CONSENTI, BLOQUEUR, ANALYSTE, ADMIN].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      role: id === PERSONNE ? (options.role ?? 'USER') : (ROLE[id] ?? 'USER'),
      ...(id === BLOQUEUR ? { blockedUserIds: [PERSONNE] } : {}),
      ...(id === PERSONNE && options.delai !== undefined ? { inactivityCheckDelayHours: options.delai } : {}),
      ...(id === PERSONNE && options.coupee ? { inactivityCheckDisabledAt: new Date('2026-11-01T00:00:00.000Z') } : {}),
    })),
  });
  const settings = table([
    { ownerId: PERSONNE, otherId: SANG_REFUSE, inactivityShared: false },
    { ownerId: PERSONNE, otherId: PROCHE_CONSENTI, inactivityShared: true },
    ...(options.settings ?? []),
  ]);
  const emissions: Emission[] = [];
  const pushes: InactivityPush[] = [];
  const questions: string[] = [];
  const questionsRetirees: string[] = [];
  const retraits: Array<{ emitterId: string; readerId: string }> = [];
  let now = T0;
  let connecte = false;
  const deps: InactivityRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient,
    cache: batteryCacheInMemory(),
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as InactivityRelayDeps['io'],
    now: () => now,
    isTrackedDevice: async ({ sessionId }) => sessionId === 's1',
    trackedSession: async () => 's1',
    trackedDeviceConnected: async () => connecte,
    askWellness: async (userId) => {
      questions.push(userId);
    },
    retractWellness: async (userId) => {
      questionsRetirees.push(userId);
    },
    push: async (push) => {
      pushes.push(push);
      return true;
    },
    retractAlerts: async (pairs) => {
      retraits.push(...pairs);
    },
    lastPositionFor: async (_emitterId, readerId) => (readerId === SANG ? { latitude: 48.85, longitude: 2.35, recordedAt: new Date(T0 - 5 * MIN).toISOString() } : null),
    lastBatteryFor: async (_emitterId, readerId) => (readerId === SANG ? { level: 9, measuredAt: new Date(T0 - 2 * MIN).toISOString() } : null),
  };
  const actif = (sessionId = 's1', anyDevice = false) => noteInactivityActivity(deps, { userId: PERSONNE, sessionId, anyDevice });
  const balayer = () => sweepInactivity(deps);
  const avancer = (ms: number) => {
    now += ms;
  };
  /** Le chemin nominal : une activité à T0, la question après 12 h, l'alerte 30 min plus tard. */
  const alerter = async () => {
    await actif();
    avancer(12 * HOUR);
    await balayer();
    avancer(30 * MIN);
    await balayer();
  };
  return {
    deps,
    emissions,
    pushes,
    questions,
    questionsRetirees,
    retraits,
    settings,
    actif,
    balayer,
    avancer,
    alerter,
    connecter: (value: boolean) => {
      connecte = value;
    },
    poser: (otherId: string, inactivityShared: boolean) => {
      const row = settings.rows.find((r) => r.ownerId === PERSONNE && r.otherId === otherId);
      if (row) row.inactivityShared = inactivityShared;
      else settings.rows.push({ ownerId: PERSONNE, otherId, inactivityShared });
    },
    couper: () => {
      const row = world.users.rows.find((r) => r.id === PERSONNE);
      if (row) row.inactivityCheckDisabledAt = new Date(now);
    },
    desactiver: (userId: string) => {
      const row = world.users.rows.find((r) => r.id === userId);
      if (row) row.deactivatedAt = new Date(now);
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
    pousses: (userId: string) => pushes.filter((p) => p.readerId === userId).map((p) => p.announcement.kind),
  };
}

describe('« Tout va bien ? » après le délai sans activité', () => {
  it('pose la question à la personne après 12 h, une seule fois, sans rien dire à personne d\'autre', async () => {
    const m = monde();
    await m.actif();
    m.avancer(12 * HOUR - MIN);
    await m.balayer();
    expect(m.questions).toEqual([]);
    m.avancer(MIN);
    await m.balayer();
    m.avancer(5 * MIN);
    await m.balayer();
    expect(m.questions).toEqual([PERSONNE]);
    expect(m.emissions).toEqual([]);
    expect(m.pushes).toEqual([]);
  });

  it('suit le délai choisi (6 h)', async () => {
    const m = monde({ delai: 6 });
    await m.actif();
    m.avancer(6 * HOUR);
    await m.balayer();
    expect(m.questions).toEqual([PERSONNE]);
  });

  it('une socket ouverte du téléphone suivi est une activité : aucune question', async () => {
    const m = monde();
    await m.actif();
    m.connecter(true);
    m.avancer(12 * HOUR);
    await m.balayer();
    expect(m.questions).toEqual([]);
  });

  it('un autre appareil que le téléphone suivi n\'est pas une activité du téléphone', async () => {
    const m = monde();
    await m.actif();
    m.avancer(11 * HOUR);
    expect(await m.actif('ordinateur')).toBe(false);
    m.avancer(HOUR);
    await m.balayer();
    expect(m.questions).toEqual([PERSONNE]);
  });

  it('coupée : ni question, ni alerte', async () => {
    const m = monde({ coupee: true });
    await m.actif();
    m.avancer(13 * HOUR);
    await m.balayer();
    m.avancer(HOUR);
    await m.balayer();
    expect(m.questions).toEqual([]);
    expect(m.pushes).toEqual([]);
  });

  it('une activité pendant la question l\'annule en silence et retire la notification', async () => {
    const m = monde();
    await m.actif();
    m.avancer(12 * HOUR);
    await m.balayer();
    m.avancer(10 * MIN);
    await m.actif();
    m.avancer(30 * MIN);
    await m.balayer();
    expect(m.pushes).toEqual([]);
    expect(m.questionsRetirees).toEqual([PERSONNE]);
  });
});

describe('sans réponse en 30 min, les Sangs sont prévenus', () => {
  it('le Sang reçoit l\'alerte poussée et l\'état, avec la position et la batterie qui lui sont déjà partagées', async () => {
    const m = monde();
    await m.alerter();
    expect(m.pousses(SANG)).toEqual(['alert']);
    const [emission] = m.vers(SANG);
    expect(emission.event).toBe(SERVER_EVENTS.INACTIVITY_ALERT);
    expect(emission.data).toEqual({
      userId: PERSONNE,
      state: {
        userId: PERSONNE,
        inactiveSince: new Date(T0).toISOString(),
        alertedAt: new Date(T0 + 12 * HOUR + 30 * MIN).toISOString(),
        lastPosition: { latitude: 48.85, longitude: 2.35, recordedAt: new Date(T0 - 5 * MIN).toISOString() },
        lastBattery: { level: 9, measuredAt: new Date(T0 - 2 * MIN).toISOString() },
      },
      announcement: { kind: 'alert', inactiveSince: new Date(T0).toISOString(), at: new Date(T0 + 12 * HOUR + 30 * MIN).toISOString() },
    });
  });

  it('ce qui n\'est pas déjà partagé n\'est pas servi', async () => {
    const m = monde({ role: 'ANALYST' });
    await m.alerter();
    const state = m.vers(ADMIN)[0]?.data.state as Record<string, unknown> | undefined;
    expect(state).toBeDefined();
    expect(state).not.toHaveProperty('lastPosition');
    expect(state).not.toHaveProperty('lastBattery');
  });

  it('Sang sans réglage oui ; Proche, même consenti, Sang refusé, bloqué, équipe face à un utilisateur : rien', async () => {
    const m = monde();
    await m.alerter();
    expect(m.pousses(SANG)).toEqual(['alert']);
    for (const id of [PROCHE, PROCHE_CONSENTI, SANG_REFUSE, BLOQUEUR, ADMIN, ANALYSTE]) {
      expect(m.vers(id)).toEqual([]);
      expect(m.pousses(id)).toEqual([]);
    }
  });

  it('entre comptes de l\'équipe sans lien, le niveau rendu est Sang (#16623)', async () => {
    const m = monde({ role: 'ANALYST' });
    await m.alerter();
    expect(m.pousses(ADMIN)).toEqual(['alert']);
    expect(m.pousses(ANALYSTE)).toEqual(['alert']);
  });

  it('l\'alerte part une seule fois', async () => {
    const m = monde();
    await m.alerter();
    m.avancer(HOUR);
    await m.balayer();
    expect(m.pousses(SANG)).toEqual(['alert']);
  });

  it('personne à prévenir : aucune question n\'est posée', async () => {
    const m = monde();
    m.poser(SANG, false);
    await m.actif();
    m.avancer(12 * HOUR);
    await m.balayer();
    expect(m.questions).toEqual([]);
  });
});

describe('le retour', () => {
  it('la première activité annonce le retour aux Sangs prévenus, et retire la question', async () => {
    const m = monde();
    await m.alerter();
    m.avancer(20 * MIN);
    await m.actif();
    expect(m.pousses(SANG)).toEqual(['alert', 'responded']);
    expect(m.vers(SANG).at(-1)).toEqual({
      room: ROOMS.user(SANG),
      event: SERVER_EVENTS.INACTIVITY_CLEARED,
      data: { userId: PERSONNE, announcement: { kind: 'responded', inactiveSince: new Date(T0).toISOString(), at: new Date(T0 + 12 * HOUR + 50 * MIN).toISOString() } },
    });
    expect(m.questionsRetirees).toEqual([PERSONNE]);
  });

  it('« Je vais bien » depuis un autre appareil de la personne répond aussi', async () => {
    const m = monde();
    await m.alerter();
    expect(await m.actif('ordinateur', true)).toBe(true);
    expect(m.pousses(SANG)).toEqual(['alert', 'responded']);
  });
});

describe('le rattrapage et la perte d\'accès', () => {
  it('le Sang autorisé retrouve l\'alerte en cours ; les autres rien', async () => {
    const m = monde();
    await m.alerter();
    expect((await inactivitySnapshotFor(m.deps, SANG)).items.map((i) => i.userId)).toEqual([PERSONNE]);
    expect((await inactivitySnapshotFor(m.deps, PROCHE)).items).toEqual([]);
    expect((await inactivitySnapshotFor(m.deps, ADMIN)).items).toEqual([]);
  });

  it('sans alerte en cours, rien n\'est servi', async () => {
    const m = monde();
    await m.actif();
    m.avancer(12 * HOUR);
    await m.balayer();
    expect((await inactivitySnapshotFor(m.deps, SANG)).items).toEqual([]);
  });

  it('un retrait du consentement efface l\'alerte chez le Sang et retire sa notification', async () => {
    const m = monde();
    await m.alerter();
    m.poser(SANG, false);
    await refreshInactivityBetween(m.deps, { userA: PERSONNE, userB: SANG });
    expect(m.vers(SANG).at(-1)).toEqual({ room: ROOMS.user(SANG), event: SERVER_EVENTS.INACTIVITY_CLEARED, data: { userId: PERSONNE } });
    expect(m.retraits).toContainEqual({ emitterId: PERSONNE, readerId: SANG });
    await m.actif();
    expect(m.pousses(SANG)).toEqual(['alert']);
  });

  it('la coupure globale efface l\'alerte chez tous, et l\'oublie', async () => {
    const m = monde();
    await m.alerter();
    m.couper();
    await refreshInactivityAudience(m.deps, PERSONNE);
    expect(m.vers(SANG).at(-1)?.event).toBe(SERVER_EVENTS.INACTIVITY_CLEARED);
    expect(m.retraits).toContainEqual({ emitterId: PERSONNE, readerId: SANG });
    m.avancer(30 * HOUR);
    await m.balayer();
    expect(m.questions).toEqual([PERSONNE]);
  });

  it('un Sang désactivé perd l\'alerte', async () => {
    const m = monde();
    await m.alerter();
    m.desactiver(SANG);
    await reconcileInactivityOfAccount(m.deps, SANG);
    expect(m.vers(SANG).at(-1)?.event).toBe(SERVER_EVENTS.INACTIVITY_CLEARED);
    expect(m.retraits).toContainEqual({ emitterId: PERSONNE, readerId: SANG });
  });
});
