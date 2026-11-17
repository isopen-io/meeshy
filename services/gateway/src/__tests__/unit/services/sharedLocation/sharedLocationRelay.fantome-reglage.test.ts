/**
 * LE RÉGLAGE DU FANTÔME GLOBAL, DE BOUT EN BOUT (#19203, revue). `setLocationGhost` écrit
 * `User.locationGhostAt` ET y fait suivre le partage temporaire en cours :
 *  - la SORTIE est fail-closed : si le partage ne peut pas être retenu jusqu'à la position
 *    suivante, le compte reste en fantôme — jamais une position prise en fantôme servie au
 *    rattrapage parce que le reflet a raté après l'écriture ;
 *  - la batterie accordée par le partage (#19204) suit le fantôme, à l'entrée comme à la sortie ;
 *  - un partage démarré en fantôme puis servi après la sortie est dit terminé (#19202) à ceux
 *    qu'il a servis, comme tout partage servi.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  sharedLocationEndedFor,
  sharedLocationSnapshotFor,
  startSharedLocation,
  stopSharedLocation,
  updateSharedLocation,
  type SharedLocationRelayDeps,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { setLocationGhost, type LocationGhostDb } from '../../../../services/sharedLocation/locationGhost';
import { AMI, demarrer, EMETTEUR, monde, PARIS, PLUS_LOIN, PROCHE, SANG } from '../../../helpers/shared-location-relay-world';

const MINUTE = 60_000;
const TROIS = [{ userId: AMI, precision: 'exact' }, { userId: PROCHE }, { userId: SANG }] as const;

function reglage(m: ReturnType<typeof monde>, relay: SharedLocationRelayDeps = m.deps) {
  const rapports: unknown[] = [];
  const regler = (ghost: boolean) =>
    setLocationGhost({ db: m.deps.prisma as unknown as LocationGhostDb, relay, report: (error) => rapports.push(error) }, EMETTEUR, ghost);
  return { regler, rapports };
}

const fantomeEnBase = async (m: ReturnType<typeof monde>): Promise<unknown> => {
  const db = m.deps.prisma as unknown as LocationGhostDb;
  return (await db.user.findUnique({ where: { id: EMETTEUR }, select: { locationGhostAt: true } }))?.locationGhostAt ?? null;
};

describe('la sortie du fantôme est fail-closed', () => {
  it('le partage ne peut pas être retenu : la sortie lève, le compte reste en fantôme, rien n\'est servi', async () => {
    const m = monde();
    const r = reglage(m);
    await r.regler(true);
    await demarrer(m);
    m.avancer(MINUTE);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    const enPanne: SharedLocationRelayDeps = {
      ...m.deps,
      cache: new Proxy(m.deps.cache, {
        get: (target, prop) => (prop === 'setIfCurrent' ? async () => { throw new Error('cache injoignable'); } : Reflect.get(target, prop)),
      }),
    };

    await expect(reglage(m, enPanne).regler(false)).rejects.toThrow('cache injoignable');

    expect(await fantomeEnBase(m)).toBeInstanceOf(Date);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });

  it('une sortie réussie ne sert pas la position prise en fantôme, seulement la suivante', async () => {
    const m = monde();
    const r = reglage(m);
    await r.regler(true);
    await demarrer(m);
    m.avancer(MINUTE);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    m.avancer(MINUTE);

    expect(await r.regler(false)).toEqual({ ghost: false, ghostAt: null });

    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
    m.avancer(MINUTE);
    await updateSharedLocation(m.deps, EMETTEUR, PARIS);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.latitude)).toEqual([PARIS.latitude]);
  });

  it('retirer un fantôme qui n\'existe pas ne retient pas la position en cours', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(MINUTE);

    await reglage(m).regler(false);

    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.latitude)).toEqual([PARIS.latitude]);
  });

  it('entrer en fantôme coupe le partage même si le reflet est fait par le réglage lui-même', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    await reglage(m).regler(true);

    expect(m.vers(AMI).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
  });
});

describe('la batterie accordée par le partage suit le fantôme (#19204)', () => {
  it('entrer puis sortir rejoue la batterie des destinataires, APRÈS l\'écriture du compte', async () => {
    const m = monde();
    const rejoues: Array<{ readonly readerIds: readonly string[]; readonly ghostAt: unknown }> = [];
    const relay: SharedLocationRelayDeps = {
      ...m.deps,
      refreshBattery: async (_emitterId, readerIds) => {
        rejoues.push({ readerIds: [...readerIds].sort(), ghostAt: await fantomeEnBase(m) });
      },
    };
    await startSharedLocation(m.deps, EMETTEUR, { recipients: TROIS, durationMinutes: 60, position: PARIS, shareBattery: true });
    const r = reglage(m, relay);

    await r.regler(true);
    await r.regler(false);

    expect(rejoues.map((rejeu) => rejeu.readerIds)).toEqual([[AMI, PROCHE, SANG].sort(), [AMI, PROCHE, SANG].sort()]);
    expect(rejoues[0]?.ghostAt).toBeInstanceOf(Date);
    expect(rejoues[1]?.ghostAt).toBeNull();
  });
});

describe('un partage servi après la sortie du fantôme est dit terminé (#19202)', () => {
  it('démarré en fantôme, servi après la sortie, arrêté : l\'Ami le lit parmi les partages terminés', async () => {
    const m = monde();
    const r = reglage(m);
    await r.regler(true);
    await demarrer(m);
    m.avancer(MINUTE);
    await r.regler(false);
    m.avancer(MINUTE);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    m.avancer(MINUTE);
    await stopSharedLocation(m.deps, EMETTEUR);
    m.avancer(MINUTE);

    expect((await sharedLocationEndedFor(m.deps, AMI)).map((item) => item.userId)).toEqual([EMETTEUR]);
  });
});
