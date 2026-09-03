import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import type { Lecteur } from '@/lib/api/compte';
import type { Appareil } from '@/lib/api/reglages';
import { nomDeLangue } from '@/lib/contenu/langues';
import { REGLAGES } from '@/lib/contenu/reglages';
import { quand } from '@/lib/temps';
import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';

import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { FEUILLE_DES_REGLAGES } from './reglages-feuille';
import { documentPleinEcran } from './fil-vue';
import { carteVide } from './vue';

/**
 * LES SIX ÉCRANS DE RÉGLAGES — un carrefour, deux fiches, trois formulaires.
 *
 * UN SEUL MODULE, ET C'EST LA PROPRIÉTÉ QUI COMPTE. Ils partagent une forme —
 * un en-tête qui ramène, des sections titrées, des rangées de 44 px — et six
 * modules auraient fait six occasions de la faire diverger. Ce qui les
 * distingue tient dans une fonction chacun ; ce qui les réunit est écrit une
 * fois.
 *
 * TOUT CE QUI CHANGE UNE VALEUR EST UN `<form method="post">`, et chacun poste
 * vers l'adresse qui l'affiche — sans attribut `action`, comme partout dans la
 * v3 : le défaut du navigateur EST l'adresse courante, et il suit la route quoi
 * qu'il arrive. La porte répond en Post/Redirect/Get, si bien qu'un
 * rechargement ne rejoue rien.
 *
 * UNE RANGÉE QUI N'OUVRE RIEN N'EST PAS UN LIEN. Le profil MONTRE l'e-mail et
 * le téléphone — la cible les dessine — mais ils ne s'éditent pas ici (#4184) :
 * ils sont rendus en `<div>`, avec la phrase qui dit où ils se changent. Un
 * chevron y serait une promesse que rien ne tient (charte règle 7).
 */

const CHEMIN = {
  carrefour: '/settings',
  profil: '/settings/profile',
  edition: '/settings/profile/edit',
  application: '/settings/application',
  securite: '/settings/security',
  motDePasse: '/settings/security/password',
} as const;

/**
 * L'EN-TÊTE EST CELUI DU FIL, réemployé — `fil-tete` porte déjà le retour, le
 * titre et son sous-titre, et la zone connectée sert sa feuille sur tous ses
 * écrans pleins. En redessiner un ici aurait fait un second en-tête à corriger
 * deux fois.
 */
const enTete = ({
  titre,
  sous,
  retour,
  libelleDuRetour,
}: {
  readonly titre: string;
  readonly sous: string;
  readonly retour: string;
  readonly libelleDuRetour: string;
}): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="${echappe(retour)}" aria-label="${echappe(libelleDuRetour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(titre)}</h1>` +
  `<p class="sous">${echappe(sous)}</p>` +
  '</div>' +
  '</header>';

const section = ({ titre, corps, phrase = '' }: { readonly titre: string; readonly corps: string; readonly phrase?: string }): string =>
  '<section>' +
  `<h2>${echappe(titre)}</h2>` +
  (phrase === '' ? '' : `<p class="phrase">${echappe(phrase)}</p>`) +
  corps +
  '</section>';

const page = ({ titre, description, corps }: { readonly titre: string; readonly description: string; readonly corps: string }): string =>
  documentPleinEcran({
    titre: `${titre} — Meeshy`,
    description,
    corps: `<main id="main-content" class="reglages">${corps}</main>`,
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_REGLAGES,
  });

/**
 * L'AVIS DU POST — ce que le geste vient de faire, dit au RETOUR de la
 * redirection et jamais par le formulaire lui-même. `role="status"` le fait
 * annoncer sans voler le focus ; un `role="alert"` interromprait la lecture
 * pour un succès.
 */
const avis = (phrase: string | null, echoue = false): string =>
  phrase === null
    ? ''
    : `<p class="avis" role="status">${svgDuSprite(echoue ? 'ph-x-circle' : 'ph-check-circle')}${echappe(phrase)}</p>`;

const rangeeLien = ({
  href,
  quoi,
  sous = '',
  valeur = '',
}: {
  readonly href: string;
  readonly quoi: string;
  readonly sous?: string;
  readonly valeur?: string;
}): string =>
  `<li><a class="rangee" href="${echappe(href)}">` +
  '<span class="dit">' +
  `<span class="quoi">${echappe(quoi)}</span>` +
  (sous === '' ? '' : `<span class="sous">${echappe(sous)}</span>`) +
  '</span>' +
  (valeur === '' ? '' : `<span class="valeur">${echappe(valeur)}</span>`) +
  svgDuSprite('ph-caret-right') +
  '</a></li>';

/**
 * UNE RANGÉE QUI SE LIT SANS SE TOUCHER. Le même dessin qu'un lien, sans le
 * chevron ni la cible : le chevron est ce qui ANNONCE qu'on peut aller
 * quelque part, et le laisser sur une ligne inerte serait exactement le
 * contrôle qui ment que la règle 7 interdit.
 */
const rangeeDite = ({
  quoi,
  valeur,
  sous = '',
}: {
  readonly quoi: string;
  readonly valeur: string;
  readonly sous?: string;
}): string =>
  '<li><div class="rangee">' +
  '<span class="dit">' +
  `<span class="quoi">${echappe(quoi)}</span>` +
  (sous === '' ? '' : `<span class="sous">${echappe(sous)}</span>`) +
  '</span>' +
  `<span class="valeur">${echappe(valeur)}</span>` +
  '</div></li>';

const rangs = (contenu: string, libelle: string): string =>
  `<ul class="rangs" aria-label="${echappe(libelle)}">${contenu}</ul>`;

// ─── /settings — le carrefour ───────────────────────────────────────────────

/**
 * TROIS DESTINATIONS, ET LA CIBLE EN DESSINE SEPT. Les quatre absentes —
 * confidentialité, médias, messages, notifications — n'ont aucune route dans la
 * passerelle (`lib/contenu/reglages.ts` porte le relevé daté). Les dessiner
 * grisées occuperait la place de vraies destinations et ferait chercher au
 * clavier une rangée qui n'ouvre rien.
 */
export const documentDuCarrefour = (): string =>
  page({
    titre: REGLAGES.titre,
    description: REGLAGES.sousTitre,
    corps:
      enTete({
        titre: REGLAGES.titre,
        sous: REGLAGES.sousTitre,
        retour: '/chats',
        libelleDuRetour: REGLAGES.retour,
      }) +
      rangs(
        rangeeLien({ href: CHEMIN.profil, quoi: REGLAGES.carrefour.profil.titre, sous: REGLAGES.carrefour.profil.phrase }) +
          rangeeLien({ href: CHEMIN.securite, quoi: REGLAGES.carrefour.securite.titre, sous: REGLAGES.carrefour.securite.phrase }) +
          rangeeLien({
            href: CHEMIN.application,
            quoi: REGLAGES.carrefour.application.titre,
            sous: REGLAGES.carrefour.application.phrase,
          }),
        REGLAGES.carrefour.liste,
      ),
  });

// ─── /settings/profile — la fiche ───────────────────────────────────────────

const LANGUES_DU_LECTEUR = [
  { cle: 'systemLanguage', libelle: REGLAGES.profil.principale },
  { cle: 'regionalLanguage', libelle: REGLAGES.profil.secondaire },
  { cle: 'customDestinationLanguage', libelle: REGLAGES.profil.personnalisee },
] as const;

/**
 * LES TROIS RANGS PORTENT LEUR NUMÉRO. L'ordre EST l'information — le Prisme
 * sert la première langue qui porte le contenu —, et une puce ne dirait pas
 * qu'il compte. Un rang vide se lit « Aucune » plutôt que de disparaître : la
 * place qu'il occupe dans la descente est ce qu'on vient vérifier ici.
 */
const rangeesDeLangue = (lecteur: Lecteur): string =>
  LANGUES_DU_LECTEUR.map(({ cle, libelle }, index) => {
    const code = lecteur[cle];
    return (
      '<li><div class="rangee">' +
      `<span class="rang" aria-hidden="true">${index + 1}</span>` +
      '<span class="dit">' +
      `<span class="quoi">${echappe(libelle)}</span>` +
      `<span class="sous">${echappe(REGLAGES.profil.rang(index + 1))}</span>` +
      '</span>' +
      `<span class="valeur"${code === null ? '' : ` lang="${echappe(code)}"`}>` +
      `${echappe(code === null ? REGLAGES.profil.aucune : nomDeLangue(code))}</span>` +
      '</div></li>'
    );
  }).join('');

export const documentDuProfil = (lecteur: Lecteur): string =>
  page({
    titre: REGLAGES.profil.titre,
    description: REGLAGES.carrefour.profil.phrase,
    corps:
      enTete({
        titre: REGLAGES.profil.titre,
        sous: REGLAGES.titre,
        retour: CHEMIN.carrefour,
        libelleDuRetour: REGLAGES.auxReglages,
      }) +
      section({
        titre: REGLAGES.profil.identite,
        corps:
          rangs(
            rangeeDite({ quoi: REGLAGES.profil.nomAffiche, valeur: lecteur.nomAffiche ?? REGLAGES.profil.absent }) +
              rangeeDite({
                quoi: REGLAGES.profil.pseudonyme,
                valeur: lecteur.pseudonyme === null ? REGLAGES.profil.absent : `@${lecteur.pseudonyme}`,
              }) +
              rangeeDite({
                quoi: REGLAGES.profil.bio,
                sous: REGLAGES.profil.bioAide,
                valeur: lecteur.bio ?? REGLAGES.profil.absent,
              }),
            REGLAGES.profil.identite,
          ) +
          `<a class="action primaire" href="${CHEMIN.edition}">${echappe(REGLAGES.profil.modifier)}</a>`,
      }) +
      section({
        titre: REGLAGES.profil.coordonnees,
        phrase: REGLAGES.profil.ailleurs,
        corps: rangs(
          rangeeDite({ quoi: REGLAGES.profil.email, valeur: lecteur.email ?? REGLAGES.profil.absent }) +
            rangeeDite({ quoi: REGLAGES.profil.telephone, valeur: lecteur.telephone ?? REGLAGES.profil.absent }),
          REGLAGES.profil.coordonnees,
        ),
      }) +
      section({
        titre: REGLAGES.profil.langues,
        phrase: REGLAGES.profil.languesPhrase,
        corps: rangs(rangeesDeLangue(lecteur), REGLAGES.profil.langues),
      }),
  });

// ─── /settings/profile/edit — le formulaire ─────────────────────────────────

export const CHAMPS_DU_PROFIL = {
  prenom: 'prenom',
  nom: 'nom',
  nomAffiche: 'nomAffiche',
  bio: 'bio',
  systemLanguage: 'systemLanguage',
  regionalLanguage: 'regionalLanguage',
  customDestinationLanguage: 'customDestinationLanguage',
} as const;

const champTexte = ({
  nom,
  libelle,
  valeur,
  aide = '',
}: {
  readonly nom: string;
  readonly libelle: string;
  readonly valeur: string | null;
  readonly aide?: string;
}): string =>
  '<p class="champ">' +
  `<label for="c-${nom}">${echappe(libelle)}</label>` +
  `<input id="c-${nom}" name="${nom}" type="text" value="${echappe(valeur ?? '')}" autocomplete="off">` +
  (aide === '' ? '' : `<span class="aide">${echappe(aide)}</span>`) +
  '</p>';

/**
 * LA LISTE DES LANGUES VIENT DE LA SOURCE PARTAGÉE, jamais d'une table écrite
 * ici : `SUPPORTED_LANGUAGES` (`@meeshy/shared`) est ce que le traducteur sait
 * faire, et une seconde liste offrirait une langue que la passerelle refuse ou
 * en cacherait une qu'elle sert. Les noms sont FRANÇAIS
 * (`nomDeLangue`) — le document l'est, et une liste mi-native mi-traduite ne se
 * trie dans aucun ordre.
 *
 * L'entrée VIDE est le rang « Aucune », et elle est en tête : un rang qu'on ne
 * peut pas défaire serait un réglage qu'on ne peut que subir.
 */
const OPTIONS_DE_LANGUE = [...SUPPORTED_LANGUAGES]
  .map(({ code }) => ({ code, nom: nomDeLangue(code) }))
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

const champDeLangue = ({ nom, libelle, valeur }: { readonly nom: string; readonly libelle: string; readonly valeur: string | null }): string =>
  '<p class="champ">' +
  `<label for="c-${nom}">${echappe(libelle)}</label>` +
  `<select id="c-${nom}" name="${nom}">` +
  `<option value=""${valeur === null ? ' selected' : ''}>${echappe(REGLAGES.profil.aucune)}</option>` +
  OPTIONS_DE_LANGUE.map(
    ({ code, nom: dit }) =>
      `<option value="${echappe(code)}"${code === valeur ? ' selected' : ''}>${echappe(dit)}</option>`,
  ).join('') +
  '</select></p>';

export type AvisDeLEdition = 'enregistre' | 'refuse' | null;

/**
 * LE FORMULAIRE REPOSE CE QUE LE LECTEUR A TAPÉ, même après un refus : la porte
 * lui rend ses valeurs soumises plutôt que celles du serveur. Perdre une bio de
 * cinq lignes parce qu'un champ voisin a déplu est le défaut le plus cher d'un
 * formulaire, et il ne se voit qu'en refus — c'est-à-dire au pire moment.
 */
export const documentDeLEdition = ({
  valeurs,
  avis: lequel,
  motif = null,
}: {
  readonly valeurs: Lecteur;
  readonly avis: AvisDeLEdition;
  /** Le refus de la passerelle, rendu TEL QUEL — jamais recomposé ici. */
  readonly motif?: string | null;
}): string =>
  page({
    titre: REGLAGES.edition.titre,
    description: REGLAGES.edition.titre,
    corps:
      enTete({
        titre: REGLAGES.edition.titre,
        sous: REGLAGES.profil.titre,
        retour: CHEMIN.profil,
        libelleDuRetour: REGLAGES.profil.titre,
      }) +
      (lequel === 'refuse'
        ? `<p class="alerte" role="alert">${echappe(motif === null || motif === '' ? REGLAGES.edition.refuse : `${REGLAGES.edition.refuse} ${motif}`)}</p>`
        : avis(lequel === 'enregistre' ? REGLAGES.edition.enregistre : null)) +
      '<form method="post">' +
      section({
        titre: REGLAGES.profil.identite,
        corps:
          champTexte({ nom: CHAMPS_DU_PROFIL.nomAffiche, libelle: REGLAGES.profil.nomAffiche, valeur: valeurs.nomAffiche }) +
          champTexte({ nom: CHAMPS_DU_PROFIL.prenom, libelle: REGLAGES.profil.prenom, valeur: valeurs.prenom }) +
          champTexte({ nom: CHAMPS_DU_PROFIL.nom, libelle: REGLAGES.profil.nom, valeur: valeurs.nom }) +
          '<p class="champ">' +
          `<label for="c-bio">${echappe(REGLAGES.profil.bio)}</label>` +
          `<textarea id="c-bio" name="${CHAMPS_DU_PROFIL.bio}" maxlength="${REGLAGES.edition.bioMax}" rows="3">${echappe(valeurs.bio ?? '')}</textarea>` +
          `<span class="aide">${echappe(REGLAGES.profil.bioAide)}</span>` +
          '</p>',
      }) +
      section({
        titre: REGLAGES.profil.langues,
        phrase: REGLAGES.profil.languesPhrase,
        corps: LANGUES_DU_LECTEUR.map(({ cle, libelle }) =>
          champDeLangue({ nom: cle, libelle, valeur: valeurs[cle] }),
        ).join(''),
      }) +
      `<p><button type="submit" class="action primaire">${echappe(REGLAGES.edition.enregistrer)}</button></p>` +
      '</form>',
  });

// ─── /settings/application — le thème ───────────────────────────────────────

export const CHAMP_DU_THEME = 'theme';
export const THEMES = ['clair', 'sombre', 'systeme'] as const;
export type ChoixDeTheme = (typeof THEMES)[number];

const LIBELLE_DU_THEME: Readonly<Record<ChoixDeTheme, string>> = {
  clair: REGLAGES.application.clair,
  sombre: REGLAGES.application.sombre,
  systeme: REGLAGES.application.systeme,
};

/**
 * TROIS RADIOS ET UN BOUTON, pas trois boutons : un seul choix vaut à la fois,
 * et c'est exactement ce qu'un groupe de radios annonce au clavier et au
 * lecteur d'écran. Le `<fieldset>` porte le nom du groupe — sans lui, un
 * lecteur d'écran lit « Clair » sans jamais dire de quoi.
 *
 * LE CHOIX COURANT VIENT DU COOKIE, pas de la classe rendue : le serveur ne
 * connaît pas la préférence système du lecteur, et cocher « Sombre » au motif
 * que le document est sombre annoncerait un choix explicite que personne n'a
 * fait.
 */
export const documentDeLApplication = ({
  theme,
  applique = false,
}: {
  readonly theme: ChoixDeTheme;
  readonly applique?: boolean;
}): string =>
  page({
    titre: REGLAGES.application.titre,
    description: REGLAGES.carrefour.application.phrase,
    corps:
      enTete({
        titre: REGLAGES.application.titre,
        sous: REGLAGES.titre,
        retour: CHEMIN.carrefour,
        libelleDuRetour: REGLAGES.auxReglages,
      }) +
      avis(applique ? REGLAGES.application.applique : null) +
      section({
        titre: REGLAGES.application.apparence,
        phrase: REGLAGES.application.themeLocal,
        corps:
          '<form method="post">' +
          '<fieldset class="choix">' +
          `<legend>${echappe(REGLAGES.application.theme)}</legend>` +
          THEMES.map(
            (lequel) =>
              `<label><input type="radio" name="${CHAMP_DU_THEME}" value="${lequel}"${lequel === theme ? ' checked' : ''}>` +
              `${echappe(LIBELLE_DU_THEME[lequel])}</label>`,
          ).join('') +
          '</fieldset>' +
          `<p><button type="submit" class="action primaire">${echappe(REGLAGES.edition.enregistrer)}</button></p>` +
          '</form>' +
          rangs(
            rangeeDite({ quoi: REGLAGES.application.langue, valeur: nomDeLangue('fr'), sous: REGLAGES.application.langueUnique }),
            REGLAGES.application.apparence,
          ),
      }),
  });

// ─── /settings/security — le mot de passe et les appareils ──────────────────

export const CHAMP_DE_L_APPAREIL = 'appareil';

export type AvisDeLaSecurite = 'retire' | 'refuse' | null;

/**
 * « RETIRER » EST UN FORMULAIRE, pas un lien : il DÉTRUIT quelque chose, et un
 * lien se pré-charge, se visite par un robot d'aperçu et se rejoue au retour
 * arrière. L'identifiant voyage en champ caché plutôt que dans l'URL — un jeton
 * de push n'a rien à faire dans l'historique ni dans le journal d'un
 * intermédiaire.
 */
const ligneDAppareil = (appareil: Appareil, maintenant: number): string => {
  const instant = quand(appareil.vuA, maintenant);
  const sous = [appareil.plateforme, instant === '' ? '' : REGLAGES.securite.vuLe(instant)]
    .filter((morceau): morceau is string => morceau !== null && morceau !== '')
    .join(' · ');

  return (
    '<li><div class="rangee">' +
    svgDuSprite('ph-phone') +
    '<span class="dit">' +
    `<span class="quoi">${echappe(appareil.nom)}</span>` +
    (sous === '' ? '' : `<span class="sous">${echappe(sous)}</span>`) +
    '</span>' +
    '<form method="post">' +
    `<input type="hidden" name="${CHAMP_DE_L_APPAREIL}" value="${echappe(appareil.id)}">` +
    `<button type="submit" class="retirer" aria-label="${echappe(`${REGLAGES.securite.retirer} — ${appareil.nom}`)}">${echappe(REGLAGES.securite.retirer)}</button>` +
    '</form>' +
    '</div></li>'
  );
};

export const documentDeLaSecurite = ({
  appareils,
  maintenant,
  avis: lequel,
}: {
  readonly appareils: readonly Appareil[];
  readonly maintenant: number;
  readonly avis: AvisDeLaSecurite;
}): string =>
  page({
    titre: REGLAGES.securite.titre,
    description: REGLAGES.carrefour.securite.phrase,
    corps:
      enTete({
        titre: REGLAGES.securite.titre,
        sous: REGLAGES.titre,
        retour: CHEMIN.carrefour,
        libelleDuRetour: REGLAGES.auxReglages,
      }) +
      avis(
        lequel === null ? null : lequel === 'retire' ? REGLAGES.securite.retire : REGLAGES.securite.refuse,
        lequel === 'refuse',
      ) +
      section({
        titre: REGLAGES.securite.acces,
        corps: rangs(rangeeLien({ href: CHEMIN.motDePasse, quoi: REGLAGES.securite.motDePasse }), REGLAGES.securite.acces),
      }) +
      section({
        titre: REGLAGES.securite.appareils,
        phrase: REGLAGES.securite.appareilsPhrase,
        corps:
          appareils.length === 0
            ? carteVide({
                glyphe: 'ph-phone',
                titre: REGLAGES.securite.aucunAppareil,
                phrase: REGLAGES.securite.aucunAppareilPrecision,
              })
            : rangs(appareils.map((appareil) => ligneDAppareil(appareil, maintenant)).join(''), REGLAGES.securite.appareils),
      }),
  });

// ─── /settings/security/password ────────────────────────────────────────────

export const CHAMPS_DU_MOT_DE_PASSE = { actuel: 'actuel', nouveau: 'nouveau' } as const;

export type AvisDuMotDePasse = 'change' | 'refuse' | 'vide' | null;

/**
 * LES DEUX CHAMPS NE SONT JAMAIS REPOSÉS. C'est la seule exception à la règle
 * du formulaire qui garde sa saisie, et elle est délibérée : un mot de passe
 * réémis dans le HTML se retrouve dans le cache du navigateur, dans le rendu
 * d'un lecteur d'écran et dans toute copie de la page. La règle de la saisie
 * gardée protège d'un agacement ; celle-ci protège d'une fuite.
 *
 * `autocomplete` nomme les deux rôles que les gestionnaires de mots de passe
 * attendent : sans eux, un gestionnaire propose l'ancien mot de passe dans le
 * champ du nouveau, ou n'enregistre jamais le changement.
 */
export const documentDuMotDePasse = ({
  avis: lequel,
  motif = null,
}: {
  readonly avis: AvisDuMotDePasse;
  readonly motif?: string | null;
}): string => {
  const refuse =
    lequel === 'vide'
      ? REGLAGES.motDePasse.vide
      : lequel === 'refuse'
        ? motif === null || motif === ''
          ? REGLAGES.motDePasse.refuse
          : `${REGLAGES.motDePasse.refuse} ${motif}`
        : null;

  return page({
    titre: REGLAGES.motDePasse.titre,
    description: REGLAGES.motDePasse.titre,
    corps:
      enTete({
        titre: REGLAGES.motDePasse.titre,
        sous: REGLAGES.securite.titre,
        retour: CHEMIN.securite,
        libelleDuRetour: REGLAGES.securite.titre,
      }) +
      (refuse === null ? avis(lequel === 'change' ? REGLAGES.motDePasse.change : null) : `<p class="alerte" role="alert">${echappe(refuse)}</p>`) +
      '<form method="post">' +
      section({
        titre: REGLAGES.securite.acces,
        corps:
          '<p class="champ">' +
          `<label for="c-actuel">${echappe(REGLAGES.motDePasse.actuel)}</label>` +
          `<input id="c-actuel" name="${CHAMPS_DU_MOT_DE_PASSE.actuel}" type="password" autocomplete="current-password" required>` +
          '</p>' +
          '<p class="champ">' +
          `<label for="c-nouveau">${echappe(REGLAGES.motDePasse.nouveau)}</label>` +
          `<input id="c-nouveau" name="${CHAMPS_DU_MOT_DE_PASSE.nouveau}" type="password" autocomplete="new-password" minlength="${REGLAGES.motDePasse.minimum}" required aria-describedby="regle-mdp">` +
          `<span class="aide" id="regle-mdp">${echappe(REGLAGES.motDePasse.regle)}</span>` +
          '</p>',
      }) +
      `<p><button type="submit" class="action primaire">${echappe(REGLAGES.motDePasse.changer)}</button></p>` +
      '</form>',
  });
};
