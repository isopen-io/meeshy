/**
 * UNE ALERTE « UN SANG S'APPROCHE » EN VOL NE S'ÉCRIT PLUS APRÈS UN RETRAIT (#20689, suite de
 * l'audit de #20542) — `alertBloodProximity` lit le consentement, puis attend la cadence (Redis)
 * et le notifieur relit les deux personnes avant `createNotification`. Un retrait de la
 * proximité, un effacement de l'historique ou un fantôme posé PENDANT ces attentes ne laisse
 * partir ni l'événement socket ni la ligne `blood_proximity` : la paire est relue juste avant
 * chaque canal. Un retrait intercalé PENDANT l'écriture même retire la ligne aussitôt écrite.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { retractBloodProximityNotices, type BloodProximityRetraction } from '../../../../services/bloodLocation/bloodProximityRetraction';
import type { RetractedNotification } from '../../../../services/notifications/retractedNotifications';
import {
  eraseBloodLocationHistory,
  recordBloodLocation,
  updateBloodLocationSettings,
} from '../../../../services/bloodLocation/bloodLocationService';
import { bloodProximityNotifierOf } from '../../../../services/bloodLocation/bloodProximityNotice';
import { settled } from '../../../helpers/settled';
import { ADULT_BIRTH } from '../../../helpers/messaging-circle-world';
import { A_300_M, MINUTE, MOI, PARIS, SANG, bloodWorldAvecConsentements } from '../../../helpers/blood-location-world';

type Created = { readonly userId: string; readonly type: string; readonly actor: { readonly id: string }; readonly metadata: Record<string, unknown> };
type Moment = 'cadence' | 'notifieur' | 'ecriture';
type Retrait = (w: ReturnType<typeof bloodWorldAvecConsentements>) => Promise<unknown>;

const PERSONNES = [
  { id: MOI, username: 'moi', displayName: 'Moi', avatar: null, systemLanguage: 'fr' },
  { id: SANG, username: 'lina', displayName: 'Lina', avatar: null, systemLanguage: 'fr' },
].map((user) => ({ birthDate: ADULT_BIRTH, ...user }));

const RETIRE_PROXIMITE: Retrait = async (w) => w.consentir(SANG, MOI, { proximityShared: false });
const EFFACE_HISTORIQUE: Retrait = (w) => eraseBloodLocationHistory(w.deps, SANG);
const FANTOME: Retrait = (w) => updateBloodLocationSettings(w.deps, SANG, { ghost: true });
const COUPE_MOI: Retrait = async (w) => w.consentir(MOI, SANG, { proximityShared: true, locationShared: true, locationHistoryShared: true, bloodLocationMutedAt: new Date(w.horloge()) });

/** Le monde où `retrait` s'exécute une fois, au moment nommé, pendant l'alerte de MOI. */
function monde(moment: Moment | null, retrait: Retrait, options: { readonly relectureEnPanne?: boolean } = {}) {
  const w = bloodWorldAvecConsentements({ users: PERSONNES });
  const created: Created[] = [];
  const retractions: BloodProximityRetraction[] = [];
  const annonces: RetractedNotification[] = [];
  const annonceur = { announceNotificationsRetracted: async (rows: readonly RetractedNotification[]) => void annonces.push(...rows) };
  let pret = false;
  let fait = false;
  const intercaler = async (ici: Moment): Promise<void> => {
    if (!pret || fait || ici !== moment) return;
    fait = true;
    await retrait(w);
  };
  const notifier = bloodProximityNotifierOf({
    prisma: {
      user: {
        ...w.deps.prisma.user,
        findUnique: (async (args: never) => {
          await intercaler('notifieur');
          return w.deps.prisma.user.findUnique(args);
        }) as never,
      },
    },
    notifications: {
      createNotification: async (params: unknown) => {
        const ligne = params as Created;
        created.push(ligne);
        const id = `6500000000000000000000${String(created.length).padStart(2, '0')}`;
        w.notifications.insert({ id, userId: ligne.userId, type: ligne.type, actor: ligne.actor, delivery: { pushSent: false } });
        await intercaler('ecriture');
        if (options.relectureEnPanne && fait) w.prisma.relationFeatureSetting.findMany = (async () => { throw new Error('mongo injoignable'); }) as never;
        return { id } as never;
      },
    },
    now: () => w.horloge(),
  });
  const deps = {
    ...w.deps,
    notifyProximity: notifier,
    claimProximityCooldown: async (key: string, ttl: number) => {
      const won = await w.deps.claimProximityCooldown(key, ttl);
      if (key.startsWith('blood-proximity:')) await intercaler('cadence');
      return won;
    },
    retractProximityNotices: async (scope: BloodProximityRetraction) => {
      retractions.push(scope);
      return retractBloodProximityNotices(w.notifications.prisma as never, annonceur, scope);
    },
  };
  const rencontre = async (): Promise<void> => {
    await settled(recordBloodLocation(deps, SANG, PARIS));
    w.poser(MOI, A_300_M, w.horloge() - MINUTE);
    pret = true;
    await settled(recordBloodLocation(deps, MOI, A_300_M));
  };
  return { ...w, created, retractions, annonces, rencontre };
}

describe('#20689 — sans retrait, l\'alerte part toujours', () => {
  it('les deux Sangs reçoivent l\'événement et la notification', async () => {
    const w = monde(null, RETIRE_PROXIMITE);
    await w.rencontre();
    expect(w.proximites()).toHaveLength(2);
    expect(w.created.map((c) => c.userId).sort()).toEqual([MOI, SANG].sort());
    expect(w.retractions).toEqual([]);
  });
});

describe('#20689 — un retrait pendant l\'attente de la cadence coupe les deux canaux', () => {
  it.each([
    ['le retrait de la proximité', RETIRE_PROXIMITE],
    ['l\'effacement de l\'historique', EFFACE_HISTORIQUE],
    ['le fantôme global', FANTOME],
  ])('%s : ni événement socket, ni ligne blood_proximity', async (_nom, retrait) => {
    const w = monde('cadence', retrait);
    await w.rencontre();
    expect(w.proximites()).toEqual([]);
    expect(w.created).toEqual([]);
  });
});

describe('#20689 — un retrait pendant la relecture du notifieur : rien ne s\'écrit', () => {
  it.each([
    ['le retrait de la proximité', RETIRE_PROXIMITE],
    ['l\'effacement de l\'historique', EFFACE_HISTORIQUE],
    ['le fantôme global', FANTOME],
  ])('%s : aucune ligne blood_proximity chez l\'un ou l\'autre', async (_nom, retrait) => {
    const w = monde('notifieur', retrait);
    await w.rencontre();
    expect(w.created).toEqual([]);
  });
});

describe('#20689 — un retrait pendant l\'écriture même retire la ligne écrite et révoque son push', () => {
  it.each([
    ['le retrait de la proximité', RETIRE_PROXIMITE],
    ['l\'effacement de l\'historique', EFFACE_HISTORIQUE],
    ['le fantôme global', FANTOME],
  ])('%s : la ligne quitte la base, le push parti sans être attendu est révoqué, l\'autre ne s\'écrit pas', async (_nom, retrait) => {
    const w = monde('ecriture', retrait);
    await w.rencontre();
    expect(w.created).toHaveLength(1);
    expect(w.notifications.rows()).toEqual([]);
    expect(w.annonces.map((a) => ({ userId: a.userId, pushSent: a.pushSent }))).toEqual([{ userId: w.created[0].userId, pushSent: true }]);
  });

  it('une relecture qui lève vaut paire fermée : la ligne est retirée', async () => {
    const w = monde('ecriture', async () => undefined, { relectureEnPanne: true });
    await w.rencontre();
    expect(w.created).toHaveLength(1);
    expect(w.notifications.rows()).toEqual([]);
  });
});

describe('#20689 — un silence ciblé posé en vol ne coupe que celui qui l\'a posé', () => {
  it('MOI coupe SANG pendant la relecture du notifieur : rien chez MOI, SANG reçoit la sienne', async () => {
    const w = monde('notifieur', COUPE_MOI);
    await w.rencontre();
    expect(w.created.map((c) => c.userId)).toEqual([SANG]);
  });
});
