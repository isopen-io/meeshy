/**
 * LA CARTE D'UN SANG SUIT SA POSITION CONTINUE EN DIRECT (#19400) : chaque point enregistré
 * envoie `location:blood-moved` { userId, at } — SANS coordonnée — à la room `user:<lecteur>` de
 * chaque compte qui pourrait LIRE l'historique de l'émetteur à cet instant (drapeau des deux
 * comptes, loi `location.history`, consentement relu), sauf ceux qu'un fantôme ciblé masque et ceux
 * qui ont coupé sa position continue ; au plus un signal par paire et par fenêtre. Le client relit
 * alors la carte : la lecture reste la seule porte des coordonnées, et du journal.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { BLOOD_MOVED_SIGNAL_SECONDS } from '@meeshy/shared/types/blood-location';
import { recordBloodLocation, updateBloodLocationSettings } from '../../../../services/bloodLocation/bloodLocationService';
import { ADULT_BIRTH } from '../../../helpers/messaging-circle-world';
import {
  A_300_M,
  A_5_KM,
  AMI,
  AUTRE_MODERATEUR,
  AUTRE_SANG,
  MINUTE,
  MODERATEUR,
  MOI,
  PARIS,
  PROCHE,
  SANG,
  T0,
  TOUT_PARTAGE,
  bloodLocationWorld,
  bloodWorldAvecConsentements,
  type BloodLocationWorld,
} from '../../../helpers/blood-location-world';

const BOUGE = SERVER_EVENTS.BLOOD_MOVED;
const recus = (w: BloodLocationWorld, lecteur: string) => w.vers(lecteur, BOUGE).map((e) => e.data);

describe('#19400 — le signal part aux lecteurs autorisés, sans coordonnée', () => {
  it('SANG enregistre : MOI reçoit { userId, at } et rien d\'autre — ni latitude, ni précision', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);

    expect(recus(w, MOI)).toEqual([{ userId: SANG, at: new Date(T0).toISOString() }]);
    expect(JSON.stringify(w.vers(MOI, BOUGE))).not.toMatch(/48\.8|2\.35|latitude|accuracy/);
  });

  it('l\'émetteur ne se le renvoie pas, et un autre Sang qui ne reçoit pas son historique n\'a rien', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);

    expect(w.vers(SANG, BOUGE)).toEqual([]);
    expect(w.vers(AUTRE_SANG, BOUGE)).toEqual([]);
  });

  it('un Proche et un Ami, même avec un consentement écrit, ne reçoivent rien : la loi est celle de l\'historique', async () => {
    const w = bloodLocationWorld({ consents: [[MOI, PROCHE, TOUT_PARTAGE], [MOI, AMI, TOUT_PARTAGE], [MOI, SANG, TOUT_PARTAGE]] });
    await recordBloodLocation(w.deps, MOI, PARIS);

    expect(w.vers(PROCHE, BOUGE)).toEqual([]);
    expect(w.vers(AMI, BOUGE)).toEqual([]);
    expect(recus(w, SANG).map((d) => d.userId)).toEqual([MOI]);
  });

  it('sans le consentement « historique » de l\'émetteur, rien — même avec la proximité accordée', async () => {
    const w = bloodLocationWorld({ consents: [[SANG, MOI, { proximityShared: true, locationHistoryShared: false }]] });
    await recordBloodLocation(w.deps, SANG, PARIS);

    expect(w.vers(MOI, BOUGE)).toEqual([]);
  });

  it('un retrait du consentement coupe le signal suivant : la base est relue à chaque point', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);
    w.consentir(SANG, MOI, { locationHistoryShared: false });
    w.avancer(10 * MINUTE);
    await recordBloodLocation(w.deps, SANG, A_300_M);

    expect(recus(w, MOI)).toHaveLength(1);
  });
});

describe('#19400 — ce qui masque, et ce que le lecteur a coupé', () => {
  it('un fantôme ciblé sur MOI : MOI ne reçoit rien, AUTRE_SANG reçoit toujours', async () => {
    const w = bloodWorldAvecConsentements({ consents: [[SANG, MOI, TOUT_PARTAGE], [SANG, AUTRE_SANG, TOUT_PARTAGE]], links: [[MOI, SANG, 'BLOOD'], [SANG, AUTRE_SANG, 'BLOOD']] });
    await updateBloodLocationSettings(w.deps, SANG, { ghost: true, userId: MOI });
    await recordBloodLocation(w.deps, SANG, PARIS);

    expect(w.vers(MOI, BOUGE)).toEqual([]);
    expect(recus(w, AUTRE_SANG).map((d) => d.userId)).toEqual([SANG]);
  });

  it('le fantôme global : rien n\'est rangé, rien ne part', async () => {
    const w = bloodWorldAvecConsentements();
    await updateBloodLocationSettings(w.deps, SANG, { ghost: true });
    await recordBloodLocation(w.deps, SANG, PARIS);

    expect(w.emissions).toEqual([]);
  });

  it('MOI a coupé la position continue de SANG : MOI ne reçoit rien, et SANG n\'en sait rien', async () => {
    const w = bloodWorldAvecConsentements();
    w.consentir(MOI, SANG, { ...TOUT_PARTAGE, bloodLocationMutedAt: new Date(T0 - MINUTE) });
    await recordBloodLocation(w.deps, SANG, PARIS);

    expect(w.vers(MOI, BOUGE)).toEqual([]);
    expect(w.vers(SANG)).toEqual([]);
  });

  it('un point arrivé à une vitesse impossible ne bouge pas l\'épingle', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);
    w.avancer(BLOOD_MOVED_SIGNAL_SECONDS * 1000 + 1000);
    await recordBloodLocation(w.deps, SANG, { latitude: 40.4168, longitude: -3.7038, accuracy: 5 });

    expect(recus(w, MOI)).toHaveLength(1);
  });
});

describe('#19400 — le drapeau des deux comptes, la cadence, la panne', () => {
  it('un lecteur hors drapeau ne reçoit rien ; un émetteur hors drapeau n\'envoie rien', async () => {
    const lecteurHors = bloodWorldAvecConsentements({ horsDrapeau: [MOI] });
    await recordBloodLocation(lecteurHors.deps, SANG, PARIS);
    expect(lecteurHors.vers(MOI, BOUGE)).toEqual([]);

    const emetteurHors = bloodWorldAvecConsentements({ horsDrapeau: [SANG] });
    await recordBloodLocation(emetteurHors.deps, SANG, PARIS);
    expect(emetteurHors.vers(MOI, BOUGE)).toEqual([]);
  });

  it('une rafale de points : un signal par paire et par fenêtre, puis le suivant après elle', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);
    w.avancer(5_000);
    await recordBloodLocation(w.deps, SANG, A_300_M);
    w.avancer(5_000);
    await recordBloodLocation(w.deps, SANG, PARIS);
    expect(recus(w, MOI)).toHaveLength(1);

    w.avancer(BLOOD_MOVED_SIGNAL_SECONDS * 1000);
    await recordBloodLocation(w.deps, SANG, A_300_M);
    expect(recus(w, MOI).map((d) => d.at)).toEqual([new Date(T0).toISOString(), new Date(w.horloge()).toISOString()]);
  });

  it('la cadence d\'une paire ne retient pas celle d\'une autre', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);
    await recordBloodLocation(w.deps, AUTRE_SANG, A_5_KM);

    expect(recus(w, MOI).map((d) => d.userId)).toEqual([SANG, AUTRE_SANG]);
  });

  it('un magasin de cadence en panne : aucun signal, et l\'enregistrement réussit', async () => {
    const w = bloodWorldAvecConsentements({ cooldownDown: true });
    await expect(recordBloodLocation(w.deps, SANG, PARIS)).resolves.toEqual({ recorded: true });

    expect(w.vers(MOI, BOUGE)).toEqual([]);
  });

  it('le signal n\'écrit rien au journal des consultations : seule la relecture y compte', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);

    expect(w.consultations.rows).toEqual([]);
  });

  it('entre deux collègues de l\'équipe, sans lien, le signal suit la même loi', async () => {
    const w = bloodLocationWorld({
      links: [],
      users: [
        { id: MODERATEUR, birthDate: ADULT_BIRTH, role: 'MODERATOR' },
        { id: AUTRE_MODERATEUR, birthDate: ADULT_BIRTH, role: 'ADMIN' },
      ],
      consents: [[AUTRE_MODERATEUR, MODERATEUR, TOUT_PARTAGE]],
    });
    await recordBloodLocation(w.deps, AUTRE_MODERATEUR, PARIS);

    expect(recus(w, MODERATEUR).map((d) => d.userId)).toEqual([AUTRE_MODERATEUR]);
  });
});
