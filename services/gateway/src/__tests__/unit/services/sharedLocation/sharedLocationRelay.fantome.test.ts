/**
 * LE FANTÔME GLOBAL MASQUE AUSSI LE PARTAGE TEMPORAIRE (#19203). Un compte en fantôme
 * (`User.locationGhostAt`) ne sert sa position à personne — ni par le direct, ni au
 * rattrapage —, comme un partage en pause : ceux qu'il
 * servait reçoivent la fin dès l'entrée, et la sortie rétablit les diffusions SANS
 * republier une position antérieure : seule la position suivante repart.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  reflectSharedLocationGhost,
  sharedLocationEndedFor,
  sharedLocationSnapshotFor,
  stopSharedLocation,
  updateSharedLocation,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { AMI, demarrer, EMETTEUR, HEURE, monde, PLUS_LOIN, PROCHE, SANG, T0 } from '../../../helpers/shared-location-relay-world';

const enFantome = (m: ReturnType<typeof monde>) => m.ecrireCompte(EMETTEUR, { locationGhostAt: new Date(T0) });
const horsFantome = (m: ReturnType<typeof monde>) => m.ecrireCompte(EMETTEUR, { locationGhostAt: null });
const evenements = (m: ReturnType<typeof monde>, userId: string) => m.vers(userId).map((e) => e.event);

describe('le fantôme global — le partage temporaire ne sert plus personne (#19203)', () => {
  it('un compte déjà en fantôme démarre un partage : rien ne part, et le rattrapage ne sert rien', async () => {
    const m = monde();
    await enFantome(m);

    const ack = await demarrer(m);

    expect(ack.success).toBe(true);
    expect(m.emissions).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, SANG, {})).items).toEqual([]);
  });

  it('entrer en fantôme coupe aussitôt : ceux que le partage servait reçoivent la fin, eux seuls', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    await enFantome(m);
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'entered');

    expect(evenements(m, AMI)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
    expect(evenements(m, PROCHE)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
    expect(evenements(m, SANG)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
    expect(m.emissions.every((e) => e.event === SERVER_EVENTS.SHARED_LOCATION_ENDED && Object.keys(e.data).join() === 'userId')).toBe(true);
  });

  it('en fantôme, une nouvelle position est acceptée mais ne part vers personne, et la carte reste vide', async () => {
    const m = monde();
    await demarrer(m);
    await enFantome(m);
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'entered');
    m.emissions.length = 0;

    m.avancer(60_000);
    const ack = await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);

    expect(ack.success).toBe(true);
    expect(m.emissions).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });

  it('même sans l\'appel de reflet, la position suivante d\'un compte passé en fantôme ferme ceux qui voyaient', async () => {
    const m = monde();
    await demarrer(m);
    await enFantome(m);
    m.emissions.length = 0;

    m.avancer(60_000);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);

    expect(evenements(m, AMI)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
    expect(m.emissions.some((e) => e.event === SERVER_EVENTS.SHARED_LOCATION_CHANGED)).toBe(false);
  });

  it('un partage terminé AVANT le fantôme reste parmi les partages terminés : la liste ne trahit pas le fantôme', async () => {
    const m = monde();
    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);
    m.avancer(HEURE);
    const avant = await sharedLocationEndedFor(m.deps, AMI);

    await m.ecrireCompte(EMETTEUR, { locationGhostAt: new Date(T0 + HEURE) });
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'entered');

    expect(avant).toHaveLength(1);
    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual(avant);
  });

  it('entrer en fantôme pendant un partage le range parmi les terminés, comme un arrêt', async () => {
    const arret = monde();
    await demarrer(arret);
    arret.avancer(60_000);
    await stopSharedLocation(arret.deps, EMETTEUR);

    const fantome = monde();
    await demarrer(fantome);
    fantome.avancer(60_000);
    await fantome.ecrireCompte(EMETTEUR, { locationGhostAt: new Date(T0 + 60_000) });
    await reflectSharedLocationGhost(fantome.deps, EMETTEUR, 'entered');

    const termines = await sharedLocationEndedFor(arret.deps, AMI);
    expect(termines).toHaveLength(1);
    expect(await sharedLocationEndedFor(fantome.deps, AMI)).toEqual(termines);
    expect(await sharedLocationEndedFor(fantome.deps, SANG)).toEqual(await sharedLocationEndedFor(arret.deps, SANG));
  });

  it('sortir du fantôme ne republie rien : ni événement, ni position ancienne au rattrapage', async () => {
    const m = monde();
    await demarrer(m);
    await enFantome(m);
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'entered');
    m.avancer(60_000);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    m.emissions.length = 0;

    m.avancer(60_000);
    await horsFantome(m);
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'left');

    expect(m.emissions).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });

  it('après la sortie, la position suivante repart vers chacun, flouté compris, et le rattrapage la sert', async () => {
    const m = monde();
    await demarrer(m);
    await enFantome(m);
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'entered');
    m.avancer(60_000);
    await horsFantome(m);
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'left');
    m.emissions.length = 0;

    m.avancer(60_000);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);

    expect(evenements(m, AMI)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED]);
    expect(evenements(m, PROCHE)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED]);
    expect(evenements(m, SANG)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.latitude)).toEqual([PLUS_LOIN.latitude]);
    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual([]);
  });

  it('un fantôme retiré sans en être entré (réglage répété) ne masque pas le partage en cours', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(HEURE / 60);

    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'unchanged');

    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.latitude)).toEqual([48.8566]);
  });
});
