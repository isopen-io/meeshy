/**
 * LE PARTAGE TEMPORAIRE DE POSITION À DES PERSONNES (#14109, #16980) — l'émetteur
 * envoie sa position COMPLÈTE, le serveur la garde scellée et la TRONQUE destinataire
 * par destinataire : rien hors des destinataires choisis, rien sous Ami, rien à un
 * bloqueur ; la précision que l'émetteur a donnée, sans rien de plus riche à côté.
 * Une baisse efface chez qui voyait ; une remontée fait revenir la dernière position.
 *
 * Le monde évalue chaque clause reçue (`messagingWorld`) : la loi est jugée sur les
 * lectures vraies, jamais sur un verdict injecté.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { SHARED_LOCATION_ERROR_CODES } from '@meeshy/shared/types/shared-location';
import {
  captureSharedLocationAccess,
  endSharedLocationOfAccount,
  projectSharedLocation,
  refreshSharedLocationBetween,
  sharedLocationSnapshotFor,
  startSharedLocation,
  stopSharedLocation,
  updateSharedLocation,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { readSharedLocation } from '../../../../services/sharedLocation/sharedLocationStore';
import { AMI, BLOQUEUR, CONNAISSANCE, demarrer, EMETTEUR, HEURE, monde, NON_CHOISI, PARIS, PLUS_LOIN, PROCHE, SANG, T0, TOUS } from '../../../helpers/shared-location-relay-world';

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
afterEach(() => {
  delete process.env.SECRETS_AT_REST_KEY;
});

describe('la projection — la précision donnée, rien de plus riche à côté', () => {
  const state = {
    recipients: [],
    position: PARIS,
    updatedAt: new Date(T0).toISOString(),
    expiresAt: new Date(T0 + HEURE).toISOString(),
  };

  it('exacte : la position et la précision de l\'appareil, jamais sous 10 m', () => {
    expect(projectSharedLocation(EMETTEUR, state, { precision: 'exact', circle: 'FRIEND' })).toEqual({
      userId: EMETTEUR,
      latitude: 48.8566,
      longitude: 2.3522,
      precision: 'exact',
      radiusMeters: 10,
      circle: 'FRIEND',
      updatedAt: state.updatedAt,
      expiresAt: state.expiresAt,
    });
  });

  it('quartier et ville : le centre de la maille et le rayon du flou, ni la position ni la précision réelles', () => {
    expect(projectSharedLocation(EMETTEUR, state, { precision: 'neighborhood', circle: 'CLOSE' })).toMatchObject({ latitude: 48.855, longitude: 2.355, precision: 'neighborhood', radiusMeters: 1200, circle: 'CLOSE' });
    expect(projectSharedLocation(EMETTEUR, state, { precision: 'city', circle: 'BLOOD' })).toMatchObject({ latitude: 48.85, longitude: 2.35, precision: 'city', radiusMeters: 12000, circle: 'BLOOD' });
    expect(JSON.stringify(projectSharedLocation(EMETTEUR, state, { precision: 'city', circle: 'BLOOD' }))).not.toMatch(/8566|3522|accuracy|recipients/);
  });

  it('deux positions de la même maille livrent le même point : mille envois n\'en disent pas plus qu\'un', () => {
    const voisine = { ...state, position: { latitude: 48.8591, longitude: 2.3588 } };
    expect(projectSharedLocation(EMETTEUR, voisine, { precision: 'neighborhood', circle: 'CLOSE' })).toEqual(projectSharedLocation(EMETTEUR, state, { precision: 'neighborhood', circle: 'CLOSE' }));
  });

  it('`none` ne sert rien', () => {
    expect(projectSharedLocation(EMETTEUR, state, 'none')).toBeNull();
  });
});

describe('démarrer — chaque destinataire reçoit SA projection, et lui seul', () => {
  it('un Ami choisi en exact reçoit la position exacte, un Proche en quartier son quartier, un Sang sans choix la ville', async () => {
    const m = monde();
    const ack = await demarrer(m);

    expect(ack).toEqual({ success: true, data: { expiresAt: new Date(T0 + HEURE).toISOString() } });
    expect(m.vers(AMI).map((e) => [e.event, e.data.precision, e.data.latitude])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_CHANGED, 'exact', 48.8566]]);
    expect(m.vers(PROCHE).map((e) => [e.data.precision, e.data.latitude])).toEqual([['neighborhood', 48.855]]);
    expect(m.vers(SANG).map((e) => [e.data.precision, e.data.latitude])).toEqual([['city', 48.85]]);
  });

  it('une Connaissance, un bloqueur et un Ami non choisi ne reçoivent rien, pas même un effacement', async () => {
    const m = monde();
    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);

    expect(m.vers(CONNAISSANCE)).toEqual([]);
    expect(m.vers(BLOQUEUR)).toEqual([]);
    expect(m.vers(NON_CHOISI)).toEqual([]);
    expect(m.vers(EMETTEUR)).toEqual([]);
  });

  it('refuse une charge illisible sans rien ranger ni émettre', async () => {
    const m = monde();
    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: TOUS, durationMinutes: 90, position: PARIS });
    expect(ack).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.INVALID });
    expect(m.cache.entries.size).toBe(0);
    expect(m.emissions).toEqual([]);
  });

  it('redémarrer sans un destinataire l\'efface chez lui, et chez lui seul', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;
    await demarrer(m, [{ userId: AMI, precision: 'exact' }]);

    expect(m.vers(PROCHE).map((e) => [e.event, e.data])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_ENDED, { userId: EMETTEUR }]]);
    expect(m.vers(SANG).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
    expect(m.vers(AMI).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED]);
    expect(m.vers(CONNAISSANCE)).toEqual([]);
  });
});

describe('mettre à jour et arrêter', () => {
  it('une mise à jour part à la précision de chacun, sans changer le terme', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;
    m.avancer(60_000);
    const ack = await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);

    expect(ack).toEqual({ success: true, data: { expiresAt: new Date(T0 + HEURE).toISOString() } });
    expect(m.vers(AMI).map((e) => [e.data.latitude, e.data.radiusMeters, e.data.updatedAt])).toEqual([[48.8738, 12, new Date(T0 + 60_000).toISOString()]]);
    expect(m.vers(PROCHE).map((e) => [e.data.latitude, e.data.longitude])).toEqual([[48.875, 2.295]]);
    expect(m.vers(SANG)).toEqual([]);
  });

  it('une mise à jour sans partage en cours, ou après son terme, est refusée et ne part nulle part', async () => {
    const m = monde();
    expect(await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    await demarrer(m);
    m.emissions.length = 0;
    m.avancer(HEURE + 1);
    expect(await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect(m.emissions).toEqual([]);
  });

  it('arrêter efface le partage et le dit à ceux qui le voyaient, à eux seuls', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    expect(await stopSharedLocation(m.deps, EMETTEUR)).toEqual({ success: true });
    expect(m.cache.clesDe(EMETTEUR)).toEqual([]);
    expect(m.emissions.map((e) => e.room).sort()).toEqual([AMI, PROCHE, SANG].map((id) => ROOMS.user(id)).sort());
    expect(new Set(m.emissions.map((e) => e.event))).toEqual(new Set([SERVER_EVENTS.SHARED_LOCATION_ENDED]));
  });
});

describe('le repos — la position complète est gardée SCELLÉE, jamais en clair', () => {
  it('la valeur rangée ne contient ni coordonnée ni destinataire, et vit jusqu\'au terme', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const m = monde();
    await demarrer(m, TOUS, 480);

    const etats = m.cache.etatsDe(EMETTEUR).map((key) => [key, m.cache.entries.get(key)!] as const);
    expect(etats).toHaveLength(1);
    const [[, entry]] = etats;
    expect(entry.value.startsWith('v1:')).toBe(true);
    expect(entry.value).not.toMatch(/48\.8|2\.35|6300000/);
    expect(entry.ttl).toBe(480 * 60);
    [...m.cache.entries.values()].forEach(({ value }) => expect(value).not.toMatch(/48\.8|2\.35|6300000/));
  });

  it('une valeur scellée pour un compte ne s\'ouvre pas sous la clé d\'un autre', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const m = monde();
    await demarrer(m);
    const session = m.cache.pointeurDe(EMETTEUR)!;
    const entry = m.cache.entries.get(`shared-location:{${EMETTEUR}}:${session}`)!;
    m.cache.entries.set(`shared-location-current:{${PROCHE}}`, { value: session });
    m.cache.entries.set(`shared-location:{${PROCHE}}:${session}`, entry);

    expect(await readSharedLocation(m.cache, PROCHE, T0)).toBeNull();
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).not.toBeNull();
  });

  it('avec une clé de scellement, une valeur en clair glissée dans le cache vaut « rien »', async () => {
    const m = monde();
    await demarrer(m);
    process.env.SECRETS_AT_REST_KEY = KEY;

    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toBeNull();
  });

});

describe('le lien change — la troncature se recalcule sans nouvel envoi', () => {
  it('une baisse sous Ami efface chez qui voyait ; la remontée fait revenir la dernière position conservée', async () => {
    const m = monde();
    await demarrer(m);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    m.emissions.length = 0;

    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: AMI });
    await m.lier(EMETTEUR, AMI, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI, before: avant });
    expect(m.vers(AMI).map((e) => [e.event, e.data])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_ENDED, { userId: EMETTEUR }]]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);

    m.emissions.length = 0;
    await m.lier(EMETTEUR, AMI, 'FRIEND');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI });
    expect(m.vers(AMI).map((e) => [e.event, e.data.latitude, e.data.precision])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_CHANGED, 48.8738, 'exact']]);
  });

  it('une Connaissance choisie qui monte à Ami reçoit la position à SA précision ; rien ne part à qui n\'a jamais vu', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: NON_CHOISI });
    await m.lier(EMETTEUR, NON_CHOISI, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: NON_CHOISI, before: avant });
    expect(m.vers(NON_CHOISI)).toEqual([]);

    await m.lier(EMETTEUR, CONNAISSANCE, 'FRIEND');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: CONNAISSANCE });
    expect(m.vers(CONNAISSANCE).map((e) => [e.data.precision, e.data.latitude])).toEqual([['exact', 48.8566]]);
  });
});

describe('le rattrapage — `GET /relations/locations` sert les partages tronqués au lecteur', () => {
  it('chaque lecteur retrouve la projection de son choix ; une Connaissance ou un non-choisi ne retrouvent rien', async () => {
    const m = monde();
    await demarrer(m);

    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items).toEqual([expect.objectContaining({ userId: EMETTEUR, precision: 'neighborhood', latitude: 48.855 })]);
    expect((await sharedLocationSnapshotFor(m.deps, CONNAISSANCE, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, NON_CHOISI, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, BLOQUEUR, {})).items).toEqual([]);
  });

  it('l\'emprise filtre sur la position SERVIE, jamais sur la position réelle', async () => {
    const m = monde();
    await demarrer(m);
    const autourDuCentreDeVille = { minLongitude: 2.349, minLatitude: 48.849, maxLongitude: 2.351, maxLatitude: 48.851 };
    const autourDuPointReel = { minLongitude: 2.352, minLatitude: 48.856, maxLongitude: 2.353, maxLatitude: 48.857 };

    expect((await sharedLocationSnapshotFor(m.deps, SANG, { bbox: autourDuCentreDeVille })).items).toHaveLength(1);
    expect((await sharedLocationSnapshotFor(m.deps, SANG, { bbox: autourDuPointReel })).items).toEqual([]);
  });

  it('un partage échu n\'est plus servi', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(HEURE + 1);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });
});

describe('les gestes qui se croisent — un partage arrêté ne revient jamais tout seul', () => {
  it('une mise à jour en vol pendant l\'arrêt ne ressuscite pas le partage, et l\'arrêt a le dernier mot chez chacun', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.cache.suspendreProchaineEcriture();
    const enVol = updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    await new Promise((resolve) => setImmediate(resolve));
    expect(await stopSharedLocation(m.deps, EMETTEUR)).toEqual({ success: true });
    m.cache.relacher();

    expect(await enVol).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toBeNull();
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
    [AMI, PROCHE, SANG].forEach((id) => expect(m.vers(id).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED));
  });

  it('un démarrage en vol pendant l\'arrêt ne survit pas ; un démarrage APRÈS l\'arrêt, si', async () => {
    const m = monde();
    await demarrer(m);

    m.cache.suspendreProchaineEcriture();
    const enVol = demarrer(m);
    await new Promise((resolve) => setImmediate(resolve));
    await stopSharedLocation(m.deps, EMETTEUR);
    m.cache.relacher();
    await enVol;
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toBeNull();

    expect(await demarrer(m)).toMatchObject({ success: true });
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).not.toBeNull();
  });

  it('une mise à jour en vol pendant un NOUVEAU partage n\'y réécrit pas l\'ancienne liste : un destinataire retiré ne revoit rien', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.cache.suspendreProchaineEcriture();
    const enVol = updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    await new Promise((resolve) => setImmediate(resolve));
    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }])).toMatchObject({ success: true });
    m.cache.relacher();

    expect(await enVol).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect((await readSharedLocation(m.cache, EMETTEUR, T0))?.recipients.map((r) => r.userId)).toEqual([AMI]);
    [PROCHE, SANG].forEach((id) => expect(m.vers(id).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED));
    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items).toEqual([]);
    expect(m.vers(AMI).at(-1)?.data).toMatchObject({ latitude: PARIS.latitude });
  });

  it('arrêter puis redémarrer pendant une mise à jour en vol laisse le nouveau partage intact', async () => {
    const m = monde();
    await demarrer(m);

    m.cache.suspendreProchaineEcriture();
    const enVol = updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    await new Promise((resolve) => setImmediate(resolve));
    await stopSharedLocation(m.deps, EMETTEUR);
    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }])).toMatchObject({ success: true });
    m.cache.relacher();

    expect(await enVol).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toMatchObject({ position: PARIS, recipients: [{ userId: AMI }] });
  });
});

describe('les rejeux en vol — un rejeu ou un rattrapage lus avant un geste ne le contredisent pas', () => {
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  it('un rejeu de lien en vol pendant un nouveau partage sans le lecteur ne lui rend pas la position', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.suspendreProchaineLecture();
    const enVol = refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: PROCHE });
    await tick();
    await demarrer(m, [{ userId: AMI, precision: 'exact' }]);
    m.relacherLecture();
    await enVol;

    expect(m.vers(PROCHE).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED);
  });

  it('un rattrapage en vol pendant l\'arrêt ne rend pas le partage arrêté', async () => {
    const m = monde();
    await demarrer(m);

    m.suspendreProchaineLecture();
    const enVol = sharedLocationSnapshotFor(m.deps, SANG, {});
    await tick();
    await stopSharedLocation(m.deps, EMETTEUR);
    m.relacherLecture();

    expect((await enVol).items).toEqual([]);
  });

  it('un démarrage parti avant l\'arrêt n\'éteint pas le partage démarré APRÈS l\'arrêt', async () => {
    const m = monde();
    await demarrer(m);

    m.cache.suspendreProchaineEcriture();
    const enVol = demarrer(m);
    await tick();
    await stopSharedLocation(m.deps, EMETTEUR);
    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }])).toMatchObject({ success: true });
    m.cache.relacher();

    expect(await enVol).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect((await readSharedLocation(m.cache, EMETTEUR, T0))?.recipients.map((r) => r.userId)).toEqual([AMI]);
    expect(m.cache.etatsDe(EMETTEUR)).toHaveLength(1);
  });

  it('un démarrage qui perd contre l\'arrêt ne laisse aucun état en cache', async () => {
    const m = monde();
    await demarrer(m);

    m.cache.suspendreProchaineEcriture();
    const enVol = demarrer(m);
    await tick();
    await stopSharedLocation(m.deps, EMETTEUR);
    m.cache.relacher();
    await enVol;

    expect(m.cache.clesDe(EMETTEUR)).toEqual([]);
  });

  it('un démarrage remplacé pendant qu\'il sert rend NOT_SHARING ; le partage qui l\'a remplacé reste, chez chacun', async () => {
    const m = monde();
    await demarrer(m, [{ userId: AMI, precision: 'exact' }]);

    m.suspendreProchaineLecture(1);
    const enVol = demarrer(m, [{ userId: AMI, precision: 'exact' }]);
    await tick();
    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }, { userId: PROCHE, precision: 'city' }])).toMatchObject({ success: true });
    m.relacherLecture();
    expect(await enVol).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });

    expect((await readSharedLocation(m.cache, EMETTEUR, T0))?.recipients.map((r) => r.userId)).toEqual([AMI, PROCHE]);
    [AMI, PROCHE].forEach((id) => expect(m.vers(id).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_CHANGED));
    expect(m.cache.etatsDe(EMETTEUR)).toHaveLength(1);
  });

  it('un arrêt qui éteint un démarrage posé pendant lui prévient ceux que ce démarrage a servis', async () => {
    const m = monde();
    await demarrer(m, [{ userId: AMI, precision: 'exact' }]);

    m.cache.suspendreProchaineEcriture('advance');
    const arret = stopSharedLocation(m.deps, EMETTEUR);
    await tick();
    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }, { userId: PROCHE, precision: 'city' }])).toMatchObject({ success: true });
    m.cache.relacher();
    expect(await arret).toEqual({ success: true });

    [AMI, PROCHE].forEach((id) => expect(m.vers(id).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED));
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toBeNull();
    expect(m.cache.clesDe(EMETTEUR)).toEqual([]);
  });

  it('une baisse sous Ami efface chez un destinataire SERVI même si la capture d\'avant ne l\'a pas vu servi', async () => {
    const m = monde();
    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: PROCHE });
    await demarrer(m);
    m.emissions.length = 0;

    await m.lier(EMETTEUR, PROCHE, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: PROCHE, before: avant });

    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
  });

  it('une montée ne dit jamais rien à qui ne voit rien', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: CONNAISSANCE });

    expect(m.vers(CONNAISSANCE)).toEqual([]);
  });
});

describe('ce qui ne change pas ne part pas — un lecteur flouté n\'apprend pas quand l\'appareil bouge', () => {
  it('une mise à jour dans la même maille ne part pas chez le lecteur flouté, mais part chez l\'exact', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;
    m.avancer(60_000);
    await updateSharedLocation(m.deps, EMETTEUR, { latitude: 48.8571, longitude: 2.3529, accuracy: 4 });

    expect(m.vers(SANG)).toEqual([]);
    expect(m.vers(PROCHE)).toEqual([]);
    expect(m.vers(AMI).map((e) => e.data.latitude)).toEqual([48.8571]);
  });
});

describe('le magasin strict — contre-audit de #16986 (A, B, C)', () => {
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  it('A — Redis injoignable : l\'arrêt rend UNAVAILABLE sans rien annoncer, et le partage court encore au retour', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.cache.panne(true);
    expect(await stopSharedLocation(m.deps, EMETTEUR)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.UNAVAILABLE });
    expect(m.emissions).toEqual([]);
    m.cache.panne(false);

    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).not.toBeNull();
    expect(await stopSharedLocation(m.deps, EMETTEUR)).toEqual({ success: true });
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toBeNull();
  });

  it('A — Redis injoignable : démarrer et mettre à jour sont refusés, rien ne part', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.cache.panne(true);
    expect(await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.UNAVAILABLE });
    expect(await demarrer(m)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.UNAVAILABLE });
    expect(m.emissions).toEqual([]);
  });

  it('B — un partage de 8 h démarré 1 h après un arrêt court jusqu\'à son terme : la génération ne revient jamais en arrière', async () => {
    const m = monde();
    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }])).toMatchObject({ success: true });
    expect(await stopSharedLocation(m.deps, EMETTEUR)).toEqual({ success: true });
    m.avancer(HEURE);
    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }], 480)).toMatchObject({ success: true });
    m.avancer(7 * HEURE + 60_000);

    expect(await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN)).toMatchObject({ success: true });
    m.avancer(HEURE);
    expect(await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
  });

  it('C — un démarrage complet intercalé avant la prise d\'un autre : ses destinataires reçoivent la fin, une seule session vit', async () => {
    const m = monde();
    await demarrer(m, [{ userId: AMI, precision: 'exact' }]);

    m.cache.suspendreProchaineEcriture('claim');
    const b = demarrer(m, [{ userId: SANG }]);
    await tick();
    expect(await demarrer(m, [{ userId: PROCHE, precision: 'city' }])).toMatchObject({ success: true });
    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED]);
    m.cache.relacher();
    expect(await b).toMatchObject({ success: true });

    expect((await readSharedLocation(m.cache, EMETTEUR, T0))?.recipients.map((r) => r.userId)).toEqual([SANG]);
    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED, SERVER_EVENTS.SHARED_LOCATION_ENDED]);
    expect(m.cache.etatsDe(EMETTEUR)).toHaveLength(1);
  });

  it('C — le même croisement, suspendu avant l\'écriture de l\'état : même verdict', async () => {
    const m = monde();
    await demarrer(m, [{ userId: AMI, precision: 'exact' }]);

    m.cache.suspendreProchaineEcriture('set');
    const b = demarrer(m, [{ userId: SANG }]);
    await tick();
    expect(await demarrer(m, [{ userId: PROCHE, precision: 'city' }])).toMatchObject({ success: true });
    m.cache.relacher();
    expect(await b).toMatchObject({ success: true });

    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED, SERVER_EVENTS.SHARED_LOCATION_ENDED]);
    expect(m.vers(AMI).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED);
    expect(m.cache.etatsDe(EMETTEUR)).toHaveLength(1);
  });
});

describe('contre-audit adversarial de 86fa2ae — la fin ne part qu\'à qui a vu, et n\'est jamais perdue', () => {
  it('F1 — un destinataire désigné qui n\'a jamais rien vu ne reçoit aucune fin, qu\'il bloque, rebloque ou retire une demande', async () => {
    const m = monde();
    await demarrer(m);
    expect(m.vers(CONNAISSANCE)).toEqual([]);

    await refreshSharedLocationBetween(m.deps, { userA: CONNAISSANCE, userB: EMETTEUR, before: new Map() });
    const avant = await captureSharedLocationAccess(m.deps, { userA: CONNAISSANCE, userB: EMETTEUR });
    await refreshSharedLocationBetween(m.deps, { userA: CONNAISSANCE, userB: EMETTEUR, before: avant });

    expect(m.vers(CONNAISSANCE)).toEqual([]);
  });

  it('F1 — qui a vu reçoit la fin UNE fois : un second blocage ne redit pas que le partage court', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    await m.lier(EMETTEUR, PROCHE, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: PROCHE, before: new Map() });
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: PROCHE, before: new Map() });

    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
  });

  it('F1 — un lecteur servi par le seul rattrapage reçoit la fin à l\'arrêt', async () => {
    const m = monde();
    await demarrer(m, [{ userId: CONNAISSANCE, precision: 'exact' }]);
    await m.lier(EMETTEUR, CONNAISSANCE, 'FRIEND');
    expect((await sharedLocationSnapshotFor(m.deps, CONNAISSANCE, {})).items).toHaveLength(1);

    await stopSharedLocation(m.deps, EMETTEUR);

    expect(m.vers(CONNAISSANCE).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
  });

  it('F2 — un arrêt dont l\'annonce échoue après avoir pris : le nouvel essai annonce la fin à ceux qui voyaient', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.cache.echouerProchaine('seenAmong');
    expect(await stopSharedLocation(m.deps, EMETTEUR)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.UNAVAILABLE });
    expect(await stopSharedLocation(m.deps, EMETTEUR)).toEqual({ success: true });

    expect(m.emissions.map((e) => e.room).sort()).toEqual([AMI, PROCHE, SANG].map((id) => ROOMS.user(id)).sort());
    expect(new Set(m.emissions.map((e) => e.event))).toEqual(new Set([SERVER_EVENTS.SHARED_LOCATION_ENDED]));
    expect(m.cache.clesDe(EMETTEUR)).toEqual([]);
  });

  it('F2 — une session remplacée dont le retrait échoue est retirée au geste suivant', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.cache.echouerProchaine('seenAmong');
    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }])).toMatchObject({ success: true });
    expect(m.vers(PROCHE)).toEqual([]);
    await stopSharedLocation(m.deps, EMETTEUR);

    [AMI, PROCHE, SANG].forEach((id) => expect(m.vers(id).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED));
    expect(m.cache.clesDe(EMETTEUR)).toEqual([]);
  });

  it('F3 — un démarrage dont l\'éventail échoue après la prise est annoncé tel qu\'il est : courant', async () => {
    const m = monde();
    m.echouerProchaineLecture(1);

    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }])).toEqual({ success: true, data: { expiresAt: new Date(T0 + HEURE).toISOString() } });
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toHaveLength(1);
    expect(await stopSharedLocation(m.deps, EMETTEUR)).toEqual({ success: true });
    expect(m.vers(AMI).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED);
  });

  it('F3 — une position écrite dont l\'éventail échoue reste acquise, et l\'accusé le dit', async () => {
    const m = monde();
    await demarrer(m);
    m.echouerProchaineLecture();

    expect(await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN)).toMatchObject({ success: true });
    expect((await readSharedLocation(m.cache, EMETTEUR, T0))?.position).toEqual(PLUS_LOIN);
  });
});

const MODO = '6300000000000000000000e5';
const ADMIN = '6300000000000000000000e6';
const EQUIPE = [{ id: MODO, role: 'MODERATOR' }, { id: ADMIN, role: 'ADMIN' }] as const;

describe('la ligne de maille — le bruit GPS près d\'une frontière ne la révèle pas (#16987)', () => {
  const PRES_DE_LA_LIGNE = { latitude: 48.8601, longitude: 2.3529, accuracy: 4 } as const;
  const AU_DELA = { latitude: 48.864, longitude: 2.3529, accuracy: 4 } as const;
  const DE_RETOUR = { latitude: 48.8599, longitude: 2.3529, accuracy: 4 } as const;

  it('franchir la ligne de peu garde la maille servie ; s\'en éloigner la change ; revenir de peu ne la rechange pas', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    await updateSharedLocation(m.deps, EMETTEUR, PRES_DE_LA_LIGNE);
    expect(m.vers(PROCHE)).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items).toEqual([expect.objectContaining({ latitude: 48.855 })]);

    await updateSharedLocation(m.deps, EMETTEUR, AU_DELA);
    expect(m.vers(PROCHE).map((e) => e.data.latitude)).toEqual([48.865]);

    await updateSharedLocation(m.deps, EMETTEUR, DE_RETOUR);
    expect(m.vers(PROCHE)).toHaveLength(1);
    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items).toEqual([expect.objectContaining({ latitude: 48.865 })]);
  });

  it('l\'exact suit chaque pas : la ligne de maille ne concerne pas qui voit le point', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;
    await updateSharedLocation(m.deps, EMETTEUR, PRES_DE_LA_LIGNE);
    expect(m.vers(AMI).map((e) => e.data.latitude)).toEqual([48.8601]);
  });
});

describe('l\'heure servie à un lecteur flouté est arrondie (#16987)', () => {
  it('le flou n\'a pas d\'horloge fine : updatedAt tombe sur le quart d\'heure, l\'exact garde la minute vraie', async () => {
    const m = monde();
    m.avancer(22 * 60_000 + 11_000);
    await demarrer(m);

    const exact = m.vers(AMI)[0]?.data;
    const flou = m.vers(PROCHE)[0]?.data;
    expect(exact?.updatedAt).toBe('2026-11-08T12:22:11.000Z');
    expect(flou?.updatedAt).toBe('2026-11-08T12:15:00.000Z');
    expect((await sharedLocationSnapshotFor(m.deps, SANG, {})).items[0]?.updatedAt).toBe('2026-11-08T12:15:00.000Z');
  });
});

describe('le rattrapage groupé et la loi d\'équipe (#16987)', () => {
  it('une paire de l\'équipe sans lien reçoit la position au rattrapage comme en direct', async () => {
    const m = monde({ users: EQUIPE });
    await startSharedLocation(m.deps, ADMIN, { recipients: [{ userId: MODO, precision: 'exact' }], durationMinutes: 60, position: PARIS });

    expect(m.vers(MODO)).toHaveLength(1);
    expect((await sharedLocationSnapshotFor(m.deps, MODO, {})).items).toEqual([expect.objectContaining({ userId: ADMIN, precision: 'exact' })]);
  });

  it('un utilisateur ordinaire sans lien ne reçoit rien au rattrapage, même désigné', async () => {
    const m = monde({ users: [{ id: MODO, role: 'MODERATOR' }, { id: ADMIN }] });
    await startSharedLocation(m.deps, ADMIN, { recipients: [{ userId: MODO, precision: 'exact' }], durationMinutes: 60, position: PARIS });
    expect((await sharedLocationSnapshotFor(m.deps, MODO, {})).items).toEqual([]);
  });

  const emetteurs = (n: number) => Array.from({ length: n }, (_, i) => `63000000000000000000aa${String(i).padStart(2, '0')}`);
  async function lecturesPour(n: number) {
    const ids = emetteurs(n);
    const m = monde({ users: ids.map((id) => ({ id })), links: ids.map((id) => [id, SANG, 'FRIEND'] as const) });
    for (const id of ids) {
      await startSharedLocation(m.deps, id, { recipients: [{ userId: SANG, precision: 'exact' }], durationMinutes: 60, position: PARIS });
    }
    m.lectures.cache = 0;
    m.lectures.comptes = 0;
    const { items } = await sharedLocationSnapshotFor(m.deps, SANG, {});
    return { items: items.length, ...m.lectures };
  }

  it('le coût en lectures ne dépend pas du nombre d\'émetteurs : une lecture groupée du magasin, une lecture des comptes', async () => {
    const un = await lecturesPour(1);
    const douze = await lecturesPour(12);
    expect(un.items).toBe(1);
    expect(douze.items).toBe(12);
    expect(douze.cache).toBe(un.cache);
    expect(douze.comptes).toBe(un.comptes);
  });
});

describe('un compte qui part ne partage plus (#16987)', () => {
  it('terminer le partage d\'un compte désactivé le dit à qui le voyait, et le rejouer ne dit rien de plus', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    expect(await endSharedLocationOfAccount(m.deps, EMETTEUR, { forget: false })).toEqual({ success: true });
    expect(m.vers(AMI).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
    expect(m.vers(NON_CHOISI)).toEqual([]);
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toBeNull();

    m.emissions.length = 0;
    await endSharedLocationOfAccount(m.deps, EMETTEUR, { forget: false });
    expect(m.emissions).toEqual([]);
  });

  it('la purge ne laisse aucune clé du compte sans terme, et plus aucune passé le plus long partage', async () => {
    const m = monde();
    await demarrer(m);
    await endSharedLocationOfAccount(m.deps, EMETTEUR, { forget: true });

    const restantes = [...m.cache.entries].filter(([key]) => key.includes(EMETTEUR));
    expect(restantes.filter(([, entry]) => entry.until === undefined)).toEqual([]);
    expect([...m.cache.sets.keys()].filter((key) => key.includes(EMETTEUR))).toEqual([]);

    m.avancer(8 * HEURE);
    expect(await m.cache.mget(restantes.map(([key]) => key))).toEqual(restantes.map(() => null));
  });

  it('un démarrage en vol pendant la purge d\'un compte qui n\'a jamais partagé ne prend pas : la génération ne repart pas de zéro', async () => {
    const m = monde();
    m.cache.suspendreProchaineEcriture('claim');
    const enVol = demarrer(m);
    await new Promise((resolve) => setImmediate(resolve));
    expect(await endSharedLocationOfAccount(m.deps, EMETTEUR, { forget: true })).toEqual({ success: true });
    m.cache.relacher();

    expect(await enVol).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect(m.cache.pointeurDe(EMETTEUR)).toBeNull();
    expect(m.cache.etatsDe(EMETTEUR)).toEqual([]);
  });

  it('une panne du magasin ne dit pas « fini » et ne purge rien', async () => {
    const m = monde();
    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);
    await demarrer(m);
    m.cache.echouerProchaine('advance');

    expect(await endSharedLocationOfAccount(m.deps, EMETTEUR, { forget: true })).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.UNAVAILABLE });
    expect([...m.cache.entries.keys()].filter((key) => key.includes('shared-location-gen') && key.includes(EMETTEUR))).toHaveLength(1);
    expect(m.cache.pointeurDe(EMETTEUR)).not.toBeNull();
  });
});

describe('une position en vol pendant une baisse ne revient pas après la fin (#16987)', () => {
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  it('une mise à jour qui a lu l\'accès avant la baisse ne laisse pas le point chez qui a reçu la fin', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.suspendreProchaineLecture();
    const enVol = updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    await tick();
    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: AMI });
    await m.lier(EMETTEUR, AMI, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI, before: avant });
    m.relacherLecture();
    expect(await enVol).toMatchObject({ success: true });

    expect(m.vers(AMI).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });

  it('une mise à jour sans changement de lien sert chacun une fois, sans fin parasite', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);

    expect(m.vers(AMI).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED]);
    expect(m.emissions.filter((e) => e.event === SERVER_EVENTS.SHARED_LOCATION_ENDED)).toEqual([]);
  });
});

describe('contre-audit a1e903a — le cercle de flou contient toujours la position vraie (#16987)', () => {
  const metres = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number => {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
  };

  it('une maille retenue par la marge ne laisse pas la position vraie hors du rayon servi', async () => {
    const m = monde();
    await demarrer(m);
    const DANS_LA_MARGE = { latitude: 48.8624, longitude: 2.3624, accuracy: 4 } as const;
    await updateSharedLocation(m.deps, EMETTEUR, DANS_LA_MARGE);

    const servi = (await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items[0];
    expect(servi).toBeDefined();
    const distance = metres({ latitude: servi!.latitude, longitude: servi!.longitude }, DANS_LA_MARGE);
    expect(distance).toBeLessThanOrEqual(servi!.radiusMeters);
  });

  it('en précision ville aussi, la maille retenue reste dans le cercle servi', async () => {
    const m = monde();
    await demarrer(m);
    const DANS_LA_MARGE = { latitude: 48.9249, longitude: 2.4249, accuracy: 4 } as const;
    await updateSharedLocation(m.deps, EMETTEUR, DANS_LA_MARGE);

    const servi = (await sharedLocationSnapshotFor(m.deps, SANG, {})).items[0];
    expect(servi).toMatchObject({ latitude: 48.85, longitude: 2.35, precision: 'city' });
    expect(metres({ latitude: servi!.latitude, longitude: servi!.longitude }, DANS_LA_MARGE)).toBeLessThanOrEqual(servi!.radiusMeters);
  });

  it('à l\'équateur, où le degré de longitude est le plus long, le coin de la retenue reste dans le cercle', () => {
    const position = { latitude: 0.0124, longitude: 0.0124, accuracy: 4 };
    const state = {
      position,
      updatedAt: new Date(T0).toISOString(),
      expiresAt: new Date(T0 + HEURE).toISOString(),
      recipients: [
        { userId: PROCHE, precision: 'neighborhood' as const, cell: { latitude: 0.005, longitude: 0.005 } },
        { userId: SANG, precision: 'city' as const, cell: { latitude: 0.05, longitude: 0.05 } },
      ],
    };
    const coinVille = { ...position, latitude: 0.1249, longitude: 0.1249 };
    const quartier = projectSharedLocation(EMETTEUR, state, { precision: 'neighborhood', circle: 'CLOSE' }, PROCHE)!;
    const ville = projectSharedLocation(EMETTEUR, { ...state, position: coinVille }, { precision: 'city', circle: 'BLOOD' }, SANG)!;

    expect(quartier).toMatchObject({ latitude: 0.005, longitude: 0.005 });
    expect(metres(quartier, position)).toBeLessThanOrEqual(quartier.radiusMeters);
    expect(ville).toMatchObject({ latitude: 0.05, longitude: 0.05 });
    expect(metres(ville, coinVille)).toBeLessThanOrEqual(ville.radiusMeters);
  });
});
