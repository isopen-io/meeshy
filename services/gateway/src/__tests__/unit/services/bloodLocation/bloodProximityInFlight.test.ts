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
import type { BloodProximityRetraction } from '../../../../services/bloodLocation/bloodProximityRetraction';
import {
  eraseBloodLocationHistory,
  recordBloodLocation,
  updateBloodLocationSettings,
} from '../../../../services/bloodLocation/bloodLocationService';
import { bloodProximityNotifierOf } from '../../../../services/bloodLocation/bloodProximityNotice';
import { settled } from '../../../helpers/settled';
import { ADULT_BIRTH } from '../../../helpers/messaging-circle-world';
import { A_300_M, MINUTE, MOI, PARIS, SANG, bloodWorldAvecConsentements } from '../../../helpers/blood-location-world';

type Created = { readonly userId: string; readonly metadata: Record<string, unknown> };
type Moment = 'cadence' | 'notifieur' | 'ecriture';
type Retrait = (w: ReturnType<typeof bloodWorldAvecConsentements>) => Promise<unknown>;

const PERSONNES = [
  { id: MOI, username: 'moi', displayName: 'Moi', avatar: null, systemLanguage: 'fr' },
  { id: SANG, username: 'lina', displayName: 'Lina', avatar: null, systemLanguage: 'fr' },
].map((user) => ({ birthDate: ADULT_BIRTH, ...user }));

const RETIRE_PROXIMITE: Retrait = async (w) => w.consentir(SANG, MOI, { proximityShared: false });
const EFFACE_HISTORIQUE: Retrait = (w) => eraseBloodLocationHistory(w.deps, SANG);
const FANTOME: Retrait = (w) => updateBloodLocationSettings(w.deps, SANG, { ghost: true });

/** Le monde où `retrait` s'exécute une fois, au moment nommé, pendant l'alerte de MOI. */
function monde(moment: Moment | null, retrait: Retrait) {
  const w = bloodWorldAvecConsentements({ users: PERSONNES });
  const created: Created[] = [];
  const retractions: BloodProximityRetraction[] = [];
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
        created.push(params as Created);
        await intercaler('ecriture');
        return { id: `n${created.length}` } as never;
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
      return w.deps.retractProximityNotices(scope);
    },
  };
  const rencontre = async (): Promise<void> => {
    await settled(recordBloodLocation(deps, SANG, PARIS));
    w.poser(MOI, A_300_M, w.horloge() - MINUTE);
    pret = true;
    await settled(recordBloodLocation(deps, MOI, A_300_M));
  };
  return { ...w, created, retractions, rencontre };
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

describe('#20689 — un retrait pendant l\'écriture même retire la ligne écrite', () => {
  it('la ligne aussitôt créée est retirée chez son lecteur', async () => {
    const w = monde('ecriture', RETIRE_PROXIMITE);
    await w.rencontre();
    expect(w.created).toHaveLength(1);
    const [ecrite] = w.created;
    expect(w.retractions).toContainEqual({ kind: 'at', ownerId: ecrite.metadata.userId, readerId: ecrite.userId });
  });
});
