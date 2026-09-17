import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { API_RESPONSE_CACHE_PATTERN, apiResponseMayBeCached } from './api-runtime-cache';
import {
  ADMIN_CONVERSATIONS_PAGE_SIZE,
  ADMIN_MESSAGES_PAGE_SIZE,
} from '@/lib/api/admin-conversations';

/**
 * **LA SECONDE COPIE SUR LE DISQUE** (#6862, revue-correction).
 *
 * Le cache de requêtes exclut déjà les clés souveraines. Le SERVICE WORKER,
 * lui, écrivait la même charge — la réponse HTTP entière — dans
 * `caches.open('api')`, sept jours durant. Deux témoins, et le second est
 * celui qui manquait partout : la loi doit être BRANCHÉE, pas seulement juste.
 */
describe('une réponse d’administration ne va JAMAIS dans le cache du service worker', () => {
  test('les deux routes de la lecture souveraine sont exclues', () => {
    expect(apiResponseMayBeCached('/api/v1/admin/conversations/c1/messages')).toBe(false);
    expect(apiResponseMayBeCached('/api/v1/admin/conversations')).toBe(false);
  });

  test('toute l’administration l’est, pagination comprise — un filtre qui énumère se périme', () => {
    expect(apiResponseMayBeCached(`/api/v1/admin/users?offset=${ADMIN_CONVERSATIONS_PAGE_SIZE}`)).toBe(false);
    expect(apiResponseMayBeCached(`/api/v1/admin/agent/scan-logs?limit=${ADMIN_MESSAGES_PAGE_SIZE}`)).toBe(false);
    expect(apiResponseMayBeCached('/api/v1/admin/une-route-qui-n-existe-pas-encore')).toBe(false);
  });

  test('CONTRASTE — le reste de l’API reste gardé, sans quoi la v2 perdrait son hors-ligne', () => {
    expect(apiResponseMayBeCached('/api/v1/conversations')).toBe(true);
    expect(apiResponseMayBeCached('/api/v1/conversations/c1/messages')).toBe(true);
    // Un chemin qui CONTIENT « admin » sans en être : la garde lit un PRÉFIXE.
    expect(apiResponseMayBeCached('/api/v1/users/administrateur')).toBe(true);
  });

  test('ce qui n’est pas l’API n’est pas l’affaire de cette règle', () => {
    expect(apiResponseMayBeCached('/assets/app.js')).toBe(false);
  });

  /**
   * LA LOI EST BRANCHÉE — le témoin qui manque le plus souvent (`une loi qui
   * calcule une valeur que personne ne lit`). `vite.config.ts` se lit comme du
   * TEXTE : l'importer exécuterait la configuration entière (greffons, lecture
   * de `git`, préchauffage des pages institutionnelles) pour une assertion
   * d'une ligne.
   *
   * Ce témoin ne suffit PAS, et c'est sa leçon : il verdissait pendant que le
   * service worker livré ignorait la règle. Workbox stringifie le
   * `urlPattern` ; seul `check-sw-api-cache.mjs`, qui fait décider
   * `dist/sw.js`, juge. Les deux assertions ci-dessous gardent donc ce qui SE
   * SÉRIALISE, pas ce qui se lit.
   */
  test('`vite.config.ts` reçoit une VALEUR sérialisable, jamais un prédicat importé', () => {
    const config = readFileSync(new URL('../../../vite.config.ts', import.meta.url), 'utf8');
    expect(config).toContain('urlPattern: API_RESPONSE_CACHE_PATTERN');
    // La forme de `dev` — si elle revient, la charge d'administration repart
    // sur le disque sans qu'aucun autre témoin ne le voie.
    expect(config).not.toContain("url.pathname.startsWith('/api/'),");
    // La forme de la PREMIÈRE version de ce lot : juste, branchée, et perdue
    // à la sérialisation — `apiResponseMayBeCached` n'existe pas dans sw.js.
    expect(config).not.toContain('apiResponseMayBeCached');
  });

  test('la règle EST la valeur passée à Workbox — le prédicat n’en est qu’une projection', () => {
    expect(API_RESPONSE_CACHE_PATTERN).toBeInstanceOf(RegExp);
    expect(API_RESPONSE_CACHE_PATTERN.test('https://gate.meeshy.me/api/v1/admin/users')).toBe(false);
    expect(API_RESPONSE_CACHE_PATTERN.test('https://gate.meeshy.me/api/v1/conversations')).toBe(true);
    // Workbox n'accepte une expression régulière sur une URL d'origine
    // ÉTRANGÈRE que si la correspondance commence à l'indice 0.
    expect(
      'https://gate.meeshy.me/api/v1/conversations'.match(API_RESPONSE_CACHE_PATTERN)?.index,
    ).toBe(0);
  });
});
