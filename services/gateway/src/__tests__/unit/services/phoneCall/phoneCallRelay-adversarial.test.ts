/**
 * « EN APPEL » (#18753), AUDIT ADVERSARIAL — les trois défauts trouvés, gardés : l'expiration ne rend
 * pas l'instant exact du rapport, un retrait pendant l'envoi hors verrou ne ressuscite pas l'état chez
 * le Sang retiré, et une fin dont l'envoi croise un nouvel appel ne l'efface pas.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  phoneCallSnapshotFor,
  refreshPhoneCallAudience,
  refreshPhoneCallBetween,
  reconcilePhoneCallOfAccount,
  reportPhoneCall,
  type PhoneCallRelayDeps,
} from '../../../../services/phoneCall/phoneCallRelay';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink } from '../../../helpers/messaging-circle-world';
import { batteryCacheInMemory } from '../battery/batteryWorld';

const PERSONNE = '6400000000000000000000e1';
const SANG = '6400000000000000000000b1';
const SANG_REFUSE = '6400000000000000000000b2';
const PROCHE = '6400000000000000000000c1';
const BLOQUEUR = '6400000000000000000000d1';
const ANALYSTE = '6400000000000000000000a1';
const ADMIN = '6400000000000000000000a2';

const T0 = Date.parse('2026-11-19T14:02:13.000Z');
const MIN = 60_000;

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

const LIENS: readonly CircleLink[] = [
  [PERSONNE, SANG, 'BLOOD'],
  [PERSONNE, SANG_REFUSE, 'BLOOD'],
  [PERSONNE, PROCHE, 'CLOSE'],
  [PERSONNE, BLOQUEUR, 'BLOOD'],
];
const ROLE: Readonly<Record<string, string>> = { [ANALYSTE]: 'ANALYST', [ADMIN]: 'ADMIN' };

function monde(options: { readonly role?: string; readonly coupee?: boolean; readonly enConversation?: readonly string[] } = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [PERSONNE, SANG, SANG_REFUSE, PROCHE, BLOQUEUR, ANALYSTE, ADMIN].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      role: id === PERSONNE ? (options.role ?? 'USER') : (ROLE[id] ?? 'USER'),
      ...(id === BLOQUEUR ? { blockedUserIds: [PERSONNE] } : {}),
      ...(id === PERSONNE && options.coupee ? { callSharingDisabledAt: new Date('2026-11-01T00:00:00.000Z') } : {}),
    })),
  });
  const settings = table([{ ownerId: PERSONNE, otherId: SANG_REFUSE, callShared: false }, { ownerId: PERSONNE, otherId: PROCHE, callShared: true }]);
  const emissions: Emission[] = [];
  const conversing = new Set(options.enConversation ?? []);
  let now = T0;
  const deps: PhoneCallRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient,
    cache: batteryCacheInMemory(),
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as PhoneCallRelayDeps['io'],
    now: () => now,
    context: async ({ readerIds }) => new Map(readerIds.map((id) => [id, { roomOpen: conversing.has(id), lastExchangeAt: null, awaitingReply: false }])),
    isTrackedDevice: async ({ sessionId }) => sessionId === 's1',
  };
  const rapporter = (active: boolean, sessionId = 's1') => reportPhoneCall(deps, { userId: PERSONNE, sessionId, active });
  return {
    deps,
    emissions,
    settings,
    rapporter,
    avancer: (ms: number) => {
      now += ms;
    },
    poser: (otherId: string, callShared: boolean) => {
      const row = settings.rows.find((r) => r.ownerId === PERSONNE && r.otherId === otherId);
      if (row) row.callShared = callShared;
      else settings.rows.push({ ownerId: PERSONNE, otherId, callShared });
    },
    couper: () => {
      const row = world.users.rows.find((r) => r.id === PERSONNE);
      if (row) row.callSharingDisabledAt = new Date(now);
    },
    desactiver: (userId: string) => {
      const row = world.users.rows.find((r) => r.id === userId);
      if (row) row.deactivatedAt = new Date(now);
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
  };
}

describe('audit adversarial #18753', () => {
  it('expiresAt ne doit pas rendre l\'heure exacte du rapport (sinon l\'arrondi de since ne sert à rien)', async () => {
    const m = monde();
    await m.rapporter(true);
    const state = m.vers(SANG)[0]?.data.state as { since: string; expiresAt: string };
    const debutDeduit = Date.parse(state.expiresAt) - 180 * MIN;
    expect(debutDeduit).not.toBe(T0);
  });

  it('un retrait par personne pendant l\'envoi hors verrou ne doit pas ressusciter l\'état chez le Sang retiré', async () => {
    const m = monde({ enConversation: [SANG] });
    const contexteOrigine = m.deps.context;
    let retire = false;
    (m.deps as { context: PhoneCallRelayDeps['context'] }).context = async (params) => {
      if (!retire) {
        retire = true;
        m.poser(SANG, false);
        await refreshPhoneCallBetween(m.deps, { userA: PERSONNE, userB: SANG });
      }
      return contexteOrigine(params);
    };
    await m.rapporter(true);
    expect((await phoneCallSnapshotFor(m.deps, SANG)).items).toEqual([]);
    expect(m.vers(SANG).at(-1)?.event).toBe(SERVER_EVENTS.PHONE_CALL_ENDED);
  });

  it('une fin dont l\'envoi croise un nouvel appel ne doit pas effacer le nouvel appel chez le Sang', async () => {
    const m = monde({ enConversation: [SANG] });
    await m.rapporter(true);
    m.avancer(MIN);
    const contexteOrigine = m.deps.context;
    let relance = false;
    (m.deps as { context: PhoneCallRelayDeps['context'] }).context = async (params) => {
      if (!relance) {
        relance = true;
        m.avancer(1000);
        await m.rapporter(true);
      }
      return contexteOrigine(params);
    };
    await m.rapporter(false);
    expect((await phoneCallSnapshotFor(m.deps, SANG)).items.map((i) => i.userId)).toEqual([PERSONNE]);
    expect(m.vers(SANG).at(-1)?.event).toBe(SERVER_EVENTS.PHONE_CALL_STARTED);
  });
});
