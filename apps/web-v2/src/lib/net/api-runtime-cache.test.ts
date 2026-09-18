import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  API_RESPONSE_CACHE_PATTERN,
  MEDIA_RESPONSE_CACHE_PATTERN,
  apiResponseMayBeCached,
  mediaImageCrossOrigin,
  mediaResponseMayBeCached,
} from './api-runtime-cache';
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

/**
 * **LES MÉDIAS SORTENT DU SEAU DU JSON** (#6973).
 *
 * Mesuré sur `dist/sw.js` du 2026-09-18, en rejouant le routeur de Workbox
 * (première route qui matche) sur l'artefact LIVRÉ :
 *
 *     SEAU api   [image] …/api/v1/attachments/file/2026%2F09%2Fu%2Favatar.png
 *     SEAU api   [image] …/api/v1/attachments/file/2026%2F09%2Fu%2Fscene.jpg
 *     SEAU api   [video] …/api/v1/attachments/file/2026%2F09%2Fu%2Freel.mp4
 *     SEAU api   [audio] …/api/v1/attachments/file/2026%2F09%2Fu%2Fvoix.m4a
 *     SEAU api   [json ] …/api/v1/conversations?limit=30
 *
 * Toute URL de média passe par `/api/v1/attachments/…` (`media-url.ts`, site
 * unique `streamSrc`) et le motif du seau `api` n'était ancré sur aucune
 * origine : les médias GAGNAIENT la route du JSON, enregistrée la première.
 *
 * Le coût n'est pas « les images ne sont pas en CacheFirst » — c'est que le
 * plafond de 200 entrées du seau `api` était PARTAGÉ. Un défilement de fil
 * évinçait les réponses de conversations et de messages dont la lecture hors
 * ligne dépend : le cache payé une fois, chassé par les images qu'on vient de
 * voir passer.
 */
describe('un média ne va JAMAIS dans le seau du JSON (#6973)', () => {
  test('la route de flux sort du seau `api` — sur les DEUX montages de la passerelle', () => {
    expect(apiResponseMayBeCached('/api/v1/attachments/file/2026%2F09%2Fu%2Favatar.png')).toBe(false);
    // Le montage LEGACY non versionné sert encore des `fileUrl` persistées
    // depuis des années (`download.ts` § `registerFileStreamRoute`).
    expect(apiResponseMayBeCached('/api/attachments/file/2026%2F09%2Fu%2Favatar.png')).toBe(false);
    expect(apiResponseMayBeCached('/api/v1/attachments/abc123/thumbnail')).toBe(false);
    expect(apiResponseMayBeCached('/api/v1/attachments/file/2026%2F09%2Fu%2Freel.mp4')).toBe(false);
  });

  test("CONTRASTE — le JSON garde le seau `api` ENTIER, c'est le vrai enjeu", () => {
    expect(apiResponseMayBeCached('/api/v1/conversations?limit=30')).toBe(true);
    expect(apiResponseMayBeCached('/api/v1/conversations/c1/messages')).toBe(true);
    // Un chemin qui COMMENCE par « attachments » sans être la route : la garde
    // lit un SEGMENT, pas un préfixe de chaîne.
    expect(apiResponseMayBeCached('/api/v1/attachmentsfoo')).toBe(true);
  });

  test('`MEDIA_RESPONSE_CACHE_PATTERN` reconnaît la route de flux, absolue comme relative', () => {
    expect(mediaResponseMayBeCached('https://gate.meeshy.me/api/v1/attachments/file/x.png')).toBe(true);
    expect(mediaResponseMayBeCached('/api/v1/attachments/file/x.png')).toBe(true);
    expect(mediaResponseMayBeCached('/api/attachments/file/x.png')).toBe(true);
    expect(mediaResponseMayBeCached('/api/v1/attachments/abc123/thumbnail')).toBe(true);
  });

  test('et RIEN d’autre — ni le JSON, ni un actif de marque, ni un aperçu local', () => {
    expect(mediaResponseMayBeCached('/api/v1/conversations')).toBe(false);
    expect(mediaResponseMayBeCached('/brand/logo.png')).toBe(false);
    expect(mediaResponseMayBeCached('https://cdn.example.com/photo.png')).toBe(false);
    expect(mediaResponseMayBeCached('blob:https://staging.meeshy.me/abcd')).toBe(false);
  });

  /**
   * LES DEUX MOTIFS SONT DISJOINTS, et ce témoin est celui qui compte : une
   * URL reconnue par les DEUX retomberait dans le seau enregistré le premier —
   * le défaut qu'on vient de fermer, à l'envers.
   */
  test('aucune URL n’appartient aux DEUX motifs', () => {
    const TABLE = [
      'https://gate.meeshy.me/api/v1/conversations?limit=30',
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fu%2Favatar.png',
      'https://gate.meeshy.me/api/attachments/file/2026%2F09%2Fu%2Fvoix.m4a',
      'https://gate.meeshy.me/api/v1/attachments/abc/thumbnail',
      'https://gate.meeshy.me/api/v1/admin/users',
      'https://meeshy.me/brand/logo.png',
    ];

    for (const href of TABLE) {
      const dansApi = API_RESPONSE_CACHE_PATTERN.test(href);
      const dansMedias = MEDIA_RESPONSE_CACHE_PATTERN.test(href);
      expect(`${href} → api=${dansApi} medias=${dansMedias}`).not.toBe(`${href} → api=true medias=true`);
    }
  });
});

/**
 * **UN EN-TÊTE CORS EST INERTE TANT QUE L'`<img>` NE DEMANDE PAS LE MODE
 * `cors`** (#6973, point 3).
 *
 * La passerelle pose déjà `Access-Control-Allow-Origin: *` et
 * `Cross-Origin-Resource-Policy: cross-origin` sur la route de flux
 * (`services/gateway/src/routes/attachments/download.ts`, `crossOriginMediaHeaders`).
 * Sans `crossOrigin` sur l'`<img>`, la requête part en `no-cors` : la réponse
 * est OPAQUE (status 0), le cache la garde à l'aveugle (une page d'erreur 404
 * y serait indiscernable d'une image) et chaque entrée consomme un quota
 * majoré par le remplissage de la spécification.
 *
 * MAIS LA POSER PARTOUT CASSE CE QU'ELLE PRÉTEND RÉPARER : un hôte qui ne
 * rend pas `Access-Control-Allow-Origin` fait ÉCHOUER l'image dès que la
 * requête passe en mode `cors`. `attachmentSrc` laisse passer INCHANGÉES les
 * adresses externes (un CDN, le magasin statique `static.meeshy.me`) et les
 * aperçus locaux — le dépôt en a un témoin vivant (`avatar.test.tsx`,
 * `https://cdn.example/lea.jpg`). `crossOrigin` est donc une affirmation sur
 * le SERVEUR : on ne la pose que là où on connaît sa réponse.
 */
describe('`crossOrigin` se pose sur ce que la PASSERELLE sert, jamais à l’aveugle', () => {
  test('la route de flux de la passerelle ⇒ `anonymous`', () => {
    expect(mediaImageCrossOrigin('https://gate.meeshy.me/api/v1/attachments/file/x.png')).toBe('anonymous');
    expect(mediaImageCrossOrigin('/api/v1/attachments/file/x.png')).toBe('anonymous');
    expect(mediaImageCrossOrigin('https://gate.meeshy.me/api/v1/attachments/abc/thumbnail')).toBe('anonymous');
  });

  test('un hôte dont on ne connaît PAS la réponse CORS ⇒ rien — l’image ne doit pas casser', () => {
    expect(mediaImageCrossOrigin('https://cdn.example/lea.jpg')).toBeUndefined();
    expect(mediaImageCrossOrigin('https://static.meeshy.me/u/i/2025/11/photo.png')).toBeUndefined();
  });

  test('un aperçu local, une chaîne vide, une source ABSENTE ⇒ rien', () => {
    expect(mediaImageCrossOrigin('blob:https://staging.meeshy.me/abcd')).toBeUndefined();
    expect(mediaImageCrossOrigin('data:image/png;base64,iVBOR')).toBeUndefined();
    expect(mediaImageCrossOrigin('')).toBeUndefined();
    // `undefined` est accepté pour que l'appelant n'ait pas à le trier :
    // `Avatar` rend l'`<img>` sous une garde que TypeScript ne réduit pas.
    expect(mediaImageCrossOrigin(undefined)).toBeUndefined();
  });
});

/**
 * LES DEUX MOITIÉS SONT INDISSOCIABLES (#6973) : sortir les médias du seau du
 * JSON ne change RIEN si `cacheableResponse` rejette la réponse opaque en
 * silence. Ce témoin garde ce qui SE SÉRIALISE dans `dist/sw.js` — il ne
 * suffit pas (`check-sw-api-cache.mjs` fait décider l'artefact), il garde
 * juste le CÂBLAGE que Workbox lit.
 */
describe('`vite.config.ts` déclare les deux moitiés, dans le bon ORDRE', () => {
  const config = readFileSync(new URL('../../../vite.config.ts', import.meta.url), 'utf8');

  test('le seau des médias est enregistré AVANT celui de l’API — Workbox retient la première route', () => {
    const medias = config.indexOf('SW_RUNTIME_CACHES.medias');
    const api = config.indexOf('cacheName: SW_RUNTIME_CACHES.api');
    expect(medias).toBeGreaterThan(-1);
    expect(api).toBeGreaterThan(-1);
    expect(medias).toBeLessThan(api);
  });

  test('`cacheableResponse: { statuses: [0, 200] }` est déclaré — sans elle, l’opaque est rejetée', () => {
    expect(config).toContain('cacheableResponse: { statuses: [0, 200] }');
  });
});
