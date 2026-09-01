import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  assetPrefix: '/__v3',
  poweredByHeader: false,
  reactStrictMode: true,
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
     * La vitrine et les cinq pages institutionnelles inlinent la table de
     * jetons — même lecture par CHEMIN que l'écran d'un lien, donc même
     * invisibilité pour le traceur. Aucune ne déclare `sprite.svg` : elles
     * n'affichent aucun glyphe, et l'ajouter ferait voyager 40 Ko dans l'image
     * pour six surfaces qui n'en lisent rien.
     *
     * LA DÉCLARATION EST PAR ROUTE, et c'est ce qui rend l'oubli si coûteux :
     * une page dont l'entrée manque n'échoue NI au build, NI aux témoins, NI au
     * lint — elle sert un document SANS STYLE, et seulement dans l'image. Les
     * six entrées sont donc composées à partir d'UNE liste, jamais recopiées.
     */
    ...Object.fromEntries(
      ['/', '/about', '/contact', '/partners', '/terms', '/privacy'].map((route) => [
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
  },
};

export default nextConfig;
