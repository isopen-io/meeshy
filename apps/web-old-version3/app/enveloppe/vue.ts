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
   * LA RÉGION DE LA BANNIÈRE (#4454) — servie VIDE, hors de `.enveloppe`.
   *
   * Elle est HORS de l'enveloppe pour une raison mécanique : une surimpression
   * ouverte rend `.enveloppe` `inert`, et une bannière posée dedans aurait une
   * croix que personne ne peut toucher — un contrôle sans effet, ce que la
   * charte règle 7 interdit.
   *
   * Un écran qui n'expédie AUCUN module ne la sert pas : personne n'y peindrait
   * jamais rien, et une région vide servie pour rien est du poids sans usage.
   */
  readonly banniere?: string;
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
  /**
   * L'APERÇU SOCIAL — `og:*` et `twitter:card`. VRAI par défaut : une adresse
   * qu'on PARTAGE doit se déplier dans la messagerie où on la colle, et c'est
   * le cas des pages du site comme des deux INVITATIONS de la zone (un
   * visiteur sans session — donc un robot d'aperçu — reçoit l'invitation,
   * jamais le contenu).
   *
   * FAUX sur un REFUS, et là seulement (`documentIndisponible`, issue #4967) :
   * une carte sociale y aurait porté le titre et la description du refus, un
   * SECOND CANAL pour ce que le § 5.1 ferme déjà à l'écran — et, sur un
   * document qui doit rester indistinguable d'un contenu inexistant, un
   * aperçu qui se déplie est en soi une réponse.
   */
  readonly ogEtTwitter?: boolean;
};

export type ParametresDeTete = {
  readonly titre: string;
  readonly description: string;
  readonly feuille: string;
  /** `index, follow` pour le site ; `noindex, nofollow` pour ce qui appartient à un lecteur. */
  readonly robots?: string;
  /** Voir `ParametresDuDocument.ogEtTwitter` — VRAI par défaut. */
  readonly ogEtTwitter?: boolean;
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
export const teteDuDocument = ({
  titre,
  description,
  feuille,
  robots = 'index, follow',
  ogEtTwitter = true,
}: ParametresDeTete): string =>
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
  (ogEtTwitter
    ? '<meta property="og:type" content="website"/>' +
      `<meta property="og:site_name" content="${echappe(MARQUE)}"/>` +
      `<meta property="og:title" content="${echappe(titre)}"/>` +
      `<meta property="og:description" content="${echappe(description)}"/>` +
      '<meta name="twitter:card" content="summary"/>'
    : '') +
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
  ogEtTwitter,
  banniere = '',
}: ParametresDuDocument): string =>
  '<!doctype html>' +
  `<html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}">` +
  teteDuDocument({ titre, description, feuille, robots, ogEtTwitter }) +
  '<body>' +
  banniere +
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
 *
 * `glyphe`, ABSENT par défaut, dessine `.bonjour` en `.carte-vide` — le
 * contour pointillé et le glyphe de 40 px de la charte (règle 16), la MÊME
 * classe que `carteVide()` (`app/connecte/vue.ts`) pose pour une carte au
 * milieu d'une liste. Présent, c'est qu'il n'y a PAS de contenu à cette
 * adresse — l'indisponible d'une story (§ 5.1, issue #4967), pas une panne ni
 * une invitation, qui restent le bloc `.bonjour` nu : une panne est un ÉTAT
 * TEMPORAIRE de la passerelle, pas une absence de contenu.
 *
 * `ogEtTwitter` est RELAYÉ, jamais décidé ici — et c'est un correctif (revue
 * de #4967). Le poser à `false` pour toute la famille aurait retiré l'aperçu
 * social des DEUX INVITATIONS de la zone (`documentDeLInvitation` d'une story,
 * d'un réel ou d'une humeur ; `documentDInvitation` de `/post/:id`), qui sont
 * précisément ce qu'un robot d'aperçu SANS session reçoit quand on partage un
 * de ces liens dans une messagerie : leur carte est le seul aperçu que ces
 * adresses produisent, et elle ne porte aucune donnée du contenu (la v3 n'a
 * rien demandé à la passerelle). Seul le REFUS la retire — voir
 * `documentIndisponible` (`app/(public)/partage-vue.ts`).
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
  glyphe,
  ogEtTwitter,
}: {
  readonly titre: string;
  readonly paragraphes: readonly string[];
  readonly actions?: readonly ActionDuMessage[];
  readonly feuille: string;
  readonly robots?: string;
  readonly retour?: boolean;
  /** Par défaut le PREMIER paragraphe : la description d'une page qui dit une chose est ce qu'elle dit. */
  readonly description?: string;
  /** Voir le doc-comment ci-dessus — dessine le bloc en état vide de la charte. */
  readonly glyphe?: string;
  /** Voir le doc-comment ci-dessus — VRAI par défaut ; seul un REFUS le pose à faux. */
  readonly ogEtTwitter?: boolean;
}): string => {
  const classe = glyphe === undefined ? 'bonjour' : 'carte-vide';
  return documentDuSite({
    titre: `${titre} — ${MARQUE}`,
    description: description ?? paragraphes[0] ?? titre,
    feuille,
    robots,
    retour,
    ogEtTwitter,
    corps:
      `<div class="${classe}">` +
      (glyphe === undefined ? '' : svgDuSprite(glyphe)) +
      `<h1>${echappe(titre)}</h1>` +
      paragraphes.map((texte) => `<p>${echappe(texte)}</p>`).join('') +
      '</div>' +
      (actions.length === 0
        ? ''
        : `<section class="acces" aria-label="${echappe(actions[0]?.libelle ?? '')}"><nav>` +
          actions
            .map(
              ({ libelle, href, ton = 'primaire', glyphe: glypheAction }) =>
                `<a class="action ${ton}" href="${echappe(href)}">` +
                (glypheAction === undefined ? '' : svgDuSprite(glypheAction)) +
                `${echappe(libelle)}</a>`,
            )
            .join('') +
          '</nav></section>'),
  });
};

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
