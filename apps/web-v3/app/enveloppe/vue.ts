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
  /**
   * CE QUE LE `<main>` PORTE EN PLUS DE SON IDENTIFIANT — les attributs de
   * PARTICIPATION d'une surface temps réel (§ 12.4), et rien d'autre. Ils sont
   * passés par le document plutôt qu'écrits dans le corps parce que le module
   * les cherche sur `main[data-module]` : un second `<main>` imbriqué pour les
   * porter ferait deux repères de page là où la règle 5 n'en veut qu'un.
   */
  readonly attributsDuMain?: string;
  /**
   * Le chargeur du module de participation, posé APRÈS le corps — le seul
   * `<script>` d'un écran connecté hors moteur de thème, et il n'arrive qu'après
   * le premier pixel (`app/connecte/chargeur.ts`).
   */
  readonly script?: string;
  /**
   * `index, follow` par défaut — les pages du SITE s'indexent. Un écran qui vit
   * à l'adresse d'un CONTENU (l'invitation et l'indisponible de `/stories/:id`)
   * pose `noindex, nofollow` : le § 5.4 le demande pour toute la famille des
   * stories, et l'écrire ici plutôt que dans un second squelette garde une
   * seule tête de document.
   */
  readonly robots?: string;
  /**
   * UNE SURIMPRESSION — le profil d'un participant (`?profil=`, § 12.10.3),
   * rendue HORS de `<div class="enveloppe">` : une surimpression n'est pas un
   * morceau du contenu qu'elle recouvre, exactement comme pour le fil
   * (`app/connecte/fil-vue.ts` › `documentDuFil`). L'enveloppe entière devient
   * `inert` derrière elle — c'est TOUT ce que ce document porte à recouvrir,
   * là où le fil n'a que son `<main>`.
   */
  readonly surimpression?: string;
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
  robots,
  attributsDuMain = '',
  script = '',
  surimpression = '',
}: ParametresDuDocument): string =>
  '<!doctype html>' +
  `<html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}">` +
  teteDuDocument({ titre, description, feuille, robots }) +
  '<body>' +
  // LA SURIMPRESSION AVANT L'ENVELOPPE, INERTE DERRIÈRE ELLE — l'ordre et
  // l'accès que `documentDuFil` applique à son `<main>` (même raison : CLS,
  // Échap sans JavaScript, un lecteur d'écran qui n'annonce plus ce qu'il ne
  // montre pas).
  surimpression +
  `<div class="enveloppe"${surimpression === '' ? '' : ' inert'}>` +
  enTete(retour) +
  `<main id="main-content"${attributsDuMain}>${corps}</main>` +
  pied() +
  '</div>' +
  script +
  '</body>' +
  '</html>';

/**
 * UNE PAGE QUI DIT UNE CHOSE — un titre, ce qu'il faut savoir, et ce qu'on
 * peut faire.
 *
 * CINQ écrans la composaient à la main, au caractère près : la panne
 * (`connecte/vue.ts`), l'invitation et l'indisponible de la story, ceux des
 * commentaires, et le refus d'origine (`provenance.ts`). En ajouter deux —
 * les réels et les humeurs — en aurait fait sept, et une divergence sur la
 * SEPTIÈME copie ne se serait vue nulle part.
 *
 * Ce n'est pas un gabarit générique : c'est la forme que la charte donne à un
 * écran sans contenu (règle 18 — l'état vide est DESSINÉ). Le titre est un
 * `<h1>` parce que chaque document en veut exactement un ; les actions vivent
 * dans une `<section class="acces">` NOMMÉE par la première d'entre elles,
 * pour qu'un lecteur d'écran sache ce que ce groupe de liens propose.
 *
 * `actions` VIDE ne rend pas la section — un `<nav>` sans lien serait un
 * repère d'orientation qui ne mène nulle part.
 */
export type ActionDuMessage = {
  readonly libelle: string;
  readonly href: string;
  /** `primaire` par défaut : c'est le geste que l'écran propose. */
  readonly ton?: 'primaire' | 'contour';
  readonly glyphe?: string;
};

export const documentDeMessage = ({
  titre,
  paragraphes,
  actions = [],
  feuille,
  robots = 'noindex, nofollow',
  retour = true,
  description,
}: {
  readonly titre: string;
  readonly paragraphes: readonly string[];
  readonly actions?: readonly ActionDuMessage[];
  readonly feuille: string;
  readonly robots?: string;
  readonly retour?: boolean;
  /** Par défaut le PREMIER paragraphe : la description d'une page qui dit une chose est ce qu'elle dit. */
  readonly description?: string;
}): string =>
  documentDuSite({
    titre: `${titre} — ${MARQUE}`,
    description: description ?? paragraphes[0] ?? titre,
    feuille,
    robots,
    retour,
    corps:
      '<div class="bonjour">' +
      `<h1>${echappe(titre)}</h1>` +
      paragraphes.map((texte) => `<p>${echappe(texte)}</p>`).join('') +
      '</div>' +
      (actions.length === 0
        ? ''
        : `<section class="acces" aria-label="${echappe(actions[0]?.libelle ?? '')}"><nav>` +
          actions
            .map(
              ({ libelle, href, ton = 'primaire', glyphe }) =>
                `<a class="action ${ton}" href="${echappe(href)}">` +
                (glyphe === undefined ? '' : svgDuSprite(glyphe)) +
                `${echappe(libelle)}</a>`,
            )
            .join('') +
          '</nav></section>'),
  });

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
