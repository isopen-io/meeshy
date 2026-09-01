import { tableDeJetons } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { echappe, SOCLE_DU_DOCUMENT } from '@/app/socle';
import { THEME_PAR_DEFAUT, themeScriptSource } from '@/app/theme-script';

import { MARQUE, PIED, RETOUR, type Lien } from './contenu';
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
  `<a href="/"><span class="jeton" aria-hidden="true"></span>${echappe(MARQUE)}</a>` +
  (retour ? `<a class="retour" href="/">${echappe(RETOUR)}</a>` : '') +
  '</header>';

const pied = (): string =>
  '<footer class="pied">' +
  `<p class="devise">${echappe(PIED.devise)}</p>` +
  `<nav aria-label="${echappe(MARQUE)}">${PIED.liens.map(lienDeChrome).join('')}</nav>` +
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

export const documentDuSite = ({
  titre,
  description,
  feuille,
  corps,
  retour,
}: ParametresDuDocument): string =>
  '<!doctype html>' +
  `<html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}">` +
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
  '<meta name="robots" content="index, follow"/>' +
  '<meta property="og:type" content="website"/>' +
  `<meta property="og:site_name" content="${echappe(MARQUE)}"/>` +
  `<meta property="og:title" content="${echappe(titre)}"/>` +
  `<meta property="og:description" content="${echappe(description)}"/>` +
  '<meta name="twitter:card" content="summary"/>' +
  `<style>${tableDeJetons()}${SOCLE_DU_DOCUMENT}${FEUILLE_DU_CHROME}${feuille}</style>` +
  '</head>' +
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
 */
export const rendLePage = (html: string): Response =>
  new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
