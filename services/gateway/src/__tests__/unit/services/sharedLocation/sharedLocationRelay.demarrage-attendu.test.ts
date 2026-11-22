/**
 * UN DÉMARRAGE QUI NOMME LE PARTAGE QU'IL REMPLACE NE REMPLACE QUE CELUI-LÀ (#20249). Une
 * confirmation « Montrer ta position réelle ? » vaut pour le partage MONTRÉ (#20127, #20248) :
 * le client relit, demande, puis démarre en disant `expectedStartedAt` — le `startedAt` du
 * partage qu'il a montré. Si un autre appareil du compte a démarré un autre partage entre la
 * relecture et l'envoi, la passerelle refuse (`STARTED_ELSEWHERE`) sans rien appliquer : la
 * personne ajoutée ailleurs ne disparaît plus en silence. Une liste seule publiée ailleurs ne
 * fait que RETIRER et garde `startedAt` : elle ne change pas le partage nommé. Sans la clé,
 * rien ne change (anciens clients).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { SHARED_LOCATION_ERROR_CODES } from '@meeshy/shared/types/shared-location';
import { ownSharedLocationFor, startSharedLocation } from '../../../../services/sharedLocation/sharedLocationRelay';
import { readSharedLocation } from '../../../../services/sharedLocation/sharedLocationStore';
import { AMI, EMETTEUR, monde, PARIS, PLUS_LOIN, PROCHE, SANG } from '../../../helpers/shared-location-relay-world';

const MINUTE = 60_000;
const CHOISI = { latitude: 48.8606, longitude: 2.3376 } as const;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const AVEC_AMI = [{ userId: AMI, precision: 'exact' }] as const;
const AVEC_AMI_ET_SANG = [{ userId: AMI, precision: 'exact' }, { userId: SANG, precision: 'exact' }] as const;

type Monde = ReturnType<typeof monde>;

const startedAtOf = (ack: unknown): string => {
  const data = (ack as { readonly data?: { readonly startedAt?: string } }).data;
  if (data?.startedAt === undefined) throw new Error('démarrage sans startedAt');
  return data.startedAt;
};

const choisirPoint = (m: Monde) =>
  startSharedLocation(m.deps, EMETTEUR, { recipients: AVEC_AMI, durationMinutes: 60, position: CHOISI, source: 'manual' });
const ajouterAilleurs = (m: Monde) =>
  startSharedLocation(m.deps, EMETTEUR, { recipients: AVEC_AMI_ET_SANG, durationMinutes: 60, position: CHOISI, source: 'manual' });
const montrerPositionReelle = (m: Monde, expectedStartedAt: string) =>
  startSharedLocation(m.deps, EMETTEUR, { recipients: AVEC_AMI, durationMinutes: 60, position: PLUS_LOIN, source: 'device', expectedStartedAt });

const changesVers = (m: Monde, userId: string) =>
  m.vers(userId).filter((e) => e.event === SERVER_EVENTS.SHARED_LOCATION_CHANGED).map((e) => e.data);
const servis = async (m: Monde) => (await ownSharedLocationFor(m.deps, EMETTEUR)).recipients.map((r) => r.userId).sort();

describe('un démarrage qui nomme le partage montré (#20249)', () => {
  it('le partage servi est celui qui a été montré : le démarrage le remplace', async () => {
    const m = monde();
    const montre = startedAtOf(await choisirPoint(m));
    m.avancer(MINUTE);

    expect(await montrerPositionReelle(m, montre)).toMatchObject({ success: true });
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toMatchObject({ source: 'device' });
    expect(changesVers(m, AMI).at(-1)).toMatchObject({ latitude: PLUS_LOIN.latitude });
  });

  it('un autre appareil a démarré depuis : refus STARTED_ELSEWHERE, la personne ajoutée ailleurs reste, rien ne part', async () => {
    const m = monde();
    const montre = startedAtOf(await choisirPoint(m));
    m.avancer(MINUTE);
    await ajouterAilleurs(m);
    m.avancer(MINUTE);
    m.emissions.length = 0;

    expect(await montrerPositionReelle(m, montre)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.STARTED_ELSEWHERE });
    expect(await servis(m)).toEqual([AMI, SANG].sort());
    expect(await readSharedLocation(m.deps.cache, EMETTEUR, m.deps.now())).toMatchObject({ source: 'manual', position: CHOISI });
    expect(m.emissions).toEqual([]);
  });

  it('un autre démarrage passé ENTRE la lecture et la prise : refus, et le partage de l’autre appareil reste entier', async () => {
    const m = monde();
    const montre = startedAtOf(await choisirPoint(m));
    m.avancer(MINUTE);
    m.suspendreProchainePrise();
    const reponse = montrerPositionReelle(m, montre);
    await tick();
    await tick();
    expect(await ajouterAilleurs(m)).toMatchObject({ success: true });
    m.relacherPrise();

    expect(await reponse).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.STARTED_ELSEWHERE });
    expect(await servis(m)).toEqual([AMI, SANG].sort());
    expect(await readSharedLocation(m.deps.cache, EMETTEUR, m.deps.now())).toMatchObject({ source: 'manual', position: CHOISI });
    expect(changesVers(m, AMI).some((data) => data.latitude === PLUS_LOIN.latitude)).toBe(false);
  });

  it('une liste seule publiée ailleurs garde le partage nommé : le démarrage passe', async () => {
    const m = monde();
    const montre = startedAtOf(await startSharedLocation(m.deps, EMETTEUR, { recipients: [...AVEC_AMI, { userId: PROCHE, precision: 'city' }], durationMinutes: 60, position: CHOISI, source: 'manual' }));
    m.avancer(MINUTE);
    m.suspendreProchainePrise();
    const reponse = montrerPositionReelle(m, montre);
    await tick();
    await tick();
    expect(await startSharedLocation(m.deps, EMETTEUR, { recipients: AVEC_AMI, durationMinutes: 60 })).toMatchObject({ success: true });
    m.relacherPrise();

    expect(await reponse).toMatchObject({ success: true });
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toMatchObject({ source: 'device' });
  });

  it('le partage montré s’est arrêté depuis : refus, rien ne démarre', async () => {
    const m = monde();
    const montre = startedAtOf(await choisirPoint(m));
    m.avancer(61 * MINUTE);

    expect(await montrerPositionReelle(m, montre)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.STARTED_ELSEWHERE });
    expect(await readSharedLocation(m.deps.cache, EMETTEUR, m.deps.now())).toBeNull();
  });

  it('une date illisible est refusée comme toute charge illisible', async () => {
    const m = monde();
    await choisirPoint(m);
    expect(await montrerPositionReelle(m, 'hier')).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.INVALID });
  });

  it('sans la clé, un démarrage d’appareil remplace comme avant (anciens clients)', async () => {
    const m = monde();
    await choisirPoint(m);
    m.avancer(MINUTE);
    await ajouterAilleurs(m);
    m.avancer(MINUTE);

    expect(await startSharedLocation(m.deps, EMETTEUR, { recipients: AVEC_AMI, durationMinutes: 60, position: PARIS, source: 'device' })).toMatchObject({ success: true });
    expect(await servis(m)).toEqual([AMI]);
  });
});
