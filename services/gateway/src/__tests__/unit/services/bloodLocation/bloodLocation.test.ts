/**
 * LA POSITION DU SANG (#13937) — l'historique de 30 jours, scellé, que seuls les
 * Sangs consentants lisent ; le fantôme, global ou ciblé, que rien ne trahit ; le
 * journal des consultations, lisible du seul observé ; l'alerte de proximité, une
 * par paire toutes les 2 h. Le monde évalue chaque clause reçue : la loi d'accès et
 * le consentement sont jugés sur les lectures vraies, jamais sur un verdict injecté.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { BLOOD_LOCATION_HISTORY_DAYS } from '@meeshy/shared/types/blood-location';
import {
  eraseBloodLocationHistory,
  listBloodLocationConsultations,
  readBloodLocationHistory,
  recordBloodLocation,
  updateBloodLocationSettings,
} from '../../../../services/bloodLocation/bloodLocationService';
import { ADULT_BIRTH } from '../../../helpers/messaging-circle-world';
import {
  A_300_M,
  A_5_KM,
  AMI,
  AUTRE_MODERATEUR,
  AUTRE_SANG,
  BLOQUE,
  HEURE,
  JOUR,
  LIENS,
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

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
afterEach(() => {
  delete process.env.SECRETS_AT_REST_KEY;
});

describe('enregistrer — scellé, borné à 30 jours, jamais en clair', () => {
  it('range la position scellée, sans coordonnée ni identifiant en clair, pour 30 jours', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const w = bloodWorldAvecConsentements();
    const result = await recordBloodLocation(w.deps, SANG, PARIS);

    expect(result).toEqual({ recorded: true });
    const [row] = w.points.rows;
    expect(row.ownerId).toBe(SANG);
    expect(String(row.sealed).startsWith('v1:')).toBe(true);
    expect(String(row.sealed)).not.toMatch(/48\.8|2\.35|6400000/);
    expect((row.expiresAt as Date).getTime()).toBe(T0 + BLOOD_LOCATION_HISTORY_DAYS * JOUR);
    expect((row.recordedAt as Date).getTime()).toBe(T0);
  });

  it('le fantôme global : rien n\'est enregistré, jamais', async () => {
    const w = bloodWorldAvecConsentements();
    await updateBloodLocationSettings(w.deps, SANG, { ghost: true });
    const result = await recordBloodLocation(w.deps, SANG, PARIS);

    expect(result).toEqual({ recorded: false });
    expect(w.points.rows).toEqual([]);
  });

  it('une position illisible est refusée sans rien ranger', async () => {
    const w = bloodWorldAvecConsentements();
    await expect(recordBloodLocation(w.deps, SANG, { latitude: 91, longitude: 2 })).resolves.toEqual({ recorded: false });
    expect(w.points.rows).toEqual([]);
  });
});

describe('lire l\'historique — Sang consentant seulement', () => {
  it('un Sang qui m\'a accordé l\'historique me rend ses points, du plus récent au plus ancien, déchiffrés', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);
    w.avancer(10 * MINUTE);
    await recordBloodLocation(w.deps, SANG, A_300_M);

    const verdict = await readBloodLocationHistory(w.deps, MOI, SANG, {});

    expect(verdict.kind).toBe('ok');
    if (verdict.kind !== 'ok') return;
    expect(verdict.items.map((p) => [p.latitude, p.longitude, p.recordedAt])).toEqual([
      [A_300_M.latitude, A_300_M.longitude, new Date(T0 + 10 * MINUTE).toISOString()],
      [PARIS.latitude, PARIS.longitude, new Date(T0).toISOString()],
    ]);
    expect(Object.keys(verdict.items[0]).sort()).toEqual(['accuracy', 'latitude', 'longitude', 'recordedAt']);
  });

  it('sans consentement de l\'émetteur, le Sang ne lit rien : RELATION_CONSENT_REQUIRED', async () => {
    const w = bloodLocationWorld({ consents: [[SANG, MOI, { locationHistoryShared: false }]] });
    await recordBloodLocation(w.deps, SANG, PARIS);

    await expect(readBloodLocationHistory(w.deps, MOI, SANG, {})).resolves.toEqual({ kind: 'forbidden', code: 'RELATION_CONSENT_REQUIRED' });
  });

  it('un retrait de consentement coupe la lecture suivante : la base est relue à chaque appel', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);
    expect((await readBloodLocationHistory(w.deps, MOI, SANG, {})).kind).toBe('ok');

    w.consentir(SANG, MOI, { locationHistoryShared: false });

    expect(await readBloodLocationHistory(w.deps, MOI, SANG, {})).toEqual({ kind: 'forbidden', code: 'RELATION_CONSENT_REQUIRED' });
  });

  it('un Proche, un Ami, un bloqué et un inconnu ne lisent rien, même avec un consentement écrit', async () => {
    const w = bloodLocationWorld({
      consents: [PROCHE, AMI, BLOQUE].map((id) => [MOI, id, TOUT_PARTAGE] as const).concat([[MOI, '6400000000000000000000ee', TOUT_PARTAGE]]),
    });
    await recordBloodLocation(w.deps, MOI, PARIS);

    const lecteurs = [PROCHE, AMI, BLOQUE, '6400000000000000000000ee'];
    const verdicts = await Promise.all(lecteurs.map((id) => readBloodLocationHistory(w.deps, id, MOI, {})));
    verdicts.forEach((v) => expect(v.kind).toBe('forbidden'));
  });

  it('chacun lit son propre historique, sans journal de consultation', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, MOI, PARIS);

    const verdict = await readBloodLocationHistory(w.deps, MOI, MOI, {});

    expect(verdict.kind === 'ok' && verdict.items).toHaveLength(1);
    expect(w.consultations.rows).toEqual([]);
  });

  it('la fenêtre `since` et la borne `limit` s\'appliquent', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);
    w.avancer(2 * HEURE);
    await recordBloodLocation(w.deps, SANG, A_300_M);
    w.avancer(2 * HEURE);
    await recordBloodLocation(w.deps, SANG, A_5_KM);

    const recent = await readBloodLocationHistory(w.deps, MOI, SANG, { since: new Date(T0 + HEURE).toISOString(), limit: 1 });

    expect(recent.kind === 'ok' && recent.items.map((p) => p.latitude)).toEqual([A_5_KM.latitude]);
  });

  it('entre deux comptes de l\'équipe, sans lien, l\'historique s\'ouvre dès que le collègue y consent', async () => {
    const w = bloodLocationWorld({
      links: [],
      users: [
        { id: MODERATEUR, birthDate: ADULT_BIRTH, role: 'MODERATOR' },
        { id: AUTRE_MODERATEUR, birthDate: ADULT_BIRTH, role: 'ADMIN' },
      ],
      consents: [[AUTRE_MODERATEUR, MODERATEUR, { locationHistoryShared: true }]],
    });
    await recordBloodLocation(w.deps, AUTRE_MODERATEUR, PARIS);

    expect((await readBloodLocationHistory(w.deps, MODERATEUR, AUTRE_MODERATEUR, {})).kind).toBe('ok');
  });
});

describe('le fantôme — indétectable', () => {
  it('global : le lecteur reçoit la même réponse vide qu\'un Sang sans historique', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);
    const sansFantome = await readBloodLocationHistory(w.deps, MOI, AUTRE_SANG, {});

    await updateBloodLocationSettings(w.deps, SANG, { ghost: true });
    const fantome = await readBloodLocationHistory(w.deps, MOI, SANG, {});

    expect(fantome).toEqual(sansFantome.kind === 'ok' ? { kind: 'ok', items: [] } : sansFantome);
    expect(fantome).toEqual({ kind: 'ok', items: [] });
  });

  it('ciblé : un seul lecteur est masqué, et la période reste cachée même après la levée', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const w = bloodWorldAvecConsentements({});
    w.consentir(SANG, AUTRE_SANG, TOUT_PARTAGE);
    await recordBloodLocation(w.deps, SANG, PARIS);
    await updateBloodLocationSettings(w.deps, SANG, { ghost: true, userId: MOI });
    w.avancer(MINUTE);
    await recordBloodLocation(w.deps, SANG, A_300_M);
    await updateBloodLocationSettings(w.deps, SANG, { ghost: false, userId: MOI });
    w.avancer(MINUTE);
    await recordBloodLocation(w.deps, SANG, A_5_KM);

    const moi = await readBloodLocationHistory(w.deps, MOI, SANG, {});
    expect(moi.kind === 'ok' && moi.items.map((p) => p.latitude)).toEqual([A_5_KM.latitude, PARIS.latitude]);
    expect(JSON.stringify(w.points.rows)).not.toContain(MOI);
  });

  it('une consultation d\'un compte en fantôme est tout de même notée, sans rien révéler au lecteur', async () => {
    const w = bloodWorldAvecConsentements();
    await updateBloodLocationSettings(w.deps, SANG, { ghost: true });

    await readBloodLocationHistory(w.deps, MOI, SANG, {});

    expect(w.consultations.rows).toHaveLength(1);
  });
});

describe('le journal des consultations — du seul observé', () => {
  it('chaque lecture d\'un autre est notée ; l\'observé lit qui l\'a consulté, personne d\'autre', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, SANG, PARIS);
    await readBloodLocationHistory(w.deps, MOI, SANG, {});
    w.avancer(MINUTE);
    await readBloodLocationHistory(w.deps, MOI, SANG, {});

    const journal = await listBloodLocationConsultations(w.deps, SANG);
    expect(journal.items.map((c) => [c.observerId, c.consultedAt])).toEqual([
      [MOI, new Date(T0 + MINUTE).toISOString()],
      [MOI, new Date(T0).toISOString()],
    ]);
    expect(journal.excessive).toBe(false);
    expect((await listBloodLocationConsultations(w.deps, MOI)).items).toEqual([]);
  });

  it('un refus de lecture ne laisse aucune trace dans le journal', async () => {
    const w = bloodLocationWorld({ consents: [[SANG, MOI, { locationHistoryShared: false }]] });
    await readBloodLocationHistory(w.deps, MOI, SANG, {});
    expect(w.consultations.rows).toEqual([]);
  });

  it('au-delà de 20 consultations d\'un même observateur en 24 h, le journal le dit', async () => {
    const w = bloodWorldAvecConsentements();
    for (let i = 0; i < 21; i += 1) {
      await readBloodLocationHistory(w.deps, MOI, SANG, {});
      w.avancer(MINUTE);
    }
    const journal = await listBloodLocationConsultations(w.deps, SANG);
    expect(journal.excessive).toBe(true);
    expect(journal.excessiveObserverIds).toEqual([MOI]);
  });

  it('les consultations de plus de 30 jours ne sont plus servies', async () => {
    const w = bloodWorldAvecConsentements();
    await readBloodLocationHistory(w.deps, MOI, SANG, {});
    w.avancer(31 * JOUR);
    expect((await listBloodLocationConsultations(w.deps, SANG)).items).toEqual([]);
  });
});

describe('effacer — chacun efface le sien', () => {
  it('efface tout l\'historique du compte, et lui seul', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, MOI, PARIS);
    await recordBloodLocation(w.deps, SANG, PARIS);

    await expect(eraseBloodLocationHistory(w.deps, MOI)).resolves.toEqual({ erased: 1 });
    expect(w.points.rows.map((r) => r.ownerId)).toEqual([SANG]);
  });
});

describe('la proximité — une alerte aux deux, une par paire toutes les 2 h', () => {
  const proxi = () => bloodWorldAvecConsentements();

  it('deux Sangs qui se partagent la proximité, à 300 m : les deux reçoivent l\'alerte, sans coordonnée', async () => {
    const w = proxi();
    await recordBloodLocation(w.deps, SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, A_300_M);

    const versMoi = w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY);
    const versSang = w.vers(SANG, SERVER_EVENTS.BLOOD_PROXIMITY);
    expect(versMoi.map((e) => e.data.userId)).toEqual([SANG]);
    expect(versSang.map((e) => e.data.userId)).toEqual([MOI]);
    expect(JSON.stringify([...versMoi, ...versSang])).not.toMatch(/48\.8|2\.35|latitude|longitude/);
  });

  it('une seule alerte par paire toutes les 2 h, puis de nouveau', async () => {
    const w = proxi();
    await recordBloodLocation(w.deps, SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, A_300_M);
    w.avancer(30 * MINUTE);
    await recordBloodLocation(w.deps, MOI, A_300_M);
    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY)).toHaveLength(1);

    w.avancer(2 * HEURE);
    await recordBloodLocation(w.deps, SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, A_300_M);
    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY)).toHaveLength(2);
  });

  it('rien si l\'un des deux ne partage pas la proximité', async () => {
    const w = bloodLocationWorld({ consents: [[SANG, MOI, TOUT_PARTAGE], [MOI, SANG, { proximityShared: false }]] });
    await recordBloodLocation(w.deps, SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, A_300_M);
    expect(w.emissions).toEqual([]);
  });

  it('rien si l\'un des deux est en fantôme, global ou ciblé', async () => {
    const global = proxi();
    await updateBloodLocationSettings(global.deps, SANG, { ghost: true });
    await recordBloodLocation(global.deps, SANG, PARIS);
    await recordBloodLocation(global.deps, MOI, A_300_M);
    expect(global.emissions).toEqual([]);

    const cible = proxi();
    await recordBloodLocation(cible.deps, SANG, PARIS);
    await updateBloodLocationSettings(cible.deps, SANG, { ghost: true, userId: MOI });
    await recordBloodLocation(cible.deps, MOI, A_300_M);
    expect(cible.emissions).toEqual([]);
  });

  it('rien au-delà du rayon réglé, et un rayon réglé plus large déclenche à l\'évaluation suivante de la paire', async () => {
    const w = proxi();
    await recordBloodLocation(w.deps, SANG, A_5_KM);
    await recordBloodLocation(w.deps, MOI, PARIS);
    expect(w.emissions).toEqual([]);

    await updateBloodLocationSettings(w.deps, MOI, { userId: SANG, proximityRadiusMeters: 5000 });
    await updateBloodLocationSettings(w.deps, SANG, { userId: MOI, proximityRadiusMeters: 5000 });
    w.avancer(15 * MINUTE);
    await recordBloodLocation(w.deps, MOI, PARIS);
    expect(w.vers(SANG, SERVER_EVENTS.BLOOD_PROXIMITY)).toHaveLength(1);
  });

  it('une position de l\'autre vieille de plus d\'une heure ne compte pas', async () => {
    const w = proxi();
    await recordBloodLocation(w.deps, SANG, PARIS);
    w.avancer(90 * MINUTE);
    await recordBloodLocation(w.deps, MOI, A_300_M);
    expect(w.emissions).toEqual([]);
  });

  it('un magasin de cadence en panne : aucune alerte, et l\'enregistrement réussit quand même', async () => {
    const w = bloodWorldAvecConsentements({ cooldownDown: true });
    await recordBloodLocation(w.deps, SANG, PARIS);
    await expect(recordBloodLocation(w.deps, MOI, A_300_M)).resolves.toEqual({ recorded: true });
    expect(w.emissions).toEqual([]);
  });

  it('un retrait de la proximité coupe l\'alerte suivante : le consentement est relu en base à chaque émission', async () => {
    const w = proxi();
    await recordBloodLocation(w.deps, SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, A_300_M);
    expect(w.vers(SANG, SERVER_EVENTS.BLOOD_PROXIMITY)).toHaveLength(1);

    w.consentir(SANG, MOI, { proximityShared: false });
    w.avancer(3 * HEURE);
    await recordBloodLocation(w.deps, SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, A_300_M);

    expect(w.vers(SANG, SERVER_EVENTS.BLOOD_PROXIMITY)).toHaveLength(1);
    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY)).toHaveLength(1);
  });

  it('un Proche ou un Ami voisin ne reçoit jamais d\'alerte', async () => {
    const w = bloodLocationWorld({ consents: [[PROCHE, MOI, TOUT_PARTAGE], [MOI, PROCHE, TOUT_PARTAGE]] });
    await recordBloodLocation(w.deps, PROCHE, PARIS);
    await recordBloodLocation(w.deps, MOI, A_300_M);
    expect(w.emissions).toEqual([]);
  });
});

describe('le drapeau vaut pour les DEUX comptes — hors liste blanche, rien ne part ni ne se sert', () => {
  it('un Sang sorti de la liste blanche ne reçoit plus aucune alerte, et son voisin non plus à cause de lui', async () => {
    const w = bloodWorldAvecConsentements({ horsDrapeau: [SANG] });
    await recordBloodLocation(w.deps, SANG, PARIS);

    await recordBloodLocation(w.deps, MOI, A_300_M);

    expect(w.emissions).toEqual([]);
  });

  it('l\'historique rangé avant la sortie de la liste blanche n\'est plus servi, et la lecture ne laisse aucune trace', async () => {
    const w = bloodWorldAvecConsentements({ horsDrapeau: [SANG] });
    await recordBloodLocation(w.deps, SANG, PARIS);

    await expect(readBloodLocationHistory(w.deps, MOI, SANG, {})).resolves.toEqual({ kind: 'ok', items: [] });
    expect(w.consultations.rows).toEqual([]);
  });
});

describe('les réglages', () => {
  it('le rayon est borné entre 100 m et 5 km', async () => {
    const w = bloodWorldAvecConsentements();
    await updateBloodLocationSettings(w.deps, MOI, { userId: SANG, proximityRadiusMeters: 10 });
    expect(w.settings.rows.find((r) => r.ownerId === MOI && r.otherId === SANG)?.proximityRadiusMeters).toBe(100);
    await updateBloodLocationSettings(w.deps, MOI, { userId: SANG, proximityRadiusMeters: 90_000 });
    expect(w.settings.rows.find((r) => r.ownerId === MOI && r.otherId === SANG)?.proximityRadiusMeters).toBe(5000);
  });

  it('un fantôme ou un rayon ne se règle que pour quelqu\'un à qui la position du Sang peut s\'ouvrir : ni inconnu, ni compte inexistant, ni Proche', async () => {
    const w = bloodWorldAvecConsentements();
    const inexistant = '6400000000000000000000ee';

    const refus = await Promise.all([inexistant, PROCHE, BLOQUE].map((userId) => updateBloodLocationSettings(w.deps, MOI, { userId, ghost: true, proximityRadiusMeters: 300 })));

    expect(refus).toEqual([{ ok: false }, { ok: false }, { ok: false }]);
    expect(w.settings.rows.filter((r) => r.ownerId === MOI && [inexistant, PROCHE, BLOQUE].includes(String(r.otherId)))).toEqual([]);
    await expect(updateBloodLocationSettings(w.deps, MOI, { userId: SANG, ghost: true })).resolves.toEqual({ ok: true });
  });

  it('entre deux comptes de l\'équipe, sans lien, le fantôme ciblé se règle', async () => {
    const w = bloodLocationWorld({
      links: [],
      users: [
        { id: MODERATEUR, birthDate: ADULT_BIRTH, role: 'MODERATOR' },
        { id: AUTRE_MODERATEUR, birthDate: ADULT_BIRTH, role: 'ADMIN' },
      ],
    });
    await expect(updateBloodLocationSettings(w.deps, MODERATEUR, { userId: AUTRE_MODERATEUR, ghost: true })).resolves.toEqual({ ok: true });
  });

  it('LIENS reste le cercle de référence du monde', () => {
    expect(LIENS.some(([, , level]) => level === 'BLOOD')).toBe(true);
  });
});
