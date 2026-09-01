import { tableDeJetons } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { echappe, SOCLE_DU_DOCUMENT } from '@/app/socle';
import { themeScriptSource } from '@/app/theme-script';

import { FEUILLE_DE_LA_VITRINE } from './feuille';

/**
 * LA VITRINE — ce que `staging.meeshy.me/` sert, et ce qu'elle promet.
 *
 * Décision du porteur (#4476, tranchée le 2026-09-01) : la vitrine **ANNONCE**
 * le Prisme Linguistique, elle ne le DÉMONTRE pas. La différence n'est pas de
 * degré : démontrer suppose un contenu réel, donc un appel à la passerelle, un
 * cache, une langue de lecteur à résoudre — et une page publique qui attend le
 * réseau pour peindre son premier pixel contredirait ce qu'elle vient vanter.
 * L'illustration ci-dessous est donc FIGÉE et le dit.
 *
 * POURQUOI UN GESTIONNAIRE DE ROUTE, ET PAS UNE PAGE
 *
 * Même raison que l'écran d'un lien clos, mesurée dans le même lot : une page
 * d'App Router émet SIX requêtes — le document, la feuille de la coquille et
 * les quatre chunks que Next pose dans le `<head>` de toute page rendue — même
 * sans un seul composant client. Un gestionnaire de route rend un
 * `Response(html)` et n'en porte aucun. Une vitrine qui vante la légèreté ne
 * peut pas être la surface la plus lourde du site.
 *
 * CE QU'ELLE NE FAIT PAS
 *
 * Aucun JavaScript applicatif, aucune police distante, aucune image : le seul
 * `<script>` du document est celui du thème, posé avant le premier pixel pour
 * qu'aucun lecteur ne voie un éclair blanc. Les deux appels à l'action pointent
 * `/login` et `/signup`, que le legacy sert encore — c'est le franchissement de
 * zone assumé du § 4.9 entre les étapes 2 et 6, et c'est pourquoi ce sont des
 * `<a>` réels et non des liens de routeur.
 */

type Pilier = {
  readonly titre: string;
  readonly corps: string;
};

/** Les quatre principes du § « Prisme Linguistique » du `CLAUDE.md` racine —
 *  recopiés dans leur ORDRE, parce que c'est un ordre de lecture et non une
 *  liste : la transparence est la promesse, l'automatisme est ce qui la tient. */
const PILIERS: readonly Pilier[] = [
  {
    titre: 'Transparence',
    corps:
      'Un message traduit s’affiche comme un message natif. Pas de fenêtre, pas de bandeau, pas de bouton à trouver.',
  },
  {
    titre: 'Discrétion',
    corps:
      'Un indicateur sobre signale qu’une traduction est active. Il informe sans distraire, et ne demande rien.',
  },
  {
    titre: 'Exploration',
    corps:
      'L’original reste à un geste. On peut voir ce qui a été écrit, et dans quelle langue, à tout moment.',
  },
  {
    titre: 'Automatisme',
    corps:
      'La langue se résout seule : langue principale, puis secondaire, puis celle de l’appareil. Rien à régler.',
  },
];

type Tour = {
  readonly texte: string;
  readonly langue: string;
  readonly servie: boolean;
};

/** L'illustration. Le MÊME message, écrit une fois et lu deux fois — c'est la
 *  phrase entière du Prisme, et elle tient en trois lignes. */
const TOURS: readonly Tour[] = [
  { texte: 'On se cale à 15 h pour la revue ?', langue: 'Écrit en français', servie: false },
  { texte: 'Shall we meet at 3 p.m. for the review?', langue: 'Lu en anglais', servie: true },
  { texte: '¿Nos vemos a las 15 h para la revisión?', langue: 'Leído en español', servie: true },
];

const tour = ({ texte, langue, servie }: Tour): string =>
  `<li${servie ? ' class="servie"' : ''}>` +
  `<p class="dit">${echappe(texte)}</p>` +
  `<p class="langue">${echappe(langue)}</p>` +
  '</li>';

const pilier = ({ titre, corps }: Pilier): string =>
  `<li><h2>${echappe(titre)}</h2><p>${echappe(corps)}</p></li>`;

const TITRE = 'Meeshy — chacun lit dans sa langue';
const DESCRIPTION =
  'Une messagerie où la langue cesse d’être une frontière : chacun écrit dans la sienne et lit dans la sienne, sans rien régler.';

export const documentDeLaVitrine = (): string =>
  '<!doctype html>' +
  `<html lang="${DOCUMENT_LANGUAGE}">` +
  '<head>' +
  '<meta charset="utf-8"/>' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
  '<link rel="icon" href="data:,"/>' +
  `<script>${themeScriptSource}</script>` +
  `<title>${echappe(TITRE)}</title>` +
  `<meta name="description" content="${echappe(DESCRIPTION)}"/>` +
  '<meta name="robots" content="index, follow"/>' +
  '<meta property="og:type" content="website"/>' +
  '<meta property="og:site_name" content="Meeshy"/>' +
  `<meta property="og:title" content="${echappe(TITRE)}"/>` +
  `<meta property="og:description" content="${echappe(DESCRIPTION)}"/>` +
  '<meta name="twitter:card" content="summary"/>' +
  `<style>${tableDeJetons()}${SOCLE_DU_DOCUMENT}${FEUILLE_DE_LA_VITRINE}</style>` +
  '</head>' +
  '<body>' +
  '<div class="enveloppe">' +
  '<header class="marque"><span class="jeton" aria-hidden="true"></span>Meeshy</header>' +
  '<main id="main-content">' +
  '<section class="heros">' +
  '<h1>Chacun écrit dans sa langue.<br/><em>Chacun lit dans la sienne.</em></h1>' +
  `<p class="accroche">${echappe(DESCRIPTION)}</p>` +
  '<nav class="actions">' +
  '<a class="cta principal" href="/signup">Créer un compte</a>' +
  '<a class="cta secondaire" href="/login">Se connecter</a>' +
  '</nav>' +
  '</section>' +
  '<section class="demonstration" aria-labelledby="intitule-demo">' +
  '<p class="intitule" id="intitule-demo">Un message, trois lecteurs</p>' +
  `<ul>${TOURS.map(tour).join('')}</ul>` +
  '<p class="note">Personne n’a rien réglé. Le message est parti une fois ; chacun l’a reçu dans la langue qu’il avait déjà choisie.</p>' +
  '</section>' +
  `<ul class="piliers">${PILIERS.map(pilier).join('')}</ul>` +
  '</main>' +
  '<footer class="pied">' +
  '<span>© Meeshy</span>' +
  '<span><a href="/login">Se connecter</a> · <a href="/signup">Créer un compte</a></span>' +
  '</footer>' +
  '</div>' +
  '</body>' +
  '</html>';
