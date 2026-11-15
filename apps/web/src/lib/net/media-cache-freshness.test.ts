import { describe, expect, test } from 'bun:test';

import { mediaCacheFreshnessPlugin } from './media-cache-freshness';

/**
 * LE SEAU `medias` N'ÉCRIT NI NE SERT UN MÉDIA PROTÉGÉ (#9478).
 *
 * La passerelle dit `private, no-store` pour une vue unique et
 * `private, no-cache` pour un éphémère (#9315). `CacheFirst` les gardait trente
 * jours sans regarder : une vue unique se relisait depuis le disque du poste
 * après sa fin de vie. Un média ordinaire, lui, reste servi depuis le cache.
 */

const SCENE = 'https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Fu%2Fscene.jpg';

const reponse = (cacheControl: string | null, status = 200): Response =>
  new Response(status === 0 ? null : 'octets', {
    status: status === 0 ? 200 : status,
    headers: cacheControl === null ? {} : { 'Cache-Control': cacheControl },
  });

const ecrit = (response: Response) =>
  mediaCacheFreshnessPlugin.cacheWillUpdate({ request: new Request(SCENE), response });

const sert = (cachedResponse: Response | undefined) =>
  mediaCacheFreshnessPlugin.cachedResponseWillBeUsed({ request: new Request(SCENE), cachedResponse });

describe('l’écriture dans le seau `medias`', () => {
  test('une vue unique (`private, no-store`) n’est jamais écrite', async () => {
    expect(await ecrit(reponse('private, no-store'))).toBeNull();
  });

  test('un éphémère (`private, no-cache`) n’est pas écrit — le cache HTTP le revalide par ETag', async () => {
    expect(await ecrit(reponse('private, no-cache'))).toBeNull();
  });

  test('les directives se lisent sans égard à la casse ni à l’ordre', async () => {
    expect(await ecrit(reponse('No-Store, private'))).toBeNull();
    expect(await ecrit(reponse('max-age=0,no-cache'))).toBeNull();
  });

  test('un média ordinaire est écrit tel quel — le Cache-First nominal ne change pas', async () => {
    const ordinaire = reponse('private, max-age=31536000');
    expect(await ecrit(ordinaire)).toBe(ordinaire);
  });

  test('une réponse sans Cache-Control (actif de l’origine, CDN tiers) est écrite', async () => {
    const nue = reponse(null);
    expect(await ecrit(nue)).toBe(nue);
  });

  test('un nom de directive qui CONTIENT « no-store » sans l’être ne bloque rien', async () => {
    const voisine = reponse('private, x-no-store-hint=1');
    expect(await ecrit(voisine)).toBe(voisine);
  });
});

describe('la lecture depuis le seau `medias`', () => {
  test('une entrée qui porte `no-store` n’est jamais resservie — le réseau tranche', async () => {
    expect(await sert(reponse('private, no-store'))).toBeNull();
  });

  test('une entrée qui porte `no-cache` n’est pas resservie sans revalidation', async () => {
    expect(await sert(reponse('private, no-cache'))).toBeNull();
  });

  test('une entrée ordinaire est servie depuis le cache, sans réseau', async () => {
    const ordinaire = reponse('private, max-age=31536000');
    expect(await sert(ordinaire)).toBe(ordinaire);
  });

  test('un cache vide reste vide', async () => {
    expect(await sert(undefined)).toBeNull();
  });
});

describe('autonomie — Workbox stringifie le greffon dans `dist/sw.js` (#6862)', () => {
  test('chaque fonction, recompilée depuis son texte dans un contexte nu, décide pareil', async () => {
    const ecritNu = new Function(`"use strict"; return (${String(mediaCacheFreshnessPlugin.cacheWillUpdate)});`)();
    const sertNu = new Function(`"use strict"; return (${String(mediaCacheFreshnessPlugin.cachedResponseWillBeUsed)});`)();
    expect(await ecritNu({ response: reponse('private, no-store') })).toBeNull();
    expect(await sertNu({ cachedResponse: reponse('private, no-cache') })).toBeNull();
    const ordinaire = reponse('private, max-age=31536000');
    expect(await ecritNu({ response: ordinaire })).toBe(ordinaire);
  });
});
