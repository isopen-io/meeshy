import type { NextConfig } from 'next';

import { REECRITURES_DE_ZONE } from './scripts/lib/perimetre-de-zone.mjs';

const nextConfig: NextConfig = {
  output: 'standalone',
  assetPrefix: '/__v3',
  poweredByHeader: false,
  reactStrictMode: true,
  /**
   * Les actifs du temps réel sont joignables DANS la zone (`/__v3/rt/…`,
   * conception § 12.4), mais aucune route de `app/` ne peut y vivre : Next
   * ignore tout segment qui commence par `_`. La réécriture qui les y porte
   * est déclarée UNE fois, dans `scripts/lib/perimetre-de-zone.mjs`, et le
   * garde de la chaîne la lit au même endroit.
   */
  rewrites: async () => ({
    beforeFiles: REECRITURES_DE_ZONE.map(({ source, destination }) => ({ source, destination })),
  }),
  /**
   * Ce que `standalone` ne trace pas tout seul.
   *
   * Le repli de `/l/:token` inline la table de jetons et un glyphe du sprite en
   * les LISANT sur le disque (`app/(public)/l/[token]/actifs-inlines.ts`) —
   * c'est ce qui lui évite d'en recopier les valeurs, donc de fabriquer la
   * seconde table que le § 3.2 corollaire 2 interdit. Mais une lecture par
   * chemin n'est pas un `import` : le traceur ne la voit pas, et sans la
   * déclaration ci-dessous les quatre fichiers manqueraient à l'image — un
   * document sans style, visible en production seulement.
   */
  outputFileTracingIncludes: {
    /**
     * Le sous-sprite critique est inliné par la COQUILLE (§ 8.5) : il est donc
     * lu par toute page, pas par une route nommée. La clé est un glob pour cette
     * seule raison — l'attacher à un chemin laisserait la page suivante servir
     * un document sans ses glyphes, et le défaut ne se verrait qu'en production.
     */
    '/**': ['./node_modules/@meeshy/icons/critical.svg'],
    /**
     * La vitrine, les cinq pages institutionnelles, les deux écrans d'accès et
     * les deux écrans de la zone connectée inlinent la table de jetons — même lecture par CHEMIN que l'écran d'un
     * lien, donc même invisibilité pour le traceur. Aucune ne déclare
     * `sprite.svg` : elles n'affichent aucun glyphe, et l'ajouter ferait voyager
     * 40 Ko dans l'image pour dix surfaces qui n'en lisent rien.
     *
     * `/login` et `/signup` la lisent DEUX fois — pour le formulaire, et pour le
     * document de REMISE que leur POST rend. La même entrée couvre les deux :
     * la clé est la ROUTE, pas la réponse.
     *
     * LA DÉCLARATION EST PAR ROUTE, et c'est ce qui rend l'oubli si coûteux :
     * une page dont l'entrée manque n'échoue NI au build, NI aux témoins, NI au
     * lint — elle sert un document SANS STYLE, et seulement dans l'image. Les
     * dix entrées sont donc composées à partir d'UNE liste, jamais recopiées.
     */
    ...Object.fromEntries(
      ['/', '/about', '/contact', '/partners', '/terms', '/privacy', '/login', '/signup'].map((route) => [
        route,
        [
          './node_modules/@meeshy/design-tokens/tokens.css',
          './node_modules/@meeshy/design-tokens/dark.css',
          './node_modules/@meeshy/design-tokens/light.css',
        ],
      ]),
    ),
    '/l/[token]': [
      './node_modules/@meeshy/design-tokens/tokens.css',
      './node_modules/@meeshy/design-tokens/dark.css',
      './node_modules/@meeshy/design-tokens/light.css',
      './node_modules/@meeshy/icons/sprite.svg',
    ],
    /**
     * Les DEUX portes du fil composent l'adresse HACHÉE des actifs du temps
     * réel (§ 12.4) : elles LISENT le module compilé et socket.io-client pour
     * en calculer l'empreinte, comme elles lisent la table et le sprite. Sans
     * ces entrées, l'image servirait un fil dont le chargeur vise une adresse
     * calculée sur un fichier absent — un 404 que seul le lecteur en
     * production verrait.
     */
    ...Object.fromEntries(
      ['/chats/[cle]', '/chat/[lien]'].map((route) => [
        route,
        [
          './node_modules/@meeshy/design-tokens/tokens.css',
          './node_modules/@meeshy/design-tokens/dark.css',
          './node_modules/@meeshy/design-tokens/light.css',
          './node_modules/@meeshy/icons/sprite.svg',
          './.rt/participate.js',
          './node_modules/socket.io-client/dist/socket.io.esm.min.js',
        ],
      ]),
    ),
    /**
     * `/chats` est la TROISIÈME surface de participation (§ 12.4) : elle compose
     * l'adresse hachée de SON module (`liste.js`) et de socket.io-client en les
     * LISANT, comme les deux portes du fil. Elle lit de plus le sprite — la
     * pastille de langue de chaque ligne et le chevron de son menu — et la table
     * de jetons. Sans cette entrée, l'image servirait une liste sans style dont
     * le chargeur vise une adresse calculée sur un fichier absent.
     */
    '/chats': [
      './node_modules/@meeshy/design-tokens/tokens.css',
      './node_modules/@meeshy/design-tokens/dark.css',
      './node_modules/@meeshy/design-tokens/light.css',
      './node_modules/@meeshy/icons/sprite.svg',
      './.rt/liste.js',
      './node_modules/socket.io-client/dist/socket.io.esm.min.js',
    ],
    '/rt/[nom]': [
      './.rt/participate.js',
      './.rt/liste.js',
      './node_modules/socket.io-client/dist/socket.io.esm.min.js',
    ],
  },
};

export default nextConfig;
