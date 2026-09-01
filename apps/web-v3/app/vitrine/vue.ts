import { tableDeJetons } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { echappe, SOCLE_DU_DOCUMENT } from '@/app/socle';
import { themeScriptSource } from '@/app/theme-script';

import {
  APPEL,
  type Atout,
  ATOUTS,
  ATOUTS_ACCROCHE,
  ATOUTS_TITRE,
  HEROS,
  MISSION,
  PIED,
} from './contenu';
import { FEUILLE_DE_LA_VITRINE } from './feuille';

/**
 * LA VITRINE — la landing du legacy, dans la langue visuelle de la v3.
 *
 * Directive du porteur (2026-09-01) : réutiliser la page d'accueil existante et
 * n'en changer que le DESSIN. Le contenu vient donc de `./contenu`, repris mot
 * pour mot de `apps/web/locales/fr/landing.json` ; ce fichier ne décide que de
 * la forme.
 *
 * CE QUE « SE RAPPROCHER DU DESIGN V3 » VEUT DIRE ICI, concrètement : les
 * jetons servis plutôt que des couleurs écrites, une hiérarchie typographique
 * qui repose sur `--text-*` et non sur des tailles inventées, des cartes à
 * filet fin sur `--color-surface` comme les planches `chats` et `login`, et un
 * accent unique — `--color-primary` — qui ne sert qu'à ce qui est cliquable ou
 * à ce que la phrase met en avant.
 *
 * GESTIONNAIRE DE ROUTE, PAS PAGE — une page d'App Router émet SIX requêtes
 * (document, feuille de coquille, quatre chunks de runtime) même sans un seul
 * composant client. Une vitrine qui vante la fluidité ne peut pas être la
 * surface la plus lourde du site.
 *
 * AUCUN JAVASCRIPT APPLICATIF. Le seul `<script>` est celui du thème, posé
 * avant le premier pixel pour qu'aucun lecteur ne voie d'éclair blanc. Les
 * appels à l'action sont des `<a>` RÉELS : `/login` et `/signup` sont encore
 * au legacy (§ 4.9, entre les étapes 2 et 6), et une navigation de routeur ne
 * traverse pas une frontière de zone.
 */

const atout = ({ titre, corps }: Atout): string =>
  `<li><h3>${echappe(titre)}</h3><p>${echappe(corps)}</p></li>`;

const lienDePied = ({ libelle, href }: { readonly libelle: string; readonly href: string }): string =>
  `<a href="${echappe(href)}">${echappe(libelle)}</a>`;

const TITRE_DU_DOCUMENT = `Meeshy — ${HEROS.titre.trim()} ${HEROS.titreAccentue}`;

export const documentDeLaVitrine = (): string =>
  '<!doctype html>' +
  `<html lang="${DOCUMENT_LANGUAGE}">` +
  '<head>' +
  '<meta charset="utf-8"/>' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
  '<link rel="icon" href="data:,"/>' +
  `<script>${themeScriptSource}</script>` +
  `<title>${echappe(TITRE_DU_DOCUMENT)}</title>` +
  `<meta name="description" content="${echappe(HEROS.accroche)}"/>` +
  '<meta name="robots" content="index, follow"/>' +
  '<meta property="og:type" content="website"/>' +
  '<meta property="og:site_name" content="Meeshy"/>' +
  `<meta property="og:title" content="${echappe(TITRE_DU_DOCUMENT)}"/>` +
  `<meta property="og:description" content="${echappe(HEROS.accroche)}"/>` +
  '<meta name="twitter:card" content="summary"/>' +
  `<style>${tableDeJetons()}${SOCLE_DU_DOCUMENT}${FEUILLE_DE_LA_VITRINE}</style>` +
  '</head>' +
  '<body>' +
  '<div class="enveloppe">' +
  '<header class="marque"><span class="jeton" aria-hidden="true"></span>Meeshy</header>' +
  '<main id="main-content">' +

  '<section class="heros">' +
  `<p class="badge">${echappe(HEROS.badge)}</p>` +
  `<h1>${echappe(HEROS.titre)}<em>${echappe(HEROS.titreAccentue)}</em></h1>` +
  `<p class="accroche">${echappe(HEROS.accroche)}</p>` +
  '<nav class="actions">' +
  `<a class="cta principal" href="/signup">${echappe(HEROS.creer)}</a>` +
  `<a class="cta secondaire" href="/login">${echappe(HEROS.connexion)}</a>` +
  '</nav>' +
  '</section>' +

  '<section class="atouts" aria-labelledby="titre-atouts">' +
  `<h2 id="titre-atouts">${echappe(ATOUTS_TITRE)}</h2>` +
  `<p class="sous">${echappe(ATOUTS_ACCROCHE)}</p>` +
  `<ul>${ATOUTS.map(atout).join('')}</ul>` +
  '</section>' +

  '<section class="mission" aria-labelledby="titre-mission">' +
  `<h2 id="titre-mission">${echappe(MISSION.titre)}</h2>` +
  `<p>${echappe(MISSION.corps)}</p>` +
  `<p class="devise">${echappe(MISSION.devise)}</p>` +
  '</section>' +

  '<section class="appel" aria-labelledby="titre-appel">' +
  `<h2 id="titre-appel">${echappe(APPEL.titre)}</h2>` +
  `<p>${echappe(APPEL.accroche)}</p>` +
  `<a class="cta principal" href="/signup">${echappe(APPEL.action)}</a>` +
  '</section>' +

  '</main>' +
  '<footer class="pied">' +
  `<p class="devise">${echappe(PIED.devise)}</p>` +
  `<nav>${PIED.liens.map(lienDePied).join('')}</nav>` +
  `<p class="droits">${echappe(PIED.droits)}</p>` +
  '</footer>' +
  '</div>' +
  '</body>' +
  '</html>';
