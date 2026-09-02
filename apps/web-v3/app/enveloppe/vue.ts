import { svgDuSprite, tableDeJetons } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { echappe, SOCLE_DU_DOCUMENT } from '@/app/socle';
import { THEME_PAR_DEFAUT, themeScriptSource } from '@/app/theme-script';

import {
  GLYPHE_DE_LA_MARQUE,
  MARQUE,
  PIED,
  REPERE_DU_PIED,
  RETOUR,
  type Lien,
} from './contenu';
import { FEUILLE_DU_CHROME } from './feuille';

/**
 * LE DOCUMENT DE TOUT ÉCRAN PUBLIC DE LA V3 — un seul squelette, pour la
 * vitrine comme pour les cinq pages institutionnelles.
 *
 * GESTIONNAIRE DE ROUTE, PAS PAGE. Une page d'App Router émet SIX requêtes
 * avant le premier pixel — le document, la feuille de la coquille et les QUATRE
 * chunks du runtime que Next pose dans le `<head>` de toute page rendue — même
 * sans un seul composant client (`budgets.json`, question ouverte
 * « plancher-next-au-dessus-du-gate-de-requetes »). Un gestionnaire compose sa
 * réponse à la main : son `<head>` ne porte aucun chunk de framework, donc UNE
 * requête. Des pages qui vantent la légèreté ne peuvent pas être les surfaces
 * les plus lourdes du site.
 *
 * LA CLASSE DE THÈME EST RENDUE PAR LE SERVEUR, comme dans la coquille racine
 * (`app/layout.tsx`) et dans le document de `/l/:token`. Le script inline ne
 * fait que la CORRIGER. La vitrine était le seul document composé à la main qui
 * l'omettait : sans JavaScript, son `<html>` arrivait nu là où les deux autres
 * sites de cette même décision le posaient — une divergence sans conséquence
 * visible aujourd'hui (les jetons sombres sont portés par `:root` nu), et
 * garantie le jour où une règle s'écrira contre `.dark` ou `.light`.
 *
 * AUCUN JAVASCRIPT APPLICATIF. Le seul `<script>` est celui du thème, posé
 * avant le premier pixel pour qu'aucun lecteur ne voie d'éclair blanc.
 */

export const lienDeChrome = ({ libelle, href }: Lien): string =>
  `<a href="${echappe(href)}">${echappe(libelle)}</a>`;

/**
 * L'en-tête. `retour` est un BOOLÉEN et non un lien : la destination du retour
 * est l'accueil, toujours, et l'offrir en paramètre inviterait le prochain
 * écran à renvoyer ailleurs sous le même mot. La vitrine EST l'accueil — elle
 * le pose à `false`, et n'affiche donc que la marque.
 */
const enTete = (retour: boolean): string =>
  '<header class="marque">' +
  `<a href="/"><span class="tuile" aria-hidden="true">${svgDuSprite(GLYPHE_DE_LA_MARQUE)}</span>${echappe(MARQUE)}</a>` +
  (retour ? `<a class="retour" href="/">${echappe(RETOUR)}</a>` : '') +
  '</header>';

const pied = (): string =>
  '<footer class="pied">' +
  `<p class="devise">${echappe(PIED.devise)}</p>` +
  `<nav aria-label="${echappe(REPERE_DU_PIED)}">${PIED.liens.map(lienDeChrome).join('')}</nav>` +
  `<p class="droits">${echappe(PIED.droits)}</p>` +
  '</footer>';

export type ParametresDuDocument = {
  readonly titre: string;
  readonly description: string;
  /** La feuille PROPRE à l'écran, ajoutée après le socle et le chrome. */
  readonly feuille: string;
  readonly corps: string;
  readonly retour: boolean;
};

export type ParametresDeTete = {
  readonly titre: string;
  readonly description: string;
  readonly feuille: string;
  /** `index, follow` pour le site ; `noindex, nofollow` pour ce qui appartient à un lecteur. */
  readonly robots?: string;
};

/**
 * LA TÊTE DE TOUT DOCUMENT COMPOSÉ À LA MAIN — le site unique de sa forme.
 *
 * Le fil (`app/connecte/fil-vue.ts`) n'a ni marque ni pied : il est un écran
 * plein, avec son en-tête collant et son composeur. Il partage pourtant avec
 * les pages du site tout ce qui vit dans `<head>` — la vue, l'icône vide, le
 * script du thème, la table de jetons et le socle. Le recopier là-bas aurait
 * fait deux têtes qui dérivent au premier `<meta>` ajouté.
 */
export const teteDuDocument = ({ titre, description, feuille, robots = 'index, follow' }: ParametresDeTete): string =>
  '<head>' +
  '<meta charset="utf-8"/>' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
  // Le navigateur demande `/favicon.ico` de lui-même : une SECONDE requête,
  // servie par le LEGACY derrière Traefik puisque la zone ne sert aucun actif à
  // la racine (§ 4.4). Une icône vide déclarée la retire.
  '<link rel="icon" href="data:,"/>' +
  `<script>${themeScriptSource}</script>` +
  `<title>${echappe(titre)}</title>` +
  `<meta name="description" content="${echappe(description)}"/>` +
  `<meta name="robots" content="${echappe(robots)}"/>` +
  '<meta property="og:type" content="website"/>' +
  `<meta property="og:site_name" content="${echappe(MARQUE)}"/>` +
  `<meta property="og:title" content="${echappe(titre)}"/>` +
  `<meta property="og:description" content="${echappe(description)}"/>` +
  '<meta name="twitter:card" content="summary"/>' +
  `<style>${tableDeJetons()}${SOCLE_DU_DOCUMENT}${FEUILLE_DU_CHROME}${feuille}</style>` +
  '</head>';

export const documentDuSite = ({
  titre,
  description,
  feuille,
  corps,
  retour,
}: ParametresDuDocument): string =>
  '<!doctype html>' +
  `<html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}">` +
  teteDuDocument({ titre, description, feuille }) +
  '<body>' +
  '<div class="enveloppe">' +
  enTete(retour) +
  `<main id="main-content">${corps}</main>` +
  pied() +
  '</div>' +
  '</body>' +
  '</html>';

/**
 * LA RÉPONSE, et sa politique de cache.
 *
 * Elle ne partage PAS `rendDocument` avec les écrans de lien, et c'est une
 * différence de CONTRAT, pas un oubli : celui-là pose `cache-control:
 * no-store`, juste pour une réponse composée autour d'un jeton dont l'état
 * change sans prévenir. Ces documents-ci ne dépendent d'aucun lecteur et ne
 * portent aucune donnée ; `no-store` leur ferait payer un aller-retour complet
 * à chaque visite — sur les surfaces mêmes qui vantent la légèreté.
 *
 * ELLE NE SERT PLUS `/`, et c'est le point : depuis que la racine choisit entre
 * la vitrine et une redirection selon le cookie de session, sa réponse dépend
 * d'un lecteur et pose sa propre politique (`app/route.ts`). Les cinq pages
 * institutionnelles, elles, n'ont jamais dépendu de personne.
 */
export const rendLePage = (html: string): Response =>
  new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
