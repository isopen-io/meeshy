/**
 * LA SOURCE DU PARTAGE EN COURS (#19557, #20087). Un partage montre soit la position de
 * l'appareil (`device`, suivie), soit un point CHOISI à la main sur la carte (`manual`, fixe).
 * La passerelle range la source avec le partage, scellée comme le reste, la sert à MES
 * appareils dans la relecture de mon partage — pour qu'un autre appareil ne transforme jamais
 * un point choisi en position réelle sans le savoir — et refuse qu'une position d'appareil
 * remplace en silence un point choisi par une simple mise à jour.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { SHARED_LOCATION_ERROR_CODES, sharedLocationStartPayloadSchema } from '@meeshy/shared/types/shared-location';
import {
  ownSharedLocationFor,
  startSharedLocation,
  updateSharedLocation,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { readSharedLocation } from '../../../../services/sharedLocation/sharedLocationStore';
import { AMI, EMETTEUR, monde, PARIS, PLUS_LOIN, PROCHE } from '../../../helpers/shared-location-relay-world';

const MINUTE = 60_000;

const partager = (m: ReturnType<typeof monde>, extra: Record<string, unknown> = {}) =>
  startSharedLocation(m.deps, EMETTEUR, {
    recipients: [{ userId: AMI, precision: 'exact' }, { userId: PROCHE, precision: 'city' }],
    durationMinutes: 60,
    position: PARIS,
    ...extra,
  });

const changes = (m: ReturnType<typeof monde>, userId: string) =>
  m.vers(userId).filter((e) => e.event === SERVER_EVENTS.SHARED_LOCATION_CHANGED);

describe('le contrat de démarrage accepte la source, sans rien exiger d’un client d’avant', () => {
  const base = { recipients: [{ userId: AMI }], durationMinutes: 60, position: PARIS };

  it('absente, « device » ou « manual » : accepté ; toute autre valeur : refusé', () => {
    expect(sharedLocationStartPayloadSchema.safeParse(base).success).toBe(true);
    expect(sharedLocationStartPayloadSchema.safeParse({ ...base, source: 'device' }).success).toBe(true);
    expect(sharedLocationStartPayloadSchema.safeParse({ ...base, source: 'manual' }).success).toBe(true);
    expect(sharedLocationStartPayloadSchema.safeParse({ ...base, source: 'x' }).success).toBe(false);
  });

  it('un point choisi sans position n’a pas de sens : refusé', () => {
    const { position: _p, ...sansPosition } = base;
    expect(sharedLocationStartPayloadSchema.safeParse({ ...sansPosition, source: 'manual' }).success).toBe(false);
  });
});

describe('mes appareils relisent la source du partage en cours', () => {
  it('un « Partager » depuis l’appareil (source absente) se relit « device »', async () => {
    const m = monde();
    await partager(m);
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toMatchObject({ source: 'device' });
  });

  it('un point choisi se relit « manual »', async () => {
    const m = monde();
    await partager(m, { source: 'manual' });
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toMatchObject({ source: 'manual' });
  });

  it('la source est rangée avec le partage, scellée comme lui', async () => {
    const m = monde();
    await partager(m, { source: 'manual' });
    expect((await readSharedLocation(m.deps.cache, EMETTEUR, m.deps.now()))?.source).toBe('manual');
  });

  it('une liste seule garde la source du point qu’elle reprend', async () => {
    const m = monde();
    await partager(m, { source: 'manual' });
    m.avancer(5 * MINUTE);
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }], durationMinutes: 60 });
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toMatchObject({ source: 'manual', recipients: [{ userId: AMI.toLowerCase() }] });
  });

  it('un nouveau « Partager » depuis l’appareil remplace le point choisi : la relecture le dit', async () => {
    const m = monde();
    await partager(m, { source: 'manual' });
    m.avancer(MINUTE);
    await partager(m);
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toMatchObject({ source: 'device' });
  });

  it('sans partage, aucune source n’est servie', async () => {
    const m = monde();
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toEqual({ recipients: [], expiresAt: null });
  });
});

describe('une mise à jour d’appareil ne remplace jamais un point choisi', () => {
  it('refusée sur un partage « manual » : rien n’est écrit, rien ne part', async () => {
    const m = monde();
    await partager(m, { source: 'manual' });
    const avant = changes(m, AMI).length;
    m.avancer(MINUTE);

    const ack = await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);

    expect(ack).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.FIXED_POINT });
    expect(changes(m, AMI)).toHaveLength(avant);
    expect((await readSharedLocation(m.deps.cache, EMETTEUR, m.deps.now()))?.position).toEqual(PARIS);
  });

  it('acceptée sur un partage « device », comme avant', async () => {
    const m = monde();
    await partager(m);
    m.avancer(MINUTE);
    expect(await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN)).toMatchObject({ success: true });
  });
});

describe('le lecteur ne reçoit rien de la source', () => {
  it('ni le direct ni la charge d’un destinataire ne portent la source', async () => {
    const m = monde();
    await partager(m, { source: 'manual' });
    for (const e of [...changes(m, AMI), ...changes(m, PROCHE)]) expect(e.data).not.toHaveProperty('source');
  });
});
