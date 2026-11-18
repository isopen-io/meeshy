/**
 * LA CARTE DE TOUS MES PROCHES — le dernier point de chaque Sang (#19202). Un appel au lieu
 * d'un par Sang : chaque Sang qui me consent l'historique y figure par son dernier point,
 * jugé exactement comme l'historique (loi d'accès, consentement relu, drapeau des deux
 * comptes, fantôme global et ciblé), et le journal des consultations ne prend qu'une ligne
 * par Sang et par quart d'heure, quel que soit le rythme des rafraîchissements.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { BLOOD_MAP_CONSULTATION_WINDOW_MINUTES } from '@meeshy/shared/types/blood-location';
import { bloodLocationMapFor } from '../../../../services/bloodLocation/bloodLocationMap';
import { readBloodLocationHistory, recordBloodLocation, updateBloodLocationSettings } from '../../../../services/bloodLocation/bloodLocationService';
import { settled } from '../../../helpers/settled';
import { ADULT_BIRTH } from '../../../helpers/messaging-circle-world';
import {
  A_300_M,
  A_5_KM,
  AMI,
  AUTRE_MODERATEUR,
  AUTRE_SANG,
  BLOQUE,
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
} from '../../../helpers/blood-location-world';

const FENETRE = BLOOD_MAP_CONSULTATION_WINDOW_MINUTES * MINUTE;
const ids = (items: readonly { readonly userId: string }[]) => items.map((item) => item.userId).sort();

describe('le dernier point de chaque Sang, en un appel', () => {
  it('chaque Sang qui me consent l\'historique sert son DERNIER point, exact, daté, avec son cercle — rien d\'autre', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    w.avancer(10 * MINUTE);
    await settled(recordBloodLocation(w.deps, SANG, A_300_M));
    await settled(recordBloodLocation(w.deps, AUTRE_SANG, A_5_KM));

    const items = await bloodLocationMapFor(w.deps, MOI);

    expect(ids(items)).toEqual([SANG, AUTRE_SANG].sort());
    const sang = items.find((item) => item.userId === SANG);
    expect(sang).toEqual({ userId: SANG, latitude: A_300_M.latitude, longitude: A_300_M.longitude, accuracy: A_300_M.accuracy, recordedAt: new Date(T0 + 10 * MINUTE).toISOString(), circle: 'BLOOD' });
  });

  it('un Sang sans point ne figure pas', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));

    expect(ids(await bloodLocationMapFor(w.deps, MOI))).toEqual([SANG]);
  });

  it('sans consentement de l\'émetteur, ou dès son retrait, le Sang n\'y est plus', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    await settled(recordBloodLocation(w.deps, AUTRE_SANG, PARIS));
    w.consentir(SANG, MOI, { locationHistoryShared: false });

    expect(ids(await bloodLocationMapFor(w.deps, MOI))).toEqual([AUTRE_SANG]);
  });

  it('un Proche, un Ami et un bloqué ne lisent rien, même avec un consentement écrit', async () => {
    const w = bloodLocationWorld({ consents: [PROCHE, AMI, BLOQUE].map((id) => [MOI, id, TOUT_PARTAGE] as const) });
    await settled(recordBloodLocation(w.deps, MOI, PARIS));

    const lus = await Promise.all([PROCHE, AMI, BLOQUE].map((id) => bloodLocationMapFor(w.deps, id)));

    lus.forEach((items) => expect(items).toEqual([]));
    expect(w.consultations.rows).toEqual([]);
  });

  it('entre deux comptes de l\'équipe, sans lien, le point s\'ouvre dès que le collègue y consent', async () => {
    const w = bloodLocationWorld({
      links: [],
      users: [
        { id: MODERATEUR, birthDate: ADULT_BIRTH, role: 'MODERATOR' },
        { id: AUTRE_MODERATEUR, birthDate: ADULT_BIRTH, role: 'ADMIN' },
      ],
      consents: [[AUTRE_MODERATEUR, MODERATEUR, { locationHistoryShared: true }]],
    });
    await settled(recordBloodLocation(w.deps, AUTRE_MODERATEUR, PARIS));

    expect(ids(await bloodLocationMapFor(w.deps, MODERATEUR))).toEqual([AUTRE_MODERATEUR]);
  });
});

describe('la coupure du lecteur (#19454) — ni point, ni journal', () => {
  it('un Sang que j\'ai coupé manque à ma carte, et son journal ne prend aucune ligne de moi', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    await settled(recordBloodLocation(w.deps, AUTRE_SANG, A_5_KM));
    w.consentir(MOI, SANG, { ...TOUT_PARTAGE, bloodLocationMutedAt: new Date(T0 - MINUTE) });

    expect(ids(await bloodLocationMapFor(w.deps, MOI))).toEqual([AUTRE_SANG]);
    expect(w.consultations.rows.map((row) => row.observedId)).toEqual([AUTRE_SANG]);
  });

  it('la coupure posée PAR l\'émetteur sur moi ne me retire pas son point : c\'est une préférence de réception', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    w.consentir(SANG, MOI, { ...TOUT_PARTAGE, bloodLocationMutedAt: new Date(T0 - MINUTE) });

    expect(ids(await bloodLocationMapFor(w.deps, MOI))).toEqual([SANG]);
  });
});

describe('le drapeau éteint — aucune entrée, aucun journal', () => {
  it('hors drapeau pour le lecteur, rien n\'est lu ni noté', async () => {
    const w = bloodWorldAvecConsentements({ horsDrapeau: [MOI] });
    await settled(recordBloodLocation(w.deps, SANG, PARIS));

    expect(await bloodLocationMapFor(w.deps, MOI)).toEqual([]);
    expect(w.consultations.rows).toEqual([]);
  });

  it('hors drapeau pour un Sang, lui seul manque, sans ligne au journal', async () => {
    const w = bloodWorldAvecConsentements({ horsDrapeau: [SANG] });
    await settled(recordBloodLocation(w.deps, AUTRE_SANG, PARIS));
    w.poser(SANG, { latitude: 48.85, longitude: 2.35 });

    expect(ids(await bloodLocationMapFor(w.deps, MOI))).toEqual([AUTRE_SANG]);
    expect(w.consultations.rows.map((row) => row.observedId)).toEqual([AUTRE_SANG]);
  });
});

describe('le fantôme — comme l\'historique', () => {
  it('global : le Sang manque comme s\'il n\'avait aucun point, et la consultation est notée', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    await updateBloodLocationSettings(w.deps, SANG, { ghost: true });

    expect(await bloodLocationMapFor(w.deps, MOI)).toEqual([]);
    expect(w.consultations.rows.filter((row) => row.observedId === SANG)).toHaveLength(1);
  });

  it('ciblé : masqué pour moi seul ; levé, la période reste cachée et le dernier point d\'avant revient', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    await updateBloodLocationSettings(w.deps, SANG, { ghost: true, userId: MOI });
    w.avancer(MINUTE);
    await settled(recordBloodLocation(w.deps, SANG, A_300_M));

    expect(await bloodLocationMapFor(w.deps, MOI)).toEqual([]);
    expect(await readBloodLocationHistory(w.deps, MOI, SANG, {})).toEqual({ kind: 'ok', items: [] });

    await updateBloodLocationSettings(w.deps, SANG, { ghost: false, userId: MOI });
    expect((await bloodLocationMapFor(w.deps, MOI)).map((item) => item.latitude)).toEqual([PARIS.latitude]);
  });
});

describe('le journal — une ligne par Sang et par quart d\'heure, pas une par rafraîchissement', () => {
  it('dix rafraîchissements dans la fenêtre laissent une ligne par Sang', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    await settled(recordBloodLocation(w.deps, AUTRE_SANG, PARIS));

    for (let i = 0; i < 10; i += 1) {
      await bloodLocationMapFor(w.deps, MOI);
      w.avancer(MINUTE);
    }

    expect(w.consultations.rows.map((row) => row.observedId).sort()).toEqual([SANG, AUTRE_SANG].sort());
  });

  it('un rafraîchissement dans la fenêtre lit le journal en UNE requête, quel que soit le nombre de Sangs', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    await settled(recordBloodLocation(w.deps, AUTRE_SANG, PARIS));
    await bloodLocationMapFor(w.deps, MOI);
    w.avancer(MINUTE);
    const counts = jest.spyOn(w.consultations, 'count');
    const lists = jest.spyOn(w.consultations, 'findMany');

    await bloodLocationMapFor(w.deps, MOI);

    expect(counts.mock.calls.length + lists.mock.calls.length).toBe(1);
  });

  it('passé la fenêtre, la lecture suivante ajoute une ligne', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    await bloodLocationMapFor(w.deps, MOI);
    w.avancer(FENETRE);

    await bloodLocationMapFor(w.deps, MOI);

    expect(w.consultations.rows.filter((row) => row.observedId === SANG).map((row) => (row.consultedAt as Date).getTime())).toEqual([T0, T0 + FENETRE]);
  });

  it('une lecture d\'historique dans la fenêtre compte : la carte ne la double pas', async () => {
    const w = bloodWorldAvecConsentements();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    await readBloodLocationHistory(w.deps, MOI, SANG, {});
    w.avancer(MINUTE);

    await bloodLocationMapFor(w.deps, MOI);

    expect(w.consultations.rows.filter((row) => row.observedId === SANG)).toHaveLength(1);
  });
});
