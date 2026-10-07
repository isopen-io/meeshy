/**
 * #9609 — **le pays et la ville d'une session se déduisent d'une base LOCALE
 * (DB-IP Lite), sans jamais envoyer l'adresse à un tiers.**
 *
 * Le témoin juge deux choses séparément, parce qu'elles échouent séparément :
 * le CHARGEMENT de la base (fichier absent, illisible, renouvelé chaque mois)
 * et la LECTURE d'une adresse (privée, IPv6, mal formée, base absente). Aucun
 * appel réseau n'est toléré : `fetch` est épié dans chaque cas.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  createGeoIpDatabase,
  type GeoIpRecord,
  type GeoIpRecordSource,
} from '../../../services/geoip/local-geoip-database';
import {
  lookupGeoIp,
  resetGeoCacheForTests,
  useGeoIpDatabaseForTests,
} from '../../../services/GeoIPService';

const PARIS: GeoIpRecord = {
  country: { iso_code: 'FR', names: { en: 'France' } },
  city: { names: { en: 'Paris' } },
  subdivisions: [{ names: { en: 'Île-de-France' } }],
  location: { latitude: 48.85, longitude: 2.35 } as GeoIpRecord['location'],
};

const sourceOf = (records: Readonly<Record<string, GeoIpRecord>>) => {
  const asked: string[] = [];
  const source: GeoIpRecordSource = {
    get: (ip) => {
      asked.push(ip);
      return records[ip] ?? null;
    },
  };
  return { source, asked };
};

const databaseServing = (source: GeoIpRecordSource | null) => ({ source: async () => source });

let fetchSpy: jest.SpiedFunction<typeof fetch>;

beforeEach(() => {
  resetGeoCacheForTests();
  fetchSpy = jest.spyOn(global, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
  useGeoIpDatabaseForTests(null);
});

describe('lookupGeoIp — base locale', () => {
  it('déduit pays, nom du pays, ville et région d’une adresse publique, sans appel sortant', async () => {
    const { source } = sourceOf({ '81.2.69.160': PARIS });
    useGeoIpDatabaseForTests(databaseServing(source));

    const geo = await lookupGeoIp('81.2.69.160');

    expect(geo).toEqual({
      ip: '81.2.69.160',
      country: 'FR',
      countryName: 'France',
      city: 'Paris',
      region: 'Île-de-France',
      timezone: null,
      location: 'Paris, France',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ne rend jamais de coordonnées, même quand la base en porte', async () => {
    const { source } = sourceOf({ '81.2.69.160': PARIS });
    useGeoIpDatabaseForTests(databaseServing(source));

    const geo = await lookupGeoIp('81.2.69.160');

    expect(geo).not.toHaveProperty('latitude');
    expect(geo).not.toHaveProperty('longitude');
  });

  it('une adresse privée rend « Local » sans consulter la base', async () => {
    const { source, asked } = sourceOf({});
    useGeoIpDatabaseForTests(databaseServing(source));

    const geo = await lookupGeoIp('192.168.1.20');

    expect(geo?.location).toBe('Local');
    expect(geo?.country).toBeNull();
    expect(asked).toEqual([]);
  });

  it('une adresse IPv6 privée (fd00::/8) ne consulte pas la base non plus', async () => {
    const { source, asked } = sourceOf({});
    useGeoIpDatabaseForTests(databaseServing(source));

    expect((await lookupGeoIp('fd12:3456::1'))?.location).toBe('Local');
    expect(asked).toEqual([]);
  });

  it('une adresse IPv6 publique est cherchée telle quelle', async () => {
    const { source, asked } = sourceOf({ '2a01:cb00::1': PARIS });
    useGeoIpDatabaseForTests(databaseServing(source));

    expect((await lookupGeoIp('2a01:cb00::1'))?.city).toBe('Paris');
    expect(asked).toEqual(['2a01:cb00::1']);
  });

  it('une IPv4 écrite en IPv6 (::ffff:a.b.c.d) est cherchée sur son IPv4', async () => {
    const { source, asked } = sourceOf({ '81.2.69.160': PARIS });
    useGeoIpDatabaseForTests(databaseServing(source));

    expect((await lookupGeoIp('::ffff:81.2.69.160'))?.country).toBe('FR');
    expect(asked).toEqual(['81.2.69.160']);
  });

  it('sans base installée, le lieu est inconnu et rien ne part au réseau', async () => {
    useGeoIpDatabaseForTests(databaseServing(null));

    expect(await lookupGeoIp('81.2.69.160')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('une adresse absente de la base rend un lieu inconnu, pas une erreur', async () => {
    const { source } = sourceOf({});
    useGeoIpDatabaseForTests(databaseServing(source));

    expect(await lookupGeoIp('81.2.69.161')).toBeNull();
  });

  it('une adresse mal formée ne lève pas : la base n’est même pas consultée', async () => {
    const { source, asked } = sourceOf({});
    useGeoIpDatabaseForTests(databaseServing(source));

    expect(await lookupGeoIp('not-an-ip')).toBeNull();
    expect(asked).toEqual([]);
  });

  it('une base qui lève sur une lecture rend un lieu inconnu', async () => {
    useGeoIpDatabaseForTests(databaseServing({ get: () => { throw new Error('corrupt node'); } }));

    expect(await lookupGeoIp('81.2.69.160')).toBeNull();
  });

  it('un pays sans ville se dit par le pays seul', async () => {
    const { source } = sourceOf({ '81.2.69.160': { country: { iso_code: 'FR', names: { en: 'France' } } } });
    useGeoIpDatabaseForTests(databaseServing(source));

    const geo = await lookupGeoIp('81.2.69.160');
    expect(geo?.city).toBeNull();
    expect(geo?.location).toBe('France');
  });
});

describe('createGeoIpDatabase — chargement et renouvellement', () => {
  const enoent = () => Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });

  const harness = (initial: { readonly mtimeMs: number } | 'absent') => {
    let file = initial;
    let now = 0;
    const reads: string[] = [];
    const opened: Buffer[] = [];
    const database = createGeoIpDatabase({
      path: '/app/geoip/dbip-city-lite.mmdb',
      recheckEveryMs: 60_000,
      now: () => now,
      fs: {
        stat: async () => {
          if (file === 'absent') throw enoent();
          return { mtimeMs: file.mtimeMs };
        },
        readFile: async (path) => {
          reads.push(path);
          return Buffer.from(`db@${file === 'absent' ? 'none' : file.mtimeMs}`);
        },
      },
      open: (buffer) => {
        opened.push(buffer);
        if (buffer.toString() === 'db@666') throw new Error('Cannot locate metadata');
        return { get: () => ({ country: { iso_code: buffer.toString() } }) };
      },
    });
    return {
      database,
      reads,
      opened,
      replaceFile: (next: { readonly mtimeMs: number } | 'absent') => { file = next; },
      advance: (ms: number) => { now += ms; },
    };
  };

  it('fichier absent : aucune base, aucune lecture, et rien ne lève', async () => {
    const h = harness('absent');
    expect(await h.database.source()).toBeNull();
    expect(h.reads).toEqual([]);
  });

  it('charge la base une fois, puis la sert sans relire le disque', async () => {
    const h = harness({ mtimeMs: 1 });
    const first = await h.database.source();
    const second = await h.database.source();
    expect(first?.get('1.1.1.1')?.country?.iso_code).toBe('db@1');
    expect(second).toBe(first);
    expect(h.reads).toHaveLength(1);
  });

  it('deux lectures simultanées au démarrage ne chargent la base qu’une fois', async () => {
    const h = harness({ mtimeMs: 1 });
    const [a, b] = await Promise.all([h.database.source(), h.database.source()]);
    expect(a).toBe(b);
    expect(h.reads).toHaveLength(1);
  });

  it('reprend la base renouvelée (mise à jour mensuelle) sans redémarrage, au prochain contrôle', async () => {
    const h = harness({ mtimeMs: 1 });
    await h.database.source();
    h.replaceFile({ mtimeMs: 2 });

    expect((await h.database.source())?.get('1.1.1.1')?.country?.iso_code).toBe('db@1');
    h.advance(60_000);
    expect((await h.database.source())?.get('1.1.1.1')?.country?.iso_code).toBe('db@2');
    expect(h.reads).toHaveLength(2);
  });

  it('une base renouvelée mais illisible laisse servir la précédente', async () => {
    const h = harness({ mtimeMs: 1 });
    await h.database.source();
    h.replaceFile({ mtimeMs: 666 });
    h.advance(60_000);

    expect((await h.database.source())?.get('1.1.1.1')?.country?.iso_code).toBe('db@1');
  });

  it('une base retirée du disque cesse d’être servie', async () => {
    const h = harness({ mtimeMs: 1 });
    await h.database.source();
    h.replaceFile('absent');
    h.advance(60_000);

    expect(await h.database.source()).toBeNull();
  });
});

describe('l’état de la base est visible, jamais une dégradation silencieuse', () => {
  const fsWith = (stat: () => Promise<{ readonly mtimeMs: number }>) => ({
    stat,
    readFile: async () => Buffer.from('db'),
  });

  it('rend « unchecked » avant tout chargement, « loaded » une fois chargée', async () => {
    const database = createGeoIpDatabase({
      path: '/x.mmdb', recheckEveryMs: 1, now: () => 0,
      fs: fsWith(async () => ({ mtimeMs: 1 })),
      open: () => ({ get: () => null }),
    });
    expect(database.status?.()).toBe('unchecked');
    await database.source();
    expect(database.status?.()).toBe('loaded');
  });

  it('rend « missing » quand le fichier manque', async () => {
    const database = createGeoIpDatabase({
      path: '/x.mmdb', recheckEveryMs: 1, now: () => 0,
      fs: fsWith(async () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); }),
      open: () => ({ get: () => null }),
    });
    await database.source();
    expect(database.status?.()).toBe('missing');
  });

  it('rend « unreadable » quand le fichier présent ne s’ouvre pas et qu’aucune base n’est servie', async () => {
    const database = createGeoIpDatabase({
      path: '/x.mmdb', recheckEveryMs: 1, now: () => 0,
      fs: fsWith(async () => ({ mtimeMs: 1 })),
      open: () => { throw new Error('Cannot locate metadata'); },
    });
    await database.source();
    expect(database.status?.()).toBe('unreadable');
  });

  it('le vrai lecteur MMDB refuse un fichier qui n’en est pas un — la base reste « unreadable »', async () => {
    const { Reader } = await import('mmdb-lib');
    const database = createGeoIpDatabase({
      path: '/x.mmdb', recheckEveryMs: 1, now: () => 0,
      fs: fsWith(async () => ({ mtimeMs: 1 })),
      open: (buffer) => { const reader = new Reader(buffer); return { get: (ip) => reader.get(ip) }; },
    });
    expect(await database.source()).toBeNull();
    expect(database.status?.()).toBe('unreadable');
  });
});
