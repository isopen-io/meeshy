/**
 * NE PLUS RECEVOIR LA POSITION CONTINUE D'UN SANG (#19454) — une préférence de RÉCEPTION du
 * lecteur, posée sur SA ligne (`bloodLocationMutedAt`), jamais un retrait du consentement de
 * l'émetteur. Le lecteur ne reçoit plus l'alerte de proximité de cette paire ; l'émetteur garde la
 * sienne, et rien ne lui dit que l'autre a coupé.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { recordBloodLocation } from '../../../../services/bloodLocation/bloodLocationService';
import { settled } from '../../../helpers/settled';
import { bloodLocationMutedBy } from '../../../../services/bloodLocation/bloodLocationMute';
import { ADULT_BIRTH } from '../../../helpers/messaging-circle-world';
import {
  A_300_M,
  AUTRE_MODERATEUR,
  AUTRE_SANG,
  MINUTE,
  MODERATEUR,
  MOI,
  PARIS,
  SANG,
  TOUT_PARTAGE,
  bloodLocationWorld,
  bloodWorldAvecConsentements,
  type BloodLocationWorld,
} from '../../../helpers/blood-location-world';

const COUPE = new Date('2026-11-09T11:00:00.000Z');

/** SANG enregistre près de MOI, puis MOI enregistre : une évaluation de la paire. */
async function rencontre(w: BloodLocationWorld, lecteur: string, emetteur: string): Promise<void> {
  await settled(recordBloodLocation(w.deps, emetteur, PARIS));
  w.poser(lecteur, A_300_M, w.horloge() - MINUTE);
  await settled(recordBloodLocation(w.deps, lecteur, A_300_M));
}

describe('#19454 — la proximité d\'un Sang que j\'ai coupé ne m\'arrive plus', () => {
  it('MOI a coupé SANG : MOI ne reçoit plus l\'alerte, SANG la reçoit toujours, sans rien savoir', async () => {
    const w = bloodWorldAvecConsentements();
    w.consentir(MOI, SANG, { ...TOUT_PARTAGE, bloodLocationMutedAt: COUPE });
    await rencontre(w, MOI, SANG);

    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY)).toEqual([]);
    expect(w.vers(SANG, SERVER_EVENTS.BLOOD_PROXIMITY).map((e) => e.data)).toEqual([{ userId: MOI, distanceMeters: 500 }]);
  });

  it('dans l\'autre sens aussi : quand c\'est l\'émetteur du nouveau point qui a coupé', async () => {
    const w = bloodWorldAvecConsentements();
    w.consentir(SANG, MOI, { ...TOUT_PARTAGE, bloodLocationMutedAt: COUPE });
    await rencontre(w, MOI, SANG);

    expect(w.vers(SANG, SERVER_EVENTS.BLOOD_PROXIMITY)).toEqual([]);
    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY).map((e) => e.data.userId)).toEqual([SANG]);
  });

  it('couper un Sang ne coupe pas un autre Sang', async () => {
    const w = bloodWorldAvecConsentements();
    w.consentir(MOI, SANG, { ...TOUT_PARTAGE, bloodLocationMutedAt: COUPE });
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    await settled(recordBloodLocation(w.deps, AUTRE_SANG, PARIS));
    w.poser(MOI, A_300_M, w.horloge() - MINUTE);
    await settled(recordBloodLocation(w.deps, MOI, A_300_M));

    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY).map((e) => e.data.userId)).toEqual([AUTRE_SANG]);
  });

  it('rouvert, l\'alerte revient', async () => {
    const w = bloodWorldAvecConsentements();
    w.consentir(MOI, SANG, { ...TOUT_PARTAGE, bloodLocationMutedAt: null });
    await rencontre(w, MOI, SANG);

    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY).map((e) => e.data.userId)).toEqual([SANG]);
  });

  it('entre deux collègues de l\'équipe, sans lien, la coupure vaut de même', async () => {
    const w = bloodLocationWorld({
      links: [],
      users: [
        { id: MODERATEUR, birthDate: ADULT_BIRTH, role: 'MODERATOR' },
        { id: AUTRE_MODERATEUR, birthDate: ADULT_BIRTH, role: 'ADMIN' },
      ],
      consents: [
        [MODERATEUR, AUTRE_MODERATEUR, { ...TOUT_PARTAGE, bloodLocationMutedAt: COUPE }],
        [AUTRE_MODERATEUR, MODERATEUR, TOUT_PARTAGE],
      ],
    });
    await rencontre(w, MODERATEUR, AUTRE_MODERATEUR);

    expect(w.vers(MODERATEUR, SERVER_EVENTS.BLOOD_PROXIMITY)).toEqual([]);
    expect(w.vers(AUTRE_MODERATEUR, SERVER_EVENTS.BLOOD_PROXIMITY).map((e) => e.data.userId)).toEqual([MODERATEUR]);
  });
});

describe('#19454 — bloodLocationMutedBy, le site unique de la coupure', () => {
  it('rend les émetteurs que CE lecteur a coupés, jamais ceux qui l\'ont coupé', async () => {
    const w = bloodWorldAvecConsentements();
    w.consentir(MOI, SANG, { bloodLocationMutedAt: COUPE });
    w.consentir(AUTRE_SANG, MOI, { bloodLocationMutedAt: COUPE });

    const coupes = await bloodLocationMutedBy(w.deps.prisma, MOI, [SANG, AUTRE_SANG]);

    expect([...coupes]).toEqual([SANG]);
  });

  it('aucun émetteur demandé : aucune lecture', async () => {
    const w = bloodWorldAvecConsentements();
    const coupes = await bloodLocationMutedBy(w.deps.prisma, MOI, []);

    expect(coupes.size).toBe(0);
  });
});
