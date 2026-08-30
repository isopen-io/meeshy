import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { THEME_PAR_DEFAUT, themeScriptSource } from '@/app/theme-script';

import { glypheDuSprite, tableDeJetons } from './actifs-inlines';
import { FEUILLE_DE_L_ECRAN, SOCLE_DU_DOCUMENT } from './feuille';

/**
 * Le document que les DEUX écrans de `/l/:token` rendent — l'ouverture du lien
 * et le lien clos —, et le SEUL HTML de cette route.
 *
 * Qui le reçoit, et pourquoi lui : un robot d'aperçu (WhatsApp, Facebook,
 * Slack, iMessage) et personne d'autre en marche nominale sur `/l/:token` — un
 * humain y reçoit la 302 —, et TOUT LE MONDE sur `/l/:token/expired`, qui est
 * une destination et non un passage. Il reste dessiné (planche `linkRedirect`)
 * et non réduit à quatre balises `<meta>` : la dimension 8 demande des états
 * peints, pas des pages nues.
 *
 * POURQUOI IL EST ÉCRIT À LA MAIN, ET PAS RENDU PAR REACT
 *
 * Mesuré : `next build` REFUSE tout module de `app/` qui importe
 * `react-dom/server` (« You're importing a component that imports
 * react-dom/server »). Un gestionnaire de route n'a par ailleurs ni layout ni
 * `<html>` fourni : il n'y a pas d'arbre React à rendre, seulement un document
 * à composer. La contrepartie — l'échappement — est explicite (`echappe`) et
 * tenue par un test qui pousse du balisage dans chacune des entrées que le
 * réseau alimente.
 *
 * ET C'EST AUSSI CE QUI TIENT LE GATE DE REQUÊTES DES DEUX ÉCRANS
 *
 * Un gestionnaire de route compose sa réponse à la main (`new Response(html)`)
 * sans traverser le pipeline de rendu de Next : aucun chunk du runtime d'App
 * Router n'entre dans son `<head>`. Une PAGE, même sans un seul composant
 * client, en pose QUATRE (webpack, le chunk React, le chunk partagé, main-app)
 * plus la feuille de la coquille — six requêtes avant le premier pixel là où le
 * § 8.3 en gate deux. L'écran clos a d'abord été écrit en page et déclarait ce
 * franchissement comme une question d'architecture ; c'en était une pour la
 * lecture partagée (`/stories/:id` …, qui doit être une page), jamais pour lui :
 * le contournement était écrit un fichier plus haut, dans son jumeau.
 *
 * Trois propriétés y sont tenues, chacune mesurée par un test :
 *
 *   • **Un seul `<script>`** — le moteur de thème, importé de son site unique
 *     (`app/theme-script.tsx`), jamais recopié. Le § 8.3 le nomme comme la
 *     seule exception au « 0 Ko de JS » de cette route.
 *   • **Aucune sous-ressource** — ni feuille, ni sprite, ni image : le § 8.3
 *     gate `/l/:token` à UNE requête avant le premier pixel, et son écran clos
 *     à deux. Jetons et glyphes sont inlinés depuis leurs paquets par
 *     `actifs-inlines.ts`.
 *   • **Rien du réseau n'entre en balisage** — titre, description, jeton et
 *     valeurs d'en-tête passent tous par `echappe`.
 *
 * La classe de thème est rendue par le SERVEUR (`THEME_PAR_DEFAUT`), comme dans
 * la coquille racine : ce document ne passe pas par `app/layout.tsx` — un
 * gestionnaire de route n'a pas de layout — donc il refait, à l'identique et
 * depuis les mêmes sources, ce que la coquille aurait fait.
 *
 * ET `<html lang>` VIENT DE LA MÊME SOURCE, POUR LA MÊME RAISON
 *
 * `lang` déclare la langue de ce qui est ÉCRIT, jamais celle qu'on souhaite au
 * lecteur. Toute la copie de ces documents est française et constante, donc
 * l'attribut vaut `DOCUMENT_LANGUAGE` — le SITE UNIQUE, celui que la coquille
 * racine pose aussi.
 *
 * Y poser l'étiquette de l'`Accept-Language` du visiteur, comme ce document l'a
 * d'abord fait, servait `<html lang="en-US">` au-dessus d'un texte français :
 * un lecteur d'écran prononce alors le français avec la phonétique anglaise
 * (WCAG 3.1.1 « Language of Page », niveau A). Une surface qui AFFIRME une
 * langue qu'elle ne sert pas est pire qu'une surface qui n'en affirme aucune.
 * La langue DEMANDÉE reste servie — dans la ligne « Langue détectée » du `<dl>`,
 * où elle est une DONNÉE et non une déclaration.
 *
 * Le jour où la copie devient multilingue, les deux basculent ENSEMBLE, depuis
 * `app/document-language.ts` : jamais l'attribut avant la copie.
 */

export type LigneDuDocument = {
  readonly cle: string;
  readonly valeur: string;
};

export type ActionDuDocument = {
  readonly libelle: string;
  readonly href: string;
};

/**
 * Ce que le `<head>` annonce. `carte` porte les OG et les `twitter:` — elle
 * n'existe que sur le document qu'un robot d'aperçu COMPOSE ; l'écran d'un lien
 * mort n'a aucune carte à offrir, et lui en donner une ferait circuler l'aperçu
 * d'un contenu qui n'est plus là.
 */
export type MetaDuDocument = {
  readonly titre: string;
  readonly description: string;
  readonly robots: string;
  readonly carte: { readonly url: string | null } | null;
};

export type ParametresDuDocument = {
  readonly meta: MetaDuDocument;
  /** Le chrome : ce qui s'est passé, en deux mots, et la nature de l'écran. */
  readonly entete: { readonly titre: string; readonly sous: string };
  readonly pastille: { readonly glyphe: string; readonly ton: 'primaire' | 'alerte' };
  readonly titre: string;
  readonly corps: string;
  readonly lignes: readonly LigneDuDocument[];
  readonly principal: ActionDuDocument;
  readonly secondaire: ActionDuDocument;
};

/**
 * Le retour de l'en-tête est le MÊME mot sur les deux écrans, et c'est la
 * dimension 6 : même geste, même vocabulaire. Il n'est pas paramétrable — un
 * écran qui voudrait le renommer renommerait un repère, pas un libellé.
 */
const RETOUR = 'Revenir à l’accueil';
const SUITE = 'Suite';

const ENTITES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const echappe = (valeur: string): string => valeur.replace(/[&<>"']/g, (c) => ENTITES[c] ?? c);

const meta = (cle: 'name' | 'property', nom: string, contenu: string): string =>
  `<meta ${cle}="${nom}" content="${echappe(contenu)}"/>`;

/**
 * Un glyphe est DÉCORATIF ici, dans les deux cas : le chevron porte son nom sur
 * le lien qui le contient, la pastille redit ce que le titre dit déjà.
 * `aria-hidden` est donc la bonne annonce — un `role="img"` sans texte ferait
 * lire « image » à un lecteur d'écran, ce qui est pire que le silence.
 */
const glyphe = (nom: string): string =>
  // `fill="currentColor"` est porté par le `<symbol>` du sprite, pas par ses
  // tracés : l'extraire sans le reposer ici rendait un glyphe NOIR sur fond
  // sombre — invisible. C'est le seul niveau qu'un clone de `<use>` emporte,
  // et c'est aussi celui qui manque quand on n'inline que l'intérieur.
  `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${glypheDuSprite(nom)}</svg>`;

const lien = (classe: string, action: ActionDuDocument): string =>
  `<a class="${classe}" href="${echappe(action.href)}">${echappe(action.libelle)}</a>`;

const rangee = (ligne: LigneDuDocument): string =>
  `<div><dt>${echappe(ligne.cle)}</dt><dd>${echappe(ligne.valeur)}</dd></div>`;

const carteDApercu = (carte: MetaDuDocument['carte'], titre: string, description: string): readonly string[] =>
  carte === null
    ? []
    : [
        meta('property', 'og:type', 'website'),
        meta('property', 'og:site_name', 'Meeshy'),
        meta('property', 'og:title', titre),
        meta('property', 'og:description', description),
        carte.url === null ? '' : meta('property', 'og:url', carte.url),
        meta('name', 'twitter:card', 'summary'),
        meta('name', 'twitter:title', titre),
        meta('name', 'twitter:description', description),
      ];

const tete = ({ meta: annonce }: ParametresDuDocument): string =>
  [
    '<meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    // Le navigateur demande `/favicon.ico` de lui-même, avant le premier pixel :
    // une SECONDE requête sur une route que le § 8.3 gate à UNE — et, derrière
    // Traefik, une requête servie par le LEGACY, la zone ne servant aucun actif
    // à la racine (§ 4.4). Une icône vide déclarée la retire ; sur une page que
    // le lecteur quitte dans la milliseconde, rien n'est perdu.
    '<link rel="icon" href="data:,"/>',
    `<script>${themeScriptSource}</script>`,
    `<title>${echappe(annonce.titre)}</title>`,
    meta('name', 'description', annonce.description),
    // Ni une adresse de redirection ni celle d'un lien mort n'ont à figurer dans
    // un index ; l'aperçu, lui, n'est pas de l'indexation et reste servi (§ 5.4).
    meta('name', 'robots', annonce.robots),
    ...carteDApercu(annonce.carte, annonce.titre, annonce.description),
    `<style>${tableDeJetons()}${SOCLE_DU_DOCUMENT}${FEUILLE_DE_L_ECRAN}</style>`,
  ].join('');

const corpsDuDocument = ({
  entete,
  pastille,
  titre,
  corps,
  lignes,
  principal,
  secondaire,
}: ParametresDuDocument): string =>
  [
    '<div class="cadre">',
    '<header class="chrome">',
    `<a class="retour" href="/" aria-label="${echappe(RETOUR)}">${glyphe('ph-caret-left')}</a>`,
    `<div><p class="titre">${echappe(entete.titre)}</p><p class="sous">${echappe(entete.sous)}</p></div>`,
    '</header>',
    '<main id="main-content">',
    `<span class="pastille${pastille.ton === 'alerte' ? ' alerte' : ''}">${glyphe(pastille.glyphe)}</span>`,
    `<h1>${echappe(titre)}</h1>`,
    `<p class="corps">${echappe(corps)}</p>`,
    `<dl>${lignes.map(rangee).join('')}</dl>`,
    `<nav aria-label="${SUITE}">`,
    lien('cta principal', principal),
    lien('cta secondaire', secondaire),
    '</nav>',
    '</main>',
    '</div>',
  ].join('');

export const documentDeLEcran = (parametres: ParametresDuDocument): string =>
  `<!doctype html><html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}">` +
  `<head>${tete(parametres)}</head><body>${corpsDuDocument(parametres)}</body></html>`;

/**
 * La réponse qui porte ce document — même en-têtes pour les deux écrans.
 *
 * `no-store` parce que l'état d'un lien change sans prévenir : un document mis
 * en cache par un intermédiaire continuerait d'annoncer « ouverture » d'un lien
 * fermé, ou l'inverse.
 */
export const rendDocument = (html: string, statut: number): Response =>
  new Response(html, {
    status: statut,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
