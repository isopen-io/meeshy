import { svgDuSprite } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { teteDuDocument } from '@/app/enveloppe/vue';
import { FEUILLE_CONNECTEE } from '@/app/connecte/feuille';
import { FEUILLE_DU_FIL } from '@/app/connecte/fil-feuille';
import { corpsDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { echappe } from '@/app/socle';
import { THEME_PAR_DEFAUT } from '@/app/theme-script';
import { AUCUNE_PRESENCE } from '@/lib/api/fil';
import { RAISONS_DE_FERMETURE, type ApercuDeJonction, type Refus } from '@/lib/api/invite';
import { droitsHorsDuLien, nomsDesDroitsVariables } from '@/lib/contenu/droits';

import { FEUILLE_DU_CHOIX } from './choix-feuille';
import { languesOffertes, type ChoixDeLangue } from './langue';

/**
 * L'ÉTAT CHOIX DE `/chat/:lien` (conception § 12.3, charte règle 25) — la vue
 * `join` de la planche, redessinée par la directive : le CADRE du fil derrière,
 * INERTE et flouté, vide de tout message ; par-dessus, une modale `<dialog
 * open>` RENDUE PAR LE SERVEUR, qui marche sans JavaScript et demande : « vous
 * venez en anonyme, ou avec votre compte ? ».
 *
 * RIEN DE LA CONVERSATION NE PART DANS CET ÉTAT : ni message, ni participant,
 * ni identité du créateur — la charge de l'aperçu la sert, `lib/api/invite.ts`
 * la projette AVANT que quoi que ce soit n'entre ici (§ 5.1). Le cadre est
 * composé par le MÊME module que le fil (`corpsDuFil`), à vide : deux portes,
 * une vue, et un cadre qui ne peut pas diverger du fil qu'il annonce.
 *
 * L'ORDRE EST CELUI DE LA PLANCHE (`cible/join.png`, règle 25) : « vous êtes
 * invité dans » → le nom → la question → la citation → l'accordéon des droits →
 * le pseudo ET la langue sur une ligne → « Continuer en anonyme » → « ou garder
 * votre identité » → « Se connecter » → « Créer un compte » → la note qui
 * promet le retour. Un lien qui exige un courriel ou une date de naissance
 * (`requireEmail`, `requireBirthday` — la porte refuse 400 sans eux,
 * `link-admission.ts:428-431`) les demande ICI, sous la ligne : un formulaire
 * qui ne poserait pas la question que la passerelle va poser mentirait.
 *
 * LES REFUS SE PEIGNENT DANS LA MODALE (règle 20), TELS QUE LA PORTE CANONIQUE
 * LES ÉMET (`lib/api/invite.ts`, doc-tête) : un 409 `USERNAME_TAKEN_IN_
 * CONVERSATION` pré-remplit `suggestedNickname` dans `value` — jamais une
 * prose qui le suggère — ; un 400 nomme son champ (la phrase de la passerelle
 * dit lequel) et garde le formulaire ; un 403, un 409 `LINK_EXHAUSTED` ou un
 * 410 sont des refus DU LIEN : le formulaire se retire, « Se connecter » /
 * « Créer un compte » restent. Un refus n'est pas un statut : `LINK_EXHAUSTED`
 * est un 409 comme le pseudo pris, et c'est le CODE qui dit lequel des deux
 * laisse ressaisir.
 *
 * UN LIEN CLOS AVANT TOUT CHOIX (410 à l'aperçu) N'A PAS D'APERÇU — la
 * passerelle n'a servi que son code (`routes/anonymous.ts:602-613`), ni nom,
 * ni description, ni exigences. La modale CLOSE ne dit donc que cela : la
 * raison (la table du composeur, `RAISONS_DE_FERMETURE`) et le compte. Pas de
 * « vous êtes invité dans », pas de question binaire (aucune voie anonyme
 * n'existe), pas d'accordéon (il déroulerait des exigences que personne n'a
 * servies), et JAMAIS le segment d'adresse en guise de nom (§ 5.1 : rien
 * d'inventé). Le type le dit : `apercu: null` exige `clos`.
 */

export const CHAMP_DU_PSEUDO = 'pseudo';
export const CHAMP_DE_LA_LANGUE = 'langue';
export const CHAMP_DU_COURRIEL = 'courriel';
export const CHAMP_DE_LA_NAISSANCE = 'naissance';

export const CHOIX = {
  invite: 'Vous êtes invité dans',
  titre: 'Vous venez en anonyme, ou avec votre compte ?',
  droits: 'Ce que ce lien vous ouvre',
  droitsSous: (n: number): string => `${n} points · à lire avant d’entrer`,
  participants: (n: number): string => (n === 1 ? '1 participant' : `${n} participants`),
  pseudoRequis: { titre: 'Un pseudo suffit', sous: 'Ni courriel ni mot de passe pour entrer.' },
  pourEntrer: (demandes: string): string => `Pour entrer : ${demandes}`,
  pourEntrerSous: 'Aucun mot de passe, aucun compte à créer.',
  demandes: { pseudo: 'un pseudo', courriel: 'votre courriel', naissance: 'votre date de naissance' },
  compteRequis: { titre: 'Un compte est demandé', sous: 'Ce lien n’admet que les membres connectés.' },
  langues: (n: number): string => (n === 1 ? 'Une langue autorisée' : `${n} langues autorisées`),
  languesLibres: 'Toutes les langues sont les bienvenues',
  languesSous: 'Chaque message est traduit dans votre langue.',
  droitsApres: { titre: 'Vos droits exacts s’affichent à l’entrée', sous: (droits: string): string => `${droits} — selon le lien.` },
  pseudo: 'Votre pseudo',
  pseudoAide: 'Le nom que les autres verront.',
  langue: 'Langue',
  courriel: 'Votre courriel',
  naissance: 'Votre date de naissance',
  continuer: 'Continuer en anonyme',
  ou: 'ou garder votre identité',
  seConnecter: 'Se connecter',
  creerUnCompte: 'Créer un compte',
  note: 'Le lien est gardé de côté : vous reviendrez ici automatiquement après connexion.',
  clos: {
    titre: 'Ce lien est fermé',
    sous: 'Demandez un nouveau lien à la personne qui vous l’a envoyé. Déjà membre de la conversation ? Entrez avec votre compte.',
  },
} as const;

/**
 * Une phrase par refus que la PORTE nomme — la loi d'admission
 * (`services/conversations/linkAdmission.ts:112-118`), la validation de forme
 * de `POST /links/:key/members` (`routes/conversations/link-admission.ts:
 * 625-641`) et l'aperçu (`routes/anonymous.ts:603-613`). Les codes qui FERMENT
 * un lien ont déjà leur phrase dans `RAISONS_DE_FERMETURE` : ils ne sont pas
 * recopiés, `phraseDeRefus` les y lit. Un 400 n'a pas de code : `sendBadRequest`
 * met sa phrase dans `error` (`utils/response.ts:118-124`), et c'est elle qui
 * est servie.
 */
export const REFUS: Readonly<Record<string, string>> = {
  USERNAME_TAKEN_IN_CONVERSATION: 'Ce pseudo est déjà pris dans cette conversation — en voici un libre.',
  ACCOUNT_REQUIRED: 'Ce lien n’admet que les membres connectés.',
  LANGUAGE_NOT_ALLOWED: 'Cette langue n’est pas admise sur ce lien.',
  REGION_NOT_ALLOWED: 'Ce lien n’est pas ouvert depuis votre réseau.',
  BANNED: 'Vous ne pouvez plus entrer dans cette conversation.',
  VALIDATION: 'Vérifiez ce que vous avez saisi.',
};

export const phraseDeRefus = (code: string, message: string | null): string =>
  REFUS[code] ?? RAISONS_DE_FERMETURE[code] ?? message ?? 'Ce lien ne peut pas vous ouvrir la conversation.';

export type ChampDuChoix = typeof CHAMP_DU_PSEUDO | typeof CHAMP_DU_COURRIEL | typeof CHAMP_DE_LA_NAISSANCE;

/**
 * LE CHAMP qu'un refus de SAISIE désigne. Un 409 de pseudo pris le dit par son
 * code ; un 400 le dit par sa phrase — trois phrases fixes de `performLinkJoin`
 * (`link-admission.ts:428-436`), une par champ. Un refus qui ne désigne aucun
 * champ se peint en bandeau.
 */
export const champDuRefus = (refus: Refus): ChampDuChoix | null => {
  if (refus.code === 'USERNAME_TAKEN_IN_CONVERSATION') return CHAMP_DU_PSEUDO;
  if (refus.statut !== 400) return null;
  const phrase = `${refus.code} ${refus.message ?? ''}`.toLowerCase();
  if (/nom d'utilisateur|nom d’utilisateur|pseudo/.test(phrase)) return CHAMP_DU_PSEUDO;
  if (/e-?mail|courriel/.test(phrase)) return CHAMP_DU_COURRIEL;
  if (/naissance/.test(phrase)) return CHAMP_DE_LA_NAISSANCE;
  return null;
};

/** Un refus qui porte sur la SAISIE laisse le formulaire ; un refus du LIEN le retire. */
export const refusGardeLeFormulaire = (refus: Refus): boolean =>
  refus.statut === 400 || refus.code === 'USERNAME_TAKEN_IN_CONVERSATION';

export type Saisie = {
  readonly pseudo: string;
  readonly courriel: string;
  readonly naissance: string;
};

export const SAISIE_VIDE: Saisie = { pseudo: '', courriel: '', naissance: '' };

export type EtatDuChoix = {
  readonly segment: string;
  readonly langueProposee: string;
  readonly langueSaisie?: string;
  readonly saisie: Saisie;
  readonly refus: Refus | null;
  readonly maintenant: number;
} & (
  | {
      readonly apercu: ApercuDeJonction;
      /** Le lien s'est CLOS entre l'aperçu et la jonction : la modale ne propose que le compte. */
      readonly clos: string | null;
    }
  | {
      /** Le lien est CLOS avant tout choix (410 à l'aperçu) : rien n'a été servi que son code. */
      readonly apercu: null;
      readonly clos: string;
    }
);

const FEUILLE = FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DU_CHOIX;

const adresse = (segment: string): string => `/chat/${encodeURIComponent(segment)}`;

const ligneDeDroit = (glyphe: string, contenu: { readonly titre: string; readonly sous: string }): string =>
  `<li>${svgDuSprite(glyphe)}<div><b>${echappe(contenu.titre)}</b><p>${echappe(contenu.sous)}</p></div></li>`;

const enumeration = (elements: readonly string[]): string =>
  elements.length <= 1 ? (elements[0] ?? '') : `${elements.slice(0, -1).join(', ')} et ${elements[elements.length - 1]}`;

/** Ce que le lien DEMANDE pour entrer — lu de ses quatre exigences, jamais supposé. */
const exigence = (apercu: ApercuDeJonction): { readonly titre: string; readonly sous: string } => {
  if (apercu.requireAccount) return CHOIX.compteRequis;
  if (!apercu.requireEmail && !apercu.requireBirthday) return CHOIX.pseudoRequis;
  const demandes = [
    ...(apercu.requireNickname ? [CHOIX.demandes.pseudo] : []),
    ...(apercu.requireEmail ? [CHOIX.demandes.courriel] : []),
    ...(apercu.requireBirthday ? [CHOIX.demandes.naissance] : []),
  ];
  return { titre: CHOIX.pourEntrer(enumeration(demandes)), sous: CHOIX.pourEntrerSous };
};

const majuscule = (texte: string): string => texte.charAt(0).toLocaleUpperCase('fr') + texte.slice(1);

/**
 * L'ACCORDÉON DES DROITS — ce que l'aperçu SERT (`GET /anonymous/link/
 * :identifier` : exigences, langues autorisées, effectif), et rien d'inventé :
 * les huit droits d'un invité ne sont rendus qu'à la jonction (`entry.rights`),
 * et le bandeau du fil les lit de LÀ. Ici on dit ce qu'on sait, et on NOMME le
 * reste depuis la source que le bandeau lit (`lib/contenu/droits.ts`, #4523) :
 * les droits que le lien décide, sans verdict ; celui que rien n'accorde à un
 * invité, avec le sien.
 */
const accordeon = (apercu: ApercuDeJonction): string => {
  const lignes = [
    ...(apercu.participants === null
      ? []
      : [ligneDeDroit('ph-users-three', { titre: CHOIX.participants(apercu.participants), sous: apercu.nom })]),
    ligneDeDroit('ph-ghost', exigence(apercu)),
    ligneDeDroit('ph-translate', {
      titre: apercu.languesAutorisees.length === 0 ? CHOIX.languesLibres : CHOIX.langues(apercu.languesAutorisees.length),
      sous: CHOIX.languesSous,
    }),
    ligneDeDroit('ph-check-circle', {
      titre: CHOIX.droitsApres.titre,
      sous: CHOIX.droitsApres.sous(majuscule(enumeration(nomsDesDroitsVariables()))),
    }),
    ...droitsHorsDuLien().map((droit) => ligneDeDroit('ph-x-circle', droit)),
  ];
  return (
    '<details class="droits">' +
    `<summary>${svgDuSprite('ph-key')}<div><b>${echappe(CHOIX.droits)}</b><p>${echappe(CHOIX.droitsSous(lignes.length))}</p></div>` +
    `<span class="caret">${svgDuSprite('ph-caret-down')}</span></summary>` +
    `<ul>${lignes.join('')}</ul>` +
    '</details>'
  );
};

const option = (langue: ChoixDeLangue, choisie: string): string =>
  `<option value="${echappe(langue.code)}"${langue.code === choisie ? ' selected' : ''}>${echappe(langue.nom)}</option>`;

const champ = ({
  nom,
  libelle,
  type,
  valeur,
  requis,
  autocomplete,
  large,
  aide,
  refus,
}: {
  readonly nom: ChampDuChoix;
  readonly libelle: string;
  readonly type: 'text' | 'email' | 'date';
  readonly valeur: string;
  readonly requis: boolean;
  readonly autocomplete: string;
  readonly large: boolean;
  readonly aide: string | null;
  readonly refus: Refus | null;
}): string => {
  const idDuRefus = `${nom}-refus`;
  return (
    `<div class="champ${large ? ' large' : ''}${refus === null ? '' : ' en-refus'}">` +
    `<label for="${nom}">${echappe(libelle)}</label>` +
    `<input id="${nom}" name="${nom}" type="${type}"${requis ? ' required' : ''} autocomplete="${autocomplete}"` +
    (type === 'text' ? ' maxlength="50"' : '') +
    ` value="${echappe(valeur)}"` +
    (refus === null ? '' : ` aria-invalid="true" aria-describedby="${idDuRefus}"`) +
    '/>' +
    (refus === null
      ? aide === null
        ? ''
        : `<p class="hors-ecran">${echappe(aide)}</p>`
      : `<p class="refus" id="${idDuRefus}" role="alert">${echappe(phraseDeRefus(refus.code, refus.message))}</p>`) +
    '</div>'
  );
};

const formulaire = (etat: EtatDuChoix, apercu: ApercuDeJonction): string => {
  const refusDeSaisie = etat.refus !== null && refusGardeLeFormulaire(etat.refus) ? etat.refus : null;
  const champRefuse = refusDeSaisie === null ? null : champDuRefus(refusDeSaisie);
  const refusSurLeChamp = (nom: ChampDuChoix): Refus | null => (champRefuse === nom ? refusDeSaisie : null);
  const { saisie } = etat;

  return (
    `<form method="post" action="${echappe(adresse(etat.segment))}">` +
    (refusDeSaisie !== null && champRefuse === null ? bandeauDeRefus(refusDeSaisie.code, refusDeSaisie.message) : '') +
    '<div class="champs">' +
    champ({
      nom: CHAMP_DU_PSEUDO,
      libelle: CHOIX.pseudo,
      type: 'text',
      valeur: refusDeSaisie?.suggestion ?? saisie.pseudo,
      requis: apercu.requireNickname,
      autocomplete: 'nickname',
      large: false,
      aide: CHOIX.pseudoAide,
      refus: refusSurLeChamp(CHAMP_DU_PSEUDO),
    }) +
    '<div class="champ">' +
    `<label for="${CHAMP_DE_LA_LANGUE}">${echappe(CHOIX.langue)}</label>` +
    `<select id="${CHAMP_DE_LA_LANGUE}" name="${CHAMP_DE_LA_LANGUE}">` +
    languesOffertes(apercu.languesAutorisees)
      .map((langue) => option(langue, etat.langueSaisie ?? etat.langueProposee))
      .join('') +
    '</select>' +
    '</div>' +
    '</div>' +
    (apercu.requireEmail
      ? champ({
          nom: CHAMP_DU_COURRIEL,
          libelle: CHOIX.courriel,
          type: 'email',
          valeur: saisie.courriel,
          requis: true,
          autocomplete: 'email',
          large: true,
          aide: null,
          refus: refusSurLeChamp(CHAMP_DU_COURRIEL),
        })
      : '') +
    (apercu.requireBirthday
      ? champ({
          nom: CHAMP_DE_LA_NAISSANCE,
          libelle: CHOIX.naissance,
          type: 'date',
          valeur: saisie.naissance,
          requis: true,
          autocomplete: 'bday',
          large: true,
          aide: null,
          refus: refusSurLeChamp(CHAMP_DE_LA_NAISSANCE),
        })
      : '') +
    `<button class="action primaire" type="submit">${svgDuSprite('ph-ghost')}${echappe(CHOIX.continuer)}</button>` +
    '</form>'
  );
};

const bandeauDeRefus = (code: string, message: string | null): string =>
  `<div class="bandeau refus" role="alert"><div class="entete">${svgDuSprite('ph-x-circle')}` +
  `<div><b>${echappe(phraseDeRefus(code, message))}</b></div></div></div>`;

/** Les deux actions du compte et la note qui promet le retour — communes aux deux modales. */
const compte = (segment: string): string => {
  const ici = adresse(segment);
  return (
    `<a class="action contour" href="/login?returnUrl=${echappe(encodeURIComponent(ici))}">${echappe(CHOIX.seConnecter)}</a>` +
    `<a class="action discrete" href="/signup?returnUrl=${echappe(encodeURIComponent(ici))}">${echappe(CHOIX.creerUnCompte)}</a>` +
    `<p class="note">${echappe(CHOIX.note)}</p>`
  );
};

/**
 * LA FEUILLE A UNE HAUTEUR RÉSERVÉE — égale au contenu NOMINAL de sa variante,
 * pour ne pas bouger pendant que le document arrive (`choix-feuille.ts`). Le
 * serveur, qui compose la modale, sait laquelle il sert : `etendue` quand le
 * lien demande un courriel ou une date de naissance (deux champs de plus),
 * `breve` quand aucun formulaire n'est rendu autour d'un aperçu (refus du
 * lien, compte exigé), `fermee` pour la modale CLOSE, qui n'a pas d'aperçu.
 */
const varianteDeLaFeuille = (apercu: ApercuDeJonction, sansFormulaire: boolean): string => {
  if (sansFormulaire) return ' breve';
  return apercu.requireEmail || apercu.requireBirthday ? ' etendue' : '';
};

const modaleDuChoix = (etat: EtatDuChoix, apercu: ApercuDeJonction, clos: string | null): string => {
  const refusDuLien = etat.refus !== null && !refusGardeLeFormulaire(etat.refus) ? etat.refus : null;
  const sansFormulaire = clos !== null || refusDuLien !== null || apercu.requireAccount;

  return (
    '<div class="voile"></div>' +
    `<dialog class="feuille${varianteDeLaFeuille(apercu, sansFormulaire)}" open aria-labelledby="titre-du-choix" aria-describedby="question-du-choix">` +
    '<span class="poignee" aria-hidden="true"></span>' +
    `<p class="hote">${svgDuSprite('ph-link-simple')}${echappe(CHOIX.invite)}</p>` +
    `<h2 id="titre-du-choix">${echappe(apercu.nom)}</h2>` +
    `<p class="question" id="question-du-choix">${echappe(CHOIX.titre)}</p>` +
    (apercu.description === null ? '' : `<blockquote>${echappe(apercu.description)}</blockquote>`) +
    accordeon(apercu) +
    (clos === null ? '' : bandeauDeRefus(clos, null)) +
    (refusDuLien === null ? '' : bandeauDeRefus(refusDuLien.code, refusDuLien.message)) +
    (apercu.requireAccount && clos === null && refusDuLien === null ? bandeauDeRefus('ACCOUNT_REQUIRED', null) : '') +
    (sansFormulaire ? '' : formulaire(etat, apercu)) +
    (sansFormulaire ? '' : `<p class="ou">${echappe(CHOIX.ou)}</p>`) +
    compte(etat.segment) +
    '</dialog>'
  );
};

/** La modale CLOSE : ce que la passerelle a servi — la raison — et le compte. Rien d'autre n'est su. */
const modaleClose = (etat: EtatDuChoix, clos: string): string =>
  '<div class="voile"></div>' +
  '<dialog class="feuille fermee" open aria-labelledby="titre-du-choix" aria-describedby="question-du-choix">' +
  '<span class="poignee" aria-hidden="true"></span>' +
  `<h2 id="titre-du-choix">${echappe(CHOIX.clos.titre)}</h2>` +
  `<p class="question" id="question-du-choix">${echappe(CHOIX.clos.sous)}</p>` +
  bandeauDeRefus(clos, null) +
  compte(etat.segment) +
  '</dialog>';

const modale = (etat: EtatDuChoix): string =>
  etat.apercu === null ? modaleClose(etat, etat.clos) : modaleDuChoix(etat, etat.apercu, etat.clos);

/** Le cadre du fil, VIDE et INERTE : le même module de vue, sans un message, sans module de participation. */
const cadre = (etat: EtatDuChoix): EtatDuFil => ({
  porte: { genre: 'membre', cle: etat.segment },
  fil: {
    id: etat.apercu?.conversationId ?? etat.segment,
    titre: etat.apercu?.nom ?? CHOIX.clos.titre,
    membres: etat.apercu?.participants ?? 0,
    presence: AUCUNE_PRESENCE,
    messages: [],
    plusAncien: null,
  },
  lecteur: { id: null, nom: '', langues: [etat.langueProposee] },
  erreur: null,
  brouillon: '',
  maintenant: etat.maintenant,
  composeur: { genre: 'ouvert' },
  tempsReel: null,
  // Le cadre du CHOIX ne sert AUCUN message : il n'y a pas de pièce à ouvrir.
  plein: null,
  profil: null,
});

export const documentDuChoix = (etat: EtatDuChoix): string =>
  '<!doctype html>' +
  `<html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}">` +
  teteDuDocument({
    titre: `${etat.apercu?.nom ?? CHOIX.clos.titre} — Meeshy`,
    description: etat.apercu === null ? phraseDeRefus(etat.clos, null) : (etat.apercu.description ?? CHOIX.titre),
    feuille: FEUILLE,
    robots: 'noindex, nofollow',
  }) +
  '<body>' +
  // La modale AVANT le cadre : elle est fixe, complète dès les premiers octets
  // du corps, et le cadre qui arrive ensuite — flouté, inerte — ne la déplace
  // pas. Rendue après un cadre de 30 Ko, elle était peinte courte puis
  // grandissait vers le haut pendant que le document arrivait par morceaux
  // (CLS 0,347 mesuré en 3G, contre le gate 0,05 du § 12.6).
  modale(etat) +
  corpsDuFil(cadre(etat), { cadre: true }) +
  '</body>' +
  '</html>';
