/**
 * L'emprise de `GET /relations/locations` (#16980) : quatre nombres dans les bornes, ou
 * rien ; une emprise illisible est refusée plutôt que lue comme « toute la carte ».
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import fastJson from 'fast-json-stringify';
import { parseBbox, sharedLocationItemSchema } from '../../../../routes/relations/locations';

describe('parseBbox', () => {
  it('absente : toute la carte', () => {
    expect(parseBbox(undefined)).toBeUndefined();
    expect(parseBbox('')).toBeUndefined();
  });

  it('lit minLongitude,minLatitude,maxLongitude,maxLatitude', () => {
    expect(parseBbox('2.2, 48.8, 2.5, 48.9')).toEqual({ minLongitude: 2.2, minLatitude: 48.8, maxLongitude: 2.5, maxLatitude: 48.9 });
  });

  it.each(['2.2,48.8,2.5', '2.2,48.8,2.5,abc', '2.2,91,2.5,92', '2.5,48.8,2.2,48.9', '181,0,182,1'])('refuse « %s »', (raw) => {
    expect(parseBbox(raw)).toBeNull();
  });

  it('refuse une emprise répétée dans l\'adresse', () => {
    expect(parseBbox(['1,1,2,2', '3,3,4,4'])).toBeNull();
  });
});

describe('la forme servie au rattrapage (#17966)', () => {
  const serialize = fastJson(sharedLocationItemSchema as unknown as Parameters<typeof fastJson>[0]);
  const servie = {
    userId: '6300000000000000000000e1',
    latitude: 48.85,
    longitude: 2.35,
    precision: 'city',
    radiusMeters: 8000,
    circle: 'CLOSE',
    updatedAt: '2026-11-08T12:00:00.000Z',
    expiresAt: '2026-11-08T13:00:00.000Z',
  };

  it('le cercle traverse le sérialiseur', () => {
    expect(JSON.parse(serialize(servie))).toEqual(servie);
  });

  it('rien de plus riche ne part à côté : un champ non déclaré est retiré', () => {
    expect(JSON.parse(serialize({ ...servie, accuracy: 4, recipients: ['x'] }))).toEqual(servie);
  });
});
