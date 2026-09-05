import { blocDuNavigateur } from '@/app/connecte/chargeur';
import { svgDuSprite } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { echappe } from '@/app/socle';

import { documentDeMessage, documentDuSite } from '@/app/enveloppe/vue';
import { apercuServi, type ApercuServi, type Conversation, type Lecteur, type LiensDuLecteur } from '@/lib/api/compte';
import { languesDuLecteur } from '@/lib/api/fil';
import { initiales, teinteDeLAvatar } from '@/lib/avatar';
import { compteDeParticipants, enUneLigne } from '@/lib/contenu/fil';

import { ESPACE } from '@/lib/contenu/espace';

import { CHATS, PANNE, TABLEAU_DE_BORD, adresseDuLien, salutation } from './contenu';
import { feuilleDeLEspace, raccourcisEntete } from './espace-vue';
import { FEUILLE_DE_L_ESPACE } from './espace-feuille';
import { FEUILLE_CONNECTEE, FEUILLE_DU_TABLEAU } from './feuille';
import { langAttribut } from './transcrit';

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
 * L'ÉCART RELATIF (`quand`) vit dans `lib/temps.ts`, avec les deux autres
 * formats de date de la v3, depuis qu'il a DEUX auteurs : le document servi et
 * le module qui repeint une ligne de `/chats` en direct. Ce module le
 * ré-exporte pour ses lecteurs historiques.
 */
export { quand } from '@/lib/temps';
import { quand } from '@/lib/temps';

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

/**
 * LA TEINTE ET LES INITIALES vivent dans `lib/avatar.ts`, le site UNIQUE des
 * deux rendus d'un avatar (serveur et module de participation) ; ce module la
 * ré-exporte pour ses lecteurs historiques.
 */
export { teinteDeLAvatar } from '@/lib/avatar';

/**
 * L'AVATAR — initiales et teinte, servi par les DEUX écrans de la zone (la
 * carte du tableau de bord et la ligne de `/chats`, `app/connecte/liste-vue.ts`)
 * depuis le site unique de leur calcul (`lib/avatar.ts`).
 */
export const avatar = (titre: string): string =>
  `<span class="avatar ${teinteDeLAvatar(titre)}" aria-hidden="true">${echappe(initiales(titre))}</span>`;

/**
 * LA PASTILLE DE LANGUE — le CODE de la langue d'ORIGINE, rendu SEULEMENT
 * quand une traduction est servie à sa place (charte règle 22). Sur un aperçu
 * déjà écrit dans la langue du lecteur, elle n'apprendrait rien.
 */
const pastilleDeLangue = (traduitDe: string | null, reserve: boolean): string =>
  traduitDe === null && !reserve
    ? ''
    : `<span class="langue" title="${echappe(CHATS.traduitDepuis)}"${traduitDe === null ? ' hidden' : ''}>` +
      `${svgDuSprite('ph-translate')}<span class="code">${echappe(traduitDe ?? '')}</span></span>`;

/**
 * **L'APERÇU DU DERNIER MESSAGE, DESCENDU AU PRISME — UN SEUL COMPOSEUR POUR
 * LES DEUX ÉCRANS DE LA ZONE.** La carte du tableau de bord (`cible/home.png` :
 * pastille `ES` puis « Merci, je t'envoie le fichier ») et la ligne de `/chats`
 * (`app/connecte/liste-vue.ts`) disent la MÊME chose de la MÊME donnée ; les
 * écrire deux fois, c'est se donner rendez-vous pour diverger — la pastille
 * change de côté sur un écran et pas sur l'autre, à un tap d'intervalle.
 *
 * La descente elle-même n'est pas ici : `apercuServi` (`lib/api/compte.ts`) est
 * le site unique, projection de `resolvePrismTranslation`. Ce composeur ne fait
 * que RENDRE ce qu'elle élit — et `lang=` dit ce qui part à côté du texte
 * (cycle 123), retiré quand la langue servie est celle du document.
 *
 * `reserve` NOMME LA SEULE DIFFÉRENCE entre les deux emplois, et ce n'est pas
 * un goût : sur `/chats`, le module de participation repeint la ligne en
 * direct, donc les fentes sont servies MÊME VIDES (il n'a pas de disque d'où
 * tirer le glyphe du sprite, et créer un nœud sous le doigt du lecteur
 * recalculerait la mise en page de la ligne au moment où elle bouge). Le
 * tableau de bord n'a pas de module : il ne paie pas des fentes que rien ne
 * remplira.
 */
export const apercuAuPrisme = ({ servi, reserve }: { readonly servi: ApercuServi | null; readonly reserve: boolean }): string => {
  if (servi === null && !reserve) return '';
  return (
    `<span class="apercu"${servi === null ? ' hidden' : ''}>` +
    pastilleDeLangue(servi?.traduitDe ?? null, reserve) +
    `<span class="texte"${langAttribut(servi?.langue ?? null, DOCUMENT_LANGUAGE)}>${echappe(servi?.texte ?? '')}</span>` +
    '</span>'
  );
};

/**
 * LA CARTE D'UN FIL À REPRENDRE — la cible `home.png` en dessine deux, et elles
 * ne sont pas les lignes plates de `/chats` : une carte porte un avatar large et
 * respire (charte règle 12).
 *
 * **CE QUE LA CIBLE MET SOUS LE NOM EST L'APERÇU**, pas un dénombrement : la
 * carte « Marta Ruiz » y porte la pastille `ES` puis « Merci, je t'envoie le
 * fichier », et celle du groupe « Ibrahim : On se cale à 15 h ? ». La donnée
 * descendait déjà (`Conversation.apercuTraductions`, le résolveur, la ligne de
 * `/chats`) et cette carte ne l'affichait pas — le cycle 122 du `CLAUDE.md`
 * posé sur la v3 : une descente juste dont la valeur n'atteint aucun lecteur
 * n'a corrigé personne.
 *
 * LA MÉTA NE DISPARAÎT PAS, ELLE CÈDE LA PLACE. Une conversation qui n'a encore
 * rien dit garde son compte de participants (au seuil du § 12.10.2, site unique
 * `lib/contenu/fil.ts`) et son écart relatif : une carte réduite à son seul nom
 * n'est pas un état, c'est une ligne vide (charte règle 18). Jamais les deux à
 * la fois — la cible n'en montre qu'une.
 */
const carteDeFil = ({
  conversation,
  langues,
  maintenant,
}: {
  readonly conversation: Conversation;
  readonly langues: readonly string[];
  readonly maintenant: number;
}): string => {
  const servi = apercuServi(conversation, langues);
  const meta = enUneLigne([
    compteDeParticipants({ membres: conversation.membres, mot: CHATS.participants }),
    quand(conversation.dernierMessageA, maintenant),
  ]);
  const sousLigne =
    servi === null ? `<span class="meta">${echappe(meta)}</span>` : apercuAuPrisme({ servi, reserve: false });

  return (
    '<li>' +
    `<a class="carte" href="${echappe(versLeFil(conversation))}">` +
    avatar(conversation.titre) +
    '<span class="corps">' +
    `<span class="nom">${echappe(conversation.titre)}</span>` +
    sousLigne +
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
  /** L'état `?espace` — la feuille de l'espace membre est-elle demandée ? */
  readonly espace: boolean;
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
  // LE PRISME DU LECTEUR, depuis le site unique qui l'ordonne
  // (`lib/api/fil.ts` › `languesDuLecteur`) — jamais un ordre réécrit ici.
  const langues = languesDuLecteur(lecteur ?? {});

  return (
    '<div class="entete-chats">' +
    '<div class="bonjour">' +
    `<h1>${echappe(salutation(lecteur?.prenom ?? null))}</h1>` +
    `<p>${echappe(TABLEAU_DE_BORD.apercu)}</p>` +
    '</div>' +
    raccourcisEntete('/') +
    '</div>' +
    // « RECHERCHER PARTOUT » — le champ que la cible pose en tête du tableau de
    // bord (`MeeshyWebV3.dc.html:74`) et la SEULE porte que `/search` avait sur
    // la planche (`:867`, « search, Recherche, champ »). Un `<a>` plutôt qu'un
    // `<input>` : la saisie vit sur `/search`, qui la sert déjà avec sa
    // recherche incrémentale — un second champ ici ferait taper deux fois.
    `<a class="chercher" href="/search">${svgDuSprite('ph-magnifying-glass')}${echappe(ESPACE.rechercher)}</a>` +
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
          : `<ul class="cartes">${recentes
              .map((conversation) => carteDeFil({ conversation, langues, maintenant }))
              .join('')}</ul>`,
    }) +
    sectionDesLiens(liens)
  );
};

export const documentDuTableau = (etat: EtatDuTableau): string => {
  // LA FEUILLE N'EST COMPOSÉE QUE DANS SON ÉTAT. Un tableau de bord au repos ne
  // paie ni la géométrie du dialogue ni ses rangées — la même règle 7 qui a
  // séparé `FEUILLE_DU_TABLEAU` de celle de la zone.
  const dessus = etat.espace ? feuilleDeLEspace({ lecteur: etat.lecteur, hote: '/' }) : '';

  return documentDuSite({
    script: blocDuNavigateur(),
    titre: `${TABLEAU_DE_BORD.titre} — Meeshy`,
    description: TABLEAU_DE_BORD.apercu,
    // La feuille du TABLEAU en plus de celle de la zone, et pour lui seul : la
    // page de PANNE ci-dessous ne rend aucune carte de fil, donc aucun aperçu
    // — elle n'en paie pas un octet (charte règle 7).
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_TABLEAU + (dessus === '' ? '' : FEUILLE_DE_L_ESPACE),
    corps: corpsDuTableau(etat),
    retour: false,
    surimpression: dessus,
  });
};

/**
 * L'ÉTAT DE PANNE EST DESSINÉ, pas laissé blanc. La passerelle peut ne pas
 * répondre ; la dimension 8 demande que cet état-là existe aussi.
 */
export const documentDePanne = (): string =>
  documentDeMessage({
    titre: PANNE.titre,
    paragraphes: [PANNE.corps],
    actions: [{ libelle: PANNE.action, href: '/' }],
    feuille: FEUILLE_CONNECTEE,
    robots: 'index, follow',
    retour: false,
  });
