import { describe, expect, test } from 'bun:test';

import { ROUTES } from '@/routes/route-table';

import { NETWORK_ONLY_NAVIGATIONS } from './network-only-navigations';

/**
 * LES NAVIGATIONS QUE NGINX TRAITE LUI-MÊME (bascule de meeshy.me, #6702).
 *
 * Un visiteur qui porte déjà le service worker de la v2 reçoit `index.html`
 * sur TOUTE navigation que `NavigationRoute` accepte — la coquille, sans
 * jamais atteindre le serveur. Les redirections 308 des anciennes adresses et
 * les fichiers que nginx sert seraient court-circuités pour lui seul, et pour
 * toujours.
 *
 * Workbox confronte chaque motif à `pathname + search`
 * (`NavigationRoute._match`, workbox-routing 6.6.0) : un motif qui s'arrête
 * sur `$` ne voit pas `/join?linkId=abc`. Les témoins portent donc la requête.
 */

const refused = (address: string): boolean => NETWORK_ONLY_NAVIGATIONS.some((pattern) => pattern.test(address));

const SAMPLE_PARAMS = ['64f1c2a9e8b7d6c5b4a39281', 'new', 'aff_zoe'] as const;
const SAMPLE_QUERIES = ['', '?q=1', '?ref=abc'] as const;

const addressesOf = (pattern: string): readonly string[] =>
  SAMPLE_PARAMS.flatMap((value) => SAMPLE_QUERIES.map((query) => `${pattern.replace(/\$[A-Za-z0-9_]+/g, value)}${query}`));

/**
 * **`/u/` SE PARTAGE ENTRE NGINX ET LA V2, ET LA COUPE EST MESURABLE** (#7083).
 *
 * `location /u/` n'est PAS une page : c'est `root /srv/legacy-uploads` +
 * `try_files $uri /index.html` (`apps/web-v2/nginx.conf:61-64`). Le volume
 * `frontend_uploads` y sert les avatars et bannières TÉLÉVERSÉS PAR LE LEGACY,
 * dont l'adresse `https://meeshy.me/u/…` est GRAVÉE EN BASE. Le `try_files`
 * est ce qui fait que `/u/<pseudo>`, qui n'est pas un fichier, retombe sur
 * `/index.html` et atteint la v2 — c'est d'ailleurs déjà ce que suppose la
 * redirection `^/users/(.+)$ → /u/$1`.
 *
 * **Jusqu'à #7083, la route ENTIÈRE était laissée au réseau** : un chargement à
 * froid de `/u/<pseudo>` faisait un aller-retour, et la fiche n'existait pas
 * hors ligne. La coupe se MESURE pourtant, et elle est nette :
 *
 *  - un pseudo valide est `^[a-zA-Z0-9_-]+$` (`usernamePatternSource`,
 *    `packages/shared/types/api-schemas/auth.ts`, 2 à 16 caractères) : il ne
 *    porte NI POINT NI BARRE ;
 *  - un `handle` peut aussi être un ObjectId (24 hexadécimaux) : pas de point
 *    non plus ;
 *  - un téléversement hérité porte TOUJOURS une extension (donc un point) et
 *    peut être imbriqué (donc une barre).
 *
 * D'où DEUX motifs au lieu d'un préfixe : le FICHIER part au réseau, la FICHE
 * revient à la coquille. Se tromper de sens ici casse **chaque avatar hérité**,
 * silencieusement, et pour les seuls lecteurs qui REVIENNENT — les deux
 * familles sont donc énumérées explicitement ci-dessous, jamais résumées par un
 * contre-exemple.
 */
const LEGACY_UPLOADS = [
  '/u/avatar-legacy.png',
  '/u/photo.jpeg?v=2',
  '/u/uploads/2024/x.jpg',
  '/u/a.b',
  '/u/uploads/photo',
] as const;

const V2_PROFILES = [
  '/u/kwame-mensah',
  '/u/kwame-mensah/',
  '/u/kwame-mensah?from=thread',
  '/u/64f1c2a9e8b7d6c5b4a39281',
  '/u/awa',
] as const;

describe('NETWORK_ONLY_NAVIGATIONS — confrontée à la table des routes', () => {
  test('aucune route de la v2 n’est laissée au réseau, avec ou sans requête', () => {
    for (const [key, { pattern }] of Object.entries(ROUTES)) {
      for (const address of addressesOf(pattern)) {
        expect({ key, address, refused: refused(address) }).toEqual({ key, address, refused: false });
      }
    }
  });

  test('`/u/` — le FICHIER hérité part au réseau, la FICHE revient à la coquille', () => {
    expect(ROUTES.userProfile.pattern).toBe('/u/$username');
    for (const address of LEGACY_UPLOADS) {
      expect({ address, refused: refused(address) }).toEqual({ address, refused: true });
    }
    for (const address of V2_PROFILES) {
      expect({ address, refused: refused(address) }).toEqual({ address, refused: false });
    }
  });

  test('`/hashtag/` — l’autre adresse ouverte par #7032 — reste à la v2', () => {
    expect(refused('/hashtag/livraison')).toBe(false);
    expect(refused('/hashtag/livraison?from=feed')).toBe(false);
  });

  test('`/conversations/new` reste à la v2 ; une conversation NOMMÉE va au réseau', () => {
    expect(refused('/conversations/new')).toBe(false);
    expect(refused('/conversations/new?draft=1')).toBe(false);
    expect(refused('/conversations/new/')).toBe(false);
    expect(refused('/conversations/64f1c2a9e8b7d6c5b4a39281')).toBe(true);
    expect(refused('/conversations/64f1c2a9e8b7d6c5b4a39281?messageId=m1')).toBe(true);
    expect(refused('/conversations/newsletter')).toBe(true);
  });

  test('les futures routes de la v2 — `/chat/`, `/l/` — ne sont pas laissées au réseau', () => {
    expect(refused('/chat/mshy_abc')).toBe(false);
    expect(refused('/l/tok_123')).toBe(false);
  });
});

describe('NETWORK_ONLY_NAVIGATIONS — ce que nginx redirige ou sert', () => {
  test('les anciennes adresses atteignent le réseau, requête comprise', () => {
    for (const address of [
      '/join',
      '/join/mshy_abc',
      '/join?linkId=mshy_abc',
      '/conversation/64f1c2a9e8b7d6c5b4a39281',
      '/p/64f1c2a9e8b7d6c5b4a39281',
      '/s/64f1c2a9e8b7d6c5b4a39281?x=1',
      '/users/awa',
      '/.well-known/assetlinks.json',
    ]) {
      expect({ address, refused: refused(address) }).toEqual({ address, refused: true });
    }
  });

  test('les fichiers exacts atteignent le réseau', () => {
    for (const address of ['/robots.txt', '/sitemap.xml', '/manifest.json', '/android-chrome-512x512.png']) {
      expect({ address, refused: refused(address) }).toEqual({ address, refused: true });
    }
  });

  test('un préfixe voisin n’est pas pris pour l’adresse qu’il frôle', () => {
    for (const address of ['/joinery', '/pages', '/sites', '/user/awa', '/robots.txt.bak', '/manifest.webmanifest', '/android-chrome-192x192.png']) {
      expect({ address, refused: refused(address) }).toEqual({ address, refused: false });
    }
  });

  test('la RACINE qui porte `affiliate=` atteint la redirection nginx, et elle seule', () => {
    expect(refused('/?affiliate=aff_zoe')).toBe(true);
    expect(refused('/?utm_source=sms&affiliate=aff_zoe')).toBe(true);
    expect(refused('/')).toBe(false);
    expect(refused('/?ref=abc')).toBe(false);
    expect(refused('/?notaffiliate=1')).toBe(false);
    expect(refused('/signup?affiliate=aff_zoe')).toBe(false);
  });

  test('aucun motif ne porte `g` ni `y` — Workbox rejoue `test` à chaque navigation', () => {
    expect(NETWORK_ONLY_NAVIGATIONS.filter((pattern) => pattern.global || pattern.sticky)).toEqual([]);
  });
});
