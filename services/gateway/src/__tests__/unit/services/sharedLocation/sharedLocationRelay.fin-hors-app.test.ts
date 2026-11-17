/**
 * LA FIN D'UN PARTAGE, SIGNALÉE POUR L'APPAREIL SUSPENDU (#19463). Chaque fois que la
 * socket annonce `location:share-ended` à un lecteur, le relais le signale aussi à
 * `deps.ended` — qui poussera hors de l'app — avec l'émetteur, le lecteur et l'heure, rien
 * d'autre. Qui n'a jamais été servi n'apprend rien ; un signal qui lève n'arrête pas l'arrêt.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  captureSharedLocationAccess,
  refreshSharedLocationBetween,
  stopSharedLocation,
  type SharedLocationEnd,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { AMI, BLOQUEUR, CONNAISSANCE, demarrer, EMETTEUR, monde, NON_CHOISI, PROCHE, SANG, T0 } from '../../../helpers/shared-location-relay-world';

const MINUTE = 60_000;

function avecSignal(options: { readonly leve?: boolean } = {}) {
  const m = monde();
  const fins: SharedLocationEnd[] = [];
  const deps = {
    ...m.deps,
    ended: (end: SharedLocationEnd) => {
      fins.push(end);
      if (options.leve) throw new Error('push injoignable');
    },
  };
  return { m, deps, fins };
}

const finsSocket = (m: ReturnType<typeof monde>, userId: string) =>
  m.vers(userId).filter((e) => e.event === SERVER_EVENTS.SHARED_LOCATION_ENDED);

describe('l\'arrêt signale la fin aux seuls lecteurs servis', () => {
  it('Ami, Proche et Sang servis reçoivent le signal ; la Connaissance et le bloqueur, jamais servis, non', async () => {
    const { m, deps, fins } = avecSignal();
    await demarrer({ ...m, deps });
    m.avancer(7 * MINUTE);
    await stopSharedLocation(deps, EMETTEUR);

    expect(fins.map((fin) => fin.readerId).sort()).toEqual([AMI, PROCHE, SANG].sort());
    expect(fins.every((fin) => fin.emitterId === EMETTEUR && fin.endedAt === new Date(T0 + 7 * MINUTE).toISOString())).toBe(true);
    expect(fins.map((fin) => fin.readerId)).not.toEqual(expect.arrayContaining([CONNAISSANCE]));
    expect(fins.map((fin) => fin.readerId)).not.toEqual(expect.arrayContaining([BLOQUEUR]));
    expect(fins.map((fin) => fin.readerId)).not.toEqual(expect.arrayContaining([NON_CHOISI]));
  });

  it('le signal ne porte que l\'émetteur, le lecteur et l\'heure — rien de la position ni des autres destinataires', async () => {
    const { m, deps, fins } = avecSignal();
    await demarrer({ ...m, deps });
    await stopSharedLocation(deps, EMETTEUR);
    expect(fins.every((fin) => Object.keys(fin).sort().join() === 'emitterId,endedAt,readerId')).toBe(true);
  });

  it('chaque fin signalée est une fin annoncée par la socket, et réciproquement', async () => {
    const { m, deps, fins } = avecSignal();
    await demarrer({ ...m, deps });
    await stopSharedLocation(deps, EMETTEUR);
    for (const lecteur of [AMI, PROCHE, SANG, CONNAISSANCE, BLOQUEUR]) {
      expect(fins.filter((fin) => fin.readerId === lecteur)).toHaveLength(finsSocket(m, lecteur).length);
    }
  });

  it('un signal qui lève n\'empêche ni l\'arrêt, ni la fin des autres lecteurs', async () => {
    const { m, deps, fins } = avecSignal({ leve: true });
    await demarrer({ ...m, deps });
    expect(await stopSharedLocation(deps, EMETTEUR)).toEqual({ success: true });
    expect(fins).toHaveLength(3);
    expect(finsSocket(m, SANG)).toHaveLength(1);
  });
});

describe('une baisse de cercle signale la fin au seul lecteur qui a perdu l\'accès', () => {
  it('le Proche descendu en Connaissance reçoit le signal ; l\'Ami et le Sang, toujours servis, non', async () => {
    const { m, deps, fins } = avecSignal();
    await demarrer({ ...m, deps });
    const avant = await captureSharedLocationAccess(deps, { userA: EMETTEUR, userB: PROCHE });
    await m.lier(EMETTEUR, PROCHE, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(deps, { userA: EMETTEUR, userB: PROCHE, before: avant });

    expect(fins).toEqual([{ readerId: PROCHE, emitterId: EMETTEUR, endedAt: new Date(T0).toISOString() }]);
  });

  it('sans signal branché, le relais se comporte comme avant', async () => {
    const m = monde();
    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);
    expect(finsSocket(m, AMI)).toHaveLength(1);
  });
});
