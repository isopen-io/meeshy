/**
 * #9239 — LE CACHE GEOIP EST BORNÉ, ET SA PURGE A UN APPELANT.
 *
 * `geoCache` (`services/GeoIPService.ts`) est indexé par l'IP du client. Il
 * n'avait aucun plafond, et ses entrées expirées n'étaient qu'IGNORÉES à la
 * lecture : il retenait une entrée par IP distincte vue depuis le démarrage du
 * processus. Sa taille n'était pilotée ni par la charge ni par le TTL — rien
 * ne la bornait. `cleanGeoCache()` existait, son commentaire disait « call
 * periodically », et le balayage des quatre hôtes plausibles (amorçage,
 * racine, ordonnanceur de jobs, maintenance) plus les douze fichiers de
 * `jobs/` n'a trouvé AUCUN appelant.
 *
 * Les témoins de comportement mesurent la TAILLE, pas la liste des évictions :
 * l'invariant est « la table ne franchit jamais son plafond », et il doit
 * tenir quelle que soit la politique d'éviction choisie. Celui de l'ordre
 * FIFO mesure en plus QUI reste, parce qu'évincer la plus fraîche serait un
 * plafond respecté pour un cache inutile.
 *
 * La garde de source est là pour que le retrait de l'ordonnancement casse la
 * suite au lieu de passer inaperçu — c'est exactement ce qui est arrivé la
 * première fois.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import {
  MAX_GEO_CACHE_ENTRIES,
  cachedGeo,
  cleanGeoCache,
  geoCacheSize,
  rememberGeo,
  resetGeoCacheForTests,
  type GeoIpData,
} from '../../../services/GeoIPService';

const geo = (ip: string): GeoIpData => ({
  ip,
  country: 'FR',
  countryName: 'France',
  city: 'Paris',
  region: 'Île-de-France',
  timezone: 'Europe/Paris',
  location: 'Paris, France',
});

const T0 = 1_760_000_000_000;
const TTL = 5 * 60 * 1000;

describe('#9239 — geoCache est borné', () => {
  beforeEach(() => resetGeoCacheForTests());

  it('le plafond est NOMMÉ et exporté — un nombre en dur dans le module ne se mesure pas', () => {
    expect(typeof MAX_GEO_CACHE_ENTRIES).toBe('number');
    expect(MAX_GEO_CACHE_ENTRIES).toBeGreaterThan(0);
  });

  it('écrire au-delà du plafond ne le franchit JAMAIS', () => {
    const total = MAX_GEO_CACHE_ENTRIES + 250;
    for (let i = 0; i < total; i += 1) {
      rememberGeo(`10.0.${Math.floor(i / 256)}.${i % 256}`, geo(`ip-${i}`), T0);
      expect(geoCacheSize()).toBeLessThanOrEqual(MAX_GEO_CACHE_ENTRIES);
    }
    expect(geoCacheSize()).toBe(MAX_GEO_CACHE_ENTRIES);
  });

  it('l’éviction est FIFO — la plus anciennement écrite part, la plus fraîche reste', () => {
    for (let i = 0; i < MAX_GEO_CACHE_ENTRIES; i += 1) rememberGeo(`ip-${i}`, geo(`ip-${i}`), T0);
    expect(cachedGeo('ip-0', T0)).not.toBeNull();

    rememberGeo('ip-neuve', geo('ip-neuve'), T0);

    expect(cachedGeo('ip-0', T0)).toBeNull();
    expect(cachedGeo('ip-neuve', T0)).not.toBeNull();
    expect(cachedGeo(`ip-${MAX_GEO_CACHE_ENTRIES - 1}`, T0)).not.toBeNull();
  });

  it('rafraîchir une entrée la remet en QUEUE de file — sinon une entrée vivante serait évincée avant une plus vieille', () => {
    for (let i = 0; i < MAX_GEO_CACHE_ENTRIES; i += 1) rememberGeo(`ip-${i}`, geo(`ip-${i}`), T0);

    /* `ip-0` est la plus ancienne ; on la revoit. Un `Map.set` sur une clé qui
       existe NE DÉPLACE PAS son rang d'insertion : sans traitement, elle
       resterait la première évincée alors qu'elle vient d'être servie. */
    rememberGeo('ip-0', geo('ip-0'), T0 + 1);
    rememberGeo('ip-neuve', geo('ip-neuve'), T0 + 2);

    expect(cachedGeo('ip-0', T0 + 2)).not.toBeNull();
    expect(cachedGeo('ip-1', T0 + 2)).toBeNull();
  });
});

describe('#9239 — la purge LIBÈRE au lieu d’ignorer', () => {
  beforeEach(() => resetGeoCacheForTests());

  it('retire les expirées, garde les vivantes, et rend le compte', () => {
    rememberGeo('vieille-1', geo('vieille-1'), T0);
    rememberGeo('vieille-2', geo('vieille-2'), T0);
    rememberGeo('fraiche', geo('fraiche'), T0 + TTL);
    expect(geoCacheSize()).toBe(3);

    const liberees = cleanGeoCache(T0 + TTL + 1);

    expect(liberees).toBe(2);
    expect(geoCacheSize()).toBe(1);
    expect(cachedGeo('fraiche', T0 + TTL + 1)).not.toBeNull();
  });

  it('une table sans expirée ne libère rien — la purge ne ment pas sur son travail', () => {
    rememberGeo('fraiche', geo('fraiche'), T0);
    expect(cleanGeoCache(T0 + 1)).toBe(0);
    expect(geoCacheSize()).toBe(1);
  });
});

/* ------------------------------------------------------------------------- */

const SRC = path.resolve(__dirname, '../../..');
const DEFINITION = path.join(SRC, 'services', 'GeoIPService.ts');

function fichiersTs(racine: string): string[] {
  const sortie: string[] = [];
  for (const entree of fs.readdirSync(racine, { withFileTypes: true })) {
    const complet = path.join(racine, entree.name);
    if (entree.isDirectory()) {
      if (entree.name !== '__tests__') sortie.push(...fichiersTs(complet));
    } else if (entree.name.endsWith('.ts') && complet !== DEFINITION) {
      sortie.push(complet);
    }
  }
  return sortie;
}

/** `cleanGeoCache(` ailleurs qu'en tête de sa propre définition. */
const APPEL = /cleanGeoCache\s*\(/;

function appels(texte: string): number {
  return texte
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))
    .filter((l) => APPEL.test(l)).length;
}

describe('#9239 — `cleanGeoCache()` n’est plus orpheline', () => {
  it('le balayage LIT bien l’arbre du service — sinon il serait vert à vide', () => {
    expect(fichiersTs(SRC).length).toBeGreaterThan(200);
    expect(appels('cleanGeoCache();')).toBe(1);
    expect(appels('// cleanGeoCache();')).toBe(0);
    expect(appels("logger.info('rien');")).toBe(0);
  });

  it('au moins un site de PRODUCTION l’appelle', () => {
    const appelants = fichiersTs(SRC).filter((f) => appels(fs.readFileSync(f, 'utf8')) > 0);
    expect(appelants.map((f) => path.relative(SRC, f))).not.toHaveLength(0);
  });
});
