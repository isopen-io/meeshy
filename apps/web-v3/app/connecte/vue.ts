import { echappe } from '@/app/socle';

import { documentDuSite } from '@/app/enveloppe/vue';
import type { Conversation, Lecteur } from '@/lib/api/compte';

import { CHATS, PANNE, TABLEAU_DE_BORD, salutation } from './contenu';
import { FEUILLE_CONNECTEE } from './feuille';

/**
 * LES DEUX ÉCRANS DE LA ZONE CONNECTÉE, rendus par le SERVEUR.
 *
 * Ils ne sont pas une coquille qu'un script remplirait : le document qui part
 * porte DÉJÀ les chiffres et les conversations. Une requête, aucun octet de
 * runtime, aucun état de chargement à dessiner — parce qu'il n'y en a pas.
 *
 * C'est ce que le cookie de jeton rend possible (`app/authentification/
 * remise.ts`), et c'est la raison d'être de ce cookie : sans lui, la même page
 * demanderait au navigateur d'aller chercher ses propres données, donc un
 * squelette, un spinner et trois allers-retours.
 */

const initiales = (titre: string): string =>
  titre
    .split(/\s+/)
    .filter((mot) => mot !== '')
    .slice(0, 2)
    .map((mot) => [...mot][0] ?? '')
    .join('')
    .toUpperCase() || '·';

/**
 * QUAND, EN RELATIF — et le relatif n'est pas un choix de style.
 *
 * Une heure absolue rendue par le serveur est rendue dans le FUSEAU DU SERVEUR
 * (UTC en production) : « 18:06 » s'afficherait faux pour un lecteur à Paris, à
 * Lagos ou à São Paulo, et personne ne le verrait puisque l'heure a l'air d'une
 * heure. Un écart relatif ne dépend que de l'horloge, qui est la même partout.
 */
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

export const quand = (iso: string | null, maintenant: number): string => {
  if (iso === null) return '';
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return '';

  const ecart = Math.max(0, maintenant - instant);
  if (ecart < MINUTE) return 'à l’instant';
  if (ecart < HEURE) return `il y a ${Math.floor(ecart / MINUTE)} min`;
  if (ecart < JOUR) return `il y a ${Math.floor(ecart / HEURE)} h`;
  if (ecart < 7 * JOUR) return `il y a ${Math.floor(ecart / JOUR)} j`;
  return `il y a ${Math.floor(ecart / (7 * JOUR))} sem.`;
};

/**
 * OÙ MÈNE UNE CONVERSATION — chez nous, désormais. Ce site pointait vers
 * `/conversations/:id` du legacy tant que la v3 ne rendait aucun fil ; elle en
 * rend un (`app/chats/[cle]/route.ts`), et la frontière se referme.
 *
 * L'IDENTIFIANT DE BASE PLUTÔT QUE LE LISIBLE, alors que la passerelle accepte
 * les deux : `identifier` est facultatif et peut changer, `id` ne peut ni
 * manquer ni bouger. Une adresse partagée par un lecteur doit survivre au
 * renommage de la conversation.
 */
export const versLeFil = (conversation: Conversation): string => `/chats/${conversation.id}`;

const ligne = (conversation: Conversation, maintenant: number): string => {
  const meta = [
    `${conversation.membres} ${CHATS.participants}`,
    quand(conversation.dernierMessageA, maintenant),
  ]
    .filter((morceau) => morceau !== '')
    .join(' · ');

  return (
    '<li>' +
    `<a class="ligne" href="${echappe(versLeFil(conversation))}">` +
    `<span class="pastille" aria-hidden="true">${echappe(initiales(conversation.titre))}</span>` +
    '<span class="corps">' +
    `<span class="nom">${echappe(conversation.titre)}</span>` +
    `<span class="meta">${echappe(meta)}</span>` +
    '</span>' +
    (conversation.nonLus > 0
      ? `<span class="compte">${conversation.nonLus}<span class="hors-ecran"> ${echappe(CHATS.nonLus)}</span></span>`
      : '') +
    '</a>' +
    '</li>'
  );
};

const listeDesFils = (
  conversations: readonly Conversation[],
  maintenant: number,
): string => `<ul>${conversations.map((c) => ligne(c, maintenant)).join('')}</ul>`;

const vide = (): string =>
  '<div class="vide">' +
  `<h2>${echappe(CHATS.vide)}</h2>` +
  `<p>${echappe(CHATS.videPrecision)}</p>` +
  '</div>';

const chiffre = (valeur: number, quoi: string, precision: string): string =>
  '<li>' +
  `<span class="valeur">${valeur}</span>` +
  `<span class="quoi">${echappe(quoi)}</span>` +
  `<span class="precision">${echappe(precision)}</span>` +
  '</li>';

export type EtatDuTableau = {
  readonly lecteur: Lecteur | null;
  readonly conversations: readonly Conversation[];
  readonly total: number;
  readonly maintenant: number;
};

const corpsDuTableau = ({ lecteur, conversations, total, maintenant }: EtatDuTableau): string => {
  const nonLus = conversations.reduce((somme, c) => somme + c.nonLus, 0);
  const recentes = conversations.slice(0, 5);

  return (
    '<div class="bonjour">' +
    `<h1>${echappe(salutation(lecteur?.prenom ?? null))}</h1>` +
    `<p>${echappe(TABLEAU_DE_BORD.apercu)}</p>` +
    '</div>' +
    `<section aria-label="${echappe(TABLEAU_DE_BORD.titre)}">` +
    '<ul class="chiffres">' +
    chiffre(total, TABLEAU_DE_BORD.conversations, TABLEAU_DE_BORD.total) +
    chiffre(nonLus, TABLEAU_DE_BORD.nonLus, TABLEAU_DE_BORD.nonLusPrecision) +
    '</ul>' +
    '</section>' +
    '<section class="acces" aria-labelledby="acces">' +
    `<h2 id="acces">${echappe(TABLEAU_DE_BORD.actions)}</h2>` +
    '<nav>' +
    `<a class="cta principal" href="/chats">${echappe(CHATS.titre)}</a>` +
    '</nav>' +
    '</section>' +
    '<section class="fil" aria-labelledby="recentes">' +
    '<div class="tete">' +
    `<h2 id="recentes">${echappe(TABLEAU_DE_BORD.recentes)}</h2>` +
    (recentes.length === 0
      ? ''
      : `<a href="/chats">${echappe(TABLEAU_DE_BORD.voirTout)}</a>`) +
    '</div>' +
    (recentes.length === 0 ? vide() : listeDesFils(recentes, maintenant)) +
    '</section>'
  );
};

export const documentDuTableau = (etat: EtatDuTableau): string =>
  documentDuSite({
    titre: `${TABLEAU_DE_BORD.titre} — Meeshy`,
    description: TABLEAU_DE_BORD.apercu,
    feuille: FEUILLE_CONNECTEE,
    corps: corpsDuTableau(etat),
    retour: false,
  });

export type EtatDesChats = {
  readonly conversations: readonly Conversation[];
  readonly maintenant: number;
};

export const documentDesChats = ({ conversations, maintenant }: EtatDesChats): string =>
  documentDuSite({
    titre: `${CHATS.titre} — Meeshy`,
    description: CHATS.accroche,
    feuille: FEUILLE_CONNECTEE,
    corps:
      '<div class="bonjour">' +
      `<h1>${echappe(CHATS.titre)}</h1>` +
      `<p>${echappe(CHATS.accroche)}</p>` +
      '</div>' +
      '<section class="fil" aria-label="' +
      echappe(CHATS.titre) +
      '">' +
      (conversations.length === 0 ? vide() : listeDesFils(conversations, maintenant)) +
      '</section>',
    retour: true,
  });

/**
 * L'ÉTAT DE PANNE EST DESSINÉ, pas laissé blanc. La passerelle peut ne pas
 * répondre ; la dimension 8 demande que cet état-là existe aussi.
 */
export const documentDePanne = (): string =>
  documentDuSite({
    titre: `${PANNE.titre} — Meeshy`,
    description: PANNE.corps,
    feuille: FEUILLE_CONNECTEE,
    corps:
      '<div class="bonjour">' +
      `<h1>${echappe(PANNE.titre)}</h1>` +
      `<p>${echappe(PANNE.corps)}</p>` +
      '</div>' +
      '<section class="acces" aria-label="' +
      echappe(PANNE.action) +
      '"><nav>' +
      `<a class="cta principal" href="/">${echappe(PANNE.action)}</a>` +
      '</nav></section>',
    retour: false,
  });
