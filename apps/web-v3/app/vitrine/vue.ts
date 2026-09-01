import { echappe } from '@/app/socle';

import { documentDuSite } from '@/app/enveloppe/vue';

import {
  APPEL,
  type Atout,
  ATOUTS,
  ATOUTS_ACCROCHE,
  ATOUTS_TITRE,
  HEROS,
  MISSION,
} from './contenu';
import { FEUILLE_DE_LA_VITRINE } from './feuille';

/**
 * LA VITRINE — la landing du legacy, dans la langue visuelle de la v3.
 *
 * Directive du porteur (2026-09-01) : réutiliser la page d'accueil existante et
 * n'en changer que le DESSIN. Le contenu vient donc de `./contenu`, repris mot
 * pour mot de `apps/web/locales/fr/landing.json` ; ce fichier ne décide que de
 * la forme du CORPS.
 *
 * Le document, le chrome et la politique de cache sont dans
 * `app/enveloppe/vue.ts`, partagés avec les cinq pages institutionnelles :
 * `<html>`, `<head>`, l'en-tête de marque et le pied s'écrivent une fois. C'est
 * ce qui rend la dimension 6 STRUCTURELLE — un écran ne peut plus se donner un
 * autre pied, parce qu'il ne le compose plus.
 *
 * `retour: false` — cette page EST l'accueil. Un « Retour à l'accueil » y
 * renverrait sur elle-même.
 *
 * AUCUN JAVASCRIPT APPLICATIF, et les appels à l'action sont des `<a>` RÉELS :
 * `/login` et `/signup` sont encore au legacy (§ 4.9, entre les étapes 2 et 6),
 * et une navigation de routeur ne traverse pas une frontière de zone.
 */

const atout = ({ titre, corps }: Atout): string =>
  `<li><h3>${echappe(titre)}</h3><p>${echappe(corps)}</p></li>`;

const TITRE_DU_DOCUMENT = `Meeshy — ${HEROS.titre.trim()} ${HEROS.titreAccentue}`;

const corpsDeLaVitrine = (): string =>
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
  '</section>';

export const documentDeLaVitrine = (): string =>
  documentDuSite({
    titre: TITRE_DU_DOCUMENT,
    description: HEROS.accroche,
    feuille: FEUILLE_DE_LA_VITRINE,
    corps: corpsDeLaVitrine(),
    retour: false,
  });
