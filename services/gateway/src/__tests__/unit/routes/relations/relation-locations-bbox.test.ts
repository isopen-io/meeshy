/**
 * L'emprise de `GET /relations/locations` (#16980) : quatre nombres dans les bornes, ou
 * rien ; une emprise illisible est refusée plutôt que lue comme « toute la carte ».
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { parseBbox } from '../../../../routes/relations/locations';

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
