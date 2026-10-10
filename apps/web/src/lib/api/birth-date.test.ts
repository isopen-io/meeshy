import { describe, expect, test } from 'bun:test';

import { scriptedGateway } from '@/test-support/scripted-transport';

import { BIRTH_DATE_PATH, declareBirthDate } from './birth-date';

/**
 * LA DÉCLARATION DE L'ÂGE (#9928) — `PUT /api/v1/me/birth-date`, le contrat
 * de #9927 : une seule écriture, la passerelle seule calcule la classe d'âge.
 */

const PUT = `PUT ${BIRTH_DATE_PATH}`;

describe('declareBirthDate — PUT /me/birth-date', () => {
  test('envoie la date telle quelle et rend la restriction servie (majeur)', async () => {
    const { deps, calls } = scriptedGateway({ [PUT]: { ok: true, data: { ageClass: 'adult', viewerWriteRestrictionGlobal: false } } });
    expect(await declareBirthDate(deps, '1990-05-04')).toEqual({ kind: 'saved', minorGlobal: false });
    expect(calls()).toEqual([{ method: 'PUT', path: BIRTH_DATE_PATH, body: { birthDate: '1990-05-04' } }]);
  });

  test('un mineur : Global fermée en écriture, dite par le serveur', async () => {
    const { deps } = scriptedGateway({ [PUT]: { ok: true, data: { ageClass: 'minor', viewerWriteRestrictionGlobal: true } } });
    expect(await declareBirthDate(deps, '2011-01-01')).toEqual({ kind: 'saved', minorGlobal: true });
  });

  test('une date déjà posée (409) : l’étape est faite', async () => {
    const { deps } = scriptedGateway({ [PUT]: { ok: false, status: 409, error: 'déjà', code: 'BIRTH_DATE_ALREADY_SET' } });
    expect(await declareBirthDate(deps, '1990-05-04')).toEqual({ kind: 'already-set' });
  });

  test('moins de 13 ans (422) : refus nommé', async () => {
    const { deps } = scriptedGateway({ [PUT]: { ok: false, status: 422, error: 'trop jeune', code: 'AGE_BELOW_MINIMUM' } });
    expect(await declareBirthDate(deps, '2020-01-01')).toEqual({ kind: 'below-minimum' });
  });

  test('une date refusée (400) : invalide', async () => {
    const { deps } = scriptedGateway({ [PUT]: { ok: false, status: 400, error: 'date invalide' } });
    expect(await declareBirthDate(deps, '3000-01-01')).toEqual({ kind: 'invalid' });
  });

  test('une passerelle qui ne connaît pas la route (404) : non prise en charge, rien ne bloque', async () => {
    const { deps } = scriptedGateway({});
    expect(await declareBirthDate(deps, '1990-05-04')).toEqual({ kind: 'unsupported' });
  });

  test('hors ligne, ou une autre panne : échec à réessayer', async () => {
    const offline = scriptedGateway({ [PUT]: { ok: false, status: 0, error: 'réseau' } });
    expect(await declareBirthDate(offline.deps, '1990-05-04')).toEqual({ kind: 'failed', offline: true });
    const down = scriptedGateway({ [PUT]: { ok: false, status: 503, error: 'indisponible' } });
    expect(await declareBirthDate(down.deps, '1990-05-04')).toEqual({ kind: 'failed', offline: false });
  });

  test('un 200 dont la charge est illisible : enregistré, sans restriction devinée', async () => {
    const { deps } = scriptedGateway({ [PUT]: { ok: true, data: { autre: 1 } } });
    expect(await declareBirthDate(deps, '1990-05-04')).toEqual({ kind: 'saved', minorGlobal: false });
  });
});
