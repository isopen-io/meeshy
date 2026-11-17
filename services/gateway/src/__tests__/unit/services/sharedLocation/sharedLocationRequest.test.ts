/**
 * « DEMANDER À PROLONGER » ET « REDEMANDER » (#19204). Un destinataire demande à l'émetteur de
 * prolonger son partage, ou d'en refaire un après sa fin. La demande n'est ouverte que si la loi
 * `location.temporary` l'est dans la paire (dès Ami, sans blocage, comptes utilisables) ; elle est
 * plafonnée à une par paire et par fenêtre, quel que soit son genre ; elle ne porte aucune
 * coordonnée ; et elle n'a AUCUN effet automatique : le partage ne bouge pas, l'émetteur relance
 * lui-même.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SHARED_LOCATION_ERROR_CODES, SHARED_LOCATION_REQUEST_WINDOW_MINUTES } from '@meeshy/shared/types/shared-location';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { requestSharedLocation, type SharedLocationRequestDeps } from '../../../../services/sharedLocation/sharedLocationRequest';
import type { SharedLocationRequestNotice } from '../../../../services/sharedLocation/sharedLocationNotices';
import { ownSharedLocationFor } from '../../../../services/sharedLocation/sharedLocationRelay';
import { AMI, BLOQUEUR, CONNAISSANCE, demarrer, EMETTEUR, monde, PROCHE, SANG, T0 } from '../../../helpers/shared-location-relay-world';

const MINUTE = 60_000;

function guichet() {
  const m = monde();
  const notices: SharedLocationRequestNotice[] = [];
  const held = new Map<string, number>();
  const deps: SharedLocationRequestDeps = {
    prisma: m.deps.prisma,
    io: m.deps.io,
    now: m.deps.now,
    claim: async (key, ttlSeconds) => {
      const until = held.get(key);
      if (until !== undefined && until > m.deps.now()) return false;
      held.set(key, m.deps.now() + ttlSeconds * 1000);
      return true;
    },
    notify: async (notice) => {
      notices.push(notice);
      return true;
    },
  };
  const demander = (requesterId: string, kind: unknown, emitterId = EMETTEUR) => requestSharedLocation(deps, { requesterId, emitterId, payload: { kind } });
  return { m, deps, notices, demander, held };
}

describe('une demande, dès Ami (#19204)', () => {
  it('un Ami demande de prolonger : l\'émetteur reçoit l\'événement et la notification, sans coordonnée', async () => {
    const g = guichet();

    const ack = await g.demander(AMI, 'extend');

    expect(ack).toEqual({ success: true, data: { requestedAt: new Date(T0).toISOString() } });
    expect(g.m.vers(EMETTEUR)).toEqual([
      { room: `user:${EMETTEUR}`, event: SERVER_EVENTS.SHARED_LOCATION_REQUESTED, data: { userId: AMI, kind: 'extend', requestedAt: new Date(T0).toISOString() } },
    ]);
    expect(g.notices).toEqual([{ emitterId: EMETTEUR, requesterId: AMI, kind: 'extend', requestedAt: new Date(T0).toISOString() }]);
    expect(JSON.stringify([g.m.emissions, g.notices])).not.toMatch(/latitude|longitude|precision/);
  });

  it('un Proche et un Sang redemandent après la fin', async () => {
    const g = guichet();

    expect((await g.demander(PROCHE, 'reask')).success).toBe(true);
    expect((await g.demander(SANG, 'reask')).success).toBe(true);
    expect(g.notices.map((n) => [n.requesterId, n.kind])).toEqual([[PROCHE, 'reask'], [SANG, 'reask']]);
  });

  it('sous Ami, la demande est refusée et rien ne part', async () => {
    const g = guichet();

    const ack = await g.demander(CONNAISSANCE, 'reask');

    expect(ack).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.REQUEST_FORBIDDEN });
    expect(g.m.emissions).toEqual([]);
    expect(g.notices).toEqual([]);
    expect(g.held.size).toBe(0);
  });

  it('entre personnes bloquées, la demande est refusée comme sous Ami', async () => {
    const g = guichet();

    expect(await g.demander(BLOQUEUR, 'extend')).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.REQUEST_FORBIDDEN });
    expect(await g.demander(EMETTEUR, 'extend', BLOQUEUR)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.REQUEST_FORBIDDEN });
    expect(g.m.emissions).toEqual([]);
    expect(g.notices).toEqual([]);
  });

  it('vers un compte désactivé, rien ne part', async () => {
    const g = guichet();
    await g.m.ecrireCompte(EMETTEUR, { deactivatedAt: new Date(T0) });

    expect(await g.demander(AMI, 'extend')).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.REQUEST_FORBIDDEN });
    expect(g.notices).toEqual([]);
  });

  it('une charge illisible, une coordonnée glissée ou une demande à soi-même sont refusées', async () => {
    const g = guichet();

    expect(await g.demander(AMI, 'start')).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.INVALID });
    expect(await requestSharedLocation(g.deps, { requesterId: AMI, emitterId: EMETTEUR, payload: { kind: 'extend', latitude: 1 } })).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.INVALID });
    expect(await g.demander(EMETTEUR, 'extend')).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.INVALID });
    expect(g.notices).toEqual([]);
  });
});

describe('le plafond : une demande par paire et par fenêtre (#19204)', () => {
  it('une seconde demande dans la fenêtre est refusée, quel que soit son genre', async () => {
    const g = guichet();
    await g.demander(AMI, 'extend');

    g.m.avancer(SHARED_LOCATION_REQUEST_WINDOW_MINUTES * MINUTE - 1000);
    expect(await g.demander(AMI, 'reask')).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.REQUEST_TOO_SOON });
    expect(g.notices).toHaveLength(1);
  });

  it('la fenêtre passée, on peut redemander', async () => {
    const g = guichet();
    await g.demander(AMI, 'extend');

    g.m.avancer(SHARED_LOCATION_REQUEST_WINDOW_MINUTES * MINUTE + 1000);

    expect((await g.demander(AMI, 'reask')).success).toBe(true);
    expect(g.notices).toHaveLength(2);
  });

  it('le plafond est par paire : un autre demandeur n\'est pas freiné', async () => {
    const g = guichet();
    await g.demander(AMI, 'extend');

    expect((await g.demander(PROCHE, 'extend')).success).toBe(true);
  });
});

describe('aucun effet automatique (#19204)', () => {
  it('demander de prolonger ne prolonge rien : le terme du partage ne bouge pas', async () => {
    const g = guichet();
    await demarrer(g.m);
    const before = await ownSharedLocationFor(g.m.deps, EMETTEUR);

    await g.demander(AMI, 'extend');

    expect(await ownSharedLocationFor(g.m.deps, EMETTEUR)).toEqual(before);
  });
});
