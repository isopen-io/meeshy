import { lisLActif, memo } from '@/lib/actifs';

/**
 * Les deux actifs que le repli de `/l/:token` porte DANS son document : la
 * table de jetons et l'unique glyphe de l'écran.
 *
 * POURQUOI EN LIGNE, ET PAS EN LIENS
 *
 * Le § 8.3 gate `/l/:token` à **une seule requête avant le premier pixel**. Une
 * feuille externe et un sprite externe en feraient trois. Le document est donc
 * autoporteur — ce qui, pour une page qu'un robot d'aperçu lit sans jamais
 * chercher de sous-ressource, est aussi le seul rendu fidèle.
 *
 * POURQUOI LUES SUR LE DISQUE, ET PAS RECOPIÉES ICI
 *
 * Parce qu'une valeur recopiée est une SECONDE TABLE (§ 3.2 corollaire 2), et
 * que `scripts/check-jetons.mjs` refuse — à juste titre — toute couleur, tout
 * rayon et toute police écrits dans `apps/web-v3`. Ce module ne porte donc
 * aucune valeur : il lit `@meeshy/design-tokens` et `@meeshy/icons`, les deux
 * paquets que le manifeste déclare déjà, au moment où le serveur sert. Le jour
 * où un jeton change, ce fichier n'a rien à apprendre.
 *
 * `next.config.ts` les nomme dans `outputFileTracingIncludes` : `standalone` ne
 * trace que ce qu'un `import` désigne, et une lecture par chemin n'en est pas
 * un — sans cette déclaration les trois feuilles manqueraient à l'image, et le
 * défaut ne se verrait qu'en production.
 *
 * La LECTURE elle-même vit dans `lib/actifs.ts` depuis que la coquille racine
 * inline le sous-sprite critique : deux surfaces, une seule convention de
 * chemin. Ce module garde ce qui lui est propre — quels actifs, et sous quelle
 * forme ils entrent dans le document.
 */

/**
 * Le compactage : commentaires retirés, espaces réduits, `@import` résolus par
 * la CONCATÉNATION plutôt que par une requête. L'ordre reproduit la cascade que
 * `tokens.css` déclare — un `@import` s'insère AVANT le reste du fichier qui le
 * porte —, sans quoi les jetons de base l'emporteraient sur les schémas.
 */
const compacte = (css: string): string =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import[^;]+;/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .trim();

export const tableDeJetons = memo((): string =>
  ['dark.css', 'light.css', 'tokens.css'].map((feuille) => compacte(lisLActif('design-tokens', feuille))).join(''),
);

/**
 * UN symbole du sprite, extrait tel quel — pas redessiné.
 *
 * Le § 8.5 sert le sprite en EXTERNE et le § 8.3 dit que la redirection ne rend
 * aucune icône, c'est-à-dire qu'elle ne paie pas cette requête-là. La planche,
 * elle, dessine un glyphe au centre de l'écran (`ph-arrows-clockwise`), et la
 * conformité porte sur la DISPOSITION. Les deux se tiennent en inlinant le seul
 * `<symbol>` concerné, pris dans le sprite commité : aucune requête de plus,
 * aucun second tracé, et le sprite reste la source.
 */
const SYMBOLE = (nom: string): RegExp =>
  new RegExp(`<symbol id="${nom}"[^>]*>([\\s\\S]*?)</symbol>`);

export const glypheDuSprite = (nom: string): string =>
  SYMBOLE(nom).exec(lisLActif('icons', 'sprite.svg'))?.[1] ?? '';

/**
 * LE GLYPHE TEL QU'UN DOCUMENT LE PORTE — le site unique de cette forme.
 *
 * Il vivait dans `app/(public)/l/[token]/document.ts`, où il n'avait qu'un
 * consommateur ; la vitrine en est le second (une tuile de marque, une pastille
 * de héros, neuf tuiles d'atouts). Le recopier aurait fabriqué deux façons
 * d'inliner un tracé, dont l'une aurait perdu `fill="currentColor"` le jour où
 * quelqu'un l'aurait raccourcie.
 *
 * `fill="currentColor"` est porté par le `<symbol>` du sprite, PAS par ses
 * tracés : l'extraire sans le reposer ici rend un glyphe NOIR sur fond sombre —
 * invisible. C'est le seul niveau qu'un clone de `<use>` emporte, et c'est
 * aussi celui qui manque quand on n'inline que l'intérieur.
 *
 * `aria-hidden` est la bonne annonce dans TOUS les emplois de la v3 : un glyphe
 * y ponctue un libellé déjà écrit à côté de lui (charte règle 23). Un
 * `role="img"` sans texte ferait lire « image » à un lecteur d'écran, ce qui est
 * pire que le silence.
 */
export const svgDuSprite = (nom: string): string =>
  `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${glypheDuSprite(nom)}</svg>`;
