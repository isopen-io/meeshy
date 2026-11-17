/**
 * LA BATTERIE PENDANT LE PARTAGE, CÔTÉ PARTAGE (#19204). `shareBattery` se range DANS l'état
 * scellé du partage : il vit et meurt avec lui (terme, échéance de chacun, arrêt, remplacement).
 * `sharedBatteryGrantsAmong` dit, à la batterie, à qui le partage COURANT accorde la sienne ; et
 * chaque démarrage ou arrêt qui change cet accord rejoue la batterie des personnes touchées.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  ownSharedLocationFor,
  startSharedLocation,
  stopSharedLocation,
  type SharedLocationRelayDeps,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { sharedBatteryGrantsAmong } from '../../../../services/sharedLocation/sharedLocationBattery';
import { AMI, EMETTEUR, HEURE, monde, PARIS, PROCHE, SANG } from '../../../helpers/shared-location-relay-world';

const MINUTE = 60_000;

function partage() {
  const m = monde();
  const rejoues: Array<{ readonly emitterId: string; readonly readerIds: readonly string[] }> = [];
  const deps: SharedLocationRelayDeps = {
    ...m.deps,
    refreshBattery: async (emitterId, readerIds) => {
      rejoues.push({ emitterId, readerIds: [...readerIds].sort() });
    },
  };
  const demarrer = (recipients: readonly object[], overrides: Record<string, unknown> = {}) =>
    startSharedLocation(deps, EMETTEUR, { recipients, durationMinutes: 60, position: PARIS, ...overrides });
  const accordes = async () => [...((await sharedBatteryGrantsAmong(m.deps.cache, [EMETTEUR], m.deps.now())).get(EMETTEUR) ?? [])].sort();
  return { m, deps, rejoues, demarrer, accordes };
}

const TROIS = [{ userId: AMI, precision: 'exact' }, { userId: PROCHE }, { userId: SANG }] as const;

describe('l\'accord de batterie suit le partage (#19204)', () => {
  it('un partage avec la batterie l\'accorde à ses destinataires ; mes appareils le relisent', async () => {
    const p = partage();

    await p.demarrer(TROIS, { shareBattery: true });

    expect(await p.accordes()).toEqual([AMI, PROCHE, SANG].sort());
    expect((await ownSharedLocationFor(p.m.deps, EMETTEUR)).shareBattery).toBe(true);
  });

  it('sans la clé, rien n\'est accordé et l\'instantané le dit', async () => {
    const p = partage();

    await p.demarrer(TROIS);

    expect(await p.accordes()).toEqual([]);
    expect((await ownSharedLocationFor(p.m.deps, EMETTEUR)).shareBattery).toBe(false);
  });

  it('l\'échéance d\'une personne lui retire l\'accord ; le terme le retire à tous', async () => {
    const p = partage();
    await p.demarrer([{ userId: AMI, expiresInSeconds: 600 }, { userId: PROCHE }], { shareBattery: true });

    p.m.avancer(11 * MINUTE);
    expect(await p.accordes()).toEqual([PROCHE]);

    p.m.avancer(HEURE);
    expect(await p.accordes()).toEqual([]);
  });

  it('l\'arrêt retire l\'accord et rejoue la batterie de ceux qu\'il servait', async () => {
    const p = partage();
    await p.demarrer(TROIS, { shareBattery: true });
    p.rejoues.length = 0;

    await stopSharedLocation(p.deps, EMETTEUR);

    expect(await p.accordes()).toEqual([]);
    expect(p.rejoues).toEqual([{ emitterId: EMETTEUR, readerIds: [AMI, PROCHE, SANG].sort() }]);
  });

  it('le démarrage rejoue la batterie de ceux qu\'il accorde, et de ceux que le partage remplacé accordait', async () => {
    const p = partage();
    await p.demarrer([{ userId: AMI }], { shareBattery: true });
    expect(p.rejoues).toEqual([{ emitterId: EMETTEUR, readerIds: [AMI] }]);
    p.rejoues.length = 0;

    await p.demarrer([{ userId: PROCHE }]);

    expect(await p.accordes()).toEqual([]);
    expect(p.rejoues).toEqual([{ emitterId: EMETTEUR, readerIds: [AMI] }]);
  });

  it('un partage sans batterie, ni avant ni après, ne rejoue rien', async () => {
    const p = partage();

    await p.demarrer(TROIS);
    await stopSharedLocation(p.deps, EMETTEUR);

    expect(p.rejoues).toEqual([]);
  });

  it('un rejeu qui échoue n\'empêche ni le démarrage ni l\'arrêt', async () => {
    const p = partage();
    const deps = { ...p.deps, refreshBattery: async () => { throw new Error('batterie en panne'); } };

    expect((await startSharedLocation(deps, EMETTEUR, { recipients: TROIS, durationMinutes: 60, position: PARIS, shareBattery: true })).success).toBe(true);
    expect((await stopSharedLocation(deps, EMETTEUR)).success).toBe(true);
  });
});
