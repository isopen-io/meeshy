import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';

import { documentDuSite } from '@/app/enveloppe/vue';
import type { Conversation, Lecteur, LiensDuLecteur } from '@/lib/api/compte';
import { initiales, teinteDeLAvatar } from '@/lib/avatar';

import { CHATS, PANNE, TABLEAU_DE_BORD, adresseDuLien, salutation } from './contenu';
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
    avatar(conversation.titre) +
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
  carteVide({
    glyphe: 'ph-chats-circle',
    titre: CHATS.vide,
    phrase: CHATS.videPrecision,
  });

/**
 * LA TEINTE ET LES INITIALES vivent dans `lib/avatar.ts`, le site UNIQUE des
 * deux rendus d'un avatar (serveur et module de participation) ; ce module la
 * ré-exporte pour ses lecteurs historiques.
 */
export { teinteDeLAvatar } from '@/lib/avatar';

const avatar = (titre: string): string =>
  `<span class="avatar ${teinteDeLAvatar(titre)}" aria-hidden="true">${echappe(initiales(titre))}</span>`;

/**
 * LA CARTE D'UN FIL À REPRENDRE — la cible `home.png` en dessine deux, et elles
 * ne sont pas les lignes plates de `/chats` : une carte porte un avatar large et
 * respire (charte règle 12).
 */
const carteDeFil = (conversation: Conversation, maintenant: number): string => {
  const meta = [
    `${conversation.membres} ${CHATS.participants}`,
    quand(conversation.dernierMessageA, maintenant),
  ]
    .filter((morceau) => morceau !== '')
    .join(' · ');

  return (
    '<li>' +
    `<a class="carte" href="${echappe(versLeFil(conversation))}">` +
    avatar(conversation.titre) +
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

/**
 * LA CARTE D'UN LIEN DE PARTAGE — tuile, adresse partagée, emploi mesuré.
 *
 * Elle mène à la CONVERSATION que le lien ouvre, dans l'interface connectée :
 * `/chat/:lien` est la porte de l'INVITÉ, et y envoyer le membre lui ferait
 * refaire une jonction qu'il a déjà faite. Quand la passerelle n'a pas étendu la
 * conversation, la carte n'a aucune destination : elle reste une carte
 * d'INFORMATION, jamais un lien mort (charte règle 7).
 */
const carteDeLien = (lien: { readonly identifiant: string; readonly utilisations: number; readonly conversation: string | null }): string => {
  const dedans =
    `<span class="tuile" aria-hidden="true">${svgDuSprite('ph-link-simple')}</span>` +
    '<span class="corps">' +
    `<span class="nom">${echappe(adresseDuLien(lien.identifiant))}</span>` +
    `<span class="meta">${lien.utilisations} ${echappe(TABLEAU_DE_BORD.emplois)}</span>` +
    '</span>';

  return lien.conversation === null
    ? `<li class="carte">${dedans}</li>`
    : `<li><a class="carte" href="/chats/${echappe(encodeURIComponent(lien.conversation))}">${dedans}</a></li>`;
};

/**
 * L'ÉTAT VIDE, DESSINÉ (charte règle 18) — contour pointillé, glyphe de 40 px,
 * titre, phrase, et une action primaire QUAND il y a quelque chose à faire.
 *
 * L'action est facultative, et ce n'est pas un affaiblissement de la règle 18 :
 * la règle 7 — « un contrôle existe s'il a un effet » — l'emporte sur elle. Un
 * bouton « Créer une communauté » posé au-dessus d'une route que la v3 ne sert
 * pas serait pire qu'une carte sans bouton.
 */
export const carteVide = ({
  glyphe,
  titre,
  phrase,
  action,
}: {
  readonly glyphe: string;
  readonly titre: string;
  readonly phrase: string;
  readonly action?: { readonly libelle: string; readonly href: string };
}): string =>
  '<div class="carte-vide">' +
  svgDuSprite(glyphe) +
  `<h3>${echappe(titre)}</h3>` +
  `<p>${echappe(phrase)}</p>` +
  (action === undefined
    ? ''
    : `<a class="action primaire" href="${echappe(action.href)}">${echappe(action.libelle)}</a>`) +
  '</div>';

const section = ({
  cle,
  titre,
  lien,
  corps,
}: {
  readonly cle: string;
  readonly titre: string;
  readonly lien?: { readonly libelle: string; readonly href: string };
  readonly corps: string;
}): string =>
  `<section class="section" aria-labelledby="${cle}">` +
  '<div class="tete">' +
  `<h2 id="${cle}">${echappe(titre)}</h2>` +
  (lien === undefined
    ? ''
    : `<a class="action discrete" href="${echappe(lien.href)}">${echappe(lien.libelle)}</a>`) +
  '</div>' +
  corps +
  '</section>';

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
  readonly liens: LiensDuLecteur;
  readonly maintenant: number;
};

/**
 * « MES LIENS » NE SE REND QUE SI ON SAIT QUOI EN DIRE.
 *
 * `indisponible` veut dire « la passerelle n'a pas répondu » : peindre « aucun
 * lien » sur ce silence dirait à quelqu'un qui en a douze qu'il n'en a aucun.
 * C'est la doctrine déjà écrite dans `contenu.ts` pour les quatre compteurs que
 * la v3 ne mesure pas — une donnée FAUSSE est pire qu'une donnée absente.
 */
const sectionDesLiens = (liens: LiensDuLecteur): string => {
  if (liens.genre === 'indisponible') return '';

  return section({
    cle: 'liens',
    titre: TABLEAU_DE_BORD.liens,
    corps:
      liens.liens.length === 0
        ? carteVide({
            glyphe: 'ph-link-simple',
            titre: TABLEAU_DE_BORD.liensVides,
            phrase: TABLEAU_DE_BORD.liensVidesPrecision,
          })
        : `<ul class="cartes">${liens.liens.map(carteDeLien).join('')}</ul>`,
  });
};

const corpsDuTableau = ({
  lecteur,
  conversations,
  total,
  liens,
  maintenant,
}: EtatDuTableau): string => {
  const nonLus = conversations.reduce((somme, c) => somme + c.nonLus, 0);
  const recentes = conversations.slice(0, 3);

  return (
    '<div class="bonjour">' +
    `<h1>${echappe(salutation(lecteur?.prenom ?? null))}</h1>` +
    `<p>${echappe(TABLEAU_DE_BORD.apercu)}</p>` +
    '</div>' +
    `<ul class="chiffres" aria-label="${echappe(TABLEAU_DE_BORD.titre)}">` +
    chiffre(total, TABLEAU_DE_BORD.conversations, TABLEAU_DE_BORD.total) +
    chiffre(nonLus, TABLEAU_DE_BORD.nonLus, TABLEAU_DE_BORD.nonLusPrecision) +
    '</ul>' +
    section({
      cle: 'reprendre',
      titre: TABLEAU_DE_BORD.recentes,
      // « Tout voir » ne qualifie rien quand il n'y a rien : sans fil, la porte
      // vers /chats prend la forme de l'action primaire de l'état vide, et elle
      // reste UNIQUE sur l'écran.
      ...(recentes.length === 0
        ? {}
        : { lien: { libelle: TABLEAU_DE_BORD.voirTout, href: '/chats' } }),
      corps:
        recentes.length === 0
          ? carteVide({
              glyphe: 'ph-chats-circle',
              titre: CHATS.vide,
              phrase: CHATS.videPrecision,
              action: { libelle: TABLEAU_DE_BORD.versLesChats, href: '/chats' },
            })
          : `<ul class="cartes">${recentes.map((c) => carteDeFil(c, maintenant)).join('')}</ul>`,
    }) +
    sectionDesLiens(liens)
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
      `<a class="action primaire" href="/">${echappe(PANNE.action)}</a>` +
      '</nav></section>',
    retour: false,
  });
